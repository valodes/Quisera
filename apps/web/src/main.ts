import { createApp } from 'vue'
import AppShell from '@/app/layouts/AppShell.vue'
import router from '@/router'
import { initTheme } from '@/styles/themes'
import '@fontsource-variable/manrope'
import '@fontsource-variable/dm-sans'
import './styles/tailwind.css'
import './style.scss'

initTheme()
createApp(AppShell).use(router).mount('#app')
