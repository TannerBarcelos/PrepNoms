import { useEffect, useState } from 'react'
import type { Day, ProfileId, Targets } from './types'
import { DAYS, DAY_NAME } from './types'
import type { Library } from './data'
import type { Derived } from './engine'
import { foodnoms, mergeGrocery, myGrocery } from './engine'
import { useStore, saveFile } from './store'
import { Seg } from './ui'
import { readPref, setPref, detectPlatform, type PlatformPref } from './platform'
import { who } from './views'

export function Settings({ lib, derived }: { lib: Library; derived: Derived }) {
  const { personal, update, toast, sync, mode, me, recipes, catalogEdits, restore } = useStore()
  const p = personal.plan
  const t = p.targets
  const setPlan = (fn: (pl: typeof p) => typeof p) => update((s) => ({ ...s, plan: fn(s.plan) }))
  const setT = (k: keyof Targets, v: string) => setPlan((pl) => {
    const n = v === '' ? undefined : Number(v)
    return { ...pl, targets: { ...pl.targets, [k]: k === 'lunchShare' && n != null ? n / 100 : n } }
  })
  const [look, setLook] = useState<PlatformPref>(readPref)
  const [importText, setImportText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const doImport = async (txt: string) => {
    try {
      const b = JSON.parse(txt)
      if (b?.schema !== 'gather.backup' || b.version !== 3 || !b.personal?.plan || !b.recipes) { setErr("That file isn't a Gather backup from this version. Save one from this page first."); return }
      await restore({ personal: b.personal, recipes: b.recipes, catalog: b.catalog ?? {} }); setErr(null); setImportText(''); toast('Backup restored')
    } catch { setErr("That text isn't valid JSON. Paste the whole backup file.") }
  }
  const num = (id: string, label: string, val: number | undefined, unit: string, onChange: (v: string) => void) => (
    <label className="field" htmlFor={id}><span>{label}</span><span className="inp"><input id={id} type="number" inputMode="decimal" value={val ?? ''} onChange={(e) => onChange(e.target.value)} /><em>{unit}</em></span></label>
  )
  const plan = () => ({
    schema: 'gather.plan', version: 3, profile: me.profile, weekOf: p.weekOf, targets: derived.targets,
    days: derived.days.map((d) => ({ day: d.day, totals: d.totals, entries: d.entries.map((e) => ({ slot: e.slot, name: e.name, recipeId: e.recipeId, mode: e.mode, macro: e.macro, ingredients: e.recipeId ? foodnoms(lib, lib.recipes[e.recipeId], derived.formulas[e.recipeId], ', ') : undefined })) })),
  })
  const syncText = { local: 'Saved on this device only. Open Gather from claude.ai to sync.', saving: 'Saving…', synced: 'Saved and synced.', offline: "Offline. Changes are kept here and will save when the connection returns.", readonly: "Your access is view-only, so changes aren't saved." }[sync]
  return (
    <div className="view settings">
      <header className="view-head"><h1>Targets and data<span className="sub">{who(me.profile)}{mode === 'cloud' ? ', private to you' : ''}</span></h1></header>
      <div className="set-grid">
        <section className="panel">
          <h2>Daily targets</h2>
          <label className="switch"><input type="checkbox" id="t-on" checked={p.targetsOn} onChange={(e) => setPlan((pl) => ({ ...pl, targetsOn: e.target.checked }))} /><span>Portion meals to these targets</span></label>
          <div className="fields">
            {num('t-kcal', 'Calories', t.caloriesKcal, 'Cal', (v) => setT('caloriesKcal', v))}
            {num('t-pro', 'Protein, at least', t.proteinMinG, 'g', (v) => setT('proteinMinG', v))}
            {num('t-pmax', 'Protein, ideally under', t.proteinPreferredMaxG, 'g', (v) => setT('proteinPreferredMaxG', v))}
            {num('t-carb', 'Carbs, at most', t.carbsMaxG, 'g', (v) => setT('carbsMaxG', v))}
            {num('t-fat', 'Fat, about', t.fatTargetG, 'g', (v) => setT('fatTargetG', v))}
            {num('t-tol', 'Calorie tolerance', t.tolerancePct, '%', (v) => setT('tolerancePct', v))}
            {num('t-share', 'Lunch share of meals', Math.round(t.lunchShare * 100), '%', (v) => setT('lunchShare', v))}
            {num('t-min', 'Smallest meal', t.minMealKcal, 'Cal', (v) => setT('minMealKcal', v))}
          </div>
          <p className="muted small">Match these to the goals in your calorie tracker. A lunch share under 50% makes dinner the bigger meal.</p>
        </section>

        <section className="panel">
          <h2>Prep day</h2>
          <label className="field" htmlFor="s-pd"><span>Meals you prep ahead are cooked on</span>
            <select id="s-pd" value={p.prepDay ?? 'sun'} onChange={(e) => setPlan((pl) => ({ ...pl, prepDay: e.target.value as Day }))}>{DAYS.map((d) => <option key={d} value={d}>{DAY_NAME[d]}</option>)}</select>
          </label>
          <p className="muted small">Gather asks about prepping when a meal is planned on two or more days.</p>
        </section>
        {mode === 'cloud' && me.isOwner && <People />}
        {mode === 'cloud' && !me.isOwner && (
          <section className="panel"><h2>Your account</h2><p className="small">You're signed in as {who(me.profile)}. Your recipes, ingredients, targets and ticks are private to you. Your planned meal names and grocery needs are shared so the calendar and list work for both of you.</p></section>
        )}

        <section className="panel">
          <h2>Look</h2>
          <Seg label="Look" value={look} onChange={(v) => { setLook(v); setPref(v) }} options={[['auto', 'Match device'], ['ios', 'iOS'], ['android', 'Android'], ['desktop', 'Desktop']]} />
          <p className="muted small">This device looks like {({ ios: 'an Apple device', android: 'an Android device', desktop: 'a computer' } as const)[detectPlatform()]}. The choice is saved on this device only.</p>
        </section>

        <section className="panel">
          <h2>Export and backup</h2>
          <p className="small">{syncText}</p>
          <div className="btn-grid">
            <button className="btn" onClick={() => saveFile(`${me.profile}-plan-${p.weekOf}.json`, plan(), toast)}>Export this week's plan</button>
            <button className="btn" onClick={() => saveFile(`grocery-${p.weekOf}.json`, { schema: 'gather.grocery', version: 3, items: mergeGrocery(lib, [{ who: who(me.profile), items: myGrocery(lib, derived) }]) }, toast)}>Export my grocery needs</button>
            <button className="btn" onClick={() => saveFile(`${me.profile}-recipes.json`, { schema: 'gather.recipes', version: 3, recipes: Object.values(recipes) }, toast)}>Export my recipes</button>
            <button className="btn" onClick={() => saveFile(`gather-backup-${me.profile}.json`, { schema: 'gather.backup', version: 3, personal, recipes, catalog: catalogEdits }, toast)}>Save full backup</button>
          </div>
          <h3>Restore a backup</h3>
          <input id="imp-file" type="file" accept="application/json,.json" onChange={async (e) => { const f = e.target.files?.[0]; if (f) doImport(await f.text()) }} />
          <textarea id="imp-text" rows={3} placeholder="Or paste backup JSON here" value={importText} onChange={(e) => setImportText(e.target.value)} />
          {err && <p className="err" role="alert">{err}</p>}
          <button className="btn" disabled={!importText.trim()} onClick={() => doImport(importText)}>Restore pasted backup</button>
        </section>
      </div>
    </div>
  )
}

/* Owner only: approve or remove the people who can use Gather. */
function People() {
  const { members, requests, setMember, nameOf, me } = useStore()
  const [names, setNames] = useState<Record<string, string>>({})
  const ids = [...new Set([...Object.keys(members), ...requests.map((r) => r.id)])]
  const idKey = ids.join(',')
  useEffect(() => { if (ids.length) nameOf(ids).then(setNames) }, [idKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const pending = requests.filter((r) => !members[r.id])
  const label = (id: string) => (id === me.id ? 'You' : names[id] || 'Someone')
  const jenTaken = Object.entries(members).some(([id, m]) => id !== me.id && m.profile === 'jen' && m.status === 'approved')
  return (
    <section className="panel">
      <h2>People</h2>
      <p className="muted small">Only people listed here as approved can use Gather. Share it on claude.ai with Jen's account only, as an Editor, and never by public link.</p>
      {pending.length > 0 && <h3>Waiting for you</h3>}
      <ul className="people">
        {pending.map((r) => (
          <li key={r.id}>
            <span><b>{label(r.id)}</b><span className="muted small"> asked {r.at ? new Date(r.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'recently'}</span></span>
            <span className="row-btns">
              <button className="btn primary" disabled={jenTaken} onClick={() => setMember(r.id, { profile: 'jen' as ProfileId, status: 'approved', at: new Date().toISOString() })}>Approve as Jen</button>
              <button className="btn ghost" onClick={() => setMember(r.id, { profile: 'jen' as ProfileId, status: 'blocked', at: new Date().toISOString() })}>Block</button>
            </span>
          </li>
        ))}
        {Object.entries(members).map(([id, m]) => (
          <li key={id}>
            <span><b>{label(id)}</b><span className="muted small"> {m.status === 'blocked' ? 'blocked' : `approved as ${who(m.profile)}`}</span></span>
            {id !== me.id && <span className="row-btns">{m.status === 'blocked'
              ? <button className="btn ghost" onClick={() => setMember(id, null)}>Unblock</button>
              : <button className="btn ghost" onClick={() => setMember(id, { ...m, status: 'blocked' })}>Remove access</button>}</span>}
          </li>
        ))}
      </ul>
      {pending.length === 0 && Object.keys(members).length <= 1 && <p className="small">Nobody else yet. When Jen opens Gather, she'll show up here for you to approve.</p>}
    </section>
  )
}
