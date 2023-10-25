<script setup lang="ts">
import type { Stoppable } from '@vueuse/core'
import { computed, nextTick, onUnmounted, reactive, ref, watch, watchEffect, type Ref } from 'vue'
import SpectrogramHistory from './components/SpectrogramHistory.vue'
import SpectrumLevels from './components/SpectrumLevels.vue'
import useAnalyser from './composables/useAnalyser'
import useNoisyPeriodicBeep from './composables/useNoisyPeriodicBeep'
import useSignalDetector from './composables/useSignalDetector'

const running = ref(false)
const startStopText = computed(() => (running.value ? 'Stop Audio' : 'Start Audio'))

// test audio settings
const mute = ref(true)
const snr_dB = ref(30)
const gain = ref(1)
const frequency = ref(440)
const duration = ref(1)
const durationSD = ref(0.2)
const period = ref(5)
const periodSD = ref(1)

// analyser output
const sampleRate = ref(48000)
const frequencyData: Ref<Float32Array> = ref(new Float32Array())
const frequencyBinCount: Ref<number> = ref(0)

// signal log
const signalLogRef: Ref<HTMLTextAreaElement | null> = ref(null)
const signalLog = ref('')

// detector
const detectorFrequency = ref(440)
const detectorBandwidth = ref(400)
const detectorSNR = ref(6)
const testBand = ref({ low: 0, high: sampleRate.value / 2 })

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
let periodicStoppable: Stoppable | undefined

const startStop = () => {
  if (running.value) return stop()
  if (audioContext) return start()

  audioContext = new AudioContext()
  audioContext.addEventListener('statechange', () => {
    running.value = audioContext ? audioContext.state == 'running' : false
  })

  const periodic = useNoisyPeriodicBeep(
    audioContext,
    snr_dB,
    {
      frequency,
      duration: { mean: duration, stddev: durationSD },
      period: { mean: period, stddev: periodSD }
    },
    gain
  )
  periodicStoppable = periodic.stop

  const noises = [periodic.node]

  const monitorGain = computed(() => (mute.value ? 0 : 1))
  const monitor = new GainNode(audioContext, { gain: monitorGain.value })
  watch(monitorGain, (gain) =>
    monitor.gain.setTargetAtTime(gain, monitor.context.currentTime, 0.02)
  )
  for (const noise of noises) noise.connect(monitor)
  monitor.connect(audioContext.destination)

  const analyser = useAnalyser(noises, 1) // XXX make publish period adjustable?
  watchEffect(() => (sampleRate.value = analyser.sampleRate.value))
  watchEffect(() => (frequencyBinCount.value = analyser.frequencyBinCount.value))
  watchEffect(() => (frequencyData.value = analyser.data.value))

  // signal detection
  const detector = useSignalDetector(
    analyser.sampleRate,
    analyser.frequencyBinCount,
    analyser.data,
    detectorFrequency,
    detectorBandwidth,
    detectorSNR
  )
  watchEffect(() => (testBand.value = detector.testBand.value))
  watch(detector.detected, (detected) => {
    const which = detected ? 'started' : 'stopped'
    signalLog.value += `signal ${which} (${detector.snr.value.toFixed(1)}) ${new Date()}\n`
  })
  watch(signalLog, () => {
    const textarea = signalLogRef.value
    if (!textarea) return
    nextTick(() => {
      textarea.scrollTop = textarea.scrollHeight
    })
  })

  start()

  function start() {
    audioContext?.resume()
    periodicStoppable?.start()
  }
  function stop() {
    periodicStoppable?.stop()
    audioContext?.suspend()
  }
}

onUnmounted(() => {
  if (running.value) startStop()
})
</script>

<template>
  <header>Signal Timer</header>

  <main>
    <button @click="startStop" v-text="startStopText"></button>
    <input id="demo-mute" type="checkbox" v-model="mute" /><label for="demo-mute"
      >Mute demo audio</label
    >
    <fieldset v-if="audioContext">
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
        <label for="beep-duration-sd"> &sigma; </label>
        <input id="beep-duration-sd" type="number" v-model="durationSD" />
      </div>
      <div>
        <label for="beep-period">Beep Period (s):</label
        ><input id="beep-period" type="number" v-model="period" min="1" />
        <label for="beep-period-sd"> &sigma; </label>
        <input id="beep-period-sd" type="number" v-model="periodSD" />
      </div>
      <div>
        <label for="beep-snr">Beep SNR (power-to-power; dB):</label
        ><input id="beep-snr" type="number" v-model="snr_dB" min="0" />
      </div>
    </fieldset>
    <div v-if="audioContext">
      <textarea
        ref="signalLogRef"
        :readonly="true"
        v-text="signalLog"
        cols="80"
        rows="10"
      ></textarea>
      <fieldset>
        <legend>Signal Detection Settings</legend>
        <div>
          <label for="detector-central">Central Frequency</label
          ><input
            id="detector-central"
            type="number"
            min="0"
            :max="sampleRate / 2"
            v-model.number="detectorFrequency"
          />
        </div>
        <div>
          <label for="detector-bandwidth">Bandwidth</label
          ><input id="detector-bandwidth" type="number" min="50" v-model="detectorBandwidth" />
        </div>
        <div>
          <label for="detector-snr">Required SNR</label
          ><input id="detector-snr" type="number" min="0" v-model.number="detectorSNR" />
        </div>
      </fieldset>
      Signal Detection Band:
      <SpectrumLevels
        :decibel-range="dbRange"
        :band="testBand"
        :sample-rate="sampleRate"
        :frequency-bin-count="frequencyBinCount"
        :data="frequencyData"
      />
      <SpectrogramHistory
        :decibel-range="dbRange"
        :band="testBand"
        :sample-rate="sampleRate"
        :frequency-bin-count="frequencyBinCount"
        :data="frequencyData"
      />
      <div v-if="audioContext">
        Custom Band:
        <SpectrogramHistory
          :decibel-range="dbRange"
          :band="band"
          :sample-rate="sampleRate"
          :frequency-bin-count="frequencyBinCount"
          :data="frequencyData"
        />
        <fieldset>
          <legend>Spectrogram Settings</legend>
          <div>
            <label for="min-db">Minimum dB</label
            ><input
              id="min-db"
              type="number"
              min="-150"
              :max="dbRange.max - 1"
              v-model="dbRange.min"
            />
          </div>
          <div>
            <label for="max-db">Maximum dB</label
            ><input
              id="max-db"
              type="number"
              :min="dbRange.min + 1"
              max="0"
              v-model="dbRange.max"
            />
          </div>
          <div>
            <label for="band-low">lowest frequency</label
            ><input
              id="band-low"
              type="number"
              min="0"
              :max="band.high"
              v-model.number="band.low"
            />
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
      </div>
    </div>
  </main>
</template>

<style scoped>
header {
  line-height: 1.5;
}
</style>
