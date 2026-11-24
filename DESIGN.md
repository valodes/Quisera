---
name: Quisera
description: A vivid, precise visual system for a private household's meal planning and cooking companion.
colors:
  forest: '#173D2C'
  terracotta: '#C74832'
  leaf: '#2F744E'
  sage: '#D7E8D6'
  peach: '#FCE3D8'
  shoot: '#DAF097'
  coral: '#F08262'
  tomato: '#E74D43'
typography:
  display:
    fontFamily: 'Manrope Variable, Manrope, sans-serif'
    fontSize: 'clamp(3rem, 7vw, 5.5rem)'
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: '-0.02em'
  h1:
    fontFamily: 'Manrope Variable, Manrope, sans-serif'
    fontSize: 'clamp(2.5rem, 5vw, 4rem)'
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: '-0.02em'
  h2:
    fontFamily: 'Manrope Variable, Manrope, sans-serif'
    fontSize: 'clamp(2rem, 4vw, 3rem)'
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: '-0.015em'
  h3:
    fontFamily: 'Manrope Variable, Manrope, sans-serif'
    fontSize: 'clamp(1.5rem, 3vw, 2rem)'
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: '-0.01em'
  h4:
    fontFamily: 'Manrope Variable, Manrope, sans-serif'
    fontSize: '1.25rem'
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: '0em'
  component:
    fontFamily: 'Manrope Variable, Manrope, sans-serif'
    fontSize: '1.125rem'
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: '0em'
  body-large:
    fontFamily: 'DM Sans Variable, DM Sans, sans-serif'
    fontSize: '1.125rem'
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: '0em'
  body:
    fontFamily: 'DM Sans Variable, DM Sans, sans-serif'
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: '0em'
  body-small:
    fontFamily: 'DM Sans Variable, DM Sans, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: '0em'
  label:
    fontFamily: 'DM Sans Variable, DM Sans, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: '0.01em'
  metadata:
    fontFamily: 'DM Sans Variable, DM Sans, sans-serif'
    fontSize: '0.75rem'
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: '0.01em'
  button:
    fontFamily: 'Manrope Variable, Manrope, sans-serif'
    fontSize: '0.9375rem'
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: '0em'
  indicator:
    fontFamily: 'DM Sans Variable, DM Sans, sans-serif'
    fontSize: '1rem'
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: '0em'
rounded:
  control: '4px'
  card: '8px'
spacing:
  '1': '4px'
  '2': '8px'
  '3': '12px'
  '4': '16px'
  '6': '24px'
  '8': '32px'
  '12': '48px'
components:
  button-primary:
    backgroundColor: '{colors.forest}'
    textColor: '{colors.peach}'
    rounded: '{rounded.control}'
    height: '44px'
    padding: '8px 16px'
  button-primary-hover:
    backgroundColor: '{colors.leaf}'
    textColor: '{colors.peach}'
  button-secondary:
    backgroundColor: '{colors.shoot}'
    textColor: '{colors.forest}'
    rounded: '{rounded.control}'
    height: '44px'
    padding: '8px 16px'
  button-ghost:
    backgroundColor: transparent
    textColor: '{colors.forest}'
    rounded: '{rounded.control}'
    height: '44px'
    padding: '8px 16px'
  button-ghost-hover:
    backgroundColor: '{colors.shoot}'
  badge-info:
    backgroundColor: '{colors.sage}'
    textColor: '{colors.forest}'
    rounded: '{rounded.control}'
    padding: '4px 8px'
  badge-success:
    backgroundColor: '{colors.leaf}'
    textColor: '{colors.peach}'
    rounded: '{rounded.control}'
    padding: '4px 8px'
  badge-warning:
    backgroundColor: '{colors.shoot}'
    textColor: '{colors.forest}'
    rounded: '{rounded.control}'
    padding: '4px 8px'
  badge-error:
    backgroundColor: '{colors.peach}'
    textColor: '{colors.forest}'
    rounded: '{rounded.control}'
    padding: '4px 8px'
  surface:
    backgroundColor: '{colors.sage}'
    textColor: '{colors.forest}'
    rounded: '{rounded.card}'
    padding: '16px'
  input:
    backgroundColor: '{colors.peach}'
    textColor: '{colors.forest}'
    rounded: '{rounded.control}'
    height: '44px'
    padding: '8px 12px'
  icon-button:
    backgroundColor: transparent
    textColor: '{colors.forest}'
    rounded: '{rounded.control}'
    height: '44px'
    width: '44px'
---

# Design System: Quisera

## Overview

**Creative North Star: “Le maraîchage éditorial”**

This direction is derived from the supplied product brief: a contemporary, vegetal, sunlit kitchen expressed with the hierarchy and precision of modern software. The visual language pairs deep forest typography with leafy surfaces, peach warmth, and small, deliberate terracotta and tomato accents. It should feel vivid and composed rather than rustic or template-driven.

The system keeps familiar web controls and a clear information hierarchy. Color, typography, and compact botanical references carry the identity; they do not change how navigation or controls work. There is no licensed Sharp Grotesk 20 or Graphik asset in the repository, so local SIL Open Font License alternatives are used until properly licensed files are supplied.

**Key Characteristics:**

- Vegetal color with warm, sunlit surface contrast.
- Editorial headings paired with readable, measured body text.
- Standard accessible controls with restrained state motion.

## Colors

The eight exact brand colors establish the full interface palette; semantic tokens assign them to roles without introducing extra hues.

### Primary

- **Vert forêt** (`#173D2C`): Primary text, primary action surface, and focus indicator. Use peach action text for strong contrast.
- **Terracotta** (`#C74832`): A restrained identity accent for small non-text marks and decoration; do not use for normal-sized text or as a text-bearing button fill.

### Secondary

- **Vert feuille** (`#2F744E`): Secondary text on pale peach and leaf-colored success surface; also a border and primary-action hover surface.
- **Sauge** (`#D7E8D6`): Main page canvas and informational surface, paired with forest text.
- **Pêche** (`#FCE3D8`): Main raised surface, input background, action foreground, and error surface, paired with forest text.

### Tertiary

- **Jeune pousse** (`#DAF097`): Secondary action and warning surface, always with forest text.
- **Corail** (`#F08262`): Accent surface with forest text, not a default text color.
- **Rouge tomate** (`#E74D43`): Error border and small status mark. Pair it with a visible “Erreur” label and forest text on peach.

### Named Rules

**The Palette-Only Rule.** Use only the eight brand colors in interface elements. Semantic roles may reuse them; do not add neutral ramps or default Tailwind colors.

**The Contrast Pairing Rule.** Body text uses forest on pale brand surfaces. Leaf text is reserved for pairings that meet normal-text contrast. Terracotta is not normal text. Error meaning includes a word or icon shape as well as color.

## Typography

**Display Font:** Manrope Variable (with Manrope, sans-serif fallbacks; locally bundled under SIL OFL 1.1)
**Body Font:** DM Sans Variable (with DM Sans, sans-serif fallbacks; locally bundled under SIL OFL 1.1)
**Label/Mono Font:** DM Sans Variable; no separate mono voice is defined.

**Character:** Manrope gives headings a crisp, contemporary grotesque voice; DM Sans keeps longer labels and instructions open and readable. Sharp Grotesk 20 and Graphik remain replaceable font tokens and may only be introduced with appropriate licenses.

### Hierarchy

- **Display** (700, `clamp(3rem, 7vw, 5.5rem)`, 1.02 line-height, `-0.02em`): Reserved for rare, high-level product titles.
- **H1** (700, `clamp(2.5rem, 5vw, 4rem)`, 1.02): Main page heading.
- **H2** (700, `clamp(2rem, 4vw, 3rem)`, 1.12): Major sections.
- **H3** (700, `clamp(1.5rem, 3vw, 2rem)`, 1.12): Subsections.
- **H4** (700, `1.25rem`, 1.12): Small section headings.
- **Component title** (700, `1.125rem`, 1.12): Titles inside future generic components.
- **Body large** (400, `1.125rem`, 1.5): Introductory or emphasized explanatory text.
- **Body** (400, `1rem`, 1.5): Default reading text; keep long-form measures around 65–75 characters.
- **Body small** (400, `0.875rem`, 1.5): Supporting information, not dense legal copy.
- **Label** (600, `0.875rem`, 1.25, `0.01em`): Form labels and compact controls; sentence case.
- **Metadata** (500, `0.75rem`, 1.25, `0.01em`): Secondary metadata only when necessary.
- **Button** (700, `0.9375rem`, 1.25): Action labels, sentence case.
- **Indicator** (600, `1rem`, 1.25): Numeric or short status indicators.

Responsive headings use the tokenized `clamp()` values above. Body and metadata sizes remain stable across viewports; do not shrink essential information to fit.

## Layout

Tokens define a reading width of 42rem and a content maximum of 80rem. The responsive breakpoints are 40rem, 48rem, and 64rem. A four-pixel base spacing rhythm is available at 4, 8, 12, 16, 24, 32, and 48 pixels. Compose layouts fluidly around content; no application layout or route is established in this phase.

## Elevation & Depth

The primitives are flat at rest. Distinguish surfaces with the approved palette and a single border treatment where needed; there is no default shadow token. Interaction may change surface color and position slightly, without introducing a persistent colored halo.

**The Quiet-Depth Rule.** Prefer tonal surfaces and clear spacing over stacked containers or decorative shadows.

## Shapes

Buttons and fields use a 4px radius; cards and surfaces use 8px. Corners remain crisp and lightly softened. Interactive targets are at least 44px high and icon buttons are 44px square. Use leaf borders, with tomato only for error indication; avoid nested borders and unnecessary wrappers.

## Components

### Buttons

- **Shape:** 4px radius, minimum 44px height, 8px by 16px padding.
- **Primary:** Forest background with peach text; hover changes to leaf while retaining peach text.
- **Secondary:** Young-shoot background and forest text; hover uses coral and forest text.
- **Ghost:** Transparent at rest, sage surface on hover, always forest text.
- **Focus / active / disabled:** Visible 3px forest focus outline with offset; subtle press translation; disabled controls remain legible and do not respond to pointer input.
- **Loading:** Native disabled state and `aria-busy`; the action label remains visible beside a decorative spinner.

### Badges

- **Style:** Compact 4px corners, 4px by 8px padding, with semantic info, success, warning, and error pairings.
- **Error:** Always prefixes the visible label “Erreur :”; color is supplementary.

### Cards / Containers

- **Corner Style:** 8px.
- **Background:** Sage, peach, young shoot, or coral, with forest text.
- **Shadow Strategy:** Flat; depth comes from palette and spacing.
- **Border:** None by default. Add one-pixel leaf outline only when the boundary needs to be explicit.
- **Internal Padding:** 16px base, expandable through spacing tokens.

### Inputs / Fields

- **Style:** Peach background, leaf border, forest text, 4px corners, 44px minimum height.
- **Focus:** Three-pixel forest outline with offset; keyboard focus is not color-only.
- **Error / Disabled:** Error uses tomato border plus a visible “Erreur :” message connected with `aria-describedby` and `aria-invalid`; disabled remains readable and exposes the native disabled state.

### Icon Buttons

- **Style:** 44px square; the required `label` prop supplies the accessible name even when only an icon is shown.
- **State:** Uses the same primary, secondary, and ghost treatments as Button.

### Future Recipe Cards — rules only

- Keep the complete culinary photograph and its original background; never cut the food out.
- Reserve clear hierarchy for title, duration, difficulty, Nutri-Score, and carbon score when verified values exist.
- Show unavailable scores as unavailable; never imply a real score without verified data.
- Do not show a serving count or an “Ajouter au planning” button.
- Support future vertical, horizontal, compact, and featured formats with responsive content order and accessible interactive states.
- A featured treatment may use one approved accent surface; it must preserve text contrast and the full photograph.

## Do's and Don'ts

### Do:

- **Do** source all interface colors from `apps/web/src/styles/tokens.css`.
- **Do** keep French user-facing copy and English code identifiers and comments.
- **Do** preserve labels, keyboard operation, visible focus, and reduced-motion preferences.
- **Do** use local licensed font files and retain their license notices.
- **Do** verify food metrics before presenting them as real.

### Don't:

- **Don't** use white, gray, brown, beige, black, or un-tokenized Tailwind colors in interface elements.
- **Don't** use terracotta for normal-sized text or place forest text on forest surfaces.
- **Don't** communicate error or availability by color alone.
- **Don't** generate recipe cards, application pages, or route demos as part of this foundation phase.
- **Don't** imply offline PWA support.
