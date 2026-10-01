import { useState } from 'react'
import { useCantina, useSesion } from '../../sesion/Sesion'
import {
  useAccionUsuarios, useActualizarModulos, useActualizarTerminos, useCrearCantina, useUsuariosCantina,
} from '../../datos/consultas'
import { MODULOS_DEFAULT, type Modulo } from '../../lib/permisos'
import { TERMINOS_DEFAULT, type Termino } from '../../lib/terminos'
import { mensajeError } from '../../lib/errores'
import { BotonBorrar, Campo, Segmentado } from '../../componentes/Controles'
import { Hoja } from '../../componentes/Hoja'
import { useToast } from '../../componentes/Toast'
import { AvisoSinConexion, useEnLinea } from '../../offline/Conexion'
import { copiarTexto } from '../cuentas/FichaAlumno'
import type { UsuarioCantina } from '../../datos/tipos'

const MODULOS: Record<Modulo, { nombre: string; ayuda: string }> = {
  caja: { nombre: 'Caja', ayuda: 'Pestaña Caja. Apagada, los cobros de cuentas se siguen registrando.' },
  listas_precio: { nombre: 'Listas de precio', ayuda: 'Varias listas (ej. Chicos y Grandes) con su precio y su tamaño de porción.' },
  medio_pago: { nombre: 'Medio de pago', ayuda: 'Pide efectivo o transferencia en pagos y caja.' },
  dias_fijos: { nombre: 'Días fijos', ayuda: 'Alumnos que comen días fijos: se les anota el menú solo.' },
  terminos: { nombre: 'Renombrar términos', ayuda: 'Para otros rubros: "Cliente" en vez de "Alumno", etc.' },
  precio_por_plato: { nombre: 'Precio por plato', ayuda: 'Cada plato con su precio en vez de un precio único del menú.' },
  cierre_dia: { nombre: 'Cierre del día', ayuda: 'En Caja, propone las ventas al contado de menús del día.' },
}

const TERMINOS_TXT: Record<Termino, string> = {
  alumno: 'Alumno', alumnos: 'Alumnos (plural)', responsable: 'Responsable', menu_del_dia: 'Menú del día',
  menu: 'Menú', menus: 'Menús (plural)', plato: 'Plato', postre: 'Postre', cantina: 'Cantina',
}

export function SeccionCantinas() {
  const { cantina, cantinas } = useCantina()
  const { elegirCantina, recargar } = useSesion()
  const toast = useToast()
  const crear = useCrearCantina()
  const enLinea = useEnLinea()
  const [nueva, setNueva] = useState(false)
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onCrear() {
    if (!nombre.trim()) return setError('Escribí el nombre de la cantina.')
    try {
      const id = await crear.mutateAsync(nombre)
      await recargar()
      elegirCantina(id)
      toast(`Cantina "${nombre.trim()}" creada. Ahora estás en ella: agregale usuarios.`)
      setNueva(false); setNombre('')
    } catch (e) { setError(mensajeError(e)) }
  }

  return (
    <section className="card stack">
      <div className="spread"><h3>Cantinas</h3><button className="btn ghost sm" onClick={() => setNueva(true)}>+ Nueva</button></div>
      <div className="list">
        {cantinas.map((c) => (
          <button className="li" key={c.id} onClick={() => c.id !== cantina.id && elegirCantina(c.id)}>
            <div className="main"><b>{c.nombre}</b></div>
            {c.id === cantina.id && <span className="pill ok">Estás acá</span>}
          </button>
        ))}
      </div>
      {nueva && (
        <Hoja titulo="Nueva cantina" onCerrar={() => setNueva(false)} pie={
          <button className="btn" onClick={onCrear} disabled={crear.isPending || !enLinea}>{crear.isPending ? 'Creando…' : 'Crear'}</button>
        }>
          <Campo etiqueta="Nombre" htmlFor="ncn"><input id="ncn" className="inp" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Cantina del Colegio Sur" /></Campo>
          <p className="hint">Arranca vacía, con todos los módulos ocultos apagados y la Caja encendida.</p>
          <AvisoSinConexion que="crear una cantina" />
          {error && <p className="error" role="alert">{error}</p>}
        </Hoja>
      )}
    </section>
  )
}

export function SeccionUsuarios() {
  const { cantina } = useCantina()
  const usuarios = useUsuariosCantina()
  const [abierto, setAbierto] = useState<{ u: UsuarioCantina | null } | null>(null)
  return (
    <section className="card stack">
      <div className="spread"><h3>Usuarios de {cantina.nombre}</h3><button className="btn ghost sm" onClick={() => setAbierto({ u: null })}>+ Agregar</button></div>
      {usuarios.isPending ? <p className="muted">Cargando…</p> : usuarios.error ? <p className="error">{mensajeError(usuarios.error)}</p>
        : (usuarios.data ?? []).length === 0 ? <p className="muted small">Todavía no hay usuarios. Agregá a la dueña primero.</p> : (
          <div className="list">
            {usuarios.data!.map((u) => (
              <button className="li" key={u.user_id} onClick={() => setAbierto({ u })}>
                <div className="main"><b>{u.nombre || u.email}</b><span className="small muted">{u.email}</span></div>
                <span className="pill mute">{u.rol === 'duena' ? 'Dueña' : 'Ayudante'}</span>
              </button>
            ))}
          </div>
        )}
      {abierto && <EditorUsuario usuario={abierto.u} onCerrar={() => setAbierto(null)} />}
    </section>
  )
}

function EditorUsuario({ usuario, onCerrar }: { usuario: UsuarioCantina | null; onCerrar: () => void }) {
  const { cantina } = useCantina()
  const toast = useToast()
  const enLinea = useEnLinea()
  const accion = useAccionUsuarios()
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [rol, setRol] = useState<'duena' | 'ayudante'>(usuario?.rol ?? 'ayudante')
  const [clave, setClave] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function correr<T>(fn: () => Promise<T>) {
    setError(null)
    try { return await fn() } catch (e) { setError(mensajeError(e)); return undefined }
  }
  const crear = () => correr(async () => {
    const r = await accion.mutateAsync({ accion: 'crear', cantina_id: cantina.id, email, nombre, rol }) as { clave_temporal: string | null; ya_existia: boolean }
    if (r.ya_existia) { toast('Ese email ya tenía usuario: quedó agregado a esta cantina con su contraseña de siempre.'); onCerrar() }
    else setClave(r.clave_temporal)
  })
  const cambiarRol = () => correr(async () => {
    await accion.mutateAsync({ accion: 'cambiar_rol', cantina_id: cantina.id, user_id: usuario!.user_id, rol })
    toast('Rol cambiado'); onCerrar()
  })
  const nuevaClave = () => correr(async () => {
    const r = await accion.mutateAsync({ accion: 'nueva_clave', user_id: usuario!.user_id }) as { clave_temporal: string }
    setClave(r.clave_temporal)
  })
  const quitar = () => correr(async () => {
    await accion.mutateAsync({ accion: 'quitar', cantina_id: cantina.id, user_id: usuario!.user_id })
    toast('Usuario quitado de esta cantina'); onCerrar()
  })

  const ocupado = accion.isPending || !enLinea
  if (clave) {
    return (
      <Hoja titulo="Contraseña temporal" onCerrar={onCerrar} pie={<button className="btn" onClick={onCerrar}>Listo</button>}>
        <p>Pasale esta contraseña a {usuario?.nombre || nombre || email}. <b>No se vuelve a mostrar.</b></p>
        <div className="summary"><div className="spread"><b className="num" style={{ fontSize: '1.4rem' }}>{clave}</b>
          <button className="btn ghost sm" onClick={async () => toast(await copiarTexto(clave) ? 'Contraseña copiada' : 'No se pudo copiar')}>Copiar</button></div></div>
        <p className="hint">Entra con su email y esta contraseña.</p>
      </Hoja>
    )
  }

  return (
    <Hoja titulo={usuario ? usuario.nombre || usuario.email : 'Agregar usuario'} onCerrar={onCerrar} pie={
      usuario ? (
        <>
          <BotonBorrar texto="Quitar" onBorrar={() => void quitar()} disabled={ocupado} />
          <button className="btn" onClick={() => void cambiarRol()} disabled={ocupado || rol === usuario.rol}>Guardar rol</button>
        </>
      ) : <button className="btn" onClick={() => void crear()} disabled={ocupado}>{accion.isPending ? 'Creando…' : 'Agregar'}</button>
    }>
      {!usuario && (
        <>
          <Campo etiqueta="Email" htmlFor="ue"><input id="ue" className="inp" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></Campo>
          <Campo etiqueta="Nombre" htmlFor="unm" ayuda="Si el email ya tiene usuario (por ejemplo, en otra cantina), solo se lo agrega a esta.">
            <input id="unm" className="inp" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
          </Campo>
        </>
      )}
      {usuario && <p className="small muted">{usuario.email}</p>}
      <Campo etiqueta="Rol">
        <Segmentado etiqueta="Rol" valor={rol} onCambio={setRol} opciones={[['duena', 'Dueña'], ['ayudante', 'Ayudante']]} />
      </Campo>
      <p className="hint">{rol === 'duena' ? 'Ve y edita todo en esta cantina: costos, precios, caja y cuentas.' : 'Ve menú, recetas, insumos y compras sin precios, y anota consumos en cuentas.'}</p>
      {usuario && <button className="btn ghost" onClick={() => void nuevaClave()} disabled={ocupado}>Generar contraseña nueva</button>}
      <AvisoSinConexion que="administrar usuarios" />
      {error && <p className="error" role="alert">{error}</p>}
    </Hoja>
  )
}

export function SeccionModulos() {
  const { modulos } = useCantina()
  const { recargar } = useSesion()
  const toast = useToast()
  const enLinea = useEnLinea()
  const actualizar = useActualizarModulos()

  async function cambiar(m: Modulo, v: boolean) {
    try {
      await actualizar.mutateAsync({ [m]: v })
      await recargar()
      toast(`${MODULOS[m].nombre}: ${v ? 'encendido' : 'apagado'}`)
    } catch (e) { toast(mensajeError(e)) }
  }

  return (
    <section className="card stack">
      <h3>Módulos</h3>
      <p className="hint">Solo los ve el administrador. Apagados, la cantina no ve nada de ellos.</p>
      {(Object.keys(MODULOS_DEFAULT) as Modulo[]).map((m) => (
        <label className="switch" key={m}>
          <input type="checkbox" checked={modulos[m]} disabled={actualizar.isPending || !enLinea} onChange={(e) => void cambiar(m, e.target.checked)} />
          <span><b>{MODULOS[m].nombre}</b><br /><span className="hint">{MODULOS[m].ayuda}</span></span>
        </label>
      ))}
      <AvisoSinConexion que="cambiar módulos" />
    </section>
  )
}

export function SeccionTerminos() {
  const { cantina } = useCantina()
  const { recargar } = useSesion()
  const toast = useToast()
  const enLinea = useEnLinea()
  const actualizar = useActualizarTerminos()
  const [valores, setValores] = useState<Record<string, string>>({ ...cantina.terminos })

  async function onGuardar() {
    const limpios = Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, v.trim().toLowerCase()]).filter(([, v]) => v))
    try {
      await actualizar.mutateAsync(limpios)
      await recargar()
      toast('Términos guardados')
    } catch (e) { toast(mensajeError(e)) }
  }

  return (
    <section className="card stack">
      <h3>Términos</h3>
      <p className="hint">Dejá vacío lo que no quieras cambiar. Se escriben en minúscula; la app pone la mayúscula donde va.</p>
      <div className="grid2">
        {(Object.keys(TERMINOS_DEFAULT) as Termino[]).map((k) => (
          <Campo key={k} etiqueta={TERMINOS_TXT[k]} htmlFor={`t-${k}`}>
            <input id={`t-${k}`} className="inp" value={valores[k] ?? ''} placeholder={TERMINOS_DEFAULT[k]} onChange={(e) => setValores({ ...valores, [k]: e.target.value })} />
          </Campo>
        ))}
      </div>
      <button className="btn" onClick={() => void onGuardar()} disabled={actualizar.isPending || !enLinea}>{actualizar.isPending ? 'Guardando…' : 'Guardar términos'}</button>
      <AvisoSinConexion que="guardar términos" />
    </section>
  )
}
