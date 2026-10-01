import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigurado = Boolean(url && anonKey)

// Si falta la configuración, App muestra una pantalla de aviso y nunca usa el cliente.
export const supabase: SupabaseClient = supabaseConfigurado
  ? createClient(url!, anonKey!, { auth: { persistSession: true, autoRefreshToken: true } })
  : (null as unknown as SupabaseClient)
