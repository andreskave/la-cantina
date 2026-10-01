// Constantes del catálogo compartidas por pantallas y parsers.
import type { Unidad } from './costeo'

export const CATEGORIAS = ['Almacén', 'Carnes', 'Verdulería', 'Lácteos y huevos', 'Panadería', 'Bebidas',
  'Golosinas y snacks', 'Otros'] as const
export type Categoria = (typeof CATEGORIAS)[number]

export const UNIDADES_COMPRA: Unidad[] = ['kg', 'g', 'l', 'ml', 'u']

/** Texto de la unidad para selects y frases ("unidades" en vez de "u"). */
export const UNIDAD_TXT: Record<Unidad, string> = { kg: 'kg', g: 'g', l: 'litros', ml: 'ml', u: 'unidades' }

export type TipoReceta = 'plato' | 'postre' | 'preparacion'
export const TIPO_RECETA_TXT: Record<TipoReceta, { uno: string; varios: string }> = {
  plato: { uno: 'Plato', varios: 'Platos' },
  postre: { uno: 'Postre', varios: 'Postres' },
  preparacion: { uno: 'Preparación', varios: 'Preparaciones' },
}
