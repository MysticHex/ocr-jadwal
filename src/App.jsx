import { useEffect, useState } from 'react'
import ScheduleForm from './components/ScheduleForm.jsx'
import PeopleTable from './components/PeopleTable.jsx'

const STORAGE_KEY = 'ocr-jadwal:people'

function loadPeople() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? []
  } catch {
    return []
  }
}

export default function App() {
  const [people, setPeople] = useState(loadPeople)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(people))
    } catch {
      // kuota localStorage penuh - data tetap ada di memori sesi ini
    }
  }, [people])

  function exportJson() {
    const blob = new Blob([JSON.stringify(people, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'jadwal.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="app">
      <header>
        <h1>OCR Jadwal Kuliah</h1>
        <p>Upload screenshot jadwal, isi identitas, dapatkan tabel dengan detail kelas saat hover.</p>
      </header>

      <ScheduleForm onSubmit={(person) => setPeople((prev) => [...prev, person])} />

      <PeopleTable
        people={people}
        onRemove={(id) => setPeople((prev) => prev.filter((p) => p.id !== id))}
      />

      {people.length > 0 && (
        <div className="row end">
          <button type="button" className="secondary" onClick={exportJson}>
            Export JSON
          </button>
          <button type="button" className="link danger" onClick={() => setPeople([])}>
            Hapus semua
          </button>
        </div>
      )}

      <footer>OCR jalan penuh di browser (tesseract.js). Data tersimpan lokal di perangkat.</footer>
    </div>
  )
}
