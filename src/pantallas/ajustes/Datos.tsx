import { useState } from 'react'
import { useCantina, useSesion } from '../../sesion/Sesion'
import { useApi, useBorrarCantina, useVaciarCantina } from '../../datos/consultas'
import { excelRespaldo, nombreRespaldo } from '../../lib/exportarTodo'
import { descargar } from '../../lib/descargar'
import { hoyISO } from '../../lib/formato'
import { mensajeError } from '../../lib/errores'
import { BotonBorrar } from '../../componentes/Controles'
import { useToast } from '../../componentes/Toast'
import { AvisoSinConexion, useEnLinea } from '../../offline/Conexion'

export function SeccionDatos() {
  const { cantina, puede } = useCantina()
  const { recargar, elegirCantina } = useSesion()
  const api = useApi()
  const toast = useToast()
  const enLinea = useEnLinea()
  const vaciar = useVaciarCantina()
  const borrar = useBorrarCantina()
  const [armando, setArmando] = useState(false)
  const [confirmacion, setConfirmacion] = useState('')
  const coincide = confirmacion.trim().toLowerCase() === cantina.nombre.trim().toLowerCase()

  async function exportarTodo() {
    setArmando(true)
    try {
      const c = cantina.id
      const [XLSX, proveedores, insumos, preciosVigentes, historialPrecios, recetas, menu, alumnos, movimientos, caja] = await Promise.all([
        import('xlsx'), api.proveedores(c), api.insumos(c), api.preciosVigentes(c), api.historialPreciosCantina(c), api.recetas(c),
        api.menuDias(c, '2000-01-01', '2999-12-31'), api.alumnos(c), api.movimientosCantina(c), api.cajaMovimientos(c, '2000-01-01', '2999-12-31'),
      ])
      const wb = excelRespaldo(XLSX, { cantina: cantina.nombre, proveedores, insumos, preciosVigentes, historialPrecios, recetas, menu, alumnos, movimientos, caja })
      descargar(new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })]), nombreRespaldo(cantina.nombre, hoyISO()))
      toast('Respaldo descargado')
    } catch (e) {
      toast(mensajeError(e))
    } finally {
      setArmando(false)
    }
  }

  async function onVaciar() {
    try {
      await vaciar.mutateAsync(undefined)
      setConfirmacion('')
      toast('Se borraron todos los datos de la cantina')
    } catch (e) { toast(mensajeError(e)) }
  }
  async function onBorrar() {
    try {
      await borrar.mutateAsync(undefined)
      elegirCantina(null)
      await recargar()
      toast('Cantina borrada')
    } catch (e) { toast(mensajeError(e)) }
  }

  return (
    <>
      <section className="card stack">
        <h3>Respaldo</h3>
        <p className="hint">Un Excel con todo: insumos y sus precios, historial, recetas, ingredientes, menú, alumnos, movimientos de cuentas y caja.</p>
        <button className="btn ghost" onClick={() => void exportarTodo()} disabled={armando || !enLinea}>{armando ? 'Armando…' : 'Exportar todo'}</button>
        <AvisoSinConexion que="exportar todo" />
      </section>

      {puede('borrado_general') && (
        <section className="card stack" style={{ borderColor: 'var(--warn)' }}>
          <h3>Borrar datos</h3>
          <p className="small">
            <b>Vaciar datos</b> borra insumos, recetas, menú, alumnos, movimientos y caja, y deja la cantina con sus usuarios,
            módulos y listas. <b>Borrar cantina</b> la elimina entera. No se puede deshacer: hacé antes "Exportar todo".
          </p>
          <div className="field">
            <label htmlFor="conf">Para confirmar, escribí el nombre de la cantina: <b>{cantina.nombre}</b></label>
            <input id="conf" className="inp" value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} autoComplete="off" />
          </div>
          <div className="grid2">
            <BotonBorrar texto="Vaciar datos" onBorrar={() => void onVaciar()} disabled={!coincide || vaciar.isPending || !enLinea} />
            <BotonBorrar texto="Borrar cantina" onBorrar={() => void onBorrar()} disabled={!coincide || borrar.isPending || !enLinea} />
          </div>
        </section>
      )}
    </>
  )
}
