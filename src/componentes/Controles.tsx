import { useEffect, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { parseNumeroUY } from '../lib/cargaRapida'
import { numero } from '../lib/formato'

/** Borrado con doble toque: el primero arma el botón ("Tocá de nuevo para borrar"). */
export function BotonBorrar({ onBorrar, texto = 'Borrar', disabled }: { onBorrar: () => void; texto?: string; disabled?: boolean }) {
  const [armado, setArmado] = useState(false)
  useEffect(() => {
    if (!armado) return
    const t = window.setTimeout(() => setArmado(false), 4000)
    return () => window.clearTimeout(t)
  }, [armado])
  return (
    <button type="button" className={`btn danger${armado ? ' armed' : ''}`} disabled={disabled}
      onClick={() => (armado ? onBorrar() : setArmado(true))}>
      {armado ? 'Tocá de nuevo para borrar' : texto}
    </button>
  )
}

/** Texto que se muestra en un campo numérico a partir del valor. */
export const textoNumero = (n: number | null | undefined, decimales = 3) =>
  n === null || n === undefined || !Number.isFinite(n) ? '' : numero(n, decimales).replace(/\./g, '')

/**
 * Campo numérico que acepta formato uruguayo (1.250,50 · $ 300). Guarda el texto tal
 * cual mientras se escribe y avisa el número interpretado (NaN si está vacío o mal).
 */
export function CampoNumero({ valor, onCambio, ...resto }: {
  valor: string
  onCambio: (texto: string, n: number) => void
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <input {...resto} className={`inp num ${resto.className ?? ''}`} type="text" inputMode="decimal" autoComplete="off"
      value={valor} onChange={(e) => onCambio(e.target.value, parseNumeroUY(e.target.value))} />
  )
}

export const pesosACent = (texto: string) => {
  const n = parseNumeroUY(texto)
  return Number.isFinite(n) ? Math.round(n * 100) : Number.NaN
}

export const centATexto = (cent: number | null | undefined) =>
  cent === null || cent === undefined ? '' : numero(cent / 100, 2).replace(/\./g, '')

export function Campo({ etiqueta, htmlFor, ayuda, children }: { etiqueta: string; htmlFor?: string; ayuda?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      {htmlFor ? <label htmlFor={htmlFor}>{etiqueta}</label> : <span className="lbl">{etiqueta}</span>}
      {children}
      {ayuda && <p className="hint">{ayuda}</p>}
    </div>
  )
}

export function Segmentado<T extends string>({ opciones, valor, onCambio, etiqueta }: {
  opciones: [T, string][]
  valor: T
  onCambio: (v: T) => void
  etiqueta: string
}) {
  return (
    <div className="seg" role="group" aria-label={etiqueta}>
      {opciones.map(([v, t]) => (
        <button key={v} type="button" aria-pressed={valor === v} onClick={() => onCambio(v)}>{t}</button>
      ))}
    </div>
  )
}

export function Chips<T extends string>({ opciones, valor, onCambio, etiqueta, envolver }: {
  opciones: [T, string][]
  valor: T
  onCambio: (v: T) => void
  etiqueta: string
  /** Pasar a otra línea en vez de desplazar de costado. */
  envolver?: boolean
}) {
  return (
    <div className={envolver ? 'chips envolver' : 'chips'} role="group" aria-label={etiqueta}>
      {opciones.map(([v, t]) => (
        <button key={v} type="button" className="chip" aria-pressed={valor === v} onClick={() => onCambio(v)}>{t}</button>
      ))}
    </div>
  )
}
