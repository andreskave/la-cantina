// Excel del menú (sección 9). Recibe el módulo de SheetJS por parámetro para que la app
// lo cargue recién cuando hace falta (es pesado).
import type * as XLSXTipos from 'xlsx'
import { DIAS, DIAS_CORTOS, MESES, capitalizar } from './formato'
import { diaSemana, semanasDelMes, serialExcel } from './fechas'
import type { EstadoDia } from './menu'

type XLSX = typeof XLSXTipos
type Celda = string | number | null

const FORMATO_FECHA = 'dd/mm/yyyy'
const FORMATO_PESOS = '"$ "#,##0.00'

export type DatosExcelMenu = {
  mes: string                          // "2026-10"
  cantina: string
  estados: Map<string, EstadoDia>      // por fecha (días hábiles del mes)
  interno: boolean
  precioDe: (fecha: string) => number | null
  pedidosDefault: number
}

export const nombreArchivoMenu = (mes: string, ext: 'xlsx' | 'png', interno = false) =>
  `menu-${MESES[Number(mes.slice(5)) - 1]}-${mes.slice(0, 4)}${interno ? '-interno' : ''}.${ext}`

const pesos = (cent: number | null | undefined) => (cent === null || cent === undefined ? null : Math.round(cent) / 100)

function textoPlato(e: EstadoDia | undefined) {
  if (!e) return ''
  if (e.tipo === 'sin_cocina') return e.motivo
  return e.tipo === 'menu' ? e.plato?.nombre ?? '' : ''
}
const textoPostre = (e: EstadoDia | undefined) => (e?.tipo === 'menu' ? e.postre?.nombre ?? '' : '')

function hojaCalendario(X: XLSX, d: DatosExcelMenu) {
  const mes = Number(d.mes.slice(5))
  const filas: Celda[][] = [
    [`Menú de ${MESES[mes - 1]} ${d.mes.slice(0, 4)}`], [d.cantina], [],
    ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'],
  ]
  const filasCosto: number[] = []
  for (const semana of semanasDelMes(d.mes)) {
    const es = semana.map((f) => (f ? d.estados.get(f) : undefined))
    filas.push(['', ...semana.map((f) => (f ? `${capitalizar(DIAS_CORTOS[diaSemana(f)])} ${Number(f.slice(8))}/${mes}` : ''))])
    filas.push(['Plato', ...es.map(textoPlato)])
    filas.push(['Postre', ...es.map(textoPostre)])
    if (d.interno) {
      filas.push(['Menús pedidos', ...es.map((e) => (e?.tipo === 'menu' ? e.pedidos ?? null : null))])
      filasCosto.push(filas.length)
      filas.push(['Costo por menú', ...es.map((e) => (e?.tipo === 'menu' ? (e.costo_cent === null ? 'Sin costear' : pesos(e.costo_cent)) : null))])
    }
    filas.push([])
  }
  const ws = X.utils.aoa_to_sheet(filas)
  ws['!cols'] = [{ wch: 16 }, ...Array(5).fill({ wch: 30 })]
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }]
  for (const r of filasCosto) for (let c = 1; c <= 5; c++) {
    const cell = ws[X.utils.encode_cell({ r, c })]
    if (cell && typeof cell.v === 'number') cell.z = FORMATO_PESOS
  }
  return ws
}

function hojaLista(X: XLSX, d: DatosExcelMenu) {
  const cab = ['Fecha', 'Día', 'Plato', 'Postre']
  if (d.interno) cab.push('Estado', 'Menús pedidos', 'Costo plato', 'Costo postre', 'Costo por menú', 'Precio del menú', 'Ganancia por menú', 'Ganancia del día')
  const filas: Celda[][] = [cab]
  const fechas = [...d.estados.keys()].sort()
  let totalMenus = 0, totalGanancia = 0, sumaCosto = 0, nCosto = 0
  for (const f of fechas) {
    const e = d.estados.get(f)!
    const fila: Celda[] = [serialExcel(f), capitalizar(DIAS[diaSemana(f)]), textoPlato(e), textoPostre(e)]
    if (d.interno) {
      if (e.tipo === 'sin_cocina') fila.push(e.motivo)
      else if (e.tipo === 'vacio') fila.push('Sin menú')
      else {
        const pedidos = e.pedidos ?? d.pedidosDefault
        const precio = d.precioDe(f)
        const gan = e.costo_cent !== null && precio ? precio - e.costo_cent : null
        fila.push(e.costo_cent === null ? 'Sin costear' : 'Costeado', pedidos || null, pesos(e.plato?.costo_cent), pesos(e.postre?.costo_cent),
          pesos(e.costo_cent), pesos(precio), pesos(gan), gan !== null && pedidos ? pesos(gan * pedidos) : null)
        totalMenus += pedidos
        if (e.costo_cent !== null) { sumaCosto += e.costo_cent; nCosto++ }
        if (gan !== null) totalGanancia += gan * pedidos
      }
    }
    filas.push(fila)
  }
  if (d.interno) {
    filas.push([])
    filas.push(['Total del mes', '', '', '', '', totalMenus, null, null, nCosto ? pesos(sumaCosto / nCosto) : null, null, null, pesos(totalGanancia)])
    filas.push(['', '', '', '', '', 'menús', '', '', 'costo promedio', '', '', 'ganancia estimada'])
  }
  const ws = X.utils.aoa_to_sheet(filas)
  ws['!cols'] = [{ wch: 12 }, { wch: 11 }, { wch: 30 }, { wch: 28 },
    ...(d.interno ? [{ wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 17 }, { wch: 17 }] : [])]
  for (let r = 1; r < filas.length; r++) {
    const fecha = ws[X.utils.encode_cell({ r, c: 0 })]
    if (fecha && typeof fecha.v === 'number' && r <= fechas.length) fecha.z = FORMATO_FECHA
    if (d.interno) for (let c = 6; c < cab.length; c++) {
      const cell = ws[X.utils.encode_cell({ r, c })]
      if (cell && typeof cell.v === 'number') cell.z = FORMATO_PESOS
    }
  }
  ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: fechas.length, c: cab.length - 1 } }) }
  return ws
}

export function excelMenu(X: XLSX, d: DatosExcelMenu): XLSXTipos.WorkBook {
  const wb = X.utils.book_new()
  X.utils.book_append_sheet(wb, hojaCalendario(X, d), 'Calendario')
  X.utils.book_append_sheet(wb, hojaLista(X, d), 'Lista')
  return wb
}
