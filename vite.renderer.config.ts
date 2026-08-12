import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { APP_NAME } from './src/shared/constants'

function productIdentityPlugin(): Plugin {
  return {
    name: 'product-identity',
    transformIndexHtml(html) {
      return html.replaceAll('__APP_NAME__', APP_NAME)
    },
  }
}

function playerBundlePlugin(): Plugin {
  const virtualId = 'virtual:player-bundle'
  const resolvedVirtualId = `\0${virtualId}`
  return {
    name: 'embedded-player-bundle',
    resolveId(id) {
      return id === virtualId ? resolvedVirtualId : undefined
    },
    load(id) {
      if (id !== resolvedVirtualId) return undefined
      const bundlePath = resolve(__dirname, 'dist-player/player.iife.js')
      return `export default ${JSON.stringify(readFileSync(bundlePath, 'utf8'))}`
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [productIdentityPlugin(), react(), playerBundlePlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist-renderer',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
