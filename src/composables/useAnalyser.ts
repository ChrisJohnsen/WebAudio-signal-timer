import { useIntervalFn } from '@vueuse/core'
import {
  computed,
  readonly,
  ref,
  shallowReadonly,
  shallowRef,
  toRef,
  toValue,
  watch,
  type DeepReadonly,
  type MaybeRefOrGetter,
  type Ref,
  type ShallowRef
} from 'vue'

export default function useAnalyser(
  inputs: MaybeRefOrGetter<AudioNode[]>,
  publishPeriod: MaybeRefOrGetter<number>
): {
  sampleRate: Readonly<Ref<number>>
  frequencyBinCount: Readonly<Ref<number>>
  data: DeepReadonly<ShallowRef<Float32Array>>
  minimumPublishPeriod: Readonly<Ref<number>>
} {
  const inputsRef = toRef(inputs)
  const samplePeriod = 0.1 // seconds
  const minimumPublishPeriod = samplePeriod * 2
  const publishPeriodRef = computed(() => Math.min(minimumPublishPeriod, toValue(publishPeriod)))
  const sampleRateRef = ref(48000)

  const fftSize = 512
  const length = fftSize / 2
  const sampleArray = new Float32Array(length)
  let collectionArray = new Float32Array(length).fill(-Infinity)
  let lastPublish = 0
  const publishedArrayRef = shallowRef(new Float32Array(length).fill(-Infinity))

  let currentAnalyser: AnalyserNode | undefined
  const samplingPauser = useIntervalFn(
    () => {
      if (!currentAnalyser) {
        samplingPauser.pause()
        return
      }

      currentAnalyser.getFloatFrequencyData(sampleArray)
      for (let i = 0; i < length; i++)
        collectionArray[i] = Math.max(collectionArray[i], sampleArray[i])

      const now = Date.now()
      if (now - lastPublish >= publishPeriodRef.value * 1000) publish(now)
    },
    samplePeriod * 1000,
    { immediate: false, immediateCallback: true }
  )
  function publish(now = Date.now()) {
    ;[collectionArray, publishedArrayRef.value] = [publishedArrayRef.value, collectionArray]
    collectionArray.fill(-Infinity)
    lastPublish = now
  }

  watch(
    inputsRef,
    (newInputs, oldInputs) => {
      if (currentAnalyser && oldInputs) {
        const newSet = new Set(newInputs)
        for (const input of oldInputs) if (!newSet.has(input)) input.disconnect(currentAnalyser)
      }

      const analyser = getAnalyser(newInputs[0]?.context)
      samplingPauser.resume()

      if (analyser) for (const input of newInputs) input.connect(analyser)
    },
    { immediate: true }
  )

  return {
    sampleRate: shallowReadonly(sampleRateRef),
    frequencyBinCount: shallowReadonly(ref(length)),
    data: readonly(publishedArrayRef),
    minimumPublishPeriod: readonly(ref(minimumPublishPeriod)) // static for now
  }

  function getAnalyser(audioContext: BaseAudioContext | undefined): AnalyserNode | undefined {
    if (currentAnalyser?.context == audioContext) return currentAnalyser

    if (!audioContext) return (currentAnalyser = undefined)

    if (lastPublish != 0) publish()

    const analyser = new AnalyserNode(audioContext, { fftSize, smoothingTimeConstant: 0 })
    sampleRateRef.value = audioContext.sampleRate

    audioContext.addEventListener('statechange', () => {
      if (audioContext.state == 'running') samplingPauser.resume()
      else samplingPauser.pause()
    })

    return (currentAnalyser = analyser)
  }
}
