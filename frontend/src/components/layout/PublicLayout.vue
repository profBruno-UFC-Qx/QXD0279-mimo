<script setup lang="ts">
import AppHeader from './AppHeader.vue'
import AppFooter from './AppFooter.vue'
</script>

<template>
  <div class="public-layout">
    <AppHeader />
    <v-main class="bg-background">
      <v-container style="max-width: 1200px;" class="py-6 px-4">
        <router-view />
      </v-container>
    </v-main>
    <AppFooter />
  </div>
</template>
