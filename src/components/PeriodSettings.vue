<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    minimumReportingPeriod: number
    period: number | undefined
    duration: number | undefined
    reportingPeriod: number
    defaultReportingPeriod?: number
  }>(),
  { defaultReportingPeriod: 1 }
)

const emit = defineEmits<{
  'update:period': [period: number | undefined]
  'update:duration': [duration: number | undefined]
  'update:reporting-period': [reportingPeriod: number]
}>()

const period = computed({
  get() {
    return props.period
  },
  set(p: number | string | undefined) {
    if (typeof p == 'string') emit('update:period', undefined)
    else emit('update:period', p)
  }
})
const duration = computed({
  get() {
    return props.duration
  },
  set(d: number | string | undefined) {
    if (typeof d == 'string') emit('update:duration', undefined)
    else emit('update:duration', d)
  }
})
const reportingPeriod = computed({
  get() {
    return props.reportingPeriod
  },
  set(r: string | number) {
    if (typeof r == 'string') return // happens when field is empty (or otherwise not parsable as a number?), don't try to update it
    emit('update:reporting-period', r)
  }
})
const automatic = computed({
  get() {
    return automaticRef.value
  },
  set(a: boolean) {
    automaticRef.value = a
  }
})

const automaticRef = ref(true)
const autoReportingPeriod = computed(() => {
  if (props.duration != null) {
    const drp = props.duration / 2
    if (props.period != null) {
      const prp = (props.period - props.duration) / 2
      return Math.min(drp, prp)
    } else return drp
  } else return props.defaultReportingPeriod
})
watch([automaticRef, autoReportingPeriod], ([a, arp]) => a && (reportingPeriod.value = arp), {
  immediate: true
})

const autoEl = ref<HTMLInputElement | null>(null)
const manualEl = ref<HTMLInputElement | null>(null)
onMounted(() => {
  if (autoEl.value) autoEl.value.checked = automaticRef.value

  watch(
    automaticRef,
    (a, oa) => {
      if (manualEl.value)
        if (a) {
          manualEl.value.disabled = true
        } else {
          manualEl.value.disabled = false
          if (oa) manualEl.value.focus()
        }
    },
    { immediate: true }
  )
})

const warnings = computed(() => {
  const w = new Array<string>()
  if (props.reportingPeriod < props.minimumReportingPeriod)
    w.push(
      `Requested reporting period is less than the minimum (${props.minimumReportingPeriod}s). Analysis time-resolution will be lower than requested.`
    )
  const erp = Math.max(props.minimumReportingPeriod, props.reportingPeriod)
  if (props.duration && props.duration < 2 * erp)
    w.push(
      `Duration being less than twice the effective reporting period (${
        2 * erp
      }s) may cause significant measurement error (missed signals causing inflated period and deflated duration).`
    )
  if (props.period && props.duration && props.period - props.duration < 2 * erp)
    w.push(
      `"Silent" portion (period minus duration) being less than twice the effective reporting period (${
        2 * erp
      }s) may cause significant measurement error (missed loss-of-signal events causing inflated period and duration).`
    )
  return w
})
</script>

<template>
  <label for="expected-period">Expected Signal Period: </label
  ><input id="expected-period" type="number" v-model="period" />
  <br />
  <label for="expected-duration">Expected Signal Duration: </label
  ><input id="expected-duration" type="number" v-model="duration" />
  <br />
  <div>
    Reporting Period:
    <span v-text="props.reportingPeriod"></span>s
    <input
      ref="autoEl"
      id="reporting-automatic"
      type="checkbox"
      name="automatic"
      v-model="automatic"
    />
    <label for="reporting-automatic">Automatic? </label>
    <input ref="manualEl" id="reporting-period" type="number" v-model="reportingPeriod" />
    <div v-if="warnings.length">
      Warnings:
      <ul>
        <li v-for="w of warnings" v-text="w" :key="w"></li>
      </ul>
    </div>
  </div>
</template>
