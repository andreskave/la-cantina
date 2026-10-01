import { useSyncExternalStore, type ReactNode } from 'react'

/** Estado vacío: explica qué cargar primero. */
export function Vacio({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

const suscribir = (cb: () => void) => {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb) }
}

/**
 * "Cargando…". Sin conexión y sin nada guardado en el dispositivo la consulta queda en
 * pausa: en ese caso se explica en vez de quedarse cargando para siempre.
 */
export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  const enLinea = useSyncExternalStore(suscribir, () => navigator.onLine, () => true)
  return (
    <Vacio>
      <p>{enLinea ? texto : 'Sin conexión, y esta pantalla todavía no tiene datos guardados en este dispositivo. Se carga sola cuando vuelva internet.'}</p>
    </Vacio>
  )
}
