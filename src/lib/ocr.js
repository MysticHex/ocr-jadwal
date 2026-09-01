import { createWorker } from 'tesseract.js'

let workerPromise = null

async function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = createWorker('ind+eng', 1, { logger: (m) => onProgress?.(m) }).then(
      async (worker) => {
        await worker.setParameters({
          // PSM 6 = satu blok teks seragam. Mode auto (3) sering membuang isi sel
          // berwarna pada tabel jadwal dan cuma menyisakan kolom jam.
          tessedit_pageseg_mode: '6',
          preserve_interword_spaces: '1',
        })
        return worker
      }
    )
  }
  return workerPromise
}

/**
 * Jalankan OCR pada gambar/canvas.
 * @param {File|Blob|HTMLCanvasElement|string} image
 * @param {(m:{status:string,progress:number}) => void} [onProgress]
 * @returns {Promise<{text:string, words:Array<{text:string,bbox:object,confidence:number}>}>}
 */
export async function recognize(image, onProgress) {
  const worker = await getWorker(onProgress)
  const { data } = await worker.recognize(image, {}, { text: true, blocks: true })

  const words = []
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          if (word.bbox) words.push({ text: word.text, bbox: word.bbox, confidence: word.confidence })
        }
      }
    }
  }

  return { text: data.text, words }
}

export async function terminateOcr() {
  if (!workerPromise) return
  const worker = await workerPromise
  workerPromise = null
  await worker.terminate()
}
