import { Hoja } from '../../componentes/Hoja'
import { useCantina } from '../../sesion/Sesion'
import { useInsumos, useRecetas } from '../../datos/consultas'
import { TIPO_RECETA_TXT } from '../../lib/catalogo'
import { cantidadLegible, equivalencia } from '../../lib/costeo'
import { numero } from '../../lib/formato'
import type { Receta } from '../../datos/tipos'

/** Receta en solo lectura y sin dinero (ayudante). */
export function VistaReceta({ receta: r, onCerrar }: { receta: Receta; onCerrar: () => void }) {
  const { cantina } = useCantina()
  const insumos = useInsumos()
  const recetas = useRecetas()
  const nombre = (i: Receta['ingredientes'][number]) =>
    i.insumo_id ? insumos.data?.find((x) => x.id === i.insumo_id)?.nombre ?? '—' : recetas.data?.find((x) => x.id === i.preparacion_id)?.nombre ?? '—'
  const porciones = r.modo === 'olla' ? r.porciones ?? 1 : cantina.pedidos_por_defecto || 60

  return (
    <Hoja titulo={r.nombre} onCerrar={onCerrar}>
      <p className="muted">
        {TIPO_RECETA_TXT[r.tipo].uno} · {r.tipo === 'preparacion'
          ? (r.rinde_cantidad && r.rinde_unidad ? `la olla rinde ${numero(r.rinde_cantidad)} ${r.rinde_unidad}` : 'sin rinde cargado')
          : r.modo === 'olla' ? `cantidades para una olla de ${r.porciones} porciones` : 'cantidades para 1 porción'}
      </p>
      <section className="card">
        <div className="list">
          {r.ingredientes.map((i, n) => (
            <div className="li" key={n}>
              <div className="main">
                <b>{nombre(i)}</b>
                {r.tipo !== 'preparacion' && <span className="small muted">{equivalencia(i, r.modo ?? 'porcion', porciones)}</span>}
              </div>
              <div className="side num">{cantidadLegible(i.cantidad, i.unidad)}</div>
            </div>
          ))}
          {r.ingredientes.length === 0 && <p className="muted">Sin ingredientes cargados.</p>}
        </div>
      </section>
    </Hoja>
  )
}
