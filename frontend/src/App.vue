<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'

const auth = useAuthStore()
const ui = useUiStore()

onMounted(async () => {
  await auth.fetchMe()
})
</script>

<template>
 
</template>
