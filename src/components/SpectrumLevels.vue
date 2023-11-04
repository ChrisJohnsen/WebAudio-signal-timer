<script setup lang="ts">
import { cubeYfColor } from '@/assets/cubeYF'
import { useBins, useFFTPixelBins } from '@/composables/useBins'
import { useCssVar } from '@vueuse/core'
import { useResizeObserver } from '@vueuse/core/index.cjs'
import { computed, onMounted, ref, toRef, watchEffect, type PropType, type Ref } from 'vue'

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

const canvasRef: Ref<HTMLCanvasElement | null> = ref(null)
const canvasWidth = ref(100)

onMounted(() => {
  useResizeObserver(canvasRef, (entries) => {
    const canvas = entries[0].target
    if (!(canvas instanceof HTMLCanvasElement)) return
    canvasWidth.value = entries[0].contentRect.width
  })

  watchEffect(updateSpectrum)
})

// CSS "variables" XXX eventually react to dark mode, too
const bgColor = useCssVar('--bg-color', document.body)

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

function updateSpectrum() {
  const canvas = canvasRef.value
  if (!canvas) return

  const { width, height } = canvas

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const data = props.data

  ctx.fillStyle = bgColor.value
  ctx.fillRect(0, 0, width, height)
  const max: { power: number; bar?: { x: number; width: number; y: number; height: number } } = {
    power: -Infinity
  }
  for (let i = 0; i < props.frequencyBinCount; i++) {
    const power = data[i]
    const colorIndex = colorIndexForPower(power)
    const barHeight = colorIndex + 1
    const bar = pixelsForFrequencyBin(i)
    if (bar.x < 0) continue
    if (bar.x + bar.width > width) break
    if (power > max.power) {
      max.power = power
      max.bar = { ...bar, y: height - barHeight, height: barHeight }
    }
    ctx.fillStyle = cubeYfColor(colorIndex)
    ctx.fillRect(bar.x, height - barHeight, bar.width, barHeight)
  }

  // highlight peak level from displayed band
  if (max.bar) {
    const bar = max.bar
    ctx.fillStyle = 'magenta'
    ctx.fillRect(bar.x, bar.y, bar.width, Math.min(10, bar.height))
  }
}
</script>

<template>
  <canvas ref="canvasRef" height="256" :width="canvasWidth">FFT levels</canvas>
</template>

<style scoped>
canvas {
  width: 100%;
}
</style>
