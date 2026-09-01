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
- **Kalender mingguan**: heatmap siapa sibuk jam berapa + insight hari padat & slot rapat
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
    WeekCalendar.jsx       heatmap mingguan + panel insight
  lib/
    ocr.js                 worker tesseract.js (recognizeGrid / recognizeText)
    parseSchedule.js       parser teks OCR → daftar mata kuliah + kolom hari dari bbox
    weekLoad.js            agregasi jadwal semua anggota → grid mingguan + insight
    image.js               upscale sebelum OCR + thumbnail dataURL
```

## Cara parser bekerja

`parseSchedule()` memindai teks OCR baris per baris dan mengenali tiga pola:

- **Kode mata kuliah** — `BBK4GBB3`, `UAKXACB2` (`/^[A-Z]{2,4}[A-Z0-9]{3,8}$/`)
- **Nama mata kuliah** — baris teks setelah kode (baris pertama Indonesia, kedua Inggris)
- **Jam** — `10:30 - 11:30 WIB`

Blok dengan kode dan hari yang sama digabung jadi satu baris: jam mulai paling awal, jam selesai paling akhir,
plus jumlah sesi.

Kolom **hari** ditentukan dari posisi horizontal tiap sel, bukan dari urutan baris —
lihat "Cara kolom hari ditentukan" di bawah. Semua field tetap bisa diedit langsung di
tabel "Hasil baca" sebelum disimpan.

## Tips akurasi OCR

- Pakai screenshot resolusi penuh, jangan foto layar
- Kalau di-crop, **sertakan baris header hari** — tanpa itu kolom hari tidak bisa ditentukan
- Pemuatan model bahasa pertama kali ± 10–20 MB, di-cache browser setelahnya

Sebelum OCR, gambar otomatis di-upscale ke ~3840px (`upscaleForOcr` di `lib/image.js`).
Teks sel jadwal SIRAMA hanya ~9px pada screenshot 1920px; upscale menaikkan confidence
Tesseract dari ~79 ke ~91 dan memperbaiki jam yang terbaca `1030- 11:30`.

## Cara kolom hari ditentukan

Jadwal SIRAMA adalah grid: hari adalah **kolom**, bukan penanda baris. Parsing baris-per-baris
tidak bisa memulihkannya — satu baris grid memuat sel dari beberapa hari sekaligus.

`recognizeGrid` (`lib/ocr.js`) menjalankan Tesseract dengan `PSM.SINGLE_BLOCK` supaya tata
letak dipertahankan dan tiap kata membawa bounding box. `parseScheduleColumns`
(`lib/parseSchedule.js`) lalu:

1. cari kata header hari (`SENIN`..`MINGGU`) → titik tengah tiap kolom
2. buang kolom `SHIFT` dan sidebar di kiri header hari pertama
3. kelompokkan kata jadi baris (y berdekatan), pecah tiap baris jadi sel pada celah
   horizontal besar
4. tiap sel diberikan ke header hari terdekat, lalu teks per kolom diparse terpisah

Kalau header hari tidak ketemu (gambar sudah di-crop), aplikasi otomatis mengulang dengan
`PSM.AUTO` dan memakai parser teks biasa — mata kuliah dan jam tetap terbaca, kolom hari
dikosongkan untuk diisi manual.

Kalau hasilnya kosong, buka panel **Teks mentah OCR** di bawah tombol untuk melihat apa yang
sebenarnya dibaca Tesseract.

## Test

```bash
node --test src/lib/*.test.js
```

`parseSchedule.test.js` memakai fixture OCR nyata di `src/lib/__fixtures__/`.
`weekLoad.test.js` menguji agregasi kalender (irisan jam, hitung orang unik, insight).

## Kalender mingguan

Tab **Kalender Mingguan** menumpuk jadwal semua anggota jadi satu grid: baris = slot 1 jam,
kolom = **SENIN sampai SABTU** (selalu tampil walau harinya kosong, supaya bentuk minggunya
tetap sama antar upload; MINGGU baru ikut kalau memang ada kelas). Angka di kotak = berapa
**anggota unik** sibuk di jam itu (bukan jumlah mata kuliah), warna makin pekat makin padat.
Klik kotak → daftar siapa dan mata kuliah apa.

Panel **Insight** menghitung:

- **hari paling padat / longgar** — diukur dengan *jam-orang* (satu anggota sibuk satu slot = 1),
  bukan sekadar jumlah orang, supaya hari dengan sedikit orang tapi seharian penuh tetap terbaca padat.
  Hari yang sama sekali tidak ada kelas dikeluarkan dari ranking (kalau tidak, Sabtu kosong selalu
  menang jadi "paling longgar"), tapi tetap muncul di tabel beban per hari
- **jam paling bentrok** — slot dengan anggota sibuk terbanyak
- **slot bebas semua** per hari — kandidat jam rapat
- **beban per anggota** — total jam kelas per minggu

Mata kuliah yang kolom hari atau jamnya kosong tidak bisa ditaruh di grid; jumlahnya
ditampilkan sebagai catatan di bawah kalender.
