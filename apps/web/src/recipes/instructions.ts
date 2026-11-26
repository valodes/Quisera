const blockTags = new Set(['DIV', 'LI', 'P'])
const ignoredTags = new Set(['IFRAME', 'OBJECT', 'SCRIPT', 'STYLE', 'SVG'])

export type StructuredStep = {
  title: string | null
  lines: string[]
}

function textContent(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const element = node as Element
  if (ignoredTags.has(element.tagName)) return ''
  if (element.tagName === 'BR') return '\n'

  const content = Array.from(element.childNodes, textContent).join('')
  return blockTags.has(element.tagName) ? `${content.trim()}\n\n` : content
}

export function formatRecipeInstructions(value: string, stepNumber: number) {
  const parsed = new DOMParser().parseFromString(value, 'text/html')
  const numberedStep = new RegExp(`^${stepNumber}\\s*[.)]\\s+`)

  return Array.from(parsed.body.childNodes, textContent)
    .join('')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .replace(numberedStep, '')
}

export function parseStructuredStep(value: string, stepNumber: number): StructuredStep {
  const formatted = formatRecipeInstructions(value, stepNumber)
  if (!formatted) return { title: null, lines: [] }

  const paragraphs = formatted
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)

  let title: string | null = null
  let bodyBlocks = paragraphs

  const first = paragraphs[0]
  if (
    first &&
    paragraphs.length > 1 &&
    !first.includes('\n') &&
    first.length <= 72 &&
    !/[.!?:]$/.test(first)
  ) {
    title = first
    bodyBlocks = paragraphs.slice(1)
  }

  const lines = bodyBlocks
    .flatMap((block) => block.split('\n'))
    .map((line) => line.trim())
    .filter(Boolean)

  return { title, lines }
}
