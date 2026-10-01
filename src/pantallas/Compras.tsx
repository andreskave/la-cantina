import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCantina } from '../sesion/Sesion'
import { useCosteo, useInsumos, useListas, useMenuRango, usePedidosPorLista, useProveedores } from '../datos/consultas'
import { armarLista, fechasDeRango, textoParaCopiar, textoRango, type ItemCompra, type RangoCompras } from '../lib/compras'
import { CATEGORIAS } from '../lib/catalogo'
import { DIAS_CORTOS, capitalizar, hoyISO, numero, pesos } from '../lib/formato'
import { diaSemana } from '../lib/fechas'
import { mensajeError } from '../lib/errores'
import { Chips, Segmentado } from '../componentes/Controles'
import { useToast } from '../componentes/Toast'
import { Cargando, Vacio } from '../componentes/Vacio'

type Agrupar = 'categoria' | 'proveedor'

// Las casillas tachadas se guardan solo en este dispositivo.
const claveTachados = (cantina: string, desde: string, hasta: string) => `lacantina.compras.${cantina}.${desde}_${hasta}`
function leerTachados(k: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(k) ?? '[]') as string[]) } catch { return new Set() }
}
function guardarTachados(k: string, s: Set<string>) {
  try { if (s.size) localStorage.setItem(k, JSON.stringify([...s])); else localStorage.removeItem(k) } catch { /* sin almacenamiento */ }
}

const fechaCorta = (f: string) => `${DIAS_CORTOS[diaSemana(f)]} ${Number(f.slice(8))}/${Number(f.slice(5, 7))}`

export function Compras() {
  const { cantina, puede } = useCantina()
  const verCostos = puede('ver_costos')
  const toast = useToast()
  const hoy = hoyISO()
  const [rango, setRango] = useState<RangoCompras>('esta')
  const [elegido, setElegido] = useState<[string, string]>(() => fechasDeRango('esta', hoy))
  const [agrupar, setAgrupar] = useState<Agrupar>('categoria')
  const [desde, hasta] = rango === 'elegido' ? (elegido[0] <= elegido[1] ? elegido : [elegido[1], elegido[0]]) : fechasDeRango(rango, hoy)

  const menu = useMenuRango(desde, hasta)
  const insumos = useInsumos()
  const proveedores = useProveedores()
  const { costeo, preciosPorInsumo, cargando } = useCosteo()
  const { modulos } = useCantina()
  const listas = useListas()
  const pedidosLista = usePedidosPorLista(desde, hasta)
  // Con listas de precio: porción promedio del día según cuántos menús pidió cada lista.
  const factorDia = useMemo(() => {
    if (!modulos.listas_precio) return undefined
    const factor = new Map((listas.data ?? []).map((l) => [l.id, l.factor_porcion]))
    return (fecha: string) => {
      const p = Object.entries(pedidosLista.data?.[fecha] ?? {})
      const total = p.reduce((a, [, n]) => a + n, 0)
      return total > 0 ? p.reduce((a, [l, n]) => a + n * (factor.get(l) ?? 1), 0) / total : 1
    }
  }, [modulos.listas_precio, listas.data, pedidosLista.data])

  const lista = useMemo(() => armarLista({
    desde, hasta, dias: menu.data ?? [], pedidosDefault: cantina.pedidos_por_defecto, costeo,
    insumos: insumos.data ?? [], precios: verCostos ? preciosPorInsumo : new Map(), factorDia,
  }), [desde, hasta, menu.data, cantina.pedidos_por_defecto, costeo, insumos.data, verCostos, preciosPorInsumo, factorDia])

  const grupos = useMemo((): [string, ItemCompra[]][] => {
    const nombreProv = new Map((proveedores.data ?? []).map((p) => [p.id, p.nombre]))
    const clave = (i: ItemCompra) => (agrupar === 'categoria' ? i.insumo.categoria : nombreProv.get(i.insumo.proveedor_id ?? '') ?? 'Sin proveedor')
    const orden = agrupar === 'categoria' ? [...CATEGORIAS] : [...[...nombreProv.values()].sort((a, b) => a.localeCompare(b, 'es')), 'Sin proveedor']
    const m = new Map<string, ItemCompra[]>()
    for (const it of lista.items) m.set(clave(it), [...(m.get(clave(it)) ?? []), it])
    return orden.filter((k) => m.has(k)).map((k) => [k, m.get(k)!])
  }, [lista.items, proveedores.data, agrupar])

  const kTachados = claveTachados(cantina.id, desde, hasta)
  const [tachados, setTachados] = useState<Set<string>>(() => leerTachados(kTachados))
  useEffect(() => setTachados(leerTachados(kTachados)), [kTachados])
  const tachar = (id: string) => setTachados((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    guardarTachados(kTachados, n)
    return n
  })

  const total = lista.items.reduce((a, i) => a + (i.costo_cent ?? 0), 0)
  const sinCosto = lista.items.filter((i) => i.costo_cent === null).length

  async function copiar() {
    const texto = textoParaCopiar(`Compras ${textoRango(desde, hasta)}`, grupos)
    try {
      await navigator.clipboard.writeText(texto)
      toast('Lista copiada. Pegala en WhatsApp.')
    } catch {
      toast('No se pudo copiar. Probá de nuevo.')
    }
  }

  const error = menu.error ?? insumos.error

  return (
    <>
      <h2>Compras</h2>
      <Chips envolver etiqueta="Fechas" valor={rango} onCambio={setRango}
        opciones={[['esta', 'Esta semana'], ['proxima', 'Próxima semana'], ['elegido', 'Elegir fechas']]} />
      {rango === 'elegido' && (
        <div className="grid2">
          <div className="field"><label htmlFor="cd">Desde</label>
            <input id="cd" className="inp" type="date" value={elegido[0]} onChange={(e) => e.target.value && setElegido([e.target.value, elegido[1]])} /></div>
          <div className="field"><label htmlFor="ch">Hasta</label>
            <input id="ch" className="inp" type="date" value={elegido[1]} onChange={(e) => e.target.value && setElegido([elegido[0], e.target.value])} /></div>
        </div>
      )}
      <p className="small muted">
        {capitalizar(textoRango(desde, hasta))}
        {lista.dias > 0 && ` · ${lista.dias} día${lista.dias > 1 ? 's' : ''} con menú · ${numero(lista.menus)} menús`}
      </p>

      {error ? <Vacio><p>{mensajeError(error)}</p></Vacio>
        : menu.isPending || cargando ? <Cargando texto="Armando la lista…" />
          : (
            <>
              <Avisos aMano={lista.aMano} sinPedidos={lista.sinPedidos} porDefecto={lista.porDefecto} incompatibles={lista.incompatibles}
                pedidosDefault={cantina.pedidos_por_defecto} />

              {lista.items.length === 0 ? (
                <Vacio>
                  <p>No hay nada para comprar en estas fechas. La lista sale de los días del menú que tienen receta y menús pedidos.</p>
                  <Link className="btn link" to="/menu">Ir al menú</Link>
                </Vacio>
              ) : (
                <>
                  <Segmentado etiqueta="Agrupar por" valor={agrupar} onCambio={setAgrupar}
                    opciones={[['categoria', 'Por categoría'], ['proveedor', 'Por proveedor']]} />
                  {grupos.map(([g, items]) => (
                    <section className="card" key={g}>
                      <p className="eyebrow">{g}</p>
                      <div>
                        {items.map((it) => {
                          const hecho = tachados.has(it.insumo.id)
                          return (
                            <label className={`check${hecho ? ' done' : ''}`} key={it.insumo.id}>
                              <input type="checkbox" checked={hecho} onChange={() => tachar(it.insumo.id)} />
                              <span className="main">
                                <b>{it.insumo.nombre}</b>
                                <span className="small muted" style={{ display: 'block' }}>
                                  <span className="num">{it.texto}</span>{it.paquetes && ` · ${it.paquetes}`}
                                </span>
                              </span>
                              {verCostos && <span className="side num small">{it.costo_cent !== null ? pesos(it.costo_cent, { sinCentesimos: true }) : '—'}</span>}
                            </label>
                          )
                        })}
                      </div>
                    </section>
                  ))}
                  {verCostos && (
                    <div className="summary">
                      <p className="eyebrow">Costo estimado</p>
                      <p className="big">{pesos(total, { sinCentesimos: true })}</p>
                      {sinCosto > 0 && <p className="small muted">{sinCosto} insumo{sinCosto > 1 ? 's' : ''} sin precio no entra{sinCosto > 1 ? 'n' : ''} en el total.</p>}
                    </div>
                  )}
                  <div className="row wrap-r">
                    <button className="btn" onClick={() => void copiar()}>Copiar lista</button>
                    {tachados.size > 0 && (
                      <button className="btn ghost" onClick={() => { guardarTachados(kTachados, new Set()); setTachados(new Set()) }}>Desmarcar todo</button>
                    )}
                  </div>
                </>
              )}
            </>
          )}
    </>
  )
}

function Avisos({ aMano, sinPedidos, porDefecto, incompatibles, pedidosDefault }: {
  aMano: { fecha: string; texto: string }[]
  sinPedidos: string[]
  porDefecto: string[]
  incompatibles: string[]
  pedidosDefault: number
}) {
  if (!aMano.length && !sinPedidos.length && !porDefecto.length && !incompatibles.length) return null
  return (
    <div className="stack" style={{ gap: 8 }}>
      {aMano.length > 0 && (
        <p className="warnbox">
          Escritos a mano, no entran en la lista: {aMano.map((a) => `${a.texto} (${fechaCorta(a.fecha)})`).join(', ')}.
          Si les armás la receta, se suman solos.
        </p>
      )}
      {sinPedidos.length > 0 && (
        <p className="warnbox">Sin menús pedidos, no entran en la lista: {sinPedidos.map(fechaCorta).join(', ')}. Cargalos en el Menú.</p>
      )}
      {porDefecto.length > 0 && (
        <p className="banner">Sin menús pedidos cargados, se calcularon con {pedidosDefault} por defecto: {porDefecto.map(fechaCorta).join(', ')}.</p>
      )}
      {incompatibles.length > 0 && (
        <p className="warnbox">Revisá las unidades de {incompatibles.join(', ')}: en alguna receta no coinciden con cómo se compra.</p>
      )}
    </div>
  )
}
