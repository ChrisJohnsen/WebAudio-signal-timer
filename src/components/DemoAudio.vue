<script setup lang="ts">
import useNoisyPeriodicBeep from '@/composables/useNoisyPeriodicBeep'
import { onMounted, ref, toRef, watch } from 'vue'

const props = defineProps<{ audioContext: BaseAudioContext; active: boolean }>()
const emit = defineEmits<{ source: [node: AudioNode] }>()

const snr_dB = ref(30)
const gain = ref(1)
const frequency = ref(440)
const duration = ref(1)
const durationSD = ref(0.2)
const period = ref(5)
const periodSD = ref(1)

let periodic: ReturnType<typeof useNoisyPeriodicBeep> | undefined

watch(toRef(props, 'active'), (a) => {
  if (a) periodic?.stop.start()
  else periodic?.stop.stop()
})

onMounted(() =>
  watch(
    toRef(props, 'audioContext'),
    (ctx) => {
      periodic?.shutdown()

      periodic = useNoisyPeriodicBeep(
        ctx,
        snr_dB,
        {
          frequency,
          duration: { mean: duration, stddev: durationSD },
          period: { mean: period, stddev: periodSD }
        },
        gain
      )
      emit('source', periodic.node)
    },
    { immediate: true }
  )
)
</script>

<template>
  <fieldset>
    <legend>Demo Audio Settings</legend>
    <div>
      <label for="demo-gain">Gain</label
      ><input id="demo-gain" type="number" v-model="gain" min="0" />
    </div>
    <div>
      <label for="beep-frequency">Beep Frequency (Hz):</label
      ><input id="beep-frequency" type="number" v-model="frequency" min="1" />
    </div>
    <div>
      <label for="beep-duration">Beep Duration (s):</label
      ><input id="beep-duration" type="number" v-model="duration" min="0" :max="period" />
      <label for="beep-duration-sd"> &sigma; </label>
      <input id="beep-duration-sd" type="number" v-model="durationSD" />
    </div>
    <div>
      <label for="beep-period">Beep Period (s):</label
      ><input id="beep-period" type="number" v-model="period" min="1" />
      <label for="beep-period-sd"> &sigma; </label>
      <input id="beep-period-sd" type="number" v-model="periodSD" />
    </div>
    <div>
      <label for="beep-snr">Beep SNR (power-to-power; dB):</label
      ><input id="beep-snr" type="number" v-model="snr_dB" min="0" />
    </div>
  </fieldset>
</template>
