// Modo demostración (VITE_DEMO=1): la app completa con datos de ejemplo en memoria.
// Sirve para probar pantallas sin Supabase. Los cambios se pierden al recargar.
import { useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { SesionCtx, type Cantina } from '../sesion/Sesion'
import { ApiCtx } from '../datos/consultas'
import { crearMemoriaApi } from '../datos/memoriaApi'
import { MODULOS_DEFAULT, leerModulos, type Modulo, type Modulos, type Rol } from '../lib/permisos'
import { Aviso } from '../pantallas/Aviso'
import { Rutas } from '../Rutas'
import { datosDemo } from './datosDemo'
import { congelarPasados } from './congelarDemo'
import { hoyISO } from '../lib/formato'
import { baseLocal } from '../offline/baseLocal'

// Los datos de la demo se regeneran en cada carga: lo que quedó en cola de otra carga ya no sirve.
void baseLocal.cola.clear()

const CLAVE = 'lacantina.demo.rol'
const CLAVE_MODULOS = 'lacantina.demo.modulos'
const leerModulosDemo = (): Modulos => {
  try { return leerModulos(JSON.parse(sessionStorage.getItem(CLAVE_MODULOS) ?? 'null')) } catch { return { ...MODULOS_DEFAULT } }
}
// Módulos que se pueden probar en la demo (el resto llega en la Fase 7).
const MODULOS_DEMO: [Modulo, string][] = [['caja', 'Caja'], ['cierre_dia', 'Cierre del día'], ['medio_pago', 'Medio de pago']]
const leerRol = (): Rol | null => {
  try { return (sessionStorage.getItem(CLAVE) as Rol | null) } catch { return null }
}

export default function Demo() {
  const [datos] = useState(() => {
    const d = datosDemo()
    congelarPasados(d, hoyISO())
    d.config.modulos = leerModulosDemo()
    return d
  })
  const [rol, setRol] = useState<Rol | null>(leerRol)
  const [version, setVersion] = useState(0)
  const [modulos, setModulos] = useState<Modulos>(leerModulosDemo)
  const cambiarModulo = (m: Modulo, v: boolean) => {
    const n = { ...modulos, [m]: v }
    try { sessionStorage.setItem(CLAVE_MODULOS, JSON.stringify(n)) } catch { /* nada */ }
    datos.config.modulos = n
    setModulos(n)
  }
  const rolRef = useRef(rol)
  rolRef.current = rol
  const api = useMemo(() => crearMemoriaApi(datos, () => rolRef.current ?? 'ayudante'), [datos])

  const elegir = (r: Rol | null) => {
    try { if (r) sessionStorage.setItem(CLAVE, r); else sessionStorage.removeItem(CLAVE) } catch { /* nada */ }
    setRol(r)
  }

  const ctx = useMemo(() => {
    if (!rol) return null
    const cantina: Cantina = {
      ...datos.cantina, rol, modulos: { ...datos.config.modulos }, terminos: { ...datos.config.terminos },
    }
    return {
      estado: {
        tipo: 'listo' as const,
        user: { id: 'demo' } as User,
        perfil: { nombre: rol === 'ayudante' ? 'Lucía (ayudante)' : rol === 'admin' ? 'Administrador' : 'Marta (dueña)', es_admin_global: rol === 'admin' },
        cantinas: [cantina],
      },
      cantinaActiva: cantina,
      elegirCantina: () => {},
      recargar: async () => setVersion((v) => v + 1),
      salir: async () => elegir(null),
    }
    // version fuerza a releer datos.cantina después de "Guardar" en Ajustes
  }, [rol, datos, version, modulos])

  if (!ctx) {
    return (
      <Aviso titulo="La Cantina · demostración">
        <p>Datos de ejemplo en este dispositivo. Los cambios se pierden al recargar la página.</p>
        <button className="btn full" onClick={() => elegir('duena')}>Entrar como Dueña</button>
        <button className="btn ghost full" onClick={() => elegir('ayudante')}>Entrar como Ayudante</button>
        <button className="btn ghost full" onClick={() => elegir('admin')}>Entrar como Administrador</button>
        <div className="card">
          <p className="eyebrow">Módulos</p>
          {MODULOS_DEMO.map(([m, t]) => (
            <label className="switch" key={m}>
              <input type="checkbox" checked={modulos[m]} onChange={(e) => cambiarModulo(m, e.target.checked)} />
              <span>{t}</span>
            </label>
          ))}
        </div>
      </Aviso>
    )
  }

  return (
    <ApiCtx.Provider value={api}>
      <SesionCtx.Provider value={ctx}>
        <Rutas />
      </SesionCtx.Provider>
    </ApiCtx.Provider>
  )
}
