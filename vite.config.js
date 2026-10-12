import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { printPdfPlugin } from './server/printPdfPlugin.js'

export default defineConfig({
  plugins: [react(), tailwindcss(), printPdfPlugin()],
})
