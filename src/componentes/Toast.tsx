import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

const ToastCtx = createContext<(msg: string) => void>(() => {})

/** Mensaje corto que aparece abajo unos segundos ("Insumo guardado"). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<number>(undefined)
  const mostrar = useCallback((m: string) => {
    setMsg(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(null), Math.min(7000, 2500 + m.length * 40))
  }, [])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <ToastCtx.Provider value={mostrar}>
      {children}
      <div className="toast" role="status" aria-live="polite" hidden={!msg}>{msg}</div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
