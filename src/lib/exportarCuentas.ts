// Archivos de cuentas corrientes: Excel de todas las cuentas y estado de cuenta en PDF.
// Reciben las librerías por parámetro para cargarlas recién cuando hacen falta.
import type * as XLSXTipos from 'xlsx'
import type { jsPDF as JsPDF } from 'jspdf'
import { serialExcel } from './fechas'
import { fechaLarga, pesos } from './formato'
import type { EstadoCuenta } from './cuentas'

type XLSX = typeof XLSXTipos
const FORMATO_PESOS = '"$ "#,##0.00'

export type FilaSaldo = { alumno: string; responsable: string | null; telefono: string | null; saldo_cent: number }
export type FilaPartida = { alumno: string; fecha: string; concepto: string; importe_cent: number; pendiente_cent: number }

export const nombreExcelCuentas = (hoy: string) => `cuentas-${hoy}.xlsx`

export function excelCuentas(X: XLSX, saldos: FilaSaldo[], partidas: FilaPartida[], etiqueta = 'Alumno'): XLSXTipos.WorkBook {
  const wb = X.utils.book_new()

  const s = [...saldos].sort((a, b) => a.alumno.localeCompare(b.alumno, 'es'))
  const hojaSaldos = X.utils.aoa_to_sheet([
    [etiqueta, 'Responsable', 'Teléfono', 'Saldo'],
    ...s.map((f) => [f.alumno, f.responsable ?? '', f.telefono ?? '', f.saldo_cent / 100]),
    [],
    ['Total adeudado', '', '', s.reduce((a, f) => a + Math.max(0, f.saldo_cent), 0) / 100],
  ])
  hojaSaldos['!cols'] = [{ wch: 28 }, { wch: 24 }, { wch: 16 }, { wch: 14 }]
  for (let r = 1; r <= s.length + 2; r++) {
    const c = hojaSaldos[X.utils.encode_cell({ r, c: 3 })]
    if (c && typeof c.v === 'number') c.z = FORMATO_PESOS
  }
  X.utils.book_append_sheet(wb, hojaSaldos, 'Saldos')

  const p = [...partidas].sort((a, b) => a.alumno.localeCompare(b.alumno, 'es') || a.fecha.localeCompare(b.fecha))
  const hojaPartidas = X.utils.aoa_to_sheet([
    [etiqueta, 'Fecha', 'Concepto', 'Importe', 'Pendiente'],
    ...p.map((f) => [f.alumno, serialExcel(f.fecha), f.concepto, f.importe_cent / 100, f.pendiente_cent / 100]),
  ])
  hojaPartidas['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 34 }, { wch: 12 }, { wch: 12 }]
  for (let r = 1; r <= p.length; r++) {
    hojaPartidas[X.utils.encode_cell({ r, c: 1 })].z = 'dd/mm/yyyy'
    hojaPartidas[X.utils.encode_cell({ r, c: 3 })].z = FORMATO_PESOS
    hojaPartidas[X.utils.encode_cell({ r, c: 4 })].z = FORMATO_PESOS
  }
  X.utils.book_append_sheet(wb, hojaPartidas, 'Partidas abiertas')
  return wb
}

const fechaCorta = (iso: string) => iso.split('-').reverse().join('/')

/** Estado de cuenta en PDF (A4). */
export function pdfEstadoCuenta(Pdf: typeof JsPDF, e: EstadoCuenta): JsPDF {
  const doc = new Pdf({ unit: 'mm', format: 'a4' })
  const M = 18
  const W = 210 - M * 2
  let y = 22

  doc.setFillColor(46, 106, 78)
  doc.rect(0, 0, 210, 6, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(28, 38, 32)
  doc.text(e.cantina, M, y)
  y += 9
  doc.setFontSize(13); doc.text('Estado de cuenta', M, y)
  y += 8
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(91, 104, 96)
  doc.text(`${e.etiqueta_alumno ?? 'Alumno'}: ${e.alumno}`, M, y); y += 6
  if (e.responsable) { doc.text(`Responsable: ${e.responsable}`, M, y); y += 6 }
  doc.text(`Emitido el ${fechaLarga(e.emision)} (${fechaCorta(e.emision)})`, M, y)
  y += 12

  doc.setTextColor(28, 38, 32)
  if (e.partidas.length) {
    const col = { fecha: M, concepto: M + 24, importe: M + W - 34, pendiente: M + W }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
    doc.text('Fecha', col.fecha, y)
    doc.text('Concepto', col.concepto, y)
    doc.text('Importe', col.importe, y, { align: 'right' })
    doc.text('Pendiente', col.pendiente, y, { align: 'right' })
    y += 2
    doc.setDrawColor(216, 223, 212); doc.line(M, y, M + W, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    for (const p of e.partidas) {
      if (y > 270) { doc.addPage(); y = 22 }
      const concepto = doc.splitTextToSize(p.concepto, col.importe - col.concepto - 24) as string[]
      doc.text(fechaCorta(p.fecha), col.fecha, y)
      doc.text(concepto, col.concepto, y)
      doc.text(pesos(p.importe_cent), col.importe, y, { align: 'right' })
      doc.text(pesos(p.pendiente_cent), col.pendiente, y, { align: 'right' })
      y += 6 * concepto.length
    }
    doc.line(M, y - 3, M + W, y - 3)
    y += 4
  } else {
    doc.setFontSize(11)
    doc.text('No hay consumos pendientes de pago.', M, y)
    y += 10
  }

  if (e.aFavor_cent > 0) {
    doc.setFontSize(11); doc.text(`Saldo a favor: ${pesos(e.aFavor_cent)}`, M, y); y += 8
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14)
  doc.text(`Total a pagar: ${pesos(e.total_cent)}`, M + W, y + 2, { align: 'right' })
  return doc
}
