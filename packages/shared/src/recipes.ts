import { z } from 'zod'

export const recipeIngredientInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  quantity: z.string().trim().max(40).nullable().default(null),
  unit: z.string().trim().max(40).nullable().default(null),
  notes: z.string().trim().max(200).nullable().default(null),
})

export const recipeStepInputSchema = z.object({
  instructions: z.string().trim().min(1).max(4000),
})

export const recipeWriteSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).nullable().default(null),
    totalMinutes: z.number().int().min(1).max(1440).nullable().default(null),
    difficulty: z.enum(['easy', 'medium', 'hard']).nullable().default(null),
    category: z.string().trim().min(1).max(80).nullable().default(null),
    tags: z.array(z.string().trim().min(1).max(60)).max(24).default([]),
    ingredients: z.array(recipeIngredientInputSchema).min(1).max(100),
    steps: z.array(recipeStepInputSchema).min(1).max(100),
  })
  .strict()

export type RecipeWriteInput = z.infer<typeof recipeWriteSchema>

export type RecipeSource = 'house' | 'quitoque'

export type RecipeMetric = {
  key: string
  value: string
  unit: string | null
  provenance: string | null
  method: string | null
  recordedAt: string | null
}

export type RecipeIngredient = {
  name: string
  quantity: string | null
  unit: string | null
  notes: string | null
  position: number
}

export type RecipeStep = {
  instructions: string
  position: number
}

export type RecipeSummary = {
  id: string
  source: RecipeSource
  title: string
  description: string | null
  imageUrl: string | null
  thumbnailUrl: string | null
  totalMinutes: number | null
  difficulty: string | null
  category: string | null
  tags: string[]
  metrics: RecipeMetric[]
  isFavorite: boolean
  createdAt: string
  updatedAt: string
}

export type RecipeDetail = RecipeSummary & {
  ingredients: RecipeIngredient[]
  steps: RecipeStep[]
}

export type RecipeListResponse = {
  items: RecipeSummary[]
  total: number
  page: number
  pageSize: number
}
