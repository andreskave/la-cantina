import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCantina } from '../../sesion/Sesion'
import { useAlumnos, useMovimientos, usePartidasAbiertas, useSaldos } from '../../datos/consultas'
import { MESES, pesos } from '../../lib/formato'
import { mensajeError } from '../../lib/errores'
import { Icono } from '../../componentes/Icono'
import { useToast } from '../../componentes/Toast'
import { Cargando, Vacio } from '../../componentes/Vacio'
import type { Movimiento } from '../../datos/tipos'
import { EditorAlumno } from './EditorAlumno'
import { AnotarConsumo } from './AnotarConsumo'
import { RegistrarPago } from './RegistrarPago'
import { AnularMovimiento } from './AnularMovimiento'
import { HojaEstadoCuenta } from './HojaEstadoCuenta'
import { useCola } from '../../offline/Conexion'
import { deltaSaldo, movimientosPendientes } from '../../offline/provisorio'
import { partidasAbiertas } from '../../lib/cuentas'

type Hoja = 'consumo' | 'pago' | 'editar' | 'estado' | { anular: Movimiento } | null

function CajaFecha({ fecha }: { fecha: string }) {
  return <div className="datebox"><b>{Number(fecha.slice(8))}</b><span>{MESES[Number(fecha.slice(5, 7)) - 1].slice(0, 3)}</span></div>
}

export async function copiarTexto(texto: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(texto); return true } catch { return false }
}

export function FichaAlumno() {
  const { id = '' } = useParams()
  const { puede, dic } = useCantina()
  const toast = useToast()
  const alumnos = useAlumnos()
  const saldos = useSaldos()
  const movimientos = useMovimientos(id)
  const partidas = usePartidasAbiertas(id)
  const [hoja, setHoja] = useState<Hoja>(null)

  const { pendientes } = useCola()

  const alumno = alumnos.data?.find((a) => a.id === id)
  // Lo que todavía no se envió se suma como provisorio.
  const pend = movimientosPendientes(pendientes, id)
  const idsPend = new Set(pend.map((m) => m.id))
  const hayPend = pend.length > 0
  const saldo = (saldos.data?.[id] ?? 0) + deltaSaldo(pendientes, id)
  const listaMovs = [...pend, ...(movimientos.data ?? [])]
  const listaPartidas = hayPend && movimientos.data
    ? partidasAbiertas([...movimientos.data, ...pend]).map((p) => ({
      cargo_id: p.cargo.id, alumno_id: id, fecha: p.cargo.fecha, concepto: p.cargo.concepto, importe_cent: p.cargo.importe_cent, pendiente_cent: p.pendiente_cent,
    }))
    : partidas.data

  if (alumnos.isPending) return <Cargando />
  if (!alumno) return <Vacio><p>No encontramos esa cuenta.</p><Link className="btn link" to="/cuentas">Volver a Cuentas</Link></Vacio>

  return (
    <>
      <Link to="/cuentas" className="row small muted" style={{ textDecoration: 'none', color: 'inherit', gap: 4 }}>
        <span style={{ width: 18, height: 18, display: 'inline-flex' }}><Icono nombre="izq" /></span>Cuentas
      </Link>

      <section className="card stack">
        <div className="spread">
          <h2>{alumno.nombre}</h2>
          {puede('gestionar_alumnos') && <button className="btn ghost sm" onClick={() => setHoja('editar')}>Editar</button>}
        </div>
        <div>
          <p className="eyebrow">{saldo > 0 ? 'Debe' : saldo < 0 ? 'Saldo a favor' : 'Cuenta'}{hayPend && <> · <span className="pill prov">provisorio</span></>}</p>
          <p className="summary-big" style={{ fontFamily: 'var(--f-display)', fontSize: '2rem', fontWeight: 800 }}>
            {saldo === 0 ? 'Al día' : <span className="num" style={{ color: saldo > 0 ? 'var(--warn)' : 'var(--ok)' }}>{pesos(Math.abs(saldo))}</span>}
          </p>
        </div>
        {(alumno.responsable_nombre || alumno.responsable_telefono) && (
          <div className="spread small">
            <span className="muted">
              {dic.T('responsable')}: {alumno.responsable_nombre ?? '—'}
              {alumno.responsable_telefono && <> · <span className="num">{alumno.responsable_telefono}</span></>}
            </span>
            {alumno.responsable_telefono && (
              <button className="btn ghost sm" onClick={async () => toast(await copiarTexto(alumno.responsable_telefono!) ? 'Teléfono copiado' : 'No se pudo copiar')}>
                Copiar teléfono
              </button>
            )}
          </div>
        )}
        {alumno.notas && <p className="small muted">{alumno.notas}</p>}
        <button className="btn" onClick={() => setHoja('consumo')}>Anotar consumo</button>
        <div className={puede('registrar_pago') ? 'grid2' : 'stack'}>
          {puede('registrar_pago') && <button className="btn ghost" onClick={() => setHoja('pago')}>Registrar pago</button>}
          <button className="btn ghost" onClick={() => setHoja('estado')}>Estado de cuenta</button>
        </div>
      </section>

      <section className="card">
        <div className="sect-title"><h3>Partidas abiertas</h3><span className="small muted">lo que falta pagar</span></div>
        {!listaPartidas ? <p className="muted">Cargando…</p> : listaPartidas.length === 0 ? (
          <p className="muted small">No hay consumos pendientes de pago.</p>
        ) : (
          <div className="list">
            {listaPartidas.map((p) => (
              <div className="li" key={p.cargo_id}>
                <CajaFecha fecha={p.fecha} />
                <div className="main"><b>{p.concepto}</b>{p.pendiente_cent !== p.importe_cent && <span className="small muted">de {pesos(p.importe_cent)}</span>}</div>
                <div className="side num"><b>{pesos(p.pendiente_cent)}</b></div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div className="sect-title"><h3>Movimientos</h3>{puede('anular_movimiento') && <span className="small muted">tocá uno para anularlo</span>}</div>
        {movimientos.error ? <p className="error">{mensajeError(movimientos.error)}</p>
          : movimientos.isPending ? <p className="muted">Cargando…</p>
            : listaMovs.length === 0 ? <p className="muted small">Todavía no hay movimientos.</p> : (
              <div className="list">
                {listaMovs.map((m) => {
                  const contenido = (
                    <>
                      <CajaFecha fecha={m.fecha} />
                      <div className="main">
                        <b style={m.anulado ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>
                          {m.concepto}{m.cantidad !== 1 ? ` × ${m.cantidad}` : ''}
                        </b>
                        {m.anulado && <span className="small" style={{ color: 'var(--warn)' }}>Anulado: {m.anulado_motivo}</span>}
                        {idsPend.has(m.id) && <span className="pill prov">sin sincronizar</span>}
                      </div>
                      <div className="side num" style={{ color: m.tipo === 'pago' ? 'var(--ok)' : undefined, opacity: m.anulado ? 0.5 : 1 }}>
                        {m.tipo === 'pago' ? '−' : ''}{pesos(m.importe_cent)}
                      </div>
                    </>
                  )
                  return puede('anular_movimiento') && !m.anulado && !idsPend.has(m.id)
                    ? <button className="li" key={m.id} onClick={() => setHoja({ anular: m })}>{contenido}</button>
                    : <div className="li" key={m.id}>{contenido}</div>
                })}
              </div>
            )}
      </section>

      {hoja === 'editar' && <EditorAlumno alumno={alumno} onCerrar={() => setHoja(null)} />}
      {hoja === 'consumo' && <AnotarConsumo alumno={alumno} onCerrar={() => setHoja(null)} />}
      {hoja === 'pago' && <RegistrarPago alumno={alumno} saldo={saldo} onCerrar={() => setHoja(null)} />}
      {hoja === 'estado' && <HojaEstadoCuenta alumno={alumno} saldo={saldo} partidas={listaPartidas ?? []} onCerrar={() => setHoja(null)} />}
      {hoja && typeof hoja === 'object' && <AnularMovimiento movimiento={hoja.anular} onCerrar={() => setHoja(null)} />}
    </>
  )
}
