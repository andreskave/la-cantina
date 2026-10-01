import { describe, expect, it } from 'vitest'
import { MODULOS_DEFAULT, leerModulos, pestanasVisibles, puede, type Accion } from './permisos'

describe('pestañas por rol', () => {
  it('Dueña y Admin ven Caja si el módulo está encendido', () => {
    expect(pestanasVisibles('duena', MODULOS_DEFAULT)).toEqual(['hoy', 'menu', 'recetas', 'insumos', 'compras', 'cuentas', 'caja'])
    expect(pestanasVisibles('admin', MODULOS_DEFAULT)).toContain('caja')
  })
  it('con caja apagada nadie ve la pestaña', () => {
    const m = { ...MODULOS_DEFAULT, caja: false }
    expect(pestanasVisibles('duena', m)).not.toContain('caja')
    expect(pestanasVisibles('admin', m)).not.toContain('caja')
  })
  it('el ayudante nunca ve Caja', () => {
    expect(pestanasVisibles('ayudante', MODULOS_DEFAULT)).toEqual(['hoy', 'menu', 'recetas', 'insumos', 'compras', 'cuentas'])
  })
})

describe('acciones', () => {
  it('el ayudante solo anota consumos de menú y productos', () => {
    const no: Accion[] = ['ver_costos', 'ver_caja', 'ver_ajustes', 'registrar_pago', 'consumo_otro', 'anular_movimiento', 'editar_catalogo', 'admin_modulos']
    for (const a of no) expect(puede('ayudante', a), a).toBe(false)
    expect(puede('ayudante', 'anotar_consumo')).toBe(true)
  })
  it('la Dueña no administra usuarios ni módulos', () => {
    expect(puede('duena', 'registrar_pago')).toBe(true)
    expect(puede('duena', 'ver_costos')).toBe(true)
    expect(puede('duena', 'admin_usuarios')).toBe(false)
    expect(puede('duena', 'admin_modulos')).toBe(false)
    expect(puede('duena', 'borrado_general')).toBe(false)
  })
  it('el Administrador puede todo', () => {
    expect(puede('admin', 'borrado_general')).toBe(true)
    expect(puede('admin', 'registrar_pago')).toBe(true)
  })
})

describe('leerModulos', () => {
  it('completa claves faltantes con los valores por defecto', () => {
    expect(leerModulos({ cierre_dia: true })).toEqual({ ...MODULOS_DEFAULT, cierre_dia: true })
    expect(leerModulos(null)).toEqual(MODULOS_DEFAULT)
    expect(leerModulos({ caja: 'no' })).toEqual(MODULOS_DEFAULT)
  })
})
