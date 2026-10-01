// "Exportar todo" (sección 9): un Excel con una hoja por entidad. Sirve de respaldo.
import type * as XLSXTipos from 'xlsx'
import { serialExcel } from './fechas'
import { TIPO_CAJA_TXT } from './caja'
import type { Alumno, DiaMenu, Insumo, MovCaja, Movimiento, PrecioCompra, Proveedor, Receta } from '../datos/tipos'

type XLSX = typeof XLSXTipos
type Celda = string | number | boolean | null

export type DatosRespaldo = {
  cantina: string
  proveedores: Proveedor[]
  insumos: Insumo[]
  preciosVigentes: PrecioCompra[]
  historialPrecios: PrecioCompra[]
  recetas: Receta[]
  menu: DiaMenu[]
  alumnos: Alumno[]
  movimientos: Movimiento[]
  caja: MovCaja[]
}

const PESOS = '"$ "#,##0.00'
const FECHA = 'dd/mm/yyyy'
const pesos = (cent: number | null | undefined) => (cent === null || cent === undefined ? null : cent / 100)

export const nombreRespaldo = (cantina: string, hoy: string) =>
  `respaldo-${cantina.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${hoy}.xlsx`

/** Hoja con encabezado; columnas de fecha y de pesos con su formato. */
function hoja(X: XLSX, cab: string[], filas: Celda[][], formatos: { fechas?: number[]; pesos?: number[] } = {}) {
  const ws = X.utils.aoa_to_sheet([cab, ...filas])
  ws['!cols'] = cab.map((c) => ({ wch: Math.max(10, Math.min(36, c.length + 6)) }))
  for (let r = 1; r <= filas.length; r++) {
    for (const c of formatos.fechas ?? []) { const x = ws[X.utils.encode_cell({ r, c })]; if (x && typeof x.v === 'number') x.z = FECHA }
    for (const c of formatos.pesos ?? []) { const x = ws[X.utils.encode_cell({ r, c })]; if (x && typeof x.v === 'number') x.z = PESOS }
  }
  return ws
}

export function excelRespaldo(X: XLSX, d: DatosRespaldo): XLSXTipos.WorkBook {
  const prov = new Map(d.proveedores.map((p) => [p.id, p.nombre]))
  const ins = new Map(d.insumos.map((i) => [i.id, i.nombre]))
  const rec = new Map(d.recetas.map((r) => [r.id, r.nombre]))
  const alu = new Map(d.alumnos.map((a) => [a.id, a.nombre]))
  const vigente = new Map(d.preciosVigentes.map((p) => [p.insumo_id, p]))
  const wb = X.utils.book_new()
  const agregar = (nombre: string, ws: XLSXTipos.WorkSheet) => X.utils.book_append_sheet(wb, ws, nombre)

  agregar('Proveedores', hoja(X, ['Nombre', 'Teléfono', 'Notas'], d.proveedores.map((p) => [p.nombre, p.telefono, p.notas])))
  agregar('Insumos', hoja(X,
    ['Nombre', 'Categoría', 'Proveedor', 'Cantidad de compra', 'Unidad', 'Merma %', 'Lo vendo tal cual', 'Activo', 'Precio actual', 'Precio por', 'Fecha del precio'],
    d.insumos.map((i) => {
      const p = vigente.get(i.id)
      return [i.nombre, i.categoria, prov.get(i.proveedor_id ?? '') ?? null, i.cantidad_compra, i.unidad_compra, i.merma_pct,
        i.es_reventa ? 'Sí' : 'No', i.activo ? 'Sí' : 'No', pesos(p?.precio_cent), p ? `${p.cantidad} ${p.unidad}` : null, p ? serialExcel(p.fecha) : null]
    }), { pesos: [8], fechas: [10] }))
  agregar('Historial de precios', hoja(X, ['Insumo', 'Fecha', 'Cantidad', 'Unidad', 'Precio'],
    d.historialPrecios.map((p) => [ins.get(p.insumo_id) ?? '—', serialExcel(p.fecha), p.cantidad, p.unidad, pesos(p.precio_cent)]),
    { fechas: [1], pesos: [4] }))
  agregar('Recetas', hoja(X, ['Nombre', 'Tipo', 'Modo', 'Porciones de la olla', 'Rinde', 'Unidad del rinde', 'Activa'],
    d.recetas.map((r) => [r.nombre, r.tipo, r.modo, r.porciones, r.rinde_cantidad, r.rinde_unidad, r.activo ? 'Sí' : 'No'])))
  agregar('Ingredientes', hoja(X, ['Receta', 'Ingrediente', 'Es preparación', 'Cantidad', 'Unidad'],
    d.recetas.flatMap((r) => r.ingredientes.map((i) => [r.nombre, i.insumo_id ? ins.get(i.insumo_id) ?? '—' : rec.get(i.preparacion_id ?? '') ?? '—',
      i.preparacion_id ? 'Sí' : 'No', i.cantidad, i.unidad]))))
  agregar('Menú', hoja(X, ['Fecha', 'Plato', 'Postre', 'Menús pedidos', 'No se cocina', 'Motivo'],
    [...d.menu].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((m) => [serialExcel(m.fecha),
      m.plato_receta_id ? rec.get(m.plato_receta_id) ?? '—' : m.plato_texto, m.postre_receta_id ? rec.get(m.postre_receta_id) ?? '—' : m.postre_texto,
      m.pedidos, m.sin_cocina ? 'Sí' : 'No', m.motivo]), { fechas: [0] }))
  agregar('Alumnos', hoja(X, ['Nombre', 'Responsable', 'Teléfono', 'Activo', 'Notas'],
    d.alumnos.map((a) => [a.nombre, a.responsable_nombre, a.responsable_telefono, a.activo ? 'Sí' : 'No', a.notas])))
  agregar('Movimientos de cuenta', hoja(X, ['Alumno', 'Fecha', 'Tipo', 'Concepto', 'Cantidad', 'Importe', 'Medio de pago', 'Anulado', 'Motivo de anulación'],
    d.movimientos.map((m) => [alu.get(m.alumno_id) ?? '—', serialExcel(m.fecha), m.tipo === 'cargo' ? 'Consumo' : 'Pago', m.concepto, m.cantidad,
      pesos(m.importe_cent), m.medio_pago, m.anulado ? 'Sí' : 'No', m.anulado_motivo]), { fechas: [1], pesos: [5] }))
  agregar('Caja', hoja(X, ['Fecha', 'Tipo', 'Detalle', 'Subcategoría', 'Proveedor', 'Importe', 'Medio de pago', 'Origen', 'Anulado'],
    [...d.caja].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((m) => [serialExcel(m.fecha), TIPO_CAJA_TXT[m.tipo], m.concepto, m.subcategoria,
      prov.get(m.proveedor_id ?? '') ?? null, pesos(m.importe_cent), m.medio_pago, m.origen, m.anulado ? 'Sí' : 'No']), { fechas: [0], pesos: [5] }))
  return wb
}
