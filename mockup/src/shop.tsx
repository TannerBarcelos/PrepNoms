import { useMemo, useState } from 'react'
import type { CatalogItem, ListItem } from './types'
import type { Library } from './data'
import { CATEGORY_ORDER } from './data'
import type { Derived, ListRow } from './engine'
import { boughtAmount, buildList, household, myGrocery, pkgOf } from './engine'
import { copyText, useStore } from './store'
import { Icon, Seg, Sheet } from './ui'
import { who } from './views'

type Unit = { id: string; label: string; factor: number }
const unitsFor = (c?: CatalogItem): Unit[] =>
  !c ? [] : c.basis === 'count' ? [{ id: 'each', label: 'each', factor: 1 }]
  : c.basis === 'ml' ? [{ id: 'ml', label: 'ml', factor: 1 }, { id: 'cup', label: 'cups', factor: 240 }, { id: 'floz', label: 'fl oz', factor: 29.57 }]
  : [{ id: 'lb', label: 'lb', factor: 453.6 }, { id: 'oz', label: 'oz', factor: 28.35 }, { id: 'g', label: 'g', factor: 1 }]
const rid = () => Math.random().toString(36).slice(2, 9)

export function Shop({ lib, derived }: { lib: Library; derived: Derived }) {
  const [view, setView] = useState<'list' | 'pantry'>('list')
  return (
    <div className="view shop">
      <Seg label="Shop view" value={view} onChange={setView} options={[['list', 'Shopping list'], ['pantry', 'Pantry']]} />
      {view === 'list' ? <ListView lib={lib} derived={derived} /> : <PantryView lib={lib} />}
    </div>
  )
}

/* Type to add. Known ingredients sort into aisles and count toward recipes; anything else is a plain item. */
function QuickAdd({ lib, placeholder, onIngredient, onText, id }: { lib: Library; placeholder: string; onIngredient: (c: CatalogItem) => void; onText?: (t: string) => void; id: string }) {
  const [q, setQ] = useState('')
  const s = q.trim().toLowerCase()
  const hits = useMemo(() => (s.length < 2 ? [] : lib.catalogList.filter((c) => c.name.toLowerCase().includes(s)).sort((a, b) => Number(b.name.toLowerCase().startsWith(s)) - Number(a.name.toLowerCase().startsWith(s))).slice(0, 6)), [lib, s])
  return (
    <div className="quick">
      <form className="add-row" onSubmit={(e) => { e.preventDefault(); if (!s) return; if (hits[0] && hits[0].name.toLowerCase() === s) onIngredient(hits[0]); else if (onText) onText(q.trim()); else if (hits[0]) onIngredient(hits[0]); setQ('') }}>
        <label className="search grow"><Icon name="plus" size={18} /><input id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} autoComplete="off" /></label>
        <button className="btn" type="submit" disabled={!s}>Add</button>
      </form>
      {hits.length > 0 && (
        <ul className="sugg" role="listbox" aria-label="Suggestions">
          {hits.map((c) => <li key={c.id}><button role="option" aria-selected="false" onClick={() => { onIngredient(c); setQ('') }}><span>{c.name}</span><span className="muted small">{c.category}</span></button></li>)}
          {onText && <li><button onClick={() => { onText(q.trim()); setQ('') }}><span>Add “{q.trim()}” as written</span><span className="muted small">Other</span></button></li>}
        </ul>
      )}
    </div>
  )
}

function AmountFields({ c, qty, setQty, idp }: { c?: CatalogItem; qty: number | undefined; setQty: (v: number | undefined) => void; idp: string }) {
  const units = unitsFor(c)
  const [unit, setUnit] = useState(units[0]?.id ?? 'each')
  const u = units.find((x) => x.id === unit) ?? units[0]
  const shown = qty != null && u ? Math.round((qty / u.factor) * 100) / 100 : ''
  if (!c) return null
  return (
    <div className="fields">
      <label className="field" htmlFor={`${idp}-q`}><span>Amount</span><span className="inp"><input id={`${idp}-q`} type="number" inputMode="decimal" step="any" value={shown} onChange={(e) => setQty(e.target.value === '' ? undefined : Number(e.target.value) * (u?.factor ?? 1))} /><em>{u?.label}</em></span></label>
      {units.length > 1 && <div className="fieldset"><span className="fl">Unit</span><Seg label="Unit" value={unit} onChange={setUnit} options={units.map((x) => [x.id, x.label] as [string, string])} /></div>}
    </div>
  )
}

function ListView({ lib, derived }: { lib: Library; derived: Derived }) {
  const { grocery: g, updateGrocery, pantry, updatePantry, partners, me, personal, toast } = useStore()
  const [edit, setEdit] = useState<ListItem | null>(null)
  const partner = partners.find((x) => x.weekOf === personal.plan.weekOf) ?? null
  const needs = [{ who: who(me.profile), items: myGrocery(lib, derived) }, ...(partner ? [{ who: who(partner.profile), items: partner.grocery }] : [])]
  const { rows, staplesToCheck } = buildList(lib, needs, g, pantry)
  const toBuy = rows.filter((r) => !r.checked), bought = rows.filter((r) => r.checked)
  const cats = CATEGORY_ORDER.filter((c) => toBuy.some((r) => r.category === c))
  const addItem = (it: Omit<ListItem, 'id' | 'addedBy' | 'at'>) => { updateGrocery((x) => ({ ...x, items: [...x.items, { ...it, id: rid(), addedBy: me.profile, at: new Date().toISOString() }] })); toast(`Added ${it.text}`) }
  const toggle = (k: string) => updateGrocery((x) => ({ ...x, checked: { ...x.checked, [k]: !x.checked[k] } }))
  const putAway = (rs: ListRow[]) => {
    updatePantry((p) => {
      const items = { ...p.items }
      for (const r of rs) if (r.ingredientId) {
        const cur = items[r.ingredientId]
        items[r.ingredientId] = r.staple ? { qty: cur?.qty ?? 0, have: true, at: new Date().toISOString() } : { ...(cur ?? {}), qty: (cur?.qty ?? 0) + boughtAmount(lib, r), at: new Date().toISOString() }
      }
      return { items }
    })
    const ids = new Set(rs.flatMap((r) => r.itemIds)), keys = new Set(rs.map((r) => r.key))
    updateGrocery((x) => ({ checked: Object.fromEntries(Object.entries(x.checked).filter(([k]) => !keys.has(k))), items: x.items.filter((i) => !ids.has(i.id)) }))
    toast(rs.length === 1 ? `${rs[0].name} put away` : `${rs.length} items put away`)
  }
  const text = () => cats.flatMap((c) => [c, ...toBuy.filter((r) => r.category === c).map((r) => `- ${r.name}${r.buy ? `: ${r.buy}` : ''}`)]).join('\n')
  const row = (r: ListRow) => (
    <li key={r.key}>
      <div className={`gi${r.checked ? ' on' : ''}`}>
        <label className="gi-check" htmlFor={`g-${r.key}`}>
          <input type="checkbox" id={`g-${r.key}`} checked={r.checked} onChange={() => toggle(r.key)} />
          <span className="box" aria-hidden="true"><Icon name="check" size={18} /></span>
          <span className="sr">{r.name}</span>
        </label>
        <button className="gi-main linkish" onClick={() => { const it = g.items.find((i) => r.itemIds.includes(i.id)); setEdit(it ?? { id: '', ingredientId: r.ingredientId, text: r.name, addedBy: me.profile, at: '' }) }}>
          <span className="gi-name">{r.name}</span>
          <span className="gi-use">{[needs.length > 1 && r.who.length ? r.who.join(' and ') : '', r.detail].filter(Boolean).join(': ')}</span>
        </button>
        <span className="gi-buy">{r.buy}</span>
      </div>
    </li>
  )
  return (
    <>
      <header className="view-head row">
        <h1>Shopping list<span className="sub num">{toBuy.length ? `${toBuy.length} to buy${bought.length ? `, ${bought.length} in the cart` : ''}` : bought.length ? `${bought.length} in the cart` : 'Nothing to buy'}</span></h1>
        <div className="head-actions"><button className="btn ghost" onClick={() => copyText(text(), toast, 'Copied the list')} disabled={!toBuy.length}><Icon name="copy" size={18} />Copy list</button></div>
      </header>
      <QuickAdd lib={lib} id="list-add" placeholder="Add an item, e.g. chicken thighs or paper towels"
        onIngredient={(c) => addItem({ ingredientId: c.id, text: c.name })} onText={(t) => addItem({ text: t })} />
      <div className="shop-cols">
        {cats.map((c) => (
          <section key={c} className="cat"><h2>{c}</h2><ul>{toBuy.filter((r) => r.category === c).map(row)}</ul></section>
        ))}
        {staplesToCheck.length > 0 && (
          <section className="cat pantry">
            <h2>Check you have these</h2>
            <p className="muted small">Spices and oils this week's meals use. Tell Gather once and it remembers in the pantry.</p>
            <ul>
              {staplesToCheck.map((i) => (
                <li key={i.id} className="staple">
                  <span className="gi-main"><span className="gi-name">{i.name}</span><span className="gi-use">{i.amount} this week</span></span>
                  <span className="row-btns">
                    <button className="btn small-btn" onClick={() => updatePantry((p) => ({ items: { ...p.items, [i.id]: { qty: 0, have: true, at: new Date().toISOString() } } }))}>Have it</button>
                    <button className="btn ghost small-btn" onClick={() => updatePantry((p) => ({ items: { ...p.items, [i.id]: { qty: 0, have: false, at: new Date().toISOString() } } }))}>Need it</button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {bought.length > 0 && (
          <section className="cat bought">
            <div className="h-row"><h2>In the cart</h2><button className="btn primary small-btn" onClick={() => putAway(bought)}>Put all away</button></div>
            <p className="muted small">Putting things away adds them to the pantry, so meals use what you have before asking you to buy more.</p>
            <ul>{bought.map((r) => (
              <li key={r.key} className="bought-row">
                {row(r)}
                <button className="btn ghost small-btn" onClick={() => putAway([r])}>{r.ingredientId ? 'Put away' : 'Remove'}</button>
              </li>
            ))}</ul>
          </section>
        )}
      </div>
      {!rows.length && !staplesToCheck.length && <p className="empty">Add items above, or plan meals and what they need shows up here.</p>}
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.text ?? ''}>
        {edit && <ListItemForm lib={lib} item={edit} onDone={() => setEdit(null)} />}
      </Sheet>
    </>
  )
}

function ListItemForm({ lib, item, onDone }: { lib: Library; item: ListItem; onDone: () => void }) {
  const { updateGrocery, me } = useStore()
  const c = item.ingredientId ? lib.catalog[item.ingredientId] : undefined
  const [qty, setQty] = useState<number | undefined>(item.qty)
  const [note, setNote] = useState(item.note ?? '')
  const [text, setText] = useState(item.text)
  const isNew = !item.id
  const save = () => {
    updateGrocery((x) => {
      const v: ListItem = { ...item, id: item.id || rid(), text: text.trim() || item.text, qty, note: note.trim() || undefined, addedBy: item.addedBy ?? me.profile, at: item.at || new Date().toISOString() }
      return { ...x, items: isNew ? [...x.items, v] : x.items.map((i) => (i.id === item.id ? v : i)) }
    })
    onDone()
  }
  return (
    <div className="ing-form">
      {!c && <label className="field" htmlFor="li-text"><span>Item</span><span className="inp"><input id="li-text" value={text} onChange={(e) => setText(e.target.value)} /></span></label>}
      {c && <p className="small">{isNew ? 'Meals need this. Add extra on top of what they need:' : `Added by ${who(item.addedBy)}.`}</p>}
      <AmountFields c={c} qty={qty} setQty={setQty} idp="li" />
      {c && pkgOf(lib, c.id) && <p className="muted small">Sold as {pkgOf(lib, c.id)!.one}{pkgOf(lib, c.id)!.label ? ` (${pkgOf(lib, c.id)!.label})` : ''}. Leave the amount empty for one.</p>}
      <label className="field" htmlFor="li-note"><span>{c ? 'Note' : 'Amount or note'}</span><span className="inp"><input id="li-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={c ? 'Brand, size' : '2 packs'} /></span></label>
      <div className="btn-grid">
        <button className="btn primary" onClick={save}>{isNew ? 'Add to list' : 'Save'}</button>
        {!isNew && <button className="btn ghost" onClick={() => { updateGrocery((x) => ({ ...x, items: x.items.filter((i) => i.id !== item.id) })); onDone() }}>Remove from list</button>}
      </div>
    </div>
  )
}

/* ---------------- Pantry ---------------- */
function PantryView({ lib }: { lib: Library }) {
  const { pantry, updatePantry, toast } = useStore()
  const [edit, setEdit] = useState<string | null>(null)
  const entries = Object.entries(pantry.items).filter(([id]) => lib.catalog[id])
  const stocked = entries.filter(([id, e]) => !lib.catalog[id].pantry && e.qty > 0)
  const staples = entries.filter(([id]) => lib.catalog[id].pantry)
  const cats = CATEGORY_ORDER.filter((c) => stocked.some(([id]) => lib.catalog[id].category === c))
  const step = (id: string) => { const c = lib.catalog[id]; const pk = pkgOf(lib, id); return c.basis === 'count' ? 1 : pk && !pk.each ? pk.size / 4 : c.basis === 'g' ? 113.4 : 120 }
  const bump = (id: string, d: number) => updatePantry((p) => {
    const cur = p.items[id], qty = Math.max(0, (cur?.qty ?? 0) + d)
    const items = { ...p.items }
    if (qty <= 0.5) delete items[id]; else items[id] = { ...(cur ?? {}), qty, at: new Date().toISOString() }
    return { items }
  })
  return (
    <>
      <header className="view-head"><h1>Pantry<span className="sub">{stocked.length ? `${stocked.length} item${stocked.length > 1 ? 's' : ''} on hand, shared with ${'Jen and Tanner'}` : 'Shared by both of you'}</span></h1></header>
      <QuickAdd lib={lib} id="pantry-add" placeholder="Add what you have, e.g. jasmine rice" onIngredient={(c) => setEdit(c.id)} />
      {!stocked.length && !staples.length && <p className="empty">Nothing here yet. Put groceries away from the shopping list, or add what's already in your kitchen. Recipes you can make show up under Recipes, Can make now.</p>}
      <div className="shop-cols">
        {cats.map((cat) => (
          <section key={cat} className="cat">
            <h2>{cat}</h2>
            <ul>
              {stocked.filter(([id]) => lib.catalog[id].category === cat).sort((a, b) => lib.catalog[a[0]].name.localeCompare(lib.catalog[b[0]].name)).map(([id, e]) => (
                <li key={id} className="pan-row">
                  <button className="gi-main linkish" onClick={() => setEdit(id)}><span className="gi-name">{lib.catalog[id].name}</span><span className="gi-use num">{household(lib, id, e.qty)}</span></button>
                  <span className="stepper">
                    <button className="icon-btn" aria-label={`Less ${lib.catalog[id].name}`} onClick={() => bump(id, -step(id))}><Icon name="minus" size={18} /></button>
                    <button className="icon-btn" aria-label={`More ${lib.catalog[id].name}`} onClick={() => bump(id, step(id))}><Icon name="plus" size={18} /></button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {staples.length > 0 && (
          <section className="cat">
            <h2>Spices and oils</h2>
            <ul>
              {staples.sort((a, b) => lib.catalog[a[0]].name.localeCompare(lib.catalog[b[0]].name)).map(([id, e]) => (
                <li key={id} className="pan-row">
                  <span className="gi-main"><span className="gi-name">{lib.catalog[id].name}</span><span className={`gi-use ${e.have ? '' : 's-under'}`}>{e.have ? 'Have it' : 'Out, on the list'}</span></span>
                  <button className="btn ghost small-btn" onClick={() => { updatePantry((p) => ({ items: { ...p.items, [id]: { ...e, have: !e.have, at: new Date().toISOString() } } })); toast(e.have ? 'Marked out. Added to the list.' : 'Marked as have') }}>{e.have ? 'Ran out' : 'Have it'}</button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit ? lib.catalog[edit]?.name ?? '' : ''}>
        {edit && <PantryForm lib={lib} id={edit} onDone={() => setEdit(null)} />}
      </Sheet>
    </>
  )
}

function PantryForm({ lib, id, onDone }: { lib: Library; id: string; onDone: () => void }) {
  const { pantry, updatePantry } = useStore()
  const c = lib.catalog[id]
  const cur = pantry.items[id]
  const [qty, setQty] = useState<number | undefined>(cur?.qty || undefined)
  if (c.pantry) return (
    <div className="ing-form">
      <p className="small">{c.name} is a staple, tracked as have or out.</p>
      <div className="btn-grid">
        <button className="btn primary" onClick={() => { updatePantry((p) => ({ items: { ...p.items, [id]: { qty: 0, have: true, at: new Date().toISOString() } } })); onDone() }}>Have it</button>
        <button className="btn ghost" onClick={() => { updatePantry((p) => ({ items: { ...p.items, [id]: { qty: 0, have: false, at: new Date().toISOString() } } })); onDone() }}>Out</button>
      </div>
    </div>
  )
  return (
    <div className="ing-form">
      <p className="small">How much is in the kitchen now{cur?.qty ? `. Gather has ${household(lib, id, cur.qty)}` : ''}.</p>
      <AmountFields c={c} qty={qty} setQty={setQty} idp="pf" />
      <div className="btn-grid">
        <button className="btn primary" onClick={() => { updatePantry((p) => { const items = { ...p.items }; if (!qty || qty <= 0) delete items[id]; else items[id] = { ...(items[id] ?? {}), qty, at: new Date().toISOString() }; return { items } }); onDone() }}>Save</button>
        {cur && <button className="btn ghost" onClick={() => { updatePantry((p) => { const items = { ...p.items }; delete items[id]; return { items } }); onDone() }}>Used up</button>}
      </div>
    </div>
  )
}
