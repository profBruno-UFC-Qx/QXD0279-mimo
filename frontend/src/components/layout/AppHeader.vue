<script setup lang="ts">
import { useAuthStore } from '@/stores/authStore.ts'
import UserMenu from './UserMenu.vue'
import NotificationMenu from './NotificationMenu.vue'

const auth = useAuthStore()
</script>

<template>
  <v-app-bar flat color="primary" class="px-4" elevation="0">
    <!-- Logo / Nome à esquerda -->
    <v-app-bar-title class="font-weight-bold d-flex align-center">
      <router-link to="/items" class="text-decoration-none d-flex align-center" style="color: #FFFFFF;">
        <v-icon icon="mdi-archive-search" size="28" class="mr-2" style="color: #FFFFFF;" />
        <span class="text-h6 font-weight-black tracking-wide" style="color: #FFFFFF;">Achadex</span>
      </router-link>
    </v-app-bar-title>

    <!-- Navegação central/esquerda -->
    <div class="d-none d-md-flex align-center ml-6"> 
      <v-btn
        variant="text"
        to="/items"
        style="color: on-primary;";
        class="text-none font-weight-medium px-4"
        prepend-icon="mdi-format-list-bulleted"
      >
        Itens
      </v-btn>
      <v-btn
        variant="text"
        to="/buildings"
        style="color: on-primary;"
        class="text-none font-weight-medium px-4"
        prepend-icon="mdi-domain"
      >
        Prédios
      </v-btn>
      <v-btn
        v-if="auth.isAuthenticated"
        variant="text"
        to="/lost-reports"
        style="color: on-primary;"
        class="text-none font-weight-medium px-4"
        prepend-icon="mdi-alert-box-outline"
      >
        Minhas Perdas
      </v-btn>
    </div>

    <v-spacer />

    <!-- A direita: Sino de notificação e Perfil -->
    <div class="d-flex align-center">
      <NotificationMenu />
      <UserMenu />
    </div>
  </v-app-bar>
</template>
