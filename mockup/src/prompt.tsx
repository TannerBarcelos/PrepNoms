import { useEffect, useState } from 'react'
import type { Library } from './data'
import { countOf, needsPrepQuestion } from './engine'
import { DAY_NAME } from './types'
import { useStore } from './store'
import { Sheet } from './ui'

/* Asks once per recipe and count: "this meal repeats this week; prep it together?" */
export function PrepPrompt({ lib }: { lib: Library }) {
  const { personal, update } = useStore()
  const p = personal.plan
  const [id, setId] = useState<string | null>(null)
  const pending = needsPrepQuestion(p, lib)
  useEffect(() => { if (!id && pending) { const t = window.setTimeout(() => setId(pending), 350); return () => window.clearTimeout(t) } }, [pending, id])
  const r = id ? lib.recipes[id] : null
  const n = id ? countOf(p, id) : 0
  const pd = DAY_NAME[p.prepDay ?? 'sun']
  const answer = (mode: 'prep' | 'fresh' | null) => {
    if (id) update((s) => ({ ...s, plan: { ...s.plan, modes: mode ? { ...s.plan.modes, [id]: mode } : s.plan.modes, modeAsked: { ...s.plan.modeAsked, [id]: countOf(s.plan, id) } } }))
    setId(null)
  }
  return (
    <Sheet open={!!r} onClose={() => answer(null)} title="Prep this ahead?">
      {r && (
        <div className="ing-form">
          <p className="lede">{r.name} is planned on {n} days this week. Cook it once on {pd} and split it into {n} containers?</p>
          <div className="btn-grid">
            <button className="btn primary" onClick={() => answer('prep')}>Prep {n} containers on {pd}</button>
            <button className="btn ghost" onClick={() => answer('fresh')}>Cook it each day</button>
          </div>
          <p className="muted small">You can change this later on the recipe page.</p>
        </div>
      )}
    </Sheet>
  )
}
