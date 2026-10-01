// Congela el costo de los días del menú que ya pasaron (sección 6.5).
// La llama pg_cron todos los días a las 00:15 de Montevideo, con la service role key.
// Para un día puntual: POST { "fecha": "2026-10-14" }.
//
// Usa la misma librería de costeo que la app (src/lib), para que haya una sola implementación.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { crearCosteo, type InsumoCosteo, type RecetaCosteo, type Unidad } from '../../../src/lib/costeo/index.ts'
import { congelarDia, type DiaMenu } from '../../../src/lib/menu.ts'
import { sumarDias } from '../../../src/lib/fechas.ts'
import { hoyISO } from '../../../src/lib/formato.ts'

type Resultado = { cantina: string; fecha: string; estado: 'congelado' | 'ya_estaba' | 'sin_costear' | 'sin_menu' }

Deno.serve(async (req) => {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (req.headers.get('Authorization') !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 })
  }
  const body = await req.json().catch(() => ({})) as { fecha?: string }
  const hoy = hoyISO()
  const fecha = body.fecha ?? sumarDias(hoy, -1)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha >= hoy) {
    return new Response(JSON.stringify({ error: 'Solo se congelan días que ya pasaron.' }), { status: 400 })
  }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, { auth: { persistSession: false } })
  const { data: cantinas, error } = await sb.from('cantinas').select('id')
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  const resultados: Resultado[] = []
  for (const c of cantinas as { id: string }[]) {
    try {
      resultados.push({ cantina: c.id, fecha, estado: await congelarCantina(sb, c.id, fecha) })
    } catch (e) {
      console.error(`congelar-costos: cantina ${c.id}, ${fecha}:`, e)
    }
  }
  return new Response(JSON.stringify({ fecha, resultados }), { headers: { 'Content-Type': 'application/json' } })
})

async function congelarCantina(sb: SupabaseClient, cantina: string, fecha: string): Promise<Resultado['estado']> {
  const { data: dia, error: ed } = await sb.from('menu_dias')
    .select('fecha, plato_receta_id, plato_texto, postre_receta_id, postre_texto, pedidos, sin_cocina, motivo')
    .eq('cantina_id', cantina).eq('fecha', fecha).maybeSingle()
  if (ed) throw ed
  if (!dia || dia.sin_cocina) return 'sin_menu'

  const { data: existente } = await sb.from('menu_dia_costos').select('id').eq('cantina_id', cantina).eq('fecha', fecha).maybeSingle()
  if (existente) return 'ya_estaba'   // no se pisa un "Recalcular este día" manual

  const [insumos, precios, recetas, ingredientes] = await Promise.all([
    sb.from('insumos').select('id, nombre, merma_pct').eq('cantina_id', cantina),
    sb.from('insumo_precio_vigente').select('insumo_id, cantidad, unidad, precio_cent').eq('cantina_id', cantina),
    sb.from('recetas').select('id, nombre, tipo, modo, porciones, rinde_cantidad, rinde_unidad').eq('cantina_id', cantina),
    sb.from('receta_ingredientes').select('receta_id, insumo_id, preparacion_id, cantidad, unidad').eq('cantina_id', cantina).order('orden'),
  ])
  for (const r of [insumos, precios, recetas, ingredientes]) if (r.error) throw r.error

  const precioDe = new Map((precios.data as { insumo_id: string; cantidad: number; unidad: Unidad; precio_cent: number }[])
    .map((p) => [p.insumo_id, { cantidad: Number(p.cantidad), unidad: p.unidad, precio_cent: Number(p.precio_cent) }]))
  const ins = new Map((insumos.data as { id: string; nombre: string; merma_pct: number }[]).map((i): [string, InsumoCosteo] =>
    [i.id, { id: i.id, nombre: i.nombre, merma_pct: Number(i.merma_pct), precio: precioDe.get(i.id) ?? null }]))
  const ings = ingredientes.data as { receta_id: string; insumo_id: string | null; preparacion_id: string | null; cantidad: number; unidad: Unidad }[]
  const recs: RecetaCosteo[] = (recetas.data as Omit<RecetaCosteo, 'ingredientes'>[]).map((r) => ({
    ...r,
    rinde_cantidad: r.rinde_cantidad === null ? null : Number(r.rinde_cantidad),
    ingredientes: ings.filter((i) => i.receta_id === r.id).map((i) => ({ ...i, cantidad: Number(i.cantidad) })),
  }))

  const fila = congelarDia(dia as DiaMenu, crearCosteo([...ins.values()], recs), ins)
  if (!fila) return 'sin_costear'
  const { error } = await sb.from('menu_dia_costos').upsert(
    { cantina_id: cantina, fecha, ...fila, congelado_at: new Date().toISOString() },
    { onConflict: 'cantina_id,fecha', ignoreDuplicates: true })
  if (error) throw error
  return 'congelado'
}
