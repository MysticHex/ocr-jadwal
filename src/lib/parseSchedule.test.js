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
