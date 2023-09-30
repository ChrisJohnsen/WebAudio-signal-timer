<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import SpectrogramHistory from './components/SpectrogramHistory.vue'
import useBeep from './composables/useBeep'
import useWhiteNoise from './composables/useWhiteNoise'

const running = ref(false)
const startStopText = computed(() => (running.value ? 'Stop Audio' : 'Start Audio'))
const beeping = ref(false)
const frequency = ref(440)
const noiseGain = ref(0.1)
const noises = ref<AudioNode[]>([])
const minDecibels = ref(-80)
const maxDecibels = ref(0)

let audioContext: AudioContext | undefined
let beep: (ev: Event) => void = () => {} // replaced when beeper is created after user interaction required for Web Audio

const startStop = () => {
  if (running.value) return stop()
  if (audioContext) return start()

  audioContext = new AudioContext()
  audioContext.addEventListener('statechange', () => {
    running.value = audioContext ? audioContext.state == 'running' : false
  })

  const beeper = useBeep(audioContext, frequency)
  beep = () => beeper.beep()
  watch(beeper.beeping, (beepersBeeping) => (beeping.value = beepersBeeping))

  const noisy = useWhiteNoise(audioContext, 5, noiseGain)

  noises.value = [beeper.node, noisy.node]

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
      <label for="noise-gain">Noise Gain</label
      ><input id="noise-gain" type="number" v-model="noiseGain" min="0" max="1" step="0.05" />
      <br />
      <button :disabled="beeping" @click="beep">Beep</button>
      <label for="beep-frequency">Beep Frequency:</label
      ><input id="beep-frequency" type="number" v-model="frequency" />
      <br />
      <label for="min-db">Minimum dB</label
      ><input
        id="min-db"
        type="number"
        min="-150"
        :max="maxDecibels - 10"
        step="10"
        v-model="minDecibels"
      />
      <br />
      <label for="max-db">Maximum dB</label
      ><input
        id="max-db"
        type="number"
        :min="minDecibels + 10"
        max="0"
        step="10"
        v-model="maxDecibels"
      />
    </div>
    <SpectrogramHistory
      v-if="audioContext != null"
      :decibel-range="{ min: minDecibels, max: maxDecibels }"
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
