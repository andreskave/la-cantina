// Reglas del menú (secciones 6.5 y 6.10). Puro: lo usan la app y la Edge Function
// que congela costos, por eso los imports llevan extensión .ts.

import { aBase, costoBaseInsumo, type Costeo, type InsumoCosteo, type Unidad } from './costeo/index.ts'
import { BASE_POR_DIM } from './costeo/unidades.ts'
import { habilesMes, mesMas, sumarDias } from './fechas.ts'

export const MOTIVOS = ['Feriado', 'Vacaciones', 'Paro'] as const

export type DiaMenu = {
  fecha: string
  plato_receta_id: string | null
  plato_texto: string | null
  postre_receta_id: string | null
  postre_texto: string | null
  pedidos: number | null
  sin_cocina: boolean
  motivo: string | null
}

export type CostoCongelado = {
  fecha: string
  costo_plato_cent: number | null
  costo_postre_cent: number | null
  costo_total_cent: number
}

type RecetaNombre = { id: string; nombre: string }

export type Componente = {
  nombre: string
  /** null: escrito a mano, incompleto o (en días pasados) sin dato congelado. */
  costo_cent: number | null
  aMano: boolean
}

export type EstadoDia =
  | { tipo: 'vacio'; fecha: string }
  | { tipo: 'sin_cocina'; fecha: string; motivo: string }
  | {
      tipo: 'menu'
      fecha: string
      plato: Componente | null
      postre: Componente | null
      pedidos: number | null
      /** Costo por menú; null = "Sin costear". */
      costo_cent: number | null
      /** true si el costo sale de menu_dia_costos (día pasado). */
      congelado: boolean
    }

/** El motivo tal cual se muestra en calendario, Hoy, imagen y Excel (nunca "Sin servicio"). */
export const textoMotivo = (d: Pick<DiaMenu, 'motivo'>) => d.motivo?.trim() || 'Sin clases'

const tieneMenu = (d: DiaMenu) => Boolean(d.plato_receta_id || d.plato_texto || d.postre_receta_id || d.postre_texto)

function componente(costeo: Costeo | null, recetas: Map<string, RecetaNombre>, id: string | null, texto: string | null): Componente | null {
  if (id) {
    const c = costeo?.receta(id)
    return {
      nombre: recetas.get(id)?.nombre ?? '—',
      costo_cent: c && c.completo && c.porcion_cent !== null ? c.porcion_cent : null,
      aMano: false,
    }
  }
  if (texto?.trim()) return { nombre: texto.trim(), costo_cent: null, aMano: true }
  return null
}

/**
 * Estado de un día. Los días pasados usan el costo congelado (o "Sin costear" si no hay);
 * hoy y los futuros, el costo con los precios actuales. Sin `costeo` (ayudante) no hay costos.
 */
export function estadoDia(fecha: string, dia: DiaMenu | undefined, ctx: {
  hoy: string
  costeo: Costeo | null
  recetas: Map<string, RecetaNombre>
  congelados: Map<string, CostoCongelado>
}): EstadoDia {
  if (!dia) return { tipo: 'vacio', fecha }
  if (dia.sin_cocina) return { tipo: 'sin_cocina', fecha, motivo: textoMotivo(dia) }
  if (!tieneMenu(dia)) return { tipo: 'vacio', fecha }

  const plato = componente(ctx.costeo, ctx.recetas, dia.plato_receta_id, dia.plato_texto)
  const postre = componente(ctx.costeo, ctx.recetas, dia.postre_receta_id, dia.postre_texto)
  const pasado = fecha < ctx.hoy
  if (pasado) {
    const c = ctx.congelados.get(fecha)
    return {
      tipo: 'menu', fecha, pedidos: dia.pedidos, congelado: true,
      plato: plato && { ...plato, costo_cent: c ? c.costo_plato_cent : null },
      postre: postre && { ...postre, costo_cent: c ? c.costo_postre_cent : null },
      costo_cent: c ? c.costo_total_cent : null,
    }
  }
  const partes = [plato, postre].filter((x): x is Componente => x !== null)
  const completo = ctx.costeo !== null && partes.every((p) => p.costo_cent !== null)
  return {
    tipo: 'menu', fecha, plato, postre, pedidos: dia.pedidos, congelado: false,
    costo_cent: completo ? partes.reduce((a, p) => a + p.costo_cent!, 0) : null,
  }
}

export type Semaforo = 'ok' | 'warn' | 'mute'

/** Verde si el costo es ≤ objetivo % del precio; naranja si lo supera o está sin costear. */
export function semaforo(costo_cent: number | null, precio_cent: number | null, objetivoPct: number): Semaforo {
  if (costo_cent === null) return 'warn'
  if (!precio_cent) return 'mute'
  return costo_cent <= (precio_cent * objetivoPct) / 100 ? 'ok' : 'warn'
}

/** Precio del menú vigente en una fecha, a partir de su historial. */
export function precioEn(fecha: string, historial: { vigente_desde: string; precio_cent: number }[]): number | null {
  let mejor: { vigente_desde: string; precio_cent: number } | null = null
  for (const h of historial) if (h.vigente_desde <= fecha && (!mejor || h.vigente_desde > mejor.vigente_desde)) mejor = h
  return mejor?.precio_cent ?? null
}

/**
 * Copiar mes anterior: los días con menú del mes anterior, en orden, a los días hábiles
 * vacíos del mes. No pisa días cargados (tampoco los "sin cocina") ni copia los pedidos.
 */
export function copiarMesAnterior(mes: string, dias: DiaMenu[]): DiaMenu[] {
  const porFecha = new Map(dias.map((d) => [d.fecha, d]))
  const origen = habilesMes(mesMas(mes, -1)).map((f) => porFecha.get(f)).filter((d): d is DiaMenu => Boolean(d && !d.sin_cocina && tieneMenu(d)))
  const destino = habilesMes(mes).filter((f) => !porFecha.has(f))
  return destino.slice(0, origen.length).map((fecha, i) => ({
    fecha,
    plato_receta_id: origen[i].plato_receta_id, plato_texto: origen[i].plato_texto,
    postre_receta_id: origen[i].postre_receta_id, postre_texto: origen[i].postre_texto,
    pedidos: null, sin_cocina: false, motivo: null,
  }))
}

export type LineaDetalle = {
  receta: 'plato' | 'postre'
  insumo_id: string
  nombre: string
  cantidad_base: number
  unidad_base: Unidad
  merma_pct: number
  precio: { cantidad: number; unidad: Unidad; precio_cent: number }
  costo_cent: number
}

export type FilaCongelada = {
  costo_plato_cent: number | null
  costo_postre_cent: number | null
  costo_total_cent: number
  detalle: { lineas: LineaDetalle[] }
}

/**
 * Lo que se guarda en menu_dia_costos para un día con los precios actuales, o null si
 * el día no es costeable (sin cocina, sin menú, escrito a mano o incompleto).
 */
export function congelarDia(dia: DiaMenu, costeo: Costeo, insumos: Map<string, InsumoCosteo>): FilaCongelada | null {
  if (dia.sin_cocina || !tieneMenu(dia) || dia.plato_texto || dia.postre_texto) return null
  const costos: Record<'plato' | 'postre', number | null> = { plato: null, postre: null }
  const lineas: LineaDetalle[] = []
  for (const parte of ['plato', 'postre'] as const) {
    const id = parte === 'plato' ? dia.plato_receta_id : dia.postre_receta_id
    if (!id) continue
    const c = costeo.receta(id)
    if (!c || !c.completo || c.porcion_cent === null) return null
    costos[parte] = Math.round(c.porcion_cent)
    for (const l of costeo.insumosDe(id, 1)) {
      const ins = insumos.get(l.insumo_id)
      if (!ins?.precio) return null
      const cb = costoBaseInsumo(ins)!
      lineas.push({
        receta: parte, insumo_id: l.insumo_id, nombre: ins.nombre,
        cantidad_base: Math.round(l.cantidad_base * 10000) / 10000, unidad_base: BASE_POR_DIM[l.dimension],
        merma_pct: ins.merma_pct, precio: ins.precio, costo_cent: Math.round(cb * l.cantidad_base * 100) / 100,
      })
    }
  }
  return {
    costo_plato_cent: costos.plato,
    costo_postre_cent: costos.postre,
    costo_total_cent: (costos.plato ?? 0) + (costos.postre ?? 0),
    detalle: { lineas },
  }
}

export type ResumenMes = {
  costoPromedio: number | null
  gananciaPromedio: number | null
  diasCargados: number
  diasConCocina: number
  diasSinCostear: number
  menusEstimados: number
}

/** Resumen del mes para Hoy y Menú. `precioDe(fecha)` da el precio del menú ese día. */
export function resumenMes(estados: EstadoDia[], precioDe: (fecha: string) => number | null, pedidosDefault: number): ResumenMes {
  let cargados = 0, sinCostear = 0, cerrados = 0, sumaCosto = 0, nCosto = 0, sumaGan = 0, nGan = 0, menus = 0
  for (const e of estados) {
    if (e.tipo === 'sin_cocina') { cerrados++; continue }
    if (e.tipo !== 'menu') continue
    cargados++
    menus += e.pedidos ?? pedidosDefault
    if (e.costo_cent === null) { sinCostear++; continue }
    sumaCosto += e.costo_cent; nCosto++
    const p = precioDe(e.fecha)
    if (p) { sumaGan += p - e.costo_cent; nGan++ }
  }
  return {
    costoPromedio: nCosto ? sumaCosto / nCosto : null,
    gananciaPromedio: nGan ? sumaGan / nGan : null,
    diasCargados: cargados,
    diasConCocina: estados.length - cerrados,
    diasSinCostear: sinCostear,
    menusEstimados: menus,
  }
}

export type CambioPrecio = { insumo_id: string; fecha: string; variacion: number; ahora: { cantidad: number; unidad: Unidad; precio_cent: number } }

/**
 * Insumos cuyo precio cambió en los últimos `dias` días, comparando el precio por
 * unidad base del último cambio con el anterior. Ordenados por la variación más grande.
 */
export function preciosQueCambiaron(
  historial: { insumo_id: string; fecha: string; cantidad: number; unidad: Unidad; precio_cent: number }[],
  hoy: string, dias = 30,
): CambioPrecio[] {
  const desde = sumarDias(hoy, -dias)
  const porInsumo = new Map<string, typeof historial>()
  for (const h of historial) porInsumo.set(h.insumo_id, [...(porInsumo.get(h.insumo_id) ?? []), h])
  const out: CambioPrecio[] = []
  for (const [id, filas] of porInsumo) {
    if (filas.length < 2) continue
    const [ult, ant] = [...filas].sort((a, b) => b.fecha.localeCompare(a.fecha))
    if (ult.fecha < desde || ult.fecha > hoy) continue
    const pu = (f: typeof ult) => f.precio_cent / aBase(f.cantidad, f.unidad)
    if (!(pu(ant) > 0)) continue
    const variacion = pu(ult) / pu(ant) - 1
    if (Math.abs(variacion) < 0.0005) continue
    out.push({ insumo_id: id, fecha: ult.fecha, variacion, ahora: { cantidad: ult.cantidad, unidad: ult.unidad, precio_cent: ult.precio_cent } })
  }
  return out.sort((a, b) => Math.abs(b.variacion) - Math.abs(a.variacion))
}
