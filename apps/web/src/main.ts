import { createApp } from 'vue'
import AppShell from '@/app/layouts/AppShell.vue'
import router from '@/router'
import './style.css'

createApp(AppShell).use(router).mount('#app')
