<script setup lang="ts">
import { useCssVar, useResizeObserver } from '@vueuse/core'
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
const powerLegendHeight = 14 // includes separator
const frequencyLabelsHeight = 10
const headerHeight = powerLegendHeight + frequencyLabelsHeight

// CSS "variables" XXX eventually react to dark mode, too
const bgColor = useCssVar('--bg-color', document.body)
const textColor = useCssVar('--text-color', document.body)

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

  useResizeObserver(canvasRef, (entries) => {
    const canvas = entries[0].target
    if (!(canvas instanceof HTMLCanvasElement)) return
    canvas.width = entries[0].contentRect.width
    drawLegend(canvas)
  })

  watchEffect(() => {
    const canvas = canvasRef.value
    if (!canvas) return
    drawLegend(canvas)
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

function drawLegend(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // power legend
  const powerLegendTop = 0
  const binCount = 256
  const binWidth = canvas.width / binCount
  for (let i = 0; i < binCount; i++) {
    const binStart = Math.round(binWidth * i)
    const binEnd = Math.round(binWidth * (i + 1))
    ctx.fillStyle = cubeYfColor(Math.trunc((256 * i) / binCount))
    ctx.fillRect(binStart, powerLegendTop, binEnd - binStart, powerLegendHeight)
  }
  props.decibelRange.max - props.decibelRange.min
  ctx.fillStyle = textColor.value
  ctx.font = `${frequencyLabelsHeight}px sans-serif`
  drawLabels(
    ctx,
    powerLegendTop,
    powerLegendHeight - 4,
    props.decibelRange.min,
    props.decibelRange.max,
    (power: number, span: number) =>
      span >= 1 ? `${Math.round(power)}dB` : `${power.toFixed(2)}dB`
  )

  // separator
  ctx.fillStyle = 'grey'
  ctx.fillRect(0, powerLegendTop + powerLegendHeight - 4, canvas.width, 4)

  // frequency labels
  const frequencyLabelsTop = powerLegendHeight
  ctx.fillStyle = bgColor.value
  ctx.fillRect(0, frequencyLabelsTop, canvas.width, frequencyLabelsHeight)
  ctx.fillStyle = textColor.value
  ctx.font = `${frequencyLabelsHeight}px sans-serif`
  drawLabels(
    ctx,
    frequencyLabelsTop,
    frequencyLabelsHeight,
    frequencies.value.minFrequency,
    frequencies.value.maxFrequency,
    (frequency: number, labelBandwidth: number) =>
      labelBandwidth >= 1 ? `${Math.round(frequency)}` : `${frequency.toFixed(2)}`
  )

  function drawLabels(
    ctx: CanvasRenderingContext2D,
    y: number,
    height: number,
    min: number,
    max: number,
    label: (value: number, span: number) => string
  ) {
    const range = max - min
    const span = markerSpan(range)
    const labelWidth = Math.trunc((ctx.canvas.width * span) / range) - 3
    ctx.textBaseline = 'bottom'
    const firstValue = Math.ceil(min / span) * span // round min up to multiple of span
    const pos = drawPosition(ctx.canvas.width, min, range)
    for (let value = firstValue; value <= max; value += span) {
      const labelPosition = pos(value)
      ctx.fillRect(labelPosition, y, 1, height)
      ctx.fillText(`${label(value, span)}`, labelPosition + 2, y + height, labelWidth)
    }

    function markerSpan(range: number) {
      const base = 10 ** Math.trunc(Math.log10(range))
      const factor = range / base
      if (factor >= 5) return 0.5 * base
      else if (factor >= 2) return 0.2 * base
      else return 0.1 * base
    }
  }
}

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
    const pos = drawPosition(
      canvas.width,
      frequencies.value.minFrequency,
      frequencies.value.bandWidth
    )
    for (let i = 0; i < rowData.length; i++) {
      const power = rowData[i]
      const binStart = pos(i * binBandwidth)
      const binEnd = pos((i + 1) * binBandwidth)
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

function drawPosition(
  drawWidth: number,
  minValue: number,
  valuesExtent: number
): (value: number) => number {
  return (value) => Math.trunc((drawWidth * (value - minValue)) / valuesExtent)
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
