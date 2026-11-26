<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from 'vuetify'
import { useAuthStore } from '@/stores/authStore'
import UserMenu from './UserMenu.vue'
import NotificationMenu from './NotificationMenu.vue'

const auth = useAuthStore()
const route = useRoute()
const theme = useTheme()
const isLoginRoute = computed(() => route.path === '/entrar')
const isDark = computed(() => theme.global.name.value === 'achadexDark')

const toggleTheme = () => {
  const newTheme = isDark.value ? 'achadexLight' : 'achadexDark'
  theme.global.name.value = newTheme
  if (typeof window !== 'undefined') {
    localStorage.setItem('achadex.theme', newTheme)
  }
}

const emit = defineEmits<{
  (e: 'toggle-drawer'): void
}>()
</script>

<template>
  <v-app-bar flat color="surface" border class="px-2 px-sm-4" elevation="0">
    <v-app-bar-nav-icon
      class="d-md-none mr-1"
      aria-label="Abrir menu de navegação"
      @click="emit('toggle-drawer')"
    />

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
        class="text-none font-weight-medium px-4 text-medium-emphasis mr-2"
        active-class="text-primary font-weight-bold"
        prepend-icon="mdi-format-list-bulleted"
      >
        Itens
      </v-btn>
      <v-btn
        variant="text"
        to="/predios"
        exact
        class="text-none font-weight-medium px-4 text-medium-emphasis mr-2"
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
        class="text-none font-weight-medium px-4 text-medium-emphasis"
        active-class="text-primary font-weight-bold"
        prepend-icon="mdi-alert-box-outline"
      >
        Minhas perdas
      </v-btn>
    </div>

    <v-spacer />

    <!-- A direita: deslogado (Entrar / Criar conta) ou logado (Sino + UserMenu) -->
    <div class="d-flex align-center">
      <v-btn
        icon
        variant="text"
        class="mr-2"
        :aria-label="isDark ? 'Mudar para modo claro' : 'Mudar para modo escuro'"
        @click="toggleTheme"
      >
        <v-icon :icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'" />
      </v-btn>

      <template v-if="!auth.isLoggedIn">
        <v-btn
          :variant="isLoginRoute ? 'tonal' : 'text'"
          to="/entrar"
          exact
          class="text-none mr-2 font-weight-medium text-primary"
        >
          Entrar
        </v-btn>
        <v-btn
          color="primary"
          to="/registrar"
          exact
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
