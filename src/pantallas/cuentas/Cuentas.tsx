import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCantina } from '../../sesion/Sesion'
import { useAlumnos, useAnotarDiasFijos, useApi, useListas, usePartidasAbiertas, useSaldos } from '../../datos/consultas'
import { useEnLinea } from '../../offline/Conexion'
import { hoyISO, pesos } from '../../lib/formato'
import { mensajeError } from '../../lib/errores'
import { descargar } from '../../lib/descargar'
import { excelCuentas, nombreExcelCuentas } from '../../lib/exportarCuentas'
import { Chips } from '../../componentes/Controles'
import { Icono } from '../../componentes/Icono'
import { useToast } from '../../componentes/Toast'
import { Cargando, Vacio } from '../../componentes/Vacio'
import { EditorAlumno } from './EditorAlumno'
import { useCola } from '../../offline/Conexion'
import { deltaSaldo, tienePendientes } from '../../offline/provisorio'

/** "Debe $ 1.230,00" / "A favor $ 50,00" / "Al día". */
export function TextoSaldo({ saldo }: { saldo: number }) {
  if (saldo > 0) return <b className="num" style={{ color: 'var(--warn)' }}>{pesos(saldo)}</b>
  if (saldo < 0) return <b className="num" style={{ color: 'var(--ok)' }}>A favor {pesos(-saldo)}</b>
  return <span className="muted small">Al día</span>
}

export function Cuentas() {
  const { cantina, puede, dic, modulos } = useCantina()
  const listas = useListas()
  const nombreLista = new Map((listas.data ?? []).filter((l) => !l.es_default).map((l) => [l.id, l.nombre]))
  const diasFijos = useAnotarDiasFijos()
  const enLinea = useEnLinea()
  const navigate = useNavigate()
  const toast = useToast()
  const api = useApi()
  const alumnos = useAlumnos()
  const saldos = useSaldos()
  const partidas = usePartidasAbiertas()
  const [q, setQ] = useState('')
  const [orden, setOrden] = useState<'nombre' | 'deuda'>('nombre')
  const [nuevo, setNuevo] = useState(false)
  const [armando, setArmando] = useState(false)

  const { pendientes } = useCola()
  // Saldo del servidor más lo que todavía no se envió (provisorio).
  const s = useMemo(() => Object.fromEntries((alumnos.data ?? []).map((a) => [a.id, (saldos.data?.[a.id] ?? 0) + deltaSaldo(pendientes, a.id)])), [alumnos.data, saldos.data, pendientes])
  const lista = useMemo(() => {
    const texto = q.trim().toLowerCase()
    return (alumnos.data ?? [])
      .filter((a) => a.activo || (s[a.id] ?? 0) !== 0)
      .filter((a) => !texto || a.nombre.toLowerCase().includes(texto) || (a.responsable_nombre ?? '').toLowerCase().includes(texto))
      .sort((a, b) => (orden === 'deuda' ? (s[b.id] ?? 0) - (s[a.id] ?? 0) : 0) || a.nombre.localeCompare(b.nombre, 'es'))
  }, [alumnos.data, s, q, orden])

  const total = Object.values(s).reduce((a, x) => a + Math.max(0, x), 0)
  const deudores = Object.values(s).filter((x) => x > 0).length

  async function bajarExcel() {
    setArmando(true)
    try {
      const XLSX = await import('xlsx')
      const porId = new Map((alumnos.data ?? []).map((a) => [a.id, a]))
      const pend = partidas.data ?? await api.partidasAbiertas(cantina.id)
      const wb = excelCuentas(XLSX,
        (alumnos.data ?? []).map((a) => ({ alumno: a.nombre, responsable: a.responsable_nombre, telefono: a.responsable_telefono, saldo_cent: s[a.id] ?? 0 })),
        pend.map((p) => ({ alumno: porId.get(p.alumno_id)?.nombre ?? '—', fecha: p.fecha, concepto: p.concepto, importe_cent: p.importe_cent, pendiente_cent: p.pendiente_cent })), dic.T('alumno'))
      descargar(new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })]), nombreExcelCuentas(hoyISO()))
      toast('Excel descargado')
    } catch (e) {
      toast(mensajeError(e))
    } finally {
      setArmando(false)
    }
  }

  if (alumnos.isPending) return <Cargando texto="Cargando cuentas…" />
  if (alumnos.error) return <Vacio><p>{mensajeError(alumnos.error)}</p></Vacio>

  return (
    <>
      <h2>Cuentas</h2>
      {(alumnos.data?.length ?? 0) === 0 ? (
        <Vacio>
          <p>Todavía no hay {dic.t('alumnos')} con cuenta. {puede('gestionar_alumnos') ? `Dá de alta al primero para anotarle consumos.` : 'Cuando la dueña los cargue, los vas a ver acá.'}</p>
          {puede('gestionar_alumnos') && <button className="btn" onClick={() => setNuevo(true)}>Nuevo {dic.t('alumno')}</button>}
        </Vacio>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi"><b style={{ color: total ? 'var(--warn)' : 'inherit' }}>{pesos(total)}</b><span>total adeudado</span></div>
            <div className="kpi"><b>{deudores}</b><span>{dic.t('alumnos')} con deuda</span></div>
          </div>
          <input className="inp" type="search" placeholder={`Buscar ${dic.t('alumno')} o responsable`} aria-label="Buscar"
            value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="spread">
            <Chips etiqueta="Ordenar" valor={orden} onCambio={setOrden} opciones={[['nombre', 'Por nombre'], ['deuda', 'Por deuda']]} />
            <div className="row" style={{ gap: 6 }}>
              {modulos.dias_fijos && puede('gestionar_alumnos') && (
                <button className="btn ghost sm" disabled={diasFijos.isPending || !enLinea} onClick={async () => {
                  try {
                    const n = await diasFijos.mutateAsync(hoyISO())
                    toast(n ? `Se anotó el menú de hoy a ${n} ${n === 1 ? dic.t('alumno') : dic.t('alumnos')} con día fijo` : 'No había días fijos para anotar hoy (o ya estaban anotados).')
                  } catch (e) { toast(mensajeError(e)) }
                }}>Días fijos de hoy</button>
              )}
              <button className="btn ghost sm" onClick={() => void bajarExcel()} disabled={armando}>{armando ? 'Armando…' : 'Excel'}</button>
            </div>
          </div>
          {lista.length === 0 ? <Vacio><p>No hay {dic.t('alumnos')} con ese nombre.</p></Vacio> : (
            <section className="card">
              <div className="list">
                {lista.map((a) => (
                  <button className="li" key={a.id} onClick={() => navigate(`/cuentas/${a.id}`)} style={{ opacity: a.activo ? 1 : 0.6 }}>
                    <div className="main">
                      <b>{a.nombre}</b>
                      {a.responsable_nombre && <span className="small muted">{a.responsable_nombre}</span>}
                      {modulos.listas_precio && a.lista_id && nombreLista.has(a.lista_id) && <span className="pill mute">{nombreLista.get(a.lista_id)}</span>}
                    </div>
                    <div className="side" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <TextoSaldo saldo={s[a.id] ?? 0} />
                      {tienePendientes(pendientes, a.id) && <span className="pill prov">provisorio</span>}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}
      {puede('gestionar_alumnos') && (alumnos.data?.length ?? 0) > 0 && (
        <button className="fab" onClick={() => setNuevo(true)}><Icono nombre="plus" grosor={2.5} />Nuevo {dic.t('alumno')}</button>
      )}
      {nuevo && <EditorAlumno alumno={null} onCerrar={() => setNuevo(false)} onCreado={(id) => navigate(`/cuentas/${id}`)} />}
    </>
  )
}
