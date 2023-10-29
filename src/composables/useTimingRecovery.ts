import { computed, ref, toRef, toValue, watch, type MaybeRefOrGetter, type ShallowRef } from 'vue'

export type Event = { type: 'start' | 'stop'; date: number } // Date instead of number?

export default function useTimingRecovery(
  event: Readonly<ShallowRef<Event | null>>,
  expectedPeriod?: MaybeRefOrGetter<number | undefined>,
  expectedDuration?: MaybeRefOrGetter<number | undefined>
) {
  const recovery = new TimingRecovery(
    [],
    toMilliValue(expectedPeriod),
    toMilliValue(expectedDuration)
  )

  const updated = ref(false)
  const update = (...ignored: unknown[]) => void ((updated.value = !updated.value), ignored)
  const whenUpdated = <T>(fn: () => T) => computed(() => (updated.value, fn()))

  const duration = whenUpdated(() => recovery.duration / 1000)
  const period = whenUpdated(() => recovery.period / 1000)
  const next = whenUpdated(() => recovery.next)
  const reset = () => update(recovery.reset())

  watch(event, (event) => event && update(recovery.addEvent(event)), { immediate: true })
  watch([toRef(expectedPeriod), toRef(expectedDuration)], ([period, duration]) =>
    update(recovery.setExpected(toMilli(period), toMilli(duration)))
  )

  return { reset, period, duration, next }

  function toMilli(secs: number | undefined) {
    return secs && 1000 * secs
  }
  function toMilliValue(secs: MaybeRefOrGetter<number | undefined> | undefined) {
    return toMilli(toValue(secs))
  }
}

const expectedMaxSamples = 4 // if we have fewer period/duration samples, then the "expected" value is factored in (if given)
export class TimingRecovery {
  private events: Readonly<Event>[]
  constructor(
    events: readonly Readonly<Event>[],
    private expectedPeriod?: number,
    private expectedDuration?: number
  ) {
    this.events = this._reset(events)
  }
  public reset(events: readonly Readonly<Event>[] = []) {
    this._reset(events)
  }
  private _reset(events: readonly Readonly<Event>[]) {
    this.lastStart = NaN
    this.periods = new Truncated()
    this.durations = new Truncated()
    this.events = Array.from(events)
    for (const event of this.events) this.processEvent(event)
    return this.events
  }

  private lastStart = NaN
  private periods = new Truncated()
  private durations = new Truncated()
  private processEvent(event: Event) {
    if (event.type == 'start') {
      if (!isNaN(this.lastStart)) {
        const period = event.date - this.lastStart

        const expectedPeriod = this.period
        const multiplier = period / expectedPeriod
        const integerMultiple = Math.round(multiplier)
        const allowableMultipleOffset = Math.max(this.periods.stats.stddev / expectedPeriod, 0.1)
        if (Math.abs(integerMultiple - multiplier) <= allowableMultipleOffset) {
          const syntheticPeriod = period / integerMultiple
          for (let i = 0; i < integerMultiple; i++) this.periods.add(syntheticPeriod)
        } else this.periods.add(event.date - this.lastStart)
      }
      this.lastStart = event.date
    } else if (event.type == 'stop') {
      if (!isNaN(this.lastStart)) this.durations.add(event.date - this.lastStart)
    }
  }

  public addEvent(event: Readonly<Event>) {
    const { type, date } = event
    const ourEvent = { type, date }
    this.events.push(ourEvent)
    this.processEvent(ourEvent)
  }
  public setExpected(expectedPeriod?: number, expectedDuration?: number) {
    this.expectedPeriod = expectedPeriod
    this.expectedDuration = expectedDuration
  }

  public get period() {
    if (this.expectedPeriod != null && this.periods.stats.count < expectedMaxSamples)
      return this.periods.stats.clone().add(this.expectedPeriod).mean
    else return this.periods.stats.mean
  }
  public get duration() {
    if (this.expectedDuration != null && this.durations.stats.count < expectedMaxSamples)
      return this.durations.stats.clone().add(this.expectedDuration).mean
    else return this.durations.stats.mean
  }
  public get next(): Event | null {
    if (this.events.length <= 0) return null
    const prevEvent = this.events[this.events.length - 1]
    if (prevEvent.type == 'stop' && isFinite(this.period))
      return {
        type: 'start',
        date: this.lastStart + this.period
      }
    else if (prevEvent.type == 'start' && isFinite(this.duration))
      return {
        type: 'stop',
        date: this.lastStart + this.duration
      }
    return null
  }
}

export interface StatValues {
  readonly count: number
  readonly mean: number
  readonly variance: number
  readonly stddev: number
}

// Welford's online algorithm https://en.wikipedia.org/wiki/Standard_deviation#Rapid_calculation_methods
// spell-checker: word Welford
export class Stats implements StatValues {
  private n = 0
  private a = 0
  private q = 0
  public constructor(values: Iterable<number> = []) {
    for (const value of values) this.add(value)
  }
  public clone() {
    const clone = new Stats()
    clone.n = this.n
    clone.a = this.a
    clone.q = this.q
    return clone
  }
  public readonly(): StatValues & { clone(): Stats } {
    const self = this
    return {
      get count() {
        return self.count
      },
      get mean() {
        return self.mean
      },
      get variance() {
        return self.variance
      },
      get stddev() {
        return self.stddev
      },
      clone() {
        return self.clone()
      }
    }
  }

  public add(value: number) {
    this.n++

    const delta = value - this.a
    // A_k = A_k-1 + (x_k - A_k-1) / k
    this.a += delta / this.n

    const newDelta = value - this.a
    // Q_k = Q_k-1 + (x_k - A_k-1)(x_k - A_k)
    this.q += delta * newDelta

    return this
  }
  remove(value: number) {
    if (this.n == 0) throw new Error('unable to remove value from no values')

    this.n--
    if (this.n == 0) {
      this.a = 0
      this.q = 0
      return
    }

    const newDelta = value - this.a
    // A_k-1 = A_k - (x_k - A_k) / (k - 1)
    this.a -= newDelta / this.n

    const delta = value - this.a
    // Q_k-1 = Q_k - (x_k - A_k-1)(x_k - A_k)
    this.q -= delta * newDelta

    return this
  }

  get count() {
    return this.n
  }
  get mean() {
    if (this.n < 1) return NaN
    return this.a
  }
  get variance() {
    return this.q / this.n
  }
  get stddev() {
    return Math.sqrt(this.variance)
  }
}

export class Truncated {
  private values: number[]
  private allStats: Stats
  private centralFraction: number
  private centralStats: Stats
  public constructor(values: readonly number[] = [], centralFraction: number = 0.5) {
    this.values = values.slice().sort((a, b) => a - b)
    this.allStats = new Stats(this.values)
    this.centralFraction = Math.min(1, Math.max(0.05, Math.abs(centralFraction)))
    this.centralStats = new Stats(this.truncated())
  }
  public add(value: number) {
    const range = this.centralRange()
    const insertionIndex = indexForInsertion(value, this.values)
    this.values.splice(insertionIndex, 0, value)

    if (insertionIndex < range.start) {
      range.start++
      range.end++
    } else if (insertionIndex < range.end) {
      this.centralStats.add(value)
      range.end++
    }
    this.adjustCentralStats(range)

    function indexForInsertion(value: number, values: readonly number[]) {
      let low = 0,
        high = values.length
      while (low < high) {
        const mid = (low + high) >>> 1
        if (value < values[mid]) high = mid
        else low = mid + 1
      }
      return high
    }
  }

  private adjustCentralStats(previous: Range = this.centralRange()) {
    const current = this.centralRange()

    //           P
    // ... o o o v v v v v ... previous in-liers values
    //           R R           R was v, needs to be o
    // ... o o o o o v v v ... current in-liers values
    //               C
    for (let i = previous.start; i < current.start; i++) this.centralStats.remove(this.values[i])

    //               P
    // ... o o o o o v v v ... previous in-liers values
    //           A A           A was o, needs to be v
    // ... o o o v v v v v ... current in-liers values
    //           C
    for (let i = current.start; i < previous.start; i++) this.centralStats.add(this.values[i])

    //               P
    // ... v v v v v o o o ... previous in-liers values
    //           R R           R was v, needs to be o
    // ... v v v o o o o o ... current in-liers value
    //           C
    for (let i = current.end; i < previous.end; i++) this.centralStats.remove(this.values[i])

    //           P
    // ... v v v o o o o o ... previous in-liers value
    //           A A           A was o, needs to be v
    // ... v v v v v o o o ... current in-liers values
    //               C
    for (let i = previous.end; i < current.end; i++) this.centralStats.add(this.values[i])
  }
  private centralRange(): Range {
    const forLength = this.values.length
    const forFraction = this.centralFraction

    const leftoverCount = forLength - Math.ceil(forLength * forFraction)
    const split = leftoverCount >>> 1
    const extra = leftoverCount & 1
    const extraToHead = (leftoverCount & 3) == 1

    const below = split + (extraToHead ? extra : 0)
    const above = split + (extraToHead ? 0 : extra)
    return { start: below, end: this.values.length - above }
  }

  public truncated() {
    const { start, end } = this.centralRange()
    return this.values.slice(start, end)[Symbol.iterator]()
  }
  public get fullStats() {
    return this.allStats.readonly()
  }
  public get stats() {
    return this.centralStats.readonly()
  }
}
interface Range {
  start: number
  end: number
}
