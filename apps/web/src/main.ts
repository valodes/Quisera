import { createApp } from 'vue'
import AppShell from '@/app/layouts/AppShell.vue'
import router from '@/router'
import { initTheme } from '@/styles/themes'
import './style.css'

initTheme()
createApp(AppShell).use(router).mount('#app')
