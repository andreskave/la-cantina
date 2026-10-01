import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { excelRespaldo, nombreRespaldo } from './exportarTodo'
import { datosDemo } from '../demo/datosDemo'

describe('Exportar todo', () => {
  const d = datosDemo()
  const wb = XLSX.read(XLSX.write(excelRespaldo(XLSX, {
    cantina: d.cantina.nombre, proveedores: d.proveedores, insumos: d.insumos, preciosVigentes: d.precios,
    historialPrecios: d.precios, recetas: d.recetas, menu: d.menu, alumnos: d.alumnos, movimientos: d.movimientos, caja: d.caja,
  }), { type: 'array', bookType: 'xlsx' }), { cellNF: true })
  const filas = (h: string) => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[h], { header: 1 })

  it('una hoja por entidad', () => {
    expect(wb.SheetNames).toEqual(['Proveedores', 'Insumos', 'Historial de precios', 'Recetas', 'Ingredientes', 'Menú', 'Alumnos', 'Movimientos de cuenta', 'Caja'])
  })
  it('con todas las filas', () => {
    expect(filas('Insumos')).toHaveLength(d.insumos.length + 1)
    expect(filas('Ingredientes')).toHaveLength(d.recetas.reduce((a, r) => a + r.ingredientes.length, 0) + 1)
    expect(filas('Movimientos de cuenta')).toHaveLength(d.movimientos.length + 1)
    expect(filas('Caja')).toHaveLength(d.caja.length + 1)
  })
  it('nombres en lugar de ids, fechas y pesos con formato', () => {
    const ing = filas('Ingredientes')
    expect(ing.some((f) => f[0] === 'Tallarines con tuco' && f[1] === 'Tuco' && f[2] === 'Sí')).toBe(true)
    expect(wb.Sheets['Movimientos de cuenta'].B2.z).toBe('dd/mm/yyyy')
    expect(wb.Sheets['Movimientos de cuenta'].F2.z).toBe('"$ "#,##0.00')
  })
  it('nombre del archivo', () => {
    expect(nombreRespaldo('La Cantina (demo)', '2026-10-15')).toBe('respaldo-la-cantina-demo-2026-10-15.xlsx')
  })
})
