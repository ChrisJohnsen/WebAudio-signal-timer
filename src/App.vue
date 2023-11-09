<script setup lang="ts">
import { throttleFilter, useStorage, type UseStorageOptions } from '@vueuse/core'
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  toRef,
  watch,
  watchEffect,
  type Ref
} from 'vue'
import PeriodSettings from './components/PeriodSettings.vue'
import SourceSelector from './components/SourceSelector.vue'
import SpectrogramHistory from './components/SpectrogramHistory.vue'
import SpectrumLevels from './components/SpectrumLevels.vue'
import TimerDisplay from './components/TimerDisplay.vue'
import useAnalyser from './composables/useAnalyser'
import useSignalDetector from './composables/useSignalDetector'
import useTimingRecovery, { type Event } from './composables/useTimingRecovery'

const running = ref(false)
const startStopText = computed(() => (running.value ? 'Stop Timing' : 'Start Timing'))

// monitor
const monitorGain = ref(0)

// time settings
const expectedPeriod = ref<number | undefined>()
const expectedDuration = ref<number | undefined>()
const reportingPeriod = ref(1)

// analyser
const analyserInputs = ref<AudioNode[]>([])
const {
  sampleRate,
  frequencyBinCount,
  data: frequencyData,
  minimumPublishPeriod: minimumReportingPeriod
} = useAnalyser(analyserInputs, reportingPeriod)

// detector
const detectorFrequency = ref(440)
const detectorBandwidth = ref(400)
const detectorSNR = ref(6)
const testBand = ref({ low: 0, high: sampleRate.value / 2 })

// signal log
const signalLogRef: Ref<HTMLTextAreaElement | null> = ref(null)
const signalLog = ref('')

// custom spectrogram
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

// timing recovery
const recoveredPeriod = ref(NaN)
const recoveredDuration = ref(NaN)
const predictedNext = ref<Event | null>(null)

const audioContext = new AudioContext() // this may generate a warning since this isn't triggered by a "user gesture"
let resetTiming: () => void

const startStop = () => {
  if (running.value) return stop()
  start()
}
function start() {
  resetTiming?.()
  audioContext.resume()
}
function stop() {
  audioContext.suspend()
}

onMounted(() => {
  audioContext.suspend() // wait for resume, don't just start when the first source node is started
  audioContext.addEventListener('statechange', () => {
    running.value = audioContext ? audioContext.state == 'running' : false
    if (!running.value) event.value = null
  })

  // monitor
  useStorage('monitor gain', monitorGain, localStorage, storageOptions())
  const monitor = new GainNode(audioContext, { gain: monitorGain.value })
  watch(monitorGain, (gain) =>
    monitor.gain.setTargetAtTime(gain, monitor.context.currentTime, 0.02)
  )
  watch(analyserInputs, (i, o) => {
    for (const node of o)
      try {
        node.disconnect(monitor)
      } catch (e) {
        void e
      }
    for (const node of i) node.connect(monitor)
  })
  monitor.connect(audioContext.destination)

  // signal detection
  useStorage('detector central frequency', detectorFrequency, localStorage, storageOptions())
  useStorage('detector bandwidth', detectorBandwidth, localStorage, storageOptions())
  useStorage('detector SNR', detectorSNR, localStorage, storageOptions())
  const detector = useSignalDetector(
    sampleRate,
    frequencyBinCount,
    frequencyData,
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

  // timing recovery
  const event = ref<Event | null>(null)
  watch(
    detector.detected,
    (detected) => (event.value = { type: detected ? 'start' : 'stop', date: Date.now() })
  )
  const timing = useTimingRecovery(event, expectedPeriod, expectedDuration)
  resetTiming = timing.reset
  watch(timing.period, (period) => (recoveredPeriod.value = period), { immediate: true })
  watch(timing.duration, (duration) => (recoveredDuration.value = duration), { immediate: true })
  watch(timing.next, (next) => (predictedNext.value = next), { immediate: true })

  // spectrogram and spectrum levels settings
  useStorage('spectrum min dB', toRef(dbRange, 'min'), localStorage, storageOptionsDecibel())
  useStorage('spectrum max dB', toRef(dbRange, 'max'), localStorage, storageOptionsDecibel())
  useStorage('spectrum min frequency', toRef(band, 'low'), localStorage, storageOptions())
  useStorage('spectrum max frequency', toRef(band, 'high'), localStorage, storageOptionsHighFreq())

  function storageOptions(): UseStorageOptions<number> {
    return {
      mergeDefaults: (value, defaults) => (isFinite(value) && 0 < value ? value : defaults),
      eventFilter: throttleFilter(100),
      listenToStorageChanges: false
    }
  }
  function storageOptionsDecibel(): UseStorageOptions<number> {
    return {
      mergeDefaults: (value, defaults) => (isFinite(value) ? value : defaults),
      eventFilter: throttleFilter(100),
      listenToStorageChanges: false
    }
  }
  function storageOptionsHighFreq(): UseStorageOptions<number> {
    return {
      mergeDefaults: (value, defaults) => (!isNaN(value) && value >= 0 ? value : defaults),
      eventFilter: throttleFilter(100),
      listenToStorageChanges: false
    }
  }
})
onUnmounted(() => {
  if (running.value) stop()
})
</script>

<template>
  <header>Signal Timer</header>

  <main>
    <SourceSelector
      :audio-context="audioContext"
      :active="running"
      @source="(n) => (analyserInputs = n ? [n] : [])"
    />
    <div>
      <label for="monitor-gain">Monitor Gain: </label>
      <input
        id="monitor-gain"
        type="range"
        v-model="monitorGain"
        min="0"
        max="5"
        step="any"
        list="gain-levels"
      />
      <datalist id="gain-levels">
        <option value="0"></option>
        <option value="1"></option>
      </datalist>
    </div>
    <PeriodSettings
      v-model:period="expectedPeriod"
      v-model:duration="expectedDuration"
      v-model:reporting-period="reportingPeriod"
      :minimum-reporting-period="minimumReportingPeriod"
    ></PeriodSettings>
    <div>
      <button @click="startStop" v-text="startStopText"></button>
    </div>
    <TimerDisplay
      :do-updates="running"
      :period="recoveredPeriod"
      :duration="recoveredDuration"
      :next="predictedNext"
    />
    <textarea ref="signalLogRef" :readonly="true" v-text="signalLog" cols="80" rows="10"></textarea>
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
  </main>
</template>

<style scoped>
header {
  line-height: 1.5;
}
</style>
