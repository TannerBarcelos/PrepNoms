import type { Recipe, RecipeVersion, StoredRecipe } from './types'

const MAX = 15
/* The recipe itself, without library bookkeeping. */
export function content(r: StoredRecipe | Recipe): Recipe {
  const { custom: _c, hidden: _h, base: _b, updatedAt: _u, history: _hi, pos: _p, ...rest } = r as StoredRecipe
  return rest as Recipe
}
const same = (a: Recipe, b: Recipe) => JSON.stringify(a) === JSON.stringify(b)

/* Older recipes have no history yet: start one from the original (if known) and the current text. */
export function ensureHistory(r: StoredRecipe, original?: Recipe | null): { history: RecipeVersion[]; pos: number } {
  if (r.history?.length) return { history: r.history, pos: Math.min(r.pos ?? r.history.length - 1, r.history.length - 1) }
  const cur = content(r)
  const first = original ?? r.base ?? cur
  const h: RecipeVersion[] = [{ at: r.custom ? r.updatedAt ?? new Date().toISOString() : 'original', note: r.custom ? 'Created' : 'Original', recipe: content(first as StoredRecipe) }]
  if (!same(h[0].recipe, cur)) h.push({ at: r.updatedAt ?? new Date().toISOString(), note: 'Edited', recipe: cur })
  return { history: h, pos: h.length - 1 }
}

/* Saving an edit adds a new version at the end, even when an older one is in use, so nothing is lost. */
export function commitEdit(prev: StoredRecipe | null, next: Recipe, original?: Recipe | null): StoredRecipe {
  const meta = { custom: prev?.custom, hidden: prev?.hidden }
  if (!prev) return { ...next, custom: true, history: [{ at: new Date().toISOString(), note: 'Created', recipe: next }], pos: 0 }
  const { history } = ensureHistory(prev, original)
  const cur = history[history.length - 1].recipe
  let h = same(cur, next) ? history : [...history, { at: new Date().toISOString(), note: describe(cur, next), recipe: next }]
  if (h.length > MAX) h = [h[0], ...h.slice(h.length - MAX + 1)]
  return { ...next, ...meta, history: h, pos: h.length - 1 }
}

export function moveTo(r: StoredRecipe, i: number, original?: Recipe | null): StoredRecipe {
  const { history } = ensureHistory(r, original)
  const k = Math.max(0, Math.min(history.length - 1, i))
  return { ...history[k].recipe, custom: r.custom, hidden: r.hidden, history, pos: k }
}

/* A short, plain summary of what changed between two versions. */
export function describe(a: Recipe, b: Recipe): string {
  const out: string[] = []
  if (a.name !== b.name) out.push('renamed')
  const ai = new Map(a.ingredients.map((i) => [i.ingredientId, i])), bi = new Map(b.ingredients.map((i) => [i.ingredientId, i]))
  const added = [...bi.keys()].filter((k) => !ai.has(k)).length, removed = [...ai.keys()].filter((k) => !bi.has(k)).length
  const changed = [...bi.keys()].filter((k) => ai.has(k) && (ai.get(k)!.quantity !== bi.get(k)!.quantity || ai.get(k)!.role !== bi.get(k)!.role)).length
  if (added) out.push(`${added} ingredient${added > 1 ? 's' : ''} added`)
  if (removed) out.push(`${removed} removed`)
  if (changed) out.push(`${changed} amount${changed > 1 ? 's' : ''} changed`)
  if (JSON.stringify(a.steps) !== JSON.stringify(b.steps)) out.push('steps edited')
  if (a.description !== b.description || a.mealType !== b.mealType || a.cuisine !== b.cuisine || a.prepMinutes !== b.prepMinutes || a.cookMinutes !== b.cookMinutes) out.push('details edited')
  const s = out.join(', ')
  return s ? s[0].toUpperCase() + s.slice(1) : 'Saved'
}
