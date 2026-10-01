// Traduce errores técnicos a mensajes que digan qué pasó y cómo seguir.

export function mensajeError(e: unknown): string {
  const msg = (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e ?? ''))
  const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : ''

  if (/invalid login credentials/i.test(msg)) return 'El email o la contraseña no coinciden. Revisalos y probá de nuevo.'
  if (/email not confirmed/i.test(msg)) return 'Tu usuario todavía no está activado. Pedile al administrador que lo revise.'
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(msg))
    return 'No hay conexión con el servidor. Revisá internet y probá de nuevo.'
  if (/should be different from the old password/i.test(msg)) return 'La contraseña nueva tiene que ser distinta de la que tenés.'
  if (/password should be at least|weak password/i.test(msg)) return 'La contraseña es muy corta o muy fácil. Usá al menos 8 caracteres.'
  if (/rate limit|too many requests/i.test(msg)) return 'Hubo demasiados intentos seguidos. Esperá un minuto y probá de nuevo.'
  if (/row-level security|permission denied/i.test(msg))
    return 'No tenés permiso para hacer esto. Si te parece un error, hablá con la dueña.'
  if (code === '23505' || /duplicate key/i.test(msg)) return 'Ya hay uno con ese nombre. Usá otro nombre o editá el que ya existe.'
  if (code === '23503' || /foreign key/i.test(msg))
    return 'Está en uso en otras recetas o en el menú, así que no se puede borrar. Podés desactivarlo.'
  // Los errores propios de la base (raise exception) ya vienen en español claro.
  if (['42501', '22023', '23514', 'P0001'].includes(code)) return msg
  return 'Algo salió mal. Probá de nuevo en un rato.'
}
