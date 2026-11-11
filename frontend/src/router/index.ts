import { createRouter, createWebHistory } from 'vue-router'
import ItemsView from '@/views/ItemsView.vue'
import BuildingsView from '@/views/BuildingsView.vue'
import LostReportsView from '@/views/LostReportsView.vue'
import ProfileView from '@/views/ProfileView.vue'
import HistoryView from '@/views/HistoryView.vue'
import LoginView from '@/views/LoginView.vue'
import RegisterView from '@/views/RegisterView.vue'
import { useAuthStore } from '@/stores/authStore'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/items',
    },
    {
      path: '/items',
      name: 'items',
      component: ItemsView,
    },
    {
      path: '/buildings',
      name: 'buildings',
      component: BuildingsView,
    },
    {
      path: '/lost-reports',
      name: 'lost-reports',
      component: LostReportsView,
      meta: { requiresAuth: true },
    },
    {
      path: '/profile',
      name: 'profile',
      component: ProfileView,
      meta: { requiresAuth: true },
    },
    {
      path: '/history',
      name: 'history',
      component: HistoryView,
      meta: { requiresAuth: true },
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
    },
    {
      path: '/register',
      name: 'register',
      component: RegisterView,
    },
  ],
})

router.beforeEach((to, from, next) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    next({ name: 'login' })
  } else {
    next()
  }
})

export default router
