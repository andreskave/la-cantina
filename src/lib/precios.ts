// Qué precio de venta corresponde (sección 4: listas de precio y precio por plato). Imita a
// precio_producto y precio_menu de la base, para mostrar el precio antes de anotar.
import type { Modulos } from './permisos'

type ConPrecios = { id: string; tipo: string; receta_id: string | null; activo: boolean; precio_cent: number | null; precios_lista?: Record<string, number> }

/** Lista con la que se le cobra a un alumno (null = la General). */
export const listaCobro = (modulos: Pick<Modulos, 'listas_precio'>, listaAlumno: string | null) =>
  modulos.listas_precio ? listaAlumno : null

/** Precio de un producto en una lista; si no tiene, el de la General. */
export const precioEnLista = (p: ConPrecios | undefined, lista: string | null) =>
  (lista ? p?.precios_lista?.[lista] : undefined) ?? p?.precio_cent ?? null

/**
 * Precio del menú de un día para una lista (como precio_menu de la base):
 * plato en la lista → menú en la lista → plato en la General → menú en la General.
 * Lo del plato, solo con el módulo precio_por_plato.
 */
export function precioMenuDia(
  productos: ConPrecios[], modulos: Pick<Modulos, 'precio_por_plato'>, platoRecetaId: string | null, lista: string | null,
): number | null {
  const menu = productos.find((p) => p.tipo === 'menu')
  const plato = modulos.precio_por_plato && platoRecetaId ? productos.find((p) => p.receta_id === platoRecetaId && p.activo) : undefined
  const enLista = (p: ConPrecios | undefined) => (lista ? p?.precios_lista?.[lista] : undefined)
  return enLista(plato) ?? enLista(menu) ?? plato?.precio_cent ?? menu?.precio_cent ?? null
}
