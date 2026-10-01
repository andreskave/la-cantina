// Diccionario de términos. Toda la interfaz nombra las cosas a través de acá, para que
// con el módulo "terminos" otra clase de negocio diga "Cliente" en vez de "Alumno".
// Se guardan en minúscula; T() capitaliza para títulos y botones.

import type { Modulos } from './permisos'

export const TERMINOS_DEFAULT = {
  alumno: 'alumno',
  alumnos: 'alumnos',
  responsable: 'responsable',
  menu_del_dia: 'menú del día',
  menu: 'menú',
  menus: 'menús',
  plato: 'plato',
  postre: 'postre',
  cantina: 'cantina',
} as const

export type Termino = keyof typeof TERMINOS_DEFAULT

export type Diccionario = {
  /** En minúscula, para usar dentro de una oración. */
  t: (clave: Termino) => string
  /** Con mayúscula inicial, para títulos y botones. */
  T: (clave: Termino) => string
}

export function crearDiccionario(modulos: Pick<Modulos, 'terminos'>, terminos: unknown): Diccionario {
  const valores: Record<Termino, string> = { ...TERMINOS_DEFAULT }
  if (modulos.terminos && terminos && typeof terminos === 'object') {
    for (const [k, v] of Object.entries(terminos as Record<string, unknown>)) {
      if (k in valores && typeof v === 'string' && v.trim()) valores[k as Termino] = v.trim()
    }
  }
  const t = (c: Termino) => valores[c]
  const T = (c: Termino) => valores[c].charAt(0).toUpperCase() + valores[c].slice(1)
  return { t, T }
}
