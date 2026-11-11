<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

const router = useRouter()
const auth = useAuthStore()

const userInitials = computed(() => {
  if (!auth.user?.name) return 'U'
  const parts = auth.user.name.split(' ')
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return parts[0].substring(0, 2).toUpperCase()
})

function handleSelect(action: string) {
  switch (action) {
    case 'profile':
      router.push('/profile')
      break
    case 'history':
      router.push('/history')
      break
    case 'login':
      router.push('/login')
      break
    case 'register':
      router.push('/register')
      break
    case 'logout':
      auth.logout()
      router.push('/login')
      break
  }
}
</script>

<template>
  <v-menu location="bottom end" transition="slide-y-transition">
    <template v-slot:activator="{ props }">
      <v-btn
        v-bind="props"
        icon
        variant="text"
        color="on-primary"
        class="text-none"
        aria-label="Menu do usuário"
      >
        <v-avatar color="surface" size="36" class="text-primary font-weight-bold">
          <v-icon v-if="!auth.isAuthenticated" icon="mdi-account-circle" size="32" color="primary" />
          <span v-else>{{ userInitials }}</span>
        </v-avatar>
      </v-btn>
    </template>

    <v-card min-width="220" class="elevation-4 rounded-lg">
      <v-list density="compact" class="py-2">
        <template v-if="auth.isAuthenticated">
          <v-list-item class="px-4 mb-2">
            <div class="text-subtitle-2 font-weight-bold text-truncate">{{ auth.user?.name }}</div>
            <div class="text-caption text-medium-emphasis text-truncate">{{ auth.user?.email }}</div>
          </v-list-item>
          <v-divider class="mb-1" />

          <v-list-item prepend-icon="mdi-account-outline" title="Meu Perfil" @click="handleSelect('profile')" />
          <v-list-item prepend-icon="mdi-history" title="Histórico de Perdas" @click="handleSelect('history')" />
          
          <v-divider class="my-1" />
          <v-list-item
            prepend-icon="mdi-logout"
            title="Sair"
            class="text-error"
            @click="handleSelect('logout')"
          />
        </template>
        <template v-else>
          <v-list-item prepend-icon="mdi-login" title="Entrar" @click="handleSelect('login')" />
          <v-list-item prepend-icon="mdi-account-plus" title="Cadastrar" @click="handleSelect('register')" />
        </template>
      </v-list>
    </v-card>
  </v-menu>
</template>
