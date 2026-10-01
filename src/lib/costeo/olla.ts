// Cambio entre "Para 1 porción" y "Para una olla" (sección 6.4).

import { normalizar, type Unidad } from './unidades.ts'
import { numero } from '../formato.ts'

type ConCantidad = { cantidad: number; unidad: Unidad }

/** Multiplica todas las cantidades por `factor` y las pasa a la unidad más legible. */
export function escalar<T extends ConCantidad>(ingredientes: T[], factor: number): T[] {
  return ingredientes.map((i) => ({ ...i, ...normalizar(i.cantidad * factor, i.unidad) }))
}

/** De porción a olla de `porciones`: se multiplican las cantidades. */
export const porcionAOlla = <T extends ConCantidad>(ings: T[], porciones: number) => escalar(ings, Math.max(1, porciones))

/** De olla a porción: se dividen las cantidades por las porciones de la olla. */
export const ollaAPorcion = <T extends ConCantidad>(ings: T[], porciones: number) => escalar(ings, 1 / Math.max(1, porciones))

/** Botón opcional "Ajustar cantidades de 60 a 50 porciones". */
export const ajustarOlla = <T extends ConCantidad>(ings: T[], de: number, a: number) => escalar(ings, Math.max(1, a) / Math.max(1, de))

export function cantidadLegible(cantidad: number, unidad: Unidad): string {
  const n = normalizar(cantidad, unidad)
  return `${numero(n.cantidad, n.unidad === 'u' ? 2 : 3)} ${n.unidad}`
}

/**
 * Texto debajo de cada ingrediente con la equivalencia en el otro modo:
 * en olla → "por porción: 120 g"; en porción → "para 60 porciones: 7,2 kg".
 */
export function equivalencia(i: ConCantidad, modo: 'porcion' | 'olla', porciones: number): string {
  const n = Math.max(1, porciones)
  return modo === 'olla'
    ? `por porción: ${cantidadLegible(i.cantidad / n, i.unidad)}`
    : `para ${n} porciones: ${cantidadLegible(i.cantidad * n, i.unidad)}`
}
