import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import Badge from './Badge.vue'
import Button from './Button.vue'
import IconButton from './IconButton.vue'
import Surface from './Surface.vue'
import TextInput from './TextInput.vue'
import ScoreBadge from './ScoreBadge.vue'
import RecipeCard from '../recipes/RecipeCard.vue'

describe('Button', () => {
  it('keeps its label available and announces its loading state', () => {
    const wrapper = mount(Button, {
      props: { loading: true },
      slots: { default: 'Enregistrer' },
    })

    expect(wrapper.get('button').attributes('type')).toBe('button')
    expect(wrapper.get('button').attributes('aria-busy')).toBe('true')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Enregistrer')
  })
})

describe('Badge', () => {
  it('names an error without relying on its color', () => {
    const wrapper = mount(Badge, {
      props: { variant: 'error' },
      slots: { default: 'Connexion interrompue' },
    })

    expect(wrapper.text()).toBe('Erreur : Connexion interrompue')
  })
})

describe('Surface', () => {
  it('supports semantic elements and named surface variants', () => {
    const wrapper = mount(Surface, {
      props: { as: 'article', variant: 'peach' },
      slots: { default: 'Contenu' },
    })

    expect(wrapper.element.tagName).toBe('ARTICLE')
    expect(wrapper.attributes('data-variant')).toBe('peach')
    expect(wrapper.text()).toBe('Contenu')
  })
})

describe('TextInput', () => {
  it('associates labels and descriptions and exposes textual errors', () => {
    const wrapper = mount(TextInput, {
      props: {
        id: 'email',
        label: 'Adresse e-mail',
        helpText: 'Utilisée pour vous connecter.',
        errorMessage: 'Adresse invalide.',
      },
    })

    expect(wrapper.get('label').attributes('for')).toBe('email')
    expect(wrapper.get('input').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('input').attributes('aria-describedby')).toBe('email-help email-error')
    expect(wrapper.get('[role="alert"]').text()).toBe('Erreur : Adresse invalide.')
  })
})

describe('IconButton', () => {
  it('provides an accessible name and native disabled behavior', () => {
    const wrapper = mount(IconButton, {
      props: { label: 'Fermer', disabled: true },
    })

    expect(wrapper.get('button').attributes('aria-label')).toBe('Fermer')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  })
})

describe('RecipeCard', () => {
  it('omits missing metadata instead of rendering N/D placeholders', () => {
    const wrapper = mount(RecipeCard, {
      props: {
        title: 'Quiche Lorraine',
        sourceLabel: 'Jow',
      },
    })

    expect(wrapper.text()).toContain('Quiche Lorraine')
    expect(wrapper.text()).toContain('Jow')
    expect(wrapper.text()).not.toContain('N/D')
    expect(wrapper.text()).not.toContain('Non disponible')
    expect(wrapper.find('.q-recipe-card__time-pill').exists()).toBe(false)
    expect(wrapper.find('.q-recipe-card__metrics').exists()).toBe(false)
  })

  it('renders time on photo and calories/scores when available', () => {
    const wrapper = mount(RecipeCard, {
      props: {
        title: 'Poulet curry',
        sourceLabel: 'Quitoque',
        totalMinutes: 25,
        caloriesKcal: 640,
        nutriScore: 'A',
        carbonScore: 'B',
      },
    })

    expect(wrapper.get('.q-recipe-card__time-pill').text()).toContain('25 min')
    expect(wrapper.get('.q-recipe-card__kcal').text()).toContain('640 kcal')
    const badges = wrapper.findAll('.q-recipe-card__scores .score-badge')
    expect(badges).toHaveLength(2)
    expect(badges[1]?.find('svg').exists()).toBe(false)
  })
})

describe('ScoreBadge', () => {
  it('shows the leaf icon in default mode and omits it in compact mode for carbon score', () => {
    const full = mount(ScoreBadge, {
      props: { kind: 'eco', grade: 'B' },
    })
    const compact = mount(ScoreBadge, {
      props: { kind: 'eco', grade: 'B', compact: true },
    })

    expect(full.find('svg').exists()).toBe(true)
    expect(compact.find('svg').exists()).toBe(false)
    expect(compact.attributes('aria-label')).toBe('Score carbone B')
  })
})
