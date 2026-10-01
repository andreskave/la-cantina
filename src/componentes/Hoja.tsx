import { useEffect, useRef, type ReactNode } from 'react'
import { Icono } from './Icono'

// Hoja que sube desde abajo para editar (patrón del prototipo).
export function Hoja({ titulo, onCerrar, children, pie }: {
  titulo: string
  onCerrar: () => void
  children: ReactNode
  pie?: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null
    document.body.classList.add('lock')
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.classList.remove('lock')
      window.removeEventListener('keydown', onKey)
      previo?.focus()
    }
  }, [onCerrar])

  return (
    <div className="sheet">
      <div className="scrim" onClick={onCerrar} />
      <div className="panel" role="dialog" aria-modal="true" aria-label={titulo} tabIndex={-1} ref={panel}>
        <div className="sh-head">
          <h2>{titulo}</h2>
          <button className="iconbtn" onClick={onCerrar} aria-label="Cerrar"><Icono nombre="x" /></button>
        </div>
        <div className="sh-body">{children}</div>
        {pie && <div className="sh-foot">{pie}</div>}
      </div>
    </div>
  )
}
