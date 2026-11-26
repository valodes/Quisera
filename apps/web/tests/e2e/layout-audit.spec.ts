import { expect, test } from '@playwright/test'

const ROUTES = [
  '/',
  '/planning',
  '/planification',
  '/recettes',
  '/recettes/nouvelle',
  '/recettes/importer',
  '/cuisine',
  '/parametres',
  '/parametres?tab=foyer',
  '/parametres?tab=foyer&section=preferences',
]

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'ipad', width: 1024, height: 768 },
  { name: 'mobile', width: 390, height: 844 },
]

test('layout audit: zero horizontal overflow, zero out-of-bounds controls, aligned action bars', async ({
  page,
}) => {
  const issues: string[] = []

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    for (const route of ROUTES) {
      await page.goto(route, { waitUntil: 'networkidle' })
      await page.waitForTimeout(150)

      const report = await page.evaluate(() => {
        const overflowX = document.documentElement.scrollWidth - window.innerWidth
        const outOfBounds: string[] = []
        const heightMismatches: string[] = []

        const controls = document.querySelectorAll('button, a, input, select')
        for (const el of controls) {
          const style = getComputedStyle(el)
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
            continue
          const rect = el.getBoundingClientRect()
          if (rect.width === 0 || rect.height === 0) continue
          if (el.classList.contains('skip-link') || el.classList.contains('sr-only')) continue
          // Skip elements inside horizontally scrollable containers
          let scrollableParent = false
          let parent = el.parentElement
          while (parent && parent !== document.body) {
            const ps = getComputedStyle(parent)
            if (ps.overflowX === 'auto' || ps.overflowX === 'scroll') {
              scrollableParent = true
              break
            }
            parent = parent.parentElement
          }
          if (!scrollableParent && (rect.right > window.innerWidth + 2 || rect.left < -2)) {
            outOfBounds.push(
              `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join('.')} "${(el.textContent || '').trim().slice(0, 28)}" (left=${Math.round(rect.left)}, right=${Math.round(rect.right)} > ${window.innerWidth})`,
            )
          }
        }

        // Check action bars where sibling buttons/links sit on the same row
        const bars = document.querySelectorAll(
          '.planning__bar-actions, .recipe-library__intro-actions, .recipe-detail__actions, .home-stage__actions, .cooking-topbar__right, .prefs-card__presets',
        )
        for (const bar of bars) {
          const children = [...bar.children].filter((c) => {
            const r = c.getBoundingClientRect()
            return r.width > 0 && r.height > 0 && (c.tagName === 'BUTTON' || c.tagName === 'A')
          })
          if (children.length < 2) continue
          const rects = children.map((c) => ({
            label: (c.textContent || '').trim().slice(0, 24),
            h: Math.round(c.getBoundingClientRect().height),
            y: Math.round(c.getBoundingClientRect().top),
          }))
          // Only compare items on the same horizontal row
          const sameRow = rects.filter((r) => Math.abs(r.y - rects[0]!.y) <= 6)
          if (sameRow.length >= 2) {
            const heights = sameRow.map((r) => r.h)
            const diff = Math.max(...heights) - Math.min(...heights)
            if (diff > 4) {
              heightMismatches.push(
                `${[...bar.classList][0]}: ${sameRow.map((r) => `${r.label}=${r.h}px`).join(' vs ')}`,
              )
            }
          }
        }

        return { overflowX, outOfBounds, heightMismatches }
      })

      if (report.overflowX > 1) {
        issues.push(`[${vp.name}] ${route}: overflowX=+${report.overflowX}px`)
      }
      for (const oob of report.outOfBounds) {
        issues.push(`[${vp.name}] ${route}: OOB ${oob}`)
      }
      for (const mm of report.heightMismatches) {
        issues.push(`[${vp.name}] ${route}: HEIGHT ${mm}`)
      }
    }
  }

  console.log('AUDIT_ISSUES:', JSON.stringify(issues, null, 2))
  expect(issues).toEqual([])
})
