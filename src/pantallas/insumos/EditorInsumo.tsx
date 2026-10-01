import { useMemo, useState } from 'react'
import { Hoja } from '../../componentes/Hoja'
import { BotonBorrar, Campo, CampoNumero, centATexto, pesosACent, textoNumero } from '../../componentes/Controles'
import { useToast } from '../../componentes/Toast'
import { useBorrarInsumo, useCosteo, useGuardarInsumos, useHistorialPrecios, useProductosVenta, useProveedores } from '../../datos/consultas'
import { CATEGORIAS, UNIDADES_COMPRA, UNIDAD_TXT, type Categoria } from '../../lib/catalogo'
import { BASE_POR_DIM, costoBaseInsumo, dimension, type Unidad } from '../../lib/costeo'
import { parseNumeroUY } from '../../lib/cargaRapida'
import { numero, pesos } from '../../lib/formato'
import { mensajeError } from '../../lib/errores'
import type { Insumo } from '../../datos/tipos'
import { AvisoSinConexion, useEnLinea } from '../../offline/Conexion'

export function EditorInsumo({ insumo, reventaPorDefecto, onCerrar }: { insumo: Insumo | null; reventaPorDefecto: boolean; onCerrar: () => void }) {
  const toast = useToast()
  const enLinea = useEnLinea()
  const { costeo, preciosPorInsumo } = useCosteo()
  const proveedores = useProveedores()
  const productos = useProductosVenta()
  const historial = useHistorialPrecios(insumo?.id)
  const guardar = useGuardarInsumos()
  const borrar = useBorrarInsumo()

  const precioActual = insumo ? preciosPorInsumo.get(insumo.id) : undefined
  const ventaActual = insumo ? productos.data?.find((p) => p.insumo_id === insumo.id && p.activo)?.precio_cent ?? null : null

  const [nombre, setNombre] = useState(insumo?.nombre ?? '')
  const [categoria, setCategoria] = useState<Categoria>(insumo?.categoria ?? 'Almacén')
  const [proveedor, setProveedor] = useState(insumo?.proveedor_id ?? '')
  const [cantidad, setCantidad] = useState(textoNumero(precioActual?.cantidad ?? insumo?.cantidad_compra ?? 1))
  const [unidad, setUnidad] = useState<Unidad>(precioActual?.unidad ?? insumo?.unidad_compra ?? 'kg')
  const [precio, setPrecio] = useState(centATexto(precioActual?.precio_cent))
  const [merma, setMerma] = useState(insumo?.merma_pct ? textoNumero(insumo.merma_pct) : '')
  const [reventa, setReventa] = useState(insumo?.es_reventa ?? reventaPorDefecto)
  const [venta, setVenta] = useState(centATexto(ventaActual))
  const [activo, setActivo] = useState(insumo?.activo ?? true)
  const [error, setError] = useState<string | null>(null)

  const nCant = parseNumeroUY(cantidad)
  const nPrecio = pesosACent(precio)
  const nMerma = merma.trim() ? parseNumeroUY(merma) : 0
  const nVenta = pesosACent(venta)

  const usos = useMemo(() => (insumo ? costeo.usosDirectos({ insumo_id: insumo.id }) : []), [costeo, insumo])
  const afectadas = useMemo(() => (insumo ? costeo.afectadas({ insumo_id: insumo.id }) : []), [costeo, insumo])
  const cambiaCosto = Boolean(insumo) && (!precioActual || precioActual.precio_cent !== nPrecio
    || precioActual.cantidad !== nCant || precioActual.unidad !== unidad || (insumo?.merma_pct ?? 0) !== nMerma)
  const cambiaDimension = Boolean(precioActual) && dimension(precioActual!.unidad) !== dimension(unidad) && usos.length > 0

  const cb = nCant > 0 && nPrecio >= 0 && nMerma >= 0 && nMerma <= 95
    ? costoBaseInsumo({ merma_pct: nMerma, precio: { cantidad: nCant, unidad, precio_cent: nPrecio } })
    : null
  const base = BASE_POR_DIM[dimension(unidad)]

  async function onGuardar() {
    setError(null)
    if (!nombre.trim()) return setError('Poné un nombre al insumo.')
    if (!(nCant > 0)) return setError('Completá cuánto comprás (por ejemplo 1 kg).')
    if (!(nPrecio > 0)) return setError('Completá el precio que pagás.')
    if (!(nMerma >= 0 && nMerma <= 95)) return setError('La merma tiene que estar entre 0 y 95%.')
    if (reventa && venta.trim() && !(nVenta >= 0)) return setError('Revisá el precio de venta.')
    try {
      await guardar.mutateAsync([{
        id: insumo?.id, nombre: nombre.trim(), categoria, proveedor_id: proveedor || null,
        cantidad_compra: nCant, unidad_compra: unidad, merma_pct: nMerma, es_reventa: reventa, activo,
        precio_cent: nPrecio, precio_venta_cent: reventa && venta.trim() ? nVenta : null,
      }])
      toast(cambiaDimension ? 'Guardado. Revisá las recetas que lo usan: cambió el tipo de unidad.' : 'Insumo guardado')
      onCerrar()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  async function onBorrar() {
    try {
      await borrar.mutateAsync(insumo!.id)
      toast('Insumo borrado')
      onCerrar()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  const ocupado = guardar.isPending || borrar.isPending

  return (
    <Hoja titulo={insumo ? 'Editar insumo' : 'Nuevo insumo'} onCerrar={onCerrar} pie={
      <>
        {insumo && usos.length === 0 && <BotonBorrar onBorrar={onBorrar} disabled={ocupado || !enLinea} />}
        <button className="btn" onClick={onGuardar} disabled={ocupado || !enLinea}>{guardar.isPending ? 'Guardando…' : 'Guardar'}</button>
      </>
    }>
      <Campo etiqueta="Nombre" htmlFor="in">
        <input id="in" className="inp" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Tallarines" />
      </Campo>
      <div className="grid2">
        <Campo etiqueta="Categoría" htmlFor="ic">
          <select id="ic" className="inp" value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria)}>
            {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Proveedor" htmlFor="ipr">
          <select id="ipr" className="inp" value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
            <option value="">Sin proveedor</option>
            {(proveedores.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </Campo>
      </div>
      <Campo etiqueta="¿Cómo lo comprás?">
        <div className="grid2">
          <CampoNumero valor={cantidad} onCambio={(t) => setCantidad(t)} aria-label="Cantidad que comprás" placeholder="1" />
          <select className="inp" value={unidad} onChange={(e) => setUnidad(e.target.value as Unidad)} aria-label="Unidad">
            {UNIDADES_COMPRA.map((u) => <option key={u} value={u}>{UNIDAD_TXT[u]}</option>)}
          </select>
        </div>
      </Campo>
      <Campo etiqueta="Precio que pagás por eso" htmlFor="ip">
        <CampoNumero id="ip" valor={precio} onCambio={(t) => setPrecio(t)} placeholder="$" />
      </Campo>
      <Campo etiqueta="Merma (opcional)" htmlFor="im" ayuda="Lo que se pierde al limpiar o pelar. Ej: la cebolla pierde cerca de 10%, el pollo con hueso 30%.">
        <div className="row">
          <CampoNumero id="im" valor={merma} onCambio={(t) => setMerma(t)} placeholder="0" style={{ width: 110 }} />
          <span>%</span>
        </div>
      </Campo>
      <label className="switch">
        <input type="checkbox" checked={reventa} onChange={(e) => setReventa(e.target.checked)} />
        <span><b>Lo vendo tal cual</b><br /><span className="hint">Refrescos, jugos, snacks</span></span>
      </label>
      {reventa && (
        <Campo etiqueta={`Precio de venta por ${unidad === 'u' ? 'unidad' : unidad}`} htmlFor="iv">
          <CampoNumero id="iv" valor={venta} onCambio={(t) => setVenta(t)} placeholder="$" />
        </Campo>
      )}

      <div className="summary">
        {cb === null ? (
          <p className="small muted">Completá cantidad y precio para ver el costo por gramo, ml o unidad.</p>
        ) : (
          <>
            <p className="eyebrow">Para las recetas</p>
            <p className="big">{pesos(cb * (base === 'u' ? 1 : 100))} <span className="small muted">por {base === 'u' ? 'unidad' : `100 ${base}`}</span></p>
            {base !== 'u' && <p className="small muted">Ej: 300 {base} cuestan {pesos(cb * 300)}</p>}
            {reventa && nVenta > 0 && unidad === 'u' && (
              <p className="small">Margen de reventa: <b>{numero(((nVenta - nPrecio / nCant) / nVenta) * 100, 0)}%</b> (ganás {pesos(nVenta - nPrecio / nCant)} por unidad)</p>
            )}
            {cambiaCosto && afectadas.length > 0 && (
              <p className="small" style={{ color: 'var(--sun)' }}><b>Al guardar se actualiza el costo de {afectadas.length} receta{afectadas.length > 1 ? 's' : ''}.</b></p>
            )}
            {cambiaDimension && <div className="warnbox">Cambiaste el tipo de unidad: las recetas que lo usan van a quedar incompletas hasta que las corrijas.</div>}
          </>
        )}
      </div>

      {insumo && (historial.data?.length ?? 0) > 0 && (
        <Campo etiqueta="Historial de precios">
          <div className="hist">
            {historial.data!.slice(0, 6).map((h) => (
              <div className="spread" key={h.fecha}>
                <span className="muted">{h.fecha.split('-').reverse().join('/')}</span>
                <span className="num">{pesos(h.precio_cent)} por {numero(h.cantidad)} {h.unidad}</span>
              </div>
            ))}
          </div>
        </Campo>
      )}

      {insumo && usos.length > 0 && (
        <p className="small muted">Se usa en: {usos.map((r) => r.nombre).join(', ')}. Para sacarlo de la lista, desactivalo.</p>
      )}
      {insumo && (
        <label className="switch">
          <input type="checkbox" checked={!activo} onChange={(e) => setActivo(!e.target.checked)} />
          <span><b>Desactivado</b><br /><span className="hint">Ya no lo comprás. Sigue en las recetas que lo usan.</span></span>
        </label>
      )}

      <AvisoSinConexion que="guardar insumos" />
      {error && <p className="error" role="alert">{error}</p>}
    </Hoja>
  )
}
