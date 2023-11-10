import { computed, toValue, type MaybeRefOrGetter } from 'vue'

type Bins = {
  binFor: (value: number) => number
  forBin: (bin: number) => {
    low: number
    high: number
  }
}

// this can be reactive if the getters access trackable values, but it does not introduce new effects
function binsWithOptions(
  binCount: () => number,
  binWidth: () => number,
  low: () => number,
  options?: { round: boolean; clampBin: boolean }
): Bins {
  const clampBin = (bin: number) =>
    options?.clampBin ? Math.max(0, Math.min(binCount() - 1, bin)) : bin
  const round = options?.round ? 0.5 : 0
  return {
    binFor: (value) => clampBin(Math.trunc((value - low()) / binWidth() + round)),
    forBin: (bin) => {
      const binValue = Math.trunc(bin) - round
      return {
        low: binWidth() * clampBin(binValue),
        high: binWidth() * clampBin(binValue + 1)
      }
    }
  }
}
function reactiveBinsWithOptions(
  binCount: MaybeRefOrGetter<number>,
  low: MaybeRefOrGetter<number>,
  high: MaybeRefOrGetter<number>,
  options?: { round: boolean; clampBin: boolean }
) {
  const binWidth = computed(() => (toValue(high) - toValue(low)) / toValue(binCount))
  return binsWithOptions(
    () => toValue(binCount),
    () => binWidth.value,
    () => toValue(low),
    options
  )
}

export function useBins(
  binCount: MaybeRefOrGetter<number>,
  low: MaybeRefOrGetter<number>,
  high: MaybeRefOrGetter<number>,
  clampBin: boolean = true
) {
  return reactiveBinsWithOptions(binCount, low, high, { round: false, clampBin })
}
export function bins(binCount: number, low: number, high: number, clampBin: boolean = true) {
  return binsWithOptions(
    () => binCount,
    () => (high - low) / binCount,
    () => low,
    { round: false, clampBin }
  )
}

export function useFFTBins(
  binCount: MaybeRefOrGetter<number>,
  low: MaybeRefOrGetter<number>,
  high: MaybeRefOrGetter<number>
) {
  return reactiveBinsWithOptions(binCount, low, high, { round: true, clampBin: true })
}

export function useFFTPixelBins(
  frequencyBinCount: MaybeRefOrGetter<number>,
  sampleRate: MaybeRefOrGetter<number>,
  pixels: MaybeRefOrGetter<number>,
  minFrequency: MaybeRefOrGetter<number>,
  maxFrequency: MaybeRefOrGetter<number>
) {
  const bandForBin = useFFTBins(frequencyBinCount, 0, () => toValue(sampleRate) / 2).forBin
  const pixelForFrequency = useBins(pixels, minFrequency, maxFrequency, false).binFor
  return (frequencyBin: number) => {
    const { low: startFrequency, high: stopFrequency } = bandForBin(frequencyBin)
    const startPixel = pixelForFrequency(startFrequency)
    const stopPixel = pixelForFrequency(stopFrequency)
    return { start: startPixel, count: stopPixel - startPixel }
  }
}
