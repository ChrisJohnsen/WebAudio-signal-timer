import {
  onScopeDispose,
  readonly,
  ref,
  shallowReadonly,
  shallowRef,
  toRef,
  watch,
  type MaybeRefOrGetter,
  type Ref,
  type ShallowRef
} from 'vue'

export default function useBeep(
  audioContext: MaybeRefOrGetter<BaseAudioContext>,
  frequency: MaybeRefOrGetter<number>
): {
  node: Readonly<ShallowRef<AudioNode>>
  beeping: Readonly<Ref<boolean>>
  beep: (duration?: number, onDone?: () => void) => void
  shutdown: () => void
} {
  const audioContextRef = toRef(audioContext),
    frequencyRef = toRef(frequency)
  const state = setupBeepNodes(audioContextRef.value, frequencyRef.value)

  watch(audioContextRef, (audioContext) => {
    stopBeepNodes(state)
    setupBeepNodes(audioContext, frequencyRef.value, state)
  })

  const ftc = 0.02
  watch(frequencyRef, (newFrequency) => {
    const {
      frequency,
      context: { currentTime }
    } = state.oscillatorNode
    frequency.setTargetAtTime(newFrequency, currentTime, ftc)
  })

  const beeping = ref(false)

  const shutdown = () => stopBeepNodes(state)
  onScopeDispose(shutdown)

  return {
    node: shallowReadonly(state.gainNodeRef),
    beeping: readonly(beeping),
    beep: beep(state.gainNodeRef, beeping),
    shutdown
  }
}
type State = { oscillatorNode: OscillatorNode; gainNodeRef: ShallowRef<GainNode> }
function setupBeepNodes(audioContext: BaseAudioContext, frequency: number, state?: State): State {
  const oscillatorNode = new OscillatorNode(audioContext, { type: 'sine', frequency })

  const gainNode = new GainNode(audioContext, { gain: 0 })
  oscillatorNode.connect(gainNode)
  oscillatorNode.start()

  if (state) {
    state.oscillatorNode = oscillatorNode
    state.gainNodeRef.value = gainNode
  } else state = { oscillatorNode: oscillatorNode, gainNodeRef: shallowRef(gainNode) }

  return state
}
function stopBeepNodes(state: State) {
  state.oscillatorNode.stop()
  state.oscillatorNode.disconnect()
  state.gainNodeRef.value.disconnect()
}

function beep(
  { value: { context: audioContext, gain: gp } }: ShallowRef<GainNode>,
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
    const timer = new ConstantSourceNode(audioContext, { offset: 0 })
    timer.connect(audioContext.destination)
    const ended = () => {
      fn(audioContext.currentTime, requestedTime)
      timer.disconnect()
      timer.removeEventListener('ended', ended)
    }
    timer.addEventListener('ended', ended)
    timer.start(requestedTime - 0.1)
    timer.stop(requestedTime)
  }
}
