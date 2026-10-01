// Íconos de trazo, tomados del prototipo (24×24, currentColor).

const PATHS = {
  hoy: <><path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.3 6.3 5 5M19 19l-1.3-1.3M6.3 17.7 5 19M19 5l-1.3 1.3" /><circle cx="12" cy="12" r="4" /></>,
  menu: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4M8 13h2M14 13h2M8 17h2M14 17h2" /></>,
  recetas: <><path d="M4 13h16a8 8 0 0 1-16 0z" /><path d="M9 9c0-2 2-2 2-4M14 9c0-2 2-2 2-4" /></>,
  insumos: <><path d="M5 8h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  compras: <><path d="M9 5h11M9 12h11M9 19h11" /><path d="m3 5 1.5 1.5L7 4M3 12l1.5 1.5L7 11M3 19l1.5 1.5L7 18" /></>,
  cuentas: <><path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6z" /><path d="M6 3v18M4 7h4M4 12h4M4 17h4M11 8h5M11 12h5" /></>,
  caja: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h3" /></>,
  ajustes: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  usuario: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  izq: <path d="m15 6-6 6 6 6" />,
  der: <path d="m9 6 6 6-6 6" />,
  salir: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>,
} as const

export type NombreIcono = keyof typeof PATHS

export function Icono({ nombre, grosor = 2 }: { nombre: NombreIcono; grosor?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={grosor}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[nombre]}
    </svg>
  )
}
