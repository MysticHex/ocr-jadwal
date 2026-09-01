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

/**
 * Perbesar screenshot sebelum OCR. Teks sel jadwal SIRAMA hanya ~9px pada
 * screenshot 1920px; upscale 2x menaikkan confidence Tesseract ~79 -> ~91 dan
 * memperbaiki jam yang terbaca "1030- 11:30" jadi "10:30 - 11:30".
 *
 * @param {File|Blob} file
 * @param {number} minWidth lebar target (1920 -> skala 2x)
 * @returns {Promise<Blob|File>} file asli kalau sudah cukup besar
 */
export async function upscaleForOcr(file, minWidth = 3840) {
  const img = await loadImage(file)
  let scale = Math.min(3, Math.max(1, minWidth / img.width))
  const pixels = img.width * img.height * scale * scale
  if (pixels > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / (img.width * img.height))
  if (scale <= 1) return file

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob || file), 'image/png'))
}
