import { useRef, useState } from 'react'
import { recognizeBestGrid, recognizeText } from '../lib/ocr.js'
import { applyKnownNames, parseSchedule, parseScheduleColumns } from '../lib/parseSchedule.js'
import { identityFromFilename, parseIdentity } from '../lib/parseIdentity.js'
import { makeThumbnail, upscaleForOcr } from '../lib/image.js'

const EMPTY = { nama: '', kelas: '', divisi: '' }

export default function ScheduleForm({ onSubmit, people }) {
  const [form, setForm] = useState(EMPTY)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [courses, setCourses] = useState([])
  const [rawText, setRawText] = useState('')
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [identitySource, setIdentitySource] = useState('')
  const [nim, setNim] = useState('')
  const fileRef = useRef(null)

  // Isi kolom identitas yang masih kosong. Panel "Data Mahasiswa" (tampilan
  // mobile SIRAMA) memberi nama/NIM/kelas; nama file memberi nama dan divisi.
  // Ketikan user tidak pernah ditimpa.
  function autofillIdentity(text, filename) {
    const fromImage = parseIdentity(text)
    const fromName = identityFromFilename(filename)
    const sources = []

    // Dihitung dari state saat ini, bukan di dalam updater setForm: updater
    // dijalankan React belakangan, jadi `sources` masih kosong saat dibaca.
    const next = { ...form }
    if (!next.nama.trim() && (fromImage.nama || fromName.nama)) {
      next.nama = fromImage.nama || fromName.nama
      sources.push(fromImage.nama ? 'gambar' : 'nama file')
    }
    if (!next.kelas.trim() && fromImage.kelas) {
      next.kelas = fromImage.kelas
      sources.push('gambar')
    }
    if (!next.divisi.trim() && fromName.divisi) {
      next.divisi = fromName.divisi
      sources.push('nama file')
    }

    setNim(fromImage.nim)
    setForm(next)

    if (!sources.length) return ''
    return `Identitas terisi otomatis dari ${[...new Set(sources)].join(' dan ')} — periksa dulu sebelum simpan.`
  }

  function pickFile(nextFile) {
    if (!nextFile) return
    setFile(nextFile)
    setCourses([])
    setRawText('')
    setError('')
    if (preview) URL.revokeObjectURL(preview)
    setPreview(URL.createObjectURL(nextFile))
  }

  async function runOcr() {
    if (!file) {
      setError('Pilih gambar jadwal dulu.')
      return
    }
    setBusy(true)
    setError('')
    setStatus('memuat model OCR...')
    try {
      const onLog = (m) => {
        setStatus(m.status)
        setProgress(m.progress || 0)
      }
      const grid = await recognizeBestGrid(file, onLog)
      let text = grid.text
      let parsed = parseScheduleColumns(grid.words)
      if (!parsed.length) {
        // Tidak ada baris header hari (gambar sudah di-crop): baca ulang dengan
        // deteksi tata letak otomatis, kolom hari diisi manual.
        const auto = await recognizeText(await upscaleForOcr(file), onLog)
        text = auto.text
        parsed = parseSchedule(auto.text)
      }
      setRawText(text)
      setCourses(applyKnownNames(parsed, people))
      setIdentitySource(autofillIdentity(text, file.name))
      setStatus(parsed.length ? `${parsed.length} mata kuliah terbaca` : 'tidak ada mata kuliah terbaca')
      if (!parsed.length) {
        setError('OCR selesai tapi tidak menemukan pola jadwal. Coba gambar beresolusi lebih tinggi.')
      }
    } catch (e) {
      setError(`OCR gagal: ${e?.message || e || 'penyebab tidak diketahui, lihat console'}`)
    } finally {
      setBusy(false)
      setProgress(0)
    }
  }

  function updateCourse(index, field, value) {
    setCourses((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)))
  }

  function removeCourse(index) {
    setCourses((prev) => prev.filter((_, i) => i !== index))
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.nama.trim()) {
      setError('Nama wajib diisi.')
      return
    }
    if (!courses.length) {
      setError('Belum ada mata kuliah. Jalankan OCR dulu.')
      return
    }
    const thumb = file ? await makeThumbnail(file) : ''
    onSubmit({
      id: crypto.randomUUID(),
      nama: form.nama.trim(),
      kelas: form.kelas.trim(),
      divisi: form.divisi.trim(),
      nim,
      courses,
      thumb,
      rawText,
      createdAt: new Date().toISOString(),
    })
    setForm(EMPTY)
    setFile(null)
    setCourses([])
    setRawText('')
    setStatus('')
    setError('')
    setIdentitySource('')
    setNim('')
    if (preview) URL.revokeObjectURL(preview)
    setPreview('')
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Input Jadwal</h2>

      <label
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          pickFile(e.dataTransfer.files?.[0])
        }}
      >
        {preview ? (
          <img src={preview} alt="Pratinjau jadwal" />
        ) : (
          <span>Klik atau tarik gambar jadwal ke sini (PNG / JPG)</span>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
      </label>

      <div className="grid-3">
        <label>
          Nama
          <input
            value={form.nama}
            onChange={(e) => setForm({ ...form, nama: e.target.value })}
            placeholder="Kylian Mbappe"
          />
        </label>
        <label>
          Kelas
          <input
            value={form.kelas}
            onChange={(e) => setForm({ ...form, kelas: e.target.value })}
            placeholder="SI-48-INT"
          />
        </label>
        <label>
          Divisi
          <input
            value={form.divisi}
            onChange={(e) => setForm({ ...form, divisi: e.target.value })}
            placeholder="Acara"
          />
        </label>
      </div>

      <div className="row">
        <button type="button" className="secondary" onClick={runOcr} disabled={busy}>
          {busy ? 'Membaca...' : 'Jalankan OCR'}
        </button>
        <button type="submit" disabled={busy}>
          Simpan ke Tabel
        </button>
      </div>

      {busy && (
        <div className="progress">
          <div className="bar" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      {status && <p className="status">{status}</p>}
      {identitySource && <p className="status">{identitySource}</p>}
      {error && <p className="error">{error}</p>}

      {rawText && (
        <details className="raw">
          <summary>Teks mentah OCR ({rawText.length} karakter)</summary>
          <textarea readOnly rows={12} value={rawText} />
        </details>
      )}

      {courses.length > 0 && (
        <div className="parsed">
          <h3>Hasil baca ({courses.length}) — bisa dikoreksi</h3>
          <table className="mini">
            <thead>
              <tr>
                <th>Kode</th>
                <th>Mata Kuliah</th>
                <th>Hari</th>
                <th>Mulai</th>
                <th>Selesai</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {courses.map((c, i) => (
                <tr key={`${c.code}-${i}`}>
                  <td><input value={c.code} onChange={(e) => updateCourse(i, 'code', e.target.value)} /></td>
                  <td><input value={c.name} onChange={(e) => updateCourse(i, 'name', e.target.value)} /></td>
                  <td><input value={c.day} onChange={(e) => updateCourse(i, 'day', e.target.value)} placeholder="SENIN" /></td>
                  <td><input value={c.start} onChange={(e) => updateCourse(i, 'start', e.target.value)} /></td>
                  <td><input value={c.end} onChange={(e) => updateCourse(i, 'end', e.target.value)} /></td>
                  <td>
                    <button type="button" className="link" onClick={() => removeCourse(i)}>
                      hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </form>
  )
}
