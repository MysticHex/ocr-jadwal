// Parser teks hasil OCR jadwal kuliah (format SIRAMA Telkom University).
//
// Blok tiap sel jadwal biasanya berbentuk:
//   BBK4GBB3
//   PENGELOLAAN BIG DATA
//   BIG DATA MANAGEMENT
//   10:30 - 11:30 WIB

const CODE_RE = /^[A-Z]{2,4}[A-Z0-9]{3,8}$/
const TIME_RE = /(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})/
const DAY_RE = /^(SENIN|SELASA|RABU|KAMIS|JUM'?AT|JUMAT|SABTU|MINGGU)$/

const NOISE_RE = /^(SHIFT|WIB|WITA|WIT|JADWAL MATA KULIAH SEMESTER|MENU)$/

// OCR sering keliru: 0<->O, 1<->I/l, 5<->S pada kode mata kuliah.
function cleanLine(raw) {
  return raw
    .replace(/[|]/g, 'I')
    .replace(/\s+/g, ' ')
    .trim()
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
    if (time) {
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
