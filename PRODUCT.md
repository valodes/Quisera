# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The confirmed audience is one private household. It is inferred that household members organize meals and use the cooking guidance; the household's roles and membership rules are undecided.

## Product Purpose

Quisera is a private meal-planning and cooking-support PWA for a household. It should help people organize meals ahead of time and follow the selected recipe while cooking.

Success means that household members can organize the defined weekly plan on desktop, then use the same product from a phone or tablet while cooking.

## Positioning

No distinct product mechanism or comparative claim has been confirmed. Keep positioning open and do not invent claims about convenience, quality, savings, or outcomes.

## Operating Context

- Desktop is for meal organization; mobile and tablet are for Cooking Mode.
- Each planning cycle starts on the actual Quitoque delivery date at dinner and ends at lunch seven civil days later; it contains 14 chronological slots. Delivery weekdays are never assumed.
- The PWA is installable and requires an internet connection; it has no offline mode.
- Recipe photographs retain their complete original backgrounds.

## Capabilities and Constraints

- Recipe cards may show duration, difficulty, Nutri-Score, and carbon score when verified values are available.
- Missing nutrition or carbon information must be shown as unavailable, never fabricated.
- Recipe cards do not show a serving count or an “Add to plan” call to action.
- Planning sync reads authenticated Quitoque orders and the selected order items only through `https://app.quitoque.fr/api/v2`. The observed order `deliveryDate` anchors a cycle; selected recipe products are matched by product ID against the documented dated recipe-family collection for enrichment. Do not infer endpoints or field semantics. Nutrition units, difficulty mapping, and carbon-score methodology remain unverified and must stay unavailable.
- Product UI must meet WCAG 2.2 AA. Error meaning must not depend on color alone.

## Brand Commitments

Quisera is a private household product with a French-language interface. The user supplied binding visual constraints for its identity; the detailed visual system belongs in `DESIGN.md`.

## Evidence on Hand

Authenticated live responses verified the recipe catalog shape, category/tag fields, ingredients, steps, recipe photos, and Nutri-Score grade representation. Order responses also expose `deliveryDate`, and order-item product IDs matched selected recipe products in the dated catalog. No live recipe content or personal order data is committed to the repository; do not create illustrative product data or represent it as real.

## Product Principles

- Keep the experience focused on one household; exact membership and permission rules remain undecided.
- Carry the plan from desktop organization into mobile and tablet cooking guidance.
- Show nutrition and environmental information only when verified, and make missing values explicit.
- Do not imply that the product works offline.

## Accessibility & Inclusion

The user requires WCAG 2.2 AA for the interface. No additional user-specific accessibility needs have been established.

## Open Decisions

- The product's distinctive positioning and success measures beyond the stated planning and cooking tasks are undecided.
- Household membership, roles, and privacy controls are undecided.
- Recipe content and verified nutrition/carbon data sources are not yet supplied.
