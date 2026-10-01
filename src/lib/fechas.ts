// Fechas como texto ISO (yyyy-mm-dd). Los cálculos se hacen en UTC para que nunca haya
// corrimientos por zona horaria; "hoy" se obtiene en hora de Montevideo (formato.hoyISO).

const aUTC = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
const deUTC = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export const sumarDias = (iso: string, n: number) => deUTC(aUTC(iso) + n * 86400000)

/** 0 = domingo … 6 = sábado. */
export const diaSemana = (iso: string) => new Date(aUTC(iso)).getUTCDay()

export const esHabil = (iso: string) => {
  const d = diaSemana(iso)
  return d >= 1 && d <= 5
}

/** "2026-10" + n meses. */
export function mesMas(mes: string, n: number): string {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return deUTC(d.getTime()).slice(0, 7)
}

export const primerDia = (mes: string) => `${mes}-01`
export const ultimoDia = (mes: string) => sumarDias(primerDia(mesMas(mes, 1)), -1)

/**
 * Semanas de lunes a viernes que tocan el mes. Los días fuera del mes van como null
 * (se muestran vacíos).
 */
export function semanasDelMes(mes: string): (string | null)[][] {
  const primero = primerDia(mes)
  const ultimo = ultimoDia(mes)
  const dow = diaSemana(primero)
  // Lunes de la primera semana con algún día hábil del mes.
  let lunes = dow === 0 ? sumarDias(primero, 1) : dow === 6 ? sumarDias(primero, 2) : sumarDias(primero, -(dow - 1))
  const semanas: (string | null)[][] = []
  while (lunes <= ultimo) {
    semanas.push(Array.from({ length: 5 }, (_, i) => {
      const f = sumarDias(lunes, i)
      return f.slice(0, 7) === mes ? f : null
    }))
    lunes = sumarDias(lunes, 7)
  }
  return semanas
}

export const habilesMes = (mes: string) => semanasDelMes(mes).flat().filter((f): f is string => f !== null)

/** Los próximos `n` días hábiles después de `desde` (sin incluirlo). */
export function proximosHabiles(desde: string, n: number): string[] {
  const out: string[] = []
  for (let f = sumarDias(desde, 1); out.length < n; f = sumarDias(f, 1)) if (esHabil(f)) out.push(f)
  return out
}

/** Número de serie de Excel para una fecha (sin hora): días desde 1899-12-30. */
export const serialExcel = (iso: string) => (aUTC(iso) - Date.UTC(1899, 11, 30)) / 86400000
