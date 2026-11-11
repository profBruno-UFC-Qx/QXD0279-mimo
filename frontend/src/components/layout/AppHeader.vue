<script setup lang="ts">
import { useAuthStore } from '@/stores/authStore'
import UserMenu from './UserMenu.vue'
import NotificationMenu from './NotificationMenu.vue'

const auth = useAuthStore()
</script>

<template>
  <v-app-bar flat color="surface" border class="px-4" elevation="0">
    <!-- Logo / Nome à esquerda -->
    <v-app-bar-title class="font-weight-bold d-flex align-center">
      <router-link to="/" class="text-decoration-none d-flex align-center text-primary">
        <v-icon icon="mdi-archive-search" size="28" class="mr-2" color="primary" />
        <span class="text-h6 font-weight-black tracking-wide">Achadex</span>
      </router-link>
    </v-app-bar-title>

    <!-- Navegação central -->
    <div class="d-none d-md-flex align-center ml-6"> 
      <v-btn
        variant="text"
        to="/"
        exact
        class="text-none font-weight-medium px-4 text-grey-darken-3 mr-2"
        active-class="text-primary font-weight-bold"
        prepend-icon="mdi-format-list-bulleted"
      >
        Itens
      </v-btn>
      <v-btn
        variant="text"
        to="/predios"
        exact
        class="text-none font-weight-medium px-4 text-grey-darken-3 mr-2"
        active-class="text-primary font-weight-bold"
        prepend-icon="mdi-domain"
      >
        Prédios
      </v-btn>
      <v-btn
        v-if="auth.isLoggedIn"
        variant="text"
        to="/minhas-perdas"
        exact
        class="text-none font-weight-medium px-4 text-grey-darken-3"
        active-class="text-primary font-weight-bold"
        prepend-icon="mdi-alert-box-outline"
      >
        Minhas perdas
      </v-btn>
    </div>

    <v-spacer />

    <!-- A direita: deslogado (Entrar / Criar conta) ou logado (Sino + UserMenu) -->
    <div class="d-flex align-center">
      <template v-if="!auth.isLoggedIn">
        <v-btn
          variant="tonal"
          to="/entrar"
          class="text-none mr-2 font-weight-medium text-primary"
        >
          Entrar
        </v-btn>
        <v-btn
          color="primary"
          to="/registrar"
          class="text-none font-weight-medium"
        >
          Criar conta
        </v-btn>
      </template>
      <template v-else>
        <NotificationMenu />
        <UserMenu />
      </template>
    </div>
  </v-app-bar>
</template>
