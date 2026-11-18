export type ProfileId = 'tanner' | 'jen'
export type Macro = { kcal: number; proteinG: number; carbsG: number; fatG: number }
export type Role = 'fixed' | 'protein' | 'sauce' | 'seasoning' | 'fat' | 'vegetable' | 'starch'
export type MealType = 'breakfast' | 'lunch' | 'dinner'
export type Mode = 'prep' | 'fresh'

export interface CatalogItem {
  id: string
  name: string
  category: string
  basis: 'g' | 'ml' | 'count'
  state: string
  per: Macro
  source?: string
  sourceNote?: string
  pantry?: boolean
  hh?: [string, number]
  tags?: string[]
  pkg?: { size: number; one: string; many: string; label?: string; each?: boolean }
  custom?: boolean
}

export interface RecipeIngredient {
  ingredientId: string
  name: string
  quantity: number
  unit: string
  state: string
  role: Role
  category: string
  notes?: string
  minPerServing: number
  maxPerServing: number
  scalable: boolean
  optional?: boolean
}

export interface Recipe {
  id: string
  profileId: ProfileId
  name: string
  description: string
  mealType: MealType
  cuisine: string
  primaryProtein: string
  dietaryTags: string[]
  cookingMethods: string[]
  equipment: string[]
  prepMinutes: number
  cookMinutes: number
  flexible: boolean
  ingredients: RecipeIngredient[]
  steps: string[]
  storage: string[]
  allergens: string[]
  source: { kind: string; title: string; site?: string; url?: string; changes: string }
  perServing: Macro
}

/* A recipe as stored in a person's private library. */
export interface StoredRecipe extends Recipe {
  custom?: boolean
  hidden?: boolean
  base?: Recipe
  updatedAt?: string
}

export interface Targets {
  caloriesKcal?: number
  proteinMinG?: number
  proteinPreferredMaxG?: number
  carbsMaxG?: number
  fatTargetG?: number
  tolerancePct: number
  lunchShare: number
  minMealKcal: number
}

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type Day = (typeof DAYS)[number]
export const DAY_NAME: Record<Day, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }

export interface DayPlan { breakfast: string | null; lunch: string | null; dinner: string | null }

export interface Staples {
  latte: boolean
  snack: 'yogurt' | 'none'
  withLunch: 'bar' | 'bar-banana' | 'banana' | 'none'
  shake: 'bpn' | 'fairlife' | 'none'
  bpnMilkMl: number
}

export interface ProfileState {
  targets: Targets
  targetsOn: boolean
  staples: Staples | null
  weekOf: string
  days: Record<Day, DayPlan>
  modes: Record<string, Mode>
  pins: Record<string, Record<string, number>>
  avoid: string[]
  prepDay?: Day
  modeAsked?: Record<string, number>
}

/* Everything private to one person. */
export interface Personal {
  v: 3
  profile: ProfileId
  plan: ProfileState
  done: Record<string, boolean>
  portion?: Record<string, { totals: Record<string, number>; filled: Record<string, boolean[]> }>
  extras?: Record<string, LoggedFood[]>
  updatedAt: string
}
export interface LoggedFood { id: string; name: string; section: 'breakfast' | 'lunch' | 'dinner' | 'snacks'; macro: Macro }

export type SlotSummary = { name: string; mode: Mode } | null
/* What each person publishes for the other: meal names and prep/fresh only, plus grocery needs. */
export interface PlanSummary {
  id: string
  profile: ProfileId
  weekOf: string
  days: Record<Day, { breakfast: SlotSummary; lunch: SlotSummary; dinner: SlotSummary }>
  grocery: SharedGroceryItem[]
  libraryImported: boolean
  updatedAt: string
}
export interface SharedGroceryItem { id: string; name: string; category: string; qty: number; pantry: boolean; uses: string[] }
/* Shared shopping list. A row is keyed `ing:<ingredientId>` or `txt:<itemId>`. Quantities are in the ingredient's base unit (g, ml or count). */
export interface ListItem { id: string; ingredientId?: string; text: string; qty?: number; note?: string; addedBy: ProfileId; at: string }
export interface Grocery { checked: Record<string, boolean>; items: ListItem[] }
/* Shared pantry, in base units. Staples (spices, oils) use have instead of a quantity. */
export interface PantryEntry { qty: number; have?: boolean; at: string }
export interface Pantry { items: Record<string, PantryEntry> }
export interface Member { profile: ProfileId; status: 'approved' | 'blocked'; at: string }
