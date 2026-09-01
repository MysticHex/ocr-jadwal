// Jalankan: node --test src/lib/weekLoad.test.js
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildGrid, buildInsights, toSessions } from './weekLoad.js'

const person = (id, nama, courses) => ({ id, nama, divisi: '', courses })

const PEOPLE = [
  person('a', 'Ana', [
    { code: 'AAA1', name: 'A', day: 'SENIN', start: '08:00', end: '10:00' },
    { code: 'BBB1', name: 'B', day: 'KAMIS', start: '09:00', end: '10:00' },
  ]),
  person('b', 'Budi', [{ code: 'CCC1', name: 'C', day: 'SENIN', start: '09:00', end: '11:00' }]),
  person('c', 'Cici', [
    { code: 'DDD1', name: 'D', day: 'SENIN', start: '09:00', end: '10:00' },
    { code: 'EEE1', name: 'E', day: 'KAMIS', start: '08:00', end: '09:00' },
  ]),
]

const build = (people) => {
  const { sessions, skipped } = toSessions(people)
  const grid = buildGrid(sessions)
  return { grid, skipped, insights: buildInsights(people, sessions, grid) }
}

test('mata kuliah tanpa hari atau jam dilewati, bukan bikin crash', () => {
  const { sessions, skipped } = toSessions([
    person('x', 'X', [
      { code: 'A', day: '', start: '08:00', end: '09:00' },
      { code: 'B', day: 'SENIN', start: '', end: '' },
      { code: 'C', day: 'SENIN', start: '10:00', end: '09:00' },
      { code: 'D', day: 'SENIN', start: '08:00', end: '09:00' },
    ]),
  ])
  assert.equal(sessions.length, 1)
  assert.equal(skipped, 3)
})

test('grid selalu SENIN-SABTU, dari jam paling awal ke paling akhir', () => {
  const { grid } = build(PEOPLE)
  assert.deepEqual(grid.days, ['SENIN', 'SELASA', 'RABU', 'KAMIS', "JUM'AT", 'SABTU'])
  assert.deepEqual(grid.slots, [480, 540, 600]) // 08:00, 09:00, 10:00
})

test('MINGGU hanya ikut kalau memang ada kelas', () => {
  assert.ok(!build(PEOPLE).grid.days.includes('MINGGU'))
  const withSunday = build([
    ...PEOPLE,
    person('m', 'Mira', [{ code: 'M1', name: 'M', day: 'MINGGU', start: '09:00', end: '10:00' }]),
  ])
  assert.deepEqual(withSunday.grid.days.at(-1), 'MINGGU')
})

test('hari tanpa kelas tetap muncul di tabel tapi tidak ikut ranking insight', () => {
  const { insights } = build(PEOPLE)
  assert.deepEqual(insights.emptyDays, ['SELASA', 'RABU', "JUM'AT", 'SABTU'])
  // SABTU kosong total; yang longgar harus KAMIS (2 jam-orang), bukan hari kosong
  assert.equal(insights.quietestDay.day, 'KAMIS')
  assert.equal(insights.mostFreeDay.day, 'KAMIS')
})

test('kotak menghitung orang unik, bukan jumlah mata kuliah', () => {
  const { grid } = build([
    ...PEOPLE,
    person('d', 'Dodi', [
      { code: 'F1', name: 'F', day: 'SENIN', start: '09:00', end: '10:00' },
      { code: 'F2', name: 'F lagi', day: 'SENIN', start: '09:00', end: '10:00' },
    ]),
  ])
  const senin09 = grid.cells[1].SENIN
  assert.equal(senin09.length, 5, '5 sesi menyentuh kotak 09:00')
  assert.equal(new Set(senin09.map((s) => s.person.id)).size, 4, 'tapi hanya 4 orang')
})

test('jam paling bentrok menunjuk kotak dengan orang terbanyak', () => {
  const { insights } = build(PEOPLE)
  assert.equal(insights.peak.day, 'SENIN')
  assert.equal(insights.peak.slot, 540) // 09:00
  assert.equal(insights.peak.count, 3)
})

test('hari paling padat dihitung dari jam-orang, bukan jumlah orang', () => {
  const { insights } = build(PEOPLE)
  // SENIN: 08:00 -> 1, 09:00 -> 3, 10:00 -> 1 = 5 jam-orang
  // KAMIS: 08:00 -> 1, 09:00 -> 1, 10:00 -> 0 = 2 jam-orang
  assert.equal(insights.busiestDay.day, 'SENIN')
  assert.equal(insights.busiestDay.load, 5)
  assert.equal(insights.quietestDay.day, 'KAMIS')
  assert.equal(insights.quietestDay.load, 2)
})

test('slot bebas semua anggota terdeteksi per hari', () => {
  const { insights } = build(PEOPLE)
  const kamis = insights.perDay.find((d) => d.day === 'KAMIS')
  assert.deepEqual(kamis.free, [600]) // 10:00 tidak ada yang kelas
  assert.equal(insights.mostFreeDay.day, 'KAMIS')
})

test('beban per anggota diurutkan dari yang tersibuk, seri ikut urutan input', () => {
  const { insights } = build(PEOPLE)
  assert.deepEqual(
    insights.perPerson.map((p) => [p.person.nama, p.load]),
    [
      ['Ana', 3],
      ['Budi', 2],
      ['Cici', 2],
    ],
  )
})
