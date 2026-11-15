<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/authStore'

const auth = useAuthStore()

const drawerModel = defineModel<boolean>({ default: true })

withDefaults(
  defineProps<{
    permanent?: boolean
  }>(),
  {
    permanent: true,
  },
)

const adminNavItems = computed(() => {
  const items = [
    { title: 'Itens', icon: 'mdi-package-variant-closed', to: '/admin/itens' },
    { title: 'Perdas', icon: 'mdi-alert-box', to: '/admin/perdas' },
    { title: 'Prédios', icon: 'mdi-domain', to: '/admin/predios' },
    { title: 'Categorias', icon: 'mdi-tag-multiple', to: '/admin/categorias' },
    { title: 'Entregas', icon: 'mdi-handshake', to: '/admin/entregas' },
    { title: 'Regras de Destinação', icon: 'mdi-format-list-numbered', to: '/admin/regras-destinacao' },
    { title: 'Destinações', icon: 'mdi-delete-sweep', to: '/admin/destinacoes' },
  ]
  if (auth.isSuperAdmin) {
    items.push({ title: 'Administradores', icon: 'mdi-shield-account', to: '/admin/admins' })
  }
  return items
})
</script>

<template>
  <v-navigation-drawer
    v-model="drawerModel"
    :permanent="permanent"
    :temporary="!permanent"
    rail-width="72"
    width="260"
    class="border-right"
  >
    <div class="pa-4 d-flex align-center">
      <v-icon icon="mdi-shield-crown" color="primary" size="28" class="mr-2" />
      <span class="text-subtitle-1 font-weight-bold text-primary">Painel Admin</span>
    </div>
    <v-divider />
    <v-list density="compact" nav class="pa-2">
      <v-list-item
        v-for="item in adminNavItems"
        :key="item.to"
        :prepend-icon="item.icon"
        :title="item.title"
        :to="item.to"
        class="rounded-lg mb-1"
        color="primary"
        @click="!permanent && (drawerModel = false)"
      />
    </v-list>

    <template #append>
      <v-divider />
      <v-list density="compact" nav class="pa-2">
        <v-list-item
          prepend-icon="mdi-arrow-left"
          title="Voltar ao catálogo"
          to="/"
          class="rounded-lg"
          @click="!permanent && (drawerModel = false)"
        />
      </v-list>
    </template>
  </v-navigation-drawer>
</template>
