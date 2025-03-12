// @vitest-environment node

import useTimingRecovery, {
  Stats,
  TimingRecovery,
  Truncated,
  type Event
} from '@/composables/useTimingRecovery'
import { describe, expect, test } from 'vitest'
import { nextTick, shallowRef, type ShallowRef } from 'vue'

describe('Stats', () => {
  test('n=0', () => {
    const s = new Stats()
    expect(s.count).toEqual(0)
    expect(s.mean).toBeNaN()
    expect(s.variance).toBeNaN()
    expect(s.stddev).toBeNaN()
  })
  test('n=1', () => {
    const s = new Stats()
    s.add(10)
    expect(s.count).to.equal(1)
    expect(s.mean).to.equal(10)
    expect(s.variance).to.equal(0)
    expect(s.stddev).to.equal(0)
  })
  test('n=2', () => {
    const s = new Stats([10])
    s.add(20)
    expect(s.count).to.equal(2)
    expect(s.mean).to.equal(15)
    expect(s.variance).to.equal(25)
    expect(s.stddev).to.equal(5)
  })
  test('n=8', () => {
    const s = new Stats([2, 4, 4, 4, 5, 5, 7, 9])
    expect(s.count).to.equal(8)
    expect(s.mean).to.equal(5)
    expect(s.variance).to.equal(4)
    expect(s.stddev).to.equal(2)
  })
  test('n={6,7,8}, then n={7,6} (removals)', () => {
    const s6 = new Stats([2, 4, 4, 5, 5, 9])

    const s7 = s6.clone()
    s7.add(4)

    const s = s7.clone()
    s.add(7)

    expect(s6.count).to.equal(6)
    expect(s6.mean).toBeCloseTo(4 + 5 / 6, 5e-10)
    expect(s6.variance).toBeCloseTo(4 + 17 / 36, 5e-10)
    expect(s6.stddev).toBeCloseTo(Math.sqrt(4 + 17 / 36), 5e-10)

    expect(s7.count).to.equal(7)
    expect(s7.mean).toBeCloseTo(4 + 5 / 7, 5e-10)
    expect(s7.variance).toBeCloseTo(3 + 45 / 49, 5e-10)
    expect(s7.stddev).toBeCloseTo(Math.sqrt(3 + 45 / 49), 5e-10)

    expect(s.count).to.equal(8)
    expect(s.mean).to.equal(5)
    expect(s.variance).to.equal(4)
    expect(s.stddev).to.equal(2)

    s.remove(7)

    expect(s.count).to.equal(7)
    expect(s.mean).toBeCloseTo(s7.mean, 5e-10)
    expect(s.variance).toBeCloseTo(s7.variance, 5e-10)
    expect(s.stddev).toBeCloseTo(s7.stddev, 5e-10)

    s.remove(4)

    expect(s.count).to.equal(6)
    expect(s.mean).toBeCloseTo(s6.mean, 5e-10)
    expect(s.variance).toBeCloseTo(s6.variance, 5e-10)
    expect(s.stddev).toBeCloseTo(s6.stddev, 5e-10)
  })
})

describe('Truncated', () => {
  test('sorts initial values', () => {
    expect(Array.from(new Truncated([4, 3, 1, 5, 2], 1).truncated())).toEqual([1, 2, 3, 4, 5])
  })

  test('sorts later values values', () => {
    const t = new Truncated([4, 5, 2], 1)
    expect(Array.from(t.truncated())).toEqual([2, 4, 5])

    t.add(3)
    expect(Array.from(t.truncated())).toEqual([2, 3, 4, 5])

    t.add(1)
    expect(Array.from(t.truncated())).toEqual([1, 2, 3, 4, 5])
  })

  test('default truncates to 50% of values around median', () => {
    const t = new Truncated([])
    expect(Array.from(t.truncated())).toEqual([])

    // 1: 0 left over
    t.add(1)
    expect(Array.from(t.truncated())).toEqual([1])
    expect(t.stats.mean).to.equal(1)

    // 2 & 3: 1 left over; mod 4 == 1, so extra goes to head
    t.add(2)
    expect(Array.from(t.truncated())).toEqual([2])
    expect(t.stats.count).to.equal(1)
    expect(t.stats.mean).to.equal(2)
    t.add(3)
    expect(Array.from(t.truncated())).toEqual([2, 3])
    expect(t.stats.mean).to.equal(1 + 3 / 2) // first-1 + (length+1)/2: sum(first...first+length-1)/length

    // 4 & 5: 2 left over; split evenly to head and tail
    t.add(4)
    expect(Array.from(t.truncated())).toEqual([2, 3])
    expect(t.stats.mean).to.equal(1 + 3 / 2)
    t.add(5)
    expect(Array.from(t.truncated())).toEqual([2, 3, 4])
    expect(t.stats.mean).to.equal(1 + 4 / 2)

    // 6 & 7: 3 left over; mod 4 == 3, so extra goes to tail
    t.add(6)
    expect(Array.from(t.truncated())).toEqual([2, 3, 4])
    expect(t.stats.mean).to.equal(1 + 4 / 2)
    t.add(7)
    expect(Array.from(t.truncated())).toEqual([2, 3, 4, 5])
    expect(t.stats.mean).to.equal(1 + 5 / 2)

    // 8 & 9: 4 left over; split evenly to head and tail
    t.add(8)
    expect(Array.from(t.truncated())).toEqual([3, 4, 5, 6])
    expect(t.stats.mean).to.equal(2 + 5 / 2)
    t.add(9)
    expect(Array.from(t.truncated())).toEqual([3, 4, 5, 6, 7])
    expect(t.stats.mean).to.equal(2 + 6 / 2)

    // 10 & 11: 5 left over; mod 4 == 1, so extra goes to head
    t.add(10)
    expect(Array.from(t.truncated())).toEqual([4, 5, 6, 7, 8])
    expect(t.stats.mean).to.equal(3 + 6 / 2)
    t.add(11)
    expect(Array.from(t.truncated())).toEqual([4, 5, 6, 7, 8, 9])
    expect(t.stats.mean).to.equal(3 + 7 / 2)

    // 12 & 13: 6 left over; split evenly to head and tail
    t.add(12)
    expect(Array.from(t.truncated())).toEqual([4, 5, 6, 7, 8, 9])
    expect(t.stats.mean).to.equal(3 + 7 / 2)
    t.add(13)
    expect(Array.from(t.truncated())).toEqual([4, 5, 6, 7, 8, 9, 10])
    expect(t.stats.mean).to.equal(3 + 8 / 2)

    // 14 & 15: 7 left over; mod 4 == 3, so extra goes to tail
    t.add(14)
    expect(Array.from(t.truncated())).toEqual([4, 5, 6, 7, 8, 9, 10])
    expect(t.stats.mean).to.equal(3 + 8 / 2)
    t.add(15)
    expect(Array.from(t.truncated())).toEqual([4, 5, 6, 7, 8, 9, 10, 11])
    expect(t.stats.mean).to.equal(3 + 9 / 2)
  })
})

const closeDelta = 0.5

describe('TimingRecovery', () => {
  test('no start event gives no values', () => {
    const { period, duration, next } = new TimingRecovery([])

    expect(period).toBeNaN()
    expect(duration).toBeNaN()
    expect(next).toBeNull()
  })

  test('only start event gives no values', () => {
    const tr = new TimingRecovery(generateEvents(simpleTimings(1, 0, 0)))

    expect(tr.period).toBeNaN()
    expect(tr.duration).toBeNaN()
    expect(tr.next).toBeNull()
  })

  test('[start, stop] gives only duration', () => {
    const p = 5_000,
      d = 1_000
    const tr = new TimingRecovery(generateEvents(simpleTimings(2, p, d)))

    expect(tr.period).toBeNaN()
    expect(tr.duration).toBeCloseTo(d, closeDelta)
    expect(tr.next).toBeNull()
  })

  test('[start, stop, start] gives period, duration, and next stop', () => {
    const p = 5_000,
      d = 1_000
    const events = generateEvents(simpleTimings(3, p, d))
    const tr = new TimingRecovery(events)

    expect(tr.period).toBeCloseTo(p, closeDelta)
    expect(tr.duration).toBeCloseTo(d, closeDelta)
    expect(tr.next).to.have.property('type', 'stop')
    expect(tr.next)
      .to.have.property('date')
      .closeTo(events[0].date + d + p, closeDelta)
  })

  test('[start, stop, start, stop] gives period, duration, and next stop', () => {
    const p = 5_000,
      d = 1_000
    const events = generateEvents(simpleTimings(4, p, d))
    const tr = new TimingRecovery(events)

    expect(tr.period).toBeCloseTo(p, closeDelta)
    expect(tr.duration).toBeCloseTo(d, closeDelta)
    expect(tr.next).to.have.property('type', 'start')
    expect(tr.next)
      .to.have.property('date')
      .closeTo(events[0].date + 2 * p, closeDelta)
  })

  test('simulated start schedule drift', () => {
    const p = 5_000,
      d = 1_000
    const events = generateEvents([
      // 8 periods: 2 under-outlier, 4 counted, 2 over-outlier
      //                  t
      ...[d, p + 60], //  t + p + 60
      ...[d, p + 500], // t + 2p + 560 over
      ...[d, p], //       t + 3p + 560
      ...[d, p - 200], // t + 4p + 360
      ...[d, p - 400], // t + 5p - 40  under
      ...[d, p - 250], // t + 6p - 290 under
      ...[d, p - 100], // t + 7p - 390
      ...[d, p + 300] //  t + 8p - 90  over
    ])
    const lastStart = events[events.length - 1]

    expect(lastStart).to.have.property('type', 'start')

    const tr = new TimingRecovery(events)

    expect(tr.period).toBeCloseTo(p - 60, closeDelta)
    expect(tr.duration).toBeCloseTo(d, closeDelta)
    expect(tr.next).to.have.property('type', 'stop')
    expect(tr.next)
      .to.have.property('date')
      .closeTo(lastStart.date + tr.duration, closeDelta)
  })

  test('simulated start drift within a steady schedule', () => {
    const p = 5_000,
      d = 1_000
    const events = generateEvents([
      // 8 periods: 2 under-outlier, 4 counted, 2 over-outlier
      //                   t
      ...[d, p], //        t + p
      ...[d, p - 100], //  t + 2p - 100 under
      ...[d, p + 100], //  t + 3p       over
      ...[d, p + 250], //  t + 4p + 250 over
      ...[d, p - 50], //   t + 5p + 200
      ...[d, p - 125], //  t + 6p + 75  under
      ...[d, p - 90], //   t + 7p - 15
      ...[d, p + 16] //    t + 8p + 1
    ])
    const lastStart = events[events.length - 1]

    expect(lastStart).to.have.property('type', 'start')

    const tr = new TimingRecovery(events)

    expect(tr.period).toBeCloseTo(p - 31, closeDelta)
    expect(tr.duration).toBeCloseTo(d, closeDelta)
    expect(tr.next).to.have.property('type', 'stop')
    expect(tr.next)
      .to.have.property('date')
      .closeTo(lastStart.date + tr.duration, closeDelta)
  })

  test('simulated duration drift', () => {
    const p = 5_000,
      d = 1_000
    const events = generateEvents([
      // 8 duration: 2 under-outlier, 4 counted, 2 over-outlier
      ...[d + 99, p], //  over
      ...[d, p],
      ...[d - 60, p], //  under
      ...[d - 9, p],
      ...[d + 130, p], // over
      ...[d - 3, p],
      ...[d + 24, p],
      ...[d - 60, p] //   under
    ])
    const lastStart = events[events.length - 1]

    expect(lastStart).to.have.property('type', 'start')

    const tr = new TimingRecovery(events)

    expect(tr.period).toBeCloseTo(p, closeDelta)
    expect(tr.duration).toBeCloseTo(d + 3, closeDelta)
    expect(tr.next).to.have.property('type', 'stop')
    expect(tr.next)
      .to.have.property('date')
      .closeTo(lastStart.date + tr.duration, closeDelta)
  })

  test('simulated missed start+stop pair', () => {
    const p = 5_000,
      d = 1_000
    const events = generateEvents([
      //                      t
      ...[d, p], //           t + p
      ...[d, 2 * p + 456], // t + 2p + 456; divided into two periods of p+228; note 456 < p/10
      ...[d, p - 200] //      t + 3p + 256
    ])
    const lastStart = events[events.length - 1]

    expect(lastStart).to.have.property('type', 'start')

    const tr = new TimingRecovery(events)

    expect(tr.period).toBeCloseTo(p + 114, closeDelta) // -200 [0 228] 228
    expect(tr.duration).toBeCloseTo(d, closeDelta)
    expect(tr.next).to.have.property('type', 'stop')
    expect(tr.next)
      .to.have.property('date')
      .closeTo(lastStart.date + tr.duration, closeDelta)

    const moreEvents = generateEvents(lastStart.date, [
      //                      t + 3p + 256
      ...[d, 3 * p - 99], //  t + 6p + 157; divided into three periods of p-33
      ...[d, p - 18] //       t + 7p + 145
    ])
    const lasterStart = moreEvents[moreEvents.length - 1]

    expect(lasterStart).to.have.property('type', 'start')

    for (const event of moreEvents) tr.addEvent(event)

    expect(tr.period).toBeCloseTo(p - 21, closeDelta) // -200 -33 [-33 -33 -18 0] 228 228
    expect(tr.duration).toBeCloseTo(d, closeDelta)
    expect(tr.next).to.have.property('type', 'stop')
    expect(tr.next)
      .to.have.property('date')
      .closeTo(lasterStart.date + tr.duration, closeDelta)
  })

  test('expected period and duration are averaged in until four non-outlier samples', () => {
    const p = 5_000,
      d = 1_000
    const events = generateEvents([
      ...[d - 90, p + 100],
      ...[d + 5, p - 120],
      ...[d - 65, p - 70],
      ...[d + 70, p + 450]
    ])
    const lastStart = events[events.length - 1]

    expect(lastStart).to.have.property('type', 'start')

    const tr = new TimingRecovery(events, p, d)

    expect(tr.period).toBeCloseTo(p + 10, closeDelta) // [+0] and -120 [-70 +100] +450
    expect(tr.duration).toBeCloseTo(d - 20, closeDelta) // [+0] and -90 [-65 +5] +70
    expect(tr.next).to.have.property('type', 'stop')
    expect(tr.next)
      .to.have.property('date')
      .closeTo(lastStart.date + tr.duration, closeDelta)

    const moreEvents = generateEvents(lastStart.date, [
      ...[d - 6, p + 20],
      ...[d + 60, p - 500],
      ...[d + 50, p + 220],
      ...[d - 80, p - 94]
    ])
    const lasterStart = moreEvents[moreEvents.length - 1]

    expect(lasterStart).to.have.property('type', 'start')

    for (const event of moreEvents) tr.addEvent(event)

    expect(tr.period).toBeCloseTo(p - 11, closeDelta) // -500 -120 [-94 -70 +20 +100] +220 +450
    expect(tr.duration).toBeCloseTo(d - 4, closeDelta) // and -90 -80 [-65 -6 +5 +50] +60 +70
    expect(tr.next).to.have.property('type', 'stop')
    expect(tr.next)
      .to.have.property('date')
      .closeTo(lasterStart.date + tr.duration, closeDelta)
  })
})

describe('useTimingRecovery', () => {
  test('[start, stop, start, stop] gives period, duration, and next start', async () => {
    const event = shallowRef<Event | null>(null)
    const { period, duration, next } = useTimingRecovery(event)
    const p = 5_000,
      d = 1_000

    const events = generateEvents(simpleTimings(4, p, d))
    await pushEvents(event, events)

    expect(period.value * 1000).toBeCloseTo(p, closeDelta)
    expect(duration.value * 1000).toBeCloseTo(d, closeDelta)
    expect(next.value).to.have.property('type', 'start')
    expect(next.value)
      .to.have.property('date')
      .closeTo(events[0].date + 2 * p, closeDelta)
  })
})

function simpleTimings(count: number, period: number, duration: number) {
  const timings: number[] = []
  while (timings.length + 1 < count) {
    timings.push(duration)
    if (timings.length + 1 < count) timings.push(period)
  }
  return timings
}

function generateEvents(timings: number[]): Event[]
function generateEvents(previousStart: number, timings: number[]): Event[]
function generateEvents(timingsOrStart: number[] | number, startedTimings?: number[]) {
  const { initialStart, previousStart, timings } = (() => {
    if (typeof timingsOrStart == 'number')
      if (!startedTimings) throw new Error('must supply timings')
      else return { initialStart: false, previousStart: timingsOrStart, timings: startedTimings }
    else return { initialStart: true, previousStart: Date.now(), timings: timingsOrStart }
  })()
  // []: just a start
  // [d]: start, stop
  // [d,p]: start, stop, start
  // [d,p,d]: start, stop, start, stop
  // etc.
  const events: Event[] = []
  let lastStart = previousStart
  if (initialStart) events.push({ type: 'start', date: lastStart })
  for (let i = -1; i < timings.length; i += 2) {
    if (i > 0) {
      lastStart += timings[i]
      events.push({ type: 'start', date: lastStart })
    }
    if (i + 1 < timings.length) events.push({ type: 'stop', date: lastStart + timings[i + 1] })
  }
  return events
}

async function pushEvents(event: ShallowRef<Event | null>, events: Event[]) {
  for (const next of events) {
    event.value = next
    await nextTick()
  }
}
