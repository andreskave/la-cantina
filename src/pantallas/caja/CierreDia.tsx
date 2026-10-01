import { useEffect, useState } from 'react'
import { useCantina } from '../../sesion/Sesion'
import { Hoja } from '../../componentes/Hoja'
import { Campo, CampoNumero, Segmentado, centATexto, pesosACent } from '../../componentes/Controles'
import { useToast } from '../../componentes/Toast'
import { useCaja, useGuardarCierreDia, useHistorialPrecioMenu, useListas, useMenuRango, useMenusEnCuentas, useMenusEnCuentasPorLista, usePedidosPorLista, useProductosVenta } from '../../datos/consultas'
import { precioMenuDia } from '../../lib/precios'
import { propuestaCierre, propuestaCierrePorLista } from '../../lib/caja'
import { precioEn } from '../../lib/menu'
import { capitalizar, fechaLarga, hoyISO, numero, pesos } from '../../lib/formato'
import { mensajeError } from '../../lib/errores'
import { AvisoSinConexion, useEnLinea } from '../../offline/Conexion'

/** Cierre del día (módulo cierre_dia): ventas de menús y kiosco al contado. */
export function CierreDia({ onCerrar }: { onCerrar: () => void }) {
  const { cantina, modulos } = useCantina()
  const toast = useToast()
  const enLinea = useEnLinea()
  const [fecha, setFecha] = useState(hoyISO())
  const menu = useMenuRango(fecha, fecha)
  const enCuentas = useMenusEnCuentas(fecha)
  const historial = useHistorialPrecioMenu()
  const caja = useCaja(fecha, fecha)
  const guardar = useGuardarCierreDia()
  const [menus, setMenus] = useState<string | null>(null)
  const [kiosco, setKiosco] = useState('')
  const [medio, setMedio] = useState<'efectivo' | 'transferencia'>('efectivo')
  const [error, setError] = useState<string | null>(null)

  const productos = useProductosVenta()
  const listas = useListas()
  const pedidosLista = usePedidosPorLista(fecha, fecha)
  const enCuentasLista = useMenusEnCuentasPorLista(fecha)

  const dia = menu.data?.[0]
  const sinCocina = dia?.sin_cocina ?? false
  const pedidos = sinCocina || !dia ? 0 : dia.pedidos ?? cantina.pedidos_por_defecto
  const plato = dia && !sinCocina ? dia.plato_receta_id : null
  // Precio del menú de ese día: el del plato con precio por plato; si no, el vigente ese día.
  const precioPlato = modulos.precio_por_plato ? precioMenuDia(productos.data ?? [], { precio_por_plato: true }, plato, null) : null
  const delPlato = precioPlato !== null && productos.data?.some((p) => p.receta_id === plato && p.activo && p.precio_cent)
  const precio = (delPlato ? precioPlato : precioEn(fecha, historial.data ?? [])) ?? 0
  const anotados = enCuentas.data ?? 0

  // Con listas de precio y pedidos cargados por lista: la cuenta lista por lista.
  const porLista = modulos.listas_precio && Object.keys(pedidosLista.data?.[fecha] ?? {}).length > 0 && !sinCocina
  const filasLista = porLista ? (listas.data ?? []).map((l) => ({
    lista: l, pedidos: pedidosLista.data?.[fecha]?.[l.id] ?? 0, anotados: enCuentasLista.data?.[l.id] ?? 0,
    precio_cent: (l.es_default ? precio : precioMenuDia(productos.data ?? [], modulos, plato, l.id)) ?? 0,
  })).filter((f) => f.pedidos || f.anotados) : []
  const prop = porLista ? propuestaCierrePorLista(filasLista) : propuestaCierre(pedidos, anotados, precio)
  const anterior = (caja.data ?? []).filter((m) => m.origen === 'cierre_dia')
  const cargando = menu.isPending || enCuentas.isPending || historial.isPending || caja.isPending

  // Al cambiar de día se vuelve a proponer el importe.
  useEffect(() => { setMenus(null); setKiosco('') }, [fecha])
  const menusTxt = menus ?? centATexto(prop.importe_cent)

  async function onGuardar() {
    const m = menusTxt.trim() ? pesosACent(menusTxt) : 0
    const k = kiosco.trim() ? pesosACent(kiosco) : 0
    if (!(m >= 0) || !(k >= 0)) return setError('Revisá los importes.')
    if (m === 0 && k === 0 && !anterior.length) return setError('No hay nada para anotar.')
    setError(null)
    try {
      await guardar.mutateAsync({ fecha, menus_cent: m, menus_cant: m === prop.importe_cent ? prop.menus : 0, kiosco_cent: k, medio_pago: modulos.medio_pago ? medio : null })
      toast(`Cierre guardado: ${pesos(m + k)} al contado`)
      onCerrar()
    } catch (e) { setError(mensajeError(e)) }
  }

  return (
    <Hoja titulo="Cierre del día" onCerrar={onCerrar} pie={
      <button className="btn" onClick={onGuardar} disabled={cargando || guardar.isPending || !enLinea}>{guardar.isPending ? 'Guardando…' : 'Guardar cierre'}</button>
    }>
      <Campo etiqueta="Día" htmlFor="cdf">
        <input id="cdf" className="inp" type="date" value={fecha} max={hoyISO()} onChange={(e) => e.target.value && setFecha(e.target.value)} />
      </Campo>

      {cargando ? <p className="muted">Calculando…</p> : (
        <>
          <div className="summary">
            <p className="eyebrow">{capitalizar(fechaLarga(fecha))}</p>
            {sinCocina ? <p>Ese día no se cocinó ({dia?.motivo}).</p> : !dia ? <p>Ese día no tiene menú cargado.</p> : (
              <>
                {porLista ? filasLista.map((f) => (
                  <div className="spread small" key={f.lista.id}>
                    <span className="muted">{f.lista.nombre}: {numero(f.pedidos)} pedidos − {numero(f.anotados)} en cuentas</span>
                    <b className="num">{numero(Math.max(0, f.pedidos - f.anotados))} × {pesos(f.precio_cent)}</b>
                  </div>
                )) : (
                  <>
                    <div className="spread small"><span className="muted">Menús pedidos{dia.pedidos === null ? ' (por defecto)' : ''}</span><b className="num">{numero(pedidos)}</b></div>
                    <div className="spread small"><span className="muted">Anotados en cuentas</span><b className="num">− {numero(anotados)}</b></div>
                    <div className="spread small"><span className="muted">Al contado</span><b className="num">{numero(prop.menus)} × {pesos(precio)}{delPlato ? ' (precio del plato)' : ''}</b></div>
                  </>
                )}
                <div className="spread"><span>Venta de menús propuesta</span><b className="num">{pesos(prop.importe_cent)}</b></div>
              </>
            )}
          </div>
          <Campo etiqueta="Venta de menús al contado" htmlFor="cdm" ayuda="Corregilo si cobraste otra cosa. Los menús anotados en cuentas no se cuentan acá: se cobran por la cuenta.">
            <CampoNumero id="cdm" valor={menusTxt} onCambio={(t) => setMenus(t)} placeholder="$" />
          </Campo>
          <Campo etiqueta="Ventas de kiosco al contado (opcional)" htmlFor="cdk">
            <CampoNumero id="cdk" valor={kiosco} onCambio={(t) => setKiosco(t)} placeholder="$" />
          </Campo>
          {modulos.medio_pago && (
            <Campo etiqueta="Medio de pago">
              <Segmentado etiqueta="Medio de pago" valor={medio} onCambio={setMedio} opciones={[['efectivo', 'Efectivo'], ['transferencia', 'Transferencia']]} />
            </Campo>
          )}
          {anterior.length > 0 && (
            <p className="banner">Ya hiciste el cierre de este día ({pesos(anterior.reduce((a, m) => a + m.importe_cent, 0))}). Al guardar se reemplaza.</p>
          )}
        </>
      )}
      <AvisoSinConexion que="hacer el cierre del día" />
      {error && <p className="error" role="alert">{error}</p>}
    </Hoja>
  )
}
