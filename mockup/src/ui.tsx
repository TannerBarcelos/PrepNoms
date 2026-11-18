import { useEffect, useRef, type ReactNode } from 'react'
import type { Macro, Targets, Recipe } from './types'
import type { Status, Formula } from './engine'
import { approx, metric, household } from './engine'
import type { Library } from './data'

const P: Record<string, ReactNode> = {
  today: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  plan: <><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></>,
  prep: <><path d="M4 11h16v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" /><path d="M2.5 11h19M9 7.5c0-1.5 1-2.5 3-2.5s3 1 3 2.5" /></>,
  shop: <><path d="M5 7h14l-1.2 11.2A2 2 0 0 1 15.8 20H8.2a2 2 0 0 1-2-1.8z" /><path d="M9 10V6a3 3 0 0 1 6 0v4" /></>,
  recipes: <><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>,
  back: <path d="M15 5l-7 7 7 7" />,
  chev: <path d="M9 6l6 6-6 6" />,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  up: <path d="M6 15l6-6 6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  ext: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  flame: <path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z" />,
  snow: <path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 4l3 2 3-2M9 20l3-2 3 2" />,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
}
export function Icon({ name, size = 22 }: { name: keyof typeof P | string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{P[name]}</svg>
}

const n0 = (x: number) => Math.round(x).toLocaleString('en-US')
const say: Record<Status, string> = { met: 'On target', near: 'Close', over: 'Over', under: 'Short', none: '' }

/* The nutrition-label readout: the app's signature element.
   With `eaten`, the top block becomes calories left, and each meter shows eaten (solid) over planned (faint). */
export function MacroLabel({ m, t, status, title, compact, eaten }: { m: Macro; t?: Targets | null; status?: Record<'kcal' | 'protein' | 'carbs' | 'fat', Status>; title?: string; compact?: boolean; eaten?: Macro }) {
  const rows: { k: 'protein' | 'carbs' | 'fat'; name: string; v: number; e?: number; goal?: number; kind: string }[] = [
    { k: 'protein', name: 'Protein', v: m.proteinG, e: eaten?.proteinG, goal: t?.proteinMinG, kind: 'at least' },
    { k: 'carbs', name: 'Carbs', v: m.carbsG, e: eaten?.carbsG, goal: t?.carbsMaxG, kind: 'at most' },
    { k: 'fat', name: 'Fat', v: m.fatG, e: eaten?.fatG, goal: t?.fatTargetG, kind: 'about' },
  ]
  const goal = t?.caloriesKcal
  const kcalDiff = goal ? Math.round(m.kcal - goal) : null
  const planLine = goal ? `${kcalDiff === 0 ? 'Right on' : `${n0(Math.abs(kcalDiff!))} ${kcalDiff! > 0 ? 'over' : 'under'}`} your ${n0(goal)} goal as planned` : null
  if (eaten && goal) {
    const left = goal - eaten.kcal
    const scale = Math.max(goal, m.kcal) * 1.04
    return (
      <section className={`label${compact ? ' compact' : ''}`} aria-label={title ?? 'Nutrition'}>
        {title && <h3 className="label-title">{title}</h3>}
        <div className="label-kcal">
          <span className="big num">{n0(Math.abs(left))}</span>
          <span className="unit">{left >= 0 ? 'Cal left' : 'Cal over'}</span>
        </div>
        <div className="kbar" role="img" aria-label={`Eaten ${n0(eaten.kcal)} of ${n0(goal)} calories. Today's plan totals ${n0(m.kcal)}.`}>
          <i className="k-plan" style={{ width: `${(m.kcal / scale) * 100}%` }} />
          <i className={`k-eat${eaten.kcal > goal ? ' over' : ''}`} style={{ width: `${(eaten.kcal / scale) * 100}%` }} />
          <b style={{ left: `${(goal / scale) * 100}%` }} />
        </div>
        <div className="kfacts num">
          <span><b>{n0(eaten.kcal)}</b> eaten</span>
          <span><b>{n0(m.kcal)}</b> planned</span>
          <span><b>{n0(goal)}</b> goal</span>
        </div>
        <p className={`plan-line s-${status?.kcal ?? 'none'}`}>{planLine}</p>
        <Rows rows={rows} status={status} />
      </section>
    )
  }
  return (
    <section className={`label${compact ? ' compact' : ''}`} aria-label={title ?? 'Nutrition'}>
      {title && <h3 className="label-title">{title}</h3>}
      <div className="label-kcal">
        <span className="big num">{n0(m.kcal)}</span>
        <span className="unit">Cal</span>
        {goal ? <span className={`goal s-${status?.kcal ?? 'none'}`}>{planLine}</span> : null}
      </div>
      <Rows rows={rows} status={status} />
    </section>
  )
}

function Rows({ rows, status }: { rows: { k: 'protein' | 'carbs' | 'fat'; name: string; v: number; e?: number; goal?: number; kind: string }[]; status?: Record<string, Status> }) {
  return (
    <div className="label-rows">
      {rows.map((r) => {
        const st = status?.[r.k] ?? 'none'
        const scale = r.goal ? Math.max(r.goal * 1.25, r.v * 1.04) : 1
        return (
          <div className="lrow" key={r.k}>
            <span className="lname">{r.name}</span>
            <span className="lval num">{n0(r.v)}<small>g</small></span>
            {r.goal ? <span className={`lgoal s-${st}`}>{r.e != null ? <span className="lgoal-e">{n0(r.e)} g eaten</span> : say[st]}<span className="sr"> — {say[st]}, goal {r.kind} {r.goal} g</span><span aria-hidden="true" className="lgoal-n">{r.kind === 'at least' ? '≥' : r.kind === 'at most' ? '≤' : '≈'}{r.goal}</span></span> : null}
            {r.goal ? (
              <span className={`meter s-${st}`} aria-hidden="true">
                {r.e != null && <i className="m-plan" style={{ width: `${(r.v / scale) * 100}%` }} />}
                <i className="m-eat" style={{ width: `${((r.e ?? r.v) / scale) * 100}%` }} />
                <b style={{ left: `${(r.goal / scale) * 100}%` }} />
              </span>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export function Macros({ m }: { m: Macro }) {
  return <span className="macros num"><b>{n0(m.kcal)}</b> Cal <span>{n0(m.proteinG)}P</span> <span>{n0(m.carbsG)}C</span> <span>{n0(m.fatG)}F</span></span>
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) d.showModal(); if (!open && d.open) d.close() }, [open])
  return (
    <dialog ref={ref} className="sheet" onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose() }} aria-label={title}>
      <div className="sheet-in">
        <header className="sheet-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button></header>
        {open && children}
      </div>
    </dialog>
  )
}

const SEASON = ['garlic', 'cilantro', 'lime-juice', 'lemon-juice', 'ginger', 'green-onion', 'parsley', 'basil', 'jalapeno']
function groupOf(lib: Library, i: Recipe['ingredients'][number]): string {
  if (i.role !== 'fixed') return i.role
  const c = lib.catalog[i.ingredientId]
  if (c?.category === 'Meat & Seafood' || i.ingredientId === 'egg' || i.ingredientId === 'egg-whites') return 'protein'
  if (c?.category === 'Grains & Pasta') return 'starch'
  if (c?.category === 'Produce' && !SEASON.includes(i.ingredientId)) return 'vegetable'
  return 'fixed'
}
export function Amounts({ lib, r, f, times = 1, pins }: { lib: Library; r: Recipe; f: Formula; times?: number; pins?: Record<string, number> }) {
  const groups: [string, string[]][] = [['Protein', ['protein']], ['Carbs', ['starch']], ['Vegetables', ['vegetable']], ['Sauce, fat and seasoning', ['sauce', 'fat', 'seasoning', 'fixed']]]
  return (
    <div className="amounts">
      {groups.map(([g, roles]) => {
        const items = r.ingredients.filter((i) => !i.optional && roles.includes(groupOf(lib, i)))
        if (!items.length) return null
        return (
          <div key={g} className="amt-group">
            <h4>{g}</h4>
            <ul>
              {items.map((i) => {
                const q = f.qty[i.ingredientId] * times, c = lib.catalog[i.ingredientId]
                const hh = c?.basis === 'count' ? household(lib, i.ingredientId, q) : approx(lib, i.ingredientId, q)
                return (
                  <li key={i.ingredientId}>
                    <span className="amt num">{pins?.[i.ingredientId] != null && <span className="lk" title="Locked amount"><Icon name="lock" size={13} /></span>}{metric(q, c?.basis === 'count' ? 'count' : i.unit)}</span>
                    <span className="amt-name">{c?.name ?? i.name}{i.state !== 'as-packaged' && <em> {i.state}</em>}{i.notes && times === 1 && <span className="note"> {i.notes}</span>}</span>
                    {hh && c?.basis !== 'count' && <span className="amt-hh">{hh}</span>}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  )
}
