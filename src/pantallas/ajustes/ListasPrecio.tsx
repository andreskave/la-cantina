import { useCantina } from '../../sesion/Sesion'
import { useState } from 'react'
import { useBorrarLista, useFijarPrecioMenuLista, useGuardarLista, useListas, useProductosVenta } from '../../datos/consultas'
import { BotonBorrar, Campo, CampoNumero, centATexto, pesosACent, textoNumero } from '../../componentes/Controles'
import { Hoja } from '../../componentes/Hoja'
import { useToast } from '../../componentes/Toast'
import { AvisoSinConexion, useEnLinea } from '../../offline/Conexion'
import { parseNumeroUY } from '../../lib/cargaRapida'
import { numero, pesos } from '../../lib/formato'
import { mensajeError } from '../../lib/errores'
import type { ListaPrecio } from '../../datos/tipos'

/** Módulo listas_precio: cada lista con su precio de menú y su factor de porción. */
export function ListasPrecio() {
  const { dic } = useCantina()
  const listas = useListas()
  const productos = useProductosVenta()
  const [editando, setEditando] = useState<{ l: ListaPrecio | null } | null>(null)
  const menu = productos.data?.find((p) => p.tipo === 'menu')

  return (
    <section className="card stack">
      <div className="spread">
        <h3>Listas de precio</h3>
        <button className="btn ghost sm" onClick={() => setEditando({ l: null })}>+ Agregar</button>
      </div>
      <p className="hint">
        Cada lista tiene su precio del menú y un factor de porción: por ejemplo "Grandes" con 1,3 lleva porciones 30% más
        grandes (en el costo y en la lista de compras). A cada {dic.t('alumno')} le asignás su lista.
      </p>
      <div className="list">
        {(listas.data ?? []).map((l) => (
          <button className="li" key={l.id} onClick={() => setEditando({ l })}>
            <div className="main"><b>{l.nombre}</b><span className="small muted">Porción × {numero(l.factor_porcion)}{l.es_default ? ' · la de todos los que no tienen otra' : ''}</span></div>
            <div className="side num">{pesos(menu?.precios_lista?.[l.id] ?? null)}</div>
          </button>
        ))}
      </div>
      {editando && <EditorLista lista={editando.l} precioActual={editando.l ? menu?.precios_lista?.[editando.l.id] ?? null : null} onCerrar={() => setEditando(null)} />}
    </section>
  )
}

function EditorLista({ lista, precioActual, onCerrar }: { lista: ListaPrecio | null; precioActual: number | null; onCerrar: () => void }) {
  const { dic } = useCantina()
  const toast = useToast()
  const enLinea = useEnLinea()
  const guardar = useGuardarLista()
  const borrar = useBorrarLista()
  const fijarPrecio = useFijarPrecioMenuLista()
  const [nombre, setNombre] = useState(lista?.nombre ?? '')
  const [factor, setFactor] = useState(textoNumero(lista?.factor_porcion ?? 1))
  const [precio, setPrecio] = useState(centATexto(precioActual))
  const [error, setError] = useState<string | null>(null)

  async function onGuardar() {
    const f = parseNumeroUY(factor)
    const p = precio.trim() ? pesosACent(precio) : null
    if (!nombre.trim()) return setError('Poné un nombre a la lista.')
    if (!(f > 0 && f <= 5)) return setError('El factor de porción tiene que estar entre 0 y 5 (1 = porción normal).')
    if (p !== null && !(p > 0)) return setError('Revisá el precio del menú.')
    try {
      const id = await guardar.mutateAsync({ id: lista?.id, nombre, factor_porcion: f })
      if (p !== null && p !== precioActual) await fijarPrecio.mutateAsync({ lista: id, precio_cent: p })
      toast('Lista guardada')
      onCerrar()
    } catch (e) { setError(mensajeError(e)) }
  }
  async function onBorrar() {
    try {
      await borrar.mutateAsync(lista!.id)
      toast(`Lista borrada: sus ${dic.t('alumnos')} pasan a la General`)
      onCerrar()
    } catch (e) { setError(mensajeError(e)) }
  }

  const ocupado = guardar.isPending || fijarPrecio.isPending || borrar.isPending
  return (
    <Hoja titulo={lista ? 'Editar lista' : 'Nueva lista'} onCerrar={onCerrar} pie={
      <>
        {lista && !lista.es_default && <BotonBorrar onBorrar={onBorrar} disabled={ocupado || !enLinea} />}
        <button className="btn" onClick={onGuardar} disabled={ocupado || !enLinea}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
      </>
    }>
      <Campo etiqueta="Nombre" htmlFor="ln"><input id="ln" className="inp" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Grandes" /></Campo>
      <Campo etiqueta="Factor de porción" htmlFor="lf" ayuda="1 = porción normal. 1,3 = 30% más grande. Se usa para el costo y la lista de compras.">
        <CampoNumero id="lf" valor={factor} onCambio={(t) => setFactor(t)} style={{ width: 110 }} />
      </Campo>
      <Campo etiqueta={`Precio del ${dic.t('menu')} en esta lista`} htmlFor="lp" ayuda="Rige desde hoy. Los productos sin precio propio en esta lista se cobran al precio de la General.">
        <CampoNumero id="lp" valor={precio} onCambio={(t) => setPrecio(t)} placeholder="$" />
      </Campo>
      <AvisoSinConexion que="guardar listas de precio" />
      {error && <p className="error" role="alert">{error}</p>}
    </Hoja>
  )
}
