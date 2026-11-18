import { useState } from 'react'
import type { Personal, Recipe } from './types'
import type { Library } from './data'
import type { Formula } from './engine'
import { foodnoms } from './engine'
import { copyText, useStore } from './store'
import { Icon, Seg, Sheet } from './ui'

/* Export of one serving for a calorie tracker. The app plans and preps; the tracker logs what was eaten.
   Wording stays generic ("your calorie tracker"); named apps belong in help pages, not buttons. */
type Fmt = 'lines' | 'line' | 'csv' | 'json' | 'link'
const kcalOf = (f: Formula) => Math.round(f.perServing.kcal)
export const exportName = (r: Recipe, f: Formula, withCal: boolean) => (withCal ? `${r.name}, ${kcalOf(f)} Cal` : r.name)

function fnv(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return (h >>> 0).toString(36) }
/* Identifies the serving as copied: if the ingredient amounts change, so does this. */
export const signature = (lib: Library, r: Recipe, f: Formula) => fnv(foodnoms(lib, r, f, '\n'))
export type ExportState = 'never' | 'current' | 'changed'
export function exportState(p: Personal, lib: Library, r: Recipe, f: Formula): ExportState {
  const e = p.exports?.[r.id]
  return !e ? 'never' : e.sig === signature(lib, r, f) ? 'current' : 'changed'
}

function render(lib: Library, r: Recipe, f: Formula, fmt: Fmt, name: string): string {
  const rows = r.ingredients.filter((i) => !i.optional && f.qty[i.ingredientId] > 0).map((i) => {
    const c = lib.catalog[i.ingredientId]
    const q = f.qty[i.ingredientId]
    return { name: c?.name ?? i.name, amount: Math.round(q * 10) / 10, unit: c?.basis === 'count' ? 'each' : c?.basis ?? i.unit, state: c?.state ?? i.state }
  })
  const m = f.perServing
  if (fmt === 'lines') return foodnoms(lib, r, f, '\n')
  if (fmt === 'line') return foodnoms(lib, r, f, ', ')
  if (fmt === 'csv') {
    const esc = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
    return [['recipe', 'servings', 'ingredient', 'amount', 'unit', 'weighed'].join(','), ...rows.map((x) => [name, 1, x.name, x.amount, x.unit, x.state].map(esc).join(','))].join('\n')
  }
  return JSON.stringify({
    name, servings: 1,
    nutritionPerServing: { calories: Math.round(m.kcal), proteinG: Math.round(m.proteinG), carbsG: Math.round(m.carbsG), fatG: Math.round(m.fatG) },
    ingredients: rows, steps: r.steps,
  }, null, 2)
}

export function ExportSheet({ lib, r, f, open, onClose }: { lib: Library; r: Recipe; f: Formula; open: boolean; onClose: () => void }) {
  const { personal, update, toast } = useStore()
  const [fmt, setFmt] = useState<Fmt>('lines')
  const [withCal, setWithCal] = useState(true)
  const state = exportState(personal, lib, r, f)
  const name = exportName(r, f, withCal)
  const text = fmt === 'link' ? '' : render(lib, r, f, fmt, name)
  const record = () => update((p) => ({ ...p, exports: { ...p.exports, [r.id]: { sig: signature(lib, r, f), at: new Date().toISOString(), kcal: kcalOf(f) } } }))
  return (
    <Sheet open={open} onClose={onClose} title="Copy to your calorie tracker">
      <div className="ing-form export">
        {state === 'changed' && <p className="note-bar warn-bar">This recipe changed since you last copied it ({personal.exports![r.id].kcal} Cal then, {kcalOf(f)} now). Save it as a new recipe in your tracker so old logs stay right.</p>}
        <p className="small">One serving, in raw weights. Paste it into your tracker's recipe import, then log a serving there each time you eat it.</p>
        <div className="name-row">
          <span className="gi-main"><span className="fl">Recipe name</span><b>{name}</b></span>
          <button className="btn ghost small-btn" onClick={() => copyText(name, toast, 'Copied the name')}><Icon name="copy" size={16} />Name</button>
        </div>
        <label className="switch"><input type="checkbox" id="ex-cal" checked={withCal} onChange={(e) => setWithCal(e.target.checked)} /><span>Put the calories in the name, so each version is easy to tell apart</span></label>
        <Seg label="Format" value={fmt} onChange={setFmt} options={[['lines', 'Ingredient list'], ['line', 'One line'], ['csv', 'CSV'], ['json', 'JSON'], ['link', 'Private link']]} />
        {fmt === 'link' ? (
          <div className="link-preview">
            <p className="small">In the app, this makes a private web page for this exact version of the recipe, with the ingredients and nutrition per serving in the standard recipe format that trackers read when you import from a link. Paste the link into your tracker's import from website.</p>
            <ul className="plain small">
              <li>The link is unguessable, works without signing in, and is hidden from search engines.</li>
              <li>Each recipe version gets its own link, so an edit never changes what you already imported.</li>
              <li>It expires after 30 days by default. You can keep it longer, or turn it off at any time.</li>
            </ul>
            <code className="fake-link">https://r.example.app/v/7Kq2…?exp=…&amp;sig=…</code>
            <button className="btn wide" disabled>Create private link (in the app)</button>
          </div>
        ) : (
          <>
            <textarea id="ex-text" readOnly rows={Math.min(12, text.split('\n').length + 1)} value={text} onFocus={(e) => e.currentTarget.select()} />
            <button className="btn primary wide" onClick={() => { copyText(text, toast, 'Copied. Paste it into your tracker.'); record() }}><Icon name="copy" size={18} />Copy {fmt === 'lines' ? 'ingredient list' : fmt === 'line' ? 'one line' : fmt.toUpperCase()}</button>
          </>
        )}
        {state === 'current' && <p className="muted small">You copied this exact version on {new Date(personal.exports![r.id].at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.</p>}
      </div>
    </Sheet>
  )
}

/* The one button every recipe surface uses. */
export function TrackerButton({ lib, r, f, compact }: { lib: Library; r: Recipe; f: Formula; compact?: boolean }) {
  const { personal } = useStore()
  const [open, setOpen] = useState(false)
  const st = exportState(personal, lib, r, f)
  return (
    <>
      {compact
        ? <button className={`icon-btn track-btn${st === 'changed' ? ' changed' : ''}`} aria-label={`Copy ${r.name} to your calorie tracker${st === 'changed' ? ', changed since last copy' : ''}`} onClick={() => setOpen(true)}><Icon name="copy" size={20} /></button>
        : <div className="fn-row">
            <button className="btn" onClick={() => setOpen(true)}><Icon name="copy" size={18} />Copy to your calorie tracker</button>
            {st === 'changed' && <span className="tag warn">Changed since you copied it</span>}
            {st === 'current' && <span className="tag fresh">Copied</span>}
          </div>}
      <ExportSheet lib={lib} r={r} f={f} open={open} onClose={() => setOpen(false)} />
    </>
  )
}
