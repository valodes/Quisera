import { BookOpen, CalendarDays, ChefHat, House, Settings, ShoppingBasket } from '@lucide/vue'
import type { Component } from 'vue'

export type NavigationItem = {
  name: string
  path: string
  label: string
  description: string
  icon: Component
  mobilePrimary: boolean
}

export const navigationItems = [
  {
    name: 'home',
    path: '/',
    label: 'Accueil',
    description:
      'Votre point de départ pour organiser les repas et rejoindre les espaces de Quisera.',
    icon: House,
    mobilePrimary: true,
  },
  {
    name: 'planning',
    path: '/planning',
    label: 'Planning',
    description: 'Organiser les repas de la semaine à venir.',
    icon: CalendarDays,
    mobilePrimary: true,
  },
  {
    name: 'planification',
    path: '/planification',
    label: 'Planification',
    description: 'Composer et ajuster les prochaines box Quitoque.',
    icon: ShoppingBasket,
    mobilePrimary: false,
  },
  {
    name: 'recipes',
    path: '/recettes',
    label: 'Recettes',
    description: 'Parcourir et retrouver les recettes du foyer.',
    icon: BookOpen,
    mobilePrimary: true,
  },
  {
    name: 'cooking',
    path: '/cuisine',
    label: 'Cuisiner',
    description: 'Suivre une recette pendant sa préparation en cuisine.',
    icon: ChefHat,
    mobilePrimary: true,
  },
  {
    name: 'settings',
    path: '/parametres',
    label: 'Paramètres',
    description: 'Gérer les préférences du foyer.',
    icon: Settings,
    mobilePrimary: false,
  },
] satisfies readonly NavigationItem[]

export const mobileNavigationItems = navigationItems.filter((item) => item.mobilePrimary)

export const settingsNavigationItem = navigationItems.find((item) => item.name === 'settings')!
