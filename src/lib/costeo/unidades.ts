// Unidades: base g, ml y u. kg = 1000 g, l = 1000 ml.

export type Unidad = 'kg' | 'g' | 'l' | 'ml' | 'u'
export type Dimension = 'peso' | 'volumen' | 'unidad'

export const UNIDADES: Record<Unidad, { dim: Dimension; factor: number }> = {
  kg: { dim: 'peso', factor: 1000 },
  g: { dim: 'peso', factor: 1 },
  l: { dim: 'volumen', factor: 1000 },
  ml: { dim: 'volumen', factor: 1 },
  u: { dim: 'unidad', factor: 1 },
}

export const UNIDADES_POR_DIM: Record<Dimension, Unidad[]> = {
  peso: ['g', 'kg'],
  volumen: ['ml', 'l'],
  unidad: ['u'],
}

export const BASE_POR_DIM: Record<Dimension, Unidad> = { peso: 'g', volumen: 'ml', unidad: 'u' }

export const esUnidad = (u: unknown): u is Unidad => typeof u === 'string' && u in UNIDADES
export const dimension = (u: Unidad): Dimension => UNIDADES[u].dim
export const compatibles = (a: Unidad, b: Unidad) => UNIDADES[a].dim === UNIDADES[b].dim
export const aBase = (cantidad: number, u: Unidad) => cantidad * UNIDADES[u].factor

/** Unidad sugerida para cargar en recetas: kg → g, l → ml. */
export const unidadReceta = (u: Unidad): Unidad => BASE_POR_DIM[UNIDADES[u].dim]

const redondear = (n: number, dec = 4) => {
  const f = 10 ** dec
  return Math.round(n * f) / f
}

/** Pasa a la unidad más legible: 7200 g → 7,2 kg; 0,12 kg → 120 g. */
export function normalizar(cantidad: number, u: Unidad): { cantidad: number; unidad: Unidad } {
  if (u === 'g' && cantidad >= 1000) return { cantidad: redondear(cantidad / 1000), unidad: 'kg' }
  if (u === 'kg' && cantidad < 1) return { cantidad: redondear(cantidad * 1000), unidad: 'g' }
  if (u === 'ml' && cantidad >= 1000) return { cantidad: redondear(cantidad / 1000), unidad: 'l' }
  if (u === 'l' && cantidad < 1) return { cantidad: redondear(cantidad * 1000), unidad: 'ml' }
  return { cantidad: redondear(cantidad), unidad: u }
}
