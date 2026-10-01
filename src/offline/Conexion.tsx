import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAlumnos, useApi, useCaja, useHistorialPrecioMenu, useInsumos, useMenuRango, usePreciosVigentes, useProductosVenta, useRecetas, useSaldos } from '../datos/consultas'
import { hoyISO } from '../lib/formato'
import { mesMas, primerDia, ultimoDia } from '../lib/fechas'
import { useToast } from '../componentes/Toast'
import { baseLocal, type Pendiente } from './baseLocal'
import { procesarCola, quitar } from './cola'

function suscribir(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb) }
}

/** true si el dispositivo tiene conexión. */
export const useEnLinea = () => useSyncExternalStore(suscribir, () => navigator.onLine, () => true)

type Ctx = {
  /** Pendientes de la cantina activa (incluye los rechazados). */
  pendientes: Pendiente[]
  sincronizar: () => Promise<void>
  descartar: (uuid: string) => Promise<void>
}

const ColaCtx = createContext<Ctx>({ pendientes: [], sincronizar: async () => {}, descartar: async () => {} })
export const useCola = () => useContext(ColaCtx)

/** Mantiene la cola: la envía al abrir la app, al volver la conexión y cada 30 s si queda algo. */
export function ColaProvider({ cantina, children }: { cantina: string; children: ReactNode }) {
  const api = useApi()
  const qc = useQueryClient()
  const toast = useToast()
  const enLinea = useEnLinea()
  const todos = useLiveQuery(() => baseLocal.cola.orderBy('creado_at').toArray(), [], [] as Pendiente[])
  const pendientes = useMemo(() => todos.filter((p) => p.cantina_id === cantina), [todos, cantina])
  const hayPorEnviar = pendientes.some((p) => p.estado === 'pendiente')

  const sincronizar = useCallback(async () => {
    if (!navigator.onLine) return
    const r = await procesarCola(api)
    if (r.enviados || r.rechazados) await qc.invalidateQueries({ queryKey: ['cat'] })
    if (r.enviados) toast(`Se ${r.enviados === 1 ? 'envió 1 movimiento guardado' : `enviaron ${r.enviados} movimientos guardados`} sin conexión`)
    if (r.rechazados) toast(`${r.rechazados === 1 ? 'Un movimiento no se pudo' : `${r.rechazados} movimientos no se pudieron`} guardar. Revisalos arriba.`)
  }, [api, qc, toast])

  useEffect(() => { if (enLinea && hayPorEnviar) void sincronizar() }, [enLinea, hayPorEnviar, sincronizar])
  useEffect(() => {
    if (!enLinea || !hayPorEnviar) return
    const t = window.setInterval(() => void sincronizar(), 30_000)
    return () => window.clearInterval(t)
  }, [enLinea, hayPorEnviar, sincronizar])

  const valor = useMemo(() => ({ pendientes, sincronizar, descartar: (u: string) => quitar(u).then(() => undefined) }), [pendientes, sincronizar])
  return <ColaCtx.Provider value={valor}>{children}</ColaCtx.Provider>
}

/** Aviso dentro de un formulario que necesita internet para guardar. */
export function AvisoSinConexion({ que = 'guardar cambios' }: { que?: string }) {
  const enLinea = useEnLinea()
  if (enLinea) return null
  return <p className="warnbox" role="status">Sin conexión. Para {que} necesitás internet: cuando vuelva, vas a poder hacerlo.</p>
}

/**
 * Al abrir la app (con conexión) trae lo que hace falta para trabajar sin conexión, aunque
 * no se haya entrado a esas pantallas: queda en la caché del dispositivo.
 */
export function Precarga() {
  const hoy = hoyISO()
  useProductosVenta()
  useAlumnos()
  useSaldos()
  useRecetas()
  useInsumos()
  usePreciosVigentes()
  useHistorialPrecioMenu()
  // Mismas consultas (mes por mes) que usan Menú y Anotar consumo, para compartir la caché.
  const mes = hoy.slice(0, 7)
  useMenuRango(primerDia(mes), ultimoDia(mes))
  useMenuRango(primerDia(mesMas(mes, 1)), ultimoDia(mesMas(mes, 1)))
  useCaja(primerDia(mes), ultimoDia(mes))
  return null
}
