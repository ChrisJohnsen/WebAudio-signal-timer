import {
  computed,
  readonly,
  ref,
  toRef,
  toValue,
  watch,
  type DeepReadonly,
  type MaybeRefOrGetter,
  type Ref
} from 'vue'
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

  const centerBin = computed(() => binFor(toValue(signalCenterFrequency)))
  const startBin = computed(() => {
    const startBin = binFor(toValue(signalCenterFrequency) - signalTestHalfBandwidthRef.value)
    return Math.max(0, Math.min(centerBin.value - 1, startBin))
  })
  const endBin = computed(() => {
    const endBin = binFor(toValue(signalCenterFrequency) + signalTestHalfBandwidthRef.value)
    return Math.min(frequencyBinCount.value - 1, Math.max(centerBin.value + 1, endBin))
  })

  const peakSignal = ref(-Infinity)
  const signal = ref(-Infinity)
  const noise = ref(-Infinity)
  watch(
    frequencyData,
    (frequencyData) => {
      const otherBins = Array.from(frequencyData) // "other" starts with all, but we splice out the test bins
      const testBins = otherBins.splice(startBin.value, endBin.value + 1 - startBin.value)

      peakSignal.value = testBins.reduce((m, p) => Math.max(m, p), -Infinity)
      signal.value = dBAverage(testBins)
      noise.value = dBAverage(otherBins)
    },
    { immediate: true }
  )

  const snr = computed(() => signal.value - noise.value)
  const detected = computed(() => snr.value > toValue(detectionSNR))

  return {
    testBand: computed(() => ({
      low: forBin(startBin.value).low,
      high: forBin(endBin.value).high
    })),
    snr,
    peakSignal: readonly(peakSignal),
    signal: readonly(signal),
    noise: readonly(noise),
    detected
  }
}

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
