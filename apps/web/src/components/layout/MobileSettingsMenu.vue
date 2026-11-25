<script setup lang="ts">
import { LogOut, Settings } from '@lucide/vue'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { settingsNavigationItem } from '@/app/navigation'
import { Button } from '@/components/ui'
import { authClient } from '@/auth/client'

const route = useRoute()
const router = useRouter()

async function signOut() {
  await authClient.signOut()
  await router.replace({ name: 'connexion' })
}
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" class="mobile-menu-trigger">
        <Settings aria-hidden="true" :size="18" />
        <span>Menu</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent align="end" side="bottom" :side-offset="8" class="mobile-menu-content">
        <DropdownMenuItem as-child>
          <RouterLink
            :to="settingsNavigationItem.path"
            :aria-current="route.name === settingsNavigationItem.name ? 'page' : undefined"
            class="mobile-menu-item"
          >
            <Settings aria-hidden="true" :size="18" />
            <span>{{ settingsNavigationItem.label }}</span>
          </RouterLink>
        </DropdownMenuItem>
        <DropdownMenuSeparator class="mobile-menu-separator" />
        <DropdownMenuItem as-child>
          <button type="button" class="mobile-menu-item" @click="signOut">
            <LogOut :size="18" aria-hidden="true" />
            <span>Déconnexion</span>
          </button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
