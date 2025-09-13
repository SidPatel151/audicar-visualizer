import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173
  },
  resolve: {
    alias: {
      'three': 'three'
    }
  },
  optimizeDeps: {
    include: ['three', 'dat.gui', 'simplex-noise']
  },
  build: {
    commonjsOptions: {
      include: [/three/, /dat\.gui/, /simplex-noise/]
    }
  }
}) 