const TOKEN_KEY = 'agb_token'

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}
export function setToken(t: string | null) {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY) } catch { /* sin almacenamiento */ }
}

export class ApiError extends Error {
  status: number
  fields: Record<string, string>
  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message); this.status = status; this.fields = fields
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 25000)
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = \`Bearer \${token}\`
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  try {
    const res = await fetch(path, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    })
    if (res.headers.get('x-agb-offline')) {
      // Respuesta guardada por el modo sin conexión (service worker): avisar a la interfaz.
      window.dispatchEvent(new CustomEvent('agb-offline', { detail: res.headers.get('x-agb-cached-at') }))
    }
    let data: any = null
    try {
      data = await res.json()
    } catch (e) {
      // Un cuerpo lento también forma parte del timeout; no ocultar un aborto durante su lectura.
      if ((e as Error).name === 'AbortError') throw e
    }
    if (!res.ok) {
      if (res.status === 401 && token) setToken(null)
      const fields: Record<string, string> = {}
      for (const e of data?.errors ?? []) fields[e.field] = e.message
      throw new ApiError(res.status, typeof data?.detail === 'string' ? data.detail : 'Ocurrió un problema. Intente de nuevo.', fields)
    }
    return data as T
  } catch (e) {
    if (e instanceof ApiError) throw e
    throw new ApiError(0, (e as Error).name === 'AbortError'
      ? 'La conexión está muy lenta. Intente de nuevo en un momento.'
      : 'No hay conexión con AgroBolivia. Revise su internet e intente de nuevo.')
  } finally {
    clearTimeout(timer)
  }
}
