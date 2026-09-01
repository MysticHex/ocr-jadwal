import { useState } from 'react'

function DetailCard({ person }) {
  return (
    <div className="detail-card">
      <div className="detail-head">
        <strong>{person.nama}</strong>
        <span>
          {[person.nim, person.kelas, person.divisi].filter(Boolean).join(' · ') ||
            'tanpa kelas/divisi'}
        </span>
      </div>
      {person.thumb && <img className="detail-thumb" src={person.thumb} alt={`Jadwal ${person.nama}`} />}
      <table className="detail-table">
        <thead>
          <tr>
            <th>Kode</th>
            <th>Mata Kuliah</th>
            <th>Hari</th>
            <th>Jam</th>
            <th>Sesi</th>
          </tr>
        </thead>
        <tbody>
          {person.courses.map((c, i) => (
            <tr key={`${c.code}-${i}`}>
              <td className="mono">{c.code}</td>
              <td>
                {c.name}
                {c.nameEn && <em>{c.nameEn}</em>}
              </td>
              <td>{c.day || '-'}</td>
              <td className="mono">{c.start && c.end ? `${c.start}-${c.end}` : '-'}</td>
              <td>{c.sessions ?? 1}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function PeopleTable({ people, onRemove }) {
  const [active, setActive] = useState(null)

  if (!people.length) {
    return (
      <div className="card empty">
        Belum ada data. Upload gambar jadwal, isi nama/kelas/divisi, lalu simpan.
      </div>
    )
  }

  return (
    <div className="card">
      <h2>Daftar Mahasiswa ({people.length})</h2>
      <p className="hint">Arahkan kursor (atau ketuk) baris untuk melihat detail kelas.</p>
      <table className="people">
        <thead>
          <tr>
            <th>Nama</th>
            <th>Kelas</th>
            <th>Divisi</th>
            <th>Jml MK</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr
              key={p.id}
              className={active === p.id ? 'active' : ''}
              onMouseEnter={() => setActive(p.id)}
              onMouseLeave={() => setActive((cur) => (cur === p.id ? null : cur))}
              onClick={() => setActive((cur) => (cur === p.id ? null : p.id))}
            >
              <td className="name-cell">
                {p.nama}
                {active === p.id && <DetailCard person={p} />}
              </td>
              <td>{p.kelas || '-'}</td>
              <td>{p.divisi || '-'}</td>
              <td>{p.courses.length}</td>
              <td>
                <button
                  type="button"
                  className="link danger"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemove(p.id)
                  }}
                >
                  hapus
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
