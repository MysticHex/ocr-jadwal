// Agregasi jadwal semua anggota jadi grid mingguan + insight beban.
// Dipisah dari komponen supaya bisa dites tanpa render React.

export const DAYS = ['SENIN', 'SELASA', 'RABU', 'KAMIS', "JUM'AT", 'SABTU', 'MINGGU']
// Kalender selalu tampil SENIN-SABTU walau harinya kosong, supaya bentuk minggunya
// tetap sama antar upload. MINGGU baru ikut kalau memang ada kelas.
const WEEK = DAYS.slice(0, 6)
export const SLOT = 60

function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

export function toClock(total) {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function countPeople(list) {
  return new Set(list.map((s) => s.person.id)).size
}

/**
 * Ratakan semua orang jadi daftar sesi { day, from, to, person, course }.
 * Mata kuliah tanpa hari atau tanpa jam tidak bisa ditaruh di grid.
 */
export function toSessions(people) {
  const sessions = []
  let skipped = 0
  for (const person of people)
    for (const course of person.courses || []) {
      const day = (course.day || '').toUpperCase()
      const from = toMinutes(course.start)
      const to = toMinutes(course.end)
      if (!DAYS.includes(day) || from == null || to == null || to <= from) {
        skipped += 1
        continue
      }
      sessions.push({ day, from, to, person, course })
    }
  return { sessions, skipped }
}

export function buildGrid(sessions) {
  const days = DAYS.filter((d) => WEEK.includes(d) || sessions.some((s) => s.day === d))
  const first = Math.min(...sessions.map((s) => s.from))
  const last = Math.max(...sessions.map((s) => s.to))

  const slots = []
  for (let t = first; t < last; t += SLOT) slots.push(t)

  // cells[indeks slot][hari] = sesi yang menyentuh kotak itu
  const cells = slots.map((t) =>
    Object.fromEntries(
      days.map((day) => [day, sessions.filter((s) => s.day === day && s.from < t + SLOT && s.to > t)]),
    ),
  )
  return { days, slots, cells }
}

export function buildInsights(people, sessions, grid) {
  const { days, slots, cells } = grid

  const perDay = days.map((day) => ({
    day,
    // jam-orang: satu anggota sibuk di satu kotak = 1
    load: slots.reduce((sum, _, i) => sum + countPeople(cells[i][day]), 0),
    people: new Set(sessions.filter((s) => s.day === day).map((s) => s.person.id)).size,
    free: slots.filter((_, i) => cells[i][day].length === 0),
  }))

  let peak = { count: 0, day: days[0], slot: slots[0] }
  for (let i = 0; i < slots.length; i++)
    for (const day of days) {
      const count = countPeople(cells[i][day])
      if (count > peak.count) peak = { count, day, slot: slots[i] }
    }

  const perPerson = people
    .map((person) => ({
      person,
      load: sessions
        .filter((s) => s.person.id === person.id)
        .reduce((sum, s) => sum + (s.to - s.from) / SLOT, 0),
    }))
    .sort((a, b) => b.load - a.load)

  // Hari tanpa satu pun kelas selalu menang jadi "paling longgar" dan "paling banyak
  // slot kosong" — tidak berguna. Ranking dihitung dari hari yang ada kelasnya saja.
  const active = perDay.filter((d) => d.people > 0)
  const ranked = active.length ? active : perDay

  return {
    perDay,
    perPerson,
    peak,
    emptyDays: perDay.filter((d) => d.people === 0).map((d) => d.day),
    busiestDay: [...ranked].sort((a, b) => b.load - a.load)[0],
    quietestDay: [...ranked].sort((a, b) => a.load - b.load)[0],
    mostFreeDay: [...ranked].sort((a, b) => b.free.length - a.free.length)[0],
  }
}
