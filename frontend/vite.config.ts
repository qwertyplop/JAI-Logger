import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/', // Monolith, base is always root
  build: {
    outDir: 'dist',
  }
})
