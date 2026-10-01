// Carga rápida de insumos: interpretar lo que se pega desde Excel o se escribe a mano.

import { CATEGORIAS, type Categoria } from './catalogo'
import type { Unidad } from './costeo'

/**
 * Número con formato uruguayo: "1.300" → 1300, "1.250,50" → 1250.5, "$ 300" → 300,
 * "2,5" → 2.5. Un punto solo es separador de miles si deja grupos de 3 dígitos.
 */
export function parseNumeroUY(texto: string | null | undefined): number {
  let t = String(texto ?? '').replace(/[$\s]/g, '')
  if (!t) return Number.NaN
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
  return /^-?\d*\.?\d+$/.test(t) ? Number.parseFloat(t) : Number.NaN
}

const SINONIMOS: Record<string, Unidad | 'docena'> = {
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', k: 'kg',
  g: 'g', gr: 'g', grs: 'g', gramo: 'g', gramos: 'g',
  l: 'l', lt: 'l', lts: 'l', litro: 'l', litros: 'l',
  ml: 'ml', cc: 'ml', mililitro: 'ml', mililitros: 'ml',
  u: 'u', un: 'u', uni: 'u', unid: 'u', ud: 'u', uds: 'u', unidad: 'u', unidades: 'u',
  docena: 'docena', docenas: 'docena', doc: 'docena',
}

/** Unidad desde un sinónimo (kilo, gr, lt, cc, unidad, docena…). Docena se devuelve aparte: vale 12 u. */
export function parseUnidad(texto: string | null | undefined): Unidad | 'docena' | null {
  const k = String(texto ?? '').trim().toLowerCase().replace(/\.$/, '')
  return SINONIMOS[k] ?? null
}

/** Categoría exacta o por prefijo ("verdu" → Verdulería, "lact" → Lácteos y huevos). */
export function parseCategoria(texto: string | null | undefined): Categoria | null {
  const t = String(texto ?? '').trim().toLowerCase()
  if (!t) return null
  const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  const tt = sinTildes(t)
  return CATEGORIAS.find((c) => sinTildes(c.toLowerCase()) === tt)
    ?? (tt.length >= 3 ? CATEGORIAS.find((c) => sinTildes(c.toLowerCase()).startsWith(tt)) : undefined)
    ?? null
}

export type FilaCarga = {
  nombre: string
  cantidad: string
  unidad: Unidad
  precio: string
  categoria: Categoria
  venta: string
  /** La unidad escrita no se reconoció: se puso kg y hay que revisarla. */
  unidadDudosa?: boolean
}

export const filaVacia = (): FilaCarga => ({ nombre: '', cantidad: '1', unidad: 'kg', precio: '', categoria: 'Almacén', venta: '' })

const ENCABEZADOS = /^(nombre|insumo|producto|art[ií]culo)$/i
const LINEA_LIBRE = /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*([a-zA-Záéíóú.]+)\s+\$?\s*([\d.,]+)$/

/**
 * Pasa texto pegado a filas. Columnas separadas por tab, ";" o "|":
 * Nombre · Cantidad · Unidad · Precio · Categoría · Precio de venta (también "1 kg" en una sola columna).
 * O una línea libre tipo "Tallarines 1 kg 300".
 */
export function parsePegado(texto: string): FilaCarga[] {
  const out: FilaCarga[] = []
  for (const cruda of texto.split(/\r?\n/)) {
    const linea = cruda.trim()
    if (!linea) continue
    const cols = (linea.includes('\t') ? linea.split('\t') : linea.split(/[;|]/)).map((c) => c.trim())
    let nombre: string, cant: string, uni: string, precio: string, cat = '', venta = ''

    if (cols.length === 1) {
      const m = LINEA_LIBRE.exec(linea)
      if (!m) continue
      ;[, nombre, cant, uni, precio] = m
    } else {
      nombre = cols[0]
      const junto = /^([\d.,]+)\s*([a-zA-Záéíóú.]+)$/.exec(cols[1] ?? '')
      if (junto) [cant, uni, precio, cat, venta] = [junto[1], junto[2], cols[2] ?? '', cols[3] ?? '', cols[4] ?? '']
      else [cant, uni, precio, cat, venta] = [cols[1] ?? '', cols[2] ?? '', cols[3] ?? '', cols[4] ?? '', cols[5] ?? '']
    }
    if (!nombre || ENCABEZADOS.test(nombre)) continue

    let u = parseUnidad(uni)
    let c = parseNumeroUY(cant)
    if (u === 'docena') { u = 'u'; c = c * 12 }
    const p = parseNumeroUY(precio)
    const v = parseNumeroUY(venta)
    out.push({
      nombre,
      cantidad: Number.isFinite(c) ? String(c) : '',
      unidad: u ?? 'kg',
      precio: Number.isFinite(p) ? String(p) : '',
      categoria: parseCategoria(cat) ?? 'Almacén',
      venta: Number.isFinite(v) ? String(v) : '',
      unidadDudosa: !u && Boolean(uni),
    })
  }
  return out
}

export type EstadoFila =
  | { tipo: 'vacia' }
  | { tipo: 'falta_cantidad' | 'falta_precio'; texto: string }
  | { tipo: 'nuevo' | 'actualiza'; texto: string; existenteId?: string }

export const claveNombre = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** Estado de una fila. `existentes`: nombre normalizado → id del insumo. */
export function estadoFila(f: FilaCarga, existentes: Map<string, string>): EstadoFila {
  if (!f.nombre.trim()) return { tipo: 'vacia' }
  if (!(parseNumeroUY(f.cantidad) > 0)) return { tipo: 'falta_cantidad', texto: 'Falta la cantidad' }
  if (!(parseNumeroUY(f.precio) > 0)) return { tipo: 'falta_precio', texto: 'Falta el precio' }
  const id = existentes.get(claveNombre(f.nombre))
  if (id) return { tipo: 'actualiza', texto: 'Ya existe: se actualiza el precio', existenteId: id }
  return { tipo: 'nuevo', texto: f.unidadDudosa ? 'Nuevo · revisá la unidad' : 'Nuevo' }
}
