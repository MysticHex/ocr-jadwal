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

function levenshtein(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i]
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = row
  }
  return prev[b.length]
}

/**
 * Satu mata kuliah muncul di beberapa sesi, dan tiap sesi dibaca ulang oleh
 * OCR. Salah baca biasanya cuma kena satu sesi ("MANAJEMEN" jadi "MANGJEMEN"),
 * jadi bacaan terbanyak dipakai.
 *
 * Kalau semua bacaan berbeda, yang paling berbentuk nama mata kuliah menang:
 * nama di SIRAMA selalu huruf kapital, jadi sisa huruf kecil menandakan OCR
 * gagal ("ari Lr DATA ENTERPRISE" kalah dari "MANAJEMEN DATA ENTERPRISE").
 * Jarak edit total jadi penentu terakhir.
 */
function shapeScore(text) {
  const upper = text.replace(/[^A-Z0-9 ]/g, '').length
  return text.length ? upper / text.length : 0
}

function consensus(candidates) {
  const options = candidates.filter(Boolean)
  if (options.length <= 1) return options[0] || ''

  const count = new Map()
  for (const option of options) count.set(option, (count.get(option) || 0) + 1)

  // Diurutkan: suara terbanyak, lalu paling berbentuk nama, lalu paling dekat
  // ke bacaan lain.
  const ranked = [...count].map(([option, votes]) => ({
    option,
    votes,
    shape: shapeScore(option),
    distance: options.reduce((sum, other) => sum + levenshtein(option, other), 0),
  }))
  ranked.sort((a, b) => b.votes - a.votes || b.shape - a.shape || a.distance - b.distance)
  return ranked[0].option
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
        names: [name],
        namesEn: [nameEn],
        day: block.day,
        start: block.start,
        end: block.end,
        sessions: 1,
      })
      continue
    }

    existing.sessions += 1
    existing.names.push(name)
    existing.namesEn.push(nameEn)
    if (block.start != null && (existing.start == null || block.start < existing.start)) {
      existing.start = block.start
    }
    if (block.end != null && (existing.end == null || block.end > existing.end)) {
      existing.end = block.end
    }
  }

  return [...byKey.values()]
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0))
    .map(({ names, namesEn, ...c }) => ({
      ...c,
      name: consensus(names),
      nameEn: consensus(namesEn),
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
    // Tinggi dibatasi sebelum menghitung titik tengah: sesekali OCR memberi satu
    // kata bbox yang jauh terlalu tinggi (pernah 52px di tengah baris 22px), dan
    // titik tengahnya ikut melompat sehingga kata itu terlempar ke baris sendiri
    // — urutan kata pada nama mata kuliah jadi terbalik.
    const cy = word.y0 + Math.min(word.y1 - word.y0, lineHeight * 1.5) / 2
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

// Taksiran ukuran font Tesseract untuk satu baris; jatuh ke tinggi bbox kalau
// taksiran itu tidak ada.
function lineSize(words) {
  const sizes = words.map((w) => w.size).filter((s) => s > 0)
  return sizes.length ? median(sizes) : Math.min(...words.map((w) => w.y1 - w.y0))
}

// Seberapa besar ukuran teks berubah antar dua baris. Dua ukuran dipakai
// bersama karena masing-masing punya titik butanya sendiri: tinggi bbox melar
// kalau ada glyph turun atau noise (satu kata pernah terbaca 44px di baris
// 19px), sedangkan taksiran `font_size` Tesseract kadang meleset pada baris
// pendek. Pada korpus uji, tidak ada satu pun yang benar sendirian di semua
// gambar, tapi jumlah perubahan relatif keduanya benar di semuanya.
// Sumbangan tinggi bbox dibatasi: satu kotak yang melar bisa memberi selisih
// >100% dan menutupi sinyal ukuran font yang sebenarnya benar.
function sizeChange(a, b) {
  const bySize = Math.abs(a.size - b.size) / a.size
  const byHeight = Math.abs(a.height - b.height) / a.height
  return bySize + Math.min(byHeight, 0.15)
}

// Pada sel sempit (screenshot HP) satu nama mata kuliah pecah jadi beberapa
// baris, sehingga `extractBlocks` mengira baris kedua adalah nama Inggris.
// Nama Indonesia dan nama Inggris dirender dengan ukuran font berbeda, jadi
// batasnya ada di perubahan ukuran terbesar antar baris.
function unwrapTitles(lines) {
  const out = []
  let run = []

  const flush = () => {
    if (run.length >= 3) {
      // Nama Indonesia selalu di atas nama Inggris, jadi potongannya posisional:
      // batas = perubahan ukuran terbesar antar baris berurutan. Selisihnya
      // diambil mutlak karena arahnya tidak selalu sama — pada taksiran
      // font_size Tesseract, blok Inggris justru terbaca lebih besar.
      //
      // Perubahan harus berarti (>8%). Nama yang wrap tiga baris tanpa nama
      // Inggris sama sekali cuma bergoyang 1 satuan antar barisnya; tanpa syarat
      // ini nama itu ikut terbelah dua.
      let cut = 0
      let widest = 0.16
      for (let i = 1; i < run.length; i += 1) {
        const change = sizeChange(run[i - 1], run[i])
        if (change > widest) {
          widest = change
          cut = i
        }
      }
      if (cut > 0) {
        out.push(
          run.slice(0, cut).map((l) => l.text).join(' '),
          run.slice(cut).map((l) => l.text).join(' '),
        )
        run = []
        return
      }
    }
    for (const line of run) out.push(line.text)
    run = []
  }

  for (const line of lines) {
    if (CODE_RE.test(line.text.toUpperCase()) || TIME_RE.test(line.text)) {
      flush()
      out.push(line.text)
    } else {
      run.push(line)
    }
  }
  flush()
  return out
}

// OCR sesekali salah membaca kode di salah satu sesi, sehingga satu mata kuliah
// pecah jadi dua baris. Bentuknya bisa huruf tertukar ("BZK4AAC4" -> "BZK4AACA")
// atau karakter tersisip ("BBK4GBB3" -> "BBKA4GBB3"), jadi yang dipakai jarak
// edit, bukan sekadar beda posisi.
function withinOneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]

  let i = 0
  let j = 0
  let edits = 0
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i += 1
      j += 1
      continue
    }
    if ((edits += 1) > 1) return false
    if (short.length === long.length) i += 1
    j += 1
  }
  return edits + (long.length - j) === 1
}

function mergeMisreadCodes(courses) {
  const kept = []
  for (const course of courses) {
    const twin = kept.find(
      (k) => k.day === course.day && k.name === course.name && withinOneEdit(k.code, course.code),
    )
    if (!twin) {
      kept.push(course)
      continue
    }
    // Kode yang dipakai diambil dari sesi terbanyak: salah baca biasanya cuma
    // terjadi di satu sesi, sedangkan sisanya membaca kode yang benar.
    if (course.sessions > twin.sessions) twin.code = course.code
    twin.sessions += course.sessions
    if (course.start && (!twin.start || course.start < twin.start)) twin.start = course.start
    if (course.end && (!twin.end || course.end > twin.end)) twin.end = course.end
  }
  return kept
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
    byDay.get(nearest.day).push({
      text: cell.words.map((w) => w.text).join(' '),
      size: lineSize(cell.words),
      // Kata terpendek, bukan median: glyph yang turun di bawah baris ("J" pada
      // PROJECT) membuat bbox kata itu lebih tinggi walau fontnya sama ukuran.
      height: Math.min(...cell.words.map((w) => w.y1 - w.y0)),
    })
  }

  const courses = []
  for (const [day, lines] of byDay) {
    for (const course of parseSchedule(unwrapTitles(lines).join('\n'))) {
      courses.push({ ...course, day })
    }
  }

  return mergeMisreadCodes(courses).sort((a, b) => a.start.localeCompare(b.start))
}

/**
 * Pakai nama yang sudah tersimpan untuk kode mata kuliah yang sama.
 *
 * Anggota satu angkatan mengambil banyak mata kuliah yang sama, dan OCR salah
 * baca di gambar yang berbeda-beda: satu screenshot membaca "MANGJEMEN DATA
 * ENTERPRISE" sementara screenshot lain membaca kode yang sama dengan benar.
 * Nama yang sudah pernah terbaca dipakai ulang, sekaligus membuat penamaan
 * konsisten antar anggota.
 *
 * Hanya menimpa kalau kodenya sama persis dan namanya memang berbeda; kode di
 * SIRAMA sudah unik per mata kuliah, jadi tidak perlu ikut mencocokkan hari.
 *
 * @param {ReturnType<typeof parseScheduleColumns>} courses hasil baca sekarang
 * @param {Array<{courses?: Array<{code:string,name:string,nameEn:string}>}>} people yang sudah tersimpan
 */
export function applyKnownNames(courses, people) {
  const known = new Map()
  for (const person of people || []) {
    for (const course of person.courses || []) {
      if (course.code && course.name && !known.has(course.code)) known.set(course.code, course)
    }
  }
  if (!known.size) return courses

  return courses.map((course) => {
    const seen = known.get(course.code)
    if (!seen || seen.name === course.name) return course
    return { ...course, name: seen.name, nameEn: seen.nameEn || course.nameEn }
  })
}
