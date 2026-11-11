<script setup lang="ts">
import AppHeader from './AppHeader.vue'
import AppFooter from './AppFooter.vue'
</script>

<template>
  <div class="public-layout">
    <AppHeader />
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
