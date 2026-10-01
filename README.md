# La Cantina

App web instalable (PWA) para gestionar la cantina de un colegio: menú, costos, compras, cuentas corrientes y caja.
Multi-cantina desde el primer día.

- Especificación: [docs/prompt-la-cantina.md](docs/prompt-la-cantina.md)
- Prototipo validado: [docs/prototipo-la-cantina.html](docs/prototipo-la-cantina.html)
- Decisiones tomadas: [docs/decisiones.md](docs/decisiones.md)

## Stack

React + TypeScript + Vite (PWA) · Supabase (Postgres, Auth, RLS) · Vercel.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # completar URL, anon key y service role key
npm run dev
```

### Base de datos

Las migraciones están en `supabase/migrations/`:

| Archivo | Qué crea |
|---|---|
| `…_base.sql` | Tipos, `cantinas`, `perfiles`, `miembros`, funciones de permisos |
| `…_catalogo.sql` | Listas de precio, proveedores, insumos, historial de precios, recetas, ingredientes, productos y precios de venta |
| `…_menu.sql` | Días del menú, pedidos por lista, costos congelados |
| `…_cuentas.sql` | Alumnos, movimientos, imputaciones, `anotar_consumo`, `registrar_pago`, `anular_movimiento` |
| `…_caja.sql` | Movimientos de caja y cobros automáticos de cuentas |
| `…_permisos.sql` | Permisos de tablas y funciones por rol |
| `…_guardados_catalogo.sql` | Fase 1: `guardar_insumo`, `guardar_insumos_lote`, `guardar_receta`, `fijar_precio_venta`, `fijar_precio_menu` |
| `…_cron_congelar_costos.sql` | Fase 2: programa el congelamiento diario (pg_cron → Edge Function `congelar-costos`). Necesita los secretos de Vault que explica el archivo. |
| `…_concepto_menu.sql` | Fase 4: el consumo de menú en la cuenta queda con el plato del día |
| `…_caja_cierre_resumen.sql` | Fase 5: `guardar_cierre_dia`, `menus_en_cuentas` y `deuda_cuentas_al` |
| `…_modulos_admin.sql` | Fase 7: precios por lista y por plato, días fijos, menús por lista, vaciar y borrar cantina |
| `…_cron_dias_fijos.sql` | Fase 7: anota los días fijos todos los días hábiles a las 9:00 (pg_cron) |

Para aplicarlas a un proyecto de Supabase:

```bash
npx supabase link --project-ref <ref>
npx supabase db push
```

Edge Functions: `congelar-costos` (la llama el cron a las 00:15) y `admin-usuarios` (alta de usuarios desde Ajustes).
Antes de aplicar la migración 08 hay que guardar dos secretos en Vault; está explicado en ese archivo.

```bash
npx supabase functions deploy congelar-costos
npx supabase functions deploy admin-usuarios
```

Después, crear el Administrador y la primera cantina:

```bash
node --env-file=.env.local scripts/crear-admin.mjs --email vos@mail.com --nombre "Tu nombre"
```

Después, la Dueña y los ayudantes se crean desde **Ajustes → Usuarios** (como Administrador). También por script:

```bash
node --env-file=.env.local scripts/crear-usuario.mjs --email x@mail.com --nombre "Marta" --rol duena
```

## Modo demostración

Para probar las pantallas sin Supabase, con datos de ejemplo en memoria y eligiendo el rol:

```bash
npm run demo
```

Para cargar esos mismos datos en una cantina real de desarrollo:

```bash
node scripts/seed-demo.ts "La Cantina" > seed-demo.sql
```

y pegar el archivo en el SQL editor de Supabase.

## Tests

```bash
npm test
```

Incluye los tests de la base (RLS, roles, imputación de pagos, idempotencia, caja) sobre Postgres en memoria
(PGlite), sin Docker ni conexión.
