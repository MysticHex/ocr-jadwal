// Isi otomatis kolom identitas. Dua sumber, keduanya cuma tebakan yang boleh
// ditimpa user: panel "Data Mahasiswa" di gambar, dan nama file.

// Panel hanya muncul pada tampilan mobile SIRAMA, di atas tabel jadwal:
//   Nama Lengkap    DJAUDZA DJIYYA MUHAMMAD
//   NIM             102022400133
//   Program Studi   S1 Sistem Informasi
//   Kelas           SI-48-10
const NAMA_RE = /^\s*Nama\s+Lengkap\s+(.+?)\s*$/im
const NIM_RE = /^\s*NIM\s+(\d{6,})\s*$/im
// Kelas dicocokkan huruf besar/angka saja supaya kalimat catatan di kaki tabel
// ("...kelas sudah sesuai dengan ketentuan...") tidak ikut tertangkap.
const KELAS_RE = /^\s*Kelas\s+([A-Z0-9][A-Z0-9-]{2,})\s*$/m

/**
 * Baca identitas dari teks OCR.
 * @param {string} text teks mentah hasil OCR
 * @returns {{nama: string, nim: string, kelas: string}} field kosong kalau tidak ketemu
 */
export function parseIdentity(text) {
  const grab = (re) => (text.match(re)?.[1] || '').trim()
  return { nama: grab(NAMA_RE), nim: grab(NIM_RE), kelas: grab(KELAS_RE) }
}

/**
 * Baca nama dan divisi dari nama file berpola `JADWAL KULIAH_ALIF RND.png`:
 * token terakhir jadi divisi, sisanya nama.
 *
 * Sengaja ketat — `Screenshot 2026-09-01 141258.png` atau `IMG_1234.jpg` harus
 * mengembalikan field kosong, bukan tebakan ngawur.
 *
 * @param {string} filename
 * @returns {{nama: string, divisi: string}}
 */
export function identityFromFilename(filename) {
  const empty = { nama: '', divisi: '' }
  const base = (filename || '').replace(/\.[a-z0-9]+$/i, '')
  const underscore = base.lastIndexOf('_')
  if (underscore < 0) return empty

  const tokens = base.slice(underscore + 1).trim().split(/\s+/).filter(Boolean)
  if (tokens.length < 2) return empty
  if (!tokens.every((t) => /[A-Za-z]/.test(t))) return empty

  return { nama: tokens.slice(0, -1).join(' '), divisi: tokens[tokens.length - 1] }
}
