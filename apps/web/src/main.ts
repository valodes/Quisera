import { VueQueryPlugin } from '@tanstack/vue-query'
import { createApp } from 'vue'
import AppShell from '@/app/layouts/AppShell.vue'
import { queryClient } from '@/lib/query'
import router from '@/router'
import { initTheme } from '@/styles/themes'
import '@fontsource-variable/manrope'
import '@fontsource-variable/dm-sans'
import './styles/tailwind.css'
import './style.scss'

initTheme()
const app = createApp(AppShell)
app.config.errorHandler = (error, _instance, info) => {
  console.error('[Quisera] Unhandled Vue error:', info, error)
}
app.use(router).use(VueQueryPlugin, { queryClient }).mount('#app')
