<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppDrawer from './AppDrawer.vue'
import UserMenu from './UserMenu.vue'
import NotificationMenu from './NotificationMenu.vue'

const route = useRoute()

const sectionTitle = computed(() => {
  const name = route.name as string
  const titles: Record<string, string> = {
    'admin-items': 'Gerenciamento de Itens',
    'admin-item-new': 'Novo Item',
    'admin-item-detail': 'Detalhes do Item',
    'admin-lost-reports': 'Relatos de Perdas',
    'admin-buildings': 'Prédios',
    'admin-categories': 'Categorias',
    'admin-handovers': 'Registro de Entregas',
    'admin-disposition-rules': 'Regras de Destinação',
    'admin-dispositions': 'Destinações Executadas',
    'admin-admins': 'Gerenciamento de Administradores',
  }
  return titles[name] || 'Painel Administrativo'
})
</script>

<template>
  <div class="admin-layout">
    <AppDrawer />
    <v-app-bar flat border class="px-4 bg-surface" elevation="0">
      <v-app-bar-title class="text-subtitle-1 font-weight-bold text-grey-darken-3">
        {{ sectionTitle }}
      </v-app-bar-title>
      <v-spacer />
      <div class="d-flex align-center">
        <NotificationMenu />
        <UserMenu />
      </div>
    </v-app-bar>

    <v-main class="bg-background">
      <v-container fluid class="pa-6">
        <router-view />
      </v-container>
    </v-main>
  </div>
</template>
