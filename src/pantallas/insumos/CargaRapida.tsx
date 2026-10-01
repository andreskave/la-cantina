import { useMemo, useState } from 'react'
import { Hoja } from '../../componentes/Hoja'
import { CampoNumero, pesosACent, textoNumero } from '../../componentes/Controles'
import { useToast } from '../../componentes/Toast'
import { useGuardarInsumos, useInsumos } from '../../datos/consultas'
import { CATEGORIAS, UNIDADES_COMPRA, type Categoria } from '../../lib/catalogo'
import { claveNombre, estadoFila, filaVacia, parseNumeroUY, parsePegado, type FilaCarga } from '../../lib/cargaRapida'
import { mensajeError } from '../../lib/errores'
import type { Unidad } from '../../lib/costeo'
import type { InsumoGuardar } from '../../datos/tipos'
import { AvisoSinConexion, useEnLinea } from '../../offline/Conexion'

const COLOR = { nuevo: 'var(--ok)', actualiza: 'var(--ink)', falta_cantidad: 'var(--warn)', falta_precio: 'var(--warn)' } as const

export function CargaRapida({ onCerrar }: { onCerrar: () => void }) {
  const toast = useToast()
  const enLinea = useEnLinea()
  const insumos = useInsumos()
  const guardar = useGuardarInsumos()
  const [filas, setFilas] = useState<FilaCarga[]>(() => Array.from({ length: 5 }, filaVacia))
  const [pegado, setPegado] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const existentes = useMemo(() => new Map((insumos.data ?? []).map((i) => [claveNombre(i.nombre), i.id])), [insumos.data])
  const estados = filas.map((f) => estadoFila(f, existentes))
  const listas = estados.filter((e) => e.tipo === 'nuevo' || e.tipo === 'actualiza').length
  const incompletas = estados.filter((e) => e.tipo === 'falta_cantidad' || e.tipo === 'falta_precio').length

  const cambiar = (i: number, cambios: Partial<FilaCarga>) =>
    setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, ...cambios, ...(cambios.unidad ? { unidadDudosa: false } : {}) } : f)))

  function pasarATabla() {
    const conComa = (t: string) => (t ? textoNumero(parseNumeroUY(t), 2) : '')
    const nuevas = parsePegado(pegado).map((f) => ({ ...f, cantidad: conComa(f.cantidad), precio: conComa(f.precio), venta: conComa(f.venta) }))
    if (!nuevas.length) {
      setError('No encontré filas para pasar. Revisá el formato: Nombre, Cantidad, Unidad y Precio.')
      return
    }
    setError(null)
    setFilas((fs) => [...fs.filter((f) => f.nombre.trim()), ...nuevas])
    setPegado('')
    setAbierto(false)
    toast(`${nuevas.length} fila${nuevas.length > 1 ? 's' : ''} lista${nuevas.length > 1 ? 's' : ''} para revisar`)
  }

  async function onGuardar() {
    setError(null)
    const porId = new Map((insumos.data ?? []).map((i) => [i.id, i]))
    // Si el mismo nombre aparece dos veces, vale la última fila.
    const items = new Map<string, InsumoGuardar>()
    filas.forEach((f, i) => {
      const e = estados[i]
      if (e.tipo !== 'nuevo' && e.tipo !== 'actualiza') return
      const venta = f.venta.trim() ? pesosACent(f.venta) : Number.NaN
      const base = e.tipo === 'actualiza' ? porId.get(e.existenteId!)! : null
      items.set(claveNombre(f.nombre), {
        id: base?.id,
        nombre: base?.nombre ?? f.nombre.trim(),
        categoria: base?.categoria ?? f.categoria,
        proveedor_id: base?.proveedor_id ?? null,
        merma_pct: base?.merma_pct ?? 0,
        es_reventa: (base?.es_reventa ?? false) || venta > 0,
        cantidad_compra: parseNumeroUY(f.cantidad),
        unidad_compra: f.unidad,
        precio_cent: pesosACent(f.precio),
        precio_venta_cent: venta > 0 ? venta : null,
      })
    })
    try {
      const ids = await guardar.mutateAsync([...items.values()])
      toast(`${ids.length} insumo${ids.length > 1 ? 's' : ''} guardado${ids.length > 1 ? 's' : ''}`
        + (incompletas ? ` · ${incompletas} fila${incompletas > 1 ? 's' : ''} incompleta${incompletas > 1 ? 's' : ''} sin guardar` : ''))
      onCerrar()
    } catch (e) {
      setError(`No se guardó nada. ${mensajeError(e)}`)
    }
  }

  return (
    <Hoja titulo="Carga rápida de insumos" onCerrar={onCerrar} pie={
      <>
        <button className="btn ghost" onClick={onCerrar}>Cancelar</button>
        <button className="btn" onClick={onGuardar} disabled={!listas || guardar.isPending || !enLinea}>
          {guardar.isPending ? 'Guardando…' : listas ? `Guardar ${listas} insumo${listas > 1 ? 's' : ''}` : 'Guardar'}
        </button>
      </>
    }>
      <p className="small muted">
        Completá una fila por insumo: cómo lo comprás y cuánto pagás. Si ya existe uno con el mismo nombre, se actualiza su precio.
        Lo que vendés tal cual lleva precio de venta.
      </p>

      <details className="paste" open={abierto} onToggle={(e) => setAbierto((e.target as HTMLDetailsElement).open)}>
        <summary>Pegar una lista desde Excel</summary>
        <div className="stack">
          <p className="hint">
            Copiá las columnas de Excel en este orden: <b>Nombre · Cantidad · Unidad · Precio · Categoría · Precio de venta</b> (las
            dos últimas son opcionales). También sirve una línea por insumo así: <b>Tallarines 1 kg 300</b>.
          </p>
          <textarea className="inp" value={pegado} onChange={(e) => setPegado(e.target.value)} aria-label="Lista pegada"
            placeholder={'Tallarines\t1\tkg\t300\tAlmacén\nCebolla\t1\tkg\t55\tVerdulería\nJugo 200 ml\t12\tu\t300\tBebidas\t50'} />
          <button className="btn ghost sm" onClick={pasarATabla} disabled={!pegado.trim()}>Pasar a la tabla</button>
        </div>
      </details>

      <div className="stack">
        {filas.map((f, i) => {
          const e = estados[i]
          return (
            <div className="mrow" key={i}>
              <input className="inp" placeholder="Nombre (ej: Tallarines)" aria-label="Nombre" value={f.nombre}
                onChange={(ev) => cambiar(i, { nombre: ev.target.value })} />
              <div className="g3">
                <CampoNumero valor={f.cantidad} onCambio={(t) => cambiar(i, { cantidad: t })} aria-label="Cantidad que comprás" placeholder="Cant." />
                <select className="inp" aria-label="Unidad" value={f.unidad} onChange={(ev) => cambiar(i, { unidad: ev.target.value as Unidad })}>
                  {UNIDADES_COMPRA.map((u) => <option key={u} value={u}>{u === 'u' ? 'unid.' : u}</option>)}
                </select>
                <CampoNumero valor={f.precio} onCambio={(t) => cambiar(i, { precio: t })} aria-label="Precio" placeholder="Precio $" />
              </div>
              <div className="grid2">
                <select className="inp" aria-label="Categoría" value={f.categoria} disabled={e.tipo === 'actualiza'}
                  onChange={(ev) => cambiar(i, { categoria: ev.target.value as Categoria })}>
                  {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <CampoNumero valor={f.venta} onCambio={(t) => cambiar(i, { venta: t })} aria-label="Precio de venta si lo revendés" placeholder="Venta $ (opcional)" />
              </div>
              {e.tipo !== 'vacia' && <span className="mst" style={{ color: COLOR[e.tipo] }}>{e.texto}</span>}
            </div>
          )
        })}
      </div>
      <button className="btn ghost sm" onClick={() => setFilas((fs) => [...fs, ...Array.from({ length: 5 }, filaVacia)])}>+ Agregar 5 filas</button>

      <AvisoSinConexion que="guardar insumos" />
      {error && <p className="error" role="alert">{error}</p>}
    </Hoja>
  )
}
