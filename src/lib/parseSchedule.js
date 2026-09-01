// Parser teks hasil OCR jadwal kuliah (format SIRAMA Telkom University).
//
// Blok tiap sel jadwal biasanya berbentuk:
//   BBK4GBB3
//   PENGELOLAAN BIG DATA
//   BIG DATA MANAGEMENT
//   10:30 - 11:30 WIB

// Kode mata kuliah selalu mengandung angka (BBK4GBB3, UAKXACB2). Syarat angka ini
// membuang kata sidebar/menu yang panjangnya kebetulan cocok (STATUS, BERANDA, CERAH).
const CODE_RE = /^(?=[A-Z0-9]*\d)[A-Z]{2,4}[A-Z0-9]{3,8}$/
// Titik dua opsional: pada screenshot resolusi rendah OCR sering menghasilkan
// "1030- 11:30" atau "1230- 1330". Tanda hubung tetap wajib supaya angka panjang
// seperti NIM tidak ikut terbaca sebagai rentang jam.
const TIME_RE = /(\d{1,2})[:.]?(\d{2})\s*[-–—~]\s*(\d{1,2})[:.]?(\d{2})/
const DAY_RE = /^(SENIN|SELASA|RABU|KAMIS|JUM'?AT|JUMAT|SABTU|MINGGU)$/

const NOISE_RE = /^(SHIFT|WIB|WITA|WIT|JADWAL MATA KULIAH SEMESTER|MENU)$/

// OCR sering keliru: 0<->O, 1<->I/l, 5<->S pada kode mata kuliah.
// Garis kotak sel sering ikut terbaca sebagai glyph nyasar di ujung baris
// ("BBK4GBB3 -"), yang membuat baris kode gagal cocok dengan CODE_RE.
function cleanLine(raw) {
  return raw
    .replace(/[|]/g, 'I')
    .replace(/\s+/g, ' ')
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '')
    .trim()
}

function isClock(h, m) {
  return Number(h) < 24 && Number(m) < 60
}

function toMinutes(h, m) {
  return Number(h) * 60 + Number(m)
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function fromMinutes(total) {
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

// Satu blok mentah = { code, titles: [], start, end }
function extractBlocks(text) {
  const lines = text
    .split('\n')
    .map(cleanLine)
    .filter((l) => l.length > 0 && !NOISE_RE.test(l.toUpperCase()))

  const blocks = []
  let current = null
  let day = ''

  for (const line of lines) {
    const upper = line.toUpperCase()

    if (DAY_RE.test(upper)) {
      day = upper.replace('JUMAT', "JUM'AT")
      continue
    }

    if (CODE_RE.test(upper) && !TIME_RE.test(line)) {
      if (current) blocks.push(current)
      current = { code: upper, titles: [], day, start: null, end: null }
      continue
    }

    const time = line.match(TIME_RE)
    if (time && isClock(time[1], time[2]) && isClock(time[3], time[4])) {
      if (!current) current = { code: '', titles: [], day, start: null, end: null }
      current.start = toMinutes(time[1], time[2])
      current.end = toMinutes(time[3], time[4])
      blocks.push(current)
      current = null
      continue
    }

    // Baris nama mata kuliah (ID lalu EN).
    if (current && /[A-Za-z]{3}/.test(line)) {
      current.titles.push(line)
    }
  }

  if (current) blocks.push(current)
  return blocks.filter((b) => b.code || b.titles.length)
}

/**
 * Ubah teks OCR jadi daftar mata kuliah unik.
 * Sesi berurutan dengan kode sama digabung jadi satu rentang waktu.
 *
 * @param {string} text teks mentah dari Tesseract
 * @returns {Array<{code:string,name:string,nameEn:string,day:string,start:string,end:string,sessions:number}>}
 */
export function parseSchedule(text) {
  const blocks = extractBlocks(text)
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
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
    .map((c) => ({
      ...c,
      start: c.start == null ? '' : fromMinutes(c.start),
      end: c.end == null ? '' : fromMinutes(c.end),
    }))
}

export const __test = { extractBlocks, fromMinutes }

// --- Kolom hari dari koordinat kata -------------------------------------------
//
// Parsing baris-per-baris tidak bisa memulihkan kolom hari: sebuah baris grid
// memuat sel dari beberapa hari sekaligus. Dengan bbox tiap kata (hasil
// `recognizeGrid`) posisi horizontal sel bisa dicocokkan ke header harinya.

const DAY_WORD_RE = /^(SENIN|SELASA|RABU|KAMIS|JUM'?AT|JUMAT|SABTU|MINGGU)$/

function centerX(box) {
  return (box.x0 + box.x1) / 2
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function findDayHeaders(words) {
  return words
    .map((w) => ({ word: w, day: w.text.toUpperCase().replace(/[^A-Z']/g, '') }))
    .filter(({ day }) => DAY_WORD_RE.test(day))
    .map(({ word, day }) => ({ day: day.replace('JUMAT', "JUM'AT"), cx: centerX(word), y: word.y0 }))
    .sort((a, b) => a.cx - b.cx)
}

// Kata dikelompokkan per baris (y berdekatan), lalu tiap baris dipecah jadi sel
// pada celah horizontal besar — celah antar kolom jauh lebih lebar dari celah
// antar kata di dalam satu sel.
function toCells(words, lineHeight) {
  const rows = []
  for (const word of [...words].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) {
    const cy = (word.y0 + word.y1) / 2
    const row = rows.find((r) => Math.abs(r.y - cy) < lineHeight * 0.6)
    if (row) {
      // Pusat baris di-rata-rata ulang: tanpa ini baris yang kebetulan diawali
      // kata agak tinggi bisa gagal menampung kata berikutnya di baris sama.
      row.y = (row.y * row.words.length + cy) / (row.words.length + 1)
      row.words.push(word)
    } else {
      rows.push({ y: cy, words: [word] })
    }
  }

  const gap = lineHeight * 2.5
  const cells = []
  for (const row of rows) {
    let cell = null
    for (const word of row.words.sort((a, b) => a.x0 - b.x0)) {
      if (cell && word.x0 - cell.x1 <= gap) {
        cell.words.push(word)
        cell.x1 = Math.max(cell.x1, word.x1)
      } else {
        cell = { words: [word], x0: word.x0, x1: word.x1, y: row.y }
        cells.push(cell)
      }
    }
  }
  return cells
}

/**
 * Susun ulang kata jadi teks per kolom hari, lalu parse tiap kolom terpisah.
 * Mengembalikan array kosong kalau header hari tidak ketemu (mis. gambar sudah
 * di-crop) — pemanggil bisa jatuh balik ke `parseSchedule` biasa.
 *
 * @param {Array<{text:string,x0:number,y0:number,x1:number,y1:number}>} words
 * @returns {ReturnType<typeof parseSchedule>}
 */
export function parseScheduleColumns(words) {
  const headers = findDayHeaders(words)
  if (headers.length < 2) return []

  const lineHeight = median(words.map((w) => w.y1 - w.y0)) || 1
  // Buang kolom SHIFT dan sidebar di kiri header hari pertama.
  const leftEdge = headers[0].cx - (headers[1].cx - headers[0].cx) / 2
  const body = words.filter((w) => w.y0 > headers[0].y + lineHeight && centerX(w) > leftEdge)

  const byDay = new Map()
  for (const cell of toCells(body, lineHeight).sort((a, b) => a.y - b.y)) {
    const cx = centerX(cell)
    const nearest = headers.reduce((best, h) => (Math.abs(h.cx - cx) < Math.abs(best.cx - cx) ? h : best))
    if (!byDay.has(nearest.day)) byDay.set(nearest.day, [])
    byDay.get(nearest.day).push(cell.words.map((w) => w.text).join(' '))
  }

  const courses = []
  for (const [day, lines] of byDay)
    for (const course of parseSchedule(lines.join('\n'))) courses.push({ ...course, day })

  return courses.sort((a, b) => a.start.localeCompare(b.start))
}
