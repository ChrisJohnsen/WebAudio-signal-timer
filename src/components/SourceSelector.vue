<script setup lang="ts">
import { useUserMedia } from '@vueuse/core'
import { computed, onMounted, onUnmounted, ref, toRef, watch } from 'vue'
import DemoAudio from './DemoAudio.vue'

const props = defineProps<{ audioContext: AudioContext; active: boolean }>()
const emit = defineEmits<{
  source: [source: AudioNode | undefined]
}>()

const userMediaEnabled = ref(false)

const userMediaStream = ref<MediaStream | undefined>()
type SelectionType = 'none' | number | 'demo'
const sources = computed(() => {
  const map = new Map<SelectionType, string>()
  map.set('none', 'none')
  userMediaStream.value
    ?.getAudioTracks()
    .forEach((t, i) => map.set(i, t.label || `unnamed source ${i}`))
  map.set('demo', 'generated demo audio')
  return map
})

const selectedSource = ref<SelectionType>('none')

watch(userMediaStream, (s) => {
  if (typeof selectedSource.value == 'number') selectedSource.value = 'none'
  if (!s) return

  const v = s.getVideoTracks()
  v.forEach((t) => {
    t.stop()
    t.enabled = false
    s.removeTrack(t)
  })

  s.getAudioTracks().forEach((t) => (t.enabled = false))
})

watch(selectedSource, (sel) => {
  const s = userMediaStream.value

  if (sel == 'none') return emitSource(undefined)

  if (sel == 'demo') return // child component takes care of the rest

  if (!s) return emitSource(undefined)

  const a = s.getAudioTracks()
  const ec = a.reduce((c, t) => c + Number(t.enabled), 0)
  if (ec) console.warn('enabled track count != 0', ec)

  if (!isFinite(sel) || 0 > sel || sel >= a.length) emitSource(undefined)

  const track = a[sel].clone()
  track.enabled = true
  const mediaStream = new MediaStream([track])

  const node = new MediaStreamAudioSourceNode(props.audioContext, { mediaStream })

  emitSource(node)
})
watch(toRef(props, 'audioContext'), () => {
  // eslint-disable-next-line no-self-assign
  selectedSource.value = selectedSource.value // rebuild source
})

const enabledEl = ref<HTMLInputElement | null>(null)
onMounted(() => {
  if (enabledEl.value) enabledEl.value.checked = userMediaEnabled.value
  const userMedia = useUserMedia({ constraints: { audio: true }, enabled: userMediaEnabled })
  watch(userMedia.stream, (s) => (userMediaStream.value = s))
})
onUnmounted(() => {
  stopStream(userMediaStream.value)
  userMediaEnabled.value = false
})

function stopStream(s: MediaStream | undefined) {
  s?.getTracks().forEach((t) => t.stop())
}

let activeNode: AudioNode | undefined
function emitSource(node: typeof activeNode) {
  if (activeNode instanceof MediaStreamAudioSourceNode) {
    stopStream(activeNode.mediaStream)
    activeNode.disconnect()
  }
  activeNode = node
  emit('source', node)
}
</script>

<template>
  <input id="enabled" type="checkbox" ref="enabledEl" v-model="userMediaEnabled" />
  <label for="enabled"> Enable user media (e.g. mic)?</label>
  <br />
  <label for="source-selection">Audio Source: </label>
  <select id="source-selection" name="source" v-model="selectedSource">
    <option v-for="[i, c] of sources" :key="i" :value="i" v-text="c"></option>
  </select>
  <DemoAudio
    v-if="selectedSource == 'demo'"
    :audio-context="props.audioContext"
    :active="props.active"
    @source="emitSource"
  />
</template>
