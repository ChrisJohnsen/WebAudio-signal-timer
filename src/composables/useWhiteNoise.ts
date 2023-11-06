import {
  onScopeDispose,
  shallowReadonly,
  shallowRef,
  toRef,
  watch,
  type MaybeRefOrGetter,
  type Ref,
  type ShallowRef
} from 'vue'

export default function useWhiteNoise(
  audioContext: MaybeRefOrGetter<BaseAudioContext>,
  duration: number,
  gain: MaybeRefOrGetter<number> = 1
): { node: Readonly<ShallowRef<AudioNode>>; gain: Ref<number>; shutdown: () => void } {
  const audioContextRef = toRef(audioContext),
    gainRef = toRef(gain)

  const state = setupNoiseNodes(audioContextRef.value, duration, gainRef.value)

  watch(audioContextRef, (audioContext) => {
    stopNoiseNodes(state)
    setupNoiseNodes(audioContext, duration, gainRef.value, state)
  })
  watch(gainRef, (gain) => {
    const {
      gain: gainParam,
      context: { currentTime }
    } = state.gainNodeRef.value
    gainParam.setTargetAtTime(gain, currentTime, 0.02)
  })

  const shutdown = () => stopNoiseNodes(state)
  onScopeDispose(shutdown)

  return {
    gain: gainRef,
    node: shallowReadonly(state.gainNodeRef),
    shutdown
  }
}
type State = {
  buffer: AudioBuffer
  noiseNode: AudioBufferSourceNode
  gainNodeRef: ShallowRef<GainNode>
}
function setupNoiseNodes(
  audioContext: BaseAudioContext,
  duration: number,
  gain: number,
  state?: State
): State {
  const buffer =
    state && audioContext.sampleRate == state.buffer.sampleRate
      ? state.buffer
      : whiteNoiseBuffer(duration, audioContext.sampleRate)
  const noiseNode = new AudioBufferSourceNode(audioContext, { buffer, loop: true })
  const gainNode = new GainNode(audioContext, { gain })
  noiseNode.connect(gainNode)
  noiseNode.start()

  if (state) {
    state.buffer = buffer
    state.noiseNode = noiseNode
    state.gainNodeRef.value = gainNode
  } else state = { buffer, noiseNode, gainNodeRef: shallowRef(gainNode) }

  return state
}
function stopNoiseNodes(state: State) {
  state.noiseNode.stop()
  state.noiseNode.disconnect()
  state.gainNodeRef.value.disconnect()
}

export function whiteNoiseNode(audioContext: BaseAudioContext, duration: number) {
  const buffer = whiteNoiseBuffer(duration, audioContext.sampleRate)
  const node = new AudioBufferSourceNode(audioContext, { buffer, loop: true })
  return node
}

export function whiteNoiseBuffer(duration: number, sampleRate: number) {
  const length = Math.ceil(duration * sampleRate)
  const buffer = new AudioBuffer({ sampleRate, length, numberOfChannels: 1 })
  const gain = 10 ** ((28 - 13) / 20) // [-1,1] random seems to give a signal with -28dB (power), so apply gain to put it up near -13dB (where our full-amplitude beep signal lands)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * gain
  }
  return buffer
}
