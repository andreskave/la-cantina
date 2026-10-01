// Qué ve y qué puede hacer cada rol en la interfaz. La seguridad real está en la base
// (RLS y funciones): esto solo evita mostrar lo que el servidor igual va a rechazar.

export type Rol = 'admin' | 'duena' | 'ayudante'

export type Modulo = 'caja' | 'listas_precio' | 'medio_pago' | 'dias_fijos' | 'terminos' | 'precio_por_plato' | 'cierre_dia'
export type Modulos = Record<Modulo, boolean>

export const MODULOS_DEFAULT: Modulos = {
  caja: true,
  listas_precio: false,
  medio_pago: false,
  dias_fijos: false,
  terminos: false,
  precio_por_plato: false,
  cierre_dia: false,
}

/** Normaliza lo que viene de cantinas.modulos (puede faltar alguna clave). */
export function leerModulos(raw: unknown): Modulos {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<Modulo, unknown>>
  const out = { ...MODULOS_DEFAULT }
  for (const k of Object.keys(MODULOS_DEFAULT) as Modulo[]) if (typeof o[k] === 'boolean') out[k] = o[k] as boolean
  return out
}

export type Pestana = 'hoy' | 'menu' | 'recetas' | 'insumos' | 'compras' | 'cuentas' | 'caja'

export type Accion =
  | 'ver_costos'          // costos, precios de compra, márgenes, semáforo
  | 'ver_caja'
  | 'ver_ajustes'
  | 'editar_catalogo'     // insumos, proveedores, recetas, precios de venta
  | 'editar_menu'
  | 'gestionar_alumnos'   // alta y edición de alumnos
  | 'anotar_consumo'      // menú y productos (importe lo pone el servidor)
  | 'consumo_otro'        // consumo con concepto e importe libres
  | 'registrar_pago'
  | 'anular_movimiento'
  | 'exportar_todo'
  | 'admin_usuarios'
  | 'admin_modulos'       // módulos ocultos y términos
  | 'admin_crear_cantina'
  | 'borrado_general'

const DE_DUENA: ReadonlySet<Accion> = new Set<Accion>([
  'ver_costos', 'ver_caja', 'ver_ajustes', 'editar_catalogo', 'editar_menu', 'gestionar_alumnos',
  'anotar_consumo', 'consumo_otro', 'registrar_pago', 'anular_movimiento', 'exportar_todo',
])
const DE_AYUDANTE: ReadonlySet<Accion> = new Set<Accion>(['anotar_consumo'])

export function puede(rol: Rol, accion: Accion): boolean {
  if (rol === 'admin') return true
  if (rol === 'duena') return DE_DUENA.has(accion)
  return DE_AYUDANTE.has(accion)
}

const BASE: Pestana[] = ['hoy', 'menu', 'recetas', 'insumos', 'compras', 'cuentas']

export function pestanasVisibles(rol: Rol, modulos: Modulos): Pestana[] {
  return puede(rol, 'ver_caja') && modulos.caja ? [...BASE, 'caja'] : BASE
}

export function puedeVerPestana(rol: Rol, modulos: Modulos, p: Pestana): boolean {
  return pestanasVisibles(rol, modulos).includes(p)
}
