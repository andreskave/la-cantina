import { describe, expect, it } from 'vitest'
import { crearDiccionario } from './terminos'

describe('diccionario de términos', () => {
  it('sin el módulo usa los términos de cantina aunque haya renombres guardados', () => {
    const d = crearDiccionario({ terminos: false }, { alumno: 'cliente' })
    expect(d.t('alumno')).toBe('alumno')
    expect(d.T('menu_del_dia')).toBe('Menú del día')
  })
  it('con el módulo aplica los renombres', () => {
    const d = crearDiccionario({ terminos: true }, { alumno: 'cliente', alumnos: 'clientes', menu_del_dia: 'plato del día' })
    expect(d.T('alumnos')).toBe('Clientes')
    expect(d.t('menu_del_dia')).toBe('plato del día')
    expect(d.t('postre')).toBe('postre')
  })
  it('ignora claves desconocidas y textos vacíos', () => {
    const d = crearDiccionario({ terminos: true }, { alumno: '  ', inventado: 'x' })
    expect(d.t('alumno')).toBe('alumno')
  })
})
