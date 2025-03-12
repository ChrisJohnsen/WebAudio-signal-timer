import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { createViteLicensePlugin } from 'rollup-license-plugin'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { vitePluginVersionMark } from 'vite-plugin-version-mark'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    VitePWA({
      injectRegister: false,
      registerType: 'prompt',
      workbox: { globPatterns: ['**/*.{html,css,js,json}'] }
      // devOptions: {
      //   enabled: true
      // }
    }),
    vitePluginVersionMark({
      ifGitSHA: true,
      ifShortSHA: true,
      ifLog: false,
      ifMeta: true,
      ifGlobal: false
    }),
    createViteLicensePlugin({
      outputFilename: 'licenses.json',
      unacceptableLicenseTest: (licenseID) => licenseID != 'MIT'
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
