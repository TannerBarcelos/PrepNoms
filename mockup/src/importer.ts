import type { CatalogItem, MealType, Role } from './types'
import type { Library } from './data'

/* Turns pasted recipe text into a draft for the editor's review screen.
   In the real app an LLM does this (and reads links, YouTube descriptions and captions, and photos);
   this rule-based version shows the same flow: parse, match to the ingredient catalog, flag what needs a look. */
export interface SeedRow { ingredientId: string; quantity: number; role: Role; notes: string; flag?: string }
export interface Seed { name: string; description: string; mealType: MealType; steps: string[]; rows: SeedRow[]; unmatched: string[]; source: string }

const FRAC: Record<string, number> = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125 }
const UNIT: Record<string, { to: 'g' | 'ml' | 'count'; f: number; hh?: string }> = {
  g: { to: 'g', f: 1 }, gram: { to: 'g', f: 1 }, kg: { to: 'g', f: 1000 }, oz: { to: 'g', f: 28.35 }, ounce: { to: 'g', f: 28.35 },
  lb: { to: 'g', f: 453.6 }, pound: { to: 'g', f: 453.6 }, ml: { to: 'ml', f: 1 }, l: { to: 'ml', f: 1000 }, liter: { to: 'ml', f: 1000 },
  cup: { to: 'ml', f: 240, hh: 'cup' }, tbsp: { to: 'ml', f: 15, hh: 'tbsp' }, tablespoon: { to: 'ml', f: 15, hh: 'tbsp' }, tsp: { to: 'ml', f: 5, hh: 'tsp' }, teaspoon: { to: 'ml', f: 5, hh: 'tsp' },
  clove: { to: 'count', f: 1, hh: 'clove' }, can: { to: 'count', f: 1 }, slice: { to: 'count', f: 1 }, large: { to: 'count', f: 1 }, medium: { to: 'count', f: 1 }, small: { to: 'count', f: 1 },
}
const sing = (w: string) => w.replace(/(ies)$/, 'y').replace(/(oes|ses)$/, (m) => m.slice(0, -2)).replace(/s$/, '')
const words = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !['and', 'the', 'for', 'fresh', 'chopped', 'diced', 'minced', 'sliced', 'large', 'medium', 'small', 'about', 'cup', 'cups', 'tbsp', 'tsp', 'boneless', 'skinless'].includes(w)).map(sing)

function qtyOf(s: string): { q: number; rest: string } | null {
  const m = s.match(/^\s*(\d+(?:\.\d+)?)?\s*(\d+\/\d+|[½⅓⅔¼¾⅛])?/)
  if (!m || (!m[1] && !m[2])) return null
  let q = m[1] ? Number(m[1]) : 0
  if (m[2]) q += m[2].includes('/') ? Number(m[2].split('/')[0]) / Number(m[2].split('/')[1]) : FRAC[m[2]]
  return { q, rest: s.slice(m[0].length).trim() }
}

function match(lib: Library, name: string): CatalogItem | null {
  const w = words(name)
  if (!w.length) return null
  let best: CatalogItem | null = null, score = 0
  for (const c of lib.catalogList) {
    const cw = words(c.name)
    const hit = w.filter((x) => cw.includes(x)).length
    const s = hit / Math.max(w.length, 1) + hit / Math.max(cw.length, 1) * 0.5
    if (hit && s > score) { score = s; best = c }
  }
  return score >= 0.6 ? best : null
}
const roleOf = (c: CatalogItem): Role => c.category === 'Meat & Seafood' ? 'protein' : c.category === 'Grains & Pasta' ? 'starch' : c.category === 'Produce' ? 'vegetable' : c.category === 'Spices' ? 'seasoning' : /oil|butter/i.test(c.name) ? 'fat' : c.category === 'Sauces & Condiments' ? 'sauce' : 'fixed'

export function parseRecipeText(lib: Library, raw: string, servingsHint?: number): Seed {
  const lines = raw.split(/\r?\n/).map((l) => l.replace(/^[\s•\-*▢☐]+/, '').trim()).filter(Boolean)
  let mode: 'head' | 'ing' | 'steps' = 'head'
  let name = '', description = ''
  const ing: string[] = [], steps: string[] = []
  let servings = servingsHint ?? 0
  for (const l of lines) {
    const low = l.toLowerCase()
    const sv = low.match(/(?:serves|servings|yield|makes)\D{0,10}(\d+)/)
    if (sv) { servings = servings || Number(sv[1]); continue }
    if (/^ingredients\b/.test(low)) { mode = 'ing'; continue }
    if (/^(instructions|directions|method|steps|preparation)\b/.test(low)) { mode = 'steps'; continue }
    const numbered = l.match(/^(?:step\s*)?\d+[.)]\s+(.*)$/i)
    if (mode === 'steps' || (numbered && l.length > 30)) { steps.push(numbered ? numbered[1] : l); continue }
    if (qtyOf(l) || mode === 'ing') { ing.push(l); mode = mode === 'head' ? 'ing' : mode; continue }
    if (!name) name = l
    else if (!description && l.length > 30) description = l
    else steps.push(l)
  }
  const per = servings > 1 ? servings : 1
  const rows: SeedRow[] = [], unmatched: string[] = []
  for (const l of ing) {
    const qq = qtyOf(l)
    let q = qq?.q ?? 1, rest = qq?.rest ?? l
    const um = rest.match(/^([a-zA-Z]+)\.?\s+(?:of\s+)?(.*)$/)
    let unit = um ? UNIT[sing(um[1].toLowerCase())] ?? UNIT[um[1].toLowerCase()] : undefined
    const nameText = unit ? um![2] : rest
    const c = match(lib, nameText)
    if (!c) { unmatched.push(l); continue }
    let base = q, flag: string | undefined
    if (unit) {
      if (unit.to === c.basis) base = q * unit.f
      else if (c.basis === 'g' && unit.to === 'ml') {
        if (unit.hh && c.hh && c.hh[0].startsWith(unit.hh)) base = q * c.hh[1]
        else { base = q * unit.f; flag = `Converted ${unit.hh ?? 'ml'} to grams at 1 g per ml. Check the weight.` }
      } else if (c.basis === 'count') { base = q; flag = c.hh ? undefined : 'Counted as whole items. Check the amount.' }
      else if (unit.to === 'count' && c.hh) base = q * c.hh[1]
      else { base = q * unit.f; flag = 'Unit guessed. Check the amount.' }
    } else if (c.basis !== 'count') {
      if (c.hh) { base = q * c.hh[1]; flag = `Read as ${q} ${c.hh[0]}. Check the amount.` } else { base = q * 100; flag = 'No unit given. Check the amount.' }
    }
    base = base / per
    rows.push({ ingredientId: c.id, quantity: Math.round(base * 10) / 10, role: roleOf(c), notes: '', flag: per > 1 && !flag ? undefined : flag })
  }
  const meal: MealType = /breakfast|egg|oat|pancake|burrito/i.test(name) ? 'breakfast' : 'dinner'
  return { name: name || 'Imported recipe', description, mealType: meal, steps, rows, unmatched, source: per > 1 ? `Divided by ${per} servings.` : '' }
}
