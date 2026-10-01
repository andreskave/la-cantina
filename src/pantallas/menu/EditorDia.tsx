import { useMemo, useState } from 'react'
import { useCantina } from '../../sesion/Sesion'
import { Hoja } from '../../componentes/Hoja'
import { BotonBorrar, Campo, CampoNumero, Chips } from '../../componentes/Controles'
import { useToast } from '../../componentes/Toast'
import {
  useGuardarPedidosPorLista, useListas, usePedidosPorLista, useProductosVenta,
  useBorrarDia, useCosteo, useFijarCostoCongelado, useGuardarDia, useHistorialPrecioMenu, useRecetas,
} from '../../datos/consultas'
import { MOTIVOS, congelarDia, estadoDia, precioEn, semaforo, type DiaMenu, type EstadoDia } from '../../lib/menu'
import { parseNumeroUY } from '../../lib/cargaRapida'
import { capitalizar, fechaLarga, hoyISO, numero, pesos } from '../../lib/formato'
import { mensajeError } from '../../lib/errores'
import { precioMenuDia } from '../../lib/precios'
import { AvisoSinConexion, useEnLinea } from '../../offline/Conexion'

type Motivo = (typeof MOTIVOS)[number] | 'Otro'
const esMotivoFijo = (m: string | null): m is (typeof MOTIVOS)[number] => (MOTIVOS as readonly string[]).includes(m ?? '')

/** Valor del select: "" (sin elegir), "r:<id>" (receta) o "txt" (escrito a mano). */
const selDe = (id: string | null, texto: string | null) => (id ? `r:${id}` : texto ? 'txt' : '')

export function EditorDia({ fecha, dia, estado, onCerrar }: {
  fecha: string
  dia: DiaMenu | undefined
  estado: EstadoDia | undefined
  onCerrar: () => void
}) {
  const { cantina, puede, modulos } = useCantina()
  const listas = useListas()
  const pedidosGuardados = usePedidosPorLista(fecha, fecha)
  const guardarPedidos = useGuardarPedidosPorLista()
  const productos = useProductosVenta()
  const verCostos = puede('ver_costos')
  const toast = useToast()
  const enLinea = useEnLinea()
  const recetas = useRecetas()
  const historialMenu = useHistorialPrecioMenu()
  const { costeo, insumosCosteo } = useCosteo()
  const guardar = useGuardarDia()
  const borrar = useBorrarDia()
  const congelar = useFijarCostoCongelado()

  const [sinCocina, setSinCocina] = useState(dia?.sin_cocina ?? false)
  const [motivo, setMotivo] = useState<Motivo>(dia?.sin_cocina ? (esMotivoFijo(dia.motivo) ? dia.motivo : 'Otro') : 'Feriado')
  const [motivoTexto, setMotivoTexto] = useState(dia?.sin_cocina && !esMotivoFijo(dia.motivo) ? dia.motivo ?? '' : '')
  const [platoSel, setPlatoSel] = useState(selDe(dia?.plato_receta_id ?? null, dia?.plato_texto ?? null))
  const [platoTxt, setPlatoTxt] = useState(dia?.plato_texto ?? '')
  const [postreSel, setPostreSel] = useState(selDe(dia?.postre_receta_id ?? null, dia?.postre_texto ?? null))
  const [postreTxt, setPostreTxt] = useState(dia?.postre_texto ?? '')
  const [pedidos, setPedidos] = useState(dia?.pedidos !== null && dia?.pedidos !== undefined ? String(dia.pedidos) : '')
  // Módulo listas_precio: pedidos por lista (null = todavía no se tocó: se muestran los guardados).
  const [porLista, setPorLista] = useState<Record<string, string> | null>(null)
  const porListaTxt = porLista ?? Object.fromEntries(Object.entries(pedidosGuardados.data?.[fecha] ?? {}).map(([k, v]) => [k, String(v)]))
  const porListaNum = Object.fromEntries(Object.entries(porListaTxt).map(([k, v]) => [k, Math.max(0, Math.round(parseNumeroUY(v)) || 0)]))
  const sumaListas = Object.values(porListaNum).reduce((a, n) => a + n, 0)
  const usaListas = modulos.listas_precio && (listas.data?.length ?? 0) > 1
  const [error, setError] = useState<string | null>(null)

  const hoy = hoyISO()
  const pasado = fecha < hoy

  const borrador: DiaMenu = {
    fecha, sin_cocina: sinCocina,
    motivo: sinCocina ? (motivo === 'Otro' ? motivoTexto.trim() : motivo) : null,
    plato_receta_id: !sinCocina && platoSel.startsWith('r:') ? platoSel.slice(2) : null,
    plato_texto: !sinCocina && platoSel === 'txt' ? platoTxt.trim() || null : null,
    postre_receta_id: !sinCocina && postreSel.startsWith('r:') ? postreSel.slice(2) : null,
    postre_texto: !sinCocina && postreSel === 'txt' ? postreTxt.trim() || null : null,
    pedidos: sinCocina ? null : usaListas ? (sumaListas > 0 ? sumaListas : null) : pedidos.trim() ? Math.round(parseNumeroUY(pedidos)) : null,
  }
  const vacio = !borrador.sin_cocina && !borrador.plato_receta_id && !borrador.plato_texto
    && !borrador.postre_receta_id && !borrador.postre_texto && borrador.pedidos === null

  const nombres = useMemo(() => new Map((recetas.data ?? []).map((r) => [r.id, r])), [recetas.data])
  // Costo del borrador con los precios de hoy (para hoy/futuro, y como referencia en días pasados).
  const vivo = estadoDia(fecha, borrador, { hoy: '0000-00-00', costeo: verCostos ? costeo : null, recetas: nombres, congelados: new Map() })
  // Con precio por plato, vale el del plato elegido si tiene; si no, el precio del menú de ese día.
  const precioPlato = modulos.precio_por_plato && borrador.plato_receta_id
    ? productos.data?.find((p) => p.receta_id === borrador.plato_receta_id && p.activo)?.precio_cent ?? null : null
  const precio = precioPlato ?? precioEn(fecha, historialMenu.data ?? [])
  const nPedidos = borrador.pedidos ?? cantina.pedidos_por_defecto

  const opciones = (tipo: 'plato' | 'postre', actual: string) => (recetas.data ?? [])
    .filter((r) => r.tipo === tipo && (r.activo || actual === `r:${r.id}`))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  function validar(): string | null {
    if (sinCocina && motivo === 'Otro' && !motivoTexto.trim()) return 'Escribí el motivo (por ejemplo "Salida didáctica").'
    if (platoSel === 'txt' && !platoTxt.trim()) return 'Escribí el nombre del plato.'
    if (postreSel === 'txt' && !postreTxt.trim()) return 'Escribí el nombre del postre.'
    if (pedidos.trim() && !(parseNumeroUY(pedidos) >= 0)) return 'Revisá los menús pedidos.'
    return null
  }

  async function onGuardar() {
    const v = validar()
    if (v) return setError(v)
    setError(null)
    try {
      if (vacio) { if (dia) await borrar.mutateAsync(fecha) }
      else {
        await guardar.mutateAsync(borrador)
        if (usaListas && porLista !== null) await guardarPedidos.mutateAsync({ fecha, pedidos: sinCocina ? {} : porListaNum })
      }
      toast('Día guardado')
      onCerrar()
    } catch (e) { setError(mensajeError(e)) }
  }

  async function onRecalcular() {
    const v = validar()
    if (v) return setError(v)
    setError(null)
    try {
      if (!vacio) await guardar.mutateAsync(borrador)
      const fila = congelarDia(borrador, costeo, insumosCosteo)
      await congelar.mutateAsync({ fecha, fila })
      toast(fila ? `Costo recalculado: ${pesos(fila.costo_total_cent)} por menú` : 'El día quedó sin costear')
      onCerrar()
    } catch (e) { setError(mensajeError(e)) }
  }

  async function onVaciar() {
    try {
      await borrar.mutateAsync(fecha)
      toast('Día vaciado')
      onCerrar()
    } catch (e) { setError(mensajeError(e)) }
  }

  const ocupado = guardar.isPending || borrar.isPending || congelar.isPending
  const congeladoCosto = estado?.tipo === 'menu' ? estado.costo_cent : null

  return (
    <Hoja titulo={capitalizar(fechaLarga(fecha))} onCerrar={onCerrar} pie={
      <>
        {dia && <BotonBorrar texto="Vaciar día" onBorrar={onVaciar} disabled={ocupado || !enLinea} />}
        <button className="btn" onClick={onGuardar} disabled={ocupado || !enLinea}>{guardar.isPending ? 'Guardando…' : 'Guardar'}</button>
      </>
    }>
      <label className="switch">
        <input type="checkbox" checked={sinCocina} onChange={(e) => setSinCocina(e.target.checked)} />
        <span><b>Este día no se cocina</b><br /><span className="hint">Feriado, vacaciones, paro…</span></span>
      </label>

      {sinCocina ? (
        <Campo etiqueta="Motivo" ayuda="En el calendario y en lo que se comparte aparece solo esta palabra.">
          <Chips etiqueta="Motivo" valor={motivo} onCambio={setMotivo} opciones={[...MOTIVOS, 'Otro'].map((m) => [m as Motivo, m])} />
          {motivo === 'Otro' && (
            <input className="inp" value={motivoTexto} onChange={(e) => setMotivoTexto(e.target.value)} placeholder="Ej: Salida didáctica" aria-label="Motivo" />
          )}
        </Campo>
      ) : (
        <>
          <SelectorComponente etiqueta="Plato" id="sp" sel={platoSel} setSel={setPlatoSel} txt={platoTxt} setTxt={setPlatoTxt} opciones={opciones('plato', platoSel)} />
          <SelectorComponente etiqueta="Postre" id="sq" sel={postreSel} setSel={setPostreSel} txt={postreTxt} setTxt={setPostreTxt} opciones={opciones('postre', postreSel)} />
          {usaListas ? (
            <Campo etiqueta="Menús pedidos por lista" ayuda={`Total: ${sumaListas || (cantina.pedidos_por_defecto ? `${cantina.pedidos_por_defecto} (por defecto)` : '—')}. Las porciones de cada lista se usan para la lista de compras.`}>
              <div className="grid2">
                {(listas.data ?? []).map((l) => (
                  <div className="field" key={l.id}>
                    <label htmlFor={`pl-${l.id}`} className="small">{l.nombre}{l.factor_porcion !== 1 ? ` (porción × ${numero(l.factor_porcion)})` : ''}</label>
                    <CampoNumero id={`pl-${l.id}`} valor={porListaTxt[l.id] ?? ''} inputMode="numeric" placeholder="0"
                      onCambio={(t) => setPorLista({ ...porListaTxt, [l.id]: t })} />
                  </div>
                ))}
              </div>
            </Campo>
          ) : (
            <Campo etiqueta="Menús pedidos" htmlFor="ped"
              ayuda={`Se usa para la lista de compras.${cantina.pedidos_por_defecto ? ` Si lo dejás vacío se toman ${cantina.pedidos_por_defecto}.` : ''}`}>
              <CampoNumero id="ped" valor={pedidos} onCambio={(t) => setPedidos(t)} inputMode="numeric"
                placeholder={cantina.pedidos_por_defecto ? String(cantina.pedidos_por_defecto) : 'Ej: 60'} />
            </Campo>
          )}

          {verCostos && vivo.tipo === 'menu' && (
            <div className="summary">
              {pasado ? (
                <>
                  <p className="eyebrow">Costo de ese día</p>
                  <p className="big">{congeladoCosto !== null ? pesos(congeladoCosto) : 'Sin costear'}</p>
                  <p className="small muted">Los días pasados quedan con el costo que tenían. Con los precios de hoy daría {vivo.costo_cent !== null ? pesos(vivo.costo_cent) : 'sin costear'}.</p>
                  <BotonRecalcular onConfirmar={onRecalcular} disabled={ocupado || !enLinea} />
                </>
              ) : (
                <>
                  <p className="eyebrow">Costo del menú</p>
                  <p className="big">{vivo.costo_cent !== null ? pesos(vivo.costo_cent) : 'Sin costear'}</p>
                  <p className="small muted">
                    {[vivo.plato, vivo.postre].filter((c) => c).map((c) => `${c!.nombre}: ${c!.aMano ? 'escrito a mano' : c!.costo_cent !== null ? pesos(c!.costo_cent) : 'incompleto'}`).join(' · ')}
                  </p>
                  {vivo.costo_cent !== null && precio && (
                    <p className="small">
                      Ganancia por menú: <b>{pesos(precio - vivo.costo_cent)}</b> ({numero((vivo.costo_cent / precio) * 100, 0)}% de costo)
                      {nPedidos ? <> · del día: <b>{pesos((precio - vivo.costo_cent) * nPedidos, { sinCentesimos: true })}</b></> : null}
                      {' '}<span className={`pill ${semaforo(vivo.costo_cent, precio, cantina.objetivo_costo_pct)}`}>
                        {semaforo(vivo.costo_cent, precio, cantina.objetivo_costo_pct) === 'ok' ? 'Dentro del objetivo' : 'Arriba del objetivo'}
                      </span>
                    </p>
                  )}
                  {precioPlato !== null && <p className="hint">Precio del plato: {pesos(precioPlato)} (módulo precio por plato).</p>}
                  {usaListas && vivo.costo_cent !== null && (
                    <div className="stack" style={{ gap: 4 }}>
                      {(listas.data ?? []).filter((l) => !l.es_default).map((l) => {
                        const costoL = vivo.costo_cent! * l.factor_porcion
                        // Misma regla que la base (precio_menu): plato con precio propio o menú, por lista.
                        const precioL = precioMenuDia(productos.data ?? [], modulos, borrador.plato_receta_id, l.id)
                        return (
                          <p className="small" key={l.id}>
                            {l.nombre}: costo {pesos(costoL)}{precioL ? <> · precio {pesos(precioL)} · ganancia <b>{pesos(precioL - costoL)}</b></> : ' · sin precio propio'}
                          </p>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}

      <AvisoSinConexion que="cambiar el menú" />
      {error && <p className="error" role="alert">{error}</p>}
    </Hoja>
  )
}

function BotonRecalcular({ onConfirmar, disabled }: { onConfirmar: () => void; disabled: boolean }) {
  const [armado, setArmado] = useState(false)
  return (
    <button type="button" className={`btn ${armado ? '' : 'ghost'} sm`} disabled={disabled}
      onClick={() => (armado ? onConfirmar() : setArmado(true))}>
      {armado ? 'Tocá de nuevo para recalcular con los precios de hoy' : 'Recalcular este día'}
    </button>
  )
}

function SelectorComponente({ etiqueta, id, sel, setSel, txt, setTxt, opciones }: {
  etiqueta: string
  id: string
  sel: string
  setSel: (v: string) => void
  txt: string
  setTxt: (v: string) => void
  opciones: { id: string; nombre: string }[]
}) {
  return (
    <Campo etiqueta={etiqueta} htmlFor={id}>
      <select id={id} className="inp" value={sel} onChange={(e) => setSel(e.target.value)}>
        <option value="">— Sin elegir —</option>
        {opciones.map((r) => <option key={r.id} value={`r:${r.id}`}>{r.nombre}</option>)}
        <option value="txt">Escribir otro (sin costear)</option>
      </select>
      {sel === 'txt' && (
        <>
          <input className="inp" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={`Nombre del ${etiqueta.toLowerCase()}`} aria-label={`Nombre del ${etiqueta.toLowerCase()}`} />
          <p className="hint">Queda en el menú aunque no tenga receta. Lo podés costear después.</p>
        </>
      )}
    </Campo>
  )
}

/** Vista de solo lectura para el ayudante. */
export function VistaDia({ fecha, estado, onCerrar }: { fecha: string; estado: EstadoDia | undefined; onCerrar: () => void }) {
  const { cantina } = useCantina()
  return (
    <Hoja titulo={capitalizar(fechaLarga(fecha))} onCerrar={onCerrar}>
      {!estado || estado.tipo === 'vacio' ? <p className="muted">Todavía no hay menú cargado para este día.</p>
        : estado.tipo === 'sin_cocina' ? <h3>{estado.motivo}</h3>
          : (
            <div className="list">
              <div className="li"><div className="main"><span className="small muted">Plato</span><b>{estado.plato?.nombre ?? '—'}</b></div></div>
              <div className="li"><div className="main"><span className="small muted">Postre</span><b>{estado.postre?.nombre ?? '—'}</b></div></div>
              <div className="li"><div className="main"><span className="small muted">Menús pedidos</span>
                <b className="num">{estado.pedidos ?? (cantina.pedidos_por_defecto ? `${cantina.pedidos_por_defecto} (por defecto)` : '—')}</b></div></div>
            </div>
          )}
    </Hoja>
  )
}
