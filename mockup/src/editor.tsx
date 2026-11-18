import { useMemo, useState } from 'react'
import type { CatalogItem, MealType, Recipe, RecipeIngredient, Role, StoredRecipe } from './types'
import type { Library } from './data'
import { CATEGORY_ORDER, PKG } from './data'
import { makeNut, portion, pkgOf } from './engine'
import { useStore } from './store'
import { Icon, MacroLabel, Seg, Sheet } from './ui'
import { commitEdit, content } from './versions'
import type { Seed } from './importer'
import { parseRecipeText } from './importer'

const RATIO: Record<Role, [number, number]> = { fixed: [1, 1], protein: [0.75, 1.5], sauce: [0.75, 1.25], seasoning: [0.75, 1.25], fat: [0.5, 1.3], vegetable: [0.8, 1.75], starch: [0.4, 1.5] }
const ROLES: [Role, string][] = [['protein', 'Protein'], ['starch', 'Carb'], ['vegetable', 'Vegetable'], ['fat', 'Fat or oil'], ['sauce', 'Sauce'], ['seasoning', 'Seasoning'], ['fixed', 'Fixed amount']]
const STATES = ['raw', 'dry', 'cooked', 'drained', 'as-packaged']
const unitOf = (c?: CatalogItem) => (c?.basis === 'count' ? 'each' : c?.basis ?? 'g')
const guessRole = (c: CatalogItem): Role => c.category === 'Meat & Seafood' ? 'protein' : c.category === 'Grains & Pasta' ? 'starch' : c.category === 'Produce' ? 'vegetable' : c.category === 'Spices' ? 'seasoning' : /oil|butter/i.test(c.name) ? 'fat' : c.category === 'Sauces & Condiments' ? 'sauce' : 'fixed'
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item'
const rid = () => Math.random().toString(36).slice(2, 7)

type Row = { key: string; ingredientId: string; quantity: string; role: Role; notes: string; flag?: string }
interface Draft { name: string; description: string; mealType: MealType; cuisine: string; primaryProtein: string; prepMinutes: string; cookMinutes: string; flexible: boolean; rows: Row[]; steps: string[]; storage: string; sourceTitle: string; sourceUrl: string; sourceNotes: string }

function toDraft(r: Recipe | null): Draft {
  if (!r) return { name: '', description: '', mealType: 'dinner', cuisine: '', primaryProtein: '', prepMinutes: '10', cookMinutes: '20', flexible: true, rows: [], steps: [''], storage: '', sourceTitle: '', sourceUrl: '', sourceNotes: '' }
  return {
    name: r.name, description: r.description, mealType: r.mealType, cuisine: r.cuisine, primaryProtein: r.primaryProtein, prepMinutes: String(r.prepMinutes), cookMinutes: String(r.cookMinutes), flexible: r.flexible,
    rows: r.ingredients.map((i) => ({ key: rid(), ingredientId: i.ingredientId, quantity: String(i.quantity), role: i.role, notes: i.notes ?? '' })),
    steps: r.steps.length ? [...r.steps] : [''], storage: r.storage.join('\n'), sourceTitle: r.source.title ?? '', sourceUrl: r.source.url ?? '', sourceNotes: r.source.changes ?? '',
  }
}

function build(lib: Library, d: Draft, id: string, profileId: Recipe['profileId'], prev: StoredRecipe | null): StoredRecipe {
  const ingredients: RecipeIngredient[] = d.rows.filter((x) => lib.catalog[x.ingredientId] && Number(x.quantity) > 0).map((x) => {
    const c = lib.catalog[x.ingredientId], q = Number(x.quantity), [lo, hi] = RATIO[x.role]
    const div = c.basis === 'count' ? 1 : 100
    return {
      ingredientId: c.id, name: c.name, quantity: q, unit: c.basis, state: c.state, role: x.role, category: c.category, ...(x.notes.trim() ? { notes: x.notes.trim() } : {}),
      minPerServing: Math.round(q * lo * 1000) / 1000, maxPerServing: Math.round(q * hi * 1000) / 1000, scalable: x.role !== 'fixed',
      nutritionPerUnit: { kcal: c.per.kcal / div, proteinG: c.per.proteinG / div, carbsG: c.per.carbsG / div, fatG: c.per.fatG / div }, nutritionSource: c.source ?? 'reference',
    } as RecipeIngredient
  })
  const r: StoredRecipe = {
    ...(prev ?? {}),
    id, profileId, name: d.name.trim(), description: d.description.trim(), mealType: d.mealType, cuisine: d.cuisine.trim() || 'Home', primaryProtein: d.primaryProtein.trim() || 'mixed',
    dietaryTags: prev?.dietaryTags ?? [], cookingMethods: prev?.cookingMethods ?? [], equipment: prev?.equipment ?? [], allergens: prev?.allergens ?? [],
    prepMinutes: Math.max(0, Number(d.prepMinutes) || 0), cookMinutes: Math.max(0, Number(d.cookMinutes) || 0), flexible: d.flexible,
    ingredients, steps: d.steps.map((s) => s.trim()).filter(Boolean), storage: d.storage.split('\n').map((s) => s.trim()).filter(Boolean),
    source: { kind: prev?.source.kind ?? 'household', title: d.sourceTitle.trim(), ...(d.sourceUrl.trim() ? { url: d.sourceUrl.trim() } : {}), ...(prev?.source.site ? { site: prev.source.site } : {}), changes: d.sourceNotes.trim() },
    perServing: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  }
  r.perServing = portion(r, { protein: 1, starch: 1, vegetable: 1, fat: 1 }, undefined, makeNut(lib), false).perServing
  return r
}

/* ---------------- Recipe editor ---------------- */
export function RecipeEditor({ lib, id, copyFrom, seed, onDone }: { lib: Library; id: string | null; copyFrom?: string; seed?: Seed; onDone: (savedId: string | null) => void }) {
  const { me, saveRecipe, toast, base } = useStore()
  const existing = id ? lib.recipes[id] ?? null : null
  const source = existing ?? (copyFrom ? lib.recipes[copyFrom] ?? null : null)
  const [d, setD] = useState<Draft>(() => {
    const x = toDraft(source)
    if (copyFrom && !existing) x.name = `${x.name} (copy)`
    if (seed) Object.assign(x, { name: seed.name, description: seed.description, mealType: seed.mealType, steps: seed.steps.length ? seed.steps : [''], sourceTitle: 'Imported', sourceNotes: seed.source,
      rows: seed.rows.map((r) => ({ key: rid(), ingredientId: r.ingredientId, quantity: String(r.quantity), role: r.role, notes: r.notes, flag: r.flag })) })
    return x
  })
  const [unmatched, setUnmatched] = useState<string[]>(seed?.unmatched ?? [])
  const [picking, setPicking] = useState<string | 'new' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }))
  const setRow = (key: string, patch: Partial<Row>) => setD((x) => ({ ...x, rows: x.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) }))
  const preview = useMemo(() => build(lib, d, 'preview', me.profile, null).perServing, [lib, d, me.profile])
  const cuisines = useMemo(() => [...new Set(Object.values(lib.recipes).map((r) => r.cuisine))].sort(), [lib])
  const save = async () => {
    if (!d.name.trim()) return setErr('Give the recipe a name.')
    if (!d.rows.some((r) => Number(r.quantity) > 0)) return setErr('Add at least one ingredient with an amount.')
    if (d.rows.some((r) => !(Number(r.quantity) > 0))) return setErr('Every ingredient needs an amount above zero, or remove it.')
    setErr(null); setSaving(true)
    const newId = existing ? existing.id : `u-${slug(d.name)}-${rid()}`
    const built = content(build(lib, d, newId, me.profile, existing))
    const original = existing ? existing.base ?? (existing.custom ? null : base.recipes[me.profile].find((x) => x.id === existing.id) ?? null) : null
    await saveRecipe(commitEdit(existing, built, original))
    setSaving(false)
    toast(existing ? 'Recipe saved' : 'Recipe added to your library')
    onDone(newId)
  }
  return (
    <div className="view editor">
      <header className="view-head row">
        <h1>{existing ? 'Edit recipe' : seed ? 'Check the import' : copyFrom ? 'Duplicate recipe' : 'New recipe'}<span className="sub">{existing ? `${existing.name}. Saving keeps the old version.` : seed ? 'Look over each ingredient and amount before saving.' : 'Saved to your private library'}</span></h1>
        <div className="head-actions">
          <button className="btn ghost" onClick={() => onDone(null)}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </header>
      {err && <p className="err" role="alert">{err}</p>}
      {unmatched.length > 0 && (
        <div className="note-bar warn-bar unmatched">
          <span>Couldn't match {unmatched.length} line{unmatched.length > 1 ? 's' : ''} to an ingredient. Add {unmatched.length > 1 ? 'them' : 'it'} with Add ingredient, or skip.</span>
          <ul>{unmatched.map((u, i) => <li key={i}><span>{u}</span><button className="btn ghost small-btn" onClick={() => setUnmatched((x) => x.filter((_, j) => j !== i))}>Skip</button></li>)}</ul>
        </div>
      )}
      <div className="ed-grid">
        <div className="ed-main">
          <section className="panel">
            <label className="field" htmlFor="e-name"><span>Name</span><span className="inp"><input id="e-name" value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="Chipotle chicken rice bowls" /></span></label>
            <label className="field" htmlFor="e-desc"><span>Short description</span><textarea id="e-desc" rows={2} value={d.description} onChange={(e) => set({ description: e.target.value })} /></label>
            <div className="fieldset"><span className="fl">Meal</span><Seg label="Meal" value={d.mealType} onChange={(v) => set({ mealType: v })} options={[['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner']]} /></div>
            <div className="fields">
              <label className="field" htmlFor="e-cuisine"><span>Cuisine</span><span className="inp"><input id="e-cuisine" list="cuisines" value={d.cuisine} onChange={(e) => set({ cuisine: e.target.value })} /></span></label>
              <label className="field" htmlFor="e-protein"><span>Main protein</span><span className="inp"><input id="e-protein" value={d.primaryProtein} onChange={(e) => set({ primaryProtein: e.target.value })} placeholder="chicken thighs" /></span></label>
              <label className="field" htmlFor="e-prep"><span>Prep</span><span className="inp"><input id="e-prep" type="number" inputMode="numeric" value={d.prepMinutes} onChange={(e) => set({ prepMinutes: e.target.value })} /><em>min</em></span></label>
              <label className="field" htmlFor="e-cook"><span>Cook</span><span className="inp"><input id="e-cook" type="number" inputMode="numeric" value={d.cookMinutes} onChange={(e) => set({ cookMinutes: e.target.value })} /><em>min</em></span></label>
            </div>
            <datalist id="cuisines">{cuisines.map((c) => <option key={c} value={c} />)}</datalist>
            <label className="switch"><input type="checkbox" id="e-flex" checked={d.flexible} onChange={(e) => set({ flexible: e.target.checked })} /><span>Let Gather resize portions to fit targets</span></label>
          </section>

          <section className="panel">
            <h2>Ingredients, one serving</h2>
            <p className="muted small">Weigh raw where you can. The role tells Gather how far it may scale an amount: proteins, carbs and vegetables flex, a fixed amount never changes.</p>
            <ul className="ed-ings">
              {d.rows.map((row) => {
                const c = lib.catalog[row.ingredientId]
                return (
                  <li key={row.key}>
                    <button className="ing-pick" onClick={() => setPicking(row.key)} aria-label={`Change ingredient, currently ${c?.name ?? 'missing'}`}>{c?.name ?? 'Missing ingredient'}<Icon name="chev" size={16} /></button>
                    <span className="inp small"><input aria-label={`${c?.name} amount`} id={`q-${row.key}`} type="number" inputMode="decimal" step="any" value={row.quantity} onChange={(e) => setRow(row.key, { quantity: e.target.value, flag: undefined })} /><em>{unitOf(c)}</em></span>
                    <select aria-label={`${c?.name} role`} id={`role-${row.key}`} value={row.role} onChange={(e) => setRow(row.key, { role: e.target.value as Role })}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    {row.flag && <span className="row-flag">{row.flag}</span>}
                    <input className="note-in" aria-label={`${c?.name} note`} id={`n-${row.key}`} placeholder="Note, e.g. diced" value={row.notes} onChange={(e) => setRow(row.key, { notes: e.target.value })} />
                    <button className="icon-btn" aria-label={`Remove ${c?.name}`} onClick={() => setD((x) => ({ ...x, rows: x.rows.filter((r) => r.key !== row.key) }))}><Icon name="trash" size={18} /></button>
                  </li>
                )
              })}
            </ul>
            <button className="btn" onClick={() => setPicking('new')}><Icon name="plus" size={18} />Add ingredient</button>
          </section>

          <section className="panel">
            <h2>Steps</h2>
            <ol className="ed-steps">
              {d.steps.map((s, i) => (
                <li key={i}>
                  <textarea aria-label={`Step ${i + 1}`} id={`st-${i}`} rows={3} value={s} onChange={(e) => setD((x) => ({ ...x, steps: x.steps.map((y, j) => (j === i ? e.target.value : y)) }))} />
                  <span className="step-tools">
                    <button className="icon-btn" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => setD((x) => { const a = [...x.steps];[a[i - 1], a[i]] = [a[i], a[i - 1]]; return { ...x, steps: a } })}><Icon name="up" size={18} /></button>
                    <button className="icon-btn" aria-label={`Move step ${i + 1} down`} disabled={i === d.steps.length - 1} onClick={() => setD((x) => { const a = [...x.steps];[a[i + 1], a[i]] = [a[i], a[i + 1]]; return { ...x, steps: a } })}><Icon name="down" size={18} /></button>
                    <button className="icon-btn" aria-label={`Remove step ${i + 1}`} onClick={() => setD((x) => ({ ...x, steps: x.steps.length > 1 ? x.steps.filter((_, j) => j !== i) : [''] }))}><Icon name="trash" size={18} /></button>
                  </span>
                </li>
              ))}
            </ol>
            <button className="btn" onClick={() => setD((x) => ({ ...x, steps: [...x.steps, ''] }))}><Icon name="plus" size={18} />Add step</button>
          </section>

          <section className="panel">
            <h2>Storing and source</h2>
            <label className="field" htmlFor="e-store"><span>Storing notes, one per line (shown when you prep ahead)</span><textarea id="e-store" rows={3} value={d.storage} onChange={(e) => set({ storage: e.target.value })} /></label>
            <div className="fields">
              <label className="field" htmlFor="e-st"><span>Source name</span><span className="inp"><input id="e-st" value={d.sourceTitle} onChange={(e) => set({ sourceTitle: e.target.value })} /></span></label>
              <label className="field" htmlFor="e-su"><span>Link</span><span className="inp"><input id="e-su" type="url" inputMode="url" value={d.sourceUrl} onChange={(e) => set({ sourceUrl: e.target.value })} placeholder="https://" /></span></label>
            </div>
            <label className="field" htmlFor="e-sn"><span>What you changed</span><textarea id="e-sn" rows={2} value={d.sourceNotes} onChange={(e) => set({ sourceNotes: e.target.value })} /></label>
          </section>
        </div>
        <aside className="ed-side">
          <MacroLabel m={preview} title="One serving at these amounts" compact />
          <button className="btn primary wide" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save recipe'}</button>
        </aside>
      </div>
      <IngredientPicker lib={lib} open={!!picking} onClose={() => setPicking(null)} onPick={(c) => {
        if (picking === 'new') setD((x) => ({ ...x, rows: [...x.rows, { key: rid(), ingredientId: c.id, quantity: c.basis === 'count' ? '1' : '100', role: guessRole(c), notes: '' }] }))
        else if (picking) setRow(picking, { ingredientId: c.id })
        setPicking(null)
      }} />
    </div>
  )
}

function IngredientPicker({ lib, open, onClose, onPick }: { lib: Library; open: boolean; onClose: () => void; onPick: (c: CatalogItem) => void }) {
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const s = q.trim().toLowerCase()
  const list = lib.catalogList.filter((c) => !s || `${c.name} ${c.category}`.toLowerCase().includes(s)).slice(0, 80)
  return (
    <Sheet open={open} onClose={() => { setCreating(false); onClose() }} title={creating ? 'New ingredient' : 'Choose an ingredient'}>
      {creating ? <IngredientForm lib={lib} item={null} seedName={q} onDone={(c) => { setCreating(false); if (c) onPick(c) }} /> : (
        <div className="picker">
          <label className="search"><Icon name="search" size={18} /><input id="ip-q" type="search" placeholder="Search ingredients" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <button className="btn ghost wide" onClick={() => setCreating(true)}><Icon name="plus" size={18} />New ingredient{q ? ` “${q}”` : ''}</button>
          <ul className="pick-list">
            {list.map((c) => (
              <li key={c.id}><button className="pick" onClick={() => onPick(c)}><span className="pick-name">{c.name}</span><span className="pick-meta">{c.category}, {Math.round(c.per.kcal)} Cal per {c.basis === 'count' ? 'item' : `100 ${c.basis}`}</span></button></li>
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  )
}

/* ---------------- Ingredient list + editor ---------------- */
export function IngredientsView({ lib, onBack }: { lib: Library; onBack: () => void }) {
  const { catalogEdits } = useStore()
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<CatalogItem | 'new' | null>(null)
  const s = q.trim().toLowerCase()
  const used = useMemo(() => new Set(Object.values(lib.recipes).flatMap((r) => r.ingredients.map((i) => i.ingredientId))), [lib])
  const list = lib.catalogList.filter((c) => !s || `${c.name} ${c.category}`.toLowerCase().includes(s))
  const cats = CATEGORY_ORDER.filter((c) => list.some((i) => i.category === c))
  return (
    <div className="view ingredients">
      <button className="btn ghost back" onClick={onBack}><Icon name="back" size={20} />Recipes</button>
      <header className="view-head row">
        <h1>Ingredients<span className="sub">Nutrition, measures and store packages. Changes apply to your recipes only.</span></h1>
        <div className="head-actions"><button className="btn primary" onClick={() => setEdit('new')}><Icon name="plus" size={18} />New ingredient</button></div>
      </header>
      <label className="search"><Icon name="search" size={18} /><input id="ing-q" type="search" placeholder="Search ingredients" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <div className="shop-cols ing-cols">
        {cats.map((cat) => (
          <section key={cat} className="cat">
            <h2>{cat}</h2>
            <ul>
              {list.filter((i) => i.category === cat).map((c) => (
                <li key={c.id}>
                  <button className="ing-row" onClick={() => setEdit(c)}>
                    <span className="gi-main"><span className="gi-name">{c.name}{catalogEdits[c.id] && <span className="tag prep">{c.custom ? 'Yours' : 'Edited'}</span>}</span>
                      <span className="gi-use num">{Math.round(c.per.kcal)} Cal, {c.per.proteinG}P {c.per.carbsG}C {c.per.fatG}F per {c.basis === 'count' ? 'item' : `100 ${c.basis}`}{used.has(c.id) ? '' : ', not in any recipe'}</span></span>
                    <Icon name="chev" size={18} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit === 'new' ? 'New ingredient' : edit ? edit.name : ''}>
        {edit && <IngredientForm lib={lib} item={edit === 'new' ? null : edit} onDone={() => setEdit(null)} />}
      </Sheet>
    </div>
  )
}

export function IngredientForm({ lib, item, seedName = '', onDone }: { lib: Library; item: CatalogItem | null; seedName?: string; onDone: (c: CatalogItem | null) => void }) {
  const { saveIngredient, resetIngredient, catalogEdits, toast } = useStore()
  const basePkg = item ? pkgOf(lib, item.id) : undefined
  const [f, setF] = useState(() => ({
    name: item?.name ?? seedName, category: item?.category ?? 'Produce', basis: item?.basis ?? 'g' as CatalogItem['basis'], state: item?.state ?? 'raw',
    kcal: String(item?.per.kcal ?? ''), p: String(item?.per.proteinG ?? ''), c: String(item?.per.carbsG ?? ''), fat: String(item?.per.fatG ?? ''),
    hhLabel: item?.hh?.[0] ?? '', hhAmt: item?.hh ? String(item.hh[1]) : '', pantry: !!item?.pantry,
    pkgSize: basePkg ? String(basePkg.size) : '', pkgOne: basePkg?.one ?? '', pkgMany: basePkg?.many ?? '', pkgLabel: basePkg?.label ?? '', note: item?.sourceNote ?? '',
  }))
  const [err, setErr] = useState<string | null>(null)
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }))
  const per = f.basis === 'count' ? 'per item' : `per 100 ${f.basis}`
  const isEdited = !!item && !!catalogEdits[item.id] && !item.custom && !!lib.baseCatalog[item.id]
  const save = () => {
    if (!f.name.trim()) return setErr('Give the ingredient a name.')
    const nums = [f.kcal, f.p, f.c, f.fat].map(Number)
    if (nums.some((n) => !Number.isFinite(n) || n < 0) || [f.kcal, f.p, f.c, f.fat].some((v) => v === '')) return setErr(`Enter calories, protein, carbs and fat ${per}. Use 0 where the label says 0.`)
    const id = item?.id ?? `u-${f.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}-${Math.random().toString(36).slice(2, 6)}`
    const size = Number(f.pkgSize)
    const pkg = size > 0 && f.pkgOne.trim() ? { size, one: f.pkgOne.trim(), many: f.pkgMany.trim() || `${f.pkgOne.trim()}s`, ...(f.pkgLabel.trim() ? { label: f.pkgLabel.trim() } : {}), each: !!(item?.pkg?.each ?? PKG[id]?.each) } : undefined
    const c: CatalogItem = {
      ...(item ?? {}), id, name: f.name.trim(), category: f.category, basis: f.basis, state: f.state,
      per: { kcal: nums[0], proteinG: nums[1], carbsG: nums[2], fatG: nums[3] }, source: 'user', pantry: f.pantry,
      ...(f.hhLabel.trim() && Number(f.hhAmt) > 0 ? { hh: [f.hhLabel.trim(), Number(f.hhAmt)] as [string, number] } : {}),
      ...(pkg ? { pkg } : {}), ...(f.note.trim() ? { sourceNote: f.note.trim() } : {}), ...(item ? {} : { custom: true }),
    }
    if (!f.hhLabel.trim()) delete c.hh
    if (!pkg) delete c.pkg
    saveIngredient(c); toast(item ? 'Ingredient saved' : 'Ingredient added'); onDone(c)
  }
  const num = (k: keyof typeof f, label: string, unit: string) => <label className="field" htmlFor={`if-${k}`}><span>{label}</span><span className="inp"><input id={`if-${k}`} type="number" inputMode="decimal" step="any" value={f[k] as string} onChange={(e) => set({ [k]: e.target.value } as Partial<typeof f>)} /><em>{unit}</em></span></label>
  return (
    <div className="ing-form">
      {err && <p className="err" role="alert">{err}</p>}
      <label className="field" htmlFor="if-name"><span>Name</span><span className="inp"><input id="if-name" value={f.name} onChange={(e) => set({ name: e.target.value })} /></span></label>
      <div className="fields">
        <label className="field" htmlFor="if-cat"><span>Aisle</span><select id="if-cat" value={f.category} onChange={(e) => set({ category: e.target.value })}>{CATEGORY_ORDER.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="field" htmlFor="if-state"><span>Weighed</span><select id="if-state" value={f.state} onChange={(e) => set({ state: e.target.value })}>{STATES.map((s) => <option key={s}>{s}</option>)}</select></label>
      </div>
      <div className="fieldset"><span className="fl">Measured by</span>
        {item ? <p className="small">{f.basis === 'count' ? 'Each (count)' : f.basis === 'g' ? 'Weight in grams' : 'Volume in ml'}. This can't change once recipes use it.</p>
          : <Seg label="Measured by" value={f.basis} onChange={(v) => set({ basis: v })} options={[['g', 'Grams'], ['ml', 'Milliliters'], ['count', 'Each']]} />}
      </div>
      <h3>Nutrition {per}</h3>
      <div className="fields four">{num('kcal', 'Calories', 'Cal')}{num('p', 'Protein', 'g')}{num('c', 'Carbs', 'g')}{num('fat', 'Fat', 'g')}</div>
      {f.basis !== 'count' && <>
        <h3>Kitchen measure</h3>
        <div className="fields">
          <label className="field" htmlFor="if-hhl"><span>Name</span><span className="inp"><input id="if-hhl" value={f.hhLabel} onChange={(e) => set({ hhLabel: e.target.value })} placeholder="tbsp" /></span></label>
          {num('hhAmt', 'Equals', f.basis)}
        </div>
      </>}
      <h3>Store package</h3>
      <div className="fields">
        {num('pkgSize', 'Package holds', f.basis === 'count' ? 'each' : f.basis)}
        <label className="field" htmlFor="if-po"><span>Called</span><span className="inp"><input id="if-po" value={f.pkgOne} onChange={(e) => set({ pkgOne: e.target.value })} placeholder="bag" /></span></label>
        <label className="field" htmlFor="if-pm"><span>Plural</span><span className="inp"><input id="if-pm" value={f.pkgMany} onChange={(e) => set({ pkgMany: e.target.value })} placeholder="bags" /></span></label>
        <label className="field" htmlFor="if-pl"><span>Label on the list</span><span className="inp"><input id="if-pl" value={f.pkgLabel} onChange={(e) => set({ pkgLabel: e.target.value })} placeholder="12 oz" /></span></label>
      </div>
      <label className="switch"><input type="checkbox" id="if-pantry" checked={f.pantry} onChange={(e) => set({ pantry: e.target.checked })} /><span>Pantry staple (listed under Pantry check)</span></label>
      <label className="field" htmlFor="if-note"><span>Note</span><textarea id="if-note" rows={2} value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="Brand, label date, anything to remember" /></label>
      <div className="btn-grid">
        <button className="btn primary" onClick={save}>Save ingredient</button>
        {isEdited && <button className="btn ghost" onClick={() => { resetIngredient(item!.id); toast('Back to the default values'); onDone(null) }}>Reset to default</button>}
        <button className="btn ghost" onClick={() => onDone(null)}>Cancel</button>
      </div>
    </div>
  )
}

/* ---------------- Add a recipe: link, photo, pasted text or by hand ---------------- */
export function AddRecipeSheet({ lib, open, onClose, onSeed, onManual }: { lib: Library; open: boolean; onClose: () => void; onSeed: (s: Seed) => void; onManual: () => void }) {
  const [mode, setMode] = useState<'menu' | 'link' | 'photo' | 'text'>('menu')
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const close = () => { setMode('menu'); onClose() }
  const items: [typeof mode | 'manual', string, string, string][] = [
    ['link', 'ext', 'From a link', 'A recipe site or a YouTube video'],
    ['photo', 'camera', 'From a photo or screenshot', 'A cookbook page, a card, an Instagram post'],
    ['text', 'recipes', 'Paste the text', 'Anything you copied: notes, a message, a caption'],
    ['manual', 'edit', 'Write it yourself', 'Start from a blank recipe'],
  ]
  return (
    <Sheet open={open} onClose={close} title={mode === 'menu' ? 'Add a recipe' : mode === 'link' ? 'From a link' : mode === 'photo' ? 'From a photo' : 'Paste the text'}>
      <div className="ing-form">
        {mode === 'menu' && (
          <ul className="add-menu">
            {items.map(([k, icon, title, sub]) => (
              <li key={k}><button className="pick" onClick={() => (k === 'manual' ? (close(), onManual()) : setMode(k as typeof mode))}>
                <span className="am-icon" aria-hidden="true"><Icon name={icon} size={22} /></span>
                <span className="gi-main"><span className="pick-name">{title}</span><span className="pick-meta">{sub}</span></span>
              </button></li>
            ))}
          </ul>
        )}
        {mode === 'link' && (
          <>
            <label className="field" htmlFor="imp-url"><span>Link</span><span className="inp"><input id="imp-url" type="url" inputMode="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} /></span></label>
            <p className="small">In the app, Gather reads the recipe from the page. For a YouTube video it uses the description, pinned comment and captions. You then check every ingredient on the same review screen, and the recipe keeps a link back to where it came from.</p>
            <p className="muted small">This preview can't open other websites. Copy the recipe text from the page and paste it instead.</p>
            <button className="btn primary wide" onClick={() => setMode('text')}>Paste the text instead</button>
          </>
        )}
        {mode === 'photo' && (
          <>
            <p className="small">In the app, Gather reads the text in the photo, then shows the same review screen. Handwriting and blurry shots get flagged for a closer look.</p>
            <p className="muted small">This preview doesn't read photos yet.</p>
            <button className="btn primary wide" onClick={() => setMode('text')}>Paste the text instead</button>
          </>
        )}
        {mode === 'text' && (
          <>
            <label className="field" htmlFor="imp-txt"><span>Recipe text</span><textarea id="imp-txt" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Chicken burrito bowls\nServes 4\nIngredients\n1.5 lb chicken thighs\n1 cup jasmine rice\n2 tbsp olive oil\n...\nInstructions\n1. Cook the rice...'} /></label>
            <button className="btn primary wide" disabled={!text.trim()} onClick={() => { const s = parseRecipeText(lib, text); close(); setText(''); onSeed(s) }}>Read the recipe</button>
            <p className="muted small">Amounts are divided by the servings it says it makes, so the recipe is saved as one serving.</p>
          </>
        )}
        {mode !== 'menu' && <button className="btn ghost wide" onClick={() => setMode('menu')}>Back</button>}
      </div>
    </Sheet>
  )
}
