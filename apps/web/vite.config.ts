import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

function preloadPrimaryFonts(): Plugin {
  return {
    name: 'quisera:preload-primary-fonts',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        if (!ctx.bundle) return []
        const preloadFiles = Object.keys(ctx.bundle).filter(
          (fileName) =>
            fileName.endsWith('.woff2') &&
            (fileName.includes('manrope-latin-wght-normal') ||
              fileName.includes('dm-sans-latin-wght-normal')),
        )
        return preloadFiles.map((fileName) => ({
          tag: 'link',
          attrs: {
            rel: 'preload',
            as: 'font',
            type: 'font/woff2',
            href: `/${fileName}`,
            crossorigin: '',
          },
          injectTo: 'head',
        }))
      },
    },
  }
}

export default defineConfig({
  plugins: [vue(), tailwindcss(), preloadPrimaryFonts()],
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
              name: 'vendor-auth',
              test: /node_modules[\\/](better-auth|better-call)[\\/]/,
              priority: 12,
            },
            {
              name: 'vendor-zod',
              test: /node_modules[\\/]zod[\\/]/,
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
