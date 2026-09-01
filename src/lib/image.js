function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })
}

/**
 * Perkecil gambar jadi thumbnail dataURL supaya aman disimpan di localStorage.
 * @param {File} file
 * @param {number} maxWidth
 * @returns {Promise<string>} dataURL JPEG
 */
export async function makeThumbnail(file, maxWidth = 360) {
  const img = await loadImage(file)
  const scale = Math.min(1, maxWidth / img.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.6)
}

// Batas aman ukuran canvas di browser mobile.
const MAX_PIXELS = 16e6

function toBlob(canvas, fallback) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob || fallback), 'image/png'))
}

/**
 * Gambar ulang di canvas dengan skala untuk OCR. Teks sel jadwal SIRAMA hanya
 * ~9px pada screenshot 1920px; upscale 2x menaikkan confidence Tesseract
 * ~79 -> ~91 dan memperbaiki jam yang terbaca "1030- 11:30" jadi "10:30 - 11:30".
 *
 * @returns {Promise<{canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D}|null>}
 *   null kalau gambar sudah cukup besar sehingga tidak perlu diskalakan.
 */
async function renderScaled(file, minWidth) {
  const img = await loadImage(file)
  let scale = Math.min(3, Math.max(1, minWidth / img.width))
  const pixels = img.width * img.height * scale * scale
  if (pixels > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / (img.width * img.height))
  if (scale <= 1) return null

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return { canvas, ctx }
}

/**
 * Gambar hasil upscale, warna asli dipertahankan.
 *
 * @param {File|Blob} file
 * @param {number} minWidth lebar target (1920 -> skala 2x)
 * @returns {Promise<Blob|File>} file asli kalau sudah cukup besar
 */
export async function upscaleForOcr(file, minWidth = 3840) {
  const scaled = await renderScaled(file, minWidth)
  return scaled ? toBlob(scaled.canvas, file) : file
}

/** Ambang Otsu dari histogram grayscale. */
function otsuThreshold(hist, total) {
  let sumAll = 0
  for (let t = 0; t < 256; t += 1) sumAll += t * hist[t]

  let sumB = 0
  let weightB = 0
  let best = 0
  let bestVar = -1
  for (let t = 0; t < 256; t += 1) {
    weightB += hist[t]
    if (weightB === 0) continue
    const weightF = total - weightB
    if (weightF === 0) break
    sumB += t * hist[t]
    const meanB = sumB / weightB
    const meanF = (sumAll - sumB) / weightF
    const between = weightB * weightF * (meanB - meanF) ** 2
    if (between > bestVar) {
      bestVar = between
      best = t
    }
  }
  return best
}

/**
 * Gambar hasil upscale yang di-grayscale lalu dibinarisasi Otsu.
 *
 * Pada beberapa screenshot Tesseract melewatkan teks hijau tua di dalam sel
 * hijau muda dan hanya menyisakan kolom jam — satu gambar uji turun dari tujuh
 * mata kuliah jadi nol. Binarisasi memperbaikinya (confidence 69 -> 92).
 *
 * Kebalikannya juga terjadi: pada screenshot jendela browser penuh, chrome dan
 * sidebar yang gelap menarik ambang global ke bawah dan justru merusak hasil
 * (confidence 83 -> 63). Karena itu versi ini bukan pengganti `upscaleForOcr`
 * melainkan pembanding — lihat `recognizeBestGrid` di `ocr.js`.
 *
 * ponytail: ambang global. Sauvola/adaptif sudah dicoba dan lebih buruk pada
 * korpus ini (header hari malah hilang); pilih ulang kalau korpusnya berubah.
 */
export async function binarizeForOcr(file, minWidth = 3840) {
  const scaled = await renderScaled(file, minWidth)
  if (!scaled) return file
  const { canvas, ctx } = scaled

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const px = image.data
  const hist = new Uint32Array(256)
  const gray = new Uint8ClampedArray(px.length / 4)

  for (let i = 0, g = 0; i < px.length; i += 4, g += 1) {
    const value = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000
    gray[g] = value
    hist[value | 0] += 1
  }

  const threshold = otsuThreshold(hist, gray.length)
  for (let i = 0, g = 0; i < px.length; i += 4, g += 1) {
    const value = gray[g] > threshold ? 255 : 0
    px[i] = value
    px[i + 1] = value
    px[i + 2] = value
    px[i + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return toBlob(canvas, file)
}
