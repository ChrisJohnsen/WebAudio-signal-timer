<script setup lang="ts">
import type { Pausable } from '@vueuse/core'
import { computed, reactive, ref, watchEffect, type Ref } from 'vue'
import SpectrogramHistory from './components/SpectrogramHistory.vue'
import useAnalyser from './composables/useAnalyser'
import useNoisyPeriodicBeep from './composables/useNoisyPeriodicBeep'

const running = ref(false)
const startStopText = computed(() => (running.value ? 'Stop Audio' : 'Start Audio'))

// test audio settings
const snr = ref(400)
const gain = ref(1)
const frequency = ref(440)
const duration = ref(1)
const period = ref(5)

// analyser output
const sampleRate = ref(48000)
const frequencyData: Ref<Float32Array> = ref(new Float32Array())

// spectrogram inputs
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
let periodicPauser: Pausable | undefined

const startStop = () => {
  if (running.value) return stop()
  if (audioContext) return start()

  audioContext = new AudioContext()
  audioContext.addEventListener('statechange', () => {
    running.value = audioContext ? audioContext.state == 'running' : false
  })

  const periodic = useNoisyPeriodicBeep(audioContext, snr, { frequency, duration, period }, gain)
  periodicPauser = periodic.pause

  const noises = [periodic.node]

  for (const noise of noises) noise.connect(audioContext.destination)

  const analyser = useAnalyser(noises, 1) // XXX make publish period adjustable?
  watchEffect(() => (sampleRate.value = analyser.sampleRate.value))
  watchEffect(() => (frequencyData.value = analyser.data.value))

  start()

  function start() {
    audioContext?.resume()
    periodicPauser?.resume()
  }
  function stop() {
    periodicPauser?.pause()
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
        <label for="demo-gain">Gain</label
        ><input id="demo-gain" type="number" v-model="gain" min="0" />
      </div>
      <div>
        <label for="beep-frequency">Beep Frequency (Hz):</label
        ><input id="beep-frequency" type="number" v-model="frequency" min="1" />
      </div>
      <div>
        <label for="beep-duration">Beep Duration (s):</label
        ><input id="beep-duration" type="number" v-model="duration" min="0" :max="period" />
      </div>
      <div>
        <label for="beep-period">Beep Period (s):</label
        ><input id="beep-period" type="number" v-model="period" min="1" />
      </div>
      <div>
        <label for="beep-snr">Beep SNR (power-to-power; plain, not dB):</label
        ><input id="beep-snr" type="number" v-model="snr" min="0" />
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
      :sample-rate="sampleRate"
      :data="frequencyData"
    />
  </main>
</template>

<style scoped>
header {
  line-height: 1.5;
}
</style>
