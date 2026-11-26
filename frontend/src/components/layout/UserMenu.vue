<script setup lang="ts">
import AppPill from '@/components/common/AppPill.vue'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'

const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()

const userInitials = computed(() => {
  if (!auth.user?.name) return 'U'
  const parts = auth.user.name.split(' ')
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }
  return parts[0].substring(0, 2).toUpperCase()
})

const translatedRole = computed(() => {
  const role = auth.role
  if (role === 'SUPERADMIN') return 'Superadministrador'
  if (role === 'ADMIN') return 'Administrador'
  return 'Usuário'
})

function handleSelect(action: string) {
  switch (action) {
    case 'profile':
      router.push('/perfil')
      break
    case 'history':
      router.push('/historico')
      break
    case 'notifications':
      router.push('/notificacoes')
      break
    case 'admin':
      router.push('/admin')
      break
    case 'logout':
      auth.logout()
      ui.notifySuccess('Você saiu da sua conta.')
      router.push('/entrar')
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
        class="text-none"
        aria-label="Menu do usuário"
      >
        <v-avatar color="surface-muted" size="36" class="text-primary font-weight-bold border">
          <span>{{ userInitials }}</span>
        </v-avatar>
      </v-btn>
    </template>

    <v-card min-width="240" class="elevation-4 rounded-lg">
      <v-list density="compact" class="py-2">
        <v-list-item class="px-4 mb-2">
          <div class="text-subtitle-2 font-weight-bold text-truncate">{{ auth.user?.name }}</div>
          <div class="text-caption text-medium-emphasis text-truncate mb-1">{{ auth.user?.email }}</div>
          <AppPill size="x-small" color="primary">
            {{ translatedRole }}
          </AppPill>
        </v-list-item>
        <v-divider class="mb-1" />

        <v-list-item prepend-icon="mdi-account-outline" title="Perfil" @click="handleSelect('profile')" />
        <v-list-item prepend-icon="mdi-history" title="Histórico" @click="handleSelect('history')" />
        <v-list-item prepend-icon="mdi-bell-outline" title="Notificações" @click="handleSelect('notifications')" />
        <v-list-item
          v-if="auth.isAdmin"
          prepend-icon="mdi-shield-crown-outline"
          title="Painel Administrativo"
          @click="handleSelect('admin')"
        />
        
        <v-divider class="my-1" />
        <v-list-item
          prepend-icon="mdi-logout"
          title="Sair"
          class="text-error"
          @click="handleSelect('logout')"
        />
      </v-list>
    </v-card>
  </v-menu>
</template>
