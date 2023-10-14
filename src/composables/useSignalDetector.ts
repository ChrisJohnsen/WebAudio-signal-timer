import { computed, toRef, toValue, type DeepReadonly, type MaybeRefOrGetter, type Ref } from 'vue'
import { useFFTBins } from './useBins'

export default function useSignalDetector(
  samplingRate: Readonly<Ref<number>>,
  frequencyBinCount: Readonly<Ref<number>>,
  frequencyData: DeepReadonly<Ref<Float32Array>>,
  signalCenterFrequency: MaybeRefOrGetter<number>,
  signalTestBandwidth: MaybeRefOrGetter<number>,
  detectionSNR: MaybeRefOrGetter<number>
) {
  const signalTestHalfBandwidthRef = ((bw) => computed(() => Math.abs(bw.value) / 2))(
    toRef(signalTestBandwidth)
  )
  const { binFor, forBin } = useFFTBins(frequencyBinCount, 0, () => samplingRate.value / 2)

  const centerBin = binFor(signalCenterFrequency)
  const startBin = computed(() => {
    const startBin = binFor(toValue(signalCenterFrequency) - signalTestHalfBandwidthRef.value)
    return Math.max(0, Math.min(centerBin.value - 1, startBin.value))
  })
  const endBin = computed(() => {
    const endBin = binFor(toValue(signalCenterFrequency) + signalTestHalfBandwidthRef.value)
    return Math.min(frequencyBinCount.value - 1, Math.max(centerBin.value + 1, endBin.value))
  })

  const snr = computed(() => {
    const otherBins = Array.from(frequencyData.value) // "other" starts with all, but we splice out the test bins
    const testBins = otherBins.splice(startBin.value, endBin.value + 1 - startBin.value)

    return dBAverage(testBins) - dBAverage(otherBins)
  })
  const detected = computed(() => snr.value > toValue(detectionSNR))

  function linearAverage(data: Readonly<Array<number>>, weights?: Readonly<Array<number>>) {
    return (
      data.reduce((t, p, i) => t + p * (weights?.[i] ?? 1), 0) /
      (weights?.reduce((t, w) => t + w, 0) ?? data.length)
    )
  }
  function dBAverage(data: Readonly<Array<number>>, weights?: Readonly<Array<number>>) {
    return (
      10 *
      Math.log10(
        linearAverage(
          data.map((p) => 10 ** (p / 10)),
          weights
        )
      )
    )
  }

  return {
    testBand: computed(() => ({
      low: forBin(startBin).value.low,
      high: forBin(endBin).value.high
    })),
    snr,
    detected
  }
}
