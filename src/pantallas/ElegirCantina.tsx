import { useSesion } from '../sesion/Sesion'
import { Icono } from '../componentes/Icono'
import { Aviso } from './Aviso'

const ROL_TXT = { admin: 'Administrador', duena: 'Dueña', ayudante: 'Ayudante' } as const

export function ElegirCantina() {
  const { estado, elegirCantina, salir } = useSesion()
  if (estado.tipo !== 'listo') return null

  if (estado.cantinas.length === 0) {
    return (
      <Aviso titulo="Todavía no tenés una cantina">
        <p>
          {estado.perfil.es_admin_global
            ? 'No hay ninguna cantina creada. Creala desde Ajustes del administrador (llega en la Fase 7) o con el script de alta.'
            : 'Tu usuario todavía no está en ninguna cantina. Pedile al administrador que te agregue.'}
        </p>
        <button className="btn ghost full" onClick={() => void salir()}>Cerrar sesión</button>
      </Aviso>
    )
  }

  return (
    <Aviso titulo="Elegí la cantina">
      <div className="stack">
        {estado.cantinas.map((c) => (
          <button key={c.id} className="opcion" onClick={() => elegirCantina(c.id)}>
            <span className="main"><b>{c.nombre}</b><span className="small muted">{ROL_TXT[c.rol]}</span></span>
            <Icono nombre="der" />
          </button>
        ))}
      </div>
      <button className="btn ghost full" onClick={() => void salir()}>Cerrar sesión</button>
    </Aviso>
  )
}

export { ROL_TXT }
