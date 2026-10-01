import { useState } from 'react'
import { useCantina } from '../../sesion/Sesion'
import { useCosteo, usePrecioMenu, useRecetas } from '../../datos/consultas'
import { TIPO_RECETA_TXT, type TipoReceta } from '../../lib/catalogo'
import { numero, pesos } from '../../lib/formato'
import { mensajeError } from '../../lib/errores'
import { Chips } from '../../componentes/Controles'
import { Icono } from '../../componentes/Icono'
import { Cargando, Vacio } from '../../componentes/Vacio'
import type { Receta } from '../../datos/tipos'
import { EditorReceta } from './EditorReceta'
import { VistaReceta } from './VistaReceta'

const AYUDA: Record<TipoReceta, string> = {
  plato: 'El costo es por porción. El porcentaje compara con el precio del menú.',
  postre: 'El postre se suma al costo del plato en el menú del día.',
  preparacion: 'Tuco, puré, salsas: se cocinan en olla y se usan como ingrediente en otros platos. Si cambia un precio, se actualiza todo.',
}

export function Recetas() {
  const { puede, cantina } = useCantina()
  const gestiona = puede('editar_catalogo')
  const recetas = useRecetas()
  const { costeo } = useCosteo()
  const precioMenu = usePrecioMenu()
  const [tipo, setTipo] = useState<TipoReceta>('plato')
  const [abierta, setAbierta] = useState<{ receta: Receta | null } | null>(null)

  if (recetas.isPending) return <Cargando texto="Cargando recetas…" />
  if (recetas.error) return <Vacio><p>{mensajeError(recetas.error)}</p></Vacio>

  const lista = (recetas.data ?? []).filter((r) => r.tipo === tipo)
    .sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, 'es'))
  const objetivo = cantina.objetivo_costo_pct / 100

  return (
    <>
      <h2>Recetas</h2>
      <Chips etiqueta="Tipo de receta" valor={tipo} onCambio={setTipo}
        opciones={(['plato', 'postre', 'preparacion'] as const).map((t) => [t, TIPO_RECETA_TXT[t].varios])} />
      {gestiona && <p className="small muted">{AYUDA[tipo]}</p>}

      {lista.length === 0 ? (
        <Vacio>
          <p>Todavía no hay {TIPO_RECETA_TXT[tipo].varios.toLowerCase()}.</p>
          {gestiona && <button className="btn" onClick={() => setAbierta({ receta: null })}>Crear la primera</button>}
        </Vacio>
      ) : (
        <section className="card">
          <div className="list">
            {lista.map((r) => {
              const c = costeo.receta(r.id)!
              let sub: string
              let lado = null
              if (r.tipo === 'preparacion') {
                const rinde = r.rinde_cantidad && r.rinde_unidad ? `Rinde ${numero(r.rinde_cantidad)} ${r.rinde_unidad}` : 'Falta cargar cuánto rinde'
                sub = gestiona && c.completo && r.rinde_unidad && r.rinde_cantidad
                  ? `${rinde} · ${pesos(c.total_cent / r.rinde_cantidad)} por ${r.rinde_unidad}` : rinde
                if (gestiona) lado = <><b className="num">{c.completo ? pesos(c.total_cent) : '—'}</b><span className="small muted">la olla</span></>
              } else {
                sub = r.modo === 'olla'
                  ? `Olla de ${r.porciones} porciones${gestiona && c.completo ? ` · ${pesos(c.total_cent)} total` : ''}`
                  : 'Cantidades por porción'
                if (gestiona) {
                  const ratio = precioMenu && c.porcion_cent !== null ? c.porcion_cent / precioMenu : null
                  lado = (
                    <>
                      <b className="num">{c.completo ? pesos(c.porcion_cent) : '—'}</b>
                      {!c.completo ? <span className="pill warn">Incompleto</span>
                        : ratio !== null ? <span className={`pill ${ratio <= objetivo ? 'ok' : 'warn'}`}>{numero(ratio * 100, 0)}%</span>
                          : <span className="pill mute">por porción</span>}
                    </>
                  )
                }
              }
              return (
                <button className="li" key={r.id} onClick={() => setAbierta({ receta: r })} style={{ opacity: r.activo ? 1 : 0.6 }}>
                  <div className="main">
                    <b>{r.nombre}</b>
                    <span className="small muted">{sub}</span>
                    {gestiona && c.faltantes.length > 0 && (
                      <span className="small" style={{ display: 'block', color: 'var(--warn)' }}>Falta: {c.faltantes.join(', ')}</span>
                    )}
                    {!r.activo && <span className="pill mute">Desactivada</span>}
                  </div>
                  {lado && <div className="side" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>{lado}</div>}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {gestiona && lista.length > 0 && (
        <button className="fab" onClick={() => setAbierta({ receta: null })}><Icono nombre="plus" grosor={2.5} />Nueva receta</button>
      )}

      {abierta && (gestiona
        ? <EditorReceta receta={abierta.receta} tipoInicial={tipo} onCerrar={() => setAbierta(null)} onGuardada={(t) => setTipo(t)} />
        : abierta.receta && <VistaReceta receta={abierta.receta} onCerrar={() => setAbierta(null)} />)}
    </>
  )
}
