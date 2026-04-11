import { createRouter, createWebHistory } from 'vue-router'
import { getAppBaseUrl } from '@/utils/resolvePublicUrl'

export const router = createRouter({
  history: createWebHistory(getAppBaseUrl()),
  routes: [
    {
      path: '/',
      name: 'menu',
      component: () => import('@/views/MenuView.vue'),
    },
    {
      path: '/game',
      name: 'game',
      component: () => import('@/views/GameView.vue'),
    },
    {
      path: '/scene',
      name: 'scene',
      component: () => import('@/views/SceneView.vue'),
    },
    {
      path: '/editor',
      name: 'editor',
      component: () => import('@/views/EditorView.vue'),
    },
    {
      path: '/sandbox',
      name: 'sandbox',
      component: () => import('@/views/SandboxView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
    },
    {
      path: '/waypoints',
      name: 'waypoints',
      component: () => import('@/views/WaypointEditorPage.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})
