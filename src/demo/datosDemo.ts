// Datos de ejemplo para desarrollo: modo demostración y seed opcional (scripts/seed-demo.ts).
// Sin imports de valores para que Node lo pueda correr directo.
import type { DatosMemoria } from '../datos/memoriaApi'
import type { Alumno, DiaMenu, Ingrediente, Insumo, MovCaja, Movimiento, Receta } from '../datos/tipos'
import { habilesMes, mesMas, proximosHabiles } from '../lib/fechas.ts'
import { MODULOS_DEFAULT } from '../lib/permisos.ts'

const hace = (dias: number) => {
  const d = new Date(Date.now() - dias * 86400000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montevideo' }).format(d)
}

export function datosDemo(): DatosMemoria {
  const uid = (_tipo: string) => crypto.randomUUID()

  const prov = (nombre: string, telefono: string | null) => ({ id: uid('prov'), nombre, telefono, notas: null })
  const almacen = prov('Almacén Don José', '099 123 456')
  const carniceria = prov('Carnicería La Vaca', '098 765 432')
  const verduleria = prov('Verdulería Rosita', null)

  const insumos: Insumo[] = []
  const precios: DatosMemoria['precios'] = []
  const ins = (nombre: string, categoria: Insumo['categoria'], proveedor: string | null, cantidad: number,
    unidad: Insumo['unidad_compra'], precio: number, opts: { merma?: number; reventa?: boolean; antes?: number } = {}) => {
    const i: Insumo = { id: uid('insu'), nombre, categoria, proveedor_id: proveedor, cantidad_compra: cantidad,
      unidad_compra: unidad, merma_pct: opts.merma ?? 0, es_reventa: opts.reventa ?? false, activo: true }
    insumos.push(i)
    if (opts.antes) precios.push({ insumo_id: i.id, fecha: hace(45), cantidad, unidad, precio_cent: opts.antes * 100 })
    precios.push({ insumo_id: i.id, fecha: hace(opts.antes ? 12 : 60), cantidad, unidad, precio_cent: precio * 100 })
    return i.id
  }

  const tallarines = ins('Tallarines', 'Almacén', almacen.id, 1, 'kg', 300, { antes: 280 })
  const arroz = ins('Arroz', 'Almacén', almacen.id, 1, 'kg', 85)
  const tomate = ins('Tomate triturado', 'Almacén', almacen.id, 1, 'l', 120)
  const aceite = ins('Aceite', 'Almacén', almacen.id, 900, 'ml', 190)
  const pan = ins('Pan rallado', 'Almacén', almacen.id, 1, 'kg', 140)
  const carne = ins('Carne picada', 'Carnes', carniceria.id, 1, 'kg', 420, { antes: 390 })
  const pollo = ins('Pollo trozado', 'Carnes', carniceria.id, 1, 'kg', 210, { merma: 30 })
  const nalga = ins('Nalga', 'Carnes', carniceria.id, 1, 'kg', 520)
  const cebolla = ins('Cebolla', 'Verdulería', verduleria.id, 1, 'kg', 55, { merma: 10 })
  const papa = ins('Papa', 'Verdulería', verduleria.id, 1, 'kg', 45, { merma: 15 })
  const banana = ins('Banana', 'Verdulería', verduleria.id, 1, 'kg', 90, { merma: 30 })
  const leche = ins('Leche', 'Lácteos y huevos', almacen.id, 1, 'l', 45)
  const huevos = ins('Huevos', 'Lácteos y huevos', almacen.id, 30, 'u', 270)
  const azucar = ins('Azúcar', 'Almacén', almacen.id, 1, 'kg', 60)
  const gelatina = ins('Gelatina en polvo', 'Almacén', almacen.id, 1, 'kg', 900)
  const jugo = ins('Jugo 200 ml', 'Bebidas', almacen.id, 12, 'u', 300, { reventa: true })
  const alfajor = ins('Alfajor', 'Golosinas y snacks', almacen.id, 24, 'u', 840, { reventa: true })
  ins('Harina', 'Almacén', almacen.id, 1, 'kg', 40)
  // Sin precio todavía, para ver el aviso de "Falta".
  insumos.push({ id: uid('insu'), nombre: 'Queso rallado', categoria: 'Lácteos y huevos', proveedor_id: almacen.id,
    cantidad_compra: 1, unidad_compra: 'kg', merma_pct: 0, es_reventa: false, activo: true })

  const i = (insumo_id: string, cantidad: number, unidad: Ingrediente['unidad']): Ingrediente => ({ insumo_id, preparacion_id: null, cantidad, unidad })
  const p = (preparacion_id: string, cantidad: number, unidad: Ingrediente['unidad']): Ingrediente => ({ insumo_id: null, preparacion_id, cantidad, unidad })
  const recetas: Receta[] = []
  type NuevaReceta = Omit<Receta, 'id' | 'activo' | 'rinde_cantidad' | 'rinde_unidad'> & Partial<Pick<Receta, 'rinde_cantidad' | 'rinde_unidad'>>
  const rec = (r: NuevaReceta) => {
    const x: Receta = { rinde_cantidad: null, rinde_unidad: null, ...r, id: uid('rece'), activo: true }
    recetas.push(x)
    return x.id
  }
  const prep = (nombre: string, rinde: number, u: 'l' | 'kg' | 'u', ingredientes: Ingrediente[]) =>
    rec({ nombre, tipo: 'preparacion', modo: null, porciones: null, rinde_cantidad: rinde, rinde_unidad: u, ingredientes })

  const tuco = prep('Tuco', 3, 'l', [i(carne, 1, 'kg'), i(tomate, 2, 'l'), i(cebolla, 300, 'g'), i(aceite, 50, 'ml')])
  const pure = prep('Puré de papas', 4, 'kg', [i(papa, 4, 'kg'), i(leche, 500, 'ml')])
  const tct = rec({ nombre: 'Tallarines con tuco', tipo: 'plato', modo: 'olla', porciones: 60,
    ingredientes: [i(tallarines, 7.2, 'kg'), p(tuco, 9, 'l')] })
  const mila = rec({ nombre: 'Milanesa con puré', tipo: 'plato', modo: 'porcion', porciones: null,
    ingredientes: [i(nalga, 120, 'g'), i(huevos, 0.5, 'u'), i(pan, 30, 'g'), i(aceite, 20, 'ml'), p(pure, 200, 'g')] })
  const arrozPollo = rec({ nombre: 'Arroz con pollo', tipo: 'plato', modo: 'porcion', porciones: null,
    ingredientes: [i(arroz, 80, 'g'), i(pollo, 150, 'g'), i(cebolla, 30, 'g'), i(aceite, 10, 'ml')] })
  const tarta = rec({ nombre: 'Tarta de queso', tipo: 'plato', modo: 'porcion', porciones: null,
    ingredientes: [i(huevos, 1, 'u'), i(insumos.find((x) => x.nombre === 'Queso rallado')!.id, 60, 'g')] })
  const flan = rec({ nombre: 'Flan', tipo: 'postre', modo: 'olla', porciones: 30,
    ingredientes: [i(leche, 3, 'l'), i(huevos, 18, 'u'), i(azucar, 600, 'g')] })
  const gela = rec({ nombre: 'Gelatina', tipo: 'postre', modo: 'porcion', porciones: null, ingredientes: [i(gelatina, 15, 'g')] })
  const bana = rec({ nombre: 'Banana', tipo: 'postre', modo: 'porcion', porciones: null, ingredientes: [i(banana, 150, 'g')] })

  const productos: DatosMemoria['productos'] = [
    { id: uid('prod'), tipo: 'menu', insumo_id: null, receta_id: null, nombre: 'Menú del día', activo: true },
    { id: uid('prod'), tipo: 'insumo_reventa', insumo_id: jugo, receta_id: null, nombre: 'Jugo 200 ml', activo: true },
    { id: uid('prod'), tipo: 'insumo_reventa', insumo_id: alfajor, receta_id: null, nombre: 'Alfajor', activo: true },
  ]
  // Lista "Grandes" (módulo listas_precio, apagado por defecto): porciones 1,3 y menú a $ 320.
  const general = { id: uid('lista'), nombre: 'General', factor_porcion: 1, es_default: true, orden: 0 }
  const grandes = { id: uid('lista'), nombre: 'Grandes', factor_porcion: 1.3, es_default: false, orden: 1 }
  const preciosVenta: DatosMemoria['preciosVenta'] = [
    { producto_id: productos[0].id, precio_cent: 26000, vigente_desde: hace(90) },
    { producto_id: productos[1].id, precio_cent: 5000, vigente_desde: hace(90) },
    { producto_id: productos[2].id, precio_cent: 6000, vigente_desde: hace(90) },
    { producto_id: productos[0].id, precio_cent: 32000, vigente_desde: hace(90), lista_id: grandes.id },
  ]

  const menu = menuDemo([tct, mila, arrozPollo, tarta], [flan, gela, bana, null])
  const { alumnos, movimientos } = cuentasDemo(menu, recetas, uid)
  // Dos alumnos de la lista Grandes y uno con días fijos (lunes y miércoles).
  alumnos[2].lista_id = grandes.id
  alumnos[5].lista_id = grandes.id

  return {
    cantina: { id: uid('cantina'), nombre: 'La Cantina (demo)', pedidos_por_defecto: 60, objetivo_costo_pct: 35 },
    proveedores: [almacen, carniceria, verduleria],
    insumos, precios, recetas, productos, preciosVenta,
    menu,
    congelados: [],
    alumnos, movimientos,
    caja: cajaDemo(alumnos, movimientos, [almacen.id, carniceria.id, verduleria.id], uid),
    config: { modulos: { ...MODULOS_DEFAULT }, terminos: {} },
    listas: [general, grandes],
    diasFijos: { [alumnos[0].id]: [1, 3] },
    pedidosLista: {},
    usuarios: [
      { user_id: uid('usuario'), email: 'marta@ejemplo.uy', nombre: 'Marta (dueña)', rol: 'duena' },
      { user_id: uid('usuario'), email: 'lucia@ejemplo.uy', nombre: 'Lucía (ayudante)', rol: 'ayudante' },
    ],
  }
}

/** Cobros de los pagos de ejemplo, compras a proveedores y gastos fijos. */
function cajaDemo(alumnos: Alumno[], movimientos: Movimiento[], proveedores: string[], uid: (t: string) => string): MovCaja[] {
  const nombre = new Map(alumnos.map((a) => [a.id, a.nombre]))
  const cobros: MovCaja[] = movimientos.filter((m) => m.tipo === 'pago').map((m) => ({
    id: `cobro-${m.id}`, fecha: m.fecha, tipo: 'cobro_cuenta', subcategoria: null, proveedor_id: null, concepto: `Cobro: ${nombre.get(m.alumno_id)}`,
    importe_cent: m.importe_cent, medio_pago: null, origen: 'cuenta_corriente', anulado: false,
  }))
  const hoy = hace(0)
  const m = (dias: number, tipo: MovCaja['tipo'], concepto: string, pesos: number, extra: Partial<MovCaja> = {}): MovCaja => ({
    id: uid('caja'), fecha: hace(dias), tipo, subcategoria: tipo === 'gasto_fijo' ? 'Otros' : null, proveedor_id: null, concepto,
    importe_cent: pesos * 100, medio_pago: null, origen: 'manual', anulado: false, ...extra,
  })
  const manuales = [
    m(28, 'compra', 'Almacén semanal', 6800, { proveedor_id: proveedores[0] }), m(26, 'compra', 'Carne', 9400, { proveedor_id: proveedores[1] }),
    m(21, 'compra', 'Almacén semanal', 7100, { proveedor_id: proveedores[0] }), m(19, 'compra', 'Verdura', 2300, { proveedor_id: proveedores[2] }),
    m(14, 'compra', 'Carne', 8800, { proveedor_id: proveedores[1] }), m(12, 'gasto_fijo', 'Garrafa', 1450, { subcategoria: 'Gas' }),
    m(7, 'compra', 'Almacén semanal', 6500, { proveedor_id: proveedores[0] }), m(1, 'gasto_fijo', 'Sueldo ayudante', 18000, { subcategoria: 'Sueldos' }),
    m(1, 'venta_contado', 'Ventas del día', 4200), m(0, 'compra', 'Verdura', 1900, { proveedor_id: proveedores[2] }),
  ].filter((x) => x.fecha <= hoy)
  return [...cobros, ...manuales]
}

/**
 * Alumnos con consumos de menú en los días pasados del menú y algunos pagos: hay
 * cuentas al día, con deuda, con pagos parciales y una con saldo a favor.
 */
function cuentasDemo(menu: DiaMenu[], recetas: Receta[], uid: (t: string) => string) {
  const nombres: [string, string | null, string | null][] = [
    ['Juan Pérez', 'Marta Rodríguez', '099 123 456'], ['Sofía González', 'Laura Méndez', '098 222 333'],
    ['Mateo Fernández', 'Diego Fernández', '094 555 666'], ['Valentina López', null, null],
    ['Benjamín Silva', 'Ana Silva', '091 777 888'], ['Martina Pereira', 'Carlos Pereira', '099 404 404'],
    ['Lucas Martínez', 'Paula Díaz', '092 121 212'], ['Emma Sosa', 'Rosa Sosa', null],
  ]
  const alumnos: Alumno[] = nombres.map(([nombre, responsable_nombre, responsable_telefono]) => ({
    id: uid('alumno'), nombre, responsable_nombre, responsable_telefono, lista_id: null, activo: true, notas: null,
  }))
  const hoy = hace(0)
  const movimientos: Movimiento[] = []
  const pasados = menu.filter((d) => d.fecha < hoy && !d.sin_cocina).slice(-15)
  const nombreReceta = new Map(recetas.map((r) => [r.id, r.nombre]))
  const base = { cantidad: 1, medio_pago: null, anulado: false, anulado_motivo: null }
  alumnos.forEach((a, i) => {
    pasados.forEach((d, j) => {
      if ((i + j) % (i % 3 === 0 ? 2 : 3) === 0) return  // no todos comen todos los días
      const plato = d.plato_receta_id ? nombreReceta.get(d.plato_receta_id) : d.plato_texto
      movimientos.push({ ...base, id: uid('mov'), alumno_id: a.id, fecha: d.fecha, tipo: 'cargo', concepto: plato ? `Menú: ${plato}` : 'Menú del día',
        importe_cent: 26000, cargado_at: `${d.fecha}T12:${String(10 + i).padStart(2, '0')}:00Z` })
      if (j % 4 === i % 4) movimientos.push({ ...base, id: uid('mov'), alumno_id: a.id, fecha: d.fecha, tipo: 'cargo', concepto: 'Alfajor',
        importe_cent: 6000, cargado_at: `${d.fecha}T15:00:00Z` })
    })
    const cargos = movimientos.filter((m) => m.alumno_id === a.id).reduce((s, m) => s + m.importe_cent, 0)
    const pago = [cargos, Math.round(cargos * 0.6 / 1000) * 1000, 0, cargos + 50000, Math.round(cargos / 2000) * 1000, 0, cargos, 100000][i]
    const fecha = pasados[Math.min(pasados.length - 1, 10)]?.fecha ?? hoy
    if (pago > 0) movimientos.push({ ...base, id: uid('mov'), alumno_id: a.id, fecha, tipo: 'pago', concepto: 'Pago', importe_cent: pago, cargado_at: `${fecha}T18:00:00Z` })
  })
  return { alumnos, movimientos }
}

/** Mes anterior completo y el actual hasta una semana después de hoy. */
function menuDemo(platos: string[], postres: (string | null)[]): DiaMenu[] {
  const hoy = hace(0)
  const mes = hoy.slice(0, 7)
  const hasta = proximosHabiles(hoy, 5).at(-1)!
  const fechas = [...habilesMes(mesMas(mes, -1)), ...habilesMes(mes).filter((f) => f <= hasta)]
  const vacio = { plato_receta_id: null, plato_texto: null, postre_receta_id: null, postre_texto: null, pedidos: null, sin_cocina: false, motivo: null }
  return fechas.map((fecha, i): DiaMenu => {
    if (i === 6) return { ...vacio, fecha, sin_cocina: true, motivo: 'Paro' }
    if (fecha.slice(0, 7) === mes && fecha > hoy && i % 7 === 3) return { ...vacio, fecha, sin_cocina: true, motivo: 'Feriado' }
    if (i % 9 === 4) return { ...vacio, fecha, plato_texto: 'Guiso de lentejas', postre_receta_id: postres[1], pedidos: 55 }
    return { ...vacio, fecha, plato_receta_id: platos[i % platos.length], postre_receta_id: postres[i % postres.length], pedidos: i % 3 === 0 ? 58 + (i % 5) : null }
  })
}
