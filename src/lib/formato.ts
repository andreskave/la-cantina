// Formatos uruguayos. Se arman a mano (sin Intl) para no depender de cómo cada
// navegador trae los datos de locale: "setiembre" y "$ 1.234,50" tienen que salir siempre igual.

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'setiembre', 'octubre', 'noviembre', 'diciembre'] as const
export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const
export const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const

export const ZONA = 'America/Montevideo'

function agrupar(entero: bigint): string {
  return entero.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/**
 * Centésimos → "$ 1.234,50". Con `sinCentesimos` redondea a pesos ("$ 1.235"),
 * para totales grandes y resúmenes.
 */
export function pesos(cent: number | bigint | null | undefined, opts: { sinCentesimos?: boolean } = {}): string {
  if (cent === null || cent === undefined || (typeof cent === 'number' && !Number.isFinite(cent))) return '—'
  let c = typeof cent === 'bigint' ? cent : BigInt(Math.round(cent))
  const neg = c < 0n
  if (neg) c = -c
  let txt: string
  if (opts.sinCentesimos) {
    txt = agrupar((c + 50n) / 100n)
  } else {
    txt = `${agrupar(c / 100n)},${(c % 100n).toString().padStart(2, '0')}`
  }
  return `${neg ? '-' : ''}$ ${txt}`
}

/** Cantidad con coma decimal y hasta `decimales` dígitos: 7.2 → "7,2"; 1250 → "1.250". */
export function numero(n: number, decimales = 2): string {
  if (!Number.isFinite(n)) return '—'
  const f = 10 ** decimales
  const r = Math.round(Math.abs(n) * f) / f
  const [ent, dec] = r.toFixed(decimales).split('.')
  const decLimpio = dec?.replace(/0+$/, '') ?? ''
  return `${n < 0 && r !== 0 ? '-' : ''}${agrupar(BigInt(ent))}${decLimpio ? ',' + decLimpio : ''}`
}

/** Fecha ISO (yyyy-mm-dd) de hoy en Montevideo. */
export function hoyISO(ahora: Date = new Date()): string {
  // en-CA formatea como yyyy-mm-dd; solo se usa para obtener las partes en la zona correcta.
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora)
}

/** "2026-10-15" → Date local a mediodía (evita corrimientos por zona horaria). */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

/** "jueves 15 de octubre" */
export function fechaLarga(iso: string): string {
  const d = parseISO(iso)
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`
}

/** "octubre 2026" a partir de "2026-10" o "2026-10-15". */
export function mesNombre(iso: string): string {
  const [y, m] = iso.split('-').map(Number)
  return `${MESES[m - 1]} ${y}`
}

export const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
