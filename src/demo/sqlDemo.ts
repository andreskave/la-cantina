// Convierte los datos de ejemplo en SQL para cargarlos en una cantina existente (por
// nombre). Se corre como administrador de la base (SQL editor de Supabase), no desde la app.
// Solo imports de tipos, para que Node lo pueda correr directo (scripts/seed-demo.ts).
import type { DatosMemoria } from '../datos/memoriaApi'

const q = (v: string | number | boolean | null | undefined) =>
  v === null || v === undefined ? 'null' : typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v)

const filas = (valores: (string | number | boolean | null | undefined)[][]) =>
  valores.map((v) => `  (${v.map(q).join(', ')})`).join(',\n')

export function sqlDemo(d: DatosMemoria, cantina = 'La Cantina'): string {
  const c = 'v_c'
  // Valores con cast explícito por columna (uuid, enums, números).
  const insT = (tabla: string, cols: [string, string][], valores: (string | number | boolean | null | undefined)[][]) =>
    valores.length
      ? `  insert into public.${tabla} (cantina_id, ${cols.map(([n]) => n).join(', ')})\n  select ${c}, ${cols.map(([, t], i) => `t.c${i}::${t}`).join(', ')} from (values\n${filas(valores)}\n  ) as t(${cols.map((_, i) => `c${i}`).join(', ')});\n`
      : ''

  const menu = d.productos.find((p) => p.tipo === 'menu')!
  const otros = d.productos.filter((p) => p.tipo !== 'menu')

  return `-- Datos de ejemplo para la cantina "${cantina}". Generado por scripts/seed-demo.ts.
do $$
declare
  ${c} uuid;
  v_lista uuid;
  v_menu uuid;
begin
  select id into ${c} from public.cantinas where nombre = ${q(cantina)};
  if ${c} is null then raise exception 'No existe la cantina %', ${q(cantina)}; end if;
  select id into v_lista from public.listas_precio where cantina_id = ${c} and es_default;
  select id into v_menu from public.productos_venta where cantina_id = ${c} and tipo = 'menu';

  update public.cantinas set pedidos_por_defecto = ${d.cantina.pedidos_por_defecto} where id = ${c};

${insT('proveedores', [['id', 'uuid'], ['nombre', 'text'], ['telefono', 'text']], d.proveedores.map((p) => [p.id, p.nombre, p.telefono]))}
${insT('insumos', [['id', 'uuid'], ['nombre', 'text'], ['categoria', 'public.categoria_insumo'], ['proveedor_id', 'uuid'], ['cantidad_compra', 'numeric'], ['unidad_compra', 'public.unidad'], ['merma_pct', 'numeric'], ['es_reventa', 'boolean']],
    d.insumos.map((i) => [i.id, i.nombre, i.categoria, i.proveedor_id, i.cantidad_compra, i.unidad_compra, i.merma_pct, i.es_reventa]))}
${insT('insumo_precios', [['insumo_id', 'uuid'], ['fecha', 'date'], ['cantidad', 'numeric'], ['unidad', 'public.unidad'], ['precio_cent', 'bigint']],
    d.precios.map((p) => [p.insumo_id, p.fecha, p.cantidad, p.unidad, p.precio_cent]))}
${insT('recetas', [['id', 'uuid'], ['nombre', 'text'], ['tipo', 'public.tipo_receta'], ['modo', 'public.modo_receta'], ['porciones', 'int'], ['rinde_cantidad', 'numeric'], ['rinde_unidad', 'public.unidad']],
    d.recetas.map((r) => [r.id, r.nombre, r.tipo, r.modo, r.porciones, r.rinde_cantidad, r.rinde_unidad]))}
${insT('receta_ingredientes', [['receta_id', 'uuid'], ['insumo_id', 'uuid'], ['preparacion_id', 'uuid'], ['cantidad', 'numeric'], ['unidad', 'public.unidad'], ['orden', 'int']],
    d.recetas.flatMap((r) => r.ingredientes.map((i, n) => [r.id, i.insumo_id, i.preparacion_id, i.cantidad, i.unidad, n])))}
${insT('productos_venta', [['id', 'uuid'], ['tipo', 'public.tipo_producto'], ['insumo_id', 'uuid'], ['receta_id', 'uuid'], ['nombre', 'text']],
    otros.map((p) => [p.id, p.tipo, p.insumo_id, p.receta_id, p.nombre]))}
${insT('menu_dias', [['fecha', 'date'], ['plato_receta_id', 'uuid'], ['plato_texto', 'text'], ['postre_receta_id', 'uuid'], ['postre_texto', 'text'], ['pedidos', 'int'], ['sin_cocina', 'boolean'], ['motivo', 'text']],
    d.menu.map((m) => [m.fecha, m.plato_receta_id, m.plato_texto, m.postre_receta_id, m.postre_texto, m.pedidos, m.sin_cocina, m.motivo]))}
${insT('alumnos', [['id', 'uuid'], ['nombre', 'text'], ['responsable_nombre', 'text'], ['responsable_telefono', 'text']],
    d.alumnos.map((a) => [a.id, a.nombre, a.responsable_nombre, a.responsable_telefono]))}
${insT('cuenta_movimientos', [['id', 'uuid'], ['client_uuid', 'uuid'], ['alumno_id', 'uuid'], ['fecha', 'date'], ['tipo', 'public.tipo_mov_cuenta'], ['concepto', 'text'], ['cantidad', 'numeric'], ['precio_unit_cent', 'bigint'], ['importe_cent', 'bigint'], ['cargado_at', 'timestamptz']],
    d.movimientos.map((m) => [m.id, m.id, m.alumno_id, m.fecha, m.tipo, m.concepto, m.cantidad, m.tipo === 'cargo' ? m.importe_cent : null, m.importe_cent, m.cargado_at]))}
${insT('caja_movimientos', [['fecha', 'date'], ['tipo', 'public.tipo_mov_caja'], ['subcategoria', 'public.subcat_gasto'], ['proveedor_id', 'uuid'], ['concepto', 'text'], ['importe_cent', 'bigint']],
    d.caja.filter((m) => m.origen === 'manual').map((m) => [m.fecha, m.tipo, m.subcategoria, m.proveedor_id, m.concepto, m.importe_cent]))}
  insert into public.precios_venta (cantina_id, producto_id, lista_id, precio_cent, vigente_desde)
  select ${c}, case when t.p = ${q(menu.id)} then v_menu else t.p::uuid end, v_lista, t.precio::bigint, t.desde::date from (values
${filas(d.preciosVenta.filter((p) => !p.lista_id || p.lista_id === d.listas.find((l) => l.es_default)?.id).map((p) => [p.producto_id, p.precio_cent, p.vigente_desde]))}
  ) as t(p, precio, desde);
end $$;
`
}
