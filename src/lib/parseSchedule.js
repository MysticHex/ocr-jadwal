// Parser hasil OCR jadwal kuliah (format SIRAMA Telkom University).
//
// Dua jalur:
//   1. parseScheduleFromWords() - pakai bounding box tiap kata, jadi kolom hari
//      (SENIN..MINGGU) bisa dipisah dengan benar. Ini jalur utama.
//   2. parseSchedule() - fallback dari teks polos kalau bbox tidak tersedia
//      atau baris header hari tidak terbaca.
//
// Satu sel jadwal berbentuk:
//   BBK4GBB3
//   PENGELOLAAN BIG DATA
//   BIG DATA MANAGEMENT
//   10:30 - 11:30 WIB

const CODE_RE = /^[A-Z]{2,4}[A-Z0-9]{3,8}$/
const TIME_RE = /(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})/
const DAYS = ['SENIN', 'SELASA', 'RABU', 'KAMIS', "JUM'AT", 'SABTU', 'MINGGU']
const NOISE_RE = /^(SHIFT|WIB|WITA|WIT|JADWAL MATA KULIAH SEMESTER|MENU)$/

const norm = (s) =>
  s
    .replace(/[|]/g, 'I')
    .replace(/[‘’“”`'"^~*_]+/g, (m, i) => (i === 0 ? '' : m))
    .replace(/\s+/g, ' ')
    .trim()

function headerKey(s) {
  const k = norm(s).toUpperCase().replace(/[^A-Z']/g, '')
  return k === 'JUMAT' ? "JUM'AT" : k
}

const toMinutes = (h, m) => Number(h) * 60 + Number(m)
const pad = (n) => String(n).padStart(2, '0')
const fromMinutes = (t) => `${pad(Math.floor(t / 60))}:${pad(t % 60)}`

// Baris teks satu kolom -> daftar blok { code, titles, day, start, end }.
function blocksFromLines(lines, fixedDay = '') {
  const blocks = []
  let current = null
  let day = fixedDay

  for (const raw of lines) {
    const line = norm(raw)
    if (!line) continue
    const upper = line.toUpperCase()
    if (NOISE_RE.test(upper)) continue

    if (DAYS.includes(headerKey(line))) {
      if (!fixedDay) day = headerKey(line)
      continue
    }

    if (CODE_RE.test(upper) && !TIME_RE.test(line)) {
      if (current) blocks.push(current)
      current = { code: upper, titles: [], day, start: null, end: null }
      continue
    }

    const time = line.match(TIME_RE)
    if (time) {
      if (!current) current = { code: '', titles: [], day, start: null, end: null }
      current.start = toMinutes(time[1], time[2])
      current.end = toMinutes(time[3], time[4])
      blocks.push(current)
      current = null
      continue
    }

    if (current && /[A-Za-z]{3}/.test(line)) current.titles.push(line)
  }

  if (current) blocks.push(current)
  // Blok tanpa jam dan tanpa nama biasanya sisa noise OCR, bukan mata kuliah.
  return blocks.filter((b) => b.start != null || b.titles.length)
}

// Gabung blok dengan kode + hari sama jadi satu mata kuliah.
function mergeBlocks(blocks) {
  const byKey = new Map()

  for (const block of blocks) {
    const key = `${block.code}|${block.day}`
    const name = block.titles[0] || ''
    const nameEn = block.titles[1] || ''
    const existing = byKey.get(key)

    if (!existing) {
      byKey.set(key, {
        code: block.code || '(tanpa kode)',
        name,
        nameEn,
        day: block.day,
        start: block.start,
        end: block.end,
        sessions: 1,
      })
      continue
    }

    existing.sessions += 1
    if (!existing.name && name) existing.name = name
    if (!existing.nameEn && nameEn) existing.nameEn = nameEn
    if (block.start != null && (existing.start == null || block.start < existing.start)) {
      existing.start = block.start
    }
    if (block.end != null && (existing.end == null || block.end > existing.end)) {
      existing.end = block.end
    }
  }

  return [...byKey.values()]
    .sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || (a.start ?? 0) - (b.start ?? 0))
    .map((c) => ({
      ...c,
      start: c.start == null ? '' : fromMinutes(c.start),
      end: c.end == null ? '' : fromMinutes(c.end),
    }))
}

/**
 * Pecah kata-kata hasil OCR jadi kolom per hari, lalu parse tiap kolom.
 * @param {Array<{text:string,bbox:{x0:number,y0:number,x1:number,y1:number}}>} words
 * @returns {Array|null} null kalau header hari tidak ketemu (pakai fallback teks)
 */
export function parseScheduleFromWords(words) {
  const clean = (words ?? []).filter((w) => norm(w.text).length && w.bbox)
  if (!clean.length) return null

  // Kolom ditentukan dari posisi header hari; SHIFT dipakai sebagai batas kiri.
  const headers = []
  for (const w of clean) {
    const key = headerKey(w.text)
    if ((DAYS.includes(key) || key === 'SHIFT') && !headers.some((h) => h.key === key)) {
      headers.push({ key, cx: (w.bbox.x0 + w.bbox.x1) / 2 })
    }
  }
  if (headers.filter((h) => h.key !== 'SHIFT').length < 2) return null

  headers.sort((a, b) => a.cx - b.cx)
  const bounds = headers.map((h, i) =>
    i === headers.length - 1 ? Infinity : (h.cx + headers[i + 1].cx) / 2
  )
  const colOf = (cx) => bounds.findIndex((b) => cx < b)

  const heights = clean.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b)
  const medH = heights[Math.floor(heights.length / 2)] || 12

  // Kelompokkan kata jadi baris berdasarkan posisi vertikal.
  const rows = []
  for (const w of [...clean].sort((a, b) => a.bbox.y0 + a.bbox.y1 - (b.bbox.y0 + b.bbox.y1))) {
    const cy = (w.bbox.y0 + w.bbox.y1) / 2
    const last = rows[rows.length - 1]
    if (last && Math.abs(cy - last.cy) < medH * 0.7) {
      last.words.push(w)
      last.cy = (last.cy * (last.words.length - 1) + cy) / last.words.length
    } else {
      rows.push({ cy, words: [w] })
    }
  }

  // Dalam satu baris, kata yang berdekatan digabung jadi satu "run" (isi satu sel),
  // supaya teks panjang yang melewati batas kolom tidak bocor ke kolom sebelah.
  const streams = headers.map(() => [])
  for (const row of rows) {
    const sorted = [...row.words].sort((a, b) => a.bbox.x0 - b.bbox.x0)
    const runs = []
    for (const w of sorted) {
      const last = runs[runs.length - 1]
      if (last && w.bbox.x0 - last.x1 < medH * 2.5) {
        last.words.push(w)
        last.x1 = Math.max(last.x1, w.bbox.x1)
      } else {
        runs.push({ x0: w.bbox.x0, x1: w.bbox.x1, words: [w] })
      }
    }
    for (const run of runs) {
      const col = colOf((run.x0 + run.x1) / 2)
      if (col < 0) continue
      streams[col].push(run.words.map((w) => norm(w.text)).join(' '))
    }
  }

  const blocks = []
  headers.forEach((h, i) => {
    if (h.key === 'SHIFT') return
    blocks.push(...blocksFromLines(streams[i], h.key))
  })

  const courses = mergeBlocks(blocks)
  return courses.length ? courses : null
}

/**
 * Fallback: parse teks polos hasil OCR (kolom hari sering tidak akurat).
 * @param {string} text
 */
export function parseSchedule(text) {
  return mergeBlocks(blocksFromLines(String(text ?? '').split('\n')))
}

/**
 * Jalur utama: coba pakai bbox, fallback ke teks.
 * @param {{text:string, words?:Array}} result
 */
export function parseOcrResult({ text, words }) {
  return parseScheduleFromWords(words) ?? parseSchedule(text)
}

export const __internal = { blocksFromLines, mergeBlocks, fromMinutes }
