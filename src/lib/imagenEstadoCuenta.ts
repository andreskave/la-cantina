// Estado de cuenta como imagen PNG, para mandar por WhatsApp.
import { fechaLarga, pesos } from './formato'
import type { EstadoCuenta } from './cuentas'

const TITULO = '"Bricolage Grotesque Variable", "Bricolage Grotesque", sans-serif'
const TEXTO = '"Atkinson Hyperlegible", sans-serif'

function recortar(ctx: CanvasRenderingContext2D, t: string, ancho: number) {
  if (ctx.measureText(t).width <= ancho) return t
  let s = t
  while (s.length && ctx.measureText(`${s}…`).width > ancho) s = s.slice(0, -1)
  return `${s}…`
}

export async function imagenEstadoCuenta(e: EstadoCuenta): Promise<Blob> {
  try { await document.fonts?.ready } catch { /* fuente del sistema */ }
  const W = 1080, P = 64, FILA = 58
  const H = 420 + Math.max(1, e.partidas.length) * FILA + (e.aFavor_cent ? 60 : 0) + 140
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const x = cv.getContext('2d')!

  x.fillStyle = '#F7F8F3'; x.fillRect(0, 0, W, H)
  x.fillStyle = '#2E6A4E'; x.fillRect(0, 0, W, 16)
  x.fillStyle = '#1C2620'; x.font = `800 54px ${TITULO}`
  x.fillText(recortar(x, e.cantina, W - P * 2), P, 104)
  x.font = `700 32px ${TEXTO}`; x.fillText('Estado de cuenta', P, 156)
  x.font = `400 28px ${TEXTO}`; x.fillStyle = '#5B6860'
  x.fillText(recortar(x, `${e.etiqueta_alumno ?? 'Alumno'}: ${e.alumno}`, W - P * 2), P, 210)
  x.fillText(`Emitido el ${fechaLarga(e.emision)}`, P, 252)

  let y = 330
  x.fillStyle = '#FFFFFF'; x.strokeStyle = '#D8DFD4'; x.lineWidth = 2
  x.beginPath(); x.roundRect(P - 16, y - 50, W - P * 2 + 32, Math.max(1, e.partidas.length) * FILA + 70, 18); x.fill(); x.stroke()

  x.font = `700 22px ${TEXTO}`; x.fillStyle = '#5B6860'
  x.fillText('FECHA', P, y - 14)
  x.fillText('CONCEPTO', P + 150, y - 14)
  x.textAlign = 'right'; x.fillText('PENDIENTE', W - P, y - 14); x.textAlign = 'left'
  y += 30
  x.font = `400 27px ${TEXTO}`; x.fillStyle = '#1C2620'
  if (!e.partidas.length) {
    x.fillText('No hay consumos pendientes de pago.', P, y)
    y += FILA
  }
  for (const p of e.partidas) {
    x.fillText(p.fecha.split('-').reverse().slice(0, 2).join('/'), P, y)
    x.fillText(recortar(x, p.concepto, W - P * 2 - 150 - 200), P + 150, y)
    x.textAlign = 'right'
    x.fillText(pesos(p.pendiente_cent), W - P, y)
    if (p.pendiente_cent !== p.importe_cent) {
      x.font = `400 20px ${TEXTO}`; x.fillStyle = '#5B6860'
      x.fillText(`de ${pesos(p.importe_cent)}`, W - P, y + 24)
      x.font = `400 27px ${TEXTO}`; x.fillStyle = '#1C2620'
    }
    x.textAlign = 'left'
    y += FILA
  }

  y += 50
  if (e.aFavor_cent) {
    x.font = `400 28px ${TEXTO}`; x.fillStyle = '#2E7D4F'
    x.fillText(`Saldo a favor: ${pesos(e.aFavor_cent)}`, P, y)
    y += 60
  }
  x.font = `800 44px ${TITULO}`; x.fillStyle = '#1C2620'; x.textAlign = 'right'
  x.fillText(`Total a pagar: ${pesos(e.total_cent)}`, W - P, y)

  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo armar la imagen'))), 'image/png'))
}
