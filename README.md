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

## CI / CD

`.github/workflows/ci.yml` — tiap push dan pull request: `npm ci`, `npm test`, `npm run build`,
lalu cek `dist/index.html` benar-benar ada dan unggah `dist` sebagai artifact (simpan 7 hari).
`npm ci` sengaja dipakai, bukan `npm install`, supaya `package-lock.json` yang basi ketahuan
di CI, bukan pas deploy.

`.github/workflows/deploy.yml` — deploy produksi lewat Vercel CLI. **Mati sendiri kalau secret
`VERCEL_TOKEN` belum diset.** Itu default yang diinginkan: kalau Vercel Git integration sudah
tersambung ke repo ini, Vercel sudah men-deploy tiap push dan job ini cuma bikin deploy dobel.

Aktifkan hanya kalau integrasi Git Vercel tidak dipakai — isi 3 secret di
*Settings → Secrets and variables → Actions*:

| Secret | Isi |
| --- | --- |
| `VERCEL_TOKEN` | buat di vercel.com/account/tokens |
| `VERCEL_ORG_ID` | field `orgId` di `.vercel/project.json` |
| `VERCEL_PROJECT_ID` | field `projectId` di `.vercel/project.json` |

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
    ocr.js                 worker tesseract.js, dua pass + pilih confidence tertinggi
    parseSchedule.js       parser teks OCR → daftar mata kuliah + kolom hari dari bbox
    parseIdentity.js       nama/NIM/kelas dari panel gambar, nama/divisi dari nama file
    weekLoad.js            agregasi jadwal semua anggota → grid mingguan + insight
    image.js               upscale + binarisasi Otsu, thumbnail dataURL
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

Gambar dibaca **dua kali** lalu diambil yang confidence-nya lebih tinggi
(`recognizeBestGrid` di `lib/ocr.js`): sekali dengan warna asli, sekali setelah
grayscale + binarisasi Otsu. Tidak ada satu preprocessing yang menang untuk semua bentuk
screenshot:

| Bentuk gambar | Warna asli | Binarisasi Otsu |
| --- | --- | --- |
| crop tabel, sel hijau | conf 69, **0 mata kuliah** | conf 92, 7 mata kuliah |
| jendela browser penuh | conf 83, 7 mata kuliah | conf 63, hasil kacau |

Chrome dan sidebar yang gelap menarik ambang global ke bawah, jadi binarisasi justru merusak
screenshot jendela penuh. Diukur pada lima gambar, confidence Tesseract memilih pemenang yang
benar di kelimanya. Konsekuensinya OCR jadi ~2x lebih lama.

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

## Isi otomatis identitas

Setelah OCR, kolom Nama/Kelas/Divisi yang **masih kosong** diisi sendiri (`lib/parseIdentity.js`);
ketikan yang sudah ada tidak pernah ditimpa, dan sumbernya ditulis di bawah tombol.

- **Nama, Kelas, NIM** dari panel *Data Mahasiswa* yang muncul di tampilan mobile SIRAMA
- **Nama, Divisi** dari nama file berpola `JADWAL KULIAH_ALIF RND.png` (token terakhir = divisi)

Nama file yang tidak berpola (`Screenshot 2026-09-01 141258.png`, `IMG_1234.jpg`) sengaja
tidak ditebak sama sekali.

## Bentuk screenshot yang sudah diuji

Diverifikasi lewat UI, bukan cuma unit test:

| Bentuk | Hasil |
| --- | --- |
| crop tabel desktop (1652×932, 1521×841, 1498×814) | kode, hari, dan jam benar |
| jendela browser penuh + sidebar (1920×1080) | kode, hari, dan jam benar |
| screenshot HP portrait (1260×2800) | kode, hari, dan jam benar; sebagian nama mata kuliah tidak lengkap karena teksnya ~9px |

Nama mata kuliah yang pecah beberapa baris di sel sempit digabung lagi berdasarkan tinggi
kata — nama Inggris dirender lebih kecil, dan potongannya diambil pada penurunan tinggi
terbesar, bukan ambang tetap. Kode yang salah baca di satu sesi (`BZK4AAC4` jadi `BZK4AACA`,
atau tersisip jadi `BBKA4GBB3`) digabung kembali kalau jarak editnya 1 dan hari serta namanya
sama; kode yang dipakai diambil dari sesi terbanyak.

## Test

```bash
npm test
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
