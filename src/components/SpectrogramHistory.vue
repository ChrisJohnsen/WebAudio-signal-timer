<script setup lang="ts">
import { onMounted, onUnmounted, ref, toRef, watch, watchEffect } from 'vue'

const canvasRef = ref<HTMLCanvasElement | null>(null)

const props = defineProps<{
  running: boolean
  inputs: AudioNode[]
  output?: AudioNode
}>()

let analyzer: AnalyserNode | undefined

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
    if (canvas)
      // XXX eventually useResizeObserver
      canvas.width = canvas.clientWidth
  })

  watch(
    toRef(props, 'running'),
    (newRunning, oldRunning) => {
      if (!newRunning) return
      if (!oldRunning) requestAnimationFrame(drawSpectrogram)
    },
    { immediate: true }
  )
})
onUnmounted(() => {
  if (!analyzer) return

  const a = analyzer
  if (props.output) a.disconnect(props.output)
  props.inputs.forEach((input) => input.disconnect(a))

  analyzer = undefined
})

let frequencyData = new Uint8Array(0)
function drawSpectrogram() {
  if (!props.running || !analyzer || !canvasRef.value) return
  const canvas = canvasRef.value
  if (frequencyData.length != analyzer.frequencyBinCount)
    frequencyData = new Uint8Array(analyzer.frequencyBinCount)
  analyzer.getByteFrequencyData(frequencyData)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width, height } = canvas
  const rowHeight = 1
  ctx.drawImage(canvas, 0, 0, width, height - rowHeight, 0, rowHeight, width, height - rowHeight)
  frequencyData.forEach((power, i) => {
    const binStart = Math.round((width * i) / frequencyData.length)
    const binEnd = Math.round((width * (i + 1)) / frequencyData.length)
    ctx.fillStyle = `rgb(0,0,${power})`
    ctx.fillRect(binStart, 0, binEnd - binStart, rowHeight)
  })
  requestAnimationFrame(drawSpectrogram)
}
</script>

<template>
  <canvas ref="canvasRef" height="100" width="100">spectrogram history</canvas>
</template>

<style scoped>
canvas {
  width: 100vw;
}
</style>
