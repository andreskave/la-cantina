// Implementación en memoria para el modo demostración (VITE_DEMO=1). Imita lo que hace
// la base: el ayudante no ve precios de compra ni puede guardar, el historial agrega una
// fila por día, los nombres no se repiten y no se borra lo que está en uso.

import { hoyISO } from '../lib/formato'
import type { Alumno, Api, CostoCongelado, ListaPrecio, UsuarioCantina, DiaMenu, Insumo, MovCaja, Movimiento, PrecioCompra, ProductoVenta, Proveedor, Receta } from './tipos'
import { partidasAbiertas, saldo } from '../lib/cuentas'
import type { Modulos, Rol } from '../lib/permisos'

// lista_id ausente = lista por defecto (General).
type PrecioVenta = { producto_id: string; precio_cent: number; vigente_desde: string; lista_id?: string }

export type DatosMemoria = {
  cantina: { id: string; nombre: string; pedidos_por_defecto: number; objetivo_costo_pct: number }
  proveedores: Proveedor[]
  insumos: Insumo[]
  precios: PrecioCompra[]
  recetas: Receta[]
  productos: Omit<ProductoVenta, 'precio_cent'>[]
  preciosVenta: PrecioVenta[]
  menu: DiaMenu[]
  congelados: CostoCongelado[]
  alumnos: Alumno[]
  movimientos: Movimiento[]
  caja: MovCaja[]
  config: { modulos: Modulos; terminos: Record<string, string> }
  listas: ListaPrecio[]
  diasFijos: Record<string, number[]>
  pedidosLista: Record<string, Record<string, number>>
  usuarios: UsuarioCantina[]
}

class ErrorDemo extends Error {
  constructor(message: string, public code: string) { super(message) }
}

// Sin conexión (se puede simular con el modo avión del navegador) falla como fallaría fetch.
const espera = async () => {
  await new Promise((r) => setTimeout(r, 120))
  if ((globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine === false) throw new TypeError('Failed to fetch')
}
const id = () => crypto.randomUUID()
const clave = (s: string) => s.trim().toLowerCase()

export function crearMemoriaApi(d: DatosMemoria, rol: () => Rol): Api {
  const gestion = (msg: string) => {
    if (rol() === 'ayudante') throw new ErrorDemo(msg, '42501')
  }
  const general = () => d.listas.find((l) => l.es_default)!.id
  const listaDe = (p: PrecioVenta) => p.lista_id ?? general()
  /** Precio vigente de un producto en una lista (sin respaldo). */
  const vigenteEn = (producto: string, lista: string, fecha = hoyISO()) =>
    d.preciosVenta.filter((p) => p.producto_id === producto && listaDe(p) === lista && p.vigente_desde <= fecha)
      .sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))[0]?.precio_cent ?? null
  const vigenteVenta = (producto: string) => vigenteEn(producto, general())
  /** Como precio_producto de la base: la lista pedida y, si no tiene, la General. */
  const precioProducto = (producto: string, lista: string, fecha: string) => vigenteEn(producto, lista, fecha) ?? vigenteEn(producto, general(), fecha)
  /** Como precio_menu de la base (con el módulo precio_por_plato). */
  const precioMenu = (fecha: string, lista: string) => {
    const menu = d.productos.find((p) => p.tipo === 'menu')!
    if (d.config.modulos.precio_por_plato) {
      const dia = d.menu.find((m) => m.fecha === fecha && !m.sin_cocina)
      const prodPlato = dia?.plato_receta_id ? d.productos.find((p) => p.receta_id === dia.plato_receta_id && p.activo) : undefined
      const pp = prodPlato ? precioProducto(prodPlato.id, lista, fecha) : null
      if (pp) return pp
    }
    return precioProducto(menu.id, lista, fecha)
  }
  const listaDeAlumno = (alumno: string) => {
    const a = d.alumnos.find((x) => x.id === alumno)
    return d.config.modulos.listas_precio && a?.lista_id ? a.lista_id : general()
  }
  const fijarVenta = (producto: string, precio: number, lista = general()) => {
    if (vigenteEn(producto, lista) === precio) return
    const hoy = hoyISO()
    d.preciosVenta = d.preciosVenta.filter((p) => !(p.producto_id === producto && listaDe(p) === lista && p.vigente_desde === hoy))
    d.preciosVenta.push({ producto_id: producto, precio_cent: precio, vigente_desde: hoy, lista_id: lista })
  }
  const nombreLibre = (lista: { id: string; nombre: string }[], nombre: string, propio?: string) => {
    if (lista.some((x) => x.id !== propio && clave(x.nombre) === clave(nombre)))
      throw new ErrorDemo('duplicate key value violates unique constraint', '23505')
  }

  return {
    async proveedores() { await espera(); return structuredClone(d.proveedores) },
    async guardarProveedor(_c, p) {
      await espera(); gestion('Solo la dueña puede editar proveedores.')
      nombreLibre(d.proveedores, p.nombre, p.id)
      const fila = { id: p.id ?? id(), nombre: p.nombre.trim(), telefono: p.telefono || null, notas: p.notas || null }
      d.proveedores = [...d.proveedores.filter((x) => x.id !== fila.id), fila]
      return fila.id
    },
    async borrarProveedor(pid) {
      await espera(); gestion('Solo la dueña puede editar proveedores.')
      d.proveedores = d.proveedores.filter((x) => x.id !== pid)
      for (const i of d.insumos) if (i.proveedor_id === pid) i.proveedor_id = null
    },

    async insumos() { await espera(); return structuredClone(d.insumos) },
    async preciosVigentes() {
      await espera()
      if (rol() === 'ayudante') return []
      const out = new Map<string, PrecioCompra>()
      for (const p of [...d.precios].sort((a, b) => a.fecha.localeCompare(b.fecha))) out.set(p.insumo_id, p)
      return structuredClone([...out.values()])
    },
    async historialPrecios(insumo) {
      await espera()
      if (rol() === 'ayudante') return []
      return structuredClone(d.precios.filter((p) => p.insumo_id === insumo).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 12))
    },
    async guardarInsumos(_c, items) {
      await espera(); gestion('Solo la dueña puede cargar insumos.')
      const copia = structuredClone(d)
      try {
        return items.map((it) => {
          nombreLibre(d.insumos, it.nombre, it.id)
          if (!(it.cantidad_compra > 0)) throw new ErrorDemo('La cantidad tiene que ser mayor a cero.', '23514')
          const ins: Insumo = {
            id: it.id ?? id(), nombre: it.nombre.trim(), categoria: it.categoria, proveedor_id: it.proveedor_id,
            cantidad_compra: it.cantidad_compra, unidad_compra: it.unidad_compra, merma_pct: it.merma_pct,
            es_reventa: it.es_reventa, activo: it.activo ?? d.insumos.find((x) => x.id === it.id)?.activo ?? true,
          }
          d.insumos = [...d.insumos.filter((x) => x.id !== ins.id), ins]
          if (it.precio_cent !== null && it.precio_cent !== undefined) {
            const ult = d.precios.filter((p) => p.insumo_id === ins.id).sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
            if (!ult || ult.cantidad !== ins.cantidad_compra || ult.unidad !== ins.unidad_compra || ult.precio_cent !== it.precio_cent) {
              const hoy = hoyISO()
              d.precios = d.precios.filter((p) => !(p.insumo_id === ins.id && p.fecha === hoy))
              d.precios.push({ insumo_id: ins.id, fecha: hoy, cantidad: ins.cantidad_compra, unidad: ins.unidad_compra, precio_cent: it.precio_cent })
            }
          }
          let prod = d.productos.find((p) => p.insumo_id === ins.id)
          if (ins.es_reventa) {
            if (!prod) {
              prod = { id: id(), tipo: 'insumo_reventa', insumo_id: ins.id, receta_id: null, nombre: ins.nombre, activo: true }
              d.productos.push(prod)
            }
            prod.nombre = ins.nombre
            prod.activo = true
            if (it.precio_venta_cent !== null && it.precio_venta_cent !== undefined) fijarVenta(prod.id, it.precio_venta_cent)
          } else if (prod) prod.activo = false
          return ins.id
        })
      } catch (e) {
        Object.assign(d, copia)
        throw e
      }
    },
    async borrarInsumo(iid) {
      await espera(); gestion('Solo la dueña puede borrar insumos.')
      if (d.recetas.some((r) => r.ingredientes.some((i) => i.insumo_id === iid)))
        throw new ErrorDemo('violates foreign key constraint', '23503')
      d.insumos = d.insumos.filter((x) => x.id !== iid)
      d.precios = d.precios.filter((p) => p.insumo_id !== iid)
      d.productos = d.productos.filter((p) => p.insumo_id !== iid)
    },

    async recetas() { await espera(); return structuredClone(d.recetas) },
    async guardarReceta(_c, r) {
      await espera(); gestion('Solo la dueña puede editar recetas.')
      nombreLibre(d.recetas, r.nombre, r.id)
      const prep = r.tipo === 'preparacion'
      const rec: Receta = {
        id: r.id ?? id(), nombre: r.nombre.trim(), tipo: r.tipo,
        modo: prep ? null : r.modo ?? 'porcion',
        porciones: !prep && r.modo === 'olla' ? r.porciones : null,
        rinde_cantidad: prep ? r.rinde_cantidad : null, rinde_unidad: prep ? r.rinde_unidad : null,
        activo: r.activo, ingredientes: structuredClone(r.ingredientes),
      }
      d.recetas = [...d.recetas.filter((x) => x.id !== rec.id), rec]
      if (r.precio_venta_cent !== undefined) {
        let prod = d.productos.find((p) => p.receta_id === rec.id)
        if (r.precio_venta_cent === null) { if (prod) prod.activo = false }
        else {
          if (!prod) {
            prod = { id: id(), tipo: 'receta', insumo_id: null, receta_id: rec.id, nombre: rec.nombre, activo: true }
            d.productos.push(prod)
          }
          prod.nombre = rec.nombre
          prod.activo = true
          fijarVenta(prod.id, r.precio_venta_cent)
        }
      }
      return rec.id
    },
    async borrarReceta(rid) {
      await espera(); gestion('Solo la dueña puede borrar recetas.')
      if (d.recetas.some((r) => r.ingredientes.some((i) => i.preparacion_id === rid))
        || d.menu.some((m) => m.plato_receta_id === rid || m.postre_receta_id === rid))
        throw new ErrorDemo('violates foreign key constraint', '23503')
      d.recetas = d.recetas.filter((x) => x.id !== rid)
      d.productos = d.productos.filter((p) => p.receta_id !== rid)
    },

    async productosVenta() {
      await espera()
      return d.productos.map((p) => ({
        ...p, precio_cent: vigenteVenta(p.id),
        precios_lista: Object.fromEntries(d.listas.map((l) => [l.id, vigenteEn(p.id, l.id)]).filter(([, v]) => v !== null)) as Record<string, number>,
      }))
    },
    async usosEnMenu() {
      await espera()
      const out: Record<string, number> = {}
      for (const m of d.menu) for (const r of [m.plato_receta_id, m.postre_receta_id]) if (r) out[r] = (out[r] ?? 0) + 1
      return out
    },

    async historialPreciosCantina() {
      await espera()
      return rol() === 'ayudante' ? [] : structuredClone([...d.precios].sort((a, b) => a.fecha.localeCompare(b.fecha)))
    },
    async historialPrecioMenu() {
      await espera()
      const menu = d.productos.find((p) => p.tipo === 'menu')!
      return d.preciosVenta.filter((p) => p.producto_id === menu.id).map(({ vigente_desde, precio_cent }) => ({ vigente_desde, precio_cent }))
    },

    async menuDias(_c, desde, hasta) {
      await espera()
      return structuredClone(d.menu.filter((m) => m.fecha >= desde && m.fecha <= hasta).sort((a, b) => a.fecha.localeCompare(b.fecha)))
    },
    async guardarDia(_c, dia) {
      await espera(); gestion('Solo la dueña puede editar el menú.')
      d.menu = [...d.menu.filter((m) => m.fecha !== dia.fecha), structuredClone(dia)]
    },
    async borrarDia(_c, fecha) {
      await espera(); gestion('Solo la dueña puede editar el menú.')
      d.menu = d.menu.filter((m) => m.fecha !== fecha)
      d.congelados = d.congelados.filter((c) => c.fecha !== fecha)
    },
    async insertarDias(_c, dias) {
      await espera(); gestion('Solo la dueña puede editar el menú.')
      const nuevos = dias.filter((n) => !d.menu.some((m) => m.fecha === n.fecha))
      d.menu.push(...structuredClone(nuevos))
      return nuevos.length
    },
    async costosCongelados(_c, desde, hasta) {
      await espera()
      return rol() === 'ayudante' ? [] : structuredClone(d.congelados.filter((c) => c.fecha >= desde && c.fecha <= hasta))
    },
    async fijarCostoCongelado(_c, fecha, fila) {
      await espera(); gestion('Solo la dueña puede recalcular costos.')
      d.congelados = d.congelados.filter((c) => c.fecha !== fecha)
      if (fila) d.congelados.push({ fecha, costo_plato_cent: fila.costo_plato_cent, costo_postre_cent: fila.costo_postre_cent, costo_total_cent: fila.costo_total_cent })
    },

    async alumnos() { await espera(); return structuredClone(d.alumnos) },
    async guardarAlumno(_c, a) {
      await espera(); gestion('Solo la dueña puede dar de alta o editar alumnos.')
      const fila: Alumno = { ...a, id: a.id ?? id(), nombre: a.nombre.trim() }
      d.alumnos = [...d.alumnos.filter((x) => x.id !== fila.id), fila]
      return fila.id
    },
    async saldos() {
      await espera()
      return Object.fromEntries(d.alumnos.map((a) => [a.id, saldo(d.movimientos.filter((m) => m.alumno_id === a.id))]))
    },
    async movimientos(alumno) {
      await espera()
      return structuredClone(d.movimientos.filter((m) => m.alumno_id === alumno)
        .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.cargado_at.localeCompare(a.cargado_at)))
    },
    async partidasAbiertas(_c, alumno) {
      await espera()
      return d.alumnos.filter((a) => !alumno || a.id === alumno).flatMap((a) =>
        partidasAbiertas(d.movimientos.filter((m) => m.alumno_id === a.id)).map((p) => ({
          cargo_id: p.cargo.id, alumno_id: a.id, fecha: p.cargo.fecha, concepto: p.cargo.concepto,
          importe_cent: p.cargo.importe_cent, pendiente_cent: p.pendiente_cent,
        })))
    },
    async anotarConsumo(c) {
      await espera()
      const ya = d.movimientos.find((m) => m.id === c.client_uuid)
      if (ya) return ya.id
      let concepto: string, precio: number, cantidad = c.cantidad
      if (!c.producto_id) {
        if (rol() === 'ayudante') throw new ErrorDemo('Solo la dueña puede anotar consumos con importe libre.', '42501')
        if (!c.concepto?.trim() || !(Number(c.importe_cent) > 0)) throw new ErrorDemo('Escribí qué consumió y el importe.', '22023')
        concepto = c.concepto.trim(); precio = Number(c.importe_cent); cantidad = 1
      } else {
        const prod = d.productos.find((p) => p.id === c.producto_id)
        if (!prod?.activo) throw new ErrorDemo('Ese producto ya no está a la venta.', '22023')
        const lista = listaDeAlumno(c.alumno_id)
        const p = prod.tipo === 'menu' ? precioMenu(c.fecha, lista) : precioProducto(prod.id, lista, c.fecha)
        if (!p) throw new ErrorDemo(`"${prod.nombre}" no tiene precio de venta cargado. Pedile a la dueña que lo cargue.`, '22023')
        precio = p
        concepto = rol() !== 'ayudante' && c.concepto?.trim() ? c.concepto.trim() : prod.nombre
        if (prod.tipo === 'menu' && concepto === prod.nombre) {
          const dia = d.menu.find((m) => m.fecha === c.fecha && !m.sin_cocina)
          const plato = dia?.plato_receta_id ? d.recetas.find((r) => r.id === dia.plato_receta_id)?.nombre : dia?.plato_texto
          if (plato) concepto = `Menú: ${plato}`
        }
      }
      d.movimientos.push({ id: c.client_uuid, alumno_id: c.alumno_id, fecha: c.fecha, tipo: 'cargo', concepto, cantidad,
        importe_cent: Math.round(precio * cantidad), medio_pago: null, anulado: false, anulado_motivo: null, cargado_at: c.cargado_at })
      return c.client_uuid
    },
    async registrarPago(p) {
      await espera()
      if (rol() === 'ayudante') throw new ErrorDemo('Solo la dueña puede registrar pagos.', '42501')
      if (d.movimientos.some((m) => m.id === p.client_uuid)) return p.client_uuid
      if (!(p.importe_cent > 0)) throw new ErrorDemo('El importe del pago tiene que ser mayor a cero.', '22023')
      d.movimientos.push({ id: p.client_uuid, alumno_id: p.alumno_id, fecha: p.fecha, tipo: 'pago', concepto: p.concepto?.trim() || 'Pago',
        cantidad: 1, importe_cent: p.importe_cent, medio_pago: p.medio_pago ?? null, anulado: false, anulado_motivo: null, cargado_at: p.cargado_at })
      // Igual que el trigger de la base: cada pago crea su cobro en caja.
      const nombre = d.alumnos.find((a) => a.id === p.alumno_id)?.nombre ?? ''
      d.caja.push({ id: `cobro-${p.client_uuid}`, fecha: p.fecha, tipo: 'cobro_cuenta', subcategoria: null, proveedor_id: null,
        concepto: `Cobro: ${nombre}`, importe_cent: p.importe_cent, medio_pago: p.medio_pago ?? null, origen: 'cuenta_corriente', anulado: false })
      return p.client_uuid
    },
    async anularMovimiento(mid, motivo) {
      await espera()
      if (rol() === 'ayudante') throw new ErrorDemo('Solo la dueña puede anular movimientos.', '42501')
      if (!motivo.trim()) throw new ErrorDemo('Escribí el motivo de la anulación.', '22023')
      const m = d.movimientos.find((x) => x.id === mid)
      if (m && !m.anulado) { m.anulado = true; m.anulado_motivo = motivo.trim() }
      const cobro = d.caja.find((c) => c.id === `cobro-${mid}`)
      if (cobro) cobro.anulado = true
    },

    async cajaMovimientos(_c, desde, hasta) {
      await espera()
      if (rol() === 'ayudante') return []
      return structuredClone(d.caja.filter((m) => m.fecha >= desde && m.fecha <= hasta).sort((a, b) => b.fecha.localeCompare(a.fecha)))
    },
    async guardarMovCaja(_c, m) {
      await espera(); gestion('Solo la dueña puede usar la caja.')
      if (!(m.importe_cent > 0)) throw new ErrorDemo('El importe tiene que ser mayor a cero.', '23514')
      const mid = m.id ?? m.client_uuid ?? id()
      const previo = d.caja.find((x) => x.id === mid)
      if (previo?.origen === 'cuenta_corriente') throw new ErrorDemo('Los cobros de cuentas se manejan desde la cuenta.', '42501')
      if (!m.id && previo) return mid
      const fila = {
        id: mid, fecha: m.fecha, tipo: m.tipo, subcategoria: m.tipo === 'gasto_fijo' ? m.subcategoria ?? 'Otros' : null,
        proveedor_id: m.tipo === 'compra' ? m.proveedor_id : null, concepto: m.concepto.trim(), importe_cent: m.importe_cent,
        medio_pago: m.medio_pago, origen: previo?.origen ?? 'manual', anulado: false,
      } as const
      d.caja = [...d.caja.filter((x) => x.id !== mid), fila]
      return mid
    },
    async borrarMovCaja(mid) {
      await espera(); gestion('Solo la dueña puede usar la caja.')
      d.caja = d.caja.filter((x) => x.id !== mid || x.origen === 'cuenta_corriente')
    },
    async menusEnCuentas(_c, fecha) {
      await espera()
      const menu = d.productos.find((p) => p.tipo === 'menu')!
      // En la demo los movimientos no guardan el producto: se reconoce el menú por su concepto.
      return d.movimientos.filter((m) => m.fecha === fecha && m.tipo === 'cargo' && !m.anulado
        && (m.concepto.startsWith('Menú') || m.concepto === menu.nombre)).reduce((a, m) => a + m.cantidad, 0)
    },
    async guardarCierreDia(_c, c) {
      await espera(); gestion('Solo la dueña puede hacer el cierre del día.')
      d.caja = d.caja.filter((x) => !(x.fecha === c.fecha && x.origen === 'cierre_dia'))
      const base = { fecha: c.fecha, tipo: 'venta_contado', subcategoria: null, proveedor_id: null, medio_pago: c.medio_pago, origen: 'cierre_dia', anulado: false } as const
      if (c.menus_cent > 0) d.caja.push({ ...base, id: id(), concepto: c.menus_cant > 0 ? `Menús al contado (${c.menus_cant})` : 'Menús al contado', importe_cent: c.menus_cent })
      if (c.kiosco_cent > 0) d.caja.push({ ...base, id: id(), concepto: 'Kiosco al contado', importe_cent: c.kiosco_cent })
    },
    async deudaCuentasAl(_c, fecha) {
      await espera()
      return d.alumnos.reduce((a, al) => a + Math.max(0, saldo(d.movimientos.filter((m) => m.alumno_id === al.id && m.fecha <= fecha))), 0)
    },

    // ---- Fase 7 ----
    async listas() { await espera(); return structuredClone(d.listas) },
    async guardarLista(_c, l) {
      await espera(); gestion('Solo la dueña puede editar listas de precio.')
      nombreLibre(d.listas, l.nombre, l.id)
      const previa = d.listas.find((x) => x.id === l.id)
      const fila: ListaPrecio = { id: l.id ?? id(), nombre: l.nombre.trim(), factor_porcion: l.factor_porcion, es_default: previa?.es_default ?? false, orden: previa?.orden ?? d.listas.length }
      d.listas = [...d.listas.filter((x) => x.id !== fila.id), fila].sort((a, b) => Number(b.es_default) - Number(a.es_default) || a.orden - b.orden)
      return fila.id
    },
    async borrarLista(lid) {
      await espera(); gestion('Solo la dueña puede editar listas de precio.')
      if (d.listas.find((l) => l.id === lid)?.es_default) return
      d.listas = d.listas.filter((l) => l.id !== lid)
      for (const a of d.alumnos) if (a.lista_id === lid) a.lista_id = null
    },
    async fijarPrecioMenuLista(_c, lista, precio) {
      await espera(); gestion('Solo la dueña puede cambiar precios de venta.')
      fijarVenta(d.productos.find((p) => p.tipo === 'menu')!.id, precio, lista)
    },
    async diasFijos() { await espera(); return structuredClone(d.diasFijos) },
    async guardarDiasFijos(_c, alumno, dias) {
      await espera(); gestion('Solo la dueña puede editar alumnos.')
      d.diasFijos[alumno] = [...dias].sort()
    },
    async anotarDiasFijos(_c, fecha) {
      await espera(); gestion('Solo la dueña puede anotar los días fijos.')
      if (!d.config.modulos.dias_fijos) return 0
      const dia = d.menu.find((m) => m.fecha === fecha && !m.sin_cocina && (m.plato_receta_id || m.plato_texto || m.postre_receta_id || m.postre_texto))
      if (!dia) return 0
      const dow = new Date(`${fecha}T12:00:00Z`).getUTCDay()
      const menu = d.productos.find((p) => p.tipo === 'menu')!
      const plato = dia.plato_receta_id ? d.recetas.find((r) => r.id === dia.plato_receta_id)?.nombre : dia.plato_texto
      let n = 0
      for (const a of d.alumnos) {
        if (!a.activo || !(d.diasFijos[a.id] ?? []).includes(dow)) continue
        const uuid = `dias-fijos:${a.id}:${fecha}`
        const yaTiene = d.movimientos.some((m) => m.alumno_id === a.id && m.fecha === fecha && m.tipo === 'cargo' && !m.anulado
          && (m.id === uuid || m.concepto.startsWith('Menú') || m.concepto === menu.nombre))
        if (yaTiene) continue
        const precio = precioMenu(fecha, listaDeAlumno(a.id))
        if (!precio) continue
        d.movimientos.push({ id: uuid, alumno_id: a.id, fecha, tipo: 'cargo', concepto: plato ? `Menú: ${plato}` : menu.nombre, cantidad: 1,
          importe_cent: precio, medio_pago: null, anulado: false, anulado_motivo: null, cargado_at: new Date().toISOString() })
        n++
      }
      return n
    },
    async pedidosPorLista(_c, desde, hasta) {
      await espera()
      return structuredClone(Object.fromEntries(Object.entries(d.pedidosLista).filter(([f]) => f >= desde && f <= hasta)))
    },
    async guardarPedidosPorLista(_c, fecha, pedidos) {
      await espera(); gestion('Solo la dueña puede editar el menú.')
      d.pedidosLista[fecha] = Object.fromEntries(Object.entries(pedidos).filter(([, n]) => n > 0))
    },
    async menusEnCuentasPorLista(_c, fecha) {
      await espera()
      const menu = d.productos.find((p) => p.tipo === 'menu')!
      const out: Record<string, number> = {}
      // En la demo los movimientos no guardan la lista: se toma la lista actual del alumno.
      for (const m of d.movimientos) {
        if (m.fecha !== fecha || m.tipo !== 'cargo' || m.anulado || !(m.concepto.startsWith('Menú') || m.concepto === menu.nombre)) continue
        const l = listaDeAlumno(m.alumno_id)
        out[l] = (out[l] ?? 0) + m.cantidad
      }
      return out
    },
    async actualizarModulos(_c, modulos) {
      await espera()
      if (rol() !== 'admin') throw new ErrorDemo('Solo el administrador puede cambiar los módulos y los términos.', '42501')
      d.config.modulos = { ...d.config.modulos, ...modulos }
    },
    async actualizarTerminos(_c, terminos) {
      await espera()
      if (rol() !== 'admin') throw new ErrorDemo('Solo el administrador puede cambiar los módulos y los términos.', '42501')
      d.config.terminos = { ...terminos }
    },
    async crearCantina() {
      await espera()
      throw new ErrorDemo('En la demostración hay una sola cantina.', 'P0001')
    },
    async usuarios(pedido) {
      await espera()
      if (rol() !== 'admin') throw new ErrorDemo('Solo el administrador puede administrar usuarios.', 'P0001')
      const clave = () => `demo${Math.floor(1000 + Math.random() * 8999)}-clave`
      switch (pedido.accion) {
        case 'listar': return { usuarios: structuredClone(d.usuarios) }
        case 'crear': {
          const ya = d.usuarios.find((u) => u.email === pedido.email.trim().toLowerCase())
          if (ya) { ya.rol = pedido.rol; return { user_id: ya.user_id, clave_temporal: null, ya_existia: true } }
          const u = { user_id: id(), email: pedido.email.trim().toLowerCase(), nombre: pedido.nombre.trim(), rol: pedido.rol }
          d.usuarios.push(u)
          return { user_id: u.user_id, clave_temporal: clave(), ya_existia: false }
        }
        case 'cambiar_rol': { const u = d.usuarios.find((x) => x.user_id === pedido.user_id); if (u) u.rol = pedido.rol; return { ok: true } }
        case 'quitar': d.usuarios = d.usuarios.filter((x) => x.user_id !== pedido.user_id); return { ok: true }
        case 'nueva_clave': return { clave_temporal: clave() }
      }
    },
    async vaciarCantina() {
      await espera()
      if (rol() !== 'admin') throw new ErrorDemo('Solo el administrador puede borrar datos.', '42501')
      Object.assign(d, { proveedores: [], insumos: [], precios: [], recetas: [], menu: [], congelados: [], alumnos: [], movimientos: [], caja: [], diasFijos: {}, pedidosLista: {} })
      d.productos = d.productos.filter((p) => p.tipo === 'menu')
      d.preciosVenta = d.preciosVenta.filter((p) => d.productos.some((x) => x.id === p.producto_id))
    },
    async borrarCantina() {
      await espera()
      throw new ErrorDemo('En la demostración no se puede borrar la cantina. Probá "Vaciar datos".', 'P0001')
    },
    async movimientosCantina() {
      await espera()
      return structuredClone([...d.movimientos].sort((a, b) => a.fecha.localeCompare(b.fecha)))
    },

    async fijarPrecioMenu(_c, precio) {
      await espera(); gestion('Solo la dueña puede cambiar precios de venta.')
      fijarVenta(d.productos.find((p) => p.tipo === 'menu')!.id, precio)
    },
    async actualizarCantina(_c, campos) {
      await espera(); gestion('No tenés permiso para hacer esto.')
      Object.assign(d.cantina, campos)
    },
  }
}
