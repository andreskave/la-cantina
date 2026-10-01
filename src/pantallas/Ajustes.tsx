import { useState } from 'react'
import { useCantina, useSesion } from '../sesion/Sesion'
import { ListasPrecio } from './ajustes/ListasPrecio'
import { SeccionCantinas, SeccionModulos, SeccionTerminos, SeccionUsuarios } from './ajustes/Admin'
import { SeccionDatos } from './ajustes/Datos'
import { parseNumeroUY } from '../lib/cargaRapida'
import { mensajeError } from '../lib/errores'
import { useActualizarCantina, useBorrarProveedor, useFijarPrecioMenu, useGuardarProveedor, usePrecioMenu, useProveedores } from '../datos/consultas'
import { BotonBorrar, Campo, CampoNumero, centATexto, pesosACent } from '../componentes/Controles'
import { Hoja } from '../componentes/Hoja'
import { useToast } from '../componentes/Toast'
import { Vacio } from '../componentes/Vacio'
import type { Proveedor } from '../datos/tipos'
import { AvisoSinConexion, useEnLinea } from '../offline/Conexion'

export function Ajustes() {
  const { puede, modulos } = useCantina()
  const admin = puede('admin_modulos')
  return (
    <>
      <h2>Ajustes</h2>
      <DatosCantina />
      {modulos.listas_precio && <ListasPrecio />}
      <Proveedores />
      {admin && (
        <>
          <h2 style={{ marginTop: 12 }}>Administrador</h2>
          <SeccionCantinas />
          <SeccionUsuarios />
          <SeccionModulos />
          {modulos.terminos && <SeccionTerminos />}
        </>
      )}
      <SeccionDatos />
    </>
  )
}

function DatosCantina() {
  const { cantina, modulos, dic } = useCantina()
  const { recargar } = useSesion()
  const toast = useToast()
  const enLinea = useEnLinea()
  const precioMenu = usePrecioMenu()
  const actualizar = useActualizarCantina()
  const fijarPrecio = useFijarPrecioMenu()
  const [nombre, setNombre] = useState(cantina.nombre)
  const [precio, setPrecio] = useState<string | null>(null)
  const [pedidos, setPedidos] = useState(cantina.pedidos_por_defecto ? String(cantina.pedidos_por_defecto) : '')
  const [objetivo, setObjetivo] = useState(String(cantina.objetivo_costo_pct))
  const [error, setError] = useState<string | null>(null)
  const precioTxt = precio ?? centATexto(precioMenu)

  async function onGuardar() {
    setError(null)
    const nPedidos = pedidos.trim() ? Math.round(parseNumeroUY(pedidos)) : 0
    const nObjetivo = parseNumeroUY(objetivo)
    const nPrecio = precioTxt.trim() ? pesosACent(precioTxt) : null
    if (!nombre.trim()) return setError('Poné el nombre de la cantina.')
    if (!(nPedidos >= 0)) return setError('Revisá los menús por defecto.')
    if (!(nObjetivo > 0 && nObjetivo <= 100)) return setError('El objetivo de costo tiene que estar entre 1 y 100%.')
    if (nPrecio !== null && !(nPrecio > 0)) return setError('Revisá el precio del menú.')
    try {
      await actualizar.mutateAsync({ nombre: nombre.trim(), pedidos_por_defecto: nPedidos, objetivo_costo_pct: nObjetivo })
      if (nPrecio !== null && nPrecio !== precioMenu) await fijarPrecio.mutateAsync(nPrecio)
      await recargar()
      toast('Ajustes guardados')
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  return (
    <section className="card stack">
      <h3>Tu cantina</h3>
      <Campo etiqueta="Nombre de la cantina" htmlFor="cn">
        <input id="cn" className="inp" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </Campo>
      {!modulos.listas_precio && (
        <Campo etiqueta={`Precio del ${dic.t('menu_del_dia')}`} htmlFor="cp" ayuda="Plato + postre. Si lo cambiás, rige desde hoy: los días anteriores mantienen el precio que tenían.">
        <CampoNumero id="cp" valor={precioTxt} onCambio={(t) => setPrecio(t)} placeholder="$" />
      </Campo>
      )}
      <Campo etiqueta="Menús pedidos en un día normal" htmlFor="cq" ayuda="Si un día no cargás los pedidos, la lista de compras usa este número.">
        <CampoNumero id="cq" valor={pedidos} onCambio={(t) => setPedidos(t)} inputMode="numeric" />
      </Campo>
      <Campo etiqueta="Objetivo de costo (%)" htmlFor="co" ayuda="Qué parte del precio querés que se vaya en materia prima. En gastronomía se suele apuntar a 30–35%.">
        <CampoNumero id="co" valor={objetivo} onCambio={(t) => setObjetivo(t)} inputMode="numeric" />
      </Campo>
      <AvisoSinConexion que="guardar ajustes" />
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn" onClick={onGuardar} disabled={actualizar.isPending || fijarPrecio.isPending || !enLinea}>
        {actualizar.isPending || fijarPrecio.isPending ? 'Guardando…' : 'Guardar'}
      </button>
    </section>
  )
}

function Proveedores() {
  const proveedores = useProveedores()
  const [editando, setEditando] = useState<{ p: Proveedor | null } | null>(null)
  return (
    <section className="card stack">
      <div className="spread">
        <h3>Proveedores</h3>
        <button className="btn ghost sm" onClick={() => setEditando({ p: null })}>+ Agregar</button>
      </div>
      {proveedores.isPending ? <p className="muted">Cargando…</p>
        : (proveedores.data ?? []).length === 0 ? (
          <Vacio><p>Agregá a quién le comprás para agrupar la lista de compras y los precios por proveedor.</p></Vacio>
        ) : (
          <div className="list">
            {proveedores.data!.map((p) => (
              <button className="li" key={p.id} onClick={() => setEditando({ p })}>
                <div className="main"><b>{p.nombre}</b>{p.telefono && <span className="small muted num">{p.telefono}</span>}</div>
              </button>
            ))}
          </div>
        )}
      {editando && <EditorProveedor proveedor={editando.p} onCerrar={() => setEditando(null)} />}
    </section>
  )
}

function EditorProveedor({ proveedor, onCerrar }: { proveedor: Proveedor | null; onCerrar: () => void }) {
  const toast = useToast()
  const enLinea = useEnLinea()
  const guardar = useGuardarProveedor()
  const borrar = useBorrarProveedor()
  const [nombre, setNombre] = useState(proveedor?.nombre ?? '')
  const [telefono, setTelefono] = useState(proveedor?.telefono ?? '')
  const [notas, setNotas] = useState(proveedor?.notas ?? '')
  const [error, setError] = useState<string | null>(null)

  async function onGuardar() {
    if (!nombre.trim()) return setError('Poné el nombre del proveedor.')
    try {
      await guardar.mutateAsync({ id: proveedor?.id, nombre, telefono: telefono.trim() || null, notas: notas.trim() || null })
      toast('Proveedor guardado')
      onCerrar()
    } catch (e) { setError(mensajeError(e)) }
  }
  async function onBorrar() {
    try {
      await borrar.mutateAsync(proveedor!.id)
      toast('Proveedor borrado')
      onCerrar()
    } catch (e) { setError(mensajeError(e)) }
  }

  return (
    <Hoja titulo={proveedor ? 'Editar proveedor' : 'Nuevo proveedor'} onCerrar={onCerrar} pie={
      <>
        {proveedor && <BotonBorrar onBorrar={onBorrar} disabled={borrar.isPending || !enLinea} />}
        <button className="btn" onClick={onGuardar} disabled={guardar.isPending || !enLinea}>{guardar.isPending ? 'Guardando…' : 'Guardar'}</button>
      </>
    }>
      <Campo etiqueta="Nombre" htmlFor="pn"><input id="pn" className="inp" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Almacén Don José" /></Campo>
      <Campo etiqueta="Teléfono (opcional)" htmlFor="pt"><input id="pt" className="inp" type="tel" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} /></Campo>
      <Campo etiqueta="Notas (opcional)" htmlFor="pno"><input id="pno" className="inp" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej: reparte martes y jueves" /></Campo>
      {proveedor && <p className="hint">Si lo borrás, sus insumos quedan sin proveedor.</p>}
      <AvisoSinConexion que="guardar ajustes" />
      {error && <p className="error" role="alert">{error}</p>}
    </Hoja>
  )
}
