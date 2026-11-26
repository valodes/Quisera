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
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor-vue',
              test: /node_modules[\\/](vue|@vue|vue-router|@tanstack)[\\/]/,
              priority: 20,
            },
            {
              name: 'vendor-ui',
              test: /node_modules[\\/](reka-ui|@lucide|@floating-ui|@vueuse|@internationalized)[\\/]/,
              priority: 15,
            },
            {
              name: 'vendor-auth-zod',
              test: /node_modules[\\/](better-auth|better-call|zod)[\\/]/,
              priority: 10,
            },
          ],
        },
      },
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
