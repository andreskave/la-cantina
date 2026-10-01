import { useEffect, useMemo, useState } from 'react'
import { useCantina } from '../../sesion/Sesion'
import { Hoja } from '../../componentes/Hoja'
import { useToast } from '../../componentes/Toast'
import { estadoCuenta, nombreEstadoCuenta } from '../../lib/cuentas'
import { imagenEstadoCuenta } from '../../lib/imagenEstadoCuenta'
import { pdfEstadoCuenta } from '../../lib/exportarCuentas'
import { compartir, descargar, puedeCompartir } from '../../lib/descargar'
import { hoyISO, pesos } from '../../lib/formato'
import type { Alumno, PartidaAbierta } from '../../datos/tipos'
import { copiarTexto } from './FichaAlumno'

export function HojaEstadoCuenta({ alumno, saldo, partidas, onCerrar }: {
  alumno: Alumno
  saldo: number
  partidas: PartidaAbierta[]
  onCerrar: () => void
}) {
  const { cantina, dic } = useCantina()
  const toast = useToast()
  const hoy = hoyISO()
  const datos = useMemo(() => estadoCuenta({
    cantina: cantina.nombre, alumno: alumno.nombre, etiqueta_alumno: dic.T('alumno'), responsable: alumno.responsable_nombre, emision: hoy, saldo_cent: saldo,
    partidas,
  }), [cantina.nombre, alumno, hoy, saldo, partidas, dic])
  const [img, setImg] = useState<{ blob: Blob; url: string } | null>(null)
  const [armandoPdf, setArmandoPdf] = useState(false)
  const nombrePng = nombreEstadoCuenta(alumno.nombre, hoy, 'png')

  useEffect(() => {
    let url: string | null = null
    let cancelado = false
    imagenEstadoCuenta(datos).then((blob) => {
      if (cancelado) return
      url = URL.createObjectURL(blob)
      setImg({ blob, url })
    }).catch(() => toast('No se pudo armar la imagen.'))
    return () => { cancelado = true; if (url) URL.revokeObjectURL(url) }
  }, [datos, toast])

  async function bajarPdf() {
    setArmandoPdf(true)
    try {
      const { jsPDF } = await import('jspdf')
      descargar(pdfEstadoCuenta(jsPDF, datos).output('blob'), nombreEstadoCuenta(alumno.nombre, hoy, 'pdf'))
      toast('PDF descargado')
    } catch {
      toast('No se pudo armar el PDF. Probá de nuevo.')
    } finally {
      setArmandoPdf(false)
    }
  }

  return (
    <Hoja titulo="Estado de cuenta" onCerrar={onCerrar}>
      <p className="small muted">
        {datos.total_cent > 0 ? `Total a pagar: ${pesos(datos.total_cent)}` : datos.aFavor_cent > 0 ? `Saldo a favor: ${pesos(datos.aFavor_cent)}` : 'Está al día.'}
        {' '}Muestra solo lo que falta pagar.
      </p>
      {img ? <img className="shareimg" src={img.url} alt={`Estado de cuenta de ${alumno.nombre}`} /> : <p className="muted">Armando la imagen…</p>}
      <div className="row wrap-r">
        <button className="btn" disabled={!img} onClick={() => img && descargar(img.blob, nombrePng)}>Guardar imagen</button>
        {img && puedeCompartir(img.blob, nombrePng) && (
          <button className="btn ghost" onClick={() => void compartir(img.blob, nombrePng, `Estado de cuenta de ${alumno.nombre}`)}>Compartir</button>
        )}
        <button className="btn ghost" onClick={() => void bajarPdf()} disabled={armandoPdf}>{armandoPdf ? 'Armando…' : 'PDF'}</button>
      </div>
      {alumno.responsable_telefono && (
        <div className="summary">
          <span className="small muted">Teléfono de {alumno.responsable_nombre ?? 'el responsable'}</span>
          <div className="spread">
            <b className="num">{alumno.responsable_telefono}</b>
            <button className="btn ghost sm" onClick={async () => toast(await copiarTexto(alumno.responsable_telefono!) ? 'Teléfono copiado' : 'No se pudo copiar')}>Copiar</button>
          </div>
        </div>
      )}
    </Hoja>
  )
}
