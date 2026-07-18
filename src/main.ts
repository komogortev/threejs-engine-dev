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
  import('./utils/s5AnimSpike').then(({ s5AnimSpike }) => {
    const w = window as unknown as Record<string, unknown>
    w.__s5AnimSpike = s5AnimSpike
    console.log('[dev] __s5AnimSpike(url?) available')
  })
  import('./utils/s5cRoomZip').then(({ s5cRoomZip }) => {
    const w = window as unknown as Record<string, unknown>
    w.__s5cRoomZip = s5cRoomZip
    console.log('[dev] __s5cRoomZip(charUrl?) available')
  })
  import('./utils/seedXBot').then(({ seedXBot, clearXBot }) => {
    const w = window as unknown as Record<string, unknown>
    w.__seedXBot = seedXBot
    w.__clearXBot = clearXBot
    console.log('[dev] __seedXBot() | __clearXBot() available')
  })
}
