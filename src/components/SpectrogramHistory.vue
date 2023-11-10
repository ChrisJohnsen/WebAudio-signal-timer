<script setup lang="ts">
import { cubeYfColor, colorCount as cubeYFColorCount } from '@/assets/cubeYF'
import { useBins, useFFTPixelBins } from '@/composables/useBins'
import { labelPositions } from '@/labelPositions'
import { useCssVar, useResizeObserver } from '@vueuse/core'
import { computed, onMounted, ref, toRef, watchEffect, type PropType } from 'vue'

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
  sampleRate: {
    type: Number,
    required: true
  },
  frequencyBinCount: {
    type: Number,
    required: true
  },
  data: {
    type: Float32Array,
    required: true
  }
})

const frequencies = computed(() => {
  const nyquistFrequency = props.sampleRate / 2
  const minFrequency = props.band.low
  const maxFrequency = Math.min(props.band.high, nyquistFrequency)
  return { minFrequency, maxFrequency, bandWidth: maxFrequency - minFrequency }
})

const canvasRef = ref<HTMLCanvasElement | null>(null)
const canvasWidth = ref(100)

const powerLegendHeight = 14 // includes separator
const frequencyLabelsHeight = 10
const headerHeight = powerLegendHeight + frequencyLabelsHeight

onMounted(() => {
  watchEffect(() => {
    const canvas = canvasRef.value
    if (!canvas) return
    drawLegend(canvas)
  })
  watchEffect(() => updateSpectrogram(props.sampleRate, props.data)) // should not create any effects

  useResizeObserver(canvasRef, (entries) => {
    const canvas = entries[0].target
    if (!(canvas instanceof HTMLCanvasElement)) return
    canvasWidth.value = entries[0].contentRect.width
    drawLegend(canvas)
  })
})

// CSS "variables" XXX eventually react to dark mode, too
const bgColor = useCssVar('--bg-color', document.body)
const textColor = useCssVar('--text-color', document.body)

const startPixelForColor = useBins(canvasWidth, 0, cubeYFColorCount - 1).binFor

function drawLegend(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // power legend
  const powerLegendTop = 0
  for (let color = 0; color < cubeYFColorCount; color++) {
    const binStart = startPixelForColor(color)
    const binEnd = startPixelForColor(color + 1)
    ctx.fillStyle = cubeYfColor(color)
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
    ctx.textBaseline = 'bottom'
    for (const { valueStep, value, pixelPosition: x, pixelSpan: width } of labelPositions(
      ctx.canvas.width,
      min,
      max
    )) {
      ctx.fillRect(x, y, 1, height)
      ctx.fillText(`${label(value, valueStep)}`, x + 2, y + height, width - 4)
    }
  }
}

const colorIndexForPower = useBins(
  256,
  () => props.decibelRange.min,
  () => props.decibelRange.max
).binFor

const pixelsForFrequencyBin = useFFTPixelBins(
  toRef(props, 'frequencyBinCount'),
  toRef(props, 'sampleRate'),
  canvasWidth,
  () => frequencies.value.minFrequency,
  () => frequencies.value.maxFrequency
)

function updateSpectrogram(sampleRate: number, rowData: Float32Array) {
  const canvas = canvasRef.value
  if (!canvas) return

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
  const oobWidth = 4
  let infra = -Infinity
  let ultra = -Infinity
  for (let i = 0; i < rowData.length; i++) {
    const power = rowData[i]
    const binPixels = pixelsForFrequencyBin(i)
    if (binPixels.start + binPixels.count < oobWidth) {
      infra = Math.max(infra, power)
      continue
    } else if (binPixels.start > width - oobWidth) {
      ultra = Math.max(ultra, power)
      continue
    }
    ctx.fillStyle = cubeYfColor(colorIndexForPower(power))
    ctx.fillRect(binPixels.start, headerHeight, binPixels.count, rowHeight)
  }
  if (isFinite(infra)) {
    ctx.fillStyle = cubeYfColor(colorIndexForPower(infra))
    ctx.fillRect(0, headerHeight, oobWidth, rowHeight)
  }
  if (isFinite(ultra)) {
    ctx.fillStyle = cubeYfColor(colorIndexForPower(ultra))
    ctx.fillRect(width - oobWidth, headerHeight, oobWidth, rowHeight)
  }
}
</script>

<template>
  <canvas ref="canvasRef" height="100" :width="canvasWidth">spectrogram history</canvas>
</template>

<style scoped>
canvas {
  width: 100%;
}
</style>
