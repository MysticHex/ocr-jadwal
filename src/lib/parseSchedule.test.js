// Fixture `__fixtures__/jadwal-sirama.txt` adalah teks OCR nyata dari screenshot
// jadwal SIRAMA (1920px, di-upscale 2x, PSM AUTO) — persis jalur yang dipakai app.
// Tidak berisi data pribadi.
//
// Jalankan: node --test src/lib/parseSchedule.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { parseSchedule, parseScheduleColumns } from './parseSchedule.js'

const OCR_TEXT = fs.readFileSync(new URL('./__fixtures__/jadwal-sirama.txt', import.meta.url), 'utf8')

test('membaca 7 mata kuliah dari screenshot jadwal SIRAMA', () => {
  const rows = parseSchedule(OCR_TEXT)
  assert.deepEqual(
    rows.map((r) => r.code).sort(),
    ['BBK3MBB3', 'BBK4AAB2', 'BBK4BAB3', 'BBK4GBB3', 'BZK4AAC4', 'UAKXACB2', 'UCKXBDB2'],
  )
})

test('menggabungkan sesi berurutan jadi satu rentang jam', () => {
  const bigData = parseSchedule(OCR_TEXT).find((r) => r.code === 'BBK4GBB3')
  assert.equal(bigData.name, 'PENGELOLAAN BIG DATA')
  assert.equal(bigData.start, '10:30')
  assert.equal(bigData.end, '13:30')
  assert.equal(bigData.sessions, 3)
})

test('chrome browser dan baris shift tidak jadi blok', () => {
  const rows = parseSchedule(OCR_TEXT)
  assert.ok(rows.every((r) => r.code !== '(tanpa kode)'))
})

test('jam tanpa titik dua tetap terbaca (screenshot resolusi rendah)', () => {
  const rows = parseSchedule('BBK4GBB3\nPENGELOLAAN BIG DATA\n1030- 11:30 WIB.\n')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].start, '10:30')
  assert.equal(rows[0].end, '11:30')
})

test('angka panjang bukan jam, kata sidebar bukan kode', () => {
  assert.deepEqual(parseSchedule('102022300083\nSTATUS\nBERANDA\nCERAH\n'), [])
})

// --- kolom hari dari bbox kata ------------------------------------------------
// Fixture kata dari pass PSM SINGLE_BLOCK atas screenshot yang sama; tiga kata
// sidebar berisi identitas diganti "REDACTED".
const load = (name) =>
  JSON.parse(fs.readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8'))

// Dua pass OCR atas screenshot yang sama, beda cara upscale: `jadwal-words.json`
// di-upscale di luar browser, `-browser` lewat canvas seperti aplikasi. Hasil
// parse-nya harus identik.
const WORD_SETS = [
  ['upscale eksternal', load('jadwal-words.json')],
  ['upscale canvas browser', load('jadwal-words-browser.json')],
]
const WORDS = WORD_SETS[0][1]

const EXPECTED = [
  'BBK4AAB2 KAMIS 07:30-09:30 x2',
  "BBK3MBB3 JUM'AT 07:30-10:30 x3",
  'BBK4GBB3 SENIN 10:30-13:30 x3',
  'BBK4BAB3 KAMIS 13:30-16:30 x3',
  'UCKXBDB2 SENIN 14:30-16:30 x2',
  'BZK4AAC4 SELASA 14:30-18:30 x4',
  'UAKXACB2 KAMIS 16:30-18:30 x2',
]

for (const [label, words] of WORD_SETS) {
  test(`kolom hari dan jam benar untuk ketujuh mata kuliah (${label})`, () => {
    const rows = parseScheduleColumns(words)
    assert.deepEqual(rows.map((r) => `${r.code} ${r.day} ${r.start}-${r.end} x${r.sessions}`), EXPECTED)
  })
}

test('sidebar dan kolom SHIFT tidak ikut jadi mata kuliah', () => {
  const rows = parseScheduleColumns(WORDS)
  assert.ok(rows.every((r) => r.code !== '(tanpa kode)' && r.day))
})

test('tanpa header hari kembalikan kosong supaya pemanggil fallback', () => {
  const noHeaders = WORDS.filter((w) => !/^(SENIN|SELASA|RABU|KAMIS|JUM'AT|SABTU|MINGGU)$/.test(w.text))
  assert.deepEqual(parseScheduleColumns(noHeaders), [])
})

// --- korpus Dataset ------------------------------------------------------------
// Dua bentuk screenshot yang paling berbeda dari gambar acuan: crop tabel dengan
// sel berwarna (butuh binarisasi Otsu, tanpa itu nol mata kuliah terbaca) dan
// screenshot HP portrait yang nama mata kuliahnya wrap beberapa baris.
// Identitas pada fixture HP sudah diganti "REDACTED".

test('crop tabel desktop: tujuh mata kuliah, hari dan jam benar', () => {
  const rows = parseScheduleColumns(load('jadwal-words-crop.json'))
  assert.deepEqual(
    rows.map((r) => `${r.code} ${r.day} ${r.start}-${r.end} x${r.sessions}`),
    [
      'BBK3DAB3 SELASA 07:30-10:30 x3',
      'BBK3BAB3 KAMIS 07:30-10:30 x3',
      'UCKXADB2 SENIN 08:30-10:30 x2',
      'BBK3AAB3 RABU 09:30-12:30 x3',
      'BBK3FAB3 SELASA 12:30-15:30 x3',
      'BBK3CAB3 KAMIS 13:30-16:30 x3',
      'BBK3EAB3 SENIN 13:30-16:30 x3',
    ],
  )
})

test('screenshot HP: tujuh mata kuliah, hari dan jam benar', () => {
  const rows = parseScheduleColumns(load('jadwal-words-mobile.json'))
  assert.deepEqual(
    rows.map((r) => `${r.code} ${r.day} ${r.start}-${r.end} x${r.sessions}`),
    [
      'BBK3BAB3 SELASA 06:30-09:30 x3',
      'BBK3EAB3 RABU 06:30-09:30 x3',
      'BBK3FAB3 SABTU 07:30-10:30 x3',
      'BBK3AAB3 SABTU 11:30-14:30 x3',
      'UCKXADB2 KAMIS 12:30-14:30 x2',
      'BBK3DAB3 SENIN 14:30-17:30 x3',
      'BBK3CAB3 SABTU 15:30-18:30 x3',
    ],
  )
})

test('semua nama mata kuliah pada screenshot HP terbaca utuh', () => {
  const rows = parseScheduleColumns(load('jadwal-words-mobile.json'))
  assert.deepEqual(
    rows.map((r) => `${r.name} / ${r.nameEn}`),
    [
      'DATA WAREHOUSE DAN BUSINESS INTELLIGENCE / DATA WAREHOUSE AND BUSINESS INTELLIGENCE',
      'PROYEK PERANGKAT LUNAK / SOFTWARE PROJECT',
      'SISTEM INFORMASI AKUNTANSI / ACCOUNTING INFORMATION SYSTEMS',
      'ARSITEKTUR ENTERPRISE / ENTERPRISE ARCHITECTURE',
      'BAHASA INGGRIS / ENGLISH',
      'MANAJEMEN DATA ENTERPRISE / ENTERPRISE DATA MANAGEMENT',
      'KOMPUTASI AWAN / CLOUD COMPUTING',
    ],
  )
})

test('bbox satu kata yang melar tidak membalik urutan kata sebarisnya', () => {
  // "MANAJEMEN" pada fixture HP punya tinggi 52px di tengah baris 22px. Tanpa
  // pembatasan tinggi, titik tengahnya melompat dan kata itu pindah baris.
  const words = load('jadwal-words-mobile.json')
  const swollen = words.find((w) => w.text === 'MANAJEMEN' && w.y1 - w.y0 > 40)
  assert.ok(swollen, 'fixture harus memuat bbox melar yang jadi alasan pembatasan itu')
  const row = parseScheduleColumns(words).find((r) => r.code === 'BBK3DAB3')
  assert.equal(row.name, 'MANAJEMEN DATA ENTERPRISE')
})

test('nama dua baris pada gambar desktop tidak ikut digabung', () => {
  const rows = parseScheduleColumns(load('jadwal-words-browser.json'))
  const bd = rows.find((r) => r.code === 'BBK4GBB3')
  assert.equal(bd.name, 'PENGELOLAAN BIG DATA')
  assert.equal(bd.nameEn, 'BIG DATA MANAGEMENT')
})

test('kode yang salah baca di satu sesi digabung, huruf tertukar maupun tersisip', () => {
  const words = load('jadwal-words-crop.json')
  const rows = parseScheduleColumns(words)
  const typo = JSON.parse(JSON.stringify(words))
  // rusak satu kemunculan kode: satu huruf tertukar, satu karakter tersisip
  let swapped = 0
  let inserted = 0
  for (const w of typo) {
    if (w.text === 'BBK3EAB3' && swapped++ === 0) w.text = 'BBK3EAB8'
    if (w.text === 'BBK3CAB3' && inserted++ === 0) w.text = 'BBK3CAAB3'
  }
  assert.equal(parseScheduleColumns(typo).length, rows.length, 'jumlah baris tidak boleh bertambah')
})

// Screenshot HP yang sama, tapi kata-katanya dari gambar hasil upscale canvas
// browser — persis jalur aplikasi. Sel yang di sini gagal berbeda dari yang
// gagal pada upscale di luar browser, jadi keduanya perlu ikut diuji.
test('screenshot HP lewat upscale browser: hari, jam, dan nama tetap benar', () => {
  const rows = parseScheduleColumns(load('jadwal-words-mobile-browser.json'))
  assert.deepEqual(
    rows.map((r) => `${r.code} ${r.day} ${r.start}-${r.end}`),
    [
      'BBK3BAB3 SELASA 06:30-09:30',
      'BBK3EAB3 RABU 06:30-09:30',
      'BBK3FAB3 SABTU 07:30-10:30',
      'BBK3AAB3 SABTU 12:30-14:30',
      'UCKXADB2 KAMIS 12:30-14:30',
      'BBK3DAB3 SENIN 14:30-17:30',
      'BBK3CAB3 SABTU 15:30-18:30',
    ],
  )
  // Nama yang wrap tidak boleh terpotong separuh lagi.
  assert.equal(
    rows.find((r) => r.code === 'BBK3BAB3').name,
    'DATA WAREHOUSE DAN BUSINESS INTELLIGENCE',
  )
  assert.equal(rows.find((r) => r.code === 'UCKXADB2').name, 'BAHASA INGGRIS')
  assert.equal(rows.find((r) => r.code === 'BBK3EAB3').name, 'PROYEK PERANGKAT LUNAK')
})
