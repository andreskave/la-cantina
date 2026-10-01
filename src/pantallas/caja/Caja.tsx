import { useMemo, useState } from 'react'
import { useCantina } from '../../sesion/Sesion'
import { useCaja, useDeudaCuentasAl, useProveedores } from '../../datos/consultas'
import { conSigno, esIngreso, resumenCaja, TIPO_CAJA_TXT, type MovCaja } from '../../lib/caja'
import { primerDia, ultimoDia, mesMas } from '../../lib/fechas'
import { MESES, hoyISO, mesNombre, pesos } from '../../lib/formato'
import { mensajeError } from '../../lib/errores'
import { Icono } from '../../componentes/Icono'
import { useToast } from '../../componentes/Toast'
import { Cargando, Vacio } from '../../componentes/Vacio'
import { EditorMovCaja } from './EditorMovCaja'
import { useCola } from '../../offline/Conexion'
import { cajaPendiente } from '../../offline/provisorio'
import { CierreDia } from './CierreDia'

type Hoja = { tipo: 'mov'; mov: MovCaja | null } | { tipo: 'cierre' } | null

export function Caja() {
  const { modulos, dic } = useCantina()
  const toast = useToast()
  const hoy = hoyISO()
  const [mes, setMes] = useState(hoy.slice(0, 7))
  const [hoja, setHoja] = useState<Hoja>(null)
  const desde = primerDia(mes)
  const hasta = ultimoDia(mes)
  const caja = useCaja(desde, hasta)
  const proveedores = useProveedores()
  const cierreDeuda = hasta < hoy ? hasta : hoy
  const deuda = useDeudaCuentasAl(cierreDeuda)

  const { pendientes } = useCola()
  const sinEnviar = useMemo(() => cajaPendiente(pendientes, desde, hasta), [pendientes, desde, hasta])
  const idsSinEnviar = new Set(sinEnviar.map((m) => m.id))
  const movs = useMemo(() => [...sinEnviar, ...(caja.data ?? [])], [sinEnviar, caja.data])
  const r = useMemo(() => resumenCaja(movs), [movs])
  const nombreProv = new Map((proveedores.data ?? []).map((p) => [p.id, p.nombre]))
  const porDia = useMemo(() => {
    const m = new Map<string, MovCaja[]>()
    for (const x of movs) m.set(x.fecha, [...(m.get(x.fecha) ?? []), x])
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [movs])

  function abrir(m: MovCaja) {
    if (idsSinEnviar.has(m.id)) {
      toast('Este movimiento todavía no se envió. Se va a poder editar cuando se sincronice.')
      return
    }
    if (m.origen === 'cuenta_corriente') {
      toast(`Este cobro viene de una cuenta corriente. Para anularlo, anulá el pago en la cuenta del ${dic.t('alumno')}.`)
      return
    }
    setHoja({ tipo: 'mov', mov: m })
  }

  const linea = (texto: string, valor: number, signo: '+' | '−' = '+') => valor !== 0 && (
    <div className="spread small" key={texto}><span className="muted">{texto}</span><span className="num">{signo === '−' ? '−' : ''}{pesos(valor)}</span></div>
  )

  return (
    <>
      <div className="monthbar">
        <button className="iconbtn" onClick={() => setMes(mesMas(mes, -1))} aria-label="Mes anterior"><Icono nombre="izq" /></button>
        <h2>{mesNombre(mes)}</h2>
        <button className="iconbtn" onClick={() => setMes(mesMas(mes, 1))} aria-label="Mes siguiente"><Icono nombre="der" /></button>
      </div>
      {modulos.cierre_dia && <button className="btn ghost" onClick={() => setHoja({ tipo: 'cierre' })}>Cierre del día</button>}

      {caja.error ? <Vacio><p>{mensajeError(caja.error)}</p></Vacio> : caja.isPending ? <Cargando texto="Cargando la caja…" /> : (
        <>
          <div className="kpis">
            <div className="kpi"><b>{pesos(r.ingresos, { sinCentesimos: true })}</b><span>entró</span></div>
            <div className="kpi"><b>{pesos(r.egresos, { sinCentesimos: true })}</b><span>salió</span></div>
            <div className="kpi" style={{ gridColumn: '1 / -1' }}>
              <b style={{ color: r.resultado < 0 ? 'var(--warn)' : 'var(--ok)' }}>{pesos(r.resultado, { sinCentesimos: true })}</b>
              <span>resultado de caja de {MESES[Number(mes.slice(5)) - 1]}</span>
            </div>
          </div>

          <section className="card stack" style={{ gap: 6 }}>
            <p className="eyebrow">Detalle del mes</p>
            {linea('Ventas al contado', r.contado)}
            {linea('Cobros de cuentas', r.cobros)}
            {linea('Otros ingresos', r.otrosIngresos)}
            {linea('Compras', r.compras, '−')}
            {linea('Sueldos', r.gastosFijos.Sueldos, '−')}
            {linea('Gas', r.gastosFijos.Gas, '−')}
            {linea('Otros gastos fijos', r.gastosFijos.Otros, '−')}
            {linea('Otros egresos', r.otrosEgresos, '−')}
            {modulos.medio_pago && (
              <>
                <hr style={{ border: 0, borderTop: '1px solid var(--line)', width: '100%' }} />
                <div className="spread small"><span className="muted">Neto en efectivo</span><span className="num">{pesos(r.porMedio.efectivo)}</span></div>
                <div className="spread small"><span className="muted">Neto por transferencia</span><span className="num">{pesos(r.porMedio.transferencia)}</span></div>
                {r.porMedio.sin_dato !== 0 && <div className="spread small"><span className="muted">Sin medio de pago</span><span className="num">{pesos(r.porMedio.sin_dato)}</span></div>}
              </>
            )}
            <hr style={{ border: 0, borderTop: '1px solid var(--line)', width: '100%' }} />
            <div className="spread small">
              <span className="muted">Deuda total de cuentas corrientes {cierreDeuda === hoy ? 'hoy' : `al ${Number(cierreDeuda.slice(8))}/${Number(cierreDeuda.slice(5, 7))}`}</span>
              <span className="num" style={{ color: 'var(--warn)' }}>{deuda.data !== undefined ? pesos(deuda.data) : '…'}</span>
            </div>
            <p className="hint">La deuda no es plata que entró: se muestra aparte.</p>
          </section>

          {movs.length === 0 ? (
            <Vacio>
              <p>Sin movimientos este mes. Anotá ventas, compras y gastos para ver el resultado.</p>
              <button className="btn" onClick={() => setHoja({ tipo: 'mov', mov: null })}>Anotar el primero</button>
            </Vacio>
          ) : (
            <section className="card">
              <div className="list">
                {porDia.map(([fecha, items]) => items.map((m, i) => (
                  <button className="li" key={m.id} onClick={() => abrir(m)} style={{ opacity: m.anulado ? 0.5 : 1 }}>
                    <div className="datebox" style={{ visibility: i === 0 ? 'visible' : 'hidden' }}>
                      <b>{Number(fecha.slice(8))}</b><span>{MESES[Number(fecha.slice(5, 7)) - 1].slice(0, 3)}</span>
                    </div>
                    <div className="main">
                      <b style={m.anulado ? { textDecoration: 'line-through' } : undefined}>{m.concepto || TIPO_CAJA_TXT[m.tipo]}</b>
                      <span className="small muted">
                        {TIPO_CAJA_TXT[m.tipo]}
                        {m.subcategoria && m.tipo === 'gasto_fijo' ? ` · ${m.subcategoria}` : ''}
                        {m.proveedor_id ? ` · ${nombreProv.get(m.proveedor_id) ?? ''}` : ''}
                        {m.medio_pago ? ` · ${m.medio_pago}` : ''}
                        {m.anulado ? ' · anulado' : ''}
                      </span>
                      {idsSinEnviar.has(m.id) && <span className="pill prov">sin sincronizar</span>}
                    </div>
                    <div className="side num" style={{ color: esIngreso(m.tipo) ? 'var(--ok)' : undefined }}>
                      {conSigno(m) < 0 ? '−' : '+'}{pesos(m.importe_cent)}
                    </div>
                  </button>
                )))}
              </div>
            </section>
          )}
        </>
      )}

      {(movs.length > 0 || caja.isPending) && (
        <button className="fab" onClick={() => setHoja({ tipo: 'mov', mov: null })}><Icono nombre="plus" grosor={2.5} />Movimiento</button>
      )}
      {hoja?.tipo === 'mov' && <EditorMovCaja mov={hoja.mov} fechaPorDefecto={mes === hoy.slice(0, 7) ? hoy : ultimoDia(mes) < hoy ? ultimoDia(mes) : hoy} onCerrar={() => setHoja(null)} />}
      {hoja?.tipo === 'cierre' && <CierreDia onCerrar={() => setHoja(null)} />}
    </>
  )
}
