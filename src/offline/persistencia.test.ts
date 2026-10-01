import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { persistQueryClientRestore, persistQueryClientSave } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { almacenKV, borrarTodoLocal } from './baseLocal'

// Mismo persister que usa la app (App.tsx → ConCache).
const persister = () => createAsyncStoragePersister({ storage: almacenKV, key: 'consultas', throttleTime: 0 })

describe('caché en el dispositivo', () => {
  it('lo cargado con conexión se recupera al abrir la app de nuevo', async () => {
    const antes = new QueryClient()
    antes.setQueryData(['cat', 'k', 'insumos'], [{ id: 'i1', nombre: 'Tallarines' }])
    await persistQueryClientSave({ queryClient: antes, persister: persister(), buster: 'usuario-1' })

    const despues = new QueryClient()
    await persistQueryClientRestore({ queryClient: despues, persister: persister(), buster: 'usuario-1', maxAge: 1000 * 60 * 60 })
    expect(despues.getQueryData(['cat', 'k', 'insumos'])).toEqual([{ id: 'i1', nombre: 'Tallarines' }])
  })

  it('si entra otro usuario, no ve la caché del anterior', async () => {
    const otro = new QueryClient()
    await persistQueryClientRestore({ queryClient: otro, persister: persister(), buster: 'usuario-2', maxAge: 1000 * 60 * 60 })
    expect(otro.getQueryData(['cat', 'k', 'insumos'])).toBeUndefined()
  })

  it('al cerrar sesión se borra todo', async () => {
    const qc = new QueryClient()
    qc.setQueryData(['cat', 'k', 'alumnos'], [{ id: 'a1' }])
    await persistQueryClientSave({ queryClient: qc, persister: persister(), buster: 'usuario-1' })
    await borrarTodoLocal()
    const nuevo = new QueryClient()
    await persistQueryClientRestore({ queryClient: nuevo, persister: persister(), buster: 'usuario-1', maxAge: 1000 * 60 * 60 })
    expect(nuevo.getQueryData(['cat', 'k', 'alumnos'])).toBeUndefined()
  })
})
