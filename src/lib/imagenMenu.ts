// Imagen PNG del menú del mes para las familias (sin precios). Diseño del prototipo.
import { MESES } from './formato'
import { semanasDelMes } from './fechas'
import type { EstadoDia } from './menu'

const TITULO = '"Bricolage Grotesque Variable", "Bricolage Grotesque", sans-serif'
const TEXTO = '"Atkinson Hyperlegible", sans-serif'

function lineas(ctx: CanvasRenderingContext2D, texto: string, ancho: number, max: number): string[] {
  const palabras = texto.split(/\s+/)
  const out: string[] = []
  let actual = ''
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p
    if (ctx.measureText(prueba).width <= ancho) actual = prueba
    else { if (actual) out.push(actual); actual = p }
  }
  if (actual) out.push(actual)
  if (out.length > max) {
    const recortadas = out.slice(0, max)
    let ult = recortadas[max - 1]
    while (ctx.measureText(`${ult}…`).width > ancho && ult.length) ult = ult.slice(0, -1)
    recortadas[max - 1] = `${ult}…`
    return recortadas
  }
  return out
}

export async function imagenMenu(mes: string, cantina: string, estados: Map<string, EstadoDia>): Promise<Blob> {
  try { await document.fonts?.ready } catch { /* sin fuentes cargadas se usa la del sistema */ }
  const semanas = semanasDelMes(mes)
  const W = 1200, P = 48, HEAD = 230, G = 12, CH = 200
  const CW = (W - P * 2 - 4 * G) / 5
  const H = HEAD + semanas.length * (CH + G) + P + 40
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const x = cv.getContext('2d')!

  x.fillStyle = '#F7F8F3'; x.fillRect(0, 0, W, H)
  x.fillStyle = '#2E6A4E'; x.fillRect(0, 0, W, 16)
  x.fillStyle = '#1C2620'; x.font = `800 64px ${TITULO}`
  x.fillText(`Menú de ${MESES[Number(mes.slice(5)) - 1]}`, P, 110)
  x.font = `400 28px ${TEXTO}`; x.fillStyle = '#5B6860'
  x.fillText(`${cantina} · ${mes.slice(0, 4)}`, P, 152)
  x.font = `700 22px ${TEXTO}`
  ;['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES'].forEach((d, i) => x.fillText(d, P + i * (CW + G) + 4, HEAD - 20))

  semanas.forEach((semana, wi) => semana.forEach((f, di) => {
    if (!f) return
    const cx = P + di * (CW + G), cy = HEAD + wi * (CH + G)
    const e = estados.get(f)
    x.fillStyle = e?.tipo === 'sin_cocina' ? '#E9EDE4' : '#FFFFFF'
    x.strokeStyle = '#D8DFD4'; x.lineWidth = 2
    x.beginPath(); x.roundRect(cx, cy, CW, CH, 16); x.fill(); x.stroke()
    x.fillStyle = '#2E6A4E'; x.font = `800 30px ${TITULO}`
    x.fillText(String(Number(f.slice(8))), cx + 16, cy + 42)
    if (!e || e.tipo === 'vacio') return
    if (e.tipo === 'sin_cocina') {
      x.fillStyle = '#5B6860'; x.font = `400 22px ${TEXTO}`
      lineas(x, e.motivo, CW - 32, 2).forEach((l, i) => x.fillText(l, cx + 16, cy + 82 + i * 28))
      return
    }
    let y = cy + 80
    x.fillStyle = '#1C2620'; x.font = `700 23px ${TEXTO}`
    for (const l of lineas(x, e.plato?.nombre ?? '', CW - 32, 3)) { x.fillText(l, cx + 16, y); y += 28 }
    if (e.postre) {
      x.fillStyle = '#8A5A10'; x.font = `400 20px ${TEXTO}`
      const ls = lineas(x, `Postre: ${e.postre.nombre}`, CW - 32, 2)
      let yy = Math.max(y + 6, cy + CH - 18 - 25 * ls.length)
      for (const l of ls) { x.fillText(l, cx + 16, yy); yy += 25 }
    }
  }))

  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo armar la imagen'))), 'image/png'))
}
