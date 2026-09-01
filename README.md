# OCR Jadwal Kuliah

Web app React yang membaca screenshot jadwal kuliah (contoh: SIRAMA Telkom University) lewat OCR di browser,
lalu menyusunnya jadi tabel mahasiswa. Hover salah satu nama → muncul kartu detail berisi kode mata kuliah,
nama, hari, jam, dan jumlah sesi.

## Fitur

- Upload / drag-drop gambar jadwal (PNG, JPG)
- OCR penuh di sisi klien pakai `tesseract.js` (bahasa `ind+eng`) — tanpa backend, tanpa API key
- Pra-proses gambar (upscale + grayscale + binarisasi Otsu) supaya teks di dalam sel berwarna ikut terbaca
- Kolom hari dipetakan dari posisi bounding box tiap kata, bukan tebakan urutan baris
- Form identitas: **Nama**, **Kelas**, **Divisi**
- Hasil OCR diparse jadi daftar mata kuliah dan bisa dikoreksi manual sebelum disimpan
- Tabel mahasiswa + kartu detail saat hover / klik baris
- Data disimpan di `localStorage`, bisa di-export ke JSON
- Siap deploy ke Vercel (static build)

## Jalankan lokal

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # output ke dist/
npm run preview
```

## Deploy ke Vercel

1. Push repo ini ke GitHub.
2. Di Vercel: **Add New → Project → Import** repo ini.
3. Framework preset terdeteksi **Vite**; build command `npm run build`, output `dist` (sudah diset di `vercel.json`).
4. Deploy. Tidak perlu environment variable.

Atau lewat CLI:

```bash
npx vercel --prod
```

## Struktur

```
src/
  App.jsx                  state utama + localStorage + export JSON
  components/
    ScheduleForm.jsx       upload gambar, form identitas, jalankan OCR, koreksi hasil
    PeopleTable.jsx        tabel nama + kartu detail hover
  lib/
    ocr.js                 worker tesseract.js
    parseSchedule.js       parser teks OCR → daftar mata kuliah
    image.js               thumbnail dataURL untuk localStorage
```

## Pipeline OCR

1. `preprocessForOcr()` — gambar diperbesar (sampai ~2400 px), diubah ke grayscale, lalu dibinarisasi
   dengan ambang **Otsu**. Tanpa langkah ini Tesseract membuang isi sel jadwal (teks hijau tua di atas
   blok hijau muda) dan hasilnya cuma kolom jam.
2. `recognize()` — Tesseract dengan `tessedit_pageseg_mode: '6'` (satu blok seragam) dan
   `preserve_interword_spaces: '1'`, output `{ text, blocks }` supaya tiap kata punya bounding box.
3. `parseScheduleFromWords()` — header `SENIN..MINGGU` dipakai jadi batas kolom; kata dikelompokkan
   jadi baris (posisi y) lalu jadi "run" per sel (jarak x), tiap run masuk ke kolom hari yang benar.
4. `parseSchedule()` — fallback dari teks polos kalau header hari tidak terbaca.

## Cara parser bekerja

Parser memindai teks tiap kolom baris per baris dan mengenali tiga pola:

- **Kode mata kuliah** — `BBK4GBB3`, `UAKXACB2` (`/^[A-Z]{2,4}[A-Z0-9]{3,8}$/`)
- **Nama mata kuliah** — baris teks setelah kode (baris pertama Indonesia, kedua Inggris)
- **Jam** — `10:30 - 11:30 WIB`

Blok dengan kode dan hari yang sama digabung jadi satu baris: jam mulai paling awal, jam selesai paling akhir,
plus jumlah sesi.

Semua field hasil baca bisa diedit langsung di tabel "Hasil baca" sebelum disimpan, dan baris baru
bisa ditambah manual lewat **+ Tambah baris manual**.

## Kalau hasilnya "tidak menemukan pola jadwal"

- Buka panel **Teks mentah OCR** untuk melihat apa yang benar-benar terbaca Tesseract
- Kalau teks mentah cuma berisi kolom jam (`06:30 WIB`, `07:30 WIB`, ...), berarti isi sel berwarna
  tidak terbaca — pakai screenshot resolusi penuh, jangan hasil foto layar atau screenshot yang diperkecil
- Crop gambar hanya ke bagian tabel jadwal (buang sidebar dan toolbar browser)
- Kode mata kuliah harus terbaca utuh (`BBK4GBB3`); kalau OCR menulis `BBKA4GBB3`, perbaiki di tabel

## Tips akurasi OCR

- Pakai screenshot resolusi penuh, jangan foto layar
- Potong (crop) hanya bagian tabel jadwal
- Pemuatan model bahasa pertama kali ± 10–20 MB, di-cache browser setelahnya
