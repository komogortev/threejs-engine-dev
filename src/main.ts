import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import './style.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.mount('#app')

if (import.meta.env.DEV) {
  import('./utils/seedSpaceHome').then(({ seedSpaceHome, clearSpaceHome }) => {
    const w = window as unknown as Record<string, unknown>
    w.__seedSpaceHome = seedSpaceHome
    w.__clearSpaceHome = clearSpaceHome
    console.log('[dev] __seedSpaceHome(opts?) | __clearSpaceHome() available')
  })
}
