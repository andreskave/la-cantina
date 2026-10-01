import { supabase } from '../lib/supabase'
import { hoyISO } from '../lib/formato'
import type { Alumno, Api, ListaPrecio, MovCaja, DiaMenu, Ingrediente, Insumo, Movimiento, PrecioCompra, ProductoVenta, Receta } from './tipos'

function ok<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw r.error
  return r.data as T
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))

export const supabaseApi: Api = {
  async prepararEnvio() {
    // getSession renueva el token si está vencido.
    const { error } = await supabase.auth.getSession()
    if (error) throw error
  },

  async proveedores(cantina) {
    return ok(await supabase.from('proveedores').select('id, nombre, telefono, notas').eq('cantina_id', cantina).order('nombre'))
  },
  async guardarProveedor(cantina, p) {
    const fila = { cantina_id: cantina, nombre: p.nombre.trim(), telefono: p.telefono || null, notas: p.notas || null }
    if (p.id) {
      ok(await supabase.from('proveedores').update(fila).eq('id', p.id))
      return p.id
    }
    return (ok(await supabase.from('proveedores').insert(fila).select('id').single()) as { id: string }).id
  },
  async borrarProveedor(id) {
    ok(await supabase.from('proveedores').delete().eq('id', id))
  },

  async insumos(cantina) {
    const filas = ok(await supabase.from('insumos')
      .select('id, nombre, categoria, proveedor_id, cantidad_compra, unidad_compra, merma_pct, es_reventa, activo')
      .eq('cantina_id', cantina).order('nombre'))
    return (filas as Record<string, unknown>[]).map((f) => ({
      ...f, cantidad_compra: Number(f.cantidad_compra), merma_pct: Number(f.merma_pct),
    })) as Insumo[]
  },
  async preciosVigentes(cantina) {
    const filas = ok(await supabase.from('insumo_precio_vigente')
      .select('insumo_id, fecha, cantidad, unidad, precio_cent').eq('cantina_id', cantina))
    return (filas as Record<string, unknown>[]).map(aPrecio)
  },
  async historialPrecios(insumo) {
    const filas = ok(await supabase.from('insumo_precios')
      .select('insumo_id, fecha, cantidad, unidad, precio_cent').eq('insumo_id', insumo)
      .order('fecha', { ascending: false }).limit(12))
    return (filas as Record<string, unknown>[]).map(aPrecio)
  },
  async guardarInsumos(cantina, items) {
    const lote = items.map((i) => ({ ...i, cantina_id: cantina }))
    return ok(await supabase.rpc('guardar_insumos_lote', { p: lote })) as string[]
  },
  async borrarInsumo(id) {
    ok(await supabase.from('insumos').delete().eq('id', id))
  },

  async recetas(cantina) {
    const [recetas, ings] = await Promise.all([
      supabase.from('recetas').select('id, nombre, tipo, modo, porciones, rinde_cantidad, rinde_unidad, activo')
        .eq('cantina_id', cantina).order('nombre'),
      supabase.from('receta_ingredientes').select('receta_id, insumo_id, preparacion_id, cantidad, unidad, orden')
        .eq('cantina_id', cantina).order('orden'),
    ])
    const porReceta = new Map<string, Ingrediente[]>()
    for (const i of ok(ings) as Record<string, unknown>[]) {
      const lista = porReceta.get(i.receta_id as string) ?? []
      lista.push({ insumo_id: i.insumo_id as string | null, preparacion_id: i.preparacion_id as string | null,
        cantidad: Number(i.cantidad), unidad: i.unidad as Ingrediente['unidad'] })
      porReceta.set(i.receta_id as string, lista)
    }
    return (ok(recetas) as Record<string, unknown>[]).map((r) => ({
      ...r, rinde_cantidad: num(r.rinde_cantidad), ingredientes: porReceta.get(r.id as string) ?? [],
    })) as Receta[]
  },
  async guardarReceta(cantina, r) {
    return ok(await supabase.rpc('guardar_receta', { p: { ...r, cantina_id: cantina } })) as string
  },
  async borrarReceta(id) {
    ok(await supabase.from('recetas').delete().eq('id', id))
  },

  async productosVenta(cantina) {
    const hoy = hoyISO()
    const [prods, lista] = await Promise.all([
      supabase.from('productos_venta').select('id, tipo, insumo_id, receta_id, nombre, activo').eq('cantina_id', cantina),
      supabase.from('listas_precio').select('id').eq('cantina_id', cantina).eq('es_default', true).single(),
    ])
    const general = (ok(lista) as { id: string }).id
    const precios = ok(await supabase.from('precios_venta').select('producto_id, lista_id, precio_cent, vigente_desde')
      .eq('cantina_id', cantina).lte('vigente_desde', hoy).order('vigente_desde', { ascending: false }))
    // El primero que aparece por producto y lista es el vigente (vienen del más nuevo al más viejo).
    const porLista = new Map<string, Record<string, number>>()
    for (const p of precios as { producto_id: string; lista_id: string; precio_cent: number }[]) {
      const r = porLista.get(p.producto_id) ?? {}
      if (r[p.lista_id] === undefined) r[p.lista_id] = Number(p.precio_cent)
      porLista.set(p.producto_id, r)
    }
    return (ok(prods) as Omit<ProductoVenta, 'precio_cent'>[]).map((p) => ({
      ...p, precio_cent: porLista.get(p.id)?.[general] ?? null, precios_lista: porLista.get(p.id) ?? {},
    }))
  },
  async usosEnMenu(cantina) {
    const filas = ok(await supabase.from('menu_dias').select('plato_receta_id, postre_receta_id').eq('cantina_id', cantina))
    const out: Record<string, number> = {}
    for (const d of filas as { plato_receta_id: string | null; postre_receta_id: string | null }[])
      for (const id of [d.plato_receta_id, d.postre_receta_id]) if (id) out[id] = (out[id] ?? 0) + 1
    return out
  },

  async historialPreciosCantina(cantina) {
    const filas = ok(await supabase.from('insumo_precios')
      .select('insumo_id, fecha, cantidad, unidad, precio_cent').eq('cantina_id', cantina).order('fecha'))
    return (filas as Record<string, unknown>[]).map(aPrecio)
  },
  async historialPrecioMenu(cantina) {
    const [prod, lista] = await Promise.all([
      supabase.from('productos_venta').select('id').eq('cantina_id', cantina).eq('tipo', 'menu').single(),
      supabase.from('listas_precio').select('id').eq('cantina_id', cantina).eq('es_default', true).single(),
    ])
    const filas = ok(await supabase.from('precios_venta').select('vigente_desde, precio_cent')
      .eq('producto_id', (ok(prod) as { id: string }).id).eq('lista_id', (ok(lista) as { id: string }).id))
    return (filas as { vigente_desde: string; precio_cent: number }[]).map((f) => ({ ...f, precio_cent: Number(f.precio_cent) }))
  },

  async menuDias(cantina, desde, hasta) {
    const filas = ok(await supabase.from('menu_dias')
      .select('fecha, plato_receta_id, plato_texto, postre_receta_id, postre_texto, pedidos, sin_cocina, motivo')
      .eq('cantina_id', cantina).gte('fecha', desde).lte('fecha', hasta).order('fecha'))
    return filas as DiaMenu[]
  },
  async guardarDia(cantina, dia) {
    ok(await supabase.from('menu_dias').upsert({ ...dia, cantina_id: cantina }, { onConflict: 'cantina_id,fecha' }))
  },
  async borrarDia(cantina, fecha) {
    ok(await supabase.from('menu_dias').delete().eq('cantina_id', cantina).eq('fecha', fecha))
  },
  async insertarDias(cantina, dias) {
    if (!dias.length) return 0
    const filas = ok(await supabase.from('menu_dias')
      .upsert(dias.map((d) => ({ ...d, cantina_id: cantina })), { onConflict: 'cantina_id,fecha', ignoreDuplicates: true })
      .select('fecha'))
    return (filas as unknown[]).length
  },
  async costosCongelados(cantina, desde, hasta) {
    const filas = ok(await supabase.from('menu_dia_costos')
      .select('fecha, costo_plato_cent, costo_postre_cent, costo_total_cent')
      .eq('cantina_id', cantina).gte('fecha', desde).lte('fecha', hasta))
    return (filas as Record<string, unknown>[]).map((f) => ({
      fecha: f.fecha as string, costo_plato_cent: num(f.costo_plato_cent), costo_postre_cent: num(f.costo_postre_cent),
      costo_total_cent: Number(f.costo_total_cent),
    }))
  },
  async fijarCostoCongelado(cantina, fecha, fila) {
    if (!fila) {
      ok(await supabase.from('menu_dia_costos').delete().eq('cantina_id', cantina).eq('fecha', fecha))
      return
    }
    ok(await supabase.from('menu_dia_costos').upsert(
      { cantina_id: cantina, fecha, ...fila, congelado_at: new Date().toISOString() }, { onConflict: 'cantina_id,fecha' }))
  },

  async alumnos(cantina) {
    return ok(await supabase.from('alumnos')
      .select('id, nombre, responsable_nombre, responsable_telefono, lista_id, activo, notas')
      .eq('cantina_id', cantina).order('nombre')) as Alumno[]
  },
  async guardarAlumno(cantina, a) {
    const fila = {
      cantina_id: cantina, nombre: a.nombre.trim(), responsable_nombre: a.responsable_nombre?.trim() || null,
      responsable_telefono: a.responsable_telefono?.trim() || null, lista_id: a.lista_id, activo: a.activo, notas: a.notas?.trim() || null,
    }
    if (a.id) {
      ok(await supabase.from('alumnos').update(fila).eq('id', a.id))
      return a.id
    }
    return (ok(await supabase.from('alumnos').insert(fila).select('id').single()) as { id: string }).id
  },
  async saldos(cantina) {
    const filas = ok(await supabase.from('cuenta_saldos').select('alumno_id, saldo_cent').eq('cantina_id', cantina))
    return Object.fromEntries((filas as { alumno_id: string; saldo_cent: number }[]).map((f) => [f.alumno_id, Number(f.saldo_cent)]))
  },
  async movimientos(alumno) {
    const filas = ok(await supabase.from('cuenta_movimientos')
      .select('id, alumno_id, fecha, tipo, concepto, cantidad, importe_cent, medio_pago, anulado, anulado_motivo, cargado_at')
      .eq('alumno_id', alumno).order('fecha', { ascending: false }).order('cargado_at', { ascending: false }))
    return (filas as Record<string, unknown>[]).map((f) => ({ ...f, cantidad: Number(f.cantidad), importe_cent: Number(f.importe_cent) })) as Movimiento[]
  },
  async partidasAbiertas(cantina, alumno) {
    let q = supabase.from('partidas_abiertas').select('cargo_id, alumno_id, fecha, concepto, importe_cent, pendiente_cent').eq('cantina_id', cantina)
    if (alumno) q = q.eq('alumno_id', alumno)
    const filas = ok(await q.order('fecha').order('cargado_at'))
    return (filas as Record<string, unknown>[]).map((f) => ({
      cargo_id: f.cargo_id as string, alumno_id: f.alumno_id as string, fecha: f.fecha as string, concepto: f.concepto as string,
      importe_cent: Number(f.importe_cent), pendiente_cent: Number(f.pendiente_cent),
    }))
  },
  async anotarConsumo(c) {
    return ok(await supabase.rpc('anotar_consumo', {
      p_client_uuid: c.client_uuid, p_alumno_id: c.alumno_id, p_producto_id: c.producto_id, p_cantidad: c.cantidad,
      p_fecha: c.fecha, p_concepto: c.concepto ?? null, p_importe_cent: c.importe_cent ?? null, p_cargado_at: c.cargado_at,
    })) as string
  },
  async registrarPago(p) {
    return ok(await supabase.rpc('registrar_pago', {
      p_client_uuid: p.client_uuid, p_alumno_id: p.alumno_id, p_importe_cent: p.importe_cent, p_fecha: p.fecha,
      p_medio_pago: p.medio_pago ?? null, p_concepto: p.concepto ?? null, p_cargado_at: p.cargado_at,
    })) as string
  },
  async anularMovimiento(id, motivo) {
    ok(await supabase.rpc('anular_movimiento', { p_id: id, p_motivo: motivo }))
  },

  async cajaMovimientos(cantina, desde, hasta) {
    const filas = ok(await supabase.from('caja_movimientos')
      .select('id, fecha, tipo, subcategoria, proveedor_id, concepto, importe_cent, medio_pago, origen, anulado')
      .eq('cantina_id', cantina).gte('fecha', desde).lte('fecha', hasta)
      .order('fecha', { ascending: false }).order('created_at', { ascending: false }))
    return (filas as Record<string, unknown>[]).map((f) => ({ ...f, importe_cent: Number(f.importe_cent) })) as MovCaja[]
  },
  async guardarMovCaja(cantina, m) {
    const fila = {
      cantina_id: cantina, fecha: m.fecha, tipo: m.tipo, subcategoria: m.tipo === 'gasto_fijo' ? m.subcategoria ?? 'Otros' : null,
      proveedor_id: m.tipo === 'compra' ? m.proveedor_id : null, concepto: m.concepto.trim(), importe_cent: m.importe_cent, medio_pago: m.medio_pago,
    }
    if (m.id) {
      ok(await supabase.from('caja_movimientos').update(fila).eq('id', m.id))
      return m.id
    }
    const uuid = m.client_uuid ?? crypto.randomUUID()
    ok(await supabase.from('caja_movimientos').upsert({ ...fila, client_uuid: uuid, origen: 'manual' }, { onConflict: 'client_uuid', ignoreDuplicates: true }))
    return uuid
  },
  async borrarMovCaja(id) {
    ok(await supabase.from('caja_movimientos').delete().eq('id', id))
  },
  async menusEnCuentas(cantina, fecha) {
    return Number(ok(await supabase.rpc('menus_en_cuentas', { p_cantina: cantina, p_fecha: fecha })))
  },
  async guardarCierreDia(cantina, c) {
    ok(await supabase.rpc('guardar_cierre_dia', {
      p_cantina: cantina, p_fecha: c.fecha, p_menus_cent: c.menus_cent, p_menus_cant: c.menus_cant, p_kiosco_cent: c.kiosco_cent, p_medio_pago: c.medio_pago,
    }))
  },
  async deudaCuentasAl(cantina, fecha) {
    return Number(ok(await supabase.rpc('deuda_cuentas_al', { p_cantina: cantina, p_fecha: fecha })))
  },

  async listas(cantina) {
    const filas = ok(await supabase.from('listas_precio').select('id, nombre, factor_porcion, es_default, orden')
      .eq('cantina_id', cantina).order('es_default', { ascending: false }).order('orden').order('nombre'))
    return (filas as Record<string, unknown>[]).map((f) => ({ ...f, factor_porcion: Number(f.factor_porcion) })) as ListaPrecio[]
  },
  async guardarLista(cantina, l) {
    const fila = { cantina_id: cantina, nombre: l.nombre.trim(), factor_porcion: l.factor_porcion }
    if (l.id) {
      ok(await supabase.from('listas_precio').update(fila).eq('id', l.id))
      return l.id
    }
    return (ok(await supabase.from('listas_precio').insert(fila).select('id').single()) as { id: string }).id
  },
  async borrarLista(id) {
    ok(await supabase.from('listas_precio').delete().eq('id', id).eq('es_default', false))
  },
  async fijarPrecioMenuLista(cantina, lista, precio_cent) {
    const menu = (ok(await supabase.from('productos_venta').select('id').eq('cantina_id', cantina).eq('tipo', 'menu').single()) as { id: string }).id
    ok(await supabase.rpc('fijar_precio_venta', { p_producto: menu, p_lista: lista, p_precio_cent: precio_cent }))
  },
  async diasFijos(cantina) {
    const filas = ok(await supabase.from('alumno_dias_fijos').select('alumno_id, dia_semana').eq('cantina_id', cantina))
    const out: Record<string, number[]> = {}
    for (const f of filas as { alumno_id: string; dia_semana: number }[]) (out[f.alumno_id] ??= []).push(f.dia_semana)
    return out
  },
  async guardarDiasFijos(cantina, alumno, dias) {
    ok(await supabase.from('alumno_dias_fijos').delete().eq('alumno_id', alumno))
    if (dias.length) ok(await supabase.from('alumno_dias_fijos').insert(dias.map((d) => ({ cantina_id: cantina, alumno_id: alumno, dia_semana: d }))))
  },
  async anotarDiasFijos(cantina, fecha) {
    return Number(ok(await supabase.rpc('anotar_dias_fijos', { p_cantina: cantina, p_fecha: fecha })))
  },
  async pedidosPorLista(cantina, desde, hasta) {
    const filas = ok(await supabase.from('menu_dia_pedidos').select('fecha, lista_id, pedidos').eq('cantina_id', cantina).gte('fecha', desde).lte('fecha', hasta))
    const out: Record<string, Record<string, number>> = {}
    for (const f of filas as { fecha: string; lista_id: string; pedidos: number }[]) (out[f.fecha] ??= {})[f.lista_id] = f.pedidos
    return out
  },
  async guardarPedidosPorLista(cantina, fecha, pedidos) {
    ok(await supabase.from('menu_dia_pedidos').delete().eq('cantina_id', cantina).eq('fecha', fecha))
    const filas = Object.entries(pedidos).filter(([, n]) => n > 0).map(([lista_id, n]) => ({ cantina_id: cantina, fecha, lista_id, pedidos: n }))
    if (filas.length) ok(await supabase.from('menu_dia_pedidos').insert(filas))
  },
  async menusEnCuentasPorLista(cantina, fecha) {
    const filas = ok(await supabase.rpc('menus_en_cuentas_por_lista', { p_cantina: cantina, p_fecha: fecha }))
    return Object.fromEntries((filas as { lista_id: string; cantidad: number }[]).map((f) => [f.lista_id, Number(f.cantidad)]))
  },
  async actualizarModulos(cantina, modulos) {
    const actual = (ok(await supabase.from('cantinas').select('modulos').eq('id', cantina).single()) as { modulos: Record<string, boolean> }).modulos
    ok(await supabase.from('cantinas').update({ modulos: { ...actual, ...modulos } }).eq('id', cantina))
  },
  async actualizarTerminos(cantina, terminos) {
    ok(await supabase.from('cantinas').update({ terminos }).eq('id', cantina))
  },
  async crearCantina(nombre) {
    return (ok(await supabase.from('cantinas').insert({ nombre: nombre.trim() }).select('id').single()) as { id: string }).id
  },
  async usuarios(pedido) {
    const { data, error } = await supabase.functions.invoke('admin-usuarios', { body: pedido })
    if (error) {
      // El mensaje útil viene en el cuerpo de la respuesta de la función.
      const cuerpo = await (error as { context?: Response }).context?.json?.().catch(() => null)
      throw { message: cuerpo?.error ?? error.message, code: cuerpo?.error ? 'P0001' : undefined }
    }
    return data
  },
  async vaciarCantina(cantina) {
    ok(await supabase.rpc('vaciar_cantina', { p_cantina: cantina }))
  },
  async borrarCantina(cantina) {
    ok(await supabase.rpc('borrar_cantina', { p_cantina: cantina }))
  },
  async movimientosCantina(cantina) {
    const filas = ok(await supabase.from('cuenta_movimientos')
      .select('id, alumno_id, fecha, tipo, concepto, cantidad, importe_cent, medio_pago, anulado, anulado_motivo, cargado_at')
      .eq('cantina_id', cantina).order('fecha').order('cargado_at'))
    return (filas as Record<string, unknown>[]).map((f) => ({ ...f, cantidad: Number(f.cantidad), importe_cent: Number(f.importe_cent) })) as Movimiento[]
  },

  async fijarPrecioMenu(cantina, precio_cent) {
    ok(await supabase.rpc('fijar_precio_menu', { p_cantina: cantina, p_precio_cent: precio_cent }))
  },
  async actualizarCantina(cantina, campos) {
    ok(await supabase.from('cantinas').update(campos).eq('id', cantina))
  },
}

function aPrecio(f: Record<string, unknown>): PrecioCompra {
  return {
    insumo_id: f.insumo_id as string, fecha: f.fecha as string, cantidad: Number(f.cantidad),
    unidad: f.unidad as PrecioCompra['unidad'], precio_cent: Number(f.precio_cent),
  }
}
