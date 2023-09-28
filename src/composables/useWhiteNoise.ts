import { toRef, watch, type MaybeRefOrGetter, type Ref } from 'vue'

export default function useWhiteNoise(
  audioContext: BaseAudioContext,
  duration: number,
  gain: MaybeRefOrGetter<number> = 1
): { node: AudioNode; gain: Ref<number> } {
  const gainRef = toRef(gain)
  const noiseNode = whiteNoiseNode(audioContext, duration)
  const gainNode = new GainNode(audioContext, { gain: gainRef.value })
  noiseNode.connect(gainNode)
  watch(gainRef, (gain) => {
    gainNode.gain.setTargetAtTime(gain, audioContext.currentTime, 0.02)
  })
  noiseNode.start()
  return { gain: gainRef, node: gainNode }
}

export function whiteNoiseNode(audioContext: BaseAudioContext, duration: number) {
  const buffer = whiteNoiseBuffer(duration * audioContext.sampleRate, audioContext.sampleRate)
  const node = new AudioBufferSourceNode(audioContext, { buffer, loop: true })
  return node
}

export function whiteNoiseBuffer(length: number, sampleRate: number) {
  const buffer = new AudioBuffer({ sampleRate, length, numberOfChannels: 1 })
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1
  }
  return buffer
}
