<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import SpectrogramHistory from './components/SpectrogramHistory.vue'
import useBeep from './composables/useBeep'
import useWhiteNoise from './composables/useWhiteNoise'

const running = ref(false)
const startStopText = computed(() => (running.value ? 'Stop Audio' : 'Start Audio'))

const beeping = ref(false)
const frequency = ref(440)
const noiseGain = ref(0.1)
const noises = ref<AudioNode[]>([])

const dbRange = reactive({ min: -80, max: 0 })
const band = reactive({ low: 0, high: Infinity })
const bandHighEmptyForInfinite = computed<number | string>({
  get() {
    const value = band.high
    if (typeof value == 'number' && isFinite(value)) return value
    else return ''
  },
  set(newValue) {
    if (typeof newValue == 'string') band.high = Infinity
    else band.high = newValue
  }
})

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
    <fieldset v-if="running">
      <legend>Demo Sounds</legend>
      <div>
        <label for="noise-gain">Noise Gain</label
        ><input id="noise-gain" type="number" v-model="noiseGain" min="0" max="1" step="0.05" />
      </div>
      <div>
        <button :disabled="beeping" @click="beep">Beep</button>
        <label for="beep-frequency">Beep Frequency:</label
        ><input id="beep-frequency" type="number" v-model="frequency" />
      </div>
    </fieldset>
    <fieldset>
      <legend>Spectrogram Settings</legend>
      <div>
        <label for="min-db">Minimum dB</label
        ><input id="min-db" type="number" min="-150" :max="dbRange.max - 1" v-model="dbRange.min" />
      </div>
      <div>
        <label for="max-db">Maximum dB</label
        ><input id="max-db" type="number" :min="dbRange.min + 1" max="0" v-model="dbRange.max" />
      </div>
      <div>
        <label for="band-low">lowest frequency</label
        ><input id="band-low" type="number" min="0" :max="band.high" v-model.number="band.low" />
      </div>
      <div>
        <label for="band-high">highest frequency</label>
        <input
          id="band-high"
          type="number"
          :min="band.low"
          max="30000"
          placeholder="maximum"
          v-model="bandHighEmptyForInfinite"
        />
      </div>
    </fieldset>
    <SpectrogramHistory
      v-if="audioContext != null"
      :decibel-range="dbRange"
      :band="band"
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
