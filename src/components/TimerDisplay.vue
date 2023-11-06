<script setup lang="ts">
import type { Event } from '@/composables/useTimingRecovery'
import { useIntervalFn, useTimeoutFn } from '@vueuse/core'
import { computed, onUnmounted, ref, toRef, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    doUpdates?: boolean
    period: number
    duration: number
    next: Event | null
  }>(),
  { doUpdates: true }
)

const timerUpdated = ref(false)
const updateTimer = () => (timerUpdated.value = !timerUpdated.value)
const timerUpdater = useIntervalFn(() => updateTimer(), 1_000, {
  immediate: false,
  immediateCallback: true
})
watch([toRef(props, 'next'), toRef(props, 'doUpdates')], ([next, doUpdates]) => {
  timerUpdater.pause()
  if (!doUpdates || !next) return
  const r = (next.date - Date.now()) % 1000
  const w = r >= 0 ? r : r + 1000
  useTimeoutFn(() => timerUpdater.resume(), w) // useTImeoutFn doesn't create effects?; so it should be safe to use inside watch
})

const remainingToNext = computed(() => {
  if (!props.doUpdates || !props.next) return '-h--m--s'
  timerUpdated.value
  return t((props.next.date - Date.now()) / 1000)
})

function t(secs: number) {
  if (!isFinite(secs)) return '?'
  const neg = secs < 0
  secs = Math.abs(secs)
  const s = secs % 60
  const m = ((secs - s) / 60) % 60
  const h = ((secs - s) / 60 - m) / 60
  const atLeastAnHour = h > 0
  const atLeastAMinute = atLeastAnHour || m > 0
  const underTenSeconds = !atLeastAMinute && s < 10
  const ss =
    (underTenSeconds
      ? s.toFixed(1)
      : atLeastAMinute
      ? s.toFixed(0).padStart(2, '0')
      : s.toFixed(0)) + 's'
  const ms = atLeastAMinute
    ? (atLeastAnHour ? m.toString().padStart(2, '0') : m.toString()) + 'm'
    : ''
  const hs = atLeastAnHour ? h.toString() + 'h' : ''
  return (neg ? '-' : '') + hs + ms + ss
}

onUnmounted(() => timerUpdater.pause())
</script>

<template>
  <div id="container">
    <section id="timer" class="column">
      <header>Time until next signal {{ props.next?.type ?? 'event' }}</header>
      <div>{{ remainingToNext }}</div>
    </section>
    <section id="times" class="column">
      <header>Measured Timings</header>
      <div>Period: {{ t(props.period) }}</div>
      <div>Duration: {{ t(props.duration) }}</div>
    </section>
  </div>
</template>

<style scoped>
#container {
  margin: 10px;
  border: 1px solid;
  padding: 5px;
  width: fit-content;

  display: flex;
  flex-flow: row wrap;
  align-items: flex-start;
  gap: 20px;
}
section {
  display: flex;
  flex-flow: column;
}
section > * {
  width: max-content;
}

#timer {
  flex: 60;
  align-items: flex-end;
}
#times {
  flex: 60;
  align-items: flex-start;
}

#timer div {
  font-family: monospace;
  font-size: 300%;
}
#times div {
  font-size: 150%;
}
</style>
