import { useMemo, useState } from 'react'
import { useCantina } from '../../sesion/Sesion'
import { Hoja } from '../../componentes/Hoja'
import { BotonBorrar, Campo, CampoNumero, Segmentado, centATexto, pesosACent, textoNumero } from '../../componentes/Controles'
import { useToast } from '../../componentes/Toast'
import {
  useBorrarReceta, useCosteo, useGuardarReceta, useInsumos, usePrecioMenu, useProductosVenta, useRecetas, useUsosEnMenu,
} from '../../datos/consultas'
import { TIPO_RECETA_TXT, type TipoReceta } from '../../lib/catalogo'
import {
  UNIDADES_POR_DIM, ajustarOlla, dimension, equivalencia, ollaAPorcion, porcionAOlla, unidadReceta,
  type RecetaCosteo, type Unidad,
} from '../../lib/costeo'
import { parseNumeroUY } from '../../lib/cargaRapida'
import { numero, pesos } from '../../lib/formato'
import { mensajeError } from '../../lib/errores'
import type { Ingrediente, Receta } from '../../datos/tipos'
import { AvisoSinConexion, useEnLinea } from '../../offline/Conexion'

// ref: "i:<id>" insumo · "p:<id>" preparación · "" sin elegir
type Fila = { ref: string; cantidad: string; unidad: Unidad }

const aFila = (i: Ingrediente): Fila => ({
  ref: i.insumo_id ? `i:${i.insumo_id}` : `p:${i.preparacion_id}`, cantidad: textoNumero(i.cantidad, 4), unidad: i.unidad,
})
const aIngrediente = (f: Fila): Ingrediente => ({
  insumo_id: f.ref.startsWith('i:') ? f.ref.slice(2) : null,
  preparacion_id: f.ref.startsWith('p:') ? f.ref.slice(2) : null,
  cantidad: parseNumeroUY(f.cantidad), unidad: f.unidad,
})
const filaVacia = (): Fila => ({ ref: '', cantidad: '', unidad: 'g' })
const ID_NUEVA = '__nueva__'

export function EditorReceta({ receta, tipoInicial, onCerrar, onGuardada }: {
  receta: Receta | null
  tipoInicial: TipoReceta
  onCerrar: () => void
  onGuardada: (tipo: TipoReceta) => void
}) {
  const { cantina, modulos, dic } = useCantina()
  const toast = useToast()
  const enLinea = useEnLinea()
  const insumos = useInsumos()
  const recetas = useRecetas()
  const productos = useProductosVenta()
  const usosMenu = useUsosEnMenu()
  const precioMenu = usePrecioMenu()
  const { costeo, preciosPorInsumo } = useCosteo()
  const guardar = useGuardarReceta()
  const borrar = useBorrarReceta()

  const pedidosDefault = cantina.pedidos_por_defecto || 60
  const productoActual = receta ? productos.data?.find((p) => p.receta_id === receta.id && p.activo) : undefined

  const [nombre, setNombre] = useState(receta?.nombre ?? '')
  const [tipo, setTipo] = useState<TipoReceta>(receta?.tipo ?? tipoInicial)
  const [modo, setModo] = useState<'porcion' | 'olla'>(receta?.modo ?? 'porcion')
  const [porciones, setPorciones] = useState(textoNumero(receta?.porciones ?? null))
  const [rinde, setRinde] = useState(textoNumero(receta?.rinde_cantidad ?? null))
  const [rindeUnidad, setRindeUnidad] = useState<Unidad>(receta?.rinde_unidad ?? 'l')
  const [filas, setFilas] = useState<Fila[]>(() => (receta?.ingredientes.length ? receta.ingredientes.map(aFila) : [filaVacia()]))
  const [vende, setVende] = useState(Boolean(productoActual))
  const [venta, setVenta] = useState(centATexto(productoActual?.precio_cent))
  const [activo, setActivo] = useState(receta?.activo ?? true)
  // Porciones con las que se cargaron las cantidades de la olla (para "Ajustar cantidades de X a Y").
  const [baseOlla, setBaseOlla] = useState<number | null>(receta?.modo === 'olla' ? receta.porciones : null)
  const [pidiendoOlla, setPidiendoOlla] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const esPrep = tipo === 'preparacion'
  const nPorciones = Math.max(1, Math.round(parseNumeroUY(porciones)) || 1)
  const idReceta = receta?.id ?? ID_NUEVA

  const insumosOrden = useMemo(() => [...(insumos.data ?? [])].filter((i) => i.activo || filas.some((f) => f.ref === `i:${i.id}`))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [insumos.data, filas])
  const preparaciones = useMemo(() => (recetas.data ?? []).filter((r) => r.tipo === 'preparacion' && r.id !== receta?.id)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [recetas.data, receta?.id])

  /** Unidades permitidas para la fila según la dimensión del insumo o la preparación. */
  function unidadesDe(ref: string): Unidad[] {
    if (ref.startsWith('i:')) {
      const id = ref.slice(2)
      const u = preciosPorInsumo.get(id)?.unidad ?? insumos.data?.find((x) => x.id === id)?.unidad_compra
      return u ? UNIDADES_POR_DIM[dimension(u)] : ['g', 'kg', 'ml', 'l', 'u']
    }
    if (ref.startsWith('p:')) {
      const u = recetas.data?.find((x) => x.id === ref.slice(2))?.rinde_unidad
      return u ? UNIDADES_POR_DIM[dimension(u)] : ['g', 'kg', 'ml', 'l', 'u']
    }
    return ['g', 'kg', 'ml', 'l', 'u']
  }

  function elegirRef(i: number, ref: string) {
    let unidad: Unidad = 'g'
    if (ref.startsWith('i:')) {
      const id = ref.slice(2)
      const u = preciosPorInsumo.get(id)?.unidad ?? insumos.data?.find((x) => x.id === id)?.unidad_compra
      if (u) unidad = unidadReceta(u)
    } else if (ref.startsWith('p:')) {
      const u = recetas.data?.find((x) => x.id === ref.slice(2))?.rinde_unidad
      if (u) unidad = unidadReceta(u)
    }
    setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, ref, unidad: unidadesDe(ref).includes(f.unidad) && f.ref ? f.unidad : unidad } : f)))
  }

  const cambiarFila = (i: number, c: Partial<Fila>) => setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, ...c } : f)))

  // ---- cambio de modo (sección 6.4) ----
  const conCantidades = filas.filter((f) => f.ref && parseNumeroUY(f.cantidad) > 0)
  function escalarFilas(fn: (ings: { cantidad: number; unidad: Unidad }[]) => { cantidad: number; unidad: Unidad }[]) {
    setFilas((fs) => {
      const validas = fs.map((f) => ({ cantidad: parseNumeroUY(f.cantidad), unidad: f.unidad }))
      const esc = fn(validas.map((v) => ({ cantidad: Number.isFinite(v.cantidad) ? v.cantidad : 0, unidad: v.unidad })))
      return fs.map((f, j) => (Number.isFinite(validas[j].cantidad) ? { ...f, cantidad: textoNumero(esc[j].cantidad, 4), unidad: esc[j].unidad } : f))
    })
  }
  function cambiarModo(m: 'porcion' | 'olla') {
    if (m === modo) return
    setAviso(null)
    if (m === 'olla') {
      if (conCantidades.length === 0) { setModo('olla'); setPorciones(String(pedidosDefault)); setBaseOlla(pedidosDefault); return }
      setPidiendoOlla(String(pedidosDefault))
    } else {
      if (conCantidades.length) {
        escalarFilas((ings) => ollaAPorcion(ings, nPorciones))
        setAviso(`Las cantidades se dividieron por ${nPorciones} porciones.`)
      }
      setModo('porcion'); setBaseOlla(null)
    }
  }
  function confirmarOlla() {
    const n = Math.max(1, Math.round(parseNumeroUY(pidiendoOlla ?? '')) || 1)
    escalarFilas((ings) => porcionAOlla(ings, n))
    setModo('olla'); setPorciones(String(n)); setBaseOlla(n); setPidiendoOlla(null)
    setAviso(`Las cantidades se multiplicaron por ${n} porciones.`)
  }
  function ajustar() {
    if (!baseOlla) return
    escalarFilas((ings) => ajustarOlla(ings, baseOlla, nPorciones))
    setAviso(`Las cantidades se ajustaron de ${baseOlla} a ${nPorciones} porciones.`)
    setBaseOlla(nPorciones)
  }

  // ---- costo del borrador ----
  const ingredientes = filas.filter((f) => f.ref).map(aIngrediente)
  const borrador: RecetaCosteo = {
    id: idReceta, nombre: nombre || 'Esta receta', tipo, modo: esPrep ? null : modo,
    porciones: !esPrep && modo === 'olla' ? nPorciones : null,
    rinde_cantidad: esPrep ? parseNumeroUY(rinde) || null : null, rinde_unidad: esPrep ? rindeUnidad : null,
    ingredientes: ingredientes.map((i) => ({ ...i, cantidad: Number.isFinite(i.cantidad) ? i.cantidad : 0 })),
  }
  const costo = costeo.borrador(borrador)
  const lineaDeFila = (i: number) => {
    // Las líneas del costo corresponden solo a filas con ingrediente elegido.
    const pos = filas.slice(0, i + 1).filter((f) => f.ref).length - 1
    return filas[i].ref ? costo.lineas[pos] : undefined
  }

  // ---- usos ----
  const usadaEn = receta ? costeo.usosDirectos({ preparacion_id: receta.id }) : []
  const diasMenu = receta ? usosMenu.data?.[receta.id] ?? 0 : 0
  const enUso = usadaEn.length > 0 || diasMenu > 0

  async function onGuardar() {
    setError(null)
    if (!nombre.trim()) return setError('Poné un nombre a la receta.')
    const validas = filas.filter((f) => f.ref)
    if (validas.some((f) => !(parseNumeroUY(f.cantidad) > 0))) return setError('Completá la cantidad de cada ingrediente (o quitá la fila).')
    if (!esPrep && modo === 'olla' && !(parseNumeroUY(porciones) >= 1)) return setError('Escribí cuántas porciones rinde la olla.')
    if (esPrep && rinde.trim() && !(parseNumeroUY(rinde) > 0)) return setError('Revisá cuánto rinde la olla.')
    if (vende && !(pesosACent(venta) > 0)) return setError('Escribí el precio de venta o desmarcá "La vendo".')
    if (receta && receta.tipo === 'preparacion' && !esPrep && usadaEn.length)
      return setError(`Esta preparación se usa en ${usadaEn.map((r) => r.nombre).join(', ')}. Sacala de ahí antes de cambiarle el tipo.`)
    const ciclo = costeo.cicloAlGuardar(idReceta, validas.map(aIngrediente))
    if (ciclo) return setError(`No se puede guardar: se forma un círculo (${ciclo.join(' → ')}). Una preparación no puede usarse a sí misma.`)

    try {
      await guardar.mutateAsync({
        id: receta?.id, nombre: nombre.trim(), tipo, activo,
        modo: esPrep ? null : modo, porciones: !esPrep && modo === 'olla' ? nPorciones : null,
        rinde_cantidad: esPrep && rinde.trim() ? parseNumeroUY(rinde) : null, rinde_unidad: esPrep ? rindeUnidad : null,
        ingredientes: validas.map(aIngrediente),
        precio_venta_cent: vende ? pesosACent(venta) : productoActual ? null : undefined,
      })
      toast('Receta guardada')
      onGuardada(tipo)
      onCerrar()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  async function onBorrar() {
    try {
      await borrar.mutateAsync(receta!.id)
      toast('Receta borrada')
      onCerrar()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  const ocupado = guardar.isPending || borrar.isPending
  const rindeNum = parseNumeroUY(rinde)

  return (
    <Hoja titulo={receta ? 'Editar receta' : 'Nueva receta'} onCerrar={onCerrar} pie={
      <>
        {receta && !enUso && <BotonBorrar onBorrar={onBorrar} disabled={ocupado || !enLinea} />}
        <button className="btn" onClick={onGuardar} disabled={ocupado || !enLinea}>{guardar.isPending ? 'Guardando…' : 'Guardar'}</button>
      </>
    }>
      <Campo etiqueta="Nombre" htmlFor="rn">
        <input id="rn" className="inp" value={nombre} onChange={(e) => setNombre(e.target.value)}
          placeholder={esPrep ? 'Ej: Tuco' : tipo === 'postre' ? 'Ej: Gelatina' : 'Ej: Tallarines con tuco'} />
      </Campo>
      <Campo etiqueta="Tipo">
        <Segmentado etiqueta="Tipo" valor={tipo} onCambio={(t) => { setTipo(t); setAviso(null) }}
          opciones={(['plato', 'postre', 'preparacion'] as const).map((t) => [t, TIPO_RECETA_TXT[t].uno])} />
      </Campo>

      {esPrep ? (
        <Campo etiqueta="¿Cuánto rinde la olla?" ayuda="Con esto la podés usar como ingrediente en otros platos (por ejemplo 150 ml de tuco por porción).">
          <div className="grid2">
            <CampoNumero valor={rinde} onCambio={(t) => setRinde(t)} placeholder="Ej: 3" aria-label="Rinde" />
            <select className="inp" value={rindeUnidad} onChange={(e) => setRindeUnidad(e.target.value as Unidad)} aria-label="Unidad del rendimiento">
              <option value="l">litros</option><option value="kg">kilos</option><option value="u">unidades</option>
            </select>
          </div>
        </Campo>
      ) : (
        <Campo etiqueta="¿Cómo cargás las cantidades?" ayuda={modo === 'olla'
          ? 'Cargá lo que lleva la olla entera. Si cambiás las porciones, las cantidades quedan igual y cambia el costo por porción.'
          : 'Cargá lo que lleva un solo plato.'}>
          <Segmentado etiqueta="Modo" valor={modo} onCambio={cambiarModo}
            opciones={[['porcion', 'Para 1 porción'], ['olla', 'Para una olla']]} />
          {pidiendoOlla !== null && (
            <div className="summary">
              <p className="small"><b>¿Cuántas porciones rinde la olla?</b> Las cantidades se van a multiplicar por ese número.</p>
              <div className="row">
                <CampoNumero valor={pidiendoOlla} onCambio={(t) => setPidiendoOlla(t)} style={{ width: 110 }} aria-label="Porciones de la olla" />
                <button className="btn sm" onClick={confirmarOlla}>Pasar a olla</button>
                <button className="btn ghost sm" onClick={() => setPidiendoOlla(null)}>Cancelar</button>
              </div>
            </div>
          )}
          {modo === 'olla' && (
            <div className="row">
              <label htmlFor="rp" className="small">La olla rinde</label>
              <CampoNumero id="rp" valor={porciones} onCambio={(t) => setPorciones(t)} style={{ width: 90 }} />
              <span className="small">porciones</span>
            </div>
          )}
          {modo === 'olla' && baseOlla && baseOlla !== nPorciones && conCantidades.length > 0 && (
            <button className="btn ghost sm" onClick={ajustar}>Ajustar cantidades de {baseOlla} a {nPorciones} porciones</button>
          )}
          {aviso && <p className="small" style={{ color: 'var(--accent)', fontWeight: 700 }}>{aviso}</p>}
        </Campo>
      )}

      <Campo etiqueta="Ingredientes">
        <div className="ings">
          {filas.map((f, i) => {
            const linea = lineaDeFila(i)
            const n = parseNumeroUY(f.cantidad)
            const partes: string[] = []
            if (f.ref && n > 0) {
              if (linea) partes.push(linea.costo_cent !== null ? pesos(linea.costo_cent) : linea.falta ? `Falta: ${linea.falta}` : '—')
              if (!esPrep) partes.push(equivalencia({ cantidad: n, unidad: f.unidad }, modo, modo === 'olla' ? nPorciones : pedidosDefault))
            }
            return (
              <div className="ing" key={i}>
                <select className="inp" aria-label="Ingrediente" value={f.ref} onChange={(e) => elegirRef(i, e.target.value)}>
                  <option value="">Elegí un ingrediente</option>
                  <optgroup label="Insumos">
                    {insumosOrden.map((x) => <option key={x.id} value={`i:${x.id}`}>{x.nombre}</option>)}
                  </optgroup>
                  {preparaciones.length > 0 && (
                    <optgroup label="Preparaciones">
                      {preparaciones.map((x) => <option key={x.id} value={`p:${x.id}`}>{x.nombre}</option>)}
                    </optgroup>
                  )}
                </select>
                <CampoNumero valor={f.cantidad} onCambio={(t) => cambiarFila(i, { cantidad: t })} aria-label="Cantidad" placeholder="0" />
                <select className="inp" aria-label="Unidad" value={f.unidad} onChange={(e) => cambiarFila(i, { unidad: e.target.value as Unidad })}>
                  {unidadesDe(f.ref).map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <button className="x" onClick={() => setFilas((fs) => fs.filter((_, j) => j !== i))} aria-label="Quitar">×</button>
                {partes.length > 0 && <span className="cost">{partes.join(' · ')}</span>}
              </div>
            )
          })}
        </div>
        <button className="btn ghost sm" onClick={() => setFilas((fs) => [...fs, filaVacia()])}>+ Agregar ingrediente</button>
        {(insumos.data?.length ?? 0) === 0 && <p className="hint">Primero cargá insumos en la pantalla Insumos.</p>}
      </Campo>

      <div className="summary">
        {esPrep ? (
          <>
            <p className="eyebrow">Costo de la olla</p>
            <p className="big">{pesos(costo.total_cent)}</p>
            {rindeNum > 0
              ? <p className="small">{pesos(costo.total_cent / rindeNum)} por {rindeUnidad} · {pesos(costo.total_cent / rindeNum / (rindeUnidad === 'u' ? 1 : 1000))} por {rindeUnidad === 'kg' ? 'g' : rindeUnidad === 'u' ? 'u' : 'ml'}</p>
              : <p className="small muted">Cargá cuánto rinde para usarla en otros platos.</p>}
          </>
        ) : (
          <>
            <p className="eyebrow">Costo por porción</p>
            <p className="big">{pesos(costo.porcion_cent)}</p>
            {modo === 'olla' && <p className="small muted">Olla completa: {pesos(costo.total_cent)}</p>}
            {precioMenu && costo.porcion_cent !== null && costo.completo && (
              <p className="small">{numero((costo.porcion_cent / precioMenu) * 100, 0)}% del precio del menú ({pesos(precioMenu)})</p>
            )}
          </>
        )}
        {costo.faltantes.length > 0 && <div className="warnbox">Falta: {costo.faltantes.join(', ')}</div>}
      </div>

      {!esPrep && (
        <>
          <label className="switch">
            <input type="checkbox" checked={vende} onChange={(e) => setVende(e.target.checked)} />
            {modulos.precio_por_plato && tipo === 'plato'
              ? <span><b>Tiene precio propio</b><br /><span className="hint">Los días que se sirve, el {dic.t('menu_del_dia')} se cobra a este precio</span></span>
              : <span><b>La vendo aparte</b><br /><span className="hint">Por ejemplo tortas fritas o bizcochos por unidad</span></span>}
          </label>
          {vende && (
            <Campo etiqueta="Precio de venta por porción o unidad" htmlFor="rv">
              <CampoNumero id="rv" valor={venta} onCambio={(t) => setVenta(t)} placeholder="$" />
              {costo.completo && costo.porcion_cent !== null && pesosACent(venta) > 0 && (
                <p className="small">Margen: <b>{numero(((pesosACent(venta) - costo.porcion_cent) / pesosACent(venta)) * 100, 0)}%</b></p>
              )}
            </Campo>
          )}
        </>
      )}

      {enUso && (
        <p className="small muted">
          Se usa en: {[...usadaEn.map((r) => r.nombre), ...(diasMenu ? [`${diasMenu} día${diasMenu > 1 ? 's' : ''} del menú`] : [])].join(', ')}.
          {' '}Por eso no se puede borrar; si ya no la usás, desactivala.
        </p>
      )}
      {receta && (
        <label className="switch">
          <input type="checkbox" checked={!activo} onChange={(e) => setActivo(!e.target.checked)} />
          <span><b>Desactivada</b><br /><span className="hint">No aparece para elegir en el menú.</span></span>
        </label>
      )}

      <AvisoSinConexion que="guardar recetas" />
      {error && <p className="error" role="alert">{error}</p>}
    </Hoja>
  )
}
