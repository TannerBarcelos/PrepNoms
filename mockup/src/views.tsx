import { useMemo, useState } from 'react'
import type { Day, Mode, Recipe, StoredRecipe } from './types'
import { DAYS, DAY_NAME } from './types'
import type { Library } from './data'
import type { Derived, Entry, PrepGroup } from './engine'
import { approx, metric, applyUsage, basePortion, canMakeNow, countOf, dateOf, dayList, isFish, makeNut, modeOf, pantryScore, prepGroups, shortDate, suggest, todayKey, mondayOf, sum, usage } from './engine'
import { useStore } from './store'
import { Amounts, Icon, MacroLabel, Macros, Seg, Sheet } from './ui'
import { TrackerButton, exportState } from './export'
import { ensureHistory, moveTo } from './versions'
import type { Seed } from './importer'
import { AddRecipeSheet } from './editor'

export interface Nav { openRecipe: (id: string) => void; go: (tab: string) => void; edit: (id: string | null, copyFrom?: string, seed?: Seed) => void }
export const who = (p: string) => (p === 'tanner' ? 'Tanner' : p === 'jen' ? 'Jen' : 'Someone')

const SECTIONS: { key: string; title: string; slots: Entry['slot'][] }[] = [
  { key: 'breakfast', title: 'Breakfast', slots: ['breakfast', 'latte'] },
  { key: 'lunch', title: 'Lunch', slots: ['lunch', 'withLunch'] },
  { key: 'dinner', title: 'Dinner', slots: ['dinner'] },
  { key: 'snacks', title: 'Snacks', slots: ['snack', 'shake'] },
]

export function Today({ lib, derived, nav }: { lib: Library; derived: Derived; nav: Nav }) {
  const { personal } = useStore()
  const p = personal.plan
  const [day, setDay] = useState<Day>(todayKey())
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const dv = derived.days.find((d) => d.day === day)!
  const hasMeals = dv.entries.some((e) => e.recipeId)
  const date = dateOf(p.weekOf, day)
  const changed = dv.entries.filter((e) => e.recipeId && exportState(personal, lib, lib.recipes[e.recipeId], derived.formulas[e.recipeId]) === 'changed').length
  return (
    <div className="view today">
      <header className="view-head">
        <h1>{day === todayKey() && p.weekOf === mondayOf() ? 'Today' : DAY_NAME[day]}<span className="sub">{DAY_NAME[day]}, {shortDate(date)}. What's planned and what to cook.</span></h1>
      </header>
      <DayStrip value={day} onChange={(d) => { setDay(d); setOpen({}) }} derived={derived} />
      <PrepDayNote derived={derived} lib={lib} day={day} nav={nav} />
      <div className="today-grid">
        <aside className="today-side">
          <MacroLabel m={dv.totals} t={derived.targets} status={dv.status} title={`${DAY_NAME[day]}'s plan`} />
          <p className="muted small plan-note">The plan's totals against your targets. Your calorie tracker keeps the log of what you actually eat.{changed ? ` ${changed} recipe${changed > 1 ? 's' : ''} changed since you last copied ${changed > 1 ? 'them' : 'it'}.` : ''}</p>
        </aside>
        <div className="today-main">
          {!hasMeals && (
            <div className="empty">
              <p>No lunch or dinner planned for {DAY_NAME[day]} yet.</p>
              <button className="btn primary" onClick={() => nav.go('plan')}>Plan the week</button>
            </div>
          )}
          <div className="meals">
            {SECTIONS.map((sec) => {
              const es = dv.entries.filter((e) => sec.slots.includes(e.slot))
              if (!es.length) return null
              const m = sum(es.map((e) => e.macro))
              const isOpen = open[sec.key] ?? true
              const id = `sec-${sec.key}`
              return (
                <section key={sec.key} className="msec">
                  <h2>
                    <button className="msec-head" aria-expanded={isOpen} aria-controls={id} onClick={() => setOpen((o) => ({ ...o, [sec.key]: !isOpen }))}>
                      <span className="chev" aria-hidden="true"><Icon name="chev" size={20} /></span>
                      <span className="msec-title">{sec.title}</span>
                      <span className="msec-sum num">{Math.round(m.kcal)} Cal<span>{Math.round(m.proteinG)} g protein</span></span>
                    </button>
                  </h2>
                  <ul id={id} className="msec-items" hidden={!isOpen}>
                    {es.map((e) => {
                      const r = e.recipeId ? lib.recipes[e.recipeId] : null
                      const f = r ? derived.formulas[r.id] : null
                      const st = r && f ? exportState(personal, lib, r, f) : 'never'
                      return (
                        <li key={e.key} className="mi">
                          <div className="mi-row">
                            <div className="mi-body">
                              {r ? <button className="mi-name linkish" onClick={() => nav.openRecipe(r.id)}>{r.name}</button> : <span className="mi-name">{e.name}</span>}
                              <span className="mi-meta">{r && <span className={`tag ${e.mode}`}>{e.mode === 'prep' ? 'From prep' : 'Cook fresh'}</span>}{st === 'changed' && <span className="tag warn">Changed since copied</span>}<Macros m={e.macro} /></span>
                            </div>
                            {r && f ? <TrackerButton lib={lib} r={r} f={f} compact /> : <span />}
                          </div>
                          {r && e.mode === 'fresh' && <CookCard lib={lib} derived={derived} e={e} weekOf={p.weekOf} />}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/* On prep day (and the day before it), point at the Prep tab. */
function PrepDayNote({ derived, lib, day, nav }: { derived: Derived; lib: Library; day: Day; nav: Nav }) {
  const { personal } = useStore()
  const p = personal.plan
  const pd = p.prepDay ?? 'sun'
  const groups = prepGroups(lib, p, derived)
  if (day !== pd || !groups.length || personal.done[`${p.weekOf}:prepday`]) return null
  const left = groups.filter((g) => !personal.done[`${p.weekOf}:prep:${g.recipe.id}`]).length
  if (!left) return null
  return (
    <div className="note-bar">
      <span>Prep day. {left} recipe{left > 1 ? 's' : ''} to cook and portion.</span>
      <button className="btn small-btn" onClick={() => nav.go('prep')}>Open Prep</button>
    </div>
  )
}

function CookCard({ lib, derived, e, weekOf }: { lib: Library; derived: Derived; e: Entry; weekOf: string }) {
  const { personal, update, updatePantry, toast } = useStore()
  const r = lib.recipes[e.recipeId!], f = derived.formulas[r.id]
  const key = `${weekOf}:cooked:${e.key}`
  const cooked = !!personal.done[key]
  const toggle = () => {
    update((s) => ({ ...s, done: { ...s.done, [key]: !cooked } }))
    updatePantry((pan) => applyUsage(pan, usage(lib, r, f, 1), cooked ? 1 : -1))
    toast(cooked ? 'Put back in the pantry' : 'Cooked. One serving taken out of the pantry.')
  }
  return (
    <details className="cook">
      <summary>How to cook it<span className="muted">{r.prepMinutes + r.cookMinutes} min, one serving{cooked ? ', cooked' : ''}</span></summary>
      <Amounts lib={lib} r={r} f={f} />
      <ol className="steps">{r.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
      <TrackerButton lib={lib} r={r} f={f} />
      <button className={`btn wide ${cooked ? 'ghost' : 'primary'} cooked-btn`} aria-pressed={cooked} onClick={toggle}><Icon name="check" size={18} />{cooked ? 'Cooked. Undo' : 'Mark cooked'}</button>
    </details>
  )
}

function DayStrip({ value, onChange, derived }: { value: Day; onChange: (d: Day) => void; derived: Derived }) {
  const { personal } = useStore()
  const wk = personal.plan.weekOf
  return (
    <div className="daystrip" role="tablist" aria-label="Day">
      {DAYS.map((d) => {
        const dv = derived.days.find((x) => x.day === d)!
        const has = dv.entries.some((e) => e.recipeId)
        return (
          <button key={d} role="tab" aria-selected={value === d} className={`dchip${value === d ? ' on' : ''}${d === todayKey() && wk === mondayOf() ? ' now' : ''}`} onClick={() => onChange(d)}>
            <span>{DAY_NAME[d].slice(0, 3)}</span><b className="num">{dateOf(wk, d).getDate()}</b><i className={has ? `dot s-${dv.status.kcal}` : 'dot'} aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}

/* ---------------- Plan ---------------- */
type PickTarget = { day: Day; slot: 'breakfast' | 'lunch' | 'dinner' }
export function Plan({ lib, derived, nav }: { lib: Library; derived: Derived; nav: Nav }) {
  const { personal, partners, me, update, toast, pantry } = useStore()
  const p = personal.plan
  const [pick, setPick] = useState<PickTarget | null>(null)
  const stale = p.weekOf < mondayOf()
  const partner = partners.find((x) => x.weekOf === p.weekOf) ?? null
  const setPlan = (fn: (pl: typeof p) => typeof p) => update((s) => ({ ...s, plan: fn(s.plan) }))
  const setSlot = (days: Day[], slot: PickTarget['slot'], id: string | null) => setPlan((pl) => {
    const nd = { ...pl.days }
    for (const d of days) nd[d] = { ...nd[d], [slot]: id }
    return { ...pl, days: nd }
  })
  const fill = () => setPlan((pl) => {
    const nd = { ...pl.days }
    for (const slot of ['lunch', 'dinner'] as const) {
      const emptyWeekdays = DAYS.slice(0, 5).filter((d) => !nd[d][slot])
      if (!emptyWeekdays.length) continue
      const taken = () => DAYS.flatMap((d) => [nd[d].lunch, nd[d].dinner]).filter(Boolean) as string[]
      if (slot === 'lunch') { const r = suggest(lib, pl, slot, taken(), pl.weekOf + slot, pantry); if (r) for (const d of emptyWeekdays) nd[d] = { ...nd[d], lunch: r.id } }
      else for (const d of emptyWeekdays) { const r = suggest(lib, pl, slot, taken(), pl.weekOf + d, pantry); if (r) nd[d] = { ...nd[d], dinner: r.id } }
    }
    return { ...pl, days: nd }
  })
  const newWeek = (keep: boolean) => {
    setPlan((pl) => ({ ...pl, weekOf: mondayOf(), modeAsked: keep ? pl.modeAsked : {}, modes: keep ? pl.modes : {}, days: keep ? pl.days : Object.fromEntries(DAYS.map((d) => [d, { breakfast: null, lunch: null, dinner: null }])) as typeof pl.days }))
    toast(keep ? 'Started this week with the same meals' : 'Started an empty week')
  }
  const move = (from: PickTarget, to: Day) => setPlan((pl) => {
    const nd = { ...pl.days }, a = nd[from.day][from.slot], b = nd[to][from.slot]
    nd[from.day] = { ...nd[from.day], [from.slot]: b }
    nd[to] = { ...nd[to], [from.slot]: a }
    return { ...pl, days: nd }
  })
  return (
    <div className="view plan">
      <header className="view-head row">
        <h1>Week of {shortDate(dateOf(p.weekOf, 'mon'))}<span className="sub">{who(me.profile)}{derived.targets ? `, portioned to ${derived.targets.caloriesKcal} Cal a day` : ''}{partner ? `. ${who(partner.profile)}'s meals show read-only.` : ''}</span></h1>
        <div className="head-actions">
          <button className="btn ghost" onClick={fill}><Icon name="sparkle" size={18} />Fill empty weekdays</button>
          {stale && <><button className="btn primary" onClick={() => newWeek(true)}>Start this week, same meals</button><button className="btn ghost" onClick={() => newWeek(false)}>Start empty</button></>}
        </div>
      </header>
      <div className="week">
        {derived.days.map((dv) => {
          const d = dv.day, dp = p.days[d]
          const theirs = partner?.days[d]
          const theirSlots = theirs ? (['breakfast', 'lunch', 'dinner'] as const).filter((k) => theirs[k]) : []
          return (
            <section key={d} className="pday">
              <header>
                <h2>{DAY_NAME[d]}<span className="num">{shortDate(dateOf(p.weekOf, d))}</span></h2>
                {dv.entries.some((e) => e.recipeId) && <span className={`pday-total num s-${dv.status.kcal}`}>{Math.round(dv.totals.kcal)} Cal, {Math.round(dv.totals.proteinG)} g protein</span>}
              </header>
              {(['breakfast', 'lunch', 'dinner'] as const).map((slot) => {
                if (slot === 'breakfast' && !dp.breakfast && !lib.mine.some((r) => r.mealType === 'breakfast')) return null
                const id = dp[slot], r = id ? lib.recipes[id] : null
                const mode = r ? modeOf(p, r) : null
                return (
                  <button key={slot} className={`pslot${r ? '' : ' empty'}`} onClick={() => setPick({ day: d, slot })}>
                    <span className="pslot-k">{slot[0].toUpperCase() + slot.slice(1)}</span>
                    {r ? <span className="pslot-name">{r.name}</span> : <span className="pslot-name add"><Icon name="plus" size={18} />Add {slot}</span>}
                    {mode && <span className={`tag ${mode}`}>{mode === 'prep' ? 'Prep' : 'Fresh'}</span>}
                  </button>
                )
              })}
              {theirSlots.length > 0 && (
                <div className="theirs" aria-label={`${who(partner!.profile)}'s meals, read-only`}>
                  <span className="theirs-who">{who(partner!.profile)}</span>
                  <ul>
                    {theirSlots.map((k) => <li key={k}><span className="pslot-k">{k[0].toUpperCase() + k.slice(1)}</span><span className="theirs-name">{theirs![k]!.name}</span><span className={`tag ${theirs![k]!.mode}`}>{theirs![k]!.mode === 'prep' ? 'Prep' : 'Fresh'}</span></li>)}
                  </ul>
                </div>
              )}
            </section>
          )
        })}
      </div>
      <Picker lib={lib} target={pick} onClose={() => setPick(null)} onPick={(days, id) => { if (pick) setSlot(days, pick.slot, id); setPick(null) }} onMove={(to) => { if (pick) { move(pick, to); toast(`Moved to ${DAY_NAME[to]}`) } setPick(null) }} nav={nav} />
    </div>
  )
}

function Picker({ lib, target, onClose, onPick, onMove, nav }: { lib: Library; target: PickTarget | null; onClose: () => void; onPick: (days: Day[], id: string | null) => void; onMove: (to: Day) => void; nav: Nav }) {
  const { personal, pantry } = useStore()
  const p = personal.plan
  const [q, setQ] = useState('')
  const [scope, setScope] = useState<'one' | 'weekdays' | 'all'>('one')
  const slot = target?.slot
  const list = useMemo(() => {
    if (!slot) return []
    const all = lib.mine.filter((r) => (slot === 'breakfast' ? r.mealType === 'breakfast' : r.mealType !== 'breakfast'))
    const s = q.trim().toLowerCase()
    return all.filter((r) => !s || `${r.name} ${r.cuisine} ${r.primaryProtein}`.toLowerCase().includes(s))
      .map((r) => ({ r, fit: pantryScore(lib, r, pantry) }))
      .sort((a, b) => Number(b.r.mealType === slot) - Number(a.r.mealType === slot) || b.fit - a.fit || a.r.name.localeCompare(b.r.name))
  }, [lib, slot, q, pantry])
  const nut = makeNut(lib)
  const cur = target ? p.days[target.day][target.slot] : null
  const days = (): Day[] => (!target ? [] : scope === 'one' ? [target.day] : scope === 'weekdays' ? [...DAYS.slice(0, 5)] : [...DAYS])
  return (
    <Sheet open={!!target} onClose={onClose} title={target ? `${DAY_NAME[target.day]} ${target.slot}` : ''}>
      <div className="picker">
        <Seg label="Apply to" value={scope} onChange={setScope} options={[['one', target ? DAY_NAME[target.day] : 'This day'], ['weekdays', 'Mon–Fri'], ['all', 'All week']]} />
        <label className="search"><Icon name="search" size={18} /><input id="pick-q" type="search" placeholder="Search recipes" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        {cur && (
          <div className="move-row">
            <span className="fl">Move {lib.recipes[cur]?.name ?? 'this meal'} to</span>
            <div className="move-days">{DAYS.filter((d) => d !== target!.day).map((d) => <button key={d} className="btn ghost small-btn" onClick={() => onMove(d)}>{DAY_NAME[d].slice(0, 3)}</button>)}</div>
            <button className="btn ghost wide" onClick={() => onPick(days(), null)}>Clear {target!.slot}</button>
          </div>
        )}
        <ul className="pick-list">
          {list.map(({ r, fit }) => (
            <li key={r.id} className={r.id === cur ? 'cur' : ''}>
              <button className="pick" onClick={() => onPick(days(), r.id)}>
                <span className="pick-name">{r.name}{fit >= 0.999 ? <span className="tag fresh">In your pantry</span> : fit >= 0.5 ? <span className="tag prep">Mostly on hand</span> : null}</span>
                <span className="pick-meta">{r.cuisine}, {r.primaryProtein}{r.mealType !== slot ? `, usually ${r.mealType}` : ''}</span>
                <Macros m={basePortion(r, nut, p.pins[r.id]).perServing} />
              </button>
              <button className="icon-btn" aria-label={`View ${r.name}`} onClick={() => { onClose(); nav.openRecipe(r.id) }}><Icon name="recipes" size={20} /></button>
            </li>
          ))}
          {list.length === 0 && <li className="muted small" style={{ padding: '12px 4px' }}>No {slot} recipes match. Make one from the Recipes tab.</li>}
        </ul>
      </div>
    </Sheet>
  )
}

/* ---------------- Prep ---------------- */
type Comp = { key: string; name: string; kind: 'weigh' | 'direct'; perUnit?: number; unit?: string; hint?: string }
/* What to put in each container. Cooked parts change weight, so they are weighed after cooking and divided; the rest are measured straight in. */
function components(lib: Library, r: Recipe, f: PrepGroup['formula']): Comp[] {
  const ing = r.ingredients.filter((i) => !i.optional && f.qty[i.ingredientId] > 0 && !lib.catalog[i.ingredientId]?.pantry)
  const cooked = (i: Recipe['ingredients'][number]) => i.state === 'raw' || i.state === 'dry'
  const direct = (i: Recipe['ingredients'][number]): Comp => {
    const c = lib.catalog[i.ingredientId], q = f.qty[i.ingredientId]
    return { key: i.ingredientId, name: c?.name ?? i.name, kind: 'direct', perUnit: q, unit: c?.basis === 'count' ? 'count' : c?.basis ?? i.unit, hint: c?.basis === 'count' ? undefined : approx(lib, i.ingredientId, q) ?? undefined }
  }
  if (!r.flexible) {
    const counted = ing.filter((i) => lib.catalog[i.ingredientId]?.basis === 'count' && !/egg/.test(i.ingredientId))
    const rest = ing.filter((i) => !counted.includes(i) && i.role !== 'seasoning')
    return [...(rest.length ? [{ key: '_batch', name: `Cooked filling (${rest.map((i) => (lib.catalog[i.ingredientId]?.name ?? i.name).split(',')[0].toLowerCase()).slice(0, 4).join(', ')})`, kind: 'weigh' as const }] : []), ...counted.map(direct)]
  }
  const out: Comp[] = []
  for (const i of ing) {
    if (i.role === 'seasoning' || i.role === 'fat') continue
    if ((i.role === 'protein' || i.role === 'starch' || i.role === 'vegetable') && cooked(i)) out.push({ key: i.ingredientId, name: `Cooked ${(lib.catalog[i.ingredientId]?.name ?? i.name).split(',')[0].toLowerCase()}`, kind: 'weigh' })
    else out.push(direct(i))
  }
  return out
}

export function Prep({ lib, derived, nav }: { lib: Library; derived: Derived; nav: Nav }) {
  const { personal, update, updatePantry, toast } = useStore()
  const p = personal.plan
  const groups = prepGroups(lib, p, derived)
  const containers = groups.reduce((a, g) => a + g.days.length, 0)
  const freshCount = derived.days.flatMap((d) => d.entries).filter((e) => e.mode === 'fresh').length
  const pd = DAY_NAME[p.prepDay ?? 'sun']
  const doneKey = (g: PrepGroup) => `${p.weekOf}:prep:${g.recipe.id}`
  const setDone = (g: PrepGroup, v: boolean) => {
    if (!!personal.done[doneKey(g)] === v) return
    update((s) => ({ ...s, done: { ...s.done, [doneKey(g)]: v } }))
    updatePantry((pan) => applyUsage(pan, usage(lib, g.recipe, g.formula, g.days.length), v ? -1 : 1))
    toast(v ? `${g.recipe.name} prepped. Pantry updated.` : 'Marked not prepped. Put back in the pantry.')
  }
  return (
    <div className="view prep">
      <header className="view-head">
        <h1>{pd} prep<span className="sub">{groups.length ? `${groups.length} recipe${groups.length > 1 ? 's' : ''}, ${containers} containers. ${freshCount} meal${freshCount === 1 ? '' : 's'} cooked fresh on the night.` : 'Nothing to prep this week.'}</span></h1>
      </header>
      {!groups.length && (
        <div className="empty">
          <p>Plan a meal on two or more days and Gather asks whether to prep it on {pd}. Meals planned once are cooked fresh.</p>
          <button className="btn primary" onClick={() => nav.go('plan')}>Plan the week</button>
        </div>
      )}
      {groups.some((g) => g.days.length >= 5) && <p className="muted small fridge-note">Cooked food is usually rated for 3–4 days in the fridge, so the last containers are a day past that.</p>}
      <div className="prep-list">
        {groups.map((g) => <PrepCard key={g.recipe.id} lib={lib} g={g} weekOf={p.weekOf} done={!!personal.done[doneKey(g)]} setDone={(v) => setDone(g, v)} nav={nav} />)}
      </div>
    </div>
  )
}

function PrepCard({ lib, g, weekOf, done, setDone, nav }: { lib: Library; g: PrepGroup; weekOf: string; done: boolean; setDone: (v: boolean) => void; nav: Nav }) {
  const { personal, update } = useStore()
  const n = g.days.length
  const comps = components(lib, g.recipe, g.formula)
  const pk = `${weekOf}:${g.recipe.id}`
  const st = personal.portion?.[pk] ?? { totals: {}, filled: {} }
  const [stage, setStage] = useState<'cook' | 'portion'>(Object.keys(st.totals).length || Object.keys(st.filled).length ? 'portion' : 'cook')
  const save = (next: typeof st) => update((s) => ({ ...s, portion: { ...s.portion, [pk]: next } }))
  const filled = (k: string) => st.filled[k] ?? Array(n).fill(false)
  const allDone = comps.length > 0 && comps.every((c) => filled(c.key).filter(Boolean).length === n && (c.kind === 'direct' || (st.totals[c.key] ?? 0) > 0))
  const tick = (k: string, i: number) => {
    const arr = [...filled(k)]; arr[i] = !arr[i]
    const next = { ...st, filled: { ...st.filled, [k]: arr } }
    save(next)
    const complete = comps.every((c) => (c.key === k ? arr : next.filled[c.key] ?? []).filter(Boolean).length === n && (c.kind === 'direct' || (next.totals[c.key] ?? 0) > 0))
    if (complete && !done) setDone(true)
  }
  return (
    <article className={`pcard${done ? ' done' : ''}`}>
      <header>
        <div>
          <span className="pcard-k">{n} container{n > 1 ? 's' : ''}, {dayList(g.days)}, fridge</span>
          <h2><button className="linkish" onClick={() => nav.openRecipe(g.recipe.id)}>{g.recipe.name}</button></h2>
        </div>
        <button className={`tick big${done ? ' on' : ''}`} aria-pressed={done} aria-label={`Mark ${g.recipe.name} prepped`} onClick={() => setDone(!done)}><Icon name="check" size={22} /></button>
      </header>
      <Seg label="Stage" value={stage} onChange={setStage} options={[['cook', '1. Cook the batch'], ['portion', '2. Portion']]} />
      {stage === 'cook' ? (
        <div className="stage">
          <p className="muted small">Raw amounts for all {n} servings.</p>
          <Amounts lib={lib} r={g.recipe} f={g.formula} times={n} />
          <ol className="steps">{g.recipe.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          <button className="btn primary wide" onClick={() => setStage('portion')}>Done cooking, portion it</button>
        </div>
      ) : (
        <div className="stage">
          <p className="muted small">Line up {n} containers. For each part, tare a bowl, add all of it, type the total, then fill container by container.</p>
          <ol className="comps">
            {comps.map((c) => {
              const total = st.totals[c.key]
              const each = c.kind === 'weigh' ? (total ? total / n : null) : c.perUnit!
              const f = filled(c.key)
              return (
                <li key={c.key} className={f.filter(Boolean).length === n && (c.kind === 'direct' || total) ? 'comp done' : 'comp'}>
                  <div className="comp-head">
                    <h4>{c.name}</h4>
                    {c.kind === 'weigh' ? (
                      <span className="inp small"><input aria-label={`${c.name} total weight`} id={`tot-${g.recipe.id}-${c.key}`} type="number" inputMode="decimal" placeholder="Total" value={total ?? ''}
                        onChange={(e) => save({ ...st, totals: { ...st.totals, [c.key]: Number(e.target.value) || 0 } })} /><em>g</em></span>
                    ) : null}
                  </div>
                  <p className="each">{each != null
                    ? <><b className="num">{c.unit === 'count' ? metric(each, 'count') : `${Math.round(each)} ${c.unit ?? 'g'}`}</b> in each container{c.kind === 'weigh' ? <span className="muted"> ({Math.round(total!)} g ÷ {n})</span> : c.hint ? <span className="muted"> ({c.hint})</span> : null}</>
                    : <span className="muted">Weigh the cooked total to see each portion.</span>}</p>
                  <div className="fills" role="group" aria-label={`${c.name} containers`}>
                    {g.days.map((d, i) => <button key={d} className={`fill${f[i] ? ' on' : ''}`} aria-pressed={!!f[i]} disabled={each == null} onClick={() => tick(c.key, i)}>{DAY_NAME[d].slice(0, 3)}</button>)}
                  </div>
                </li>
              )
            })}
          </ol>
          {allDone || done ? <p className="ok-line"><Icon name="check" size={18} />All {n} containers filled. Each one is a serving of the recipe you copy to your calorie tracker.</p> : null}
          <TrackerButton lib={lib} r={g.recipe} f={g.formula} />
        </div>
      )}
    </article>
  )
}

/* ---------------- Recipes ---------------- */
export function RecipeList({ lib, derived, nav, selected }: { lib: Library; derived: Derived; nav: Nav; selected?: string | null }) {
  const { personal, pantry } = useStore()
  const [q, setQ] = useState('')
  const [type, setType] = useState<'all' | 'breakfast' | 'lunch' | 'dinner'>('all')
  const [can, setCan] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [adding, setAdding] = useState(false)
  const nut = makeNut(lib)
  const p = personal.plan
  const planned = new Set(DAYS.flatMap((d) => Object.values(p.days[d])).filter(Boolean))
  const s = q.trim().toLowerCase()
  const match = (r: StoredRecipe) => (type === 'all' || r.mealType === type) && (!can || canMakeNow(lib, r, pantry)) && (!s || `${r.name} ${r.cuisine} ${r.primaryProtein} ${r.description}`.toLowerCase().includes(s))
  const list = lib.mine.filter(match)
  const hidden = lib.hidden.filter(match)
  const card = (r: StoredRecipe) => (
    <li key={r.id}>
      <button className={`rcard${selected === r.id ? ' sel' : ''}`} onClick={() => nav.openRecipe(r.id)}>
        <span className="rc-k">{r.mealType[0].toUpperCase() + r.mealType.slice(1)}, {r.cuisine}{r.custom && <span className="tag prep">Yours</span>}{planned.has(r.id) && <span className="tag plan">This week</span>}</span>
        <span className="rc-name">{r.name}</span>
        <Macros m={(derived.formulas[r.id] ?? basePortion(r, nut, p.pins[r.id])).perServing} />
      </button>
    </li>
  )
  return (
    <div className="view rlist">
      <AddRecipeSheet lib={lib} open={adding} onClose={() => setAdding(false)} onSeed={(s) => nav.edit(null, undefined, s)} onManual={() => nav.edit(null)} />
      <header className="view-head row">
        <h1>Recipes<span className="sub">{lib.mine.length} in your library</span></h1>
        <div className="head-actions">
          <button className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" size={18} />Add recipe</button>
          <button className="btn ghost" onClick={() => nav.go('ingredients')}>Ingredients</button>
        </div>
      </header>
      <div className="rfilters">
        <label className="search"><Icon name="search" size={18} /><input id="r-q" type="search" placeholder="Search by name, cuisine or protein" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <Seg label="Meal" value={type} onChange={setType} options={[['all', 'All'], ['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner']]} />
        <label className="switch"><input type="checkbox" id="r-can" checked={can} onChange={(e) => setCan(e.target.checked)} /><span>Can make now, from your pantry</span></label>
      </div>
      {list.length === 0 && <p className="empty">{can ? 'Nothing is fully covered by your pantry yet. Put groceries away on the Shop tab, or add what you have under Pantry.' : q ? `No recipes match “${q}”. Try a protein like chicken or salmon.` : 'No recipes here yet. Tap Add recipe to bring one in.'}</p>}
      <ul className="rcards">{list.map(card)}</ul>
      {lib.hidden.length > 0 && (
        <div className="hidden-block">
          <button className="btn ghost" aria-expanded={showHidden} onClick={() => setShowHidden(!showHidden)}>{showHidden ? 'Hide' : 'Show'} {lib.hidden.length} hidden recipe{lib.hidden.length > 1 ? 's' : ''}</button>
          {showHidden && <ul className="rcards muted-list">{hidden.map(card)}</ul>}
        </div>
      )}
    </div>
  )
}

export function RecipeView({ lib, derived, id, onBack, showBack, nav }: { lib: Library; derived: Derived; id: string; onBack: () => void; showBack: boolean; nav: Nav }) {
  const { personal, update, toast, saveRecipe, deleteRecipe, base } = useStore()
  const r = lib.recipes[id]
  const [adding, setAdding] = useState(false)
  const [adjust, setAdjust] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [showHist, setShowHist] = useState(false)
  if (!r) return <div className="view"><p className="empty">That recipe isn't in your library.</p></div>
  const p = personal.plan
  const nut = makeNut(lib)
  const plannedDays = DAYS.filter((d) => Object.values(p.days[d]).includes(id))
  const f = derived.formulas[id] ?? basePortion(r, nut, p.pins[id])
  const pins = p.pins[id] ?? {}
  const mode = modeOf(p, r)
  const setPlan = (fn: (pl: typeof p) => typeof p) => update((s) => ({ ...s, plan: fn(s.plan) }))
  const count = countOf(p, id)
  const setMode = (m: Mode) => setPlan((pl) => ({ ...pl, modes: { ...pl.modes, [id]: m }, modeAsked: { ...pl.modeAsked, [id]: countOf(pl, id) } }))
  const setPin = (ing: string, v: number | null) => setPlan((pl) => {
    const cur = { ...(pl.pins[id] ?? {}) }
    if (v == null || !Number.isFinite(v)) delete cur[ing]; else cur[ing] = Math.max(0, v)
    const all = { ...pl.pins, [id]: cur }
    if (!Object.keys(cur).length) delete all[id]
    return { ...pl, pins: all }
  })
  const slot: 'breakfast' | 'lunch' | 'dinner' = r.mealType
  const addTo = (days: Day[]) => {
    setPlan((pl) => { const nd = { ...pl.days }; for (const d of days) nd[d] = { ...nd[d], [slot]: id }; return { ...pl, days: nd } })
    setAdding(false); toast(`Added to ${days.length === 1 ? DAY_NAME[days[0]] : `${days.length} days`}`)
  }
  const original = r.base ?? (r.custom ? null : base.recipes[personal.profile].find((x) => x.id === id) ?? null)
  const { history, pos } = ensureHistory(r, original)
  const go = (i: number) => { saveRecipe(moveTo(r, i, original)); toast(i === history.length - 1 ? 'Back to the newest version' : `Using version ${i + 1}`) }
  return (
    <article className="view recipe">
      {showBack && <button className="btn ghost back" onClick={onBack}><Icon name="back" size={20} />Back</button>}
      <header className="r-head">
        <span className="rc-k">{r.mealType[0].toUpperCase() + r.mealType.slice(1)}, {r.cuisine}, {r.prepMinutes + r.cookMinutes} min{r.hidden ? ', hidden' : ''}</span>
        <h1>{r.name}</h1>
        <p className="lede">{r.description}</p>
        <div className="r-actions">
          <button className="btn" onClick={() => nav.edit(id)}><Icon name="edit" size={18} />Edit</button>
          <button className="btn ghost" onClick={() => nav.edit(null, id)}><Icon name="copy" size={18} />Duplicate</button>
          <button className="btn ghost" onClick={() => { saveRecipe({ ...r, hidden: !r.hidden }); toast(r.hidden ? 'Back in your library' : 'Hidden from your library and pickers') }}>{r.hidden ? 'Unhide' : 'Hide'}</button>
          {r.custom && (confirmDel
            ? <button className="btn danger" onClick={async () => { await deleteRecipe(id); setPlan((pl) => ({ ...pl, days: Object.fromEntries(DAYS.map((d) => [d, Object.fromEntries(Object.entries(pl.days[d]).map(([k, v]) => [k, v === id ? null : v]))])) as typeof pl.days })); onBack(); toast('Recipe deleted') }}>Tap again to delete</button>
            : <button className="btn ghost" onClick={() => setConfirmDel(true)}>Delete</button>)}
        </div>
      </header>
      {history.length > 1 && (
        <div className="ver-bar" role="group" aria-label="Recipe versions">
          <button className="icon-btn" aria-label="Previous version" disabled={pos === 0} onClick={() => go(pos - 1)}><Icon name="back" size={20} /></button>
          <button className="ver-mid linkish" onClick={() => setShowHist(true)}>
            <b>Version {pos + 1} of {history.length}</b>
            <span className="muted small">{history[pos].note}{history[pos].at !== 'original' ? `, ${new Date(history[pos].at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}{pos < history.length - 1 ? '. Newer versions are kept.' : ''}</span>
          </button>
          <button className="icon-btn fwd" aria-label="Next version" disabled={pos === history.length - 1} onClick={() => go(pos + 1)}><Icon name="back" size={20} /></button>
        </div>
      )}
      <div className="r-grid">
        <div className="r-side">
          <MacroLabel m={f.perServing} title="One serving" compact />
          {f.adjusted && <p className="muted small">Portioned for your targets{plannedDays.length ? ` across ${plannedDays.length} planned day${plannedDays.length > 1 ? 's' : ''}` : ''}.</p>}
          <TrackerButton lib={lib} r={r} f={f} />
          <div className="mode-box">
            <h3>How you'll make it</h3>
            {isFish(r) ? <p className="muted small">Cook fresh. Fish doesn't hold up as prepped containers, so it's always made the night you eat it.</p>
              : count < 2 ? <p className="muted small">{count === 1 ? 'Planned once this week, so it\'s cooked fresh.' : 'Cooked fresh unless you plan it on two or more days.'} Plan it on more days to prep it ahead on {DAY_NAME[p.prepDay ?? 'sun']}.</p>
              : (
              <>
                <Seg label="Cooking mode" value={mode} onChange={setMode} options={[['prep', `Prep ${count} on ${DAY_NAME[p.prepDay ?? 'sun'].slice(0, 3)}`], ['fresh', 'Cook each day']]} />
                <p className="muted small">{mode === 'prep' ? `Cooked once on prep day and split into ${count} containers.` : `Cooked fresh on each of the ${count} days.`}</p>
              </>
            )}
            {plannedDays.length > 0 ? <p className="small">Planned {dayList(plannedDays)}.</p> : null}
            <button className="btn wide" onClick={() => setAdding(true)}><Icon name="plus" size={18} />Add to your week</button>
          </div>
        </div>
        <div className="r-main">
          <div className="h-row">
            <h2>Ingredients, one serving</h2>
            <button className={`btn ${adjust ? 'primary' : 'ghost'} small-btn`} aria-pressed={adjust} onClick={() => setAdjust(!adjust)}>{adjust ? 'Done' : 'Adjust amounts'}</button>
          </div>
          {adjust ? (
            <div className="pins">
              <p className="muted small">Type an amount to lock it. Gather keeps locked amounts and fits the rest of the meal to your targets.</p>
              <ul>
                {r.ingredients.filter((i) => !i.optional).map((i) => {
                  const c = lib.catalog[i.ingredientId]
                  const locked = pins[i.ingredientId] != null
                  return (
                    <li key={i.ingredientId} className={locked ? 'locked' : ''}>
                      <label htmlFor={`pin-${i.ingredientId}`}>{c?.name ?? i.name}</label>
                      <span className="inp small"><input id={`pin-${i.ingredientId}`} type="number" inputMode="decimal" step="any" value={locked ? pins[i.ingredientId] : Math.round(f.qty[i.ingredientId] * 10) / 10}
                        onChange={(e) => setPin(i.ingredientId, e.target.value === '' ? null : Number(e.target.value))} /><em>{c?.basis === 'count' ? 'each' : c?.basis}</em></span>
                      {locked ? <button className="icon-btn" aria-label={`Unlock ${c?.name}`} onClick={() => setPin(i.ingredientId, null)}><Icon name="lock" size={18} /></button> : <span className="pin-free" aria-hidden="true" />}
                    </li>
                  )
                })}
              </ul>
              {Object.keys(pins).length > 0 && <button className="btn ghost" onClick={() => setPlan((pl) => { const { [id]: _x, ...rest } = pl.pins; return { ...pl, pins: rest } })}>Unlock all</button>}
            </div>
          ) : <Amounts lib={lib} r={r} f={f} pins={pins} />}
          <h2>Steps</h2>
          <ol className="steps">{r.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          {mode === 'prep' && r.storage.length > 0 && <><h2>Storing</h2><ul className="plain">{r.storage.map((s, i) => <li key={i}>{s}</li>)}</ul></>}
          {(r.source.title || r.source.url) && <><h2>Source</h2>
          <p className="small">{r.source.url ? <a href={r.source.url} target="_blank" rel="noopener noreferrer">{r.source.title || r.source.url}{r.source.site ? `, ${r.source.site}` : ''} <Icon name="ext" size={14} /></a> : r.source.title}{r.source.changes ? `. ${r.source.changes}` : ''}</p></>}
        </div>
      </div>
      <Sheet open={showHist} onClose={() => setShowHist(false)} title="Versions">
        <ol className="ver-list">
          {history.map((v, i) => (
            <li key={i} className={i === pos ? 'cur' : ''}>
              <span className="gi-main"><b>Version {i + 1}{i === pos ? ', in use' : ''}</b><span className="muted small">{v.note}{v.at !== 'original' ? `, ${new Date(v.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}</span></span>
              {i !== pos && <button className="btn ghost small-btn" onClick={() => { go(i); setShowHist(false) }}>Use this</button>}
            </li>
          )).reverse()}
        </ol>
        <p className="muted small">Editing an older version saves it as a new version at the top. Nothing in this list is deleted.</p>
      </Sheet>
      <Sheet open={adding} onClose={() => setAdding(false)} title={`Add ${slot}`}>
        <div className="add-days">
          {DAYS.map((d) => <button key={d} className="pslot" onClick={() => addTo([d])}><span className="pslot-k">{DAY_NAME[d]}</span><span className="pslot-name">{p.days[d][slot] ? lib.recipes[p.days[d][slot]!]?.name : `No ${slot} yet`}</span></button>)}
          <div className="fn-row"><button className="btn" onClick={() => addTo([...DAYS.slice(0, 5)])}>Every weekday</button><button className="btn ghost" onClick={() => addTo([...DAYS])}>All 7 days</button></div>
        </div>
      </Sheet>
    </article>
  )
}
