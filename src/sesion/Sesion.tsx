import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { leerModulos, puede as puedeRol, type Accion, type Modulos, type Rol } from '../lib/permisos'
import { crearDiccionario, type Diccionario } from '../lib/terminos'
import { mensajeError } from '../lib/errores'
import { useQueryClient } from '@tanstack/react-query'
import { esErrorDeRed } from '../offline/cola'
import { borrarTodoLocal } from '../offline/baseLocal'

export type Cantina = {
  id: string
  nombre: string
  rol: Rol
  modulos: Modulos
  terminos: Record<string, string>
  pedidos_por_defecto: number
  objetivo_costo_pct: number
}

type Perfil = { nombre: string; es_admin_global: boolean }

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'sin_sesion' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'listo'; user: User; perfil: Perfil; cantinas: Cantina[] }

type Ctx = {
  estado: Estado
  cantinaActiva: Cantina | null
  elegirCantina: (id: string | null) => void
  recargar: () => Promise<void>
  salir: () => Promise<void>
}

export const SesionCtx = createContext<Ctx | null>(null)
const CLAVE_CANTINA = 'lacantina.cantina'
const CLAVE_SESION = 'lacantina.sesion'

type SesionLocal = { userId: string; perfil: Perfil; cantinas: Cantina[] }
function guardarSesionLocal(s: SesionLocal) {
  try { localStorage.setItem(CLAVE_SESION, JSON.stringify(s)) } catch { /* sin almacenamiento */ }
}
function leerSesionLocal(): SesionLocal | null {
  try { return JSON.parse(localStorage.getItem(CLAVE_SESION) ?? 'null') as SesionLocal | null } catch { return null }
}

function leerCantinaGuardada(): string | null {
  try { return localStorage.getItem(CLAVE_CANTINA) } catch { return null }
}
function guardarCantina(id: string | null) {
  try {
    if (id) localStorage.setItem(CLAVE_CANTINA, id)
    else localStorage.removeItem(CLAVE_CANTINA)
  } catch { /* modo privado: no pasa nada */ }
}

type FilaCantina = { id: string; nombre: string; modulos: unknown; terminos: unknown; pedidos_por_defecto: number; objetivo_costo_pct: number | string }
const COLUMNAS = 'id, nombre, modulos, terminos, pedidos_por_defecto, objetivo_costo_pct'

function aCantina(c: FilaCantina, rol: Rol): Cantina {
  return {
    id: c.id,
    nombre: c.nombre,
    rol,
    modulos: leerModulos(c.modulos),
    terminos: (c.terminos ?? {}) as Record<string, string>,
    pedidos_por_defecto: c.pedidos_por_defecto,
    objetivo_costo_pct: Number(c.objetivo_costo_pct),
  }
}

async function cargarDatos(user: User): Promise<{ perfil: Perfil; cantinas: Cantina[] }> {
  const { data: perfil, error: ep } = await supabase
    .from('perfiles').select('nombre, es_admin_global').eq('user_id', user.id).single()
  if (ep) throw ep

  let cantinas: Cantina[]
  if (perfil.es_admin_global) {
    const { data, error } = await supabase.from('cantinas').select(COLUMNAS).order('nombre')
    if (error) throw error
    cantinas = (data as FilaCantina[]).map((c) => aCantina(c, 'admin'))
  } else {
    const { data, error } = await supabase
      .from('miembros').select(`rol, cantina:cantinas(${COLUMNAS})`).eq('user_id', user.id)
    if (error) throw error
    cantinas = (data as unknown as { rol: Rol; cantina: FilaCantina | null }[])
      .filter((m) => m.cantina)
      .map((m) => aCantina(m.cantina!, m.rol))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }
  return { perfil, cantinas }
}

export function SesionProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  const [cantinaId, setCantinaId] = useState<string | null>(leerCantinaGuardada)

  const cargar = useCallback(async (user: User | null) => {
    if (!user) {
      setEstado({ tipo: 'sin_sesion' })
      return
    }
    try {
      const { perfil, cantinas } = await cargarDatos(user)
      guardarSesionLocal({ userId: user.id, perfil, cantinas })
      setEstado({ tipo: 'listo', user, perfil, cantinas })
    } catch (e) {
      // Sin conexión: se entra con lo último que se cargó en este dispositivo.
      const local = leerSesionLocal()
      if (esErrorDeRed(e) && local?.userId === user.id) setEstado({ tipo: 'listo', user, perfil: local.perfil, cantinas: local.cantinas })
      else setEstado({ tipo: 'error', mensaje: mensajeError(e) })
    }
  }, [])

  useEffect(() => {
    let ultimoUser: string | undefined
    const { data } = supabase.auth.onAuthStateChange((evento, session) => {
      const u = session?.user ?? null
      // Los refrescos de token no cambian nada de lo que mostramos.
      if (evento === 'TOKEN_REFRESHED' && u?.id === ultimoUser) return
      ultimoUser = u?.id
      // Fuera del callback: supabase-js recomienda no llamar a la API dentro de él.
      setTimeout(() => void cargar(u), 0)
    })
    return () => data.subscription.unsubscribe()
  }, [cargar])

  const elegirCantina = useCallback((id: string | null) => {
    guardarCantina(id)
    setCantinaId(id)
  }, [])

  const cantinaActiva = useMemo(() => {
    if (estado.tipo !== 'listo') return null
    const { cantinas } = estado
    // Con una sola cantina se entra directo.
    if (cantinas.length === 1) return cantinas[0]
    return cantinas.find((c) => c.id === cantinaId) ?? null
  }, [estado, cantinaId])

  const recargar = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    await cargar(data.session?.user ?? null)
  }, [cargar])

  const qc = useQueryClient()
  const salir = useCallback(async () => {
    // Al cerrar sesión no queda nada de la cuenta en el dispositivo.
    await supabase.auth.signOut({ scope: 'local' })
    await borrarTodoLocal()
    try { localStorage.removeItem(CLAVE_SESION) } catch { /* nada */ }
    qc.clear()
    elegirCantina(null)
  }, [elegirCantina, qc])

  const valor = useMemo(() => ({ estado, cantinaActiva, elegirCantina, recargar, salir }), [estado, cantinaActiva, elegirCantina, recargar, salir])
  return <SesionCtx.Provider value={valor}>{children}</SesionCtx.Provider>
}

export function useSesion(): Ctx {
  const c = useContext(SesionCtx)
  if (!c) throw new Error('useSesion fuera de SesionProvider')
  return c
}

export type CantinaCtx = {
  cantina: Cantina
  rol: Rol
  modulos: Modulos
  dic: Diccionario
  puede: (a: Accion) => boolean
  perfil: Perfil
  cantinas: Cantina[]
}

/** Para pantallas dentro del layout: siempre hay sesión y cantina elegida. */
export function useCantina(): CantinaCtx {
  const { estado, cantinaActiva } = useSesion()
  if (estado.tipo !== 'listo' || !cantinaActiva) throw new Error('useCantina sin cantina activa')
  const c = cantinaActiva
  return useMemo(() => ({
    cantina: c,
    rol: c.rol,
    modulos: c.modulos,
    dic: crearDiccionario(c.modulos, c.terminos),
    puede: (a: Accion) => puedeRol(c.rol, a),
    perfil: estado.perfil,
    cantinas: estado.cantinas,
  }), [c, estado.perfil, estado.cantinas])
}
