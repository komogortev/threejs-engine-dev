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
      path: '/editor',
      name: 'editor',
      component: () => import('@/views/SceneEditorPage.vue'),
    },
    {
      path: '/editor-legacy',
      name: 'editor-legacy',
      component: () => import('@/views/EditorView.vue'),
    },
    {
      path: '/waypoints',
      name: 'waypoints',
      component: () => import('@/views/WaypointEditorPage.vue'),
    },
    {
      path: '/sandbox',
      name: 'sandbox',
      component: () => import('@/views/SandboxView.vue'),
    },
    {
      path: '/room',
      name: 'room',
      component: () => import('@/views/RoomPlayerView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})
