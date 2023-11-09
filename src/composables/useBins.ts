import { computed, toValue, type MaybeRefOrGetter } from 'vue'

function useBinsWithOptions(
  binCount: MaybeRefOrGetter<number>,
  low: MaybeRefOrGetter<number>,
  high: MaybeRefOrGetter<number>,
  options?: { round: boolean; clampBin: boolean }
): {
  binFor: (value: number) => number
  forBin: (bin: number) => { low: number; high: number }
} {
  const binWidth = computed(() => (toValue(high) - toValue(low)) / toValue(binCount))
  const clampBin = (bin: number) =>
    options?.clampBin ? Math.max(0, Math.min(toValue(binCount) - 1, bin)) : bin
  const round = options?.round ? 0.5 : 0
  return {
    binFor: (value) => clampBin(Math.trunc((value - toValue(low)) / binWidth.value + round)),
    forBin: (bin) => {
      const binValue = Math.trunc(bin) - round
      return {
        low: binWidth.value * clampBin(binValue),
        high: binWidth.value * clampBin(binValue + 1)
      }
    }
  }
}

export function useBins(
  binCount: MaybeRefOrGetter<number>,
  low: MaybeRefOrGetter<number>,
  high: MaybeRefOrGetter<number>,
  clampBin: boolean = true
): {
  binFor: (value: number) => number
  forBin: (bin: number) => { low: number; high: number }
} {
  return useBinsWithOptions(binCount, low, high, { round: false, clampBin })
}

export function useFFTBins(
  binCount: MaybeRefOrGetter<number>,
  low: MaybeRefOrGetter<number>,
  high: MaybeRefOrGetter<number>
): {
  binFor: (value: number) => number
  forBin: (bin: number) => { low: number; high: number }
} {
  return useBinsWithOptions(binCount, low, high, { round: true, clampBin: true })
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
