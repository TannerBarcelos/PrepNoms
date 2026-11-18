import { useEffect, useMemo, useState } from 'react'
import { buildLibrary } from './data'
import { derive, summarize } from './engine'
import { StoreCtx, useStore, useStoreValue } from './store'
import { Icon } from './ui'
import { Today, Plan, Prep, RecipeList, RecipeView, type Nav } from './views'
import { Shop } from './shop'
import { PrepPrompt } from './prompt'
import { detectForm } from './platform'
import { RecipeEditor, IngredientsView } from './editor'
import { Settings } from './settings'

const TABS = [['today', 'Today'], ['plan', 'Plan'], ['prep', 'Prep'], ['shop', 'Shop'], ['recipes', 'Recipes']] as const
type Tab = (typeof TABS)[number][0] | 'settings' | 'ingredients'
const readHash = (): Tab => { const h = location.hash.slice(1); return (TABS.some(([k]) => k === h) || h === 'settings' || h === 'ingredients' ? h : 'today') as Tab }

export default function App() {
  const store = useStoreValue()
  if (!store) return <div className="boot"><p className="muted">Loading Gather…</p></div>
  return <StoreCtx.Provider value={store}><Gate /></StoreCtx.Provider>
}

function Gate() {
  const { phase } = useStore()
  if (phase.k === 'loading') return <div className="boot"><p className="muted">Checking your access…</p></div>
  if (phase.k === 'error') return <div className="boot"><p className="err">{phase.msg}</p></div>
  if (phase.k === 'waiting') return (
    <div className="boot gate">
      <h1>Gather</h1>
      {phase.why === 'pending' && <p>This is a private meal planner. Tanner needs to approve you before you can use it. Your request has been sent; this page opens by itself once he does.</p>}
      {phase.why === 'readonly' && <p>This is a private meal planner, and your access is view-only. Ask Tanner to share it with you as an Editor, then reload.</p>}
      {phase.why === 'blocked' && <p>This is a private meal planner, and it isn't available to your account.</p>}
    </div>
  )
  if (phase.k === 'seeding') return (
    <div className="boot gate">
      <h1>Setting up your recipes</h1>
      <p className="muted">Copying {phase.total} recipes into your private library. This happens once.</p>
      <div className="kbar" aria-hidden="true"><i className="k-eat" style={{ width: `${phase.total ? (phase.done / phase.total) * 100 : 0}%` }} /></div>
      <p className="num small">{phase.done} of {phase.total}</p>
    </div>
  )
  return <Shell />
}

function Shell() {
  const { base, catalogEdits, recipes, personal, me, mode, publish, toastMsg, sync } = useStore()
  const [tab, setTab] = useState<Tab>(readHash)
  const [recipe, setRecipe] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string | null; copyFrom?: string } | null>(null)
  const wide = useWide()
  useEffect(() => { const f = () => { setTab(readHash()); setRecipe(null); setEditing(null) }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  const lib = useMemo(() => buildLibrary(base, catalogEdits, recipes), [base, catalogEdits, recipes])
  const derived = useMemo(() => derive(lib, personal.plan), [lib, personal.plan])
  const imported = base.missing.includes(me.profile) || Object.keys(recipes).length > 0
  useEffect(() => { if (mode === 'cloud') publish(summarize(lib, me, personal.plan, derived, imported)) }, [mode, lib, me, personal.plan, derived, imported, publish])
  const go = (t: string) => { setRecipe(null); setEditing(null); if (location.hash.slice(1) !== t) location.hash = t; else setTab(t as Tab); window.scrollTo(0, 0) }
  const nav: Nav = {
    openRecipe: (id) => { setEditing(null); setRecipe(id); if (tab !== 'recipes' || !wide) window.scrollTo(0, 0) },
    go,
    edit: (id, copyFrom) => { setEditing({ id, copyFrom }); window.scrollTo(0, 0) },
  }
  const doneEditing = (savedId: string | null) => { setEditing(null); if (savedId) setRecipe(savedId); window.scrollTo(0, 0) }
  const showDetail = recipe && !(tab === 'recipes' && wide)
  let body
  if (editing) body = <RecipeEditor key={`${editing.id}-${editing.copyFrom}`} lib={lib} id={editing.id} copyFrom={editing.copyFrom} onDone={doneEditing} />
  else if (showDetail) body = <RecipeView lib={lib} derived={derived} id={recipe!} onBack={() => setRecipe(null)} showBack nav={nav} />
  else if (tab === 'today') body = <Today lib={lib} derived={derived} nav={nav} />
  else if (tab === 'plan') body = <Plan lib={lib} derived={derived} nav={nav} />
  else if (tab === 'prep') body = <Prep lib={lib} derived={derived} nav={nav} />
  else if (tab === 'shop') body = <Shop lib={lib} derived={derived} />
  else if (tab === 'settings') body = <Settings lib={lib} derived={derived} />
  else if (tab === 'ingredients') body = <IngredientsView lib={lib} onBack={() => go('recipes')} />
  else body = (
    <div className="split">
      <RecipeList lib={lib} derived={derived} nav={nav} selected={recipe} />
      {wide && <div className="split-detail">{recipe ? <RecipeView lib={lib} derived={derived} id={recipe} onBack={() => setRecipe(null)} showBack={false} nav={nav} /> : <p className="empty pane-empty">Pick a recipe to see its portions, steps and Foodnoms copy.</p>}</div>}
    </div>
  )
  return (
    <div className="shell">
      <header className="top">
        <a className="brand" href="#today" aria-label="Gather, today">Gather</a>
        <span className={`who-chip${sync === 'readonly' || sync === 'offline' ? ' warn' : ''}`} title={sync}>{me.profile === 'tanner' ? 'Tanner' : 'Jen'}{sync === 'saving' ? ', saving' : sync === 'offline' ? ', offline' : sync === 'readonly' ? ', view only' : ''}</span>
        <button className={`icon-btn${tab === 'settings' && !editing ? ' on' : ''}`} aria-label="Targets and data" onClick={() => go('settings')}><Icon name="settings" /></button>
      </header>
      <main className={`main t-${tab}`} id="main">{body}</main>
      <nav className="tabs" aria-label="Sections">
        {TABS.map(([k, l]) => (
          <a key={k} href={`#${k}`} className={tab === k || (k === 'recipes' && tab === 'ingredients') ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={(e) => { e.preventDefault(); go(k) }}>
            <Icon name={k} /><span>{l}</span>
          </a>
        ))}
      </nav>
      <PrepPrompt lib={lib} />
      <div className="toast" role="status" aria-live="polite">{toastMsg && <span>{toastMsg}</span>}</div>
    </div>
  )
}

/* Two panes only on tablets and computers; phones (the Duo included) stay one column. */
function useWide() {
  const q = '(min-width: 640px)'
  const phone = detectForm() === 'phone'
  const [w, setW] = useState(() => !phone && matchMedia(q).matches)
  useEffect(() => { const m = matchMedia(q), f = () => setW(!phone && m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f) }, [])
  return w
}

