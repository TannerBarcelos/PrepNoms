export type Platform = 'ios' | 'android' | 'desktop'
export type PlatformPref = Platform | 'auto'
const KEY = 'gather.platform'

export function detectPlatform(): Platform {
  const ua = navigator.userAgent
  // iPadOS reports as a Mac; touch points give it away.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}
export function readPref(): PlatformPref {
  try { const v = localStorage.getItem(KEY); return v === 'ios' || v === 'android' || v === 'desktop' ? v : 'auto' } catch { return 'auto' }
}
export function applyPlatform(pref: PlatformPref = readPref()): Platform {
  const p = pref === 'auto' ? detectPlatform() : pref
  document.documentElement.dataset.platform = p
  applyForm()
  return p
}
export function setPref(pref: PlatformPref) {
  try { if (pref === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, pref) } catch { /* noop */ }
  return applyPlatform(pref)
}

export type Form = 'phone' | 'tablet' | 'desktop'
/* One day per row on phones (the iPhone Duo included, open or closed); columns only on tablets and computers. */
export function detectForm(): Form {
  const ua = navigator.userAgent
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'tablet'
  if (/iPhone|iPod/.test(ua)) return 'phone'
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'phone' : 'tablet'
  return 'desktop'
}
export function applyForm(): Form { const f = detectForm(); document.documentElement.dataset.form = f; return f }
