import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { excelMenu, nombreArchivoMenu, type DatosExcelMenu } from './exportarMenu'
import { habilesMes } from './fechas'
import type { EstadoDia } from './menu'

function datos(interno: boolean): DatosExcelMenu {
  const estados = new Map<string, EstadoDia>(habilesMes('2026-10').map((f) => [f, { tipo: 'vacio', fecha: f }]))
  estados.set('2026-10-01', {
    tipo: 'menu', fecha: '2026-10-01', pedidos: 60, congelado: true, costo_cent: 9050,
    plato: { nombre: 'Tallarines con tuco', costo_cent: 7044, aMano: false }, postre: { nombre: 'Flan', costo_cent: 2006, aMano: false },
  })
  estados.set('2026-10-12', { tipo: 'sin_cocina', fecha: '2026-10-12', motivo: 'Feriado' })
  estados.set('2026-10-15', {
    tipo: 'menu', fecha: '2026-10-15', pedidos: null, congelado: false, costo_cent: null,
    plato: { nombre: 'Guiso', costo_cent: null, aMano: true }, postre: null,
  })
  return { mes: '2026-10', cantina: 'La Cantina', estados, interno, precioDe: () => 26000, pedidosDefault: 60 }
}

/** Escribe y vuelve a leer el archivo, como lo abriría Excel. */
const ida = (d: DatosExcelMenu) => XLSX.read(XLSX.write(excelMenu(XLSX, d), { type: 'array', bookType: 'xlsx' }), { cellNF: true })

const celdas = (wb: XLSX.WorkBook) => wb.SheetNames.flatMap((n) =>
  Object.entries(wb.Sheets[n]).filter(([k]) => !k.startsWith('!')).map(([k, c]) => ({ hoja: n, ref: k, ...(c as XLSX.CellObject) })))

describe('Excel del menú', () => {
  it('nombres de archivo', () => {
    expect(nombreArchivoMenu('2026-10', 'xlsx')).toBe('menu-octubre-2026.xlsx')
    expect(nombreArchivoMenu('2026-10', 'xlsx', true)).toBe('menu-octubre-2026-interno.xlsx')
    expect(nombreArchivoMenu('2026-09', 'png')).toBe('menu-setiembre-2026.png')
  })

  it('el de las familias no contiene la palabra "precio" ni ningún importe', () => {
    const wb = ida(datos(false))
    expect(wb.SheetNames).toEqual(['Calendario', 'Lista'])
    for (const c of celdas(wb)) {
      expect(String(c.v), c.ref).not.toMatch(/precio|costo|ganancia|\$/i)
      // Los únicos números son las fechas de la columna A de la Lista.
      if (typeof c.v === 'number') expect(c.hoja === 'Lista' && c.ref.startsWith('A'), `${c.hoja}!${c.ref}`).toBe(true)
    }
  })

  it('las fechas son fechas reales de Excel y coinciden con el día correcto', () => {
    const wb = ida(datos(false))
    const lista = wb.Sheets.Lista
    expect(lista.A2.z).toBe('dd/mm/yyyy')
    expect(XLSX.SSF.format('dd/mm/yyyy', lista.A2.v as number)).toBe('01/10/2026')
    expect(lista.B2.v).toBe('Jueves')
    const filas = XLSX.utils.sheet_to_json<string[]>(lista, { header: 1, raw: false })
    expect(filas.find((f) => f[0] === '12/10/2026')).toEqual(['12/10/2026', 'Lunes', 'Feriado', ''])
  })

  it('un feriado aparece como "Feriado" en el calendario', () => {
    const cal = XLSX.utils.sheet_to_json<string[]>(ida(datos(false)).Sheets.Calendario, { header: 1, raw: false, defval: '' })
    const semana = cal.findIndex((f) => f[1] === 'Lun 12/10')
    expect(cal[semana + 1]).toEqual(['Plato', 'Feriado', '', '', 'Guiso', ''])
  })

  it('el interno trae pedidos, costos y ganancia con formato de moneda', () => {
    const wb = ida(datos(true))
    const filas = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets.Lista, { header: 1, defval: null })
    expect(filas[0]).toContain('Ganancia del día')
    expect(wb.Sheets.Lista.A2.t).toBe('n')
    expect(XLSX.SSF.format('dd/mm/yyyy', wb.Sheets.Lista.A2.v as number)).toBe('01/10/2026')
    expect(filas[1].slice(1)).toEqual(['Jueves', 'Tallarines con tuco', 'Flan', 'Costeado', 60, 70.44, 20.06, 90.5, 260, 169.5, 10170])
    expect(wb.Sheets.Lista.I2.z).toBe('"$ "#,##0.00')
    const guiso = filas.find((f) => f[2] === 'Guiso')!
    expect(guiso[4]).toBe('Sin costear')
    const total = filas.find((f) => f[0] === 'Total del mes')!
    expect(total[5]).toBe(120)
    expect(total[11]).toBe(10170)
  })
})
