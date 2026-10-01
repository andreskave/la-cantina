// Tipos de datos que maneja la app y contrato de acceso a datos (Api).
// Hay dos implementaciones: Supabase (la real) y memoria (modo demostración).

import type { Categoria, TipoReceta } from '../lib/catalogo'
import type { Unidad } from '../lib/costeo'
import type { CostoCongelado, DiaMenu, FilaCongelada } from '../lib/menu'

export type { CostoCongelado, DiaMenu, FilaCongelada }
export type { Movimiento } from '../lib/cuentas'
export type { MovCaja } from '../lib/caja'
import type { MovCaja } from '../lib/caja'

/** Alta (sin id) o edición de un movimiento manual de caja. */
export type MovCajaGuardar = Omit<MovCaja, 'id' | 'origen' | 'anulado'> & { id?: string; client_uuid?: string }
import type { Movimiento } from '../lib/cuentas'

export type Alumno = {
  id: string
  nombre: string
  responsable_nombre: string | null
  responsable_telefono: string | null
  lista_id: string | null
  activo: boolean
  notas: string | null
}

export type PartidaAbierta = { cargo_id: string; alumno_id: string; fecha: string; concepto: string; importe_cent: number; pendiente_cent: number }

/** Alta de un consumo. Sin producto = "Otro" (concepto e importe libres, solo Dueña). */
export type NuevoConsumo = {
  client_uuid: string
  alumno_id: string
  producto_id: string | null
  cantidad: number
  fecha: string
  concepto?: string | null
  importe_cent?: number | null
  cargado_at: string
}

export type NuevoPago = {
  client_uuid: string
  alumno_id: string
  importe_cent: number
  fecha: string
  medio_pago?: 'efectivo' | 'transferencia' | null
  concepto?: string | null
  cargado_at: string
}

export type Proveedor = { id: string; nombre: string; telefono: string | null; notas: string | null }

export type Insumo = {
  id: string
  nombre: string
  categoria: Categoria
  proveedor_id: string | null
  cantidad_compra: number
  unidad_compra: Unidad
  merma_pct: number
  es_reventa: boolean
  activo: boolean
}

export type PrecioCompra = { insumo_id: string; fecha: string; cantidad: number; unidad: Unidad; precio_cent: number }

export type Ingrediente = { insumo_id: string | null; preparacion_id: string | null; cantidad: number; unidad: Unidad }

export type Receta = {
  id: string
  nombre: string
  tipo: TipoReceta
  modo: 'porcion' | 'olla' | null
  porciones: number | null
  rinde_cantidad: number | null
  rinde_unidad: Unidad | null
  activo: boolean
  ingredientes: Ingrediente[]
}

/** Producto de venta con su precio vigente en la lista por defecto. */
export type ProductoVenta = {
  id: string
  tipo: 'menu' | 'insumo_reventa' | 'receta'
  insumo_id: string | null
  receta_id: string | null
  nombre: string
  activo: boolean
  precio_cent: number | null
  /** Precio vigente en cada lista (lista_id → centésimos). Incluye la por defecto. */
  precios_lista?: Record<string, number>
}

export type ListaPrecio = { id: string; nombre: string; factor_porcion: number; es_default: boolean; orden: number }

export type UsuarioCantina = { user_id: string; email: string; nombre: string; rol: 'duena' | 'ayudante' }

export type PedidoUsuarios =
  | { accion: 'listar'; cantina_id: string }
  | { accion: 'crear'; cantina_id: string; email: string; nombre: string; rol: 'duena' | 'ayudante' }
  | { accion: 'cambiar_rol'; cantina_id: string; user_id: string; rol: 'duena' | 'ayudante' }
  | { accion: 'quitar'; cantina_id: string; user_id: string }
  | { accion: 'nueva_clave'; user_id: string }

export type InsumoGuardar = Omit<Insumo, 'id' | 'activo'> & {
  id?: string
  activo?: boolean
  /** null o ausente: no se toca el precio de compra. */
  precio_cent?: number | null
  precio_venta_cent?: number | null
}

export type RecetaGuardar = Omit<Receta, 'id'> & {
  id?: string
  /** número: se vende a ese precio · null: deja de venderse · undefined: no se toca. */
  precio_venta_cent?: number | null
}

export type CantinaEditable = { nombre: string; pedidos_por_defecto: number; objetivo_costo_pct: number }

export interface Api {
  /** Antes de enviar la cola: renueva la sesión si venció mientras no había conexión. */
  prepararEnvio?(): Promise<void>

  proveedores(cantina: string): Promise<Proveedor[]>
  guardarProveedor(cantina: string, p: Omit<Proveedor, 'id'> & { id?: string }): Promise<string>
  borrarProveedor(id: string): Promise<void>

  insumos(cantina: string): Promise<Insumo[]>
  /** Solo Dueña/Admin (al ayudante la base le devuelve vacío). */
  preciosVigentes(cantina: string): Promise<PrecioCompra[]>
  historialPrecios(insumo: string): Promise<PrecioCompra[]>
  guardarInsumos(cantina: string, items: InsumoGuardar[]): Promise<string[]>
  borrarInsumo(id: string): Promise<void>

  recetas(cantina: string): Promise<Receta[]>
  guardarReceta(cantina: string, r: RecetaGuardar): Promise<string>
  borrarReceta(id: string): Promise<void>

  productosVenta(cantina: string): Promise<ProductoVenta[]>
  /** receta_id → cantidad de días del menú que la usan. */
  usosEnMenu(cantina: string): Promise<Record<string, number>>

  /** Historial completo de precios de compra de la cantina (Dueña/Admin). */
  historialPreciosCantina(cantina: string): Promise<PrecioCompra[]>
  /** Historial del precio del menú en la lista por defecto. */
  historialPrecioMenu(cantina: string): Promise<{ vigente_desde: string; precio_cent: number }[]>

  menuDias(cantina: string, desde: string, hasta: string): Promise<DiaMenu[]>
  guardarDia(cantina: string, dia: DiaMenu): Promise<void>
  borrarDia(cantina: string, fecha: string): Promise<void>
  /** Alta de varios días (copiar mes). No pisa días existentes. */
  insertarDias(cantina: string, dias: DiaMenu[]): Promise<number>
  /** Solo Dueña/Admin. */
  costosCongelados(cantina: string, desde: string, hasta: string): Promise<CostoCongelado[]>
  /** Guarda (o borra, con null) el costo congelado de un día. */
  fijarCostoCongelado(cantina: string, fecha: string, fila: FilaCongelada | null): Promise<void>

  alumnos(cantina: string): Promise<Alumno[]>
  guardarAlumno(cantina: string, a: Omit<Alumno, 'id'> & { id?: string }): Promise<string>
  /** alumno_id → saldo en centésimos (positivo = debe). */
  saldos(cantina: string): Promise<Record<string, number>>
  movimientos(alumno: string): Promise<Movimiento[]>
  partidasAbiertas(cantina: string, alumno?: string): Promise<PartidaAbierta[]>
  anotarConsumo(c: NuevoConsumo): Promise<string>
  registrarPago(p: NuevoPago): Promise<string>
  anularMovimiento(id: string, motivo: string): Promise<void>

  /** Solo Dueña/Admin. */
  cajaMovimientos(cantina: string, desde: string, hasta: string): Promise<MovCaja[]>
  guardarMovCaja(cantina: string, m: MovCajaGuardar): Promise<string>
  borrarMovCaja(id: string): Promise<void>
  menusEnCuentas(cantina: string, fecha: string): Promise<number>
  guardarCierreDia(cantina: string, c: { fecha: string; menus_cent: number; menus_cant: number; kiosco_cent: number; medio_pago: 'efectivo' | 'transferencia' | null }): Promise<void>
  deudaCuentasAl(cantina: string, fecha: string): Promise<number>

  // ---- Fase 7 ----
  listas(cantina: string): Promise<ListaPrecio[]>
  guardarLista(cantina: string, l: Omit<ListaPrecio, 'id' | 'es_default' | 'orden'> & { id?: string }): Promise<string>
  borrarLista(id: string): Promise<void>
  fijarPrecioMenuLista(cantina: string, lista: string, precio_cent: number): Promise<void>
  /** alumno_id → días de la semana (1 = lunes … 5 = viernes). */
  diasFijos(cantina: string): Promise<Record<string, number[]>>
  guardarDiasFijos(cantina: string, alumno: string, dias: number[]): Promise<void>
  anotarDiasFijos(cantina: string, fecha: string): Promise<number>
  /** fecha → lista_id → pedidos (módulo listas_precio). */
  pedidosPorLista(cantina: string, desde: string, hasta: string): Promise<Record<string, Record<string, number>>>
  guardarPedidosPorLista(cantina: string, fecha: string, pedidos: Record<string, number>): Promise<void>
  /** lista_id → menús anotados en cuentas ese día. */
  menusEnCuentasPorLista(cantina: string, fecha: string): Promise<Record<string, number>>
  actualizarModulos(cantina: string, modulos: Record<string, boolean>): Promise<void>
  actualizarTerminos(cantina: string, terminos: Record<string, string>): Promise<void>
  crearCantina(nombre: string): Promise<string>
  usuarios(pedido: PedidoUsuarios): Promise<unknown>
  vaciarCantina(cantina: string): Promise<void>
  borrarCantina(cantina: string): Promise<void>
  /** Todos los movimientos de cuenta de la cantina (Exportar todo). */
  movimientosCantina(cantina: string): Promise<(Movimiento & { anulado_motivo: string | null })[]>

  fijarPrecioMenu(cantina: string, precio_cent: number): Promise<void>
  actualizarCantina(cantina: string, campos: CantinaEditable): Promise<void>
}
