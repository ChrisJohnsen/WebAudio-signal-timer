import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'

export default function useBins(
  binCount: MaybeRefOrGetter<number>,
  low: MaybeRefOrGetter<number>,
  high: MaybeRefOrGetter<number>
): {
  binFor: (value: MaybeRefOrGetter<number>) => ComputedRef<number>
  forBin: (bin: MaybeRefOrGetter<number>) => ComputedRef<{ low: number; high: number }>
} {
  const binWidth = computed(() => (toValue(high) - toValue(low)) / toValue(binCount))
  return {
    binFor: (value) => {
      return computed(() =>
        Math.max(
          0,
          Math.min(
            toValue(binCount) - 1,
            Math.trunc((toValue(value) - toValue(low)) / binWidth.value)
          )
        )
      )
    },
    forBin: (bin) => {
      return computed(() => {
        const binValue = toValue(bin)
        return {
          low: binWidth.value * binValue,
          high: binWidth.value * (binValue + 1)
        }
      })
    }
  }
}
