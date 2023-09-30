<script setup lang="ts">
import { onMounted, onUnmounted, ref, toRef, watch, watchEffect, type PropType } from 'vue'
import cubeYF from '../assets/cubeYF'

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

let analyzer: AnalyserNode | undefined
let sampleIntervalId: number | undefined
const samplePeriod = 100 // ms

onMounted(() => {
  const a = new AnalyserNode(props.inputs[0].context, { fftSize: 512, smoothingTimeConstant: 0 })
  analyzer = a

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
    if (canvas) {
      // XXX eventually useResizeObserver
      canvas.width = canvas.clientWidth
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const binCount = 20
      const binWidth = canvas.width / binCount
      for (let i = 0; i < binCount; i++) {
        const binStart = Math.round(binWidth * i)
        const binEnd = Math.round(binWidth * (i + 1))
        const [r, g, b] = cubeYF[Math.trunc((256 * i) / binCount)]
        ctx.fillStyle = `rgb(${r} ${g} ${b})`
        ctx.fillRect(binStart, 0, binEnd - binStart, headerHeight)
      }
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
    if (analyzer) analyzer.minDecibels = props.decibelRange.min
  })
  watchEffect(() => {
    if (analyzer) analyzer.maxDecibels = props.decibelRange.max
  })
})
onUnmounted(() => {
  if (sampleIntervalId != null) clearInterval(sampleIntervalId)
  sampleIntervalId = undefined

  if (!analyzer) return

  const a = analyzer
  if (props.output) a.disconnect(props.output)
  props.inputs.forEach((input) => input.disconnect(a))

  analyzer = undefined
})

let lastRowTime = 0
let rowData = new Uint8Array(0)
let frequencyData = new Uint8Array(0)

function gatherFrequencyData() {
  if (!props.running || !analyzer) return

  if (frequencyData.length != analyzer.frequencyBinCount)
    frequencyData = new Uint8Array(analyzer.frequencyBinCount)
  analyzer.getByteFrequencyData(frequencyData)

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
  if (!props.running || !canvasRef.value) return

  const canvas = canvasRef.value
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const { width, height } = canvas
  const rowHeight = 1
  const binWidth = width / rowData.length
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
    rowData.forEach((power, i) => {
      const binStart = Math.round(binWidth * i)
      const binEnd = Math.round(binWidth * (i + 1))
      // const mappedPower = 1 - Math.log2(256 - power) / 8
      // const [r, g, b] = cubeYF[Math.trunc(255 * mappedPower)]
      const [r, g, b] = cubeYF[power]
      ctx.fillStyle = `rgb(${r} ${g} ${b})`
      ctx.fillRect(binStart, headerHeight, binEnd - binStart, rowHeight)
    })
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
