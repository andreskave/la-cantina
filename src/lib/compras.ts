// Lista de compras (sección 6.9). Pura.

import { UNIDADES, dimension, normalizar, type Costeo, type Unidad } from './costeo'
import { diaSemana, esHabil, sumarDias } from './fechas'
import { DIAS, MESES, numero } from './formato'
import type { DiaMenu } from './menu'
import type { Categoria } from './catalogo'

export type RangoCompras = 'esta' | 'proxima' | 'elegido'

/** Lunes de la semana de `hoy` (sábado y domingo miran a la semana siguiente). */
export function lunesDe(hoy: string): string {
  const d = diaSemana(hoy)
  return d === 0 ? sumarDias(hoy, 1) : d === 6 ? sumarDias(hoy, 2) : sumarDias(hoy, -(d - 1))
}

/** "Esta semana": de hoy (o el lunes si es fin de semana) al viernes. "Próxima": lunes a viernes siguientes. */
export function fechasDeRango(r: Exclude<RangoCompras, 'elegido'>, hoy: string): [string, string] {
  const lunes = lunesDe(hoy)
  if (r === 'esta') return [hoy > lunes ? hoy : lunes, sumarDias(lunes, 4)]
  return [sumarDias(lunes, 7), sumarDias(lunes, 11)]
}

export type InsumoCompra = {
  id: string
  nombre: string
  categoria: Categoria
  proveedor_id: string | null
  cantidad_compra: number
  unidad_compra: Unidad
  merma_pct: number
}

export type ItemCompra = {
  insumo: InsumoCompra
  /** Lo que hay que comprar, con merma, en unidad base (g, ml o u). */
  cantidad_base: number
  /** Texto principal ya redondeado hacia arriba: "7,2 kg", "13 u". */
  texto: string
  /** "2 × 12 u" cuando la presentación no es 1. */
  paquetes: string | null
  /** Costo estimado (si hay precio de compra). */
  costo_cent: number | null
}

export type ListaCompras = {
  items: ItemCompra[]
  dias: number
  menus: number
  aMano: { fecha: string; texto: string }[]
  sinPedidos: string[]
  /** Usaron los menús por defecto porque no tenían pedidos cargados. */
  porDefecto: string[]
  incompatibles: string[]
}

/** Redondea hacia arriba: a 1 decimal (unidades: a entero). */
export function redondearCompra(cantidad: number, unidad: Unidad): number {
  const eps = 1e-9
  return unidad === 'u' ? Math.ceil(cantidad - eps) : Math.ceil(cantidad * 10 - eps) / 10
}

/** Texto en la unidad de compra (pasada a la más legible) y redondeado hacia arriba. */
export function textoCantidad(base: number, unidadCompra: Unidad): string {
  const n = normalizar(base / UNIDADES[unidadCompra].factor, unidadCompra)
  return `${numero(redondearCompra(n.cantidad, n.unidad), 1)} ${n.unidad}`
}

export function armarLista(args: {
  desde: string
  hasta: string
  dias: DiaMenu[]
  pedidosDefault: number
  costeo: Costeo
  insumos: InsumoCompra[]
  /** Precio vigente por insumo; vacío si el usuario no ve costos. */
  precios: Map<string, { cantidad: number; unidad: Unidad; precio_cent: number }>
  /**
   * Módulo listas_precio: tamaño de porción promedio de cada día según cuántos menús pidió
   * cada lista (Grandes = 1,3). Sin módulo, 1.
   */
  factorDia?: (fecha: string) => number
}): ListaCompras {
  const porFecha = new Map(args.dias.map((d) => [d.fecha, d]))
  const insumos = new Map(args.insumos.map((i) => [i.id, i]))
  const util = new Map<string, number>()
  const out: ListaCompras = { items: [], dias: 0, menus: 0, aMano: [], sinPedidos: [], porDefecto: [], incompatibles: [] }
  const incompatibles = new Set<string>()

  for (let f = args.desde; f <= args.hasta; f = sumarDias(f, 1)) {
    if (!esHabil(f)) continue
    const d = porFecha.get(f)
    if (!d || d.sin_cocina) continue
    const tieneMenu = d.plato_receta_id || d.plato_texto || d.postre_receta_id || d.postre_texto
    if (!tieneMenu) continue
    for (const t of [d.plato_texto, d.postre_texto]) if (t?.trim()) out.aMano.push({ fecha: f, texto: t.trim() })
    const n = d.pedidos ?? args.pedidosDefault
    if (d.pedidos === null) (n > 0 ? out.porDefecto : out.sinPedidos).push(f)
    if (!(n > 0)) continue
    let algo = false
    for (const id of [d.plato_receta_id, d.postre_receta_id]) {
      if (!id) continue
      for (const l of args.costeo.insumosDe(id, n * (args.factorDia?.(f) ?? 1))) {
        const ins = insumos.get(l.insumo_id)
        if (!ins) continue
        if (dimension(ins.unidad_compra) !== l.dimension) { incompatibles.add(ins.nombre); continue }
        util.set(ins.id, (util.get(ins.id) ?? 0) + l.cantidad_base)
        algo = true
      }
    }
    if (algo) { out.dias++; out.menus += n }
  }

  for (const [id, q] of util) {
    const ins = insumos.get(id)!
    const base = q / (1 - (ins.merma_pct || 0) / 100)
    const presentacion = ins.cantidad_compra * UNIDADES[ins.unidad_compra].factor
    const precio = args.precios.get(id)
    const costo = precio && UNIDADES[precio.unidad].dim === dimension(ins.unidad_compra)
      ? (base / (precio.cantidad * UNIDADES[precio.unidad].factor)) * precio.precio_cent : null
    out.items.push({
      insumo: ins,
      cantidad_base: base,
      texto: textoCantidad(base, ins.unidad_compra),
      paquetes: ins.cantidad_compra !== 1
        ? `${Math.ceil(base / presentacion - 1e-9)} × ${numero(ins.cantidad_compra)} ${ins.unidad_compra}` : null,
      costo_cent: costo,
    })
  }
  out.items.sort((a, b) => a.insumo.nombre.localeCompare(b.insumo.nombre, 'es'))
  out.incompatibles = [...incompatibles]
  return out
}

/** "del lunes 5 al viernes 9 de octubre" */
export function textoRango(desde: string, hasta: string): string {
  const [, md, dd] = desde.split('-').map(Number)
  const [, mh, dh] = hasta.split('-').map(Number)
  const ini = `${DIAS[diaSemana(desde)]} ${dd}${md !== mh ? ` de ${MESES[md - 1]}` : ''}`
  return desde === hasta ? `${ini} de ${MESES[md - 1]}` : `del ${ini} al ${DIAS[diaSemana(hasta)]} ${dh} de ${MESES[mh - 1]}`
}

/** Texto plano para pegar en WhatsApp. */
export function textoParaCopiar(titulo: string, grupos: [string, ItemCompra[]][]): string {
  const lineas = [titulo]
  for (const [g, items] of grupos) {
    lineas.push('', `*${g}*`)
    for (const it of items) lineas.push(`- ${it.insumo.nombre}: ${it.texto}${it.paquetes ? ` (${it.paquetes})` : ''}`)
  }
  return lineas.join('\n')
}
