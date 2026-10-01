import { useMemo, useState } from 'react'
import { Hoja } from '../../componentes/Hoja'
import { useToast } from '../../componentes/Toast'
import { useInsertarDias, useMenuRango } from '../../datos/consultas'
import { habilesMes, mesMas, primerDia, ultimoDia } from '../../lib/fechas'
import { mesNombre } from '../../lib/formato'
import { copiarMesAnterior } from '../../lib/menu'
import { mensajeError } from '../../lib/errores'
import { AvisoSinConexion, useEnLinea } from '../../offline/Conexion'

export function CopiarMes({ mes, onCerrar }: { mes: string; onCerrar: () => void }) {
  const toast = useToast()
  const enLinea = useEnLinea()
  const anterior = mesMas(mes, -1)
  const menu = useMenuRango(primerDia(anterior), ultimoDia(mes))
  const insertar = useInsertarDias()
  const [error, setError] = useState<string | null>(null)

  const { copia, origen, vacios } = useMemo(() => {
    const dias = menu.data ?? []
    const porFecha = new Set(dias.map((d) => d.fecha))
    return {
      copia: copiarMesAnterior(mes, dias),
      origen: dias.filter((d) => d.fecha.startsWith(anterior) && !d.sin_cocina
        && (d.plato_receta_id || d.plato_texto || d.postre_receta_id || d.postre_texto)).length,
      vacios: habilesMes(mes).filter((f) => !porFecha.has(f)).length,
    }
  }, [menu.data, mes, anterior])

  async function onCopiar() {
    try {
      const n = await insertar.mutateAsync(copia)
      toast(`Se copiaron ${n} día${n === 1 ? '' : 's'}`)
      onCerrar()
    } catch (e) { setError(mensajeError(e)) }
  }

  return (
    <Hoja titulo="Copiar mes anterior" onCerrar={onCerrar} pie={
      <>
        <button className="btn ghost" onClick={onCerrar}>Cancelar</button>
        <button className="btn" onClick={onCopiar} disabled={menu.isPending || !copia.length || insertar.isPending || !enLinea}>
          {insertar.isPending ? 'Copiando…' : copia.length ? `Copiar ${copia.length} día${copia.length > 1 ? 's' : ''}` : 'Copiar'}
        </button>
      </>
    }>
      {menu.isPending ? <p className="muted">Mirando los dos meses…</p> : (
        <>
          <p>
            Se copian los <b>{origen}</b> días con menú de <b>{mesNombre(anterior)}</b>, en el mismo orden, a los <b>{vacios}</b> días
            vacíos de <b>{mesNombre(mes)}</b>.
          </p>
          {origen > vacios && vacios > 0 && <p className="small muted">Como hay menos días vacíos, se copian los primeros {vacios}.</p>}
          {!origen && <p className="warnbox">{mesNombre(anterior)} no tiene días con menú para copiar.</p>}
          {origen > 0 && !vacios && <p className="warnbox">{mesNombre(mes)} ya tiene todos los días cargados.</p>}
          <p className="hint">Los días que ya cargaste no se tocan (tampoco feriados ni días sin cocina). Los menús pedidos no se copian.</p>
        </>
      )}
      <AvisoSinConexion que="copiar el menú" />
      {error && <p className="error" role="alert">{error}</p>}
    </Hoja>
  )
}
