<script setup lang="ts">
import { ref, computed } from 'vue'

const started = ref(false)
const startStopText = computed(() => (started.value ? 'Stop Audio' : 'Start Audio'))
const beeping = ref(false)

let audioContext: AudioContext | undefined
let gainParam: AudioParam | undefined

const startStop = () => {
  if (started.value) return stop()
  if (audioContext) return start()

  audioContext = new AudioContext()
  const tone = new OscillatorNode(audioContext, { type: 'sine', frequency: 440 })
  const gain = new GainNode(audioContext, { gain: 0 })
  gainParam = gain.gain

  tone.connect(gain)
  gain.connect(audioContext.destination)

  tone.start()
  start()

  function start() {
    if (!audioContext) return
    started.value = true
    audioContext.resume()
  }
  function stop() {
    started.value = false
    audioContext?.suspend()
  }
}

const beep = () => {
  if (!audioContext || !gainParam) return
  const ac = audioContext
  const gp = gainParam
  try {
    const startTime = ac.currentTime
    const duration = 1
    const tc = 0.02
    const rampTime = 5 * tc

    beeping.value = true
    // ramp up
    gp.setTargetAtTime(1, startTime, tc)

    atAudioTime(ac, startTime + rampTime, (unmutedTime) => {
      // stop changes, fully unmuted
      gp.cancelScheduledValues(unmutedTime)
      gp.setValueAtTime(1, unmutedTime)
    })

    atAudioTime(ac, startTime + duration - rampTime, (rampDownTime) => {
      // ramp down
      gp.setTargetAtTime(0, rampDownTime, tc)
    })

    atAudioTime(ac, startTime + duration, (mutedTime) => {
      // stop changes, fully muted
      gp.cancelScheduledValues(mutedTime)
      gp.setValueAtTime(0, mutedTime)
      beeping.value = false
    })
  } catch (e) {
    console.error(e)
    beeping.value = false
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
</script>

<template>
  <header>Signal Timer</header>

  <main>
    <button v-if="started" :disabled="beeping" @click="beep">Beep</button>
    <button @click="startStop">{{ startStopText }}</button>
  </main>
</template>

<style scoped>
header {
  line-height: 1.5;
}
</style>
