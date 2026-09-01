import { useRef, useState } from 'react'
import { recognize } from '../lib/ocr.js'
import { parseSchedule } from '../lib/parseSchedule.js'
import { makeThumbnail } from '../lib/image.js'

const EMPTY = { nama: '', kelas: '', divisi: '' }

export default function ScheduleForm({ onSubmit }) {
  const [form, setForm] = useState(EMPTY)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [courses, setCourses] = useState([])
  const [rawText, setRawText] = useState('')
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

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
      const text = await recognize(file, (m) => {
        setStatus(m.status)
        setProgress(m.progress || 0)
      })
      setRawText(text)
      const parsed = parseSchedule(text)
      setCourses(parsed)
      setStatus(parsed.length ? `${parsed.length} mata kuliah terbaca` : 'tidak ada mata kuliah terbaca')
      if (!parsed.length) {
        setError('OCR selesai tapi tidak menemukan pola jadwal. Coba gambar beresolusi lebih tinggi.')
      }
    } catch (e) {
      setError(`OCR gagal: ${e.message}`)
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
            placeholder="Andikanajmi Levi Maheswara"
          />
        </label>
        <label>
          Kelas
          <input
            value={form.kelas}
            onChange={(e) => setForm({ ...form, kelas: e.target.value })}
            placeholder="IF-47-01"
          />
        </label>
        <label>
          Divisi
          <input
            value={form.divisi}
            onChange={(e) => setForm({ ...form, divisi: e.target.value })}
            placeholder="Data Science"
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
      {error && <p className="error">{error}</p>}

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
