import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

import PublicLayout from '@/components/layout/PublicLayout.vue'
import AdminShell from '@/components/layout/AdminShell.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // Public & User Area (nested under PublicLayout)
    {
      path: '/',
      component: PublicLayout,
      children: [
        {
          path: '',
          name: 'home',
          component: () => import('@/views/public/HomeView.vue'),
        },
        {
          path: 'items',
          redirect: '/',
        },
        {
          path: 'itens/:id',
          name: 'item-detail',
          component: () => import('@/views/public/ItemDetailView.vue'),
        },
        {
          path: 'predios',
          name: 'buildings',
          component: () => import('@/views/public/BuildingsView.vue'),
        },
        {
          path: 'entrar',
          name: 'login',
          component: () => import('@/views/public/LoginView.vue'),
          meta: { guest: true },
        },
        {
          path: 'login',
          redirect: '/entrar',
        },
        {
          path: 'registrar',
          name: 'register',
          component: () => import('@/views/public/RegisterView.vue'),
          meta: { guest: true },
        },
        {
          path: 'register',
          redirect: '/registrar',
        },
        {
          path: 'minhas-perdas',
          name: 'my-lost-reports',
          component: () => import('@/views/user/MyLostReportsView.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'lost-reports',
          redirect: '/minhas-perdas',
        },
        {
          path: 'minhas-perdas/nova',
          name: 'new-lost-report',
          component: () => import('@/views/user/NewLostReportView.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'minhas-perdas/:id',
          name: 'lost-report-detail',
          component: () => import('@/views/user/LostReportDetailView.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'perfil',
          name: 'profile',
          component: () => import('@/views/user/ProfileView.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'historico',
          name: 'my-handovers',
          component: () => import('@/views/user/MyHandoversView.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'history',
          redirect: '/historico',
        },
        {
          path: 'notificacoes',
          name: 'notifications',
          component: () => import('@/views/user/NotificationsView.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: '403',
          name: 'forbidden',
          component: () => import('@/views/errors/ForbiddenView.vue'),
        },
        {
          path: ':pathMatch(.*)*',
          name: 'not-found',
          component: () => import('@/views/errors/NotFoundView.vue'),
        },
      ],
    },

    // Admin Area (nested under AdminShell)
    {
      path: '/admin',
      component: AdminShell,
      meta: { requiresAuth: true, roles: ['ADMIN', 'SUPERADMIN'] },
      children: [
        {
          path: '',
          redirect: { name: 'admin-items' },
        },
        {
          path: 'dashboard',
          name: 'admin-dashboard',
          component: () => import('@/views/admin/AdminDashboardView.vue'),
        },
        {
          path: 'itens',
          name: 'admin-items',
          component: () => import('@/views/admin/AdminItemsView.vue'),
        },
        {
          path: 'itens/novo',
          name: 'admin-item-new',
          component: () => import('@/views/admin/AdminItemFormView.vue'),
        },
        {
          path: 'itens/:id',
          name: 'admin-item-detail',
          component: () => import('@/views/admin/AdminItemDetailView.vue'),
        },
        {
          path: 'perdas',
          name: 'admin-lost-reports',
          component: () => import('@/views/admin/AdminLostReportsView.vue'),
        },
        {
          path: 'predios',
          name: 'admin-buildings',
          component: () => import('@/views/admin/AdminBuildingsView.vue'),
        },
        {
          path: 'categorias',
          name: 'admin-categories',
          component: () => import('@/views/admin/AdminCategoriesView.vue'),
        },
        {
          path: 'entregas',
          name: 'admin-handovers',
          component: () => import('@/views/admin/AdminHandoversView.vue'),
        },
        {
          path: 'regras-destinacao',
          name: 'admin-disposition-rules',
          component: () => import('@/views/admin/AdminDispositionRulesView.vue'),
        },
        {
          path: 'destinacoes',
          name: 'admin-dispositions',
          component: () => import('@/views/admin/AdminDispositionsView.vue'),
        },
        {
          path: 'admins',
          name: 'admin-admins',
          component: () => import('@/views/admin/AdminAdminsView.vue'),
          meta: { roles: ['SUPERADMIN'] },
        },
      ],
    },
  ],
})

router.beforeEach(async (to, from, next) => {
  const auth = useAuthStore()

  // If token exists but user is not loaded yet, fetchMe first
  if (auth.token && !auth.user) {
    await auth.fetchMe()
  }

  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth)
  const isGuestRoute = to.matched.some((record) => record.meta.guest)
  const allowedRoles = to.meta.roles as string[] | undefined

  if (requiresAuth && !auth.isAuthenticated) {
    return next({ name: 'login', query: { redirect: to.fullPath } })
  }

  if (isGuestRoute && auth.isAuthenticated) {
    return next({ name: 'home' })
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const userRole = auth.role
    if (!userRole || !allowedRoles.includes(userRole)) {
      return next({ name: 'forbidden' })
    }
  }

  next()
})

export default router
