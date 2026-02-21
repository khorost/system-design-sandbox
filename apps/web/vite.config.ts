import fs from 'node:fs'
import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

import rootPkg from '../../package.json'

/**
 * Injects the correct config script tag into index.html.
 *
 * - dev:   loads /config.dev.js (local overrides, gitignored)
 *          with fallback to /config.js if config.dev.js doesn't exist
 * - build: loads /config.js (replaced at deploy time via volume mount)
 */
function configScriptPlugin(): Plugin {
  return {
    name: 'inject-config-script',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (ctx.server) {
          // Dev mode — prefer config.dev.js if it exists
          const devPath = path.resolve(__dirname, 'public/config.dev.js')
          const file = fs.existsSync(devPath) ? '/config.dev.js' : '/config.js'
          return html.replace(
            '<!-- __CONFIG_SCRIPT__ -->',
            `<script type="text/javascript" src="${file}"></script>`,
          )
        }
        // Production build
        return html.replace(
          '<!-- __CONFIG_SCRIPT__ -->',
          '<script type="text/javascript" src="/config.js"></script>',
        )
      },
    },
  }
}

export default defineConfig({
  plugins: [configScriptPlugin(), react(), tailwindcss()],
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
