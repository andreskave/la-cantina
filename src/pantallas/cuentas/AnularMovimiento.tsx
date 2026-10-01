import { useState } from 'react'
import { Hoja } from '../../componentes/Hoja'
import { BotonBorrar, Campo } from '../../componentes/Controles'
import { useToast } from '../../componentes/Toast'
import { useAnularMovimiento } from '../../datos/consultas'
import { capitalizar, fechaLarga, pesos } from '../../lib/formato'
import { mensajeError } from '../../lib/errores'
import type { Movimiento } from '../../datos/tipos'
import { AvisoSinConexion, useEnLinea } from '../../offline/Conexion'

export function AnularMovimiento({ movimiento: m, onCerrar }: { movimiento: Movimiento; onCerrar: () => void }) {
  const toast = useToast()
  const enLinea = useEnLinea()
  const anular = useAnularMovimiento()
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onAnular() {
    if (!motivo.trim()) return setError('Escribí por qué lo anulás.')
    try {
      await anular.mutateAsync({ id: m.id, motivo: motivo.trim() })
      toast('Movimiento anulado')
      onCerrar()
    } catch (e) { setError(mensajeError(e)) }
  }

  return (
    <Hoja titulo={m.tipo === 'pago' ? 'Anular pago' : 'Anular consumo'} onCerrar={onCerrar} pie={
      <BotonBorrar texto="Anular" onBorrar={onAnular} disabled={anular.isPending || !enLinea} />
    }>
      <div className="summary">
        <b>{m.concepto}{m.cantidad !== 1 ? ` × ${m.cantidad}` : ''}</b>
        <span className="small muted">{capitalizar(fechaLarga(m.fecha))} · {pesos(m.importe_cent)}</span>
      </div>
      <p className="small muted">
        Los movimientos no se borran: queda anulado con el motivo y se recalcula la cuenta.
        {m.tipo === 'pago' && ' También se anula el cobro en Caja.'}
      </p>
      <Campo etiqueta="Motivo" htmlFor="am">
        <input id="am" className="inp" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: Faltó ese día" />
      </Campo>
      <AvisoSinConexion que="anular movimientos" />
      {error && <p className="error" role="alert">{error}</p>}
    </Hoja>
  )
}
