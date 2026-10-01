import { useMemo, useState } from 'react'
import { useCantina } from '../../sesion/Sesion'
import { useCosteo, useInsumos, useProductosVenta } from '../../datos/consultas'
import { CATEGORIAS } from '../../lib/catalogo'
import { costoBaseInsumo, aBase } from '../../lib/costeo'
import { numero, pesos } from '../../lib/formato'
import { mensajeError } from '../../lib/errores'
import { Chips } from '../../componentes/Controles'
import { Icono } from '../../componentes/Icono'
import { Cargando, Vacio } from '../../componentes/Vacio'
import type { Insumo } from '../../datos/tipos'
import { EditorInsumo } from './EditorInsumo'
import { CargaRapida } from './CargaRapida'
import { ActualizarPrecios } from './ActualizarPrecios'

type Filtro = 'todos' | 'mp' | 'rv'
type Hoja = { tipo: 'editar'; insumo: Insumo | null } | { tipo: 'carga' } | { tipo: 'precios' } | null

export function Insumos() {
  const { puede } = useCantina()
  const gestiona = puede('editar_catalogo')
  const insumos = useInsumos()
  const { preciosPorInsumo } = useCosteo()
  const productos = useProductosVenta()
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [hoja, setHoja] = useState<Hoja>(null)

  const ventaPorInsumo = useMemo(
    () => new Map((productos.data ?? []).filter((p) => p.insumo_id && p.activo).map((p) => [p.insumo_id!, p.precio_cent])),
    [productos.data])

  const lista = insumos.data ?? []
  const visibles = lista.filter((x) =>
    (filtro === 'todos' || (filtro === 'rv' ? x.es_reventa : !x.es_reventa))
    && (!q.trim() || x.nombre.toLowerCase().includes(q.trim().toLowerCase())))

  if (insumos.isPending) return <Cargando texto="Cargando insumos…" />
  if (insumos.error) return <Vacio><p>{mensajeError(insumos.error)}</p></Vacio>

  return (
    <>
      <div className="spread"><h2>Insumos</h2></div>

      {lista.length > 0 && (
        <>
          <div className="row">
            <input className="inp" type="search" placeholder="Buscar insumo" aria-label="Buscar insumo"
              value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
          </div>
          {gestiona && (
            <div className="row wrap-r">
              <button className="btn ghost sm" onClick={() => setHoja({ tipo: 'carga' })}>Carga rápida</button>
              <button className="btn ghost sm" onClick={() => setHoja({ tipo: 'precios' })}>Actualizar precios</button>
            </div>
          )}
          <Chips etiqueta="Filtrar insumos" valor={filtro} onCambio={setFiltro}
            opciones={[['todos', 'Todos'], ['mp', 'Materias primas'], ['rv', 'Reventa']]} />
        </>
      )}

      {lista.length === 0 ? (
        <Vacio>
          {gestiona ? (
            <>
              <p>Empezá por acá: cargá lo que comprás, por ejemplo 1 kg de tallarines a $ 300. Con los insumos después armás las recetas.</p>
              <div className="row wrap-r" style={{ justifyContent: 'center' }}>
                <button className="btn" onClick={() => setHoja({ tipo: 'carga' })}>Cargar varios a la vez</button>
                <button className="btn ghost" onClick={() => setHoja({ tipo: 'editar', insumo: null })}>Cargar uno</button>
              </div>
            </>
          ) : <p>Todavía no hay insumos cargados.</p>}
        </Vacio>
      ) : visibles.length === 0 ? (
        <Vacio><p>No hay insumos con ese filtro.</p></Vacio>
      ) : (
        CATEGORIAS.map((cat) => {
          const items = visibles.filter((x) => x.categoria === cat)
            .sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, 'es'))
          if (!items.length) return null
          return (
            <section className="card" key={cat}>
              <p className="eyebrow">{cat}</p>
              <div className="list">
                {items.map((x) => (
                  <FilaInsumo key={x.id} x={x} gestiona={gestiona} precio={preciosPorInsumo.get(x.id)}
                    venta={ventaPorInsumo.get(x.id) ?? null} onAbrir={() => setHoja({ tipo: 'editar', insumo: x })} />
                ))}
              </div>
            </section>
          )
        })
      )}

      {gestiona && lista.length > 0 && (
        <button className="fab" onClick={() => setHoja({ tipo: 'editar', insumo: null })}>
          <Icono nombre="plus" grosor={2.5} />Nuevo insumo
        </button>
      )}

      {hoja?.tipo === 'editar' && <EditorInsumo insumo={hoja.insumo} reventaPorDefecto={filtro === 'rv'} onCerrar={() => setHoja(null)} />}
      {hoja?.tipo === 'carga' && <CargaRapida onCerrar={() => setHoja(null)} />}
      {hoja?.tipo === 'precios' && <ActualizarPrecios onCerrar={() => setHoja(null)} />}
    </>
  )
}

function FilaInsumo({ x, gestiona, precio, venta, onAbrir }: {
  x: Insumo
  gestiona: boolean
  precio: { cantidad: number; unidad: Insumo['unidad_compra']; precio_cent: number } | undefined
  venta: number | null
  onAbrir: () => void
}) {
  const compra = `${numero(x.cantidad_compra)} ${x.unidad_compra}`
  let sub: string
  let lado = null
  let extra = null
  if (!gestiona) {
    sub = `Se compra por ${compra}${x.merma_pct ? ` · merma ${numero(x.merma_pct)}%` : ''}`
  } else if (!precio) {
    sub = `Compra: ${compra}`
    lado = <span className="pill warn">Sin precio</span>
  } else {
    sub = `Compra: ${numero(precio.cantidad)} ${precio.unidad} a ${pesos(precio.precio_cent)}${x.merma_pct ? ` · merma ${numero(x.merma_pct)}%` : ''}`
    lado = <span><b className="num">{pesos(precio.precio_cent / precio.cantidad)}</b><span className="small muted"> / {precio.unidad}</span></span>
    if (x.es_reventa && venta && precio.unidad === 'u') {
      const costoU = precio.precio_cent / precio.cantidad
      const margen = (venta - costoU) / venta
      extra = <span className={`pill ${margen >= 0.3 ? 'ok' : 'warn'}`}>Venta {pesos(venta)} · {numero(margen * 100, 0)}%</span>
    } else if (x.merma_pct) {
      const cb = costoBaseInsumo({ merma_pct: x.merma_pct, precio })
      if (cb !== null) extra = <span className="small muted">real {pesos(cb * aBase(1, precio.unidad))} / {precio.unidad}</span>
    }
  }
  const contenido = (
    <>
      <div className="main">
        <b>{x.nombre}</b>
        <span className="small muted">{sub}</span>
        {!x.activo && <span className="pill mute">Desactivado</span>}
      </div>
      {(lado || extra) && <div className="side" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>{lado}{extra}</div>}
    </>
  )
  return gestiona
    ? <button className="li" onClick={onAbrir} style={{ opacity: x.activo ? 1 : 0.6 }}>{contenido}</button>
    : <div className="li" style={{ opacity: x.activo ? 1 : 0.6 }}>{contenido}</div>
}
