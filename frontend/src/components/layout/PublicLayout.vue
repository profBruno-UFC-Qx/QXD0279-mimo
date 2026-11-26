<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useDisplay } from 'vuetify'
import { useAuthStore } from '@/stores/authStore'
import AppHeader from './AppHeader.vue'
import AppFooter from './AppFooter.vue'

const auth = useAuthStore()
const route = useRoute()
const { mdAndUp } = useDisplay()
const mobileDrawer = ref(false)

watch(mdAndUp, (isDesktop) => {
  if (isDesktop) {
    mobileDrawer.value = false
  }
})

watch(
  () => route.fullPath,
  () => {
    mobileDrawer.value = false
  },
)
</script>

<template>
  <div class="public-layout">
    <AppHeader @toggle-drawer="mobileDrawer = !mobileDrawer" />

    <v-navigation-drawer
      v-model="mobileDrawer"
      temporary
      location="left"
      width="260"
    >
      <div class="pa-4 d-flex align-center ga-2">
        <v-icon icon="mdi-magnify-scan" color="primary" size="24" />
        <span class="text-subtitle-1 font-weight-bold text-primary">AchaDex</span>
      </div>

      <v-divider />

      <v-list density="comfortable" nav class="pa-2">
        <v-list-item
          prepend-icon="mdi-package-variant-closed"
          title="Itens"
          to="/"
          class="rounded-lg mb-1"
          color="primary"
        />
        <v-list-item
          prepend-icon="mdi-domain"
          title="Prédios"
          to="/predios"
          class="rounded-lg mb-1"
          color="primary"
        />
        <v-list-item
          v-if="auth.isLoggedIn"
          prepend-icon="mdi-bullhorn-outline"
          title="Minhas perdas"
          to="/minhas-perdas"
          class="rounded-lg mb-1"
          color="primary"
        />
        <v-list-item
          v-if="auth.isAdmin"
          prepend-icon="mdi-shield-crown-outline"
          title="Painel Administrativo"
          to="/admin"
          class="rounded-lg mb-1"
          color="primary"
        />
      </v-list>

      <template v-if="!auth.isLoggedIn">
        <v-divider class="my-2" />
        <v-list density="comfortable" nav class="pa-2">
          <v-list-item
            prepend-icon="mdi-login"
            title="Entrar"
            to="/entrar"
            class="rounded-lg mb-1"
            color="primary"
          />
          <v-list-item
            prepend-icon="mdi-account-plus-outline"
            title="Criar conta"
            to="/registrar"
            class="rounded-lg"
            color="primary"
          />
        </v-list>
      </template>
    </v-navigation-drawer>

    <v-main class="public-layout__main bg-background">
      <v-container style="max-width: 1200px;" class="py-6 px-4">
        <router-view />
      </v-container>
    </v-main>
    <AppFooter class="public-layout__footer" />
  </div>
</template>

<style scoped>
.public-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.public-layout__main {
  flex: 1 0 auto;
}

.public-layout__footer {
  flex: 0 0 auto;
}
</style>
