import { readonly, ref, toRef, watch, type MaybeRefOrGetter, type Ref } from 'vue'

export default function useBeep(
  audioContext: BaseAudioContext,
  frequency: MaybeRefOrGetter<number>
): {
  node: AudioNode
  beeping: Readonly<Ref<boolean>>
  beep: (onDone?: () => void) => void
} {
  const frequencyRef = toRef(frequency)
  const oscillator = new OscillatorNode(audioContext, {
    type: 'sine',
    frequency: frequencyRef.value
  })

  const ftc = 0.02
  watch(frequencyRef, (newFrequency) => {
    oscillator.frequency.setTargetAtTime(newFrequency, audioContext.currentTime, ftc)
  })

  const gain = new GainNode(audioContext, { gain: 0 })
  oscillator.connect(gain)
  oscillator.start()

  const beeping = ref(false)

  return {
    node: gain,
    beeping: readonly(beeping),
    beep: beep(audioContext, gain.gain, beeping)
  }
}

function beep(
  audioContext: BaseAudioContext,
  gp: AudioParam,
  beeping: Ref<boolean>
): (onDone?: () => void) => void {
  return (onDone) => {
    if (beeping.value) return
    try {
      const startTime = audioContext.currentTime
      const duration = 1
      const tc = 0.02
      const rampTime = 5 * tc

      beeping.value = true
      // ramp up
      gp.setTargetAtTime(1, startTime, tc)

      atAudioTime(audioContext, startTime + rampTime, (unmutedTime) => {
        // stop changes, fully unmuted
        gp.cancelScheduledValues(unmutedTime)
        gp.setValueAtTime(1, unmutedTime)
      })

      atAudioTime(audioContext, startTime + duration - rampTime, (rampDownTime) => {
        // ramp down
        gp.setTargetAtTime(0, rampDownTime, tc)
      })

      atAudioTime(audioContext, startTime + duration, (mutedTime) => {
        // stop changes, fully muted
        gp.cancelScheduledValues(mutedTime)
        gp.setValueAtTime(0, mutedTime)
        beeping.value = false
        onDone?.()
      })
    } catch (e) {
      console.error(e)
      beeping.value = false
      onDone?.()
    }
  }

  function atAudioTime(
    audioContext: BaseAudioContext,
    requestedTime: number,
    fn: (currentTime: number, requestedTime: number) => void
  ) {
    const timer = new ConstantSourceNode(audioContext)
    timer.addEventListener('ended', () => fn(audioContext.currentTime, requestedTime))
    timer.start(requestedTime - 0.1)
    timer.stop(requestedTime)
  }
}
