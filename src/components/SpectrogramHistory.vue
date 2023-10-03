<script setup lang="ts">
import {
  computed,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  toRef,
  watch,
  watchEffect,
  type PropType,
  type ShallowRef
} from 'vue'
import { cubeYfColor } from '../assets/cubeYF'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const headerHeight = 10

const props = defineProps({
  decibelRange: {
    type: Object as PropType<{ min: number; max: number }>,
    default() {
      return { min: -100, max: -10 }
    },
    validator({ min, max }: { min: number; max: number }) {
      return -150 <= min && min < max && max <= 0
    }
  },
  band: {
    type: Object as PropType<{ low: number; high: number }>,
    default() {
      return { low: 40, high: 14000 }
    },
    validator({ low, high }: { low: number; high: number }) {
      return 0 <= low && low < high
    }
  },
  running: {
    type: Boolean,
    default: true
  },
  inputs: {
    type: Array as PropType<AudioNode[]>,
    required: true
  },
  output: {
    type: AudioNode
  },
  rowRate: {
    type: Number,
    default: 1,
    validator: (rate: number) => rate > 0
  }
})

const frequencies = computed(() => {
  const sampleRate = analyzer.value?.context.sampleRate
  // spell-checker: words Nyquist
  const nyquistFrequency = sampleRate ? sampleRate / 2 : 24000
  const minFrequency = props.band.low
  const maxFrequency = Math.min(props.band.high, nyquistFrequency)
  return { minFrequency, maxFrequency, bandWidth: maxFrequency - minFrequency }
})
function frequencyPosition(canvasWidth: number, frequency: number) {
  const { minFrequency, bandWidth } = frequencies.value
  return Math.trunc((canvasWidth * (frequency - minFrequency)) / bandWidth)
}

const analyzer: ShallowRef<AnalyserNode | undefined> = shallowRef()
let sampleIntervalId: number | undefined
const samplePeriod = 100 // ms

onMounted(() => {
  const a = new AnalyserNode(props.inputs[0].context, { fftSize: 512, smoothingTimeConstant: 0 })
  analyzer.value = a

  watch(
    toRef(props, 'inputs'),
    (newInputs, oldInputs) => {
      newInputs.forEach((input) => input.connect(a))
      const newInputsSet = new Set(newInputs)
      if (oldInputs)
        oldInputs.forEach((input) => {
          if (!newInputsSet.has(input)) input.disconnect(a)
        })
    },
    { immediate: true }
  )
  watch(
    toRef(props, 'output'),
    (newOutput, oldOutput) => {
      if (newOutput) a.connect(newOutput)
      if (oldOutput && oldOutput != newOutput) a.disconnect(oldOutput)
    },
    { immediate: true }
  )

  watchEffect(() => {
    const canvas = canvasRef.value
    if (!canvas) return

    // XXX eventually useResizeObserver
    canvas.width = canvas.clientWidth
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const binCount = 256
    const binWidth = canvas.width / binCount
    for (let i = 0; i < binCount; i++) {
      const binStart = Math.round(binWidth * i)
      const binEnd = Math.round(binWidth * (i + 1))
      ctx.fillStyle = cubeYfColor(Math.trunc((256 * i) / binCount))
      ctx.fillRect(binStart, 0, binEnd - binStart, headerHeight)
    }

    const { minFrequency, maxFrequency, bandWidth } = frequencies.value
    const markerBand = ((base) => {
      const factor = bandWidth / base
      if (factor >= 5) return 0.5 * base
      else if (factor >= 2) return 0.2 * base
      else return 0.1 * base
    })(10 ** Math.trunc(Math.log10(bandWidth)))
    const labelWidth = Math.trunc((canvas.width * markerBand) / bandWidth) - 3
    const label = (frequency: number) =>
      markerBand >= 1 ? `${Math.round(frequency)}` : `${frequency.toFixed(2)}`
    ctx.fillStyle = 'black'
    ctx.font = `${headerHeight}px sans-serif`
    ctx.textBaseline = 'bottom'
    const firstMarker = Math.ceil(minFrequency / markerBand) * markerBand // round minFrequency up to multiple of markerBand
    for (let frequency = firstMarker; frequency <= maxFrequency; frequency += markerBand) {
      const labelPosition = frequencyPosition(canvas.width, frequency)
      ctx.fillRect(labelPosition, 0, 1, headerHeight)
      ctx.fillText(`${label(frequency)}`, labelPosition + 2, headerHeight, labelWidth)
    }
  })

  watch(
    toRef(props, 'running'),
    (newRunning, oldRunning) => {
      if (sampleIntervalId != null) {
        clearInterval(sampleIntervalId)
        sampleIntervalId = undefined
      }
      if (!newRunning) return
      if (!oldRunning) sampleIntervalId = setInterval(gatherFrequencyData, samplePeriod)
    },
    { immediate: true }
  )

  watchEffect(() => {
    a.minDecibels = props.decibelRange.min
  })
  watchEffect(() => {
    a.maxDecibels = props.decibelRange.max
  })
})
onUnmounted(() => {
  if (sampleIntervalId != null) clearInterval(sampleIntervalId)
  sampleIntervalId = undefined

  if (!analyzer.value) return

  const a = analyzer.value
  if (props.output) a.disconnect(props.output)
  props.inputs.forEach((input) => input.disconnect(a))

  analyzer.value = undefined
})

let lastRowTime = 0
let rowData = new Uint8Array(0)
let frequencyData = new Uint8Array(0)

function gatherFrequencyData() {
  if (!props.running || !analyzer.value) return
  const a = analyzer.value

  if (frequencyData.length != a.frequencyBinCount)
    frequencyData = new Uint8Array(a.frequencyBinCount)
  a.getByteFrequencyData(frequencyData)

  if (rowData.length != frequencyData.length) rowData = new Uint8Array(frequencyData.length)
  for (let i = 0; i < frequencyData.length; i++) rowData[i] = Math.max(rowData[i], frequencyData[i])
  // simple averaging drastically reduces the overall signal if the signal is not present for most of the samples that go into a row
  // also, this accumulation needs a wider data type in rowData
  // for (let i = 0; i < frequencyData.length; i++) rowData[i] += frequencyData[i]
  // rowSamples++

  if (props.rowRate != 0 && Date.now() - lastRowTime > 1000 / props.rowRate)
    requestAnimationFrame(updateSpectrogram)
}

function updateSpectrogram() {
  if (!props.running || !canvasRef.value || !analyzer.value) return

  const canvas = canvasRef.value
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const { width, height } = canvas
  const rowHeight = 1
  ctx.drawImage(
    canvas,
    0,
    headerHeight,
    width,
    height - rowHeight - headerHeight,
    0,
    headerHeight + rowHeight,
    width,
    height - rowHeight - headerHeight
  )
  try {
    const oobWidth = 4
    const binBandwidth = analyzer.value.context.sampleRate / 2 / rowData.length
    let infra = -Infinity
    let ultra = -Infinity
    for (let i = 0; i < rowData.length; i++) {
      const power = rowData[i]
      const binStart = frequencyPosition(canvas.width, i * binBandwidth)
      const binEnd = frequencyPosition(canvas.width, (i + 1) * binBandwidth)
      if (binEnd < oobWidth) {
        infra = Math.max(infra, power)
        continue
      } else if (binStart > width - oobWidth) {
        ultra = Math.max(ultra, power)
        continue
      }
      // const mappedPower = 1 - Math.log2(256 - power) / 8
      // ctx.fillStyle = cubeYfColor(Math.trunc(255 * mappedPower))
      ctx.fillStyle = cubeYfColor(power)
      ctx.fillRect(binStart, headerHeight, binEnd - binStart, rowHeight)
    }
    if (isFinite(infra)) {
      ctx.fillStyle = cubeYfColor(infra)
      ctx.fillRect(0, headerHeight, oobWidth, rowHeight)
    }
    if (isFinite(ultra)) {
      ctx.fillStyle = cubeYfColor(ultra)
      ctx.fillRect(width - oobWidth, headerHeight, oobWidth, rowHeight)
    }
  } finally {
    lastRowTime = Date.now()
    rowData.fill(0)
  }
}
</script>

<template>
  <canvas ref="canvasRef" height="100" width="100">spectrogram history</canvas>
</template>

<style scoped>
canvas {
  width: 100%;
}
</style>
