import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { persistQueryClient } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { almacenKV } from './offline/baseLocal'
import { supabaseConfigurado } from './lib/supabase'
import { SesionProvider, useSesion } from './sesion/Sesion'
import { Login } from './pantallas/Login'
import { ElegirCantina } from './pantallas/ElegirCantina'
import { Aviso } from './pantallas/Aviso'
import { ToastProvider } from './componentes/Toast'
import { Rutas } from './Rutas'

const queryClient = new QueryClient({
  // gcTime largo para que la caché persistida no se descarte enseguida.
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 1000 * 60 * 60 * 24 * 30, retry: 1, refetchOnWindowFocus: false },
    // Sin conexión las altas van a la cola del dispositivo y el resto avisa que necesita
    // internet: las mutaciones no se pausan.
    mutations: { networkMode: 'always' },
  },
})

// Modo demostración: datos de ejemplo en memoria, sin Supabase. Solo si VITE_DEMO=1
// (al construir sin esa variable, Vite descarta este import).
const Demo = import.meta.env.VITE_DEMO === '1' ? lazy(() => import('./demo/Demo')) : null

function Base({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>{children}</BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}

export function App() {
  if (Demo) {
    return <Base><Suspense fallback={<Aviso titulo="Cargando…" />}><Demo /></Suspense></Base>
  }
  if (!supabaseConfigurado) {
    return (
      <Aviso titulo="Falta configurar la conexión">
        <p>Copiá <code>.env.example</code> a <code>.env.local</code>, completá la URL y la anon key del proyecto de Supabase y reiniciá el servidor.</p>
      </Aviso>
    )
  }
  return (
    <Base>
      <SesionProvider>
        <Raiz />
      </SesionProvider>
    </Base>
  )
}

function Raiz() {
  const { estado, cantinaActiva, recargar, salir } = useSesion()

  if (estado.tipo === 'cargando') return <Aviso titulo="Cargando…" />
  if (estado.tipo === 'sin_sesion') return <Login />
  if (estado.tipo === 'error') {
    return (
      <Aviso titulo="No pudimos cargar tus datos">
        <p>{estado.mensaje}</p>
        <button className="btn full" onClick={() => void recargar()}>Probar de nuevo</button>
        <button className="btn ghost full" onClick={() => void salir()}>Cerrar sesión</button>
      </Aviso>
    )
  }
  if (!cantinaActiva) return <ElegirCantina />
  return <ConCache userId={estado.user.id}><Rutas /></ConCache>
}

const UN_MES = 1000 * 60 * 60 * 24 * 30

/**
 * Guarda en el dispositivo (IndexedDB) lo último que se cargó, para poder abrir la app y
 * ver menú, recetas, insumos, compras y cuentas sin conexión. La caché es de cada usuario:
 * si entra otro, se descarta.
 */
function ConCache({ userId, children }: { userId: string; children: ReactNode }) {
  const qc = useQueryClient()
  const [listo, setListo] = useState(false)
  useEffect(() => {
    const persister = createAsyncStoragePersister({ storage: almacenKV, key: 'consultas', throttleTime: 1000 })
    const [desuscribir, restaurado] = persistQueryClient({ queryClient: qc, persister, buster: userId, maxAge: UN_MES })
    void restaurado.finally(() => setListo(true))
    return desuscribir
  }, [qc, userId])
  return listo ? <>{children}</> : <Aviso titulo="Cargando…" />
}
