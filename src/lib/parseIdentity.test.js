// Jalankan: npm test
import test from 'node:test'
import assert from 'node:assert/strict'
import { identityFromFilename, parseIdentity } from './parseIdentity.js'

// Persis bentuk panel "Data Mahasiswa" pada tampilan mobile SIRAMA, termasuk
// baris catatan di kaki tabel yang juga memuat kata "kelas".
const PANEL = `Jadwal Kuliah @ / Registrasi / Jadwal Kuliah
Data Mahasiswa
Nama Lengkap SITI AMINAH PUTRI
NIM 102022400133
Program Studi S1 Sistem Informasi
Kelas SI-48-10
Dosen Wali HLZ
JADWAL MATA KULIAH SEMESTER
1. Warna ( ) menunjukan bahwa kelas sudah sesuai dengan ketentuan.
`

test('membaca nama, NIM, dan kelas dari panel Data Mahasiswa', () => {
  assert.deepEqual(parseIdentity(PANEL), {
    nama: 'SITI AMINAH PUTRI',
    nim: '102022400133',
    kelas: 'SI-48-10',
  })
})

test('kalimat catatan berisi kata "kelas" tidak ikut terbaca', () => {
  const noPanel = '1. Warna ( ) menunjukan bahwa kelas sudah sesuai dengan ketentuan.\n'
  assert.deepEqual(parseIdentity(noPanel), { nama: '', nim: '', kelas: '' })
})

test('gambar tanpa panel mengembalikan field kosong', () => {
  assert.deepEqual(parseIdentity('SHIFT SENIN SELASA\n06:30 WIB\n'), {
    nama: '',
    nim: '',
    kelas: '',
  })
})

test('nama file berpola dipecah jadi nama dan divisi', () => {
  assert.deepEqual(identityFromFilename('JADWAL KULIAH_ALIF RND.png'), {
    nama: 'ALIF',
    divisi: 'RND',
  })
  assert.deepEqual(identityFromFilename('JADWAL KULIAH_SITI AMINAH RND.jpeg'), {
    nama: 'SITI AMINAH',
    divisi: 'RND',
  })
})

test('nama file acak tidak ditebak-tebak', () => {
  for (const name of [
    'Screenshot 2026-09-01 141258.png',
    'IMG_1234.jpg',
    'jadwal.png',
    'WhatsApp Image 2026-08-29 at 00.05.29.jpeg',
  ]) {
    assert.deepEqual(identityFromFilename(name), { nama: '', divisi: '' }, name)
  }
})
