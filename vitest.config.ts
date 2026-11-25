import webConfig from './apps/web/vite.config.ts'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: webConfig.plugins,
  resolve: webConfig.resolve,
  test: {
    environment: 'happy-dom',
    include: ['apps/**/*.{test,spec}.{js,ts}', 'packages/**/*.{test,spec}.{js,ts}'],
    exclude: ['**/node_modules/**', 'apps/**/tests/e2e/**'],
  },
})
