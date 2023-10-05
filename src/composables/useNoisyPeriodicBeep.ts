import { useIntervalFn, type Pausable } from '@vueuse/core'
import { computed, toRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import useBeep from './useBeep'
import useWhiteNoise from './useWhiteNoise'

export default function useNoisyPeriodicBeep(
  audioContext: BaseAudioContext,
  snr: MaybeRefOrGetter<number>,
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
  const snrRef = toRef(snr)
  const noise = useWhiteNoise(
    audioContext,
    5,
    computed(() => 1 / snrRef.value)
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
