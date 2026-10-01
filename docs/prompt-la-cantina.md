# La Cantina — Especificación y prompt de desarrollo para Claude Code

## 0. Contexto

Vas a construir **La Cantina**, una app web instalable (PWA) para gestionar la cantina de un colegio en Montevideo, Uruguay. La primera usuaria es la dueña de una cantina escolar; después la app se va a ofrecer a otras cantinas y, más adelante, a otros emprendimientos gastronómicos. Por eso es **multi-cantina desde el primer día**.

La app la usa principalmente desde el **celular o tablet**, personas no técnicas. La prioridad es la simplicidad: botones grandes, pocas pantallas, textos claros.

En `docs/prototipo-la-cantina.html` hay un prototipo HTML funcional que ya fue validado con la usuaria. Usalo como **referencia de flujos, textos y diseño visual** (paleta, tipografías, pantallas, hojas de edición que suben desde abajo). No copies su código de datos: el prototipo guarda todo en un solo documento y no tiene usuarios ni permisos.

Producto separado: no comparte código ni base de datos con ningún otro proyecto.

---

## 1. Reglas de trabajo

1. Trabajá **por fases** (sección 12). Al terminar cada fase, frená y mostrame un resumen de lo hecho, cómo probarlo y lo que quedó pendiente. No avances a la fase siguiente sin mi OK.
2. **Antes de aplicar cualquier migración de base de datos**, mostrame la lista de archivos y migraciones con un resumen de qué crea o cambia cada una, y esperá mi confirmación.
3. No hagas deploy a producción sin pedírmelo.
4. Si algo de esta especificación es ambiguo o contradictorio, preguntá antes de decidir. Si tenés que asumir algo menor, dejalo anotado en `docs/decisiones.md`.
5. Escribí tests para la lógica de negocio (costeo, conversiones, imputación de pagos, permisos). Están detallados en la sección 13.
6. Todo el texto de la interfaz va en **español rioplatense con voseo** ("Cargá", "Elegí", "Tocá de nuevo para borrar").

---

## 2. Stack

- **Frontend:** React + TypeScript + Vite, como PWA (`vite-plugin-pwa`). Mobile-first. CSS con variables de diseño tomadas del prototipo (modo claro y oscuro). Podés usar Tailwind si te resulta más cómodo, respetando la paleta.
- **Backend:** Supabase: Postgres, Auth (email + contraseña), Row Level Security, Edge Functions y `pg_cron`.
- **Hosting:** Vercel.
- **Offline:** IndexedDB (Dexie) para caché local y una cola de envíos pendientes (sección 10).
- **Exportaciones:** se generan en el cliente. Excel con SheetJS (`xlsx`); imagen PNG con canvas; PDF con jsPDF o similar.
- **Lógica de costeo** en un módulo TypeScript puro y compartido (`/packages/costeo` o `/src/lib/costeo`). Lo usan la app y la Edge Function que congela costos, para que haya una sola implementación.
- Montos de dinero: siempre **enteros en centésimos** (`bigint`). Cantidades: `numeric`.
- Zona horaria: `America/Montevideo`. Moneda: pesos uruguayos. Formato `$ 1.234,50`. Meses en español con **"setiembre"**.

---

## 3. Multi-cantina, usuarios y roles

### 3.1 Estructura
- `cantinas`: cada negocio es una cuenta separada. **Todas** las tablas de datos llevan `cantina_id` y RLS que limita el acceso a los miembros de esa cantina.
- `miembros (cantina_id, user_id, rol)`: un usuario puede pertenecer a una o más cantinas.
- `perfiles (user_id, nombre, es_admin_global)`.

### 3.2 Roles

| Rol | Quién | Puede |
|---|---|---|
| **Administrador** (`es_admin_global`) | El dueño del producto | Todo lo de Dueña en todas las cantinas, más: crear cantinas, crear e invitar usuarios, activar o desactivar módulos ocultos y borrar datos en forma general. |
| **Dueña** (`duena`) | La responsable de la cantina | Todo dentro de su cantina: costos, precios, márgenes, caja, cuentas, ajustes. |
| **Ayudante** (`ayudante`) | Personal de la cantina | Ver Hoy, Menú, Recetas, Insumos y Compras **solo con cantidades, sin ningún dato de dinero**. Ver Cuentas corrientes **con saldos** y anotar consumos de menú y de productos. **No** registra pagos ni consumos con importe libre, y no ve Caja ni Ajustes. |

### 3.3 Reglas de seguridad
- Ocultar en la interfaz **no alcanza**. Los datos de costo y precio de compra tienen que estar en tablas o vistas que el rol `ayudante` **no puede leer** por RLS: `insumo_precios`, `menu_dia_costos`, `caja_movimientos` y cualquier vista de margen.
- El ayudante necesita precios de venta para que el consumo se anote con su importe, pero no los carga: usá una función `security definer` (`anotar_consumo`) que toma el precio vigente y crea el movimiento.
- Los usuarios los crea el Administrador desde la app (Edge Function con service role). No hay registro público.

---

## 4. Módulos ocultos (configuración por cantina)

En `cantinas.modulos` (jsonb), visibles y editables solo para el Administrador. **Se desarrollan ahora, pero arrancan desactivados**:

| Clave | Qué hace cuando se activa |
|---|---|
| `listas_precio` | Varias listas de precio, por ejemplo "Chicos" y "Grandes". Cada lista tiene su precio de menú y un **factor de porción** (Grandes = 1,3 rinde porciones más grandes en el costeo y en la lista de compras). Cada alumno tiene una lista asignada. Los pedidos del día se cargan por lista. Con el módulo apagado existe una sola lista, "General", y nada de esto se ve. |
| `medio_pago` | Campo medio de pago (Efectivo / Transferencia) en pagos de cuentas y en movimientos de caja, con totales por medio. Apagado: no se pide y se guarda `null`. |
| `dias_fijos` | Alumnos con días fijos de menú: se les anota el menú automáticamente cada día de servicio. Apagado: no se ve. |
| `terminos` | Renombrar términos para otros rubros (por ejemplo "Alumno" → "Cliente", "Menú del día" → "Plato del día"). Toda la interfaz lee estos términos de un diccionario. |
| `precio_por_plato` | Cada plato tiene su propio precio de venta en lugar del precio único del menú del día (para otros emprendimientos gastronómicos). |
| `cierre_dia` | Cierre del día en Caja (ver 6.8). Apagado: no aparece ni se pide nada; Caja funciona solo con movimientos manuales y cobros automáticos. |

Además, el módulo **`caja`** (pestaña Caja completa) también se puede apagar desde Ajustes del Administrador. Arranca **encendido**, pero la usuaria inicial casi no lo va a usar. Aunque Caja esté apagada, los cobros de cuentas corrientes se siguen registrando en `caja_movimientos`, para que al encenderla el historial esté completo.

---

## 5. Modelo de datos

Proponé el esquema final en la Fase 0, respetando estas entidades y reglas. Todas las tablas llevan `id uuid`, `cantina_id`, `created_at`, `created_by`, `updated_at`.

**Configuración**
- `cantinas`: nombre, `precio_menu_cent` (precio del menú del día en la lista General), `pedidos_por_defecto` (int), `objetivo_costo_pct` (default 35), `modulos` jsonb, `terminos` jsonb.
- `listas_precio`: nombre, `precio_menu_cent`, `factor_porcion` (default 1), `es_default`.

**Insumos y proveedores**
- `proveedores`: nombre, teléfono (opcional), notas.
- `insumos`: nombre, categoría (enum o tabla: Almacén, Carnes, Verdulería, Lácteos y huevos, Panadería, Bebidas, Golosinas y snacks, Otros), `proveedor_id` (opcional), `cantidad_compra` (numeric), `unidad_compra` (`kg`,`g`,`l`,`ml`,`u`), `merma_pct` (0–95), `es_reventa` (bool), `activo`. **Sin precios** en esta tabla.
- `insumo_precios` (historial; solo Dueña/Admin): `insumo_id`, `fecha`, `cantidad`, `unidad`, `precio_cent`. El precio vigente es el último por fecha. Cada cambio de precio, cantidad o unidad agrega una fila; si ya hay una fila del mismo día, se reemplaza.

**Recetas**
- `recetas`: nombre, tipo (`plato`,`postre`,`preparacion`), `modo` (`porcion`,`olla`; solo plato y postre), `porciones` (si es olla), `rinde_cantidad` + `rinde_unidad` (`l`,`kg`,`u`; solo preparación), `activo`.
- `receta_ingredientes`: `receta_id`, `insumo_id` **o** `preparacion_id` (exactamente uno), `cantidad`, `unidad`, `orden`.

**Productos de venta** (lo que se puede anotar en una cuenta o vender)
- `productos_venta`: tipo (`menu`,`insumo_reventa`,`receta`), `ref_id`, nombre visible, activo. El menú del día es un producto único por cantina.
- `precios_venta`: `producto_id`, `lista_id`, `precio_cent`, vigencia desde. Los pueden leer todos los roles.
- Una receta puede tener precio de venta (por ejemplo tortas fritas o bizcochos vendidos por unidad). En ese caso se vende por porción o unidad y su margen se calcula igual que en reventa.

**Menú**
- `menu_dias`: fecha (única por cantina), `plato_receta_id` o `plato_texto`, `postre_receta_id` o `postre_texto`, `pedidos` (int, nullable), `sin_cocina` (bool), `motivo` (`Feriado`,`Vacaciones`,`Paro` o texto libre).
- `menu_dia_pedidos` (solo con `listas_precio` activo): `fecha`, `lista_id`, `pedidos`.
- `menu_dia_costos` (solo Dueña/Admin): fecha, costo del plato, costo del postre, costo total por menú (centésimos), detalle jsonb (líneas con insumo, cantidad y precio usado), `congelado_at`.

**Cuentas corrientes**
- `alumnos`: nombre (obligatorio), `responsable_nombre` y `responsable_telefono` (opcionales), `lista_id` (oculto), `activo`, notas.
- `alumno_dias_fijos` (oculto): `alumno_id`, día de la semana.
- `cuenta_movimientos`: `alumno_id`, fecha, tipo (`cargo`,`pago`), `producto_id` (nullable), concepto, cantidad, `precio_unit_cent`, `importe_cent`, `medio_pago` (oculto), `anulado` (bool), `anulado_motivo`, `client_uuid` (único, para idempotencia offline). **Los movimientos no se borran: se anulan.**
- `imputaciones`: `pago_id`, `cargo_id`, `importe_cent`. Las recalcula el servidor (sección 6.6).

**Caja**
- `caja_movimientos` (solo Dueña/Admin): fecha, tipo (`venta_contado`,`cobro_cuenta`,`compra`,`gasto_fijo`,`otro_ingreso`,`otro_egreso`), subcategoría (para gastos fijos: `Sueldos`,`Gas`,`Otros`), `proveedor_id` (compras), concepto, `importe_cent`, `medio_pago` (oculto), `origen` (`manual`,`cierre_dia`,`cuenta_corriente`), `ref_id`.

---

## 6. Reglas de negocio

### 6.1 Unidades
- Unidades base: `g`, `ml`, `u`. Factores: kg = 1000 g, l = 1000 ml.
- Un ingrediente solo puede usar unidades de la misma dimensión que su insumo o preparación: peso con peso, volumen con volumen, unidades con unidades. Si no coincide, el costo de esa línea queda marcado como incompleto.

### 6.2 Costo de un insumo
`costo por unidad base = precio / (cantidad_compra × factor × (1 − merma/100))`

Ejemplos que tienen que dar exacto:
- 1 kg de tallarines a $300, sin merma → 300 g cuestan **$90**.
- Cebolla 1 kg a $55 con 10% de merma → costo real de $61,11 por kg útil.

### 6.3 Costo de una receta
- **Plato o postre por porción:** las cantidades son para 1 porción. El costo por porción es la suma de las líneas.
- **Plato o postre por olla:** las cantidades son para la olla entera, que rinde N porciones. Costo por porción = total / N.
- **Preparación** (por ejemplo, Tuco): las cantidades son para la olla entera, que rinde X l, kg o u. Su costo por unidad base (total / rinde) se usa cuando la preparación es ingrediente de otra receta.
- **Cascada:** si cambia el precio de un insumo, se recalculan todas las preparaciones y platos que lo usan, a cualquier profundidad.
- **Ciclos:** detectar y marcar como error (una preparación que se usa a sí misma, directa o indirectamente). El guardado se bloquea si crea un ciclo.
- **Faltantes:** si falta un precio, el rinde o la unidad no es compatible, la receta muestra "Falta: …" y su costo se considera incompleto. Un día de menú con algún componente incompleto o escrito a mano figura como **"Sin costear"**.
- Con `listas_precio` activo, el costo por porción de cada lista = costo por porción × `factor_porcion`.

### 6.4 Cambio entre "Para 1 porción" y "Para una olla"
- **De porción a olla:** se piden las porciones de la olla (por defecto, `pedidos_por_defecto`) y **todas las cantidades se multiplican** por ese número.
- **De olla a porción:** todas las cantidades **se dividen** por las porciones.
- Las cantidades se normalizan a la unidad más legible: 7200 g pasan a 7,2 kg y 0,12 kg a 120 g.
- **Si estando en modo olla se cambia el número de porciones, las cantidades NO cambian** (la olla es la misma y rinde distinto). Aparece un botón opcional: "Ajustar cantidades de 60 a 50 porciones".
- Debajo de cada ingrediente se muestra la equivalencia en el otro modo. Por ejemplo, "por porción: 120 g" en modo olla, o "para 60 porciones: 7,2 kg" en modo porción.

### 6.5 Costo congelado por día
- Los días **futuros y el de hoy** muestran el costo calculado con los precios actuales.
- **Cada día que pasa queda congelado** con el costo de ese momento en `menu_dia_costos`. Lo hace una Edge Function disparada por `pg_cron` a las 00:15 hora de Montevideo, usando la librería de costeo compartida.
- Los días pasados siempre muestran el costo congelado. La Dueña puede "Recalcular este día" en forma manual, con confirmación.
- Si un día pasado no tenía menú costeable, queda como "Sin costear" y no se congela nada.

### 6.6 Cuentas corrientes: imputación de pagos
- Una sola cuenta por alumno. Saldo = cargos − pagos (cargos y pagos no anulados).
- **Los pagos se imputan siempre a los cargos más viejos primero** (por fecha y, a igual fecha, por momento de carga).
- Un pago puede cubrir un cargo en parte; el cargo queda con saldo pendiente.
- Si un pago supera la deuda, el sobrante queda como **saldo a favor** y se aplica solo a los próximos cargos, también del más viejo al más nuevo.
- Si se anula un cargo o un pago, se **recalculan todas las imputaciones del alumno**. Implementalo como una función en Postgres (`reimputar_alumno(alumno_id)`) que se ejecuta después de cada alta o anulación, para que siempre dé lo mismo sin importar desde dónde se cargó.
- Una **partida abierta** es un cargo con saldo pendiente mayor a cero.

### 6.7 Consumos en cuenta
- Se anotan el menú del día (con el precio vigente de la lista del alumno), los productos de venta (reventa o receta con precio) y, solo la Dueña, consumos "Otro" con concepto e importe libres.
- El ayudante anota menú y productos. El importe lo pone el servidor.
- Los consumos del menú en cuenta **no cambian** los "menús pedidos" del día, que se siguen cargando aparte.

### 6.8 Caja
- Caja muestra **plata que entró y salió** (criterio de cobro). Con `cierre_dia` apagado, las ventas al contado se cargan como movimientos manuales si la Dueña quiere.
- **Cobros de cuenta corriente:** cada pago registrado en una cuenta crea automáticamente un movimiento `cobro_cuenta` en Caja (y se anula si se anula el pago).
- **Cierre del día (ventas de menús al contado; solo con el módulo oculto `cierre_dia` activo):** la app propone `(menús pedidos − menús anotados en cuentas ese día) × precio del menú` como venta de menús al contado. La Dueña confirma o corrige el importe y suma, si quiere, las ventas de kiosco al contado. Así no se cuentan dos veces los menús que se cobran por cuenta corriente.
- **Gastos fijos:** tipo `gasto_fijo` con subcategoría Sueldos, Gas u Otros.
- **Resumen del mes:** ingresos (contado + cobros), compras, gastos fijos, resultado de caja y, aparte, **deuda total de cuentas corrientes** al cierre.

### 6.9 Lista de compras
- Rango: "Esta semana", "Próxima semana" o fechas elegidas (solo días de lunes a viernes con cocina).
- Por cada día: menús pedidos (o `pedidos_por_defecto` si está vacío) × receta del plato y del postre. Se expande a través de las preparaciones hasta llegar a los insumos, sumando cantidades.
- Se suma la merma: cantidad a comprar = cantidad útil / (1 − merma).
- Se muestra en la unidad de compra, redondeado hacia arriba a 1 decimal (u: entero), más la cantidad de paquetes cuando la presentación no es 1 (por ejemplo, "13 u · 2 × 12 u").
- Se agrupa **por categoría o por proveedor** (selector).
- Costo estimado solo para la Dueña.
- Avisos: días con plato escrito a mano (no entran en la lista) y días sin menús pedidos.
- Casillas para tachar lo comprado (se guardan en el dispositivo) y un botón "Copiar lista" en texto plano para WhatsApp.

### 6.10 Menú
- Calendario de lunes a viernes. Las semanas que empiezan o terminan fuera del mes se muestran vacías.
- Editor del día: plato (receta tipo plato o "Escribir otro (sin costear)"), postre (ídem) y menús pedidos (placeholder con el valor por defecto). Interruptor "Este día no se cocina" con motivo: Feriado, Vacaciones, Paro u Otro (texto libre).
- **En calendario, Hoy, imagen y Excel, un día sin cocina muestra solo el motivo** (por ejemplo "Feriado"), nunca "Sin servicio".
- **Copiar mes anterior:** copia en orden los días con menú del mes anterior a los días hábiles vacíos del mes actual. No pisa días cargados ni copia los menús pedidos.
- Semáforo de costo por día (solo Dueña): verde si el costo es ≤ objetivo % del precio del menú, naranja si lo supera o está sin costear.

---

## 7. Pantallas

Navegación inferior con íconos. La Dueña y el Administrador ven **Hoy · Menú · Recetas · Insumos · Compras · Cuentas · Caja** (Caja solo con el módulo `caja` encendido). El ayudante ve **Hoy · Menú · Recetas · Insumos · Compras · Cuentas**. Ajustes queda en el ícono de engranaje del encabezado, solo para Dueña y Administrador. Con 7 pestañas, si no entran cómodas en 400 px de ancho, agrupá Caja y Ajustes bajo "Más".

**Hoy**
- Menú de hoy: plato, postre, menús pedidos y botón "Editar el día". Para la Dueña también costo por menú, ganancia por menú y semáforo.
- Si hoy no se cocina, muestra el motivo. Si es fin de semana, lo dice.
- Próximos 5 días hábiles.
- Solo Dueña: resumen del mes (costo promedio, ganancia promedio, días cargados, días sin costear), "Precios que cambiaron" en los últimos 30 días con % de suba o baja, e insumos sin precio.

**Menú:** calendario, editor de día, "Copiar mes anterior" y "Exportar menú" (sección 9).

**Recetas**
- Filtros: Platos · Postres · Preparaciones.
- Lista con costo por porción y % del precio del menú (Dueña).
- Editor con:
  - nombre, tipo y modo;
  - ingredientes, elegidos de los insumos y las preparaciones: cantidad, unidad filtrada por dimensión, costo de la línea (Dueña) y equivalencia;
  - resumen de costo;
  - "Se usa en" (otras recetas y días del menú);
  - precio de venta opcional (Dueña).
- Borrado con doble toque de confirmación y aviso si la receta está en uso.

**Insumos**
- Búsqueda, filtros (Todos · Materias primas · Reventa) y lista agrupada por categoría.
- Editor: nombre, categoría, proveedor, cómo se compra (cantidad + unidad), precio, merma % y "Lo vendo tal cual" con precio de venta.
- Vista previa del costo por 100 g, 100 ml o unidad, historial de precios y aviso "Al guardar se actualiza el costo de N recetas".
- **Carga rápida:**
  - filas con nombre, cantidad, unidad, precio, categoría y precio de venta (opcional);
  - "Pegar desde Excel": columnas separadas por tab, `;` o `|`, o una línea tipo "Tallarines 1 kg 300";
  - interpreta números con formato uruguayo (`1.300`, `1.250,50`, `$`), sinónimos de unidad (kilo, gr, lt, cc, unidad, docena = 12 u) y categorías por prefijo;
  - estado por fila ("Nuevo", "Ya existe: se actualiza el precio", "Falta el precio") y guardado en lote.
- **Actualizar precios:** lista de todos los insumos activos con solo el campo de precio (y la cantidad de compra editable), agrupada por proveedor o categoría. Muestra el precio anterior y la variación %, y guarda todos los cambios de una vez, cada uno en el historial.

**Compras:** según 6.9.

**Cuentas**
- Lista de alumnos con buscador y saldo (deudor en rojo, a favor en verde), ordenable por nombre o por deuda. Total adeudado arriba (Dueña y ayudante).
- Ficha del alumno:
  - saldo, partidas abiertas y movimientos;
  - botones "Anotar consumo" (menú de hoy con un toque, producto o, solo Dueña, "Otro") y "Registrar pago" (solo Dueña);
  - anular movimiento (solo Dueña) con motivo.
- Alta y edición de alumno: nombre, más nombre y teléfono del responsable (opcionales).
- **Estado de cuenta para los padres:** imagen PNG y PDF con nombre de la cantina, alumno, fecha de emisión, **partidas abiertas** (fecha, concepto, importe original, pendiente), saldo a favor si lo hay y total a pagar. El texto del teléfono del responsable se muestra para copiar; no depender de links `wa.me`.
- Excel de todas las cuentas: hoja "Saldos" (alumno, responsable, teléfono, saldo) y hoja "Partidas abiertas".

**Caja (solo Dueña, y solo si el módulo `caja` está encendido):** resumen del mes, alta y edición de movimientos y listado por mes. El botón "Cierre del día" aparece solo con `cierre_dia` activo.

**Ajustes**
- Dueña: nombre, precio del menú, menús por defecto, objetivo de costo % y proveedores.
- Administrador: usuarios, módulos ocultos, términos, "Exportar todo" y borrado general.

---

## 8. Diseño y UX
- Tomá el estilo del prototipo:
  - verde "pizarrón" como acento, amarillo para destacar "hoy", fondo neutro levemente verdoso;
  - tipografías Bricolage Grotesque (títulos) y Atkinson Hyperlegible (texto);
  - modo claro y oscuro.
- Mobile-first, botones de al menos 44–48 px y edición en hojas que suben desde abajo.
- Nunca usar `alert()` ni `confirm()`. Las confirmaciones destructivas van con doble toque ("Tocá de nuevo para borrar").
- Mensajes de error que digan qué pasó y cómo seguir, sin tecnicismos.
- Estados vacíos que expliquen qué cargar primero (Insumos → Recetas → Menú).
- Los números de dinero y cantidades van con `tabular-nums`.

---

## 9. Exportaciones
- **Imagen del menú (PNG):** calendario del mes con plato y postre por día y el motivo en los días sin cocina. **Sin precios.**
- **Excel del menú para las familias:** hoja "Calendario" (por semana: fila de fechas, fila Plato, fila Postre) y hoja "Lista" (Fecha, Día, Plato, Postre). **Sin precios ni costos.**
- **Excel interno del menú (solo Dueña):**
  - hoja "Calendario" igual a la de las familias, más las filas "Menús pedidos" y "Costo por menú";
  - hoja "Lista" con Fecha, Día, Plato, Postre, Estado, Menús pedidos, Costo plato, Costo postre, Costo por menú, Precio del menú, Ganancia por menú y Ganancia del día, más una fila de totales;
  - fechas como fecha real de Excel (`dd/mm/yyyy`) y montos con formato de moneda; cuidado con el corrimiento de zona horaria al escribir fechas.
- **Estado de cuenta (PNG/PDF) y Excel de cuentas:** ver sección 7.
- **Exportar todo (Administrador y Dueña):** un Excel con una hoja por entidad (insumos con precio actual, historial de precios, recetas, ingredientes, menú, alumnos, movimientos de cuenta y caja). Sirve de respaldo.
- Nombres de archivo: `menu-octubre-2026.xlsx`, `menu-octubre-2026-interno.xlsx`, `estado-cuenta-juan-perez-2026-10-15.pdf`.

---

## 10. Funcionamiento sin conexión
- PWA instalable y con caché de la app.
- Caché local (IndexedDB) de menú, recetas, insumos (sin precios para el ayudante), productos de venta, alumnos y saldos.
- **Sin conexión se puede:** ver Hoy, Menú, Recetas, Insumos y Compras; **anotar consumos y registrar pagos** en cuentas; cargar movimientos de caja.
- Esas altas van a una **cola local** con `client_uuid` y se envían solas al volver la conexión. El servidor ignora duplicados por `client_uuid`. Como son altas y no ediciones, no hay conflictos.
- Mientras haya envíos pendientes, se ve un indicador ("3 movimientos sin sincronizar") y los saldos afectados se marcan como provisorios.
- La edición de recetas, insumos, menú y ajustes requiere conexión. Sin conexión, esos botones se deshabilitan con un mensaje claro.

---

## 11. Datos iniciales
- La primera cantina, "La Cantina", empieza **vacía**: no hay datos para migrar del prototipo.
- Crear el usuario Administrador por script o seed, y desde la app la Dueña y los ayudantes.
- Un seed de demostración opcional, separado, con datos de ejemplo (los del prototipo) para probar en desarrollo.

---

## 12. Fases de entrega

Al final de cada fase, frená para revisión (regla 1.1).

| Fase | Contenido |
|---|---|
| **0. Base** | Repo, Vite + PWA, Supabase (esquema completo, RLS, roles, funciones), login, selector de cantina, layout con navegación y permisos por rol, diccionario de términos. **Mostrame las migraciones antes de aplicarlas.** |
| **1. Insumos y recetas** | Librería de costeo con tests, proveedores, insumos, historial de precios, carga rápida, actualizar precios, recetas con preparaciones y conversión porción/olla. |
| **2. Menú y Hoy** | Calendario, editor de día con motivos, copiar mes anterior, pantalla Hoy, congelamiento diario de costos (Edge Function + `pg_cron`), exportaciones del menú (PNG, Excel familias, Excel interno). |
| **3. Compras** | Lista de compras según 6.9. |
| **4. Cuentas corrientes** | Alumnos, consumos, pagos, imputación a lo más viejo, anulaciones, estado de cuenta PNG/PDF, Excel de cuentas. |
| **5. Caja** | Movimientos, cobros automáticos, gastos fijos, resumen mensual y cierre del día (oculto detrás de `cierre_dia`). |
| **6. Sin conexión** | Caché local, cola de envíos y sus indicadores. |
| **7. Ajustes y Administrador** | Usuarios, módulos ocultos (listas de precio, medio de pago, días fijos, términos, precio por plato, cierre del día, encendido de Caja) funcionando de punta a punta, exportar todo. |

---

## 13. Criterios de aceptación y tests mínimos

**Costeo**
- [ ] 1 kg de tallarines a $300 → 300 g = $90,00.
- [ ] Merma: 1 kg de cebolla a $55 con 10% → $0,0611 por g útil.
- [ ] Preparación en cascada: Tuco (rinde 3 l) usado a 150 ml por porción. Si sube la carne picada, suben el Tuco y el plato.
- [ ] Ciclo detectado: preparación A usa B y B usa A → error, no se guarda.
- [ ] Unidad incompatible (insumo en kg cargado en ml) → línea incompleta, plato "Sin costear".
- [ ] Porción → olla de 60: 120 g pasa a 7,2 kg. Olla → porción: vuelve a 120 g.
- [ ] Cambiar las porciones de la olla de 60 a 50 no cambia las cantidades; el costo por porción sube.

**Costo congelado**
- [ ] Al cambiar un precio hoy, los días pasados mantienen su costo y los futuros se actualizan.

**Cuentas corrientes**
- [ ] Cargos de $250 (día 1), $250 (día 2) y $90 (día 3); pago de $400 → día 1 pagado, día 2 con $100 pendientes, día 3 pendiente completo.
- [ ] Pago de $1.000 con deuda de $590 → $410 a favor. Un cargo nuevo de $250 queda pagado solo.
- [ ] Anular el cargo del día 1 → el pago se reimputa a los días 2 y 3.
- [ ] Mismo `client_uuid` enviado dos veces → un solo movimiento.

**Caja**
- [ ] Con `cierre_dia` activo: día con 60 menús pedidos, 10 anotados en cuentas y precio de $260 → el cierre propone $13.000 de venta al contado.
- [ ] Con `cierre_dia` apagado, no aparece ningún botón ni aviso de cierre.
- [ ] Con `caja` apagada, la pestaña no se ve, pero un pago en una cuenta corriente igual genera su `cobro_cuenta`.

**Permisos**
- [ ] Con sesión de ayudante, un `select` directo a `insumo_precios`, `menu_dia_costos` o `caja_movimientos` devuelve 0 filas.
- [ ] Ninguna pantalla del ayudante muestra costos ni precios de compra.
- [ ] El ayudante no puede registrar pagos ni consumos "Otro".
- [ ] Un usuario de la cantina A no ve ningún dato de la cantina B.

**Exportaciones**
- [ ] El Excel para las familias no contiene la palabra "precio" ni ningún importe.
- [ ] Las fechas del Excel coinciden con el día correcto (sin corrimiento por zona horaria).
- [ ] Un feriado aparece como "Feriado" en el calendario, la imagen y el Excel.

---

## 14. Fuera de alcance de esta versión
- Control de stock.
- Facturación electrónica.
- Platos alternativos por dietas especiales.
- Pagos en línea.
- Notificaciones push.
- Marcado de productos según la ley de alimentación saludable.
- Anotar el menú a muchos alumnos a la vez desde una lista (se evaluará más adelante).
