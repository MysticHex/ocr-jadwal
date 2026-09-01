# OCR Jadwal Kuliah

Web app React yang membaca screenshot jadwal kuliah (contoh: SIRAMA Telkom University) lewat OCR di browser,
lalu menyusunnya jadi tabel mahasiswa. Hover salah satu nama → muncul kartu detail berisi kode mata kuliah,
nama, hari, jam, dan jumlah sesi.

## Fitur

- Upload / drag-drop gambar jadwal (PNG, JPG)
- OCR penuh di sisi klien pakai `tesseract.js` (bahasa `ind+eng`) — tanpa backend, tanpa API key
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

## Cara parser bekerja

`parseSchedule()` memindai teks OCR baris per baris dan mengenali tiga pola:

- **Kode mata kuliah** — `BBK4GBB3`, `UAKXACB2` (`/^[A-Z]{2,4}[A-Z0-9]{3,8}$/`)
- **Nama mata kuliah** — baris teks setelah kode (baris pertama Indonesia, kedua Inggris)
- **Jam** — `10:30 - 11:30 WIB`

Blok dengan kode dan hari yang sama digabung jadi satu baris: jam mulai paling awal, jam selesai paling akhir,
plus jumlah sesi.

Catatan: OCR membaca tabel secara baris-per-baris, jadi kolom **hari** kadang tidak akurat.
Kolom hari (dan field lain) bisa diedit langsung di tabel "Hasil baca" sebelum disimpan.

## Tips akurasi OCR

- Pakai screenshot resolusi penuh, jangan foto layar
- Potong (crop) hanya bagian tabel jadwal
- Pemuatan model bahasa pertama kali ± 10–20 MB, di-cache browser setelahnya
