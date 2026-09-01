import { createWorker } from 'tesseract.js'

let workerPromise = null

async function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = createWorker('ind+eng', 1, {
      logger: (m) => onProgress?.(m),
    })
  }
  return workerPromise
}

/**
 * Jalankan OCR pada file gambar.
 * @param {File|Blob|string} image
 * @param {(m:{status:string,progress:number}) => void} [onProgress]
 * @returns {Promise<string>} teks mentah
 */
export async function recognize(image, onProgress) {
  const worker = await getWorker(onProgress)
  const { data } = await worker.recognize(image)
  return data.text
}

export async function terminateOcr() {
  if (!workerPromise) return
  const worker = await workerPromise
  workerPromise = null
  await worker.terminate()
}
