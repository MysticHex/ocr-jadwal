import { useMemo, useState } from 'react'
import { SLOT, buildGrid, buildInsights, countPeople, toClock, toSessions } from '../lib/weekLoad.js'

function SlotDetail({ day, slot, list }) {
  return (
    <div className="slot-detail">
      <h3>
        {day} {toClock(slot)}–{toClock(slot + SLOT)} — {countPeople(list)} anggota sibuk
      </h3>
      {list.length === 0 ? (
        <p className="hint">Tidak ada yang kelas di jam ini. Slot aman untuk rapat.</p>
      ) : (
        <ul className="slot-list">
          {list.map((s, i) => (
            <li key={`${s.person.id}-${i}`}>
              <strong>{s.person.nama}</strong>
              {s.person.divisi && <span className="muted"> · {s.person.divisi}</span>}
              <span className="muted">
                {' — '}
                {s.course.code} {s.course.name} ({toClock(s.from)}–{toClock(s.to)})
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Insights({ insights, total }) {
  const { busiestDay, quietestDay, peak, mostFreeDay, perDay, perPerson } = insights

  return (
    <div className="card">
      <h2>Insight</h2>

      <div className="insight-grid">
        <div className="insight hot">
          <span>Hari paling padat</span>
          <strong>{busiestDay.day}</strong>
          <em>
            {busiestDay.load} jam-orang · {busiestDay.people} anggota ada kelas
          </em>
        </div>
        <div className="insight">
          <span>Hari paling longgar</span>
          <strong>{quietestDay.day}</strong>
          <em>
            {quietestDay.load} jam-orang · {quietestDay.people} anggota ada kelas
          </em>
        </div>
        <div className="insight hot">
          <span>Jam paling bentrok</span>
          <strong>
            {peak.day} {toClock(peak.slot)}
          </strong>
          <em>
            {peak.count} dari {total} anggota sibuk bersamaan
          </em>
        </div>
        <div className="insight">
          <span>Paling banyak slot kosong</span>
          <strong>{mostFreeDay.day}</strong>
          <em>{mostFreeDay.free.length} slot semua anggota bebas</em>
        </div>
      </div>

      <h3>Beban per hari</h3>
      <div className="parsed">
        <table className="mini">
          <thead>
            <tr>
              <th>Hari</th>
              <th>Jam-orang</th>
              <th>Anggota ada kelas</th>
              <th>Slot bebas semua</th>
            </tr>
          </thead>
          <tbody>
            {perDay.map((d) => (
              <tr key={d.day}>
                <td>{d.day}</td>
                <td className="mono">{d.load}</td>
                <td className="mono">
                  {d.people}/{total}
                </td>
                <td className="mono">{d.free.map(toClock).join(', ') || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Beban per anggota</h3>
      <div className="parsed">
        <table className="mini">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Divisi</th>
              <th>Jam kelas / minggu</th>
            </tr>
          </thead>
          <tbody>
            {perPerson.map(({ person, load }) => (
              <tr key={person.id}>
                <td>{person.nama}</td>
                <td>{person.divisi || '-'}</td>
                <td className="mono">{load}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function WeekCalendar({ people }) {
  const [picked, setPicked] = useState(null)

  const data = useMemo(() => {
    const { sessions, skipped } = toSessions(people)
    if (!sessions.length) return { skipped, empty: true }
    const grid = buildGrid(sessions)
    return { skipped, grid, insights: buildInsights(people, sessions, grid), empty: false }
  }, [people])

  if (data.empty) {
    return (
      <div className="card empty">
        Belum ada jadwal yang bisa dipetakan. Butuh minimal satu mata kuliah dengan kolom{' '}
        <strong>hari</strong> dan <strong>jam</strong> terisi.
        {data.skipped > 0 && ` (${data.skipped} mata kuliah dilewati karena hari/jam kosong)`}
      </div>
    )
  }

  const { grid, insights, skipped } = data
  const { days, slots, cells } = grid
  const max = Math.max(1, insights.peak.count)
  const total = people.length
  const pickedCell = picked && cells[slots.indexOf(picked.slot)]?.[picked.day]

  return (
    <>
      <div className="card">
        <h2>Kalender Mingguan ({total} anggota)</h2>
        <p className="hint">
          Angka = berapa anggota sibuk di jam itu; warna makin pekat makin padat. Klik kotak untuk
          melihat siapa dan mata kuliah apa.
        </p>

        <div className="parsed">
          <table className="cal">
            <thead>
              <tr>
                <th>Jam</th>
                {days.map((day) => {
                  const n = insights.perDay.find((d) => d.day === day).people
                  return (
                    <th key={day} className={n ? undefined : 'cal-off'}>
                      {day}
                      <em>{n ? `${n} orang` : 'kosong'}</em>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {slots.map((slot, i) => (
                <tr key={slot}>
                  <th className="mono cal-time">{toClock(slot)}</th>
                  {days.map((day) => {
                    const count = countPeople(cells[i][day])
                    const on = picked?.day === day && picked?.slot === slot
                    return (
                      <td
                        key={day}
                        className={`cal-cell${on ? ' picked' : ''}${count ? '' : ' free'}`}
                        style={
                          count
                            ? { background: `color-mix(in srgb, var(--accent) ${Math.round(15 + 60 * (count / max))}%, transparent)` }
                            : undefined
                        }
                        title={count ? `${count} dari ${total} anggota sibuk` : 'semua anggota bebas'}
                        onClick={() => setPicked(on ? null : { day, slot })}
                      >
                        {count || ''}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pickedCell && <SlotDetail day={picked.day} slot={picked.slot} list={pickedCell} />}

        {skipped > 0 && (
          <p className="hint cal-note">
            {skipped} mata kuliah tidak masuk kalender karena kolom hari atau jam kosong — lengkapi
            dulu di tabel "Hasil baca" sebelum menyimpan.
          </p>
        )}
      </div>

      <Insights insights={insights} total={total} />
    </>
  )
}
