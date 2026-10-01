import { useState } from 'react'
import { useCantina } from '../../sesion/Sesion'
import { Hoja } from '../../componentes/Hoja'
import { Campo, CampoNumero, Segmentado, centATexto, pesosACent } from '../../componentes/Controles'
import { useToast } from '../../componentes/Toast'
import { useRegistrarPago } from '../../datos/consultas'
import { hoyISO, pesos } from '../../lib/formato'
import { mensajeError } from '../../lib/errores'
import type { Alumno } from '../../datos/tipos'

export function RegistrarPago({ alumno, saldo, onCerrar }: { alumno: Alumno; saldo: number; onCerrar: () => void }) {
  const { modulos } = useCantina()
  const toast = useToast()
  const pagar = useRegistrarPago()
  const [importe, setImporte] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [medio, setMedio] = useState<'efectivo' | 'transferencia'>('efectivo')
  const [concepto, setConcepto] = useState('')
  const [error, setError] = useState<string | null>(null)

  const cent = pesosACent(importe)
  const despues = Number.isFinite(cent) ? saldo - cent : saldo

  async function onGuardar() {
    if (!(cent > 0)) return setError('Escribí el importe que pagó.')
    setError(null)
    try {
      const r = await pagar.mutateAsync({
        client_uuid: crypto.randomUUID(), alumno_id: alumno.id, importe_cent: cent, fecha,
        medio_pago: modulos.medio_pago ? medio : null, concepto: concepto.trim() || null, cargado_at: new Date().toISOString(),
      })
      toast(r.pendiente ? `Pago de ${pesos(cent)} guardado sin conexión: se envía solo cuando vuelva internet` : `Pago de ${pesos(cent)} registrado`)
      onCerrar()
    } catch (e) { setError(mensajeError(e)) }
  }

  return (
    <Hoja titulo={`Pago de ${alumno.nombre}`} onCerrar={onCerrar} pie={
      <button className="btn" onClick={onGuardar} disabled={pagar.isPending}>{pagar.isPending ? 'Guardando…' : 'Registrar pago'}</button>
    }>
      <Campo etiqueta="Importe" htmlFor="pi">
        <CampoNumero id="pi" valor={importe} onCambio={(t) => setImporte(t)} placeholder="$" />
        {saldo > 0 && <button className="btn ghost sm" onClick={() => setImporte(centATexto(saldo))}>Paga todo: {pesos(saldo)}</button>}
      </Campo>
      <Campo etiqueta="Fecha" htmlFor="pf">
        <input id="pf" className="inp" type="date" value={fecha} max={hoyISO()} onChange={(e) => e.target.value && setFecha(e.target.value)} />
      </Campo>
      {modulos.medio_pago && (
        <Campo etiqueta="Medio de pago">
          <Segmentado etiqueta="Medio de pago" valor={medio} onCambio={setMedio} opciones={[['efectivo', 'Efectivo'], ['transferencia', 'Transferencia']]} />
        </Campo>
      )}
      <Campo etiqueta="Detalle (opcional)" htmlFor="pc">
        <input id="pc" className="inp" value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Pago" />
      </Campo>
      {cent > 0 && (
        <p className="small">
          Después del pago: {despues > 0 ? <>queda debiendo <b>{pesos(despues)}</b></> : despues < 0 ? <>queda <b>{pesos(-despues)}</b> a favor</> : <b>al día</b>}.
          {' '}Se aplica a los consumos más viejos primero.
        </p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </Hoja>
  )
}
