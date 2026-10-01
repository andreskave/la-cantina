import { useMemo, useState } from 'react'
import { Hoja } from '../../componentes/Hoja'
import { CampoNumero, Segmentado, centATexto, pesosACent, textoNumero } from '../../componentes/Controles'
import { useToast } from '../../componentes/Toast'
import { useCosteo, useGuardarInsumos, useInsumos, useProveedores } from '../../datos/consultas'
import { CATEGORIAS } from '../../lib/catalogo'
import { aBase } from '../../lib/costeo'
import { parseNumeroUY } from '../../lib/cargaRapida'
import { numero, pesos } from '../../lib/formato'
import { mensajeError } from '../../lib/errores'
import type { Insumo, InsumoGuardar } from '../../datos/tipos'
import { AvisoSinConexion, useEnLinea } from '../../offline/Conexion'

type Fila = { cantidad: string; precio: string }

export function ActualizarPrecios({ onCerrar }: { onCerrar: () => void }) {
  const toast = useToast()
  const enLinea = useEnLinea()
  const insumos = useInsumos()
  const proveedores = useProveedores()
  const { preciosPorInsumo } = useCosteo()
  const guardar = useGuardarInsumos()
  const [agrupar, setAgrupar] = useState<'proveedor' | 'categoria'>('proveedor')
  const [error, setError] = useState<string | null>(null)

  const activos = useMemo(() => (insumos.data ?? []).filter((i) => i.activo), [insumos.data])
  const [filas, setFilas] = useState<Record<string, Fila>>(() => Object.fromEntries(activos.map((i) => {
    const p = preciosPorInsumo.get(i.id)
    return [i.id, { cantidad: textoNumero(p?.cantidad ?? i.cantidad_compra), precio: centATexto(p?.precio_cent) }]
  })))

  const grupos = useMemo(() => {
    const nombreProv = new Map((proveedores.data ?? []).map((p) => [p.id, p.nombre]))
    const claveDe = (i: Insumo) => (agrupar === 'categoria' ? i.categoria : nombreProv.get(i.proveedor_id ?? '') ?? 'Sin proveedor')
    const orden = agrupar === 'categoria'
      ? [...CATEGORIAS]
      : [...[...nombreProv.values()].sort((a, b) => a.localeCompare(b, 'es')), 'Sin proveedor']
    const m = new Map<string, Insumo[]>()
    for (const i of activos) m.set(claveDe(i), [...(m.get(claveDe(i)) ?? []), i])
    return orden.filter((k) => m.has(k)).map((k) => [k, m.get(k)!.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))] as const)
  }, [activos, proveedores.data, agrupar])

  /** Cambio respecto del precio vigente, comparando el precio por unidad base. */
  function cambio(i: Insumo) {
    const f = filas[i.id]
    if (!f) return null
    const cant = parseNumeroUY(f.cantidad)
    const precio = pesosACent(f.precio)
    if (!(cant > 0) || !(precio > 0)) return null
    const ant = preciosPorInsumo.get(i.id)
    if (!ant) return { nuevo: true as const, cant, precio }
    if (ant.cantidad === cant && ant.precio_cent === precio) return null
    const unidad = ant.unidad
    const antes = ant.precio_cent / aBase(ant.cantidad, unidad)
    const ahora = precio / aBase(cant, unidad)
    return { nuevo: false as const, cant, precio, pct: ((ahora - antes) / antes) * 100 }
  }

  const cambiados = activos.filter((i) => cambio(i))

  async function onGuardar() {
    setError(null)
    const items: InsumoGuardar[] = cambiados.map((i) => {
      const c = cambio(i)!
      const unidad = preciosPorInsumo.get(i.id)?.unidad ?? i.unidad_compra
      return {
        id: i.id, nombre: i.nombre, categoria: i.categoria, proveedor_id: i.proveedor_id, merma_pct: i.merma_pct,
        es_reventa: i.es_reventa, cantidad_compra: c.cant, unidad_compra: unidad, precio_cent: c.precio,
      }
    })
    try {
      await guardar.mutateAsync(items)
      toast(`${items.length} precio${items.length > 1 ? 's' : ''} actualizado${items.length > 1 ? 's' : ''}`)
      onCerrar()
    } catch (e) {
      setError(`No se guardó nada. ${mensajeError(e)}`)
    }
  }

  return (
    <Hoja titulo="Actualizar precios" onCerrar={onCerrar} pie={
      <>
        <button className="btn ghost" onClick={onCerrar}>Cancelar</button>
        <button className="btn" onClick={onGuardar} disabled={!cambiados.length || guardar.isPending || !enLinea}>
          {guardar.isPending ? 'Guardando…' : cambiados.length ? `Guardar ${cambiados.length} cambio${cambiados.length > 1 ? 's' : ''}` : 'Guardar'}
        </button>
      </>
    }>
      <p className="small muted">Escribí los precios nuevos de la última compra. Cada cambio queda en el historial del insumo.</p>
      <Segmentado etiqueta="Agrupar por" valor={agrupar} onCambio={setAgrupar}
        opciones={[['proveedor', 'Por proveedor'], ['categoria', 'Por categoría']]} />

      {grupos.map(([titulo, items]) => (
        <section className="card" key={titulo}>
          <p className="eyebrow">{titulo}</p>
          <div className="list">
            {items.map((i) => {
              const ant = preciosPorInsumo.get(i.id)
              const c = cambio(i)
              const unidad = ant?.unidad ?? i.unidad_compra
              return (
                <div className="li" key={i.id} style={{ flexWrap: 'wrap' }}>
                  <div className="main" style={{ minWidth: 140 }}>
                    <b>{i.nombre}</b>
                    <span className="small muted">
                      {ant ? `Antes: ${pesos(ant.precio_cent)} por ${numero(ant.cantidad)} ${ant.unidad}` : 'Sin precio todavía'}
                    </span>
                    {c && !c.nuevo && Math.abs(c.pct) >= 0.05 && (
                      <span className={`small ${c.pct > 0 ? 'up' : 'down'}`} style={{ display: 'block' }}>{c.pct > 0 ? '+' : ''}{numero(c.pct, 1)}%</span>
                    )}
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <CampoNumero valor={filas[i.id]?.cantidad ?? ''} style={{ width: 64 }} aria-label={`Cantidad de ${i.nombre}`}
                      onCambio={(t) => setFilas((f) => ({ ...f, [i.id]: { ...f[i.id], cantidad: t } }))} />
                    <span className="small muted" style={{ width: 22 }}>{unidad}</span>
                    <CampoNumero valor={filas[i.id]?.precio ?? ''} style={{ width: 100 }} placeholder="$" aria-label={`Precio de ${i.nombre}`}
                      onCambio={(t) => setFilas((f) => ({ ...f, [i.id]: { ...f[i.id], precio: t } }))} />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}

      <AvisoSinConexion que="guardar precios" />
      {error && <p className="error" role="alert">{error}</p>}
    </Hoja>
  )
}
