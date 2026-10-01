import { useState } from 'react'
import { useCantina } from '../../sesion/Sesion'
import { Hoja } from '../../componentes/Hoja'
import { Campo, CampoNumero, pesosACent } from '../../componentes/Controles'
import { useToast } from '../../componentes/Toast'
import { useAnotarConsumo, useMenuRango, useProductosVenta, useRecetas } from '../../datos/consultas'
import { listaCobro, precioEnLista, precioMenuDia } from '../../lib/precios'
import { capitalizar, fechaLarga, hoyISO, pesos } from '../../lib/formato'
import { primerDia, ultimoDia } from '../../lib/fechas'
import { mensajeError } from '../../lib/errores'
import type { Alumno } from '../../datos/tipos'

export function AnotarConsumo({ alumno, onCerrar }: { alumno: Alumno; onCerrar: () => void }) {
  const { puede, dic, modulos } = useCantina()
  const toast = useToast()
  const productos = useProductosVenta()
  const recetas = useRecetas()
  const anotar = useAnotarConsumo()
  const [fecha, setFecha] = useState(hoyISO())
  // Se pide el mes entero: es la misma consulta que se precarga para usar sin conexión.
  const menuMes = useMenuRango(primerDia(fecha.slice(0, 7)), ultimoDia(fecha.slice(0, 7)))
  const [elegido, setElegido] = useState<string | null>(null)
  const [cantidad, setCantidad] = useState(1)
  const [otroConcepto, setOtroConcepto] = useState('')
  const [otroImporte, setOtroImporte] = useState('')
  const [error, setError] = useState<string | null>(null)

  const menu = productos.data?.find((p) => p.tipo === 'menu')
  const otros = (productos.data ?? []).filter((p) => p.tipo !== 'menu' && p.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const lista = listaCobro(modulos, alumno.lista_id)
  const dia = menuMes.data?.find((d) => d.fecha === fecha)
  const plato = dia && !dia.sin_cocina
    ? (dia.plato_receta_id ? recetas.data?.find((r) => r.id === dia.plato_receta_id)?.nombre : dia.plato_texto) ?? null : null
  // El precio que va a cobrar el servidor: lista del alumno y, con precio por plato, el del plato del día.
  const precioMenu = precioMenuDia(productos.data ?? [], modulos, dia && !dia.sin_cocina ? dia.plato_receta_id : null, lista)
  const precioDe = (p: { tipo: string } & Parameters<typeof precioEnLista>[0]) => (p?.tipo === 'menu' ? precioMenu : precioEnLista(p, lista))

  async function enviar(producto_id: string | null, cant: number, extra: { concepto?: string; importe_cent?: number } = {}) {
    setError(null)
    // Lo que se muestra mientras no se envía: el servidor pone el importe y el concepto definitivos.
    const prod = productos.data?.find((p) => p.id === producto_id)
    const concepto = extra.concepto ?? (prod?.tipo === 'menu' && plato ? `Menú: ${plato}` : prod?.nombre ?? 'Consumo')
    const importe = extra.importe_cent ?? Math.round((prod ? precioDe(prod) ?? 0 : 0) * cant)
    try {
      const r = await anotar.mutateAsync({
        concepto, importe_cent: importe,
        consumo: {
          client_uuid: crypto.randomUUID(), alumno_id: alumno.id, producto_id, cantidad: cant, fecha,
          concepto: extra.concepto ?? null, importe_cent: extra.importe_cent ?? null, cargado_at: new Date().toISOString(),
        },
      })
      toast(r.pendiente ? `Anotado a ${alumno.nombre} sin conexión: se envía solo cuando vuelva internet` : `Anotado a ${alumno.nombre}`)
      onCerrar()
    } catch (e) { setError(mensajeError(e)) }
  }

  function anotarOtro() {
    const importe = pesosACent(otroImporte)
    if (!otroConcepto.trim()) return setError('Escribí qué consumió.')
    if (!(importe > 0)) return setError('Escribí el importe.')
    void enviar(null, 1, { concepto: otroConcepto.trim(), importe_cent: importe })
  }

  const ocupado = anotar.isPending
  const prod = otros.find((p) => p.id === elegido)

  return (
    <Hoja titulo={`Anotar a ${alumno.nombre}`} onCerrar={onCerrar}>
      <Campo etiqueta="Fecha" htmlFor="cf">
        <input id="cf" className="inp" type="date" value={fecha} max={hoyISO()} onChange={(e) => e.target.value && setFecha(e.target.value)} />
      </Campo>

      {menu && (
        <button className="btn" onClick={() => void enviar(menu.id, 1)} disabled={ocupado || !precioMenu}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, textAlign: 'left' }}>
          <span>{dic.T('menu_del_dia')}{precioMenu ? ` · ${pesos(precioMenu)}` : ''}</span>
          <span className="small" style={{ fontWeight: 400, opacity: 0.9 }}>
            {!precioMenu ? 'Falta cargar el precio del menú en Ajustes'
              : dia?.sin_cocina ? `${capitalizar(fechaLarga(fecha))}: ${dia.motivo}` : plato ?? `${capitalizar(fechaLarga(fecha))}`}
          </span>
        </button>
      )}

      {otros.length > 0 && (
        <Campo etiqueta="Otro producto">
          <div className="chips" style={{ flexWrap: 'wrap' }}>
            {otros.map((p) => (
              <button key={p.id} type="button" className="chip" aria-pressed={elegido === p.id} disabled={!precioDe(p)}
                onClick={() => { setElegido(p.id); setCantidad(1) }}>
                {p.nombre}{precioDe(p) ? ` · ${pesos(precioDe(p))}` : ' · sin precio'}
              </button>
            ))}
          </div>
          {prod && (
            <div className="row">
              <button className="iconbtn" onClick={() => setCantidad((c) => Math.max(1, c - 1))} aria-label="Uno menos">−</button>
              <b className="num" style={{ minWidth: 28, textAlign: 'center' }}>{cantidad}</b>
              <button className="iconbtn" onClick={() => setCantidad((c) => c + 1)} aria-label="Uno más">+</button>
              <button className="btn" style={{ flex: 1 }} onClick={() => void enviar(prod.id, cantidad)} disabled={ocupado}>
                Anotar {pesos((precioDe(prod) ?? 0) * cantidad)}
              </button>
            </div>
          )}
        </Campo>
      )}

      {puede('consumo_otro') && (
        <details className="paste">
          <summary>Otro (concepto e importe libres)</summary>
          <div className="stack">
            <input className="inp" value={otroConcepto} onChange={(e) => setOtroConcepto(e.target.value)} placeholder="Ej: Torta de cumpleaños" aria-label="Concepto" />
            <CampoNumero valor={otroImporte} onCambio={(t) => setOtroImporte(t)} placeholder="Importe $" aria-label="Importe" />
            <button className="btn" onClick={anotarOtro} disabled={ocupado}>Anotar</button>
          </div>
        </details>
      )}

      {ocupado && <p className="muted small">Anotando…</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </Hoja>
  )
}
