<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import SpectrogramHistory from './components/SpectrogramHistory.vue'
import useBeep from './composables/useBeep.js'

const running = ref(false)
const startStopText = computed(() => (running.value ? 'Stop Audio' : 'Start Audio'))
const beeping = ref(false)
const frequency = ref(440)
const noises = ref<AudioNode[]>([])

let audioContext: AudioContext | undefined
let beep: (ev: Event) => void = () => {} // replaced when beeper is created after user interaction required for Web Audio

const startStop = () => {
  if (running.value) return stop()
  if (audioContext) return start()

  audioContext = new AudioContext()

  const beeper = useBeep(audioContext, frequency)

  noises.value = [beeper.node]
  beep = () => beeper.beep()
  watch(beeper.beeping, (beepersBeeping) => (beeping.value = beepersBeeping))

  audioContext.addEventListener('statechange', () => {
    running.value = audioContext ? audioContext.state == 'running' : false
  })

  start()

  function start() {
    audioContext?.resume()
  }
  function stop() {
    audioContext?.suspend()
  }
}
</script>

<template>
  <header>Signal Timer</header>

  <main>
    <button @click="startStop" v-text="startStopText"></button>
    <div v-if="running">
      <button :disabled="beeping" @click="beep">Beep</button>
      <input type="number" v-model="frequency" />
    </div>
    <SpectrogramHistory
      v-if="audioContext != null"
      :running="running"
      :inputs="noises"
      :output="audioContext.destination"
    />
  </main>
</template>

<style scoped>
header {
  line-height: 1.5;
}
</style>
