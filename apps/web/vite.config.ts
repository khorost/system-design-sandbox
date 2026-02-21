import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import rootPkg from '../../package.json'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
  },
  server: {
    host: '0.0.0.0',
    port: 5176,
    allowedHosts: ['dev.sdsandbox.ru'],
    proxy: {
      '/api': 'https://dev.sdsandbox.ru',
      '/auth': 'https://dev.sdsandbox.ru',
      '/ws': {
        target: 'https://dev.sdsandbox.ru',
        ws: true,
      },
    },
  },
})
