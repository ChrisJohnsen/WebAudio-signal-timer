import { readonly, ref, toRef, watch, type MaybeRefOrGetter, type Ref } from 'vue'

export default function useBeep(
  audioContext: BaseAudioContext,
  frequency: MaybeRefOrGetter<number>
): {
  node: AudioNode
  beeping: Readonly<Ref<boolean>>
  beep: (duration?: number, onDone?: () => void) => void
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
): (duration?: number, onDone?: () => void) => void {
  return (duration = 1, onDone) => {
    if (beeping.value) return
    try {
      const rampTime = 0.1
      if (duration < 2 * rampTime) {
        duration = rampTime * 2
        console.warn(`too-short beep duration extended to ${duration}`)
      }

      const startTime = audioContext.currentTime
      const endTime = startTime + duration

      const rampUpTime = startTime + rampTime
      const rampDownTime = endTime - rampTime

      beeping.value = true

      gp.setValueAtTime(0, startTime)
      gp.linearRampToValueAtTime(1, rampUpTime)
      gp.setValueAtTime(1, rampDownTime)
      gp.linearRampToValueAtTime(0, endTime)

      atAudioTime(audioContext, endTime, () => {
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
