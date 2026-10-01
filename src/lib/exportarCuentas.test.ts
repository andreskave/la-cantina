import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import { excelCuentas, pdfEstadoCuenta } from './exportarCuentas'

describe('Excel de cuentas', () => {
  it('hoja Saldos y hoja Partidas abiertas', () => {
    const wb = XLSX.read(XLSX.write(excelCuentas(XLSX,
      [{ alumno: 'Zoe', responsable: null, telefono: null, saldo_cent: -5000 }, { alumno: 'Ana', responsable: 'Marta', telefono: '099 123 456', saldo_cent: 25000 }],
      [{ alumno: 'Ana', fecha: '2026-10-01', concepto: 'Menú: Milanesa', importe_cent: 26000, pendiente_cent: 25000 }],
    ), { type: 'array', bookType: 'xlsx' }), { cellNF: true })
    expect(wb.SheetNames).toEqual(['Saldos', 'Partidas abiertas'])
    const saldos = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Saldos, { header: 1 })
    expect(saldos.slice(0, 3)).toEqual([['Alumno', 'Responsable', 'Teléfono', 'Saldo'], ['Ana', 'Marta', '099 123 456', 250], ['Zoe', '', '', -50]])
    expect(saldos.at(-1)).toEqual(['Total adeudado', '', '', 250])
    const hoja = wb.Sheets['Partidas abiertas']
    expect(XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1 })[1]).toEqual(['Ana', expect.any(Date), 'Menú: Milanesa', 260, 250])
    expect(XLSX.SSF.format('dd/mm/yyyy', hoja.B2.v as number)).toBe('01/10/2026')
    expect(hoja.D2.z).toBe('"$ "#,##0.00')
  })
})

describe('PDF del estado de cuenta', () => {
  it('lleva cantina, alumno, fecha, partidas y total', () => {
    const doc = pdfEstadoCuenta(jsPDF, {
      cantina: 'La Cantina', alumno: 'Juan Pérez', responsable: 'Marta', emision: '2026-10-15',
      partidas: [{ fecha: '2026-10-01', concepto: 'Menú: Tallarines con tuco', importe_cent: 26000, pendiente_cent: 16000 }],
      aFavor_cent: 0, total_cent: 16000,
    })
    const texto = doc.output()
    for (const t of ['La Cantina', 'Estado de cuenta', 'Juan P', '01/10/2026', 'Tallarines con tuco', 'Total a pagar: $ 160,00', '15/10/2026'])
      expect(texto).toContain(t)
  })
})
