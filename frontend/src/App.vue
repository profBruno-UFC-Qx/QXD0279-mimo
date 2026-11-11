<script setup lang="ts">
import AppSnackbar from '@/components/common/AppSnackbar.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
</script>

<template>
  <v-app>
    <router-view />

    <AppSnackbar />
    <ConfirmDialog />
  </v-app>
</template>
