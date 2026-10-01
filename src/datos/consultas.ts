import { createContext, useContext, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCantina } from '../sesion/Sesion'
import { crearCosteo, type InsumoCosteo, type RecetaCosteo } from '../lib/costeo'
import { supabaseApi } from './supabaseApi'
import type { Alumno, Api, CantinaEditable, DiaMenu, FilaCongelada, MovCajaGuardar, NuevoConsumo, NuevoPago, PedidoUsuarios, UsuarioCantina, InsumoGuardar, PrecioCompra, Proveedor, RecetaGuardar } from './tipos'
import { estadoDia, precioEn, type EstadoDia } from '../lib/menu'
import { esHabil, sumarDias } from '../lib/fechas'
import { hoyISO } from '../lib/formato'
import { encolar, enviar, ErrorNegocio, quitar } from '../offline/cola'
import type { Pendiente } from '../offline/baseLocal'

export const ApiCtx = createContext<Api>(supabaseApi)
export const useApi = () => useContext(ApiCtx)

// Todas las claves de la cantina empiezan con ['cat', cantinaId]: cualquier guardado
// invalida ese prefijo y se recalcula todo (los datos son chicos y así la cascada de
// costos queda siempre al día).
const k = (cantina: string, ...resto: string[]) => ['cat', cantina, ...resto]

export function useProveedores() {
  const api = useApi(); const { cantina } = useCantina()
  return useQuery({ queryKey: k(cantina.id, 'proveedores'), queryFn: () => api.proveedores(cantina.id) })
}

export function useInsumos() {
  const api = useApi(); const { cantina } = useCantina()
  return useQuery({ queryKey: k(cantina.id, 'insumos'), queryFn: () => api.insumos(cantina.id) })
}

/** Precios de compra vigentes. Solo se piden si el rol puede ver costos. */
export function usePreciosVigentes() {
  const api = useApi(); const { cantina, puede } = useCantina()
  return useQuery({
    queryKey: k(cantina.id, 'precios'),
    queryFn: () => api.preciosVigentes(cantina.id),
    enabled: puede('ver_costos'),
  })
}

export function useHistorialPrecios(insumo: string | undefined) {
  const api = useApi(); const { cantina, puede } = useCantina()
  return useQuery({
    queryKey: k(cantina.id, 'historial', insumo ?? ''),
    queryFn: () => api.historialPrecios(insumo!),
    enabled: Boolean(insumo) && puede('ver_costos'),
  })
}

export function useRecetas() {
  const api = useApi(); const { cantina } = useCantina()
  return useQuery({ queryKey: k(cantina.id, 'recetas'), queryFn: () => api.recetas(cantina.id) })
}

export function useProductosVenta() {
  const api = useApi(); const { cantina } = useCantina()
  return useQuery({ queryKey: k(cantina.id, 'productos'), queryFn: () => api.productosVenta(cantina.id) })
}

export function useUsosEnMenu() {
  const api = useApi(); const { cantina } = useCantina()
  return useQuery({ queryKey: k(cantina.id, 'usosMenu'), queryFn: () => api.usosEnMenu(cantina.id) })
}

/** Precio del menú del día (lista por defecto), en centésimos. */
export function usePrecioMenu(): number | null {
  const { data } = useProductosVenta()
  return data?.find((p) => p.tipo === 'menu')?.precio_cent ?? null
}

/** Motor de costeo armado con lo que hay en caché. Sin precios (ayudante) todo queda "sin precio". */
export function useCosteo() {
  const insumos = useInsumos()
  const precios = usePreciosVigentes()
  const recetas = useRecetas()
  const preciosPorInsumo = useMemo(() => new Map((precios.data ?? []).map((p) => [p.insumo_id, p])), [precios.data])

  const insumosCosteo = useMemo(() => new Map((insumos.data ?? []).map((i): [string, InsumoCosteo] => {
    const p = preciosPorInsumo.get(i.id)
    return [i.id, { id: i.id, nombre: i.nombre, merma_pct: i.merma_pct, precio: p ? { cantidad: p.cantidad, unidad: p.unidad, precio_cent: p.precio_cent } : null }]
  })), [insumos.data, preciosPorInsumo])

  const costeo = useMemo(() => crearCosteo([...insumosCosteo.values()], (recetas.data ?? []) as RecetaCosteo[]), [insumosCosteo, recetas.data])
  return {
    costeo,
    insumosCosteo,
    preciosPorInsumo: preciosPorInsumo as Map<string, PrecioCompra>,
    cargando: insumos.isPending || recetas.isPending || (precios.isPending && precios.fetchStatus !== 'idle'),
    error: insumos.error ?? recetas.error ?? precios.error,
  }
}

// ---------- guardados ----------

function useGuardar<A, R>(fn: (api: Api, cantina: string, args: A) => Promise<R>) {
  const api = useApi(); const { cantina } = useCantina(); const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: A) => {
      if (!navigator.onLine) throw new ErrorNegocio('Sin conexión. Esto se puede guardar cuando vuelva internet.')
      return fn(api, cantina.id, args)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['cat', cantina.id] }),
  })
}

/**
 * Altas que se pueden hacer sin conexión (sección 10): se guardan primero en la cola del
 * dispositivo y se intentan enviar enseguida. Devuelve pendiente=true si quedaron para
 * después. Si el servidor las rechaza en el momento, se sacan de la cola y se avisa.
 */
function useEncolar<A>(armar: (cantina: string, args: A) => Omit<Pendiente, 'cantina_id' | 'creado_at' | 'estado' | 'error' | 'intentos'>) {
  const api = useApi(); const { cantina } = useCantina(); const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: A): Promise<{ pendiente: boolean }> => {
      const p = { ...armar(cantina.id, args), cantina_id: cantina.id, creado_at: new Date().toISOString(), estado: 'pendiente', error: null, intentos: 0 } as Pendiente
      await encolar(p)
      if (!navigator.onLine) return { pendiente: true }
      const r = await enviar(api, p)
      if (r === 'red') return { pendiente: true }
      await quitar(p.client_uuid)
      if (r !== 'ok') throw new ErrorNegocio(r.error)
      return { pendiente: false }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['cat', cantina.id] }),
  })
}

export const useGuardarInsumos = () => useGuardar((api, c, items: InsumoGuardar[]) => api.guardarInsumos(c, items))
export const useBorrarInsumo = () => useGuardar((api, _c, id: string) => api.borrarInsumo(id))
export const useGuardarReceta = () => useGuardar((api, c, r: RecetaGuardar) => api.guardarReceta(c, r))
export const useBorrarReceta = () => useGuardar((api, _c, id: string) => api.borrarReceta(id))
export const useGuardarProveedor = () => useGuardar((api, c, p: Omit<Proveedor, 'id'> & { id?: string }) => api.guardarProveedor(c, p))
export const useBorrarProveedor = () => useGuardar((api, _c, id: string) => api.borrarProveedor(id))
export const useFijarPrecioMenu = () => useGuardar((api, c, precio: number) => api.fijarPrecioMenu(c, precio))
export const useActualizarCantina = () => useGuardar((api, c, campos: CantinaEditable) => api.actualizarCantina(c, campos))

// ---------- menú ----------

export function useMenuRango(desde: string, hasta: string) {
  const api = useApi(); const { cantina } = useCantina()
  return useQuery({ queryKey: k(cantina.id, 'menu', desde, hasta), queryFn: () => api.menuDias(cantina.id, desde, hasta) })
}

export function useCongelados(desde: string, hasta: string) {
  const api = useApi(); const { cantina, puede } = useCantina()
  return useQuery({
    queryKey: k(cantina.id, 'congelados', desde, hasta),
    queryFn: () => api.costosCongelados(cantina.id, desde, hasta),
    enabled: puede('ver_costos'),
  })
}

export function useHistorialCantina() {
  const api = useApi(); const { cantina, puede } = useCantina()
  return useQuery({ queryKey: k(cantina.id, 'historialCantina'), queryFn: () => api.historialPreciosCantina(cantina.id), enabled: puede('ver_costos') })
}

export function useHistorialPrecioMenu() {
  const api = useApi(); const { cantina } = useCantina()
  return useQuery({ queryKey: k(cantina.id, 'historialMenu'), queryFn: () => api.historialPrecioMenu(cantina.id) })
}

/**
 * Estado de cada día entre `desde` y `hasta` (menú, sin cocina o vacío) con su costo:
 * congelado para días pasados y con precios actuales para hoy y los futuros.
 * Al ayudante no se le calcula ningún costo.
 */
export function useEstadosRango(desde: string, hasta: string) {
  const { puede } = useCantina()
  const verCostos = puede('ver_costos')
  const menu = useMenuRango(desde, hasta)
  const congelados = useCongelados(desde, hasta)
  const recetas = useRecetas()
  const historialMenu = useHistorialPrecioMenu()
  const { costeo, cargando } = useCosteo()

  const dias = useMemo(() => new Map((menu.data ?? []).map((d) => [d.fecha, d])), [menu.data])
  const estados = useMemo(() => {
    const ctx = {
      hoy: hoyISO(),
      costeo: verCostos ? costeo : null,
      recetas: new Map((recetas.data ?? []).map((r) => [r.id, r])),
      congelados: new Map((congelados.data ?? []).map((c) => [c.fecha, c])),
    }
    const out = new Map<string, EstadoDia>()
    for (let f = desde; f <= hasta; f = sumarDias(f, 1)) if (esHabil(f)) out.set(f, estadoDia(f, dias.get(f), ctx))
    return out
  }, [desde, hasta, dias, verCostos, costeo, recetas.data, congelados.data])

  // Precio del menú de cada día en la lista General. Con precio_por_plato, el del plato de
  // ese día si tiene precio propio (el actual: los productos no guardan historial acá).
  const productos = useProductosVenta()
  const { modulos } = useCantina()
  const precioDe = useMemo(() => {
    const h = historialMenu.data ?? []
    return (fecha: string) => {
      if (modulos.precio_por_plato) {
        const plato = dias.get(fecha)?.plato_receta_id
        const delPlato = plato ? productos.data?.find((p) => p.receta_id === plato && p.activo)?.precio_cent : null
        if (delPlato) return delPlato
      }
      return precioEn(fecha, h)
    }
  }, [historialMenu.data, modulos.precio_por_plato, dias, productos.data])

  return {
    estados, dias, precioDe,
    cargando: menu.isPending || recetas.isPending || (verCostos && (cargando || congelados.isPending)),
    error: menu.error ?? recetas.error ?? congelados.error,
  }
}

export const useGuardarDia = () => useGuardar((api, c, dia: DiaMenu) => api.guardarDia(c, dia))
export const useBorrarDia = () => useGuardar((api, c, fecha: string) => api.borrarDia(c, fecha))
export const useInsertarDias = () => useGuardar((api, c, dias: DiaMenu[]) => api.insertarDias(c, dias))
export const useFijarCostoCongelado = () =>
  useGuardar((api, c, a: { fecha: string; fila: FilaCongelada | null }) => api.fijarCostoCongelado(c, a.fecha, a.fila))

// ---------- cuentas corrientes ----------

export function useAlumnos() {
  const api = useApi(); const { cantina } = useCantina()
  return useQuery({ queryKey: k(cantina.id, 'alumnos'), queryFn: () => api.alumnos(cantina.id) })
}

export function useSaldos() {
  const api = useApi(); const { cantina } = useCantina()
  return useQuery({ queryKey: k(cantina.id, 'saldos'), queryFn: () => api.saldos(cantina.id) })
}

export function useMovimientos(alumno: string) {
  const api = useApi(); const { cantina } = useCantina()
  return useQuery({ queryKey: k(cantina.id, 'movimientos', alumno), queryFn: () => api.movimientos(alumno) })
}

export function usePartidasAbiertas(alumno?: string) {
  const api = useApi(); const { cantina } = useCantina()
  return useQuery({ queryKey: k(cantina.id, 'partidas', alumno ?? '*'), queryFn: () => api.partidasAbiertas(cantina.id, alumno) })
}

export const useGuardarAlumno = () => useGuardar((api, c, a: Omit<Alumno, 'id'> & { id?: string }) => api.guardarAlumno(c, a))
/** concepto e importe_cent: lo que se muestra mientras no se envió (el servidor pone el definitivo). */
export const useAnotarConsumo = () => useEncolar((_c, x: { consumo: NuevoConsumo; concepto: string; importe_cent: number }) => ({
  client_uuid: x.consumo.client_uuid, tipo: 'consumo', datos: x.consumo, alumno_id: x.consumo.alumno_id, concepto: x.concepto, importe_cent: x.importe_cent,
}))
export const useRegistrarPago = () => useEncolar((_c, x: NuevoPago) => ({
  client_uuid: x.client_uuid, tipo: 'pago', datos: x, alumno_id: x.alumno_id, concepto: x.concepto?.trim() || 'Pago', importe_cent: x.importe_cent,
}))
export const useAnularMovimiento = () => useGuardar((api, _c, x: { id: string; motivo: string }) => api.anularMovimiento(x.id, x.motivo))

// ---------- caja ----------

export function useCaja(desde: string, hasta: string) {
  const api = useApi(); const { cantina, puede } = useCantina()
  return useQuery({ queryKey: k(cantina.id, 'caja', desde, hasta), queryFn: () => api.cajaMovimientos(cantina.id, desde, hasta), enabled: puede('ver_caja') })
}

export function useDeudaCuentasAl(fecha: string) {
  const api = useApi(); const { cantina, puede } = useCantina()
  return useQuery({ queryKey: k(cantina.id, 'deudaAl', fecha), queryFn: () => api.deudaCuentasAl(cantina.id, fecha), enabled: puede('ver_caja') })
}

export function useMenusEnCuentas(fecha: string) {
  const api = useApi(); const { cantina } = useCantina()
  return useQuery({ queryKey: k(cantina.id, 'menusEnCuentas', fecha), queryFn: () => api.menusEnCuentas(cantina.id, fecha) })
}

/** Editar un movimiento existente necesita conexión. */
export const useGuardarMovCaja = () => useGuardar((api, c, m: MovCajaGuardar) => api.guardarMovCaja(c, m))
/** Movimiento nuevo de caja: se puede cargar sin conexión. */
export const useNuevoMovCaja = () => useEncolar((_c, m: MovCajaGuardar & { client_uuid: string }) => ({
  client_uuid: m.client_uuid, tipo: 'caja', datos: m, alumno_id: null, concepto: m.concepto, importe_cent: m.importe_cent,
}))
export const useBorrarMovCaja = () => useGuardar((api, _c, id: string) => api.borrarMovCaja(id))
export const useGuardarCierreDia = () =>
  useGuardar((api, c, x: Parameters<Api['guardarCierreDia']>[1]) => api.guardarCierreDia(c, x))

// ---------- Fase 7: listas, días fijos, módulos, usuarios y datos ----------

export function useListas() {
  const api = useApi(); const { cantina } = useCantina()
  return useQuery({ queryKey: k(cantina.id, 'listas'), queryFn: () => api.listas(cantina.id) })
}
export const useGuardarLista = () => useGuardar((api, c, l: Parameters<Api['guardarLista']>[1]) => api.guardarLista(c, l))
export const useBorrarLista = () => useGuardar((api, _c, id: string) => api.borrarLista(id))
export const useFijarPrecioMenuLista = () =>
  useGuardar((api, c, x: { lista: string; precio_cent: number }) => api.fijarPrecioMenuLista(c, x.lista, x.precio_cent))

export function useDiasFijos() {
  const api = useApi(); const { cantina, modulos } = useCantina()
  return useQuery({ queryKey: k(cantina.id, 'diasFijos'), queryFn: () => api.diasFijos(cantina.id), enabled: modulos.dias_fijos })
}
export const useGuardarDiasFijos = () => useGuardar((api, c, x: { alumno: string; dias: number[] }) => api.guardarDiasFijos(c, x.alumno, x.dias))
export const useAnotarDiasFijos = () => useGuardar((api, c, fecha: string) => api.anotarDiasFijos(c, fecha))

export function usePedidosPorLista(desde: string, hasta: string) {
  const api = useApi(); const { cantina, modulos } = useCantina()
  return useQuery({ queryKey: k(cantina.id, 'pedidosLista', desde, hasta), queryFn: () => api.pedidosPorLista(cantina.id, desde, hasta), enabled: modulos.listas_precio })
}
export const useGuardarPedidosPorLista = () =>
  useGuardar((api, c, x: { fecha: string; pedidos: Record<string, number> }) => api.guardarPedidosPorLista(c, x.fecha, x.pedidos))

export function useMenusEnCuentasPorLista(fecha: string) {
  const api = useApi(); const { cantina, modulos } = useCantina()
  return useQuery({ queryKey: k(cantina.id, 'menusPorLista', fecha), queryFn: () => api.menusEnCuentasPorLista(cantina.id, fecha), enabled: modulos.listas_precio })
}

export const useActualizarModulos = () => useGuardar((api, c, m: Record<string, boolean>) => api.actualizarModulos(c, m))
export const useActualizarTerminos = () => useGuardar((api, c, t: Record<string, string>) => api.actualizarTerminos(c, t))
export const useCrearCantina = () => useGuardar((api, _c, nombre: string) => api.crearCantina(nombre))
export const useVaciarCantina = () => useGuardar((api, c) => api.vaciarCantina(c))
export const useBorrarCantina = () => useGuardar((api, c) => api.borrarCantina(c))

export function useUsuariosCantina() {
  const api = useApi(); const { cantina, puede } = useCantina()
  return useQuery({
    queryKey: k(cantina.id, 'usuarios'),
    queryFn: async () => ((await api.usuarios({ accion: 'listar', cantina_id: cantina.id })) as { usuarios: UsuarioCantina[] }).usuarios,
    enabled: puede('admin_usuarios'),
  })
}
export const useAccionUsuarios = () => useGuardar((api, _c, p: PedidoUsuarios) => api.usuarios(p))
