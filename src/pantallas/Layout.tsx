import { useState, type CSSProperties, type ReactNode } from 'react'
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useCantina, useSesion } from '../sesion/Sesion'
import { pestanasVisibles, puedeVerPestana, type Accion, type Pestana } from '../lib/permisos'
import { capitalizar, fechaLarga, hoyISO } from '../lib/formato'
import { Icono } from '../componentes/Icono'
import { Hoja } from '../componentes/Hoja'
import { BotonBorrar } from '../componentes/Controles'
import { ROL_TXT } from './ElegirCantina'
import { ColaProvider, Precarga, useCola } from '../offline/Conexion'
import { IndicadorConexion } from '../offline/Indicador'

export const PESTANAS: Record<Pestana, string> = {
  hoy: 'Hoy',
  menu: 'Menú',
  recetas: 'Recetas',
  insumos: 'Insumos',
  compras: 'Compras',
  cuentas: 'Cuentas',
  caja: 'Caja',
}

export function Layout() {
  const { cantina, rol, modulos, puede, dic } = useCantina()
  const [hojaSesion, setHojaSesion] = useState(false)
  const navigate = useNavigate()
  const tabs = pestanasVisibles(rol, modulos)

  return (
    <ColaProvider cantina={cantina.id}>
      <Precarga />
      <div className="wrap">
        <header className="top">
          <div className="brand">
            <h1>{cantina.nombre}</h1>
            <p>{capitalizar(fechaLarga(hoyISO()))}</p>
          </div>
          <div className="acciones">
            <button className="iconbtn" onClick={() => setHojaSesion(true)} aria-label="Tu sesión">
              <Icono nombre="usuario" />
            </button>
            {puede('ver_ajustes') && (
              <button className="iconbtn" onClick={() => navigate('/ajustes')} aria-label="Ajustes">
                <Icono nombre="ajustes" />
              </button>
            )}
          </div>
        </header>
        <IndicadorConexion />
        <main className="stack">
          <Outlet />
        </main>
      </div>

      <nav className="nav" aria-label="Pantallas">
        <div className="in" style={{ '--tabs': tabs.length } as CSSProperties}>
          {tabs.map((p) => (
            <NavLink key={p} to={`/${p}`}>
              <Icono nombre={p} />
              <span>{p === 'menu' ? dic.T('menu') : PESTANAS[p]}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {hojaSesion && <HojaSesion onCerrar={() => setHojaSesion(false)} />}
    </ColaProvider>
  )
}

function HojaSesion({ onCerrar }: { onCerrar: () => void }) {
  const { perfil, cantina, cantinas, rol } = useCantina()
  const { elegirCantina, salir } = useSesion()
  const navigate = useNavigate()
  const pendientes = useCola().pendientes.filter((p) => p.estado === 'pendiente').length

  return (
    <Hoja titulo="Tu sesión" onCerrar={onCerrar}>
      <div className="card">
        <b>{perfil.nombre || 'Sin nombre'}</b>
        <p className="small muted">{ROL_TXT[rol]} · {cantina.nombre}</p>
      </div>
      {cantinas.length > 1 && (
        <div className="stack">
          <p className="lbl">Cambiar de cantina</p>
          {cantinas.filter((c) => c.id !== cantina.id).map((c) => (
            <button key={c.id} className="opcion" onClick={() => { elegirCantina(c.id); navigate('/hoy'); onCerrar() }}>
              <span className="main"><b>{c.nombre}</b><span className="small muted">{ROL_TXT[c.rol]}</span></span>
              <Icono nombre="der" />
            </button>
          ))}
        </div>
      )}
      {pendientes > 0 ? (
        <>
          <p className="warnbox">
            Hay {pendientes} movimiento{pendientes > 1 ? 's' : ''} sin sincronizar en este dispositivo. Si cerrás sesión ahora, se pierden.
            Esperá a tener conexión para que se envíen.
          </p>
          <BotonBorrar texto="Cerrar sesión igual" onBorrar={() => void salir()} />
        </>
      ) : <button className="btn ghost" onClick={() => void salir()}>Cerrar sesión</button>}
    </Hoja>
  )
}

/** Si el rol o los módulos no habilitan la pestaña, vuelve a Hoy. */
export function RequierePestana({ pestana, children }: { pestana: Pestana; children: ReactNode }) {
  const { rol, modulos } = useCantina()
  return puedeVerPestana(rol, modulos, pestana) ? <>{children}</> : <Navigate to="/hoy" replace />
}

export function RequiereAccion({ accion, children }: { accion: Accion; children: ReactNode }) {
  const { puede } = useCantina()
  return puede(accion) ? <>{children}</> : <Navigate to="/hoy" replace />
}
