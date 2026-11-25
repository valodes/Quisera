import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': `http://127.0.0.1:${process.env['API_PORT'] ?? '3000'}`,
      '/health': `http://127.0.0.1:${process.env['API_PORT'] ?? '3000'}`,
    },
    port: Number(process.env['WEB_PORT'] ?? 3131),
    strictPort: true,
  },
})
