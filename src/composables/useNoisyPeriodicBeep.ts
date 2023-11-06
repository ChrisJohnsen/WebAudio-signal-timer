import { useTimeoutFn, type Stoppable } from '@vueuse/core'
import gaussian from 'gaussian'
import {
  computed,
  isRef,
  onScopeDispose,
  ref,
  shallowReadonly,
  shallowRef,
  toRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
  type ShallowRef
} from 'vue'
import useBeep from './useBeep'
import useWhiteNoise from './useWhiteNoise'

export default function useNoisyPeriodicBeep(
  audioContext: MaybeRefOrGetter<BaseAudioContext>,
  snr_dB: MaybeRefOrGetter<number>,
  beep: {
    frequency: MaybeRefOrGetter<number>
    duration:
      | MaybeRefOrGetter<number>
      | { mean: MaybeRefOrGetter<number>; stddev: MaybeRefOrGetter<number> }
    period:
      | MaybeRefOrGetter<number>
      | { mean: MaybeRefOrGetter<number>; stddev: MaybeRefOrGetter<number> }
  }
): {
  stop: Stoppable
  node: Readonly<ShallowRef<AudioNode>>
  shutdown: () => void
} {
  const snr_dB_ref = toRef(snr_dB)
  // SNR is power/power, which is also (amplitude/amplitude)^2
  // SNR = P_sig/P_noise = (A_sig/A_noise)^2
  // SNR_dB = 10*log10(SNR)
  // A_sig = 1
  // SNR = A_noise^(-2)
  // A_noise = SNR^(-1/2)
  // A_noise = 10^(-SNR_dB/20)
  const noise = useWhiteNoise(
    audioContext,
    5,
    computed(() => 10 ** (-snr_dB_ref.value / 20))
  )
  const beeper = useBeep(audioContext, beep.frequency)

  const gainNode = shallowRef(undefined as unknown as GainNode)
  watch(
    [noise.node, beeper.node],
    ([noise, beeper], [oldNoise, oldBeeper]) => {
      if (oldNoise && oldNoise != noise) oldNoise.disconnect()
      if (oldBeeper && oldBeeper != beeper) oldBeeper.disconnect()

      const newGain = new GainNode(noise.context, { gain: 1 }) // just a node to mix the noise and beep nodes

      noise.connect(newGain)
      beeper.connect(newGain)

      gainNode.value = newGain
    },
    { immediate: true }
  )

  const getRandomPeriod = computedGetterForRandomValue(beep.period)
  const period = ref(getRandomPeriod.value())
  const getRandomDuration = computedGetterForRandomValue(beep.duration)

  const stop = useTimeoutFn(
    () => {
      beeper.beep(getRandomDuration.value())
      period.value = getRandomPeriod.value()
      stop.start()
    },
    () => 1000 * period.value
  )

  const shutdown = () => {
    stop.stop()
    noise.node.value.disconnect()
    noise.shutdown()
    beeper.node.value.disconnect()
    beeper.shutdown()
    gainNode.value.disconnect()
  }
  onScopeDispose(shutdown)

  return { stop, node: shallowReadonly(gainNode), shutdown }
}

function computedGetterForRandomValue(
  valueSpec:
    | MaybeRefOrGetter<number>
    | { mean: MaybeRefOrGetter<number>; stddev: MaybeRefOrGetter<number> }
) {
  if (typeof valueSpec == 'number' || isRef(valueSpec) || typeof valueSpec == 'function')
    return computed(() => () => toValue(valueSpec))

  return computed(() => {
    const g = gaussian(toValue(valueSpec.mean), toValue(valueSpec.stddev))
    return () => g.random(1)[0]
  })
}
