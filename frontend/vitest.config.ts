import { fileURLToPath, URL } from 'node:url'
import Vue from '@vitejs/plugin-vue'
import Vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    Vue({
      template: { transformAssetUrls },
    }),
    Vuetify({
      autoImport: true,
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('src', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    css: false,
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    server: {
      deps: {
        inline: ['vuetify'],
      },
    },
  },
})
