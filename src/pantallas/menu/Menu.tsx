import { useState } from 'react'
import { useCantina } from '../../sesion/Sesion'
import { useEstadosRango } from '../../datos/consultas'
import { primerDia, semanasDelMes, ultimoDia, mesMas } from '../../lib/fechas'
import { fechaLarga, hoyISO, mesNombre, numero, pesos } from '../../lib/formato'
import { resumenMes, semaforo } from '../../lib/menu'
import { mensajeError } from '../../lib/errores'
import { Icono } from '../../componentes/Icono'
import { Vacio } from '../../componentes/Vacio'
import { EditorDia, VistaDia } from './EditorDia'
import { CopiarMes } from './CopiarMes'
import { ExportarMenu } from './ExportarMenu'

type Hoja = { tipo: 'dia'; fecha: string } | { tipo: 'copiar' } | { tipo: 'exportar' } | null

export function Menu() {
  const { cantina, puede, dic } = useCantina()
  const gestiona = puede('editar_menu')
  const verCostos = puede('ver_costos')
  const hoy = hoyISO()
  const [mes, setMes] = useState(hoy.slice(0, 7))
  const [hoja, setHoja] = useState<Hoja>(null)
  const { estados, dias, precioDe, cargando, error } = useEstadosRango(primerDia(mes), ultimoDia(mes))

  const resumen = resumenMes([...estados.values()], precioDe, cantina.pedidos_por_defecto)
  const precioHoy = precioDe(hoy)

  return (
    <>
      <div className="monthbar">
        <button className="iconbtn" onClick={() => setMes(mesMas(mes, -1))} aria-label="Mes anterior"><Icono nombre="izq" /></button>
        <h2>{mesNombre(mes)}</h2>
        <button className="iconbtn" onClick={() => setMes(mesMas(mes, 1))} aria-label="Mes siguiente"><Icono nombre="der" /></button>
      </div>
      <div className="row wrap-r">
        {gestiona && <button className="btn ghost sm" onClick={() => setHoja({ tipo: 'copiar' })}>Copiar mes anterior</button>}
        <button className="btn ghost sm" onClick={() => setHoja({ tipo: 'exportar' })}>Exportar {dic.t('menu')}</button>
      </div>

      {error ? <Vacio><p>{mensajeError(error)}</p></Vacio> : (
        <div className="cal" lang="es" aria-busy={cargando}>
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie'].map((d) => <div className="dow" key={d}>{d}</div>)}
          {semanasDelMes(mes).flat().map((f, i) => {
            if (!f) return <div className="cell blank" aria-hidden="true" key={`b${i}`} />
            const e = estados.get(f)
            const cls = ['cell', f === hoy ? 'today' : '', e?.tipo === 'sin_cocina' ? 'closed' : ''].join(' ')
            return (
              <button className={cls} key={f} onClick={() => setHoja({ tipo: 'dia', fecha: f })} aria-label={fechaLarga(f)}>
                <span className="dn">{Number(f.slice(8))}</span>
                {e?.tipo === 'sin_cocina' && <span className="p muted">{e.motivo}</span>}
                {e?.tipo === 'menu' && (
                  <>
                    <span className="p">{e.plato?.nombre ?? '—'}</span>
                    <span className="d">{e.postre?.nombre ?? ''}</span>
                    {verCostos && (
                      <span className={`c ${semaforo(e.costo_cent, precioDe(f), cantina.objetivo_costo_pct) === 'ok' ? 'ok' : 'warn'}`}>
                        {e.costo_cent !== null ? pesos(e.costo_cent, { sinCentesimos: true }) : 'Sin costear'}
                      </span>
                    )}
                  </>
                )}
                {(!e || e.tipo === 'vacio') && gestiona && !cargando && <span className="add" aria-hidden="true">+</span>}
              </button>
            )
          })}
        </div>
      )}

      {verCostos && (
        <>
          <div className="legend">
            <span><span className="pill ok">$</span> dentro del objetivo ({numero(cantina.objetivo_costo_pct)}%)</span>
            <span><span className="pill warn">$</span> por encima o sin costear</span>
          </div>
          <div className="kpis">
            <div className="kpi"><b>{pesos(resumen.costoPromedio)}</b><span>costo promedio por menú</span></div>
            <div className="kpi"><b>{numero(resumen.menusEstimados)}</b><span>menús estimados en el mes</span></div>
            {resumen.gananciaPromedio !== null && (
              <div className="kpi" style={{ gridColumn: '1 / -1' }}>
                <b>{pesos(resumen.gananciaPromedio * resumen.menusEstimados, { sinCentesimos: true })}</b>
                <span>ganancia bruta estimada del mes{precioHoy ? ` (precio ${pesos(precioHoy, { sinCentesimos: true })} menos materia prima)` : ''}</span>
              </div>
            )}
          </div>
        </>
      )}

      {hoja?.tipo === 'dia' && (gestiona
        ? <EditorDia fecha={hoja.fecha} dia={dias.get(hoja.fecha)} estado={estados.get(hoja.fecha)} onCerrar={() => setHoja(null)} />
        : <VistaDia fecha={hoja.fecha} estado={estados.get(hoja.fecha)} onCerrar={() => setHoja(null)} />)}
      {hoja?.tipo === 'copiar' && <CopiarMes mes={mes} onCerrar={() => setHoja(null)} />}
      {hoja?.tipo === 'exportar' && <ExportarMenu mes={mes} estados={estados} precioDe={precioDe} onCerrar={() => setHoja(null)} />}
    </>
  )
}
