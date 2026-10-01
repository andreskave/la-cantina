// Motor de costeo. Puro: no sabe de React ni de Supabase, para que lo use igual la app
// y la Edge Function que congela costos.
//
// Todos los importes son centésimos en número de punto flotante (sin redondear): se
// redondea solo al mostrar o al guardar.

import { UNIDADES, aBase, compatibles, type Dimension, type Unidad } from './unidades.ts'

export type PrecioCompra = { cantidad: number; unidad: Unidad; precio_cent: number }

export type InsumoCosteo = {
  id: string
  nombre: string
  merma_pct: number
  /** Precio vigente. null o ausente: sin precio (o el usuario no puede verlo). */
  precio?: PrecioCompra | null
}

export type IngredienteCosteo = {
  insumo_id?: string | null
  preparacion_id?: string | null
  cantidad: number
  unidad: Unidad
}

export type RecetaCosteo = {
  id: string
  nombre: string
  tipo: 'plato' | 'postre' | 'preparacion'
  modo: 'porcion' | 'olla' | null
  porciones: number | null
  rinde_cantidad: number | null
  rinde_unidad: Unidad | null
  ingredientes: IngredienteCosteo[]
}

export type LineaCosto = {
  /** Costo de la línea; null si está incompleta. */
  costo_cent: number | null
  /** Motivo si está incompleta. */
  falta: string | null
}

export type CostoReceta = {
  /** Suma de las líneas completas (si hay faltantes, es un mínimo). */
  total_cent: number
  /** Plato/postre: costo por porción. Preparación: null. */
  porcion_cent: number | null
  /** Preparación: costo por unidad base (g, ml o u) del rinde. Plato/postre: null. */
  por_base_cent: number | null
  completo: boolean
  faltantes: string[]
  lineas: LineaCosto[]
  ciclo: boolean
}

/** Costo por unidad base (g, ml o u) útil: precio / (cantidad × factor × (1 − merma/100)). */
export function costoBaseInsumo(ins: Pick<InsumoCosteo, 'merma_pct' | 'precio'>): number | null {
  const p = ins.precio
  if (!p || !(p.cantidad > 0) || !(p.precio_cent >= 0) || !UNIDADES[p.unidad]) return null
  const util = aBase(p.cantidad, p.unidad) * (1 - (ins.merma_pct || 0) / 100)
  return util > 0 ? p.precio_cent / util : null
}

export function porcionesDe(r: Pick<RecetaCosteo, 'tipo' | 'modo' | 'porciones'>): number | null {
  if (r.tipo === 'preparacion') return null
  return r.modo === 'olla' ? Math.max(1, r.porciones || 1) : 1
}

/** Cantidad del rinde de una preparación en unidad base, o null si falta. */
export function rindeBase(r: Pick<RecetaCosteo, 'rinde_cantidad' | 'rinde_unidad'>): number | null {
  if (!r.rinde_unidad || !(Number(r.rinde_cantidad) > 0)) return null
  return aBase(Number(r.rinde_cantidad), r.rinde_unidad)
}

export type Costeo = ReturnType<typeof crearCosteo>

/**
 * Arma el motor sobre una foto de insumos y recetas. Memoriza el costo de cada receta
 * guardada (la cascada se recalcula creando un motor nuevo con los datos nuevos).
 */
export function crearCosteo(insumos: InsumoCosteo[], recetas: RecetaCosteo[]) {
  const insById = new Map(insumos.map((i) => [i.id, i]))
  const recById = new Map(recetas.map((r) => [r.id, r]))
  const memo = new Map<string, CostoReceta>()

  function calcular(r: RecetaCosteo, pila: ReadonlySet<string>): CostoReceta {
    const pilaHijos = new Set(pila).add(r.id)
    const faltantes: string[] = []
    const lineas: LineaCosto[] = []
    let total = 0
    let ciclo = false

    for (const ing of r.ingredientes) {
      const linea = (costo: number | null, falta: string | null) => {
        lineas.push({ costo_cent: costo, falta })
        if (falta) faltantes.push(falta)
        if (costo !== null) total += costo
      }
      if (!UNIDADES[ing.unidad]) { linea(null, 'una unidad desconocida'); continue }

      if (ing.insumo_id) {
        const ins = insById.get(ing.insumo_id)
        if (!ins) { linea(null, 'un insumo que fue borrado'); continue }
        if (!ins.precio) { linea(null, `${ins.nombre} (sin precio)`); continue }
        if (!compatibles(ing.unidad, ins.precio.unidad)) { linea(null, `${ins.nombre} (unidad no compatible)`); continue }
        const cb = costoBaseInsumo(ins)
        if (cb === null) { linea(null, `${ins.nombre} (sin precio)`); continue }
        linea(cb * aBase(ing.cantidad, ing.unidad), null)
      } else if (ing.preparacion_id) {
        const prep = recById.get(ing.preparacion_id)
        if (!prep) { linea(null, 'una preparación que fue borrada'); continue }
        if (pilaHijos.has(prep.id)) { ciclo = true; linea(null, `${prep.nombre} (se usa a sí misma)`); continue }
        if (!prep.rinde_unidad || rindeBase(prep) === null) { linea(null, `${prep.nombre} (falta cuánto rinde)`); continue }
        if (!compatibles(ing.unidad, prep.rinde_unidad)) { linea(null, `${prep.nombre} (unidad no compatible)`); continue }
        const sub = calcularGuardada(prep, pilaHijos)
        if (sub.ciclo) ciclo = true
        // Si la preparación tiene faltantes, esta línea también queda incompleta.
        for (const f of sub.faltantes) faltantes.push(f)
        const costo = (sub.por_base_cent ?? 0) * aBase(ing.cantidad, ing.unidad)
        lineas.push({ costo_cent: sub.completo ? costo : null, falta: sub.completo ? null : `${prep.nombre} (incompleta)` })
        if (sub.completo) total += costo
      } else {
        linea(null, 'un ingrediente sin elegir')
      }
    }

    const unicos = [...new Set(faltantes)]
    const p = porcionesDe(r)
    const rb = r.tipo === 'preparacion' ? rindeBase(r) : null
    return {
      total_cent: total,
      porcion_cent: p ? total / p : null,
      por_base_cent: rb ? total / rb : null,
      completo: unicos.length === 0,
      faltantes: unicos,
      lineas,
      ciclo,
    }
  }

  function calcularGuardada(r: RecetaCosteo, pila: ReadonlySet<string>): CostoReceta {
    // Solo se memoriza lo calculado sin pila previa (en un ciclo el resultado depende del punto de entrada).
    if (pila.size === 0 || !hayCicloDesde(r.id)) {
      const m = memo.get(r.id)
      if (m) return m
      const c = calcular(r, new Set())
      memo.set(r.id, c)
      return c
    }
    return calcular(r, pila)
  }

  const cicloCache = new Map<string, boolean>()
  function hayCicloDesde(id: string): boolean {
    const c = cicloCache.get(id)
    if (c !== undefined) return c
    const v = buscarCamino(id, id, (rid) => recById.get(rid)?.ingredientes ?? []) !== null
    cicloCache.set(id, v)
    return v
  }

  return {
    /** Costo de una receta guardada (memorizado). */
    receta(id: string): CostoReceta | null {
      const r = recById.get(id)
      return r ? calcularGuardada(r, new Set()) : null
    },

    /** Costo de un borrador del editor (puede no estar guardado o tener cambios). */
    borrador(r: RecetaCosteo): CostoReceta {
      return calcular(r, new Set())
    },

    /**
     * Insumos que lleva `porciones` porciones de la receta (plato/postre), o `porciones`
     * veces la olla si es una preparación, expandiendo preparaciones a cualquier
     * profundidad. Cantidades en unidad base útil (sin merma). Se saltean las líneas
     * con preparación sin rinde, unidad incompatible o ciclos.
     */
    insumosDe(recetaId: string, porciones = 1): { insumo_id: string; cantidad_base: number; dimension: Dimension }[] {
      const acc = new Map<string, { insumo_id: string; cantidad_base: number; dimension: Dimension }>()
      const expandir = (r: RecetaCosteo, escala: number, pila: ReadonlySet<string>) => {
        if (pila.has(r.id)) return
        const pilaHijos = new Set(pila).add(r.id)
        for (const ing of r.ingredientes) {
          if (!UNIDADES[ing.unidad]) continue
          const q = aBase(ing.cantidad, ing.unidad) * escala
          if (ing.insumo_id) {
            const dim = UNIDADES[ing.unidad].dim
            const k = `${ing.insumo_id}|${dim}`
            const prev = acc.get(k)
            acc.set(k, { insumo_id: ing.insumo_id, dimension: dim, cantidad_base: (prev?.cantidad_base ?? 0) + q })
          } else if (ing.preparacion_id) {
            const prep = recById.get(ing.preparacion_id)
            const rb = prep ? rindeBase(prep) : null
            if (!prep || !rb || !prep.rinde_unidad || !compatibles(ing.unidad, prep.rinde_unidad)) continue
            expandir(prep, q / rb, pilaHijos)
          }
        }
      }
      const r = recById.get(recetaId)
      if (r) expandir(r, porciones / (porcionesDe(r) ?? 1), new Set())
      return [...acc.values()]
    },

    costoBaseInsumo(id: string): number | null {
      const i = insById.get(id)
      return i ? costoBaseInsumo(i) : null
    },

    /**
     * Si guardar `ingredientes` en la receta `recetaId` forma un ciclo, devuelve el
     * camino de nombres (ej. ["Tuco", "Salsa", "Tuco"]); si no, null.
     */
    cicloAlGuardar(recetaId: string, ingredientes: IngredienteCosteo[]): string[] | null {
      const vecinos = (rid: string) => (rid === recetaId ? ingredientes : recById.get(rid)?.ingredientes ?? [])
      for (const ing of ingredientes) {
        if (!ing.preparacion_id) continue
        if (ing.preparacion_id === recetaId) return [nombre(recetaId), nombre(recetaId)]
        const camino = buscarCamino(ing.preparacion_id, recetaId, vecinos)
        if (camino) return [nombre(recetaId), ...camino.map(nombre)]
      }
      return null
    },

    /** Recetas que usan directamente el insumo o la preparación. */
    usosDirectos(ref: { insumo_id?: string; preparacion_id?: string }): RecetaCosteo[] {
      return recetas.filter((r) => r.ingredientes.some((i) =>
        (ref.insumo_id && i.insumo_id === ref.insumo_id) || (ref.preparacion_id && i.preparacion_id === ref.preparacion_id)))
    },

    /** Todas las recetas cuyo costo cambia si cambia el insumo o la preparación (a cualquier profundidad). */
    afectadas(ref: { insumo_id?: string; preparacion_id?: string }): RecetaCosteo[] {
      const out = new Map<string, RecetaCosteo>()
      const cola = [...this.usosDirectos(ref)]
      while (cola.length) {
        const r = cola.shift()!
        if (out.has(r.id)) continue
        out.set(r.id, r)
        if (r.tipo === 'preparacion') cola.push(...this.usosDirectos({ preparacion_id: r.id }))
      }
      return [...out.values()]
    },
  }

  function nombre(id: string) {
    return recById.get(id)?.nombre ?? '¿?'
  }
}

/** Camino de recetas desde `desde` hasta `hasta` siguiendo preparaciones (BFS), o null. */
function buscarCamino(desde: string, hasta: string, vecinos: (id: string) => IngredienteCosteo[]): string[] | null {
  const previo = new Map<string, string | null>([[desde, null]])
  const cola = [desde]
  while (cola.length) {
    const actual = cola.shift()!
    for (const ing of vecinos(actual)) {
      const sig = ing.preparacion_id
      if (!sig) continue
      if (sig === hasta) {
        const camino = [hasta]
        for (let n: string | null = actual; n; n = previo.get(n) ?? null) camino.unshift(n)
        return camino
      }
      if (!previo.has(sig)) { previo.set(sig, actual); cola.push(sig) }
    }
  }
  return null
}
