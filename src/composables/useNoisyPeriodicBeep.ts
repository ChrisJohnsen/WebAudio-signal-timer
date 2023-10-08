import { useIntervalFn, type Pausable } from '@vueuse/core'
import { computed, toRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import useBeep from './useBeep'
import useWhiteNoise from './useWhiteNoise'

export default function useNoisyPeriodicBeep(
  audioContext: BaseAudioContext,
  snr_dB: MaybeRefOrGetter<number>,
  beep: {
    frequency: MaybeRefOrGetter<number>
    duration: MaybeRefOrGetter<number>
    period: MaybeRefOrGetter<number>
  },
  gain: MaybeRefOrGetter<number> = 1
): {
  pause: Pausable
  node: AudioNode
  gainParam: AudioParam
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

  const gainRef = toRef(gain)
  const gainNode = new GainNode(audioContext, { gain: gainRef.value })
  watch(gainRef, (newGain) => gainNode.gain.setTargetAtTime(newGain, audioContext.currentTime, 0.2))

  noise.node.connect(gainNode)
  beeper.node.connect(gainNode)

  const pause = useIntervalFn(
    () => beeper.beep(toValue(beep.duration)),
    computed(() => 1000 * toRef(beep.period).value),
    { immediate: true }
  )
  return { pause, node: gainNode, gainParam: gainNode.gain }
}
