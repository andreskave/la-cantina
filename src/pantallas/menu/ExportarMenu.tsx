import { useEffect, useState } from 'react'
import { useCantina } from '../../sesion/Sesion'
import { Hoja } from '../../componentes/Hoja'
import { useToast } from '../../componentes/Toast'
import { excelMenu, nombreArchivoMenu } from '../../lib/exportarMenu'
import { imagenMenu } from '../../lib/imagenMenu'
import { compartir, descargar, puedeCompartir } from '../../lib/descargar'
import { mesNombre } from '../../lib/formato'
import type { EstadoDia } from '../../lib/menu'

export function ExportarMenu({ mes, estados, precioDe, onCerrar }: {
  mes: string
  estados: Map<string, EstadoDia>
  precioDe: (fecha: string) => number | null
  onCerrar: () => void
}) {
  const { cantina, puede } = useCantina()
  const toast = useToast()
  const [imagen, setImagen] = useState<{ blob: Blob; url: string } | null>(null)
  const [errorImg, setErrorImg] = useState(false)
  const [armando, setArmando] = useState<'familias' | 'interno' | null>(null)
  const nombrePng = nombreArchivoMenu(mes, 'png')

  useEffect(() => {
    let url: string | null = null
    let cancelado = false
    imagenMenu(mes, cantina.nombre, estados)
      .then((blob) => {
        if (cancelado) return
        url = URL.createObjectURL(blob)
        setImagen({ blob, url })
      })
      .catch(() => !cancelado && setErrorImg(true))
    return () => { cancelado = true; if (url) URL.revokeObjectURL(url) }
  }, [mes, cantina.nombre, estados])

  async function bajarExcel(tipo: 'familias' | 'interno') {
    setArmando(tipo)
    try {
      const XLSX = await import('xlsx')
      const wb = excelMenu(XLSX, {
        mes, cantina: cantina.nombre, estados, interno: tipo === 'interno', precioDe, pedidosDefault: cantina.pedidos_por_defecto,
      })
      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
      descargar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nombreArchivoMenu(mes, 'xlsx', tipo === 'interno'))
      toast('Excel descargado')
    } catch {
      toast('No se pudo armar el Excel. Revisá la conexión y probá de nuevo.')
    } finally {
      setArmando(null)
    }
  }

  return (
    <Hoja titulo="Exportar menú" onCerrar={onCerrar}>
      <section className="stack">
        <p className="eyebrow">Imagen para las familias</p>
        {imagen ? (
          <>
            <img className="shareimg" src={imagen.url} alt={`Menú de ${mesNombre(mes)}`} />
            <div className="row wrap-r">
              <button className="btn" onClick={() => descargar(imagen.blob, nombrePng)}>Guardar imagen</button>
              {puedeCompartir(imagen.blob, nombrePng) && (
                <button className="btn ghost" onClick={() => void compartir(imagen.blob, nombrePng, `Menú de ${mesNombre(mes)}`)}>Compartir</button>
              )}
            </div>
            <p className="hint">Sin precios. En el celular también podés mantener apretada la imagen para guardarla.</p>
          </>
        ) : errorImg ? <p className="error">No se pudo armar la imagen. Probá de nuevo.</p> : <p className="muted">Armando la imagen…</p>}
      </section>

      <section className="stack">
        <p className="eyebrow">Excel</p>
        <button className="btn ghost" onClick={() => void bajarExcel('familias')} disabled={armando !== null}>
          <span style={{ display: 'block' }}>{armando === 'familias' ? 'Armando…' : 'Excel para las familias'}</span>
          <span className="small muted" style={{ fontWeight: 400 }}>Hojas Calendario y Lista · sin precios ni costos</span>
        </button>
        {puede('ver_costos') && (
          <button className="btn ghost" onClick={() => void bajarExcel('interno')} disabled={armando !== null}>
            <span style={{ display: 'block' }}>{armando === 'interno' ? 'Armando…' : 'Excel interno'}</span>
            <span className="small muted" style={{ fontWeight: 400 }}>Con menús pedidos, costos y ganancia de cada día</span>
          </button>
        )}
      </section>
    </Hoja>
  )
}
