import { createWorker, PSM } from 'tesseract.js'
import { binarizeForOcr, upscaleForOcr } from './image.js'

let workerPromise = null

async function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = createWorker('ind+eng', 1, {
      logger: (m) => onProgress?.(m),
    }).catch((e) => {
      // Jangan cache promise yang gagal, kalau tidak retry akan gagal instan
      // dengan pesan yang sama sampai halaman di-reload.
      workerPromise = null
      throw e
    })
  }
  return workerPromise
}

function flattenWords(data) {
  const words = []
  for (const block of data.blocks || [])
    for (const para of block.paragraphs || [])
      for (const line of para.lines || [])
        for (const word of line.words || []) {
          const text = word.text.trim()
          if (text) words.push({ text, ...word.bbox })
        }
  return words
}

async function run(image, onProgress, psm) {
  const worker = await getWorker(onProgress)
  await worker.setParameters({ tessedit_pageseg_mode: psm })
  const { data } = await worker.recognize(image)
  return { text: data.text, words: flattenWords(data), confidence: data.confidence }
}

/**
 * Baca jadwal apa adanya sebagai satu blok. Tata letak grid dipertahankan, jadi
 * header hari (SENIN..MINGGU) ikut terbaca dan tiap kata punya koordinat — itu
 * yang dipakai `parseScheduleColumns` untuk menentukan kolom hari.
 *
 * @param {File|Blob|string} image
 * @param {(m:{status:string,progress:number}) => void} [onProgress]
 * @returns {Promise<{text: string, words: Array<{text:string,x0:number,y0:number,x1:number,y1:number}>}>}
 */
export function recognizeGrid(image, onProgress) {
  return run(image, onProgress, PSM.SINGLE_BLOCK)
}

/**
 * Deteksi tata letak otomatis: tiap sel keluar sebagai blok teks terpisah, tapi
 * header hari sering tidak terbaca. Cadangan untuk gambar yang sudah di-crop
 * sehingga baris header tidak ikut terpotret.
 */
export function recognizeText(image, onProgress) {
  return run(image, onProgress, PSM.AUTO)
}

/**
 * Baca gambar dua kali — warna asli dan versi binarisasi Otsu — lalu ambil yang
 * confidence-nya lebih tinggi.
 *
 * Tidak ada satu preprocessing yang menang untuk semua bentuk screenshot.
 * Crop tabel dengan sel berwarna butuh binarisasi (satu gambar uji: 0 -> 7 mata
 * kuliah), sedangkan screenshot jendela browser penuh justru rusak karenanya
 * (7 -> hasil kacau). Diukur pada lima gambar, confidence Tesseract memilih
 * pemenang yang benar di kelimanya, jadi itu yang dipakai sebagai juri.
 *
 * @param {File|Blob} file gambar asli, belum diskalakan
 * @param {(m:{status:string,progress:number}) => void} [onProgress]
 */
export async function recognizeBestGrid(file, onProgress) {
  const passes = []
  for (const [label, prepare] of [
    ['warna asli', upscaleForOcr],
    ['kontras tinggi', binarizeForOcr],
  ]) {
    const image = await prepare(file)
    const result = await recognizeGrid(image, (m) =>
      onProgress?.({ ...m, status: `${m.status} (${label})` }),
    )
    passes.push(result)
  }
  return passes.reduce((best, pass) => (pass.confidence > best.confidence ? pass : best))
}

export async function terminateOcr() {
  if (!workerPromise) return
  const worker = await workerPromise
  workerPromise = null
  await worker.terminate()
}
