/**
 * Perkecil gambar jadi thumbnail dataURL supaya aman disimpan di localStorage.
 * @param {File} file
 * @param {number} maxWidth
 * @returns {Promise<string>} dataURL JPEG
 */
export function makeThumbnail(file, maxWidth = 360) {
  return loadImage(file).then((img) => {
    const scale = Math.min(1, maxWidth / img.width)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.6)
  })
}

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
      reject(new Error('Gambar tidak bisa dibaca'))
    }
    img.src = url
  })
}

/** Ambang Otsu dari histogram grayscale. */
function otsuThreshold(hist, total) {
  const sumAll = hist.reduce((acc, count, level) => acc + level * count, 0)
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
 * Siapkan gambar untuk OCR: perbesar, grayscale, lalu binarisasi Otsu.
 *
 * Tanpa langkah ini Tesseract sering melewatkan teks di dalam sel berwarna
 * (teks hijau tua di atas blok hijau muda) dan hasilnya cuma kolom jam.
 *
 * @param {File} file
 * @param {{targetWidth?: number, maxScale?: number}} [opts]
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function preprocessForOcr(file, { targetWidth = 2400, maxScale = 3 } = {}) {
  const img = await loadImage(file)
  const scale = Math.max(1, Math.min(maxScale, targetWidth / img.width))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const px = imageData.data
  const hist = new Array(256).fill(0)
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
  ctx.putImageData(imageData, 0, 0)
  return canvas
}
