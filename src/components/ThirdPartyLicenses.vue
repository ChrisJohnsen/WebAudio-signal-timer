<script setup lang="ts">
import { nextTick, ref, toRef, watch } from 'vue'

export type LicenseData = {
  name: string
  version: string
  license: string
  licenseText: string
}
const props = defineProps<{ licenseData: any }>()
const licenses = ref(new Array<LicenseData>())
watch(
  toRef(props, 'licenseData'),
  (j) => {
    if (!Array.isArray(j)) return

    const ls = j.filter(validateLicenseData)
    ls.sort((a, b) => a.name.localeCompare(b.name))
    licenses.value = ls

    function validateLicenseData(o: unknown): o is LicenseData {
      if (typeof o != 'object' || o == null) return fail('license entry is not an object: ', o)

      if (!('name' in o && typeof o.name == 'string'))
        return fail('license entry missing "name" prop: ', o)
      if (!('version' in o) || typeof o.version != 'string')
        return fail('license entry missing "version" prop: ', o)
      if (!('license' in o) || typeof o.license != 'string')
        return fail('license entry missing "license" prop: ', o)
      if (!('licenseText' in o) || typeof o.licenseText != 'string')
        return fail('license entry missing "licenseText" prop: ', o)

      return true

      function fail(...args: unknown[]): false {
        console.warn(...args)
        return false
      }
    }
  },
  { immediate: true }
)

const licenseTextArea = ref<HTMLTextAreaElement | undefined>()
const shownName = ref<string | undefined>()
const shownText = ref('')
function show(i: number): void {
  const data = licenses.value[i]
  if (shownName.value == data.name) return (shownName.value = undefined)
  shownName.value = data.name
  shownText.value = data.licenseText
  nextTick(() => {
    licenseTextArea.value?.focus()
  })
}
</script>

<template>
  <table>
    <caption>
      Bundled Third-party Software
    </caption>
    <thead>
      <tr>
        <th>Name</th>
        <th>Version</th>
        <th>License</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(pkg, i) of licenses" :key="i">
        <td v-text="pkg.name"></td>
        <td v-text="pkg.version"></td>
        <td v-if="pkg.licenseText">
          <button @click="show(i)" v-text="pkg.license"></button>
        </td>
        <td v-else v-text="pkg.license"></td>
      </tr>
    </tbody>
  </table>
  <template v-if="shownName != null">
    <p id="licenseText">License for {{ shownName }}:</p>
    <textarea ref="licenseTextArea" readonly v-text="shownText" cols="80" rows="20"></textarea>
  </template>
</template>
