import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCantina } from '../sesion/Sesion'
import { useEstadosRango, useHistorialCantina, useInsumos, usePreciosVigentes, useRecetas } from '../datos/consultas'
import { DIAS_CORTOS, MESES, capitalizar, fechaLarga, hoyISO, numero, pesos } from '../lib/formato'
import { diaSemana, esHabil, habilesMes, primerDia, proximosHabiles, ultimoDia } from '../lib/fechas'
import { preciosQueCambiaron, resumenMes, semaforo, type EstadoDia } from '../lib/menu'
import { EditorDia, VistaDia } from './menu/EditorDia'

export function Hoy() {
  const { cantina, puede, dic } = useCantina()
  const gestiona = puede('editar_menu')
  const verCostos = puede('ver_costos')
  const hoy = hoyISO()
  const mes = hoy.slice(0, 7)
  const proximos = proximosHabiles(hoy, 5)
  const hasta = [ultimoDia(mes), proximos.at(-1)!].sort().at(-1)!
  const { estados, dias, precioDe } = useEstadosRango(primerDia(mes), hasta)
  const insumos = useInsumos()
  const recetas = useRecetas()
  const [abierto, setAbierto] = useState<string | null>(null)

  const sinDatos = (insumos.data?.length ?? 1) === 0 && (recetas.data?.length ?? 1) === 0
  const eHoy = estados.get(hoy)
  const resumen = resumenMes(habilesMes(mes).map((f) => estados.get(f)!).filter(Boolean), precioDe, cantina.pedidos_por_defecto)

  return (
    <>
      {gestiona && sinDatos && (
        <div className="banner">
          Empezá cargando tus <Link to="/insumos">insumos</Link> (lo que comprás) y después armá las <Link to="/recetas">recetas</Link>.
          Con eso el menú calcula solo el costo de cada día.
        </div>
      )}

      <Heroe fecha={hoy} estado={eHoy} precio={precioDe(hoy)} onEditar={() => setAbierto(hoy)} />

      <section className="card">
        <div className="sect-title">
          <h3>Próximos días</h3>
          <Link className="chip" to="/menu" style={{ textDecoration: 'none', color: 'inherit' }}>Ver mes</Link>
        </div>
        <div className="list">
          {proximos.map((f) => {
            const e = estados.get(f)
            return (
              <button className="li" key={f} onClick={() => setAbierto(f)}>
                <div className="datebox"><b>{Number(f.slice(8))}</b><span>{DIAS_CORTOS[diaSemana(f)]}</span></div>
                <div className="main">
                  {e?.tipo === 'sin_cocina' ? <b className="muted">{e.motivo}</b>
                    : e?.tipo === 'menu' ? <><b>{e.plato?.nombre ?? '—'}</b><span className="small muted">{e.postre?.nombre ?? ''}</span></>
                      : <b className="muted">Sin {dic.t('menu')} cargado</b>}
                </div>
                {verCostos && e?.tipo === 'menu' && (
                  <div className="side">
                    <span className={`pill ${semaforo(e.costo_cent, precioDe(f), cantina.objetivo_costo_pct)}`}>
                      {e.costo_cent !== null ? pesos(e.costo_cent) : 'Sin costear'}
                    </span>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </section>

      {verCostos && (
        <>
          <section>
            <div className="sect-title"><h3>Así viene {MESES[Number(mes.slice(5)) - 1]}</h3></div>
            <div className="kpis">
              <div className="kpi"><b>{pesos(resumen.costoPromedio)}</b><span>costo promedio por menú</span></div>
              <div className="kpi"><b>{pesos(resumen.gananciaPromedio)}</b><span>ganancia promedio por menú</span></div>
              <div className="kpi"><b>{resumen.diasCargados} / {resumen.diasConCocina}</b><span>días con menú cargado</span></div>
              <div className="kpi"><b style={{ color: resumen.diasSinCostear ? 'var(--warn)' : 'inherit' }}>{resumen.diasSinCostear}</b><span>días sin costear</span></div>
            </div>
          </section>
          <PreciosQueCambiaron hoy={hoy} />
        </>
      )}

      {abierto && (gestiona
        ? <EditorDia fecha={abierto} dia={dias.get(abierto)} estado={estados.get(abierto)} onCerrar={() => setAbierto(null)} />
        : <VistaDia fecha={abierto} estado={estados.get(abierto)} onCerrar={() => setAbierto(null)} />)}
    </>
  )
}

function Heroe({ fecha, estado, precio, onEditar }: { fecha: string; estado: EstadoDia | undefined; precio: number | null; onEditar: () => void }) {
  const { cantina, puede, dic } = useCantina()
  const gestiona = puede('editar_menu')
  const verCostos = puede('ver_costos')
  const titulo = capitalizar(fechaLarga(fecha))

  if (estado?.tipo === 'menu') {
    const s = semaforo(estado.costo_cent, precio, cantina.objetivo_costo_pct)
    const pedidos = estado.pedidos ?? cantina.pedidos_por_defecto
    return (
      <section className="hero">
        <div className="spread">
          <p className="eyebrow">{titulo}</p>
          {verCostos && (
            <span className={`pill ${s}`}>
              {estado.costo_cent === null ? 'Sin costear' : precio ? `${numero((estado.costo_cent / precio) * 100, 0)}% del precio` : pesos(estado.costo_cent)}
            </span>
          )}
        </div>
        <div>
          <p className="dish">{estado.plato?.nombre ?? `Sin ${dic.t('plato')}`}</p>
          <p className="dessert">{capitalizar(dic.t('postre'))}: {estado.postre?.nombre ?? '—'}</p>
        </div>
        <div className="stats" style={verCostos ? undefined : { gridTemplateColumns: '1fr' }}>
          <div><b>{pedidos || '—'}</b><span>{estado.pedidos === null && pedidos ? 'menús (por defecto)' : 'menús pedidos'}</span></div>
          {verCostos && <div><b>{estado.costo_cent !== null ? pesos(estado.costo_cent) : '—'}</b><span>costo por menú</span></div>}
          {verCostos && <div><b>{estado.costo_cent !== null && precio ? pesos(precio - estado.costo_cent) : '—'}</b><span>ganancia por menú</span></div>}
        </div>
        {gestiona && <button className="btn sm" onClick={onEditar}>Editar el día</button>}
      </section>
    )
  }

  const texto = estado?.tipo === 'sin_cocina' ? estado.motivo
    : !esHabil(fecha) ? 'Hoy es fin de semana'
      : gestiona ? `Todavía no cargaste el ${dic.t('menu')} de hoy` : `Todavía no hay ${dic.t('menu')} cargado para hoy`
  return (
    <section className="hero vacio">
      <p className="eyebrow">{titulo}</p>
      <h2>{texto}</h2>
      {gestiona && esHabil(fecha) && estado?.tipo !== 'sin_cocina' && (
        <button className="btn" onClick={onEditar}>Cargar el {dic.t('menu')} de hoy</button>
      )}
    </section>
  )
}

function PreciosQueCambiaron({ hoy }: { hoy: string }) {
  const historial = useHistorialCantina()
  const insumos = useInsumos()
  const precios = usePreciosVigentes()
  const nombres = useMemo(() => new Map((insumos.data ?? []).map((i) => [i.id, i.nombre])), [insumos.data])
  const cambios = useMemo(() => preciosQueCambiaron(historial.data ?? [], hoy), [historial.data, hoy])
  const conPrecio = new Set((precios.data ?? []).map((p) => p.insumo_id))
  const sinPrecio = (insumos.data ?? []).filter((i) => i.activo && !conPrecio.has(i.id)).length

  return (
    <section className="card">
      <div className="sect-title"><h3>Precios que cambiaron</h3><span className="small muted">últimos 30 días</span></div>
      {cambios.length ? (
        <div className="list">
          {cambios.slice(0, 6).map((c) => (
            <div className="li" key={c.insumo_id}>
              <div className="main">
                <b>{nombres.get(c.insumo_id) ?? '—'}</b>
                <span className="small muted">
                  Actualizado el {Number(c.fecha.slice(8))}/{Number(c.fecha.slice(5, 7))} · ahora {pesos(c.ahora.precio_cent)} por {numero(c.ahora.cantidad)} {c.ahora.unidad}
                </span>
              </div>
              <div className={`side num ${c.variacion > 0 ? 'up' : 'down'}`}>{c.variacion > 0 ? '▲' : '▼'} {numero(Math.abs(c.variacion) * 100, 1)}%</div>
            </div>
          ))}
        </div>
      ) : <p className="muted small">Cuando actualices un precio en Insumos, aparece acá con cuánto subió o bajó.</p>}
      {sinPrecio > 0 && (
        <p className="small" style={{ marginTop: 8, color: 'var(--warn)' }}>
          <Link to="/insumos" style={{ color: 'inherit' }}>{sinPrecio} insumo{sinPrecio > 1 ? 's' : ''} sin precio cargado.</Link>
        </p>
      )}
    </section>
  )
}
