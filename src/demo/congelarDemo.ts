// En el modo demo no hay cron: al arrancar se congelan los días pasados con los precios
// vigentes en cada fecha, para que se vea la diferencia entre días pasados y futuros.
import { crearCosteo, type InsumoCosteo, type RecetaCosteo } from '../lib/costeo'
import { congelarDia } from '../lib/menu'
import type { DatosMemoria } from '../datos/memoriaApi'

export function congelarPasados(d: DatosMemoria, hoy: string) {
  for (const dia of d.menu) {
    if (dia.fecha >= hoy) continue
    const insumos: InsumoCosteo[] = d.insumos.map((i) => {
      const p = d.precios.filter((x) => x.insumo_id === i.id && x.fecha <= dia.fecha).sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
      return { id: i.id, nombre: i.nombre, merma_pct: i.merma_pct, precio: p ? { cantidad: p.cantidad, unidad: p.unidad, precio_cent: p.precio_cent } : null }
    })
    const fila = congelarDia(dia, crearCosteo(insumos, d.recetas as RecetaCosteo[]), new Map(insumos.map((i) => [i.id, i])))
    if (fila) d.congelados.push({ fecha: dia.fecha, costo_plato_cent: fila.costo_plato_cent, costo_postre_cent: fila.costo_postre_cent, costo_total_cent: fila.costo_total_cent })
  }
}
