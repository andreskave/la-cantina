import { useState } from 'react'
import { useCantina } from '../../sesion/Sesion'
import { Hoja } from '../../componentes/Hoja'
import { BotonBorrar, Campo, CampoNumero, Chips, Segmentado, centATexto, pesosACent } from '../../componentes/Controles'
import { useToast } from '../../componentes/Toast'
import { useBorrarMovCaja, useGuardarMovCaja, useNuevoMovCaja, useProveedores } from '../../datos/consultas'
import { AvisoSinConexion, useEnLinea } from '../../offline/Conexion'
import { TIPO_CAJA_TXT, type MedioPago, type MovCaja, type Subcategoria, type TipoCaja } from '../../lib/caja'
import { hoyISO } from '../../lib/formato'
import { mensajeError } from '../../lib/errores'

type TipoManual = Exclude<TipoCaja, 'cobro_cuenta'>
const TIPOS: [TipoManual, string][] = [
  ['venta_contado', 'Venta'], ['compra', 'Compra'], ['gasto_fijo', 'Gasto fijo'], ['otro_ingreso', 'Otro ingreso'], ['otro_egreso', 'Otro egreso'],
]
const PISTA: Record<TipoManual, string> = {
  venta_contado: 'Ej: Ventas del día', compra: 'Ej: Carnicería', gasto_fijo: 'Ej: Sueldo de la ayudante', otro_ingreso: 'Ej: Rifa', otro_egreso: 'Ej: Arreglo de la heladera',
}

export function EditorMovCaja({ mov, fechaPorDefecto, onCerrar }: { mov: MovCaja | null; fechaPorDefecto: string; onCerrar: () => void }) {
  const { modulos } = useCantina()
  const toast = useToast()
  const proveedores = useProveedores()
  const editar = useGuardarMovCaja()
  const nuevo = useNuevoMovCaja()
  const guardar = mov ? editar : nuevo
  const enLinea = useEnLinea()
  const borrar = useBorrarMovCaja()
  const [tipo, setTipo] = useState<TipoManual>((mov?.tipo as TipoManual) ?? 'venta_contado')
  const [fecha, setFecha] = useState(mov?.fecha ?? fechaPorDefecto)
  const [importe, setImporte] = useState(centATexto(mov?.importe_cent))
  const [concepto, setConcepto] = useState(mov?.concepto ?? '')
  const [sub, setSub] = useState<Subcategoria>(mov?.subcategoria ?? 'Sueldos')
  const [proveedor, setProveedor] = useState(mov?.proveedor_id ?? '')
  const [medio, setMedio] = useState<MedioPago>(mov?.medio_pago ?? 'efectivo')
  const [error, setError] = useState<string | null>(null)

  async function onGuardar() {
    const cent = pesosACent(importe)
    if (!(cent > 0)) return setError('Escribí el importe.')
    setError(null)
    try {
      const datos = {
        fecha, tipo, importe_cent: cent, concepto,
        subcategoria: tipo === 'gasto_fijo' ? sub : null, proveedor_id: tipo === 'compra' && proveedor ? proveedor : null,
        medio_pago: modulos.medio_pago ? medio : null,
      }
      if (mov) {
        await editar.mutateAsync({ ...datos, id: mov.id })
        toast('Movimiento guardado')
      } else {
        const r = await nuevo.mutateAsync({ ...datos, client_uuid: crypto.randomUUID() })
        toast(r.pendiente ? 'Movimiento guardado sin conexión: se envía solo cuando vuelva internet' : 'Movimiento guardado')
      }
      onCerrar()
    } catch (e) { setError(mensajeError(e)) }
  }

  async function onBorrar() {
    try {
      await borrar.mutateAsync(mov!.id)
      toast('Movimiento borrado')
      onCerrar()
    } catch (e) { setError(mensajeError(e)) }
  }

  return (
    <Hoja titulo={mov ? 'Editar movimiento' : 'Nuevo movimiento'} onCerrar={onCerrar} pie={
      <>
        {mov && <BotonBorrar onBorrar={onBorrar} disabled={borrar.isPending || !enLinea} />}
        <button className="btn" onClick={onGuardar} disabled={guardar.isPending || (Boolean(mov) && !enLinea)}>{guardar.isPending ? 'Guardando…' : 'Guardar'}</button>
      </>
    }>
      <Chips envolver etiqueta="Tipo" valor={tipo} onCambio={setTipo} opciones={TIPOS} />
      <div className="grid2">
        <Campo etiqueta="Fecha" htmlFor="mf">
          <input id="mf" className="inp" type="date" value={fecha} max={hoyISO()} onChange={(e) => e.target.value && setFecha(e.target.value)} />
        </Campo>
        <Campo etiqueta="Importe" htmlFor="mi">
          <CampoNumero id="mi" valor={importe} onCambio={(t) => setImporte(t)} placeholder="$" />
        </Campo>
      </div>
      {tipo === 'gasto_fijo' && (
        <Campo etiqueta="¿Qué gasto?">
          <Segmentado etiqueta="Gasto fijo" valor={sub} onCambio={setSub} opciones={[['Sueldos', 'Sueldos'], ['Gas', 'Gas'], ['Otros', 'Otros']]} />
        </Campo>
      )}
      {tipo === 'compra' && (
        <Campo etiqueta="Proveedor (opcional)" htmlFor="mp">
          <select id="mp" className="inp" value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
            <option value="">Sin proveedor</option>
            {(proveedores.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </Campo>
      )}
      <Campo etiqueta="Detalle (opcional)" htmlFor="mc">
        <input id="mc" className="inp" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder={PISTA[tipo]} />
      </Campo>
      {modulos.medio_pago && (
        <Campo etiqueta="Medio de pago">
          <Segmentado etiqueta="Medio de pago" valor={medio} onCambio={setMedio} opciones={[['efectivo', 'Efectivo'], ['transferencia', 'Transferencia']]} />
        </Campo>
      )}
      {mov?.origen === 'cierre_dia' && <p className="hint">Este movimiento salió del cierre del día ({TIPO_CAJA_TXT[mov.tipo].toLowerCase()}).</p>}
      {mov && <AvisoSinConexion que="editar o borrar un movimiento" />}
      {error && <p className="error" role="alert">{error}</p>}
    </Hoja>
  )
}
