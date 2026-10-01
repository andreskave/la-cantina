import { useState } from 'react'
import { useCantina } from '../../sesion/Sesion'
import { Hoja } from '../../componentes/Hoja'
import { Campo } from '../../componentes/Controles'
import { useToast } from '../../componentes/Toast'
import { useDiasFijos, useGuardarAlumno, useGuardarDiasFijos, useListas } from '../../datos/consultas'
import { mensajeError } from '../../lib/errores'
import type { Alumno } from '../../datos/tipos'
import { AvisoSinConexion, useEnLinea } from '../../offline/Conexion'

export function EditorAlumno({ alumno, onCerrar, onCreado }: { alumno: Alumno | null; onCerrar: () => void; onCreado?: (id: string) => void }) {
  const { dic } = useCantina()
  const toast = useToast()
  const enLinea = useEnLinea()
  const guardar = useGuardarAlumno()
  const { modulos } = useCantina()
  const listas = useListas()
  const diasFijos = useDiasFijos()
  const guardarDias = useGuardarDiasFijos()
  const [nombre, setNombre] = useState(alumno?.nombre ?? '')
  const [responsable, setResponsable] = useState(alumno?.responsable_nombre ?? '')
  const [telefono, setTelefono] = useState(alumno?.responsable_telefono ?? '')
  const [notas, setNotas] = useState(alumno?.notas ?? '')
  const [activo, setActivo] = useState(alumno?.activo ?? true)
  const [lista, setLista] = useState(alumno?.lista_id ?? '')
  const [dias, setDias] = useState<number[] | null>(null)
  const diasActuales = dias ?? (alumno ? diasFijos.data?.[alumno.id] ?? [] : [])
  const [error, setError] = useState<string | null>(null)

  async function onGuardar() {
    if (!nombre.trim()) return setError(`Escribí el nombre del ${dic.t('alumno')}.`)
    try {
      const id = await guardar.mutateAsync({
        id: alumno?.id, nombre, responsable_nombre: responsable, responsable_telefono: telefono, notas,
        lista_id: modulos.listas_precio ? lista || null : alumno?.lista_id ?? null, activo,
      })
      if (modulos.dias_fijos && dias !== null) await guardarDias.mutateAsync({ alumno: id, dias })
      toast(alumno ? 'Datos guardados' : `${dic.T('alumno')} dado de alta`)
      onCerrar()
      if (!alumno) onCreado?.(id)
    } catch (e) { setError(mensajeError(e)) }
  }

  return (
    <Hoja titulo={alumno ? `Editar ${dic.t('alumno')}` : `Nuevo ${dic.t('alumno')}`} onCerrar={onCerrar} pie={
      <button className="btn" onClick={onGuardar} disabled={guardar.isPending || !enLinea}>{guardar.isPending ? 'Guardando…' : 'Guardar'}</button>
    }>
      <Campo etiqueta="Nombre" htmlFor="an">
        <input id="an" className="inp" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Juan Pérez" autoComplete="off" />
      </Campo>
      <Campo etiqueta={`${dic.T('responsable')} (opcional)`} htmlFor="ar">
        <input id="ar" className="inp" value={responsable} onChange={(e) => setResponsable(e.target.value)} placeholder="Ej: Marta Rodríguez" autoComplete="off" />
      </Campo>
      <Campo etiqueta="Teléfono del responsable (opcional)" htmlFor="at" ayuda="Para mandarle el estado de cuenta por WhatsApp.">
        <input id="at" className="inp" type="tel" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Ej: 099 123 456" autoComplete="off" />
      </Campo>
      <Campo etiqueta="Notas (opcional)" htmlFor="ano">
        <input id="ano" className="inp" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej: celíaco, viene martes y jueves" />
      </Campo>
      {modulos.listas_precio && (
        <Campo etiqueta="Lista de precio" htmlFor="al">
          <select id="al" className="inp" value={lista} onChange={(e) => setLista(e.target.value)}>
            <option value="">General (la de todos)</option>
            {(listas.data ?? []).filter((l) => !l.es_default).map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
        </Campo>
      )}
      {modulos.dias_fijos && (
        <Campo etiqueta="Días fijos de menú" ayuda="Esos días se le anota el menú solo, si hay menú y no tiene uno anotado.">
          <div className="chips envolver" role="group" aria-label="Días fijos">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie'].map((t, i) => (
              <button key={t} type="button" className="chip" aria-pressed={diasActuales.includes(i + 1)}
                onClick={() => setDias(diasActuales.includes(i + 1) ? diasActuales.filter((x) => x !== i + 1) : [...diasActuales, i + 1].sort())}>{t}</button>
            ))}
          </div>
        </Campo>
      )}
      {alumno && (
        <label className="switch">
          <input type="checkbox" checked={!activo} onChange={(e) => setActivo(!e.target.checked)} />
          <span><b>Ya no viene</b><br /><span className="hint">Sale de la lista si su cuenta está en cero. Los movimientos no se borran.</span></span>
        </label>
      )}
      <AvisoSinConexion que="guardar datos de alumnos" />
      {error && <p className="error" role="alert">{error}</p>}
    </Hoja>
  )
}
