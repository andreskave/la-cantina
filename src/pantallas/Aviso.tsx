import type { ReactNode } from 'react'

/** Pantalla simple centrada, fuera del layout (cargando, errores, configuración). */
export function Aviso({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <main className="centro">
      <div className="caja-login">
        <div className="marca">
          <img className="logo" src="/pwa-192x192.png" alt="" />
          <h1>{titulo}</h1>
        </div>
        {children}
      </div>
    </main>
  )
}
