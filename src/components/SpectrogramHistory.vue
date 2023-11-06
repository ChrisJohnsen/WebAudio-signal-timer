<script setup lang="ts">
import { cubeYfColor, colorCount as cubeYFColorCount } from '@/assets/cubeYF'
import { useBins, useFFTPixelBins } from '@/composables/useBins'
import { useCssVar, useResizeObserver } from '@vueuse/core'
import { computed, effectScope, onMounted, ref, toRef, watchEffect, type PropType } from 'vue'

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
  watchEffect(() => updateSpectrogram(props.sampleRate, props.data)) // should not create any effects

  useResizeObserver(canvasRef, (entries) => {
    const canvas = entries[0].target
    if (!(canvas instanceof HTMLCanvasElement)) return
    canvasWidth.value = entries[0].contentRect.width
    drawLegend(canvas) // creates temporary effects, but also encapsulates them
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
    const range = max - min
    const span = markerSpan(range)
    const labelWidth = Math.trunc((ctx.canvas.width * span) / range) - 3
    ctx.textBaseline = 'bottom'
    const firstValue = Math.ceil(min / span) * span // round min up to multiple of span
    const scope = effectScope()
    const pixelForValue = scope.run(() => useBins(ctx.canvas.width, min, max).binFor)
    scope.stop()
    if (!pixelForValue) throw new Error('error while using EffectScope.run()')
    for (let value = firstValue; value <= max; value += span) {
      const labelPosition = pixelForValue(value)
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
    if (binPixels.x + binPixels.width < oobWidth) {
      infra = Math.max(infra, power)
      continue
    } else if (binPixels.x > width - oobWidth) {
      ultra = Math.max(ultra, power)
      continue
    }
    ctx.fillStyle = cubeYfColor(colorIndexForPower(power))
    ctx.fillRect(binPixels.x, headerHeight, binPixels.width, rowHeight)
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
