(() => {
  const read = () => JSON.parse(localStorage.getItem('MOCKDB') || '{}')
  const bus = new Set()
  const fire = () => setTimeout(() => bus.forEach((f) => f()), 5)
  const write = (o) => { localStorage.setItem('MOCKDB', JSON.stringify(o)); fire() }
  addEventListener('storage', (e) => { if (e.key === 'MOCKDB') fire() })
  const uid = () => window.__uid, owner = () => window.__owner
  const visible = (p) => { const m = p.match(/^data\/users\/([^/]+)\//); return !m || m[1] === uid() }
  const canWrite = (p) => {
    const m = p.match(/^data\/users\/([^/]+)\//); if (m && m[1] !== uid()) return false
    if (p.startsWith('config/')) return owner()
    const r = p.match(/^(requests|plans)\/([^/]+)$/); if (r && r[2] !== uid()) return false
    return true
  }
  const snap = (p) => { const o = read(); const ex = visible(p) && p in o; return { id: p.split('/').pop(), exists: ex, data: () => (ex ? o[p] : undefined), metadata: { fromCache: false, hasPendingWrites: false } } }
  const qs = (path) => { const o = read(); const docs = Object.keys(o).filter((k) => k.startsWith(path + '/') && !k.slice(path.length + 1).includes('/') && visible(k)).sort().map(snap); return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false } } }
  const doc = (p) => ({ id: p.split('/').pop(), path: p,
    get: async () => snap(p),
    set: async (d) => { if (!canWrite(p)) throw { code: 'invalid_argument' }; const o = read(); o[p] = JSON.parse(JSON.stringify(d)); write(o) },
    delete: async () => { if (!canWrite(p)) throw { code: 'invalid_argument' }; const o = read(); delete o[p]; write(o) },
    onSnapshot: (n) => { const f = () => n(snap(p)); bus.add(f); setTimeout(f, 10); return () => bus.delete(f) },
    collection: (c) => coll(p + '/' + c) })
  const coll = (p) => ({ path: p, doc: (id) => doc(p + '/' + id), get: async () => qs(p), onSnapshot: (n) => { const f = () => n(qs(p)); bus.add(f); setTimeout(f, 10); return () => bus.delete(f) } })
  const db = { doc, collection: coll }
  const user = { id: async () => uid(), isOwner: () => owner(), profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: i === 'jen-7' ? 'Second person' : 'Owner' }])) }
  window.claude = { use: async (n) => (n === 'db' ? db : n === 'user' ? user : null) }
})()
