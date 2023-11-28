import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { vitePluginVersionMark } from 'vite-plugin-version-mark'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      injectRegister: false,
      registerType: 'prompt'
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
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
