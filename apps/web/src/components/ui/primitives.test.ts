import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import Badge from './Badge.vue'
import Button from './Button.vue'
import IconButton from './IconButton.vue'
import Surface from './Surface.vue'
import TextInput from './TextInput.vue'

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
    expect(wrapper.get('input').attributes('aria-describedby')).toBe(
      'email-help email-error',
    )
    expect(wrapper.get('[role="alert"]').text()).toBe(
      'Erreur : Adresse invalide.',
    )
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
