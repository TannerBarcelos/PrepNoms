import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { CatalogItem, Day, DayPlan, Grocery, ListItem, Macro, Member, Pantry, Personal, PlanSummary, ProfileId, ProfileState, StoredRecipe } from './types'
import { DAYS } from './types'
import type { Base } from './data'
import { loadBase } from './data'
import { mondayOf } from './engine'

/* ------------------------------------------------------------------
   Storage
   cloud (inside claude.ai, signed in):
     config/members              owner writes; who is approved and as which profile
     requests/<id>               each viewer writes only their own; owner reads all
     data/users/<id>/state       private: plan, targets, ticks
     data/users/<id>/catalog     private: ingredient edits and custom ingredients
     data/users/<id>/r.<recipe>  private: one document per recipe
     plans/<id>                  each person writes only their own: meal names, prep/fresh, grocery needs
     household/grocery           shared shopping list, either person adds or ticks
     household/pantry            shared pantry quantities
   local (no db available, e.g. opened outside claude.ai): the same shapes in localStorage, as Tanner.
------------------------------------------------------------------- */

export interface Me { id: string; profile: ProfileId; isOwner: boolean }
export type Phase =
  | { k: 'loading' }
  | { k: 'waiting'; why: 'pending' | 'readonly' | 'blocked' }
  | { k: 'seeding'; done: number; total: number }
  | { k: 'ready' }
  | { k: 'error'; msg: string }
type Sync = 'local' | 'synced' | 'saving' | 'offline' | 'readonly'

const emptyWeek = (breakfast: string | null): Record<Day, DayPlan> =>
  Object.fromEntries(DAYS.map((d) => [d, { breakfast: d === 'sat' || d === 'sun' ? null : breakfast, lunch: null, dinner: null }])) as Record<Day, DayPlan>
export function freshPlan(profile: ProfileId): ProfileState {
  const weekOf = mondayOf()
  return profile === 'tanner'
    ? {
        targets: { caloriesKcal: 1940, proteinMinG: 194, proteinPreferredMaxG: 215, carbsMaxG: 170, fatTargetG: 54, tolerancePct: 5, lunchShare: 0.45, minMealKcal: 450 },
        targetsOn: true, staples: { latte: true, snack: 'yogurt', withLunch: 'bar', shake: 'bpn', bpnMilkMl: 0 },
        weekOf, days: emptyWeek('t-bf-egg-sandwich'), modes: { 't-bf-egg-sandwich': 'fresh' }, modeAsked: { 't-bf-egg-sandwich': 5 }, pins: {}, avoid: ['mushrooms', 'dijon'], prepDay: 'sun',
      }
    : { targets: { tolerancePct: 5, lunchShare: 0.5, minMealKcal: 400 }, targetsOn: false, staples: null, weekOf, days: emptyWeek(null), modes: {}, pins: {}, avoid: [] }
}
export const freshPersonal = (profile: ProfileId): Personal => ({ v: 3, profile, plan: freshPlan(profile), done: {}, updatedAt: new Date().toISOString() })
const emptyGrocery = (): Grocery => ({ checked: {}, items: [] })
const emptyPantry = (): Pantry => ({ items: {} })
/* Older lists kept hand-added items in `extra`. */
export function normalizeGrocery(g: any, by: ProfileId = 'tanner'): Grocery {
  if (!g) return emptyGrocery()
  const items: ListItem[] = Array.isArray(g.items) ? g.items : (g.extra ?? []).map((x: any) => ({ id: x.id, text: x.text, addedBy: by, at: new Date().toISOString() }))
  const checked: Record<string, boolean> = {}
  for (const [k, v] of Object.entries(g.checked ?? {})) checked[k.includes(':') ? k : `ing:${k}`] = !!v
  for (const x of g.extra ?? []) if (x.done) checked[`txt:${x.id}`] = true
  return { checked, items }
}

/* Gather v2 kept both people in one document. Pull one person's part out of it. */
function fromV2(old: any, profile: ProfileId, base: Base): { personal: Personal; catalog: Record<string, CatalogItem>; grocery: Grocery | null } | null {
  if (!old || old.v !== 2 || !old.profiles?.[profile]) return null
  const done: Record<string, boolean> = {}
  for (const [k, v] of Object.entries(old.done ?? {})) {
    const parts = k.split(':')
    if (parts[1] === profile) done[`${parts[0]}:${parts.slice(2).join(':')}`] = !!v
    else if (parts[1] === 'prep' && parts[2] === profile) done[`${parts[0]}:prep:${parts.slice(3).join(':')}`] = !!v
  }
  const catalog: Record<string, CatalogItem> = {}
  for (const [id, per] of Object.entries(old.products ?? {})) if (base.catalog[id]) catalog[id] = { ...base.catalog[id], per: per as Macro }
  const g = old.grocery ? normalizeGrocery(old.grocery, profile) : null
  return { personal: { v: 3, profile, plan: old.profiles[profile], done, updatedAt: new Date().toISOString() }, catalog, grocery: g }
}

interface Ctx {
  phase: Phase
  mode: 'local' | 'cloud'
  me: Me
  base: Base
  personal: Personal
  recipes: Record<string, StoredRecipe>
  catalogEdits: Record<string, CatalogItem>
  partners: PlanSummary[]
  grocery: Grocery
  pantry: Pantry
  members: Record<string, Member>
  requests: { id: string; at: string }[]
  update: (fn: (p: Personal) => Personal) => void
  saveRecipe: (r: StoredRecipe) => Promise<void>
  deleteRecipe: (id: string) => Promise<void>
  saveIngredient: (c: CatalogItem) => void
  resetIngredient: (id: string) => void
  updateGrocery: (fn: (g: Grocery) => Grocery) => void
  updatePantry: (fn: (p: Pantry) => Pantry) => void
  publish: (s: PlanSummary) => void
  setMember: (id: string, m: Member | null) => void
  restore: (b: { personal: Personal; recipes: Record<string, StoredRecipe>; catalog: Record<string, CatalogItem> }) => Promise<void>
  nameOf: (ids: string[]) => Promise<Record<string, string>>
  sync: Sync
  toast: (m: string) => void
  toastMsg: string | null
}
export const StoreCtx = createContext<Ctx>(null as unknown as Ctx)
export const useStore = () => useContext(StoreCtx)

const LKEY = 'gather.v3'
function readLocal(): any { try { return JSON.parse(localStorage.getItem(LKEY) ?? 'null') } catch { return null } }
function writeLocal(v: unknown) { try { localStorage.setItem(LKEY, JSON.stringify(v)) } catch { /* full or blocked */ } }
function readLocalV2(): any { try { return JSON.parse(localStorage.getItem('gather.v2') ?? 'null') } catch { return null } }

declare global { interface Window { claude?: { use: (n: string) => Promise<any> } } }

export function useStoreValue(): Ctx | null {
  const [base, setBase] = useState<Base | null>(null)
  const [phase, setPhase] = useState<Phase>({ k: 'loading' })
  const [mode, setMode] = useState<'local' | 'cloud'>('local')
  const [me, setMe] = useState<Me>({ id: 'local', profile: 'tanner', isOwner: true })
  const [personal, setPersonal] = useState<Personal>(() => freshPersonal('tanner'))
  const [recipes, setRecipes] = useState<Record<string, StoredRecipe>>({})
  const [catalogEdits, setCatalogEdits] = useState<Record<string, CatalogItem>>({})
  const [partners, setPartners] = useState<PlanSummary[]>([])
  const [grocery, setGrocery] = useState<Grocery>(emptyGrocery)
  const [pantry, setPantry] = useState<Pantry>(emptyPantry)
  const [members, setMembers] = useState<Record<string, Member>>({})
  const [requests, setRequests] = useState<{ id: string; at: string }[]>([])
  const [sync, setSync] = useState<Sync>('local')
  const [toastMsg, setToast] = useState<string | null>(null)

  const db = useRef<any>(null)
  const user = useRef<any>(null)
  const meRef = useRef(me)
  const pRef = useRef(personal), rRef = useRef(recipes), cRef = useRef(catalogEdits), gRef = useRef(grocery), panRef = useRef(pantry)
  const chains = useRef(new Map<string, Promise<unknown>>())
  const timers = useRef(new Map<string, number>())
  const lastPub = useRef('')
  pRef.current = personal; rRef.current = recipes; cRef.current = catalogEdits; gRef.current = grocery; panRef.current = pantry; meRef.current = me

  const toast = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast((x) => (x === m ? null : x)), 2600) }, [])

  /* One write at a time per document; later writes queue behind earlier ones. */
  const write = useCallback((path: string, fn: () => Promise<void>) => {
    const prev = chains.current.get(path) ?? Promise.resolve()
    const next = prev.catch(() => {}).then(async () => {
      setSync('saving')
      try { await fn(); setSync('synced') } catch (e: any) {
        if (e?.code === 'invalid_argument') { setSync('readonly'); toast("Changes can't be saved with your access. Ask Tanner to make you an Editor.") }
        else if (e?.code === 'quota_exceeded') { setSync('offline'); toast('Storage is full. Delete some custom recipes to make room.') }
        else setSync('offline')
      }
    })
    chains.current.set(path, next)
    return next
  }, [toast])
  const later = useCallback((key: string, ms: number, fn: () => void) => { window.clearTimeout(timers.current.get(key)); timers.current.set(key, window.setTimeout(fn, ms)) }, [])

  const persistLocal = useCallback(() => {
    if (mode !== 'local') return
    writeLocal({ personal: pRef.current, recipes: rRef.current, catalog: cRef.current, grocery: gRef.current, pantry: panRef.current })
  }, [mode])
  const priv = (k: string) => db.current.doc(`data/users/${meRef.current.id}/${k}`)

  /* ---------- boot ---------- */
  useEffect(() => {
    let dead = false
    const offs: (() => void)[] = []
    ;(async () => {
      let b: Base
      try { b = await loadBase() } catch (e: any) { setPhase({ k: 'error', msg: `Gather couldn't load its ingredient list (${e?.message ?? e}). Reload to try again.` }); return }
      if (dead) return
      setBase(b)
      let d: any = null, u: any = null
      try { d = window.claude?.use ? await window.claude.use('db') : null; u = d ? await window.claude!.use('user') : null } catch { d = null }
      const id: string | null = u ? await u.id() : null
      if (dead) return
      if (!d || !id) return bootLocal(b)
      db.current = d; user.current = u; setMode('cloud'); setSync('synced')
      const isOwner = !!(await u.isOwner())
      let started = false, asked = false
      const watchdog = window.setTimeout(() => setPhase((p) => (p.k === 'loading' ? { k: 'error', msg: "Gather can't reach its storage right now. Check your connection; it will keep trying." } : p)), 10000)
      offs.push(d.doc('config/members').onSnapshot(async (snap: any) => {
        if (snap.metadata?.fromCache) return
        window.clearTimeout(watchdog)
        const m: Record<string, Member> = (snap.data()?.members as Record<string, Member>) ?? {}
        setMembers(m)
        let entry = m[id]
        if (isOwner && !entry) {
          entry = { profile: 'tanner', status: 'approved', at: new Date().toISOString() }
          await write('config/members', () => d.doc('config/members').set({ members: { ...m, [id]: entry } }))
        }
        if (!entry) {
          if (asked) return
          asked = true
          try { const ex = await d.doc(`requests/${id}`).get(); if (!ex.exists) await d.doc(`requests/${id}`).set({ at: new Date().toISOString() }); setPhase({ k: 'waiting', why: 'pending' }) }
          catch { setPhase({ k: 'waiting', why: 'readonly' }) }
          return
        }
        if (entry.status === 'blocked') { setPhase({ k: 'waiting', why: 'blocked' }); return }
        if (started) return
        started = true
        const meNow: Me = { id, profile: entry.profile, isOwner }
        setMe(meNow); meRef.current = meNow
        startPrivate(d, b, meNow, offs)
        offs.push(d.collection('plans').onSnapshot((qs: any) => setPartners(qs.docs.filter((x: any) => x.id !== id).map((x: any) => x.data() as PlanSummary)), () => {}))
        offs.push(d.doc('household/grocery').onSnapshot((gs: any) => { if (gs.exists) setGrocery(normalizeGrocery(gs.data())) }, () => {}))
        offs.push(d.doc('household/pantry').onSnapshot((ps: any) => { if (ps.exists) setPantry({ items: (ps.data()?.items as Pantry['items']) ?? {} }) }, () => {}))
        if (isOwner) offs.push(d.collection('requests').onSnapshot((qs: any) => setRequests(qs.docs.map((x: any) => ({ id: x.id, at: String(x.data()?.at ?? '') }))), () => {}))
      }, (e: any) => { window.clearTimeout(watchdog); setPhase({ k: 'error', msg: e?.code === 'revoked' ? 'Your access to Gather changed. Reload the page.' : "Gather can't reach its storage right now." }) }))
    })()
    return () => { dead = true; offs.forEach((f) => f()) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function bootLocal(b: Base) {
    setMode('local'); setSync('local')
    const saved = readLocal()
    if (saved?.personal?.v === 3) {
      setPersonal(saved.personal); setRecipes(saved.recipes ?? {}); setCatalogEdits(saved.catalog ?? {}); setGrocery(normalizeGrocery(saved.grocery)); setPantry(saved.pantry ?? emptyPantry())
    } else {
      const mig = fromV2(readLocalV2(), 'tanner', b)
      setPersonal(mig?.personal ?? freshPersonal('tanner'))
      setCatalogEdits(mig?.catalog ?? {})
      setGrocery(mig?.grocery ?? emptyGrocery())
      setRecipes(Object.fromEntries(b.recipes.tanner.map((r) => [r.id, r])))
    }
    setPhase({ k: 'ready' })
  }

  function startPrivate(d: any, b: Base, meNow: Me, offs: (() => void)[]) {
    let seeded = false
    offs.push(d.collection(`data/users/${meNow.id}`).onSnapshot(async (qs: any) => {
      if (qs.metadata?.fromCache && !seeded) return
      const docs: Record<string, any> = Object.fromEntries(qs.docs.map((x: any) => [x.id, x.data()]))
      if (!docs.state && !seeded) {
        seeded = true
        await seed(d, b, meNow)
        return
      }
      seeded = true
      if (docs.state && (!pRef.current || docs.state.updatedAt >= pRef.current.updatedAt || pRef.current.profile !== meNow.profile)) setPersonal(docs.state as Personal)
      setCatalogEdits((docs.catalog?.items as Record<string, CatalogItem>) ?? {})
      setRecipes(Object.fromEntries(Object.entries(docs).filter(([k]) => k.startsWith('r.')).map(([, v]) => [(v as StoredRecipe).id, v as StoredRecipe])))
      setPhase((p) => (p.k === 'seeding' && p.done < p.total ? p : { k: 'ready' }))
    }, (e: any) => setPhase({ k: 'error', msg: e?.code === 'revoked' ? 'Your access to Gather changed. Reload the page.' : "Gather can't reach your recipes right now." })))
  }

  /* First visit for this person: copy their recipe file into their private space, and carry over anything from Gather v2. */
  async function seed(d: any, b: Base, meNow: Me) {
    let old: any = null
    try { const o = await d.doc('household/gather-v2').get(); if (o.exists) old = JSON.parse(String(o.data()?.payload ?? 'null')) } catch { /* nothing to migrate */ }
    const mig = fromV2(old, meNow.profile, b)
    const list = b.recipes[meNow.profile]
    setPhase({ k: 'seeding', done: 0, total: list.length })
    const p = mig?.personal ?? freshPersonal(meNow.profile)
    setPersonal(p); pRef.current = p
    const rs: Record<string, StoredRecipe> = {}
    let n = 0
    for (const r of list) {
      rs[r.id] = r
      for (let attempt = 0; attempt < 4; attempt++) {
        try { await d.doc(`data/users/${meNow.id}/r.${r.id}`).set(r as any); break }
        catch (e: any) { if (e?.code === 'resource_exhausted' || e?.code === 'unavailable') await new Promise((ok) => setTimeout(ok, 800 * (attempt + 1))); else throw e }
      }
      setPhase({ k: 'seeding', done: ++n, total: list.length })
    }
    setRecipes(rs)
    if (mig?.catalog && Object.keys(mig.catalog).length) await d.doc(`data/users/${meNow.id}/catalog`).set({ items: mig.catalog })
    if (meNow.isOwner && mig?.grocery) { const g = await d.doc('household/grocery').get(); if (!g.exists) await d.doc('household/grocery').set(mig.grocery as any) }
    await d.doc(`data/users/${meNow.id}/state`).set(p as any)
    // The v2 document held both people's data where either could read it. Once the owner's part is private, remove it.
    if (meNow.isOwner && old) { try { await d.doc('household/gather-v2').delete() } catch { /* keep going */ } }
    setPhase({ k: 'ready' })
  }

  /* ---------- actions ---------- */
  const update = useCallback((fn: (p: Personal) => Personal) => {
    const next = { ...fn(pRef.current), updatedAt: new Date().toISOString() }
    pRef.current = next; setPersonal(next)
    if (mode === 'local') { persistLocal(); return }
    later('state', 700, () => write('state', () => priv('state').set(pRef.current as any)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, persistLocal, later, write])

  const saveRecipe = useCallback(async (r: StoredRecipe) => {
    const v = { ...r, updatedAt: new Date().toISOString() }
    rRef.current = { ...rRef.current, [r.id]: v }; setRecipes(rRef.current)
    if (mode === 'local') return persistLocal()
    await write(`r.${r.id}`, () => priv(`r.${r.id}`).set(JSON.parse(JSON.stringify(v))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, persistLocal, write])
  const deleteRecipe = useCallback(async (id: string) => {
    const { [id]: _gone, ...rest } = rRef.current
    rRef.current = rest; setRecipes(rest)
    if (mode === 'local') return persistLocal()
    await write(`r.${id}`, () => priv(`r.${id}`).delete())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, persistLocal, write])

  const writeCatalog = useCallback((items: Record<string, CatalogItem>) => {
    cRef.current = items; setCatalogEdits(items)
    if (mode === 'local') return persistLocal()
    later('catalog', 600, () => write('catalog', () => priv('catalog').set({ items: cRef.current })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, persistLocal, later, write])
  const saveIngredient = useCallback((c: CatalogItem) => writeCatalog({ ...cRef.current, [c.id]: c }), [writeCatalog])
  const resetIngredient = useCallback((id: string) => { const { [id]: _x, ...rest } = cRef.current; writeCatalog(rest) }, [writeCatalog])

  const updateGrocery = useCallback((fn: (g: Grocery) => Grocery) => {
    const next = fn(gRef.current); gRef.current = next; setGrocery(next)
    if (mode === 'local') return persistLocal()
    later('grocery', 400, () => write('household/grocery', () => db.current.doc('household/grocery').set(gRef.current as any)))
  }, [mode, persistLocal, later, write])

  const updatePantry = useCallback((fn: (p: Pantry) => Pantry) => {
    const next = fn(panRef.current); panRef.current = next; setPantry(next)
    if (mode === 'local') return persistLocal()
    later('pantry', 400, () => write('household/pantry', () => db.current.doc('household/pantry').set(panRef.current as any)))
  }, [mode, persistLocal, later, write])

  const publish = useCallback((s: PlanSummary) => {
    if (mode !== 'cloud') return
    const key = JSON.stringify({ ...s, updatedAt: '' })
    if (key === lastPub.current) return
    lastPub.current = key
    later('plan', 1200, () => write(`plans/${s.id}`, () => db.current.doc(`plans/${s.id}`).set(s as any)))
  }, [mode, later, write])

  const setMember = useCallback((id: string, m: Member | null) => {
    if (mode !== 'cloud' || !meRef.current.isOwner) return
    setMembers((cur) => {
      const next = { ...cur }
      if (m) next[id] = m; else delete next[id]
      write('config/members', () => db.current.doc('config/members').set({ members: next }))
      return next
    })
  }, [mode, write])

  const restore = useCallback(async (bk: { personal: Personal; recipes: Record<string, StoredRecipe>; catalog: Record<string, CatalogItem> }) => {
    const p = { ...bk.personal, profile: meRef.current.profile, updatedAt: new Date().toISOString() }
    setPersonal(p); pRef.current = p
    if (mode === 'local') { rRef.current = bk.recipes; cRef.current = bk.catalog; setRecipes(bk.recipes); setCatalogEdits(bk.catalog); persistLocal(); return }
    await write('state', () => priv('state').set(p as any))
    await write('catalog', () => priv('catalog').set({ items: bk.catalog }))
    for (const id of Object.keys(rRef.current)) if (!bk.recipes[id]) await write(`r.${id}`, () => priv(`r.${id}`).delete())
    for (const r of Object.values(bk.recipes)) await write(`r.${r.id}`, () => priv(`r.${r.id}`).set(JSON.parse(JSON.stringify(r))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, persistLocal, write])

  const nameOf = useCallback(async (ids: string[]) => {
    try { const ps = await user.current?.profiles?.(ids); return Object.fromEntries(ids.map((i) => [i, ps?.[i]?.name || ''])) } catch { return {} }
  }, [])

  useEffect(() => { if (mode === 'local' && phase.k === 'ready') persistLocal() }, [mode, phase.k, persistLocal])

  return useMemo(() => (base ? {
    phase, mode, me, base, personal, recipes, catalogEdits, partners, grocery, pantry, members, requests,
    update, saveRecipe, deleteRecipe, saveIngredient, resetIngredient, updateGrocery, updatePantry, publish, setMember, restore, nameOf, sync, toast, toastMsg,
  } : null), [base, phase, mode, me, personal, recipes, catalogEdits, partners, grocery, pantry, members, requests, update, saveRecipe, deleteRecipe, saveIngredient, resetIngredient, updateGrocery, updatePantry, publish, setMember, restore, nameOf, sync, toast, toastMsg])
}

export async function copyText(text: string, toast: (m: string) => void, done = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(done) } catch { toast("Couldn't copy. Long-press the text to copy it instead.") }
}
export async function saveFile(name: string, data: unknown, toast: (m: string) => void) {
  const text = JSON.stringify(data, null, 2)
  try {
    const dl = window.claude?.use ? await window.claude.use('downloads') : null
    if (dl) { await dl.save({ filename: name, data: text }); toast(`Saved ${name}`); return }
  } catch (e: any) { if (e?.code === 'declined') return }
  await copyText(text, toast, `Downloads aren't available here, so ${name} was copied instead`)
}
