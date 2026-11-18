import type { Day, Grocery, Macro, Mode, Pantry, ProfileId, ProfileState, Recipe, Role, Staples, Targets, PlanSummary, SharedGroceryItem } from './types'
import { DAYS, DAY_NAME } from './types'
import type { Library } from './data'
import { PKG, CATEGORY_ORDER } from './data'

export const ZERO: Macro = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }
export const add = (a: Macro, b: Macro): Macro => ({ kcal: a.kcal + b.kcal, proteinG: a.proteinG + b.proteinG, carbsG: a.carbsG + b.carbsG, fatG: a.fatG + b.fatG })
export const mul = (a: Macro, k: number): Macro => ({ kcal: a.kcal * k, proteinG: a.proteinG * k, carbsG: a.carbsG * k, fatG: a.fatG * k })
export const sum = (xs: Macro[]) => xs.reduce(add, ZERO)

export type Nut = (id: string) => Macro
export function makeNut(lib: Library): Nut {
  const cache = new Map<string, Macro>()
  return (id) => {
    const hit = cache.get(id)
    if (hit) return hit
    const c = lib.catalog[id]
    if (!c) return ZERO
    const per = c.per
    const d = c.basis === 'count' ? 1 : 100
    const v = mul(per, 1 / d)
    cache.set(id, v)
    return v
  }
}

/* ---------- Portioning (same rules as Gather v1) ---------- */
type Scales = { protein: number; starch: number; vegetable: number; fat: number }
const UNIT: Scales = { protein: 1, starch: 1, vegetable: 1, fat: 1 }
const scaleFor = (role: Role, s: Scales) =>
  role === 'protein' || role === 'starch' || role === 'vegetable' || role === 'fat' ? s[role] : role === 'sauce' || role === 'seasoning' ? 1 + 0.5 * (s.protein - 1) : 1
const roundQty = (q: number, role: Role, unit: string) =>
  unit === 'count' ? Math.round(q * 100) / 100
  : role === 'protein' || role === 'starch' || role === 'vegetable' ? (q >= 20 ? Math.round(q / 5) * 5 : Math.round(q))
  : role === 'fat' ? Math.round(q * 2) / 2 : Math.round(q * 10) / 10

export interface Formula { recipeId: string; qty: Record<string, number>; perServing: Macro; adjusted: boolean }
export function portion(r: Recipe, s: Scales, pins: Record<string, number> | undefined, nut: Nut, round = true): Formula {
  const qty: Record<string, number> = {}
  let m = ZERO, adjusted = false
  for (const i of r.ingredients) {
    let q: number
    if (pins && pins[i.ingredientId] != null) q = pins[i.ingredientId]
    else {
      q = i.scalable ? i.quantity * scaleFor(i.role, s) : i.quantity
      q = Math.min(i.maxPerServing, Math.max(i.minPerServing, q))
      if (round) q = roundQty(q, i.role, i.unit)
    }
    if (Math.abs(q - i.quantity) > 1e-6) adjusted = true
    qty[i.ingredientId] = q
    if (!i.optional) m = add(m, mul(nut(i.ingredientId), q))
  }
  return { recipeId: r.id, qty, perServing: m, adjusted }
}
export const basePortion = (r: Recipe, nut: Nut, pins?: Record<string, number>) => portion(r, UNIT, pins, nut)

const steps = (a: number, b: number, s: number) => { const o: number[] = []; for (let x = a; x <= b + 1e-9; x += s) o.push(Math.round(x * 100) / 100); return o }
const GRID: Record<keyof Scales, number[]> ={ protein: steps(0.75, 1.5, 0.05), starch: steps(0.4, 1.5, 0.05), vegetable: steps(0.8, 1.75, 0.05), fat: steps(0.5, 1.3, 0.1) }

interface OptDay { fixed: Macro; lunch: string | null; dinner: string | null }
function cost(t: Targets, recipes: Recipe[], sc: Record<string, Scales>, pins: Record<string, Record<string, number>>, nut: Nut, days: OptDay[]) {
  const per: Record<string, Macro> = {}
  let c = 0
  for (const r of recipes) {
    per[r.id] = portion(r, sc[r.id], pins[r.id], nut, false).perServing
    const s = sc[r.id]
    c += 0.25 * (((s.protein - 1) / 0.25) ** 2 + ((s.starch - 1) / 0.3) ** 2 + ((s.fat - 1) / 0.3) ** 2 + 0.4 * ((s.vegetable - 1) / 0.3) ** 2)
  }
  for (const d of days) {
    const L = d.lunch ? per[d.lunch] : ZERO, D = d.dinner ? per[d.dinner] : ZERO
    if (!d.lunch && !d.dinner) continue
    const tot = add(d.fixed, add(L, D))
    if (t.caloriesKcal) c += ((tot.kcal - t.caloriesKcal) / (0.05 * t.caloriesKcal)) ** 2
    if (t.carbsMaxG && tot.carbsG > t.carbsMaxG - 2) c += 6 * ((tot.carbsG - t.carbsMaxG + 2) / 10) ** 2 + 2
    if (t.proteinMinG && tot.proteinG < t.proteinMinG) c += 5 * ((t.proteinMinG - tot.proteinG) / 10) ** 2 + 1
    if (t.proteinPreferredMaxG && tot.proteinG > t.proteinPreferredMaxG) c += 0.4 * ((tot.proteinG - t.proteinPreferredMaxG) / 15) ** 2
    if (t.fatTargetG) c += 0.6 * ((tot.fatG - t.fatTargetG) / (0.15 * t.fatTargetG)) ** 2
    for (const m of [d.lunch ? L : null, d.dinner ? D : null]) if (m && m.kcal < t.minMealKcal) c += 3 * ((t.minMealKcal - m.kcal) / 50) ** 2
    if (d.lunch && d.dinner && L.kcal + D.kcal > 0) c += 0.6 * ((L.kcal / (L.kcal + D.kcal) - t.lunchShare) / 0.1) ** 2
  }
  return c
}
function optimize(t: Targets, recipes: Recipe[], pins: Record<string, Record<string, number>>, nut: Nut, days: OptDay[]) {
  const sc: Record<string, Scales> = Object.fromEntries(recipes.map((r) => [r.id, { ...UNIT }]))
  if (!recipes.length) return sc
  let best = cost(t, recipes, sc, pins, nut, days)
  for (let pass = 0; pass < 8; pass++) {
    let moved = false
    for (const r of recipes) {
      const keys: (keyof Scales)[] = r.flexible ? ['protein', 'starch', 'fat', 'vegetable'] : ['starch', 'vegetable']
      for (const k of keys) {
        const cur = sc[r.id][k]
        let keep = cur
        for (const v of GRID[k]) {
          if (v === cur) continue
          sc[r.id][k] = v
          const c = cost(t, recipes, sc, pins, nut, days)
          if (c < best - 1e-9) { best = c; keep = v; moved = true }
        }
        sc[r.id][k] = keep
      }
    }
    if (!moved) break
  }
  return sc
}

/* ---------- Staples (Tanner's recurring items) ---------- */
export interface Entry {
  key: string
  slot: 'breakfast' | 'latte' | 'snack' | 'lunch' | 'withLunch' | 'dinner' | 'shake'
  label: string
  name: string
  recipeId?: string
  items: { ingredientId: string; qty: number }[]
  macro: Macro
  mode?: Mode
}
const SLOT_ORDER: Entry['slot'][] = ['breakfast', 'latte', 'snack', 'lunch', 'withLunch', 'shake', 'dinner']

export const SNACKS = { yogurt: { name: 'Dannon Light & Fit strawberry yogurt', items: [{ ingredientId: 'dannon-lf-strawberry', qty: 1 }] }, none: { name: '', items: [] } }
export const WITH_LUNCH = {
  bar: { name: 'David protein bar', items: [{ ingredientId: 'david-bar-pbcc', qty: 1 }] },
  'bar-banana': { name: 'David bar + banana', items: [{ ingredientId: 'david-bar-pbcc', qty: 1 }, { ingredientId: 'banana', qty: 1 }] },
  banana: { name: 'Banana', items: [{ ingredientId: 'banana', qty: 1 }] },
  none: { name: '', items: [] },
}
function stapleEntries(day: Day, st: Staples, nut: Nut): Entry[] {
  const mk = (slot: Entry['slot'], label: string, name: string, items: Entry['items']): Entry =>
    ({ key: `${day}.${slot}`, slot, label, name, items, macro: sum(items.map((i) => mul(nut(i.ingredientId), i.qty))) })
  const out: Entry[] = []
  if (st.latte) out.push(mk('latte', 'Latte', 'Sugar-free latte', [{ ingredientId: 'vanilla-latte', qty: 1 }]))
  if (st.snack !== 'none') out.push(mk('snack', 'Snack', SNACKS[st.snack].name, SNACKS[st.snack].items))
  if (st.withLunch !== 'none') out.push(mk('withLunch', 'With lunch', WITH_LUNCH[st.withLunch].name, WITH_LUNCH[st.withLunch].items))
  if (st.shake === 'bpn') {
    const items = [{ ingredientId: 'bpn-mocha', qty: 1 }, ...(st.bpnMilkMl > 0 ? [{ ingredientId: 'milk-2', qty: st.bpnMilkMl }] : [])]
    out.push(mk('shake', 'Shake', st.bpnMilkMl > 0 ? `BPN mocha whey isolate + ${st.bpnMilkMl} ml 2% milk` : 'BPN mocha whey isolate, with water', items))
  } else if (st.shake === 'fairlife') out.push(mk('shake', 'Shake', 'Fairlife chocolate shake', [{ ingredientId: 'fairlife-choc', qty: 1 }]))
  return out
}

/* ---------- Modes ----------
   A recipe planned once is cooked fresh. Planned two or more times, it is prepped if the person said so when asked.
   Fish is always fresh. */
export const isFish = (r: Recipe) => /salmon|cod|fish|shrimp|tuna|tilapia/i.test(r.primaryProtein)
export const countOf = (p: ProfileState, id: string) => DAYS.reduce((n, d) => n + (['breakfast', 'lunch', 'dinner'] as const).filter((k) => p.days[d][k] === id).length, 0)
export const modeOf = (p: ProfileState, r: Recipe): Mode => (isFish(r) || countOf(p, r.id) < 2 ? 'fresh' : p.modes[r.id] ?? 'fresh')
/* Recipes to ask about: planned 2+ times, not fish, and not yet answered at this count. */
export function needsPrepQuestion(p: ProfileState, lib: { recipes: Record<string, Recipe> }): string | null {
  const seen = new Set<string>()
  for (const d of DAYS) for (const k of ['breakfast', 'lunch', 'dinner'] as const) {
    const id = p.days[d][k]
    if (!id || seen.has(id) || !lib.recipes[id]) continue
    seen.add(id)
    const n = countOf(p, id)
    if (n >= 2 && !isFish(lib.recipes[id]) && p.modeAsked?.[id] !== n) return id
  }
  return null
}

/* ---------- Derive a profile's week ---------- */
export type Status = 'met' | 'near' | 'over' | 'under' | 'none'
export interface DayView { day: Day; entries: Entry[]; totals: Macro; status: { kcal: Status; protein: Status; carbs: Status; fat: Status } }
export interface Derived { formulas: Record<string, Formula>; days: DayView[]; targets: Targets | null; planned: Recipe[] }

export function statusOf(t: Targets, m: Macro): DayView['status'] {
  const s: DayView['status'] = { kcal: 'none', protein: 'none', carbs: 'none', fat: 'none' }
  if (t.caloriesKcal) {
    const d = (m.kcal - t.caloriesKcal) / t.caloriesKcal * 100
    s.kcal = Math.abs(d) <= t.tolerancePct ? 'met' : Math.abs(d) <= t.tolerancePct * 2 ? 'near' : d > 0 ? 'over' : 'under'
  }
  if (t.proteinMinG) s.protein = m.proteinG >= t.proteinMinG - 0.5 ? 'met' : m.proteinG >= t.proteinMinG - 10 ? 'near' : 'under'
  if (t.carbsMaxG) s.carbs = m.carbsG <= t.carbsMaxG + 0.5 ? 'met' : m.carbsG <= t.carbsMaxG + 10 ? 'near' : 'over'
  if (t.fatTargetG) { const r = Math.abs(m.fatG - t.fatTargetG) / t.fatTargetG; s.fat = r <= 0.1 ? 'met' : r <= 0.2 ? 'near' : m.fatG > t.fatTargetG ? 'over' : 'under' }
  return s
}

export function derive(lib: Library, p: ProfileState): Derived {
  const nut = makeNut(lib)
  const t = p.targetsOn && p.targets.caloriesKcal ? p.targets : null
  const flexIds = [...new Set(DAYS.flatMap((d) => [p.days[d].lunch, p.days[d].dinner]).filter((x): x is string => !!x && !!lib.recipes[x]))]
  const flex = flexIds.map((id) => lib.recipes[id])
  const fixedByDay = Object.fromEntries(DAYS.map((d) => {
    const es: Entry[] = []
    const b = p.days[d].breakfast
    if (b && lib.recipes[b]) {
      const r = lib.recipes[b], f = basePortion(r, nut, p.pins[b])
      es.push({ key: `${d}.breakfast`, slot: 'breakfast', label: 'Breakfast', name: r.name, recipeId: b, items: r.ingredients.filter((i) => !i.optional).map((i) => ({ ingredientId: i.ingredientId, qty: f.qty[i.ingredientId] })), macro: f.perServing, mode: modeOf(p, r) })
    }
    if (p.staples) es.push(...stapleEntries(d, p.staples, nut))
    return [d, es]
  })) as Record<Day, Entry[]>
  const sc = t ? optimize(t, flex, p.pins, nut, DAYS.map((d) => ({ fixed: sum(fixedByDay[d].map((e) => e.macro)), lunch: p.days[d].lunch, dinner: p.days[d].dinner }))) : Object.fromEntries(flex.map((r) => [r.id, { ...UNIT }]))
  const formulas: Record<string, Formula> = Object.fromEntries(flex.map((r) => [r.id, portion(r, sc[r.id], p.pins[r.id], nut)]))
  const breakfastIds = [...new Set(DAYS.map((d) => p.days[d].breakfast).filter((x): x is string => !!x && !!lib.recipes[x]))]
  for (const b of breakfastIds) formulas[b] = basePortion(lib.recipes[b], nut, p.pins[b])
  const days = DAYS.map((d) => {
    const es = [...fixedByDay[d]]
    for (const slot of ['lunch', 'dinner'] as const) {
      const id = p.days[d][slot]
      if (!id || !lib.recipes[id]) continue
      const r = lib.recipes[id], f = formulas[id]
      es.push({ key: `${d}.${slot}`, slot, label: slot === 'lunch' ? 'Lunch' : 'Dinner', name: r.name, recipeId: id, items: r.ingredients.filter((i) => !i.optional).map((i) => ({ ingredientId: i.ingredientId, qty: f.qty[i.ingredientId] })), macro: f.perServing, mode: modeOf(p, r) })
    }
    es.sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot))
    const totals = sum(es.map((e) => e.macro))
    return { day: d, entries: es, totals, status: t ? statusOf(t, totals) : { kcal: 'none', protein: 'none', carbs: 'none', fat: 'none' } } as DayView
  })
  return { formulas, days, targets: t, planned: [...breakfastIds, ...flexIds].map((id) => lib.recipes[id]) }
}

/* ---------- Prep sessions ---------- */
export interface PrepGroup { recipe: Recipe; formula: Formula; days: Day[]; fridge: Day[]; freeze: Day[] }
export function prepGroups(lib: Library, p: ProfileState, dv: Derived): PrepGroup[] {
  const map = new Map<string, Day[]>()
  for (const d of DAYS) for (const slot of ['breakfast', 'lunch', 'dinner'] as const) {
    const id = p.days[d][slot]
    if (!id || !lib.recipes[id] || modeOf(p, lib.recipes[id]) !== 'prep') continue
    map.set(id, [...(map.get(id) ?? []), d])
  }
  return [...map].map(([id, ds]) => ({ recipe: lib.recipes[id], formula: dv.formulas[id], days: ds, fridge: ds, freeze: [] }))
}

/* ---------- Grocery ---------- */
/* This person's needs for the week, in the shape both people publish. */
export function myGrocery(lib: Library, dv: Derived): SharedGroceryItem[] {
  const m = new Map<string, SharedGroceryItem>()
  const byWhat = new Map<string, { days: Day[]; items: Map<string, number> }>()
  for (const d of dv.days) for (const e of d.entries) {
    const k = e.recipeId ?? e.name
    const g = byWhat.get(k) ?? { days: [] as Day[], items: new Map<string, number>() }
    g.days.push(d.day)
    for (const it of e.items) g.items.set(it.ingredientId, (g.items.get(it.ingredientId) ?? 0) + it.qty)
    byWhat.set(k, g)
  }
  for (const [k, g] of byWhat) {
    const what = `${lib.recipes[k]?.name ?? k} (${g.days.length}×)`
    for (const [id, q] of g.items) {
      const c = lib.catalog[id]
      if (!c || PKG[id]?.notGrocery || !(q > 0)) continue
      const cur = m.get(id) ?? { id, name: c.name, category: c.category, qty: 0, pantry: !!c.pantry, uses: [] }
      cur.qty += q
      cur.uses.push(what)
      m.set(id, cur)
    }
  }
  return [...m.values()]
}
export interface GroceryItem { id: string; name: string; category: string; qty: number; pantry: boolean; uses: { who: string; what: string }[]; buy: string; amount: string; leftover: string | null }
export function mergeGrocery(lib: Library, lists: { who: string; items: SharedGroceryItem[] }[]): GroceryItem[] {
  const m = new Map<string, GroceryItem>()
  for (const l of lists) for (const i of l.items) {
    const cur = m.get(i.id) ?? { id: i.id, name: lib.catalog[i.id]?.name ?? i.name, category: lib.catalog[i.id]?.category ?? i.category, qty: 0, pantry: lib.catalog[i.id] ? !!lib.catalog[i.id].pantry : i.pantry, uses: [], buy: '', amount: '', leftover: null }
    cur.qty += i.qty
    cur.uses.push(...i.uses.map((what) => ({ who: l.who, what })))
    m.set(i.id, cur)
  }
  return [...m.values()].map((i) => ({ ...i, ...buyFor(lib, i.id, i.qty) }))
    .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name))
}

/* ---------- Pantry ---------- */
export const isStaple = (lib: Library, id: string) => !!lib.catalog[id]?.pantry
/* Share of a recipe's main ingredients (not spices or oils) that the pantry covers for one serving. */
export function pantryScore(lib: Library, r: Recipe, pantry: Pantry) {
  const main = r.ingredients.filter((i) => !i.optional && !isStaple(lib, i.ingredientId) && i.role !== 'seasoning')
  if (!main.length) return 0
  return main.filter((i) => (pantry.items[i.ingredientId]?.qty ?? 0) >= i.quantity * 0.95).length / main.length
}
export const canMakeNow = (lib: Library, r: Recipe, pantry: Pantry) => pantryScore(lib, r, pantry) >= 0.999
/* Raw amounts a recipe uses, for taking out of the pantry. */
export function usage(lib: Library, r: Recipe, f: Formula, times: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const i of r.ingredients) if (!i.optional && !isStaple(lib, i.ingredientId) && f.qty[i.ingredientId] > 0) out[i.ingredientId] = (out[i.ingredientId] ?? 0) + f.qty[i.ingredientId] * times
  return out
}
export function applyUsage(p: Pantry, use: Record<string, number>, sign: 1 | -1): Pantry {
  const items = { ...p.items }
  for (const [id, q] of Object.entries(use)) {
    const cur = items[id]
    if (!cur && sign < 0) continue
    const qty = Math.max(0, (cur?.qty ?? 0) + sign * q)
    if (qty <= 0.5 && !cur?.have) delete items[id]
    else items[id] = { ...(cur ?? {}), qty, at: new Date().toISOString() }
  }
  return { items }
}

/* ---------- Shopping list ----------
   One row per ingredient: what meals still need after the pantry, plus anything added by hand. Free-text items get their own rows. */
export interface ListRow {
  key: string
  ingredientId?: string
  name: string
  category: string
  mealQty: number
  manualQty: number
  totalQty: number
  buy: string
  detail: string
  who: string[]
  staple: boolean
  itemIds: string[]
  checked: boolean
}
export function buildList(lib: Library, needs: { who: string; items: SharedGroceryItem[] }[], grocery: Grocery, pantry: Pantry): { rows: ListRow[]; staplesToCheck: GroceryItem[] } {
  const merged = mergeGrocery(lib, needs)
  const rows = new Map<string, ListRow>()
  const staplesToCheck: GroceryItem[] = []
  for (const n of merged) {
    const pe = pantry.items[n.id]
    if (n.pantry) {
      if (pe?.have) continue
      if (pe?.have === false) rows.set(`ing:${n.id}`, { key: `ing:${n.id}`, ingredientId: n.id, name: n.name, category: n.category, mealQty: n.qty, manualQty: 0, totalQty: 0, buy: '', detail: 'Marked out in the pantry', who: [...new Set(n.uses.map((u) => u.who))], staple: true, itemIds: [], checked: false })
      else staplesToCheck.push(n)
      continue
    }
    const short = Math.max(0, n.qty - (pe?.qty ?? 0))
    if (short <= 0.5) continue
    rows.set(`ing:${n.id}`, { key: `ing:${n.id}`, ingredientId: n.id, name: n.name, category: n.category, mealQty: short, manualQty: 0, totalQty: short, buy: '', detail: pe?.qty ? `${household(lib, n.id, n.qty)} for meals, ${household(lib, n.id, pe.qty)} on hand` : `${household(lib, n.id, n.qty)} for meals`, who: [...new Set(n.uses.map((u) => u.who))], staple: false, itemIds: [], checked: false })
  }
  for (const it of grocery.items) {
    if (it.ingredientId && lib.catalog[it.ingredientId]) {
      const c = lib.catalog[it.ingredientId], key = `ing:${c.id}`
      const row = rows.get(key) ?? { key, ingredientId: c.id, name: c.name, category: c.category, mealQty: 0, manualQty: 0, totalQty: 0, buy: '', detail: '', who: [], staple: !!c.pantry, itemIds: [], checked: false }
      row.manualQty += it.qty ?? 0
      row.itemIds.push(it.id)
      const added = it.qty ? `${household(lib, c.id, it.qty)} added` : 'added'
      row.detail = [row.detail, `${added}${it.note ? ` (${it.note})` : ''}`].filter(Boolean).join(', ')
      if (!row.who.includes(whoName(it.addedBy))) row.who.push(whoName(it.addedBy))
      rows.set(key, row)
    } else {
      const key = `txt:${it.id}`
      rows.set(key, { key, name: it.text, category: 'Other', mealQty: 0, manualQty: 0, totalQty: 0, buy: it.note ?? '', detail: '', who: [whoName(it.addedBy)], staple: false, itemIds: [it.id], checked: false })
    }
  }
  const out = [...rows.values()].map((r) => {
    r.totalQty = r.mealQty + r.manualQty
    r.checked = !!grocery.checked[r.key]
    if (r.ingredientId && r.totalQty > 0) r.buy = buyFor(lib, r.ingredientId, r.totalQty).buy
    else if (r.ingredientId && !r.buy) { const pk = pkgOf(lib, r.ingredientId); r.buy = pk ? `1 ${pk.one}${pk.label ? ` (${pk.label})` : ''}` : '' }
    return r
  })
  out.sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name))
  return { rows: out, staplesToCheck }
}
const whoName = (p: ProfileId) => (p === 'tanner' ? 'Tanner' : 'Jen')
/* How much a bought row adds to the pantry: whole packages when Gather knows the package size. */
export function boughtAmount(lib: Library, row: ListRow): number {
  if (!row.ingredientId) return 0
  const pk = pkgOf(lib, row.ingredientId)
  if (!pk) return row.totalQty
  const n = Math.max(1, Math.ceil(row.totalQty / pk.size - 0.03))
  return row.totalQty > 0 ? n * pk.size : pk.size
}

/* What the other person sees of this week: names and prep/fresh only. */
export function summarize(lib: Library, me: { id: string; profile: ProfileId }, p: ProfileState, dv: Derived, libraryImported: boolean): PlanSummary {
  const slot = (id: string | null) => (id && lib.recipes[id] ? { name: lib.recipes[id].name, mode: modeOf(p, lib.recipes[id]) } : null)
  return {
    id: me.id, profile: me.profile, weekOf: p.weekOf, libraryImported,
    days: Object.fromEntries(DAYS.map((d) => [d, { breakfast: slot(p.days[d].breakfast), lunch: slot(p.days[d].lunch), dinner: slot(p.days[d].dinner) }])) as PlanSummary['days'],
    grocery: myGrocery(lib, dv).map((i) => ({ ...i, qty: Math.round(i.qty * 10) / 10 })),
    updatedAt: new Date().toISOString(),
  }
}

/* ---------- Amount formatting ---------- */
const quarter = (x: number) => { const s = Math.round(x * 4) / 4, w = Math.floor(s), f = s - w; return ((w ? String(w) : '') + (f === 0.25 ? '¼' : f === 0.5 ? '½' : f === 0.75 ? '¾' : '')) || '<¼' }
export const pkgOf = (lib: Library, id: string) => lib.catalog[id]?.pkg ?? PKG[id]
export function household(lib: Library, id: string, q: number): string {
  const c = lib.catalog[id]
  if (!c) return String(Math.round(q))
  const pk = pkgOf(lib, id)
  if (c.basis === 'count') {
    const n = Math.round(q * 100) / 100
    const unit = id === 'egg' ? (n === 1 ? 'egg' : 'eggs') : id === 'dave-thin-21' ? (n === 1 ? 'slice' : 'slices') : pk?.each || pk?.size === 1 ? (n === 1 ? pk.one : pk.many) : id.includes('tortilla') ? (n === 1 ? 'tortilla' : 'tortillas') : id === 'bpn-mocha' ? (n === 1 ? 'scoop' : 'scoops') : id === 'dannon-lf-strawberry' ? (n === 1 ? 'cup' : 'cups') : id === 'fairlife-choc' ? (n === 1 ? 'bottle' : 'bottles') : ''
    return `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, '')} ${unit}`.trim()
  }
  if (c.basis === 'ml') return q < 45 ? `${quarter(q / 15)} tbsp` : q <= 960 ? `${quarter(q / 240)} cup${q > 300 ? 's' : ''}` : `${(q / 946).toFixed(1).replace(/\.0$/, '')} qt`
  if (c.hh && (c.category === 'Spices' || (q / c.hh[1] <= 6 && c.category !== 'Meat & Seafood'))) return `${quarter(q / c.hh[1])} ${c.hh[0]}`
  const lb = q / 453.6
  return lb >= 0.75 ? `${lb.toFixed(1).replace(/\.0$/, '')} lb` : `${Math.max(1, Math.round(q / 28.35))} oz`
}
export function buyFor(lib: Library, id: string, q: number) {
  const pk = pkgOf(lib, id), amount = household(lib, id, q)
  if (!pk) return { buy: amount, amount, leftover: null as string | null }
  const n = Math.max(1, Math.ceil(q / pk.size - 0.03))
  const word = n === 1 ? pk.one : pk.many
  const buy = pk.each || pk.size === 1 ? `${n} ${word}` : `${n} ${word}${pk.label ? ` (${pk.label})` : ''}`
  const spare = n * pk.size - q
  return { buy, amount, leftover: spare > pk.size * 0.15 && !pk.each && pk.size !== 1 ? household(lib, id, spare) : null }
}
export function metric(q: number, unit: string) {
  if (unit === 'count') { const n = Math.round(q * 100) / 100; return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '') }
  if (q >= 1000) return `${(q / 1000).toFixed(2).replace(/\.?0+$/, '')} ${unit === 'g' ? 'kg' : 'L'}`
  return `${q < 10 ? Math.round(q * 10) / 10 : Math.round(q)} ${unit}`
}
export function approx(lib: Library, id: string, q: number) {
  const c = lib.catalog[id]
  if (!c?.hh || c.basis === 'count') return null
  const r = q / c.hh[1]
  if (r < 0.12) return 'pinch'
  return `≈ ${quarter(r)} ${c.hh[0]}`
}

/* ---------- Foodnoms ---------- */
const STATE_WORD: Record<string, string> = { raw: 'raw', dry: 'dry', drained: 'drained', cooked: 'cooked' }
const foodName = (n: string) => { const t = n.replace(/\s*\(.*?\)\s*/g, ' ').trim().split(/,\s*/); return [...t.slice(1).reverse(), t[0]].join(' ').replace(/\s+/g, ' ').toLowerCase() }
export function foodnoms(lib: Library, r: Recipe, f: Formula, sep: string) {
  return r.ingredients.filter((i) => !i.optional && f.qty[i.ingredientId] > 0).map((i) => {
    const c = lib.catalog[i.ingredientId], q = f.qty[i.ingredientId], nm = foodName(c.name)
    if (c.basis === 'count') {
      const n = metric(q, 'count')
      return i.ingredientId === 'egg' ? `${n} large egg${q > 1 ? 's' : ''}` : i.ingredientId === 'dave-thin-21' ? `${n} slice${q > 1 ? 's' : ''} ${c.name}` : `${n} ${nm}`
    }
    const w = STATE_WORD[c.state] ? `${STATE_WORD[c.state]} ` : ''
    return `${q < 10 ? Math.round(q * 10) / 10 : Math.round(q)} ${c.basis} ${w}${nm}`
  }).join(sep)
}

/* ---------- Dates ---------- */
export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export function mondayOf(d = new Date()) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const w = (x.getDay() + 6) % 7; x.setDate(x.getDate() - w); return iso(x) }
export function dateOf(weekOf: string, day: Day) { const [y, m, d] = weekOf.split('-').map(Number); return new Date(y, m - 1, d + DAYS.indexOf(day)) }
export const todayKey = (): Day => DAYS[(new Date().getDay() + 6) % 7]
export const shortDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
export const dayList = (ds: Day[]) => ds.map((d) => DAY_NAME[d].slice(0, 3)).join(', ')

/* ---------- Suggest ---------- */
function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return (h >>> 0) / 4294967295 }
export function suggest(lib: Library, p: ProfileState, slot: 'lunch' | 'dinner', taken: string[], seed: string, pantry?: Pantry) {
  const pool = lib.mine.filter((r) => (r.mealType === 'lunch' || r.mealType === 'dinner') && !r.ingredients.some((i) => p.avoid.includes(i.ingredientId)) && !taken.includes(r.id))
  const used = taken.map((id) => lib.recipes[id]).filter(Boolean)
  const score = (r: Recipe) => (r.mealType === slot ? 1 : 0) + hash(r.id + seed) * 2 + (pantry ? pantryScore(lib, r, pantry) * 3 : 0) - used.filter((u) => u.primaryProtein === r.primaryProtein).length * 2 - used.filter((u) => u.cuisine === r.cuisine).length * 1.5
  return pool.sort((a, b) => score(b) - score(a))[0] ?? null
}
