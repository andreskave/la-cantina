import { useState } from 'react'
import { useAlumnos } from '../datos/consultas'
import { Hoja } from '../componentes/Hoja'
import { BotonBorrar } from '../componentes/Controles'
import { capitalizar, fechaLarga, pesos } from '../lib/formato'
import { useCola, useEnLinea } from './Conexion'

const TIPO = { consumo: 'Consumo', pago: 'Pago', caja: 'Caja' } as const

/** Avisos debajo del encabezado: sin conexión y movimientos sin sincronizar. */
export function IndicadorConexion() {
  const enLinea = useEnLinea()
  const { pendientes } = useCola()
  const [abierto, setAbierto] = useState(false)
  const porEnviar = pendientes.filter((p) => p.estado === 'pendiente').length
  const rechazados = pendientes.length - porEnviar

  return (
    <>
      {!enLinea && (
        <div className="banner" role="status">
          <b>Sin conexión.</b> Estás viendo lo último guardado en este dispositivo. Podés anotar consumos, pagos y
          movimientos de caja: se envían solos cuando vuelva internet.
        </div>
      )}
      {pendientes.length > 0 && (
        <button className={`banner aviso-cola${rechazados ? ' con-error' : ''}`} onClick={() => setAbierto(true)}>
          {porEnviar > 0 && <>{porEnviar} movimiento{porEnviar > 1 ? 's' : ''} sin sincronizar</>}
          {porEnviar > 0 && rechazados > 0 && ' · '}
          {rechazados > 0 && <>{rechazados} no se pud{rechazados > 1 ? 'ieron' : 'o'} guardar</>}
          <span className="muted"> · Ver</span>
        </button>
      )}
      {abierto && <HojaPendientes onCerrar={() => setAbierto(false)} />}
    </>
  )
}

function HojaPendientes({ onCerrar }: { onCerrar: () => void }) {
  const enLinea = useEnLinea()
  const { pendientes, sincronizar, descartar } = useCola()
  const alumnos = useAlumnos()
  const [enviando, setEnviando] = useState(false)
  const nombre = (id: string | null) => (id ? alumnos.data?.find((a) => a.id === id)?.nombre ?? '' : '')

  return (
    <Hoja titulo="Sin sincronizar" onCerrar={onCerrar} pie={
      <button className="btn" disabled={!enLinea || enviando || !pendientes.some((p) => p.estado === 'pendiente')}
        onClick={async () => { setEnviando(true); await sincronizar(); setEnviando(false) }}>
        {enviando ? 'Enviando…' : enLinea ? 'Enviar ahora' : 'Esperando conexión'}
      </button>
    }>
      <p className="small muted">
        Se guardaron en este dispositivo y se envían solos cuando hay internet. Mientras tanto, los saldos que tocan
        aparecen como provisorios.
      </p>
      {pendientes.length === 0 ? <p className="muted">No queda nada por enviar.</p> : (
        <div className="list">
          {pendientes.map((p) => (
            <div className="li" key={p.client_uuid} style={{ flexWrap: 'wrap' }}>
              <div className="main">
                <b>{TIPO[p.tipo]}{p.alumno_id ? ` · ${nombre(p.alumno_id)}` : ''}</b>
                <span className="small muted">{p.concepto} · {capitalizar(fechaLarga(p.datos.fecha))}</span>
                {p.estado === 'rechazado' && <span className="small" style={{ color: 'var(--warn)', display: 'block' }}>No se guardó: {p.error}</span>}
              </div>
              <div className="side num">{p.tipo === 'pago' ? '−' : ''}{pesos(p.importe_cent)}</div>
              {p.estado === 'rechazado' && (
                <div style={{ width: '100%' }}>
                  <BotonBorrar texto="Descartar" onBorrar={() => void descartar(p.client_uuid)} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Hoja>
  )
}
