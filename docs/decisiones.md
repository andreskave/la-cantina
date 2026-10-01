# Decisiones y supuestos

Registro de lo que se decidió o asumió durante el desarrollo (regla 1.4 de la especificación).
Lo marcado **A confirmar** espera una respuesta.

## Fase 0

### Esquema

1. **Precio del menú: una sola fuente (`precios_venta`).** La especificación pide `precio_menu_cent` en
   `cantinas` y en `listas_precio`, y además `precios_venta` por producto y lista. Para no tener el mismo
   dato en tres lugares, el precio del menú es el `precios_venta` del producto "Menú del día" para cada lista,
   con `vigente_desde`. Ventajas: un precio nuevo no cambia la ganancia de días pasados ni lo ya anotado en
   cuentas, y el ayudante lo lee por el mismo camino que cualquier otro producto. **Confirmado (2026-10-01).**
2. **`productos_venta` con `insumo_id` y `receta_id`** en vez de un `ref_id` genérico, para tener claves
   foráneas reales. Un check garantiza que haya exactamente la referencia que corresponde al tipo.
3. **Claves foráneas compuestas `(cantina_id, x_id)`** en todas las relaciones entre tablas de datos: la base
   no permite relacionar filas de cantinas distintas, aunque alguien conozca un uuid ajeno.
4. **Al crear una cantina** se crean solos la lista "General" (default) y el producto "Menú del día".
5. **Cuentas corrientes solo por funciones.** Nadie inserta ni modifica `cuenta_movimientos` o `imputaciones`
   directo: se usa `anotar_consumo`, `registrar_pago` y `anular_movimiento` (`security definer`), que validan
   el rol, ponen el importe y son idempotentes por `client_uuid`. Borrar un movimiento está bloqueado
   (se anulan).
6. **Campos agregados:** `cuenta_movimientos.lista_id` (lista con la que se cobró), `cargado_at` (momento de
   carga, desempata la imputación y lo manda la cola offline), `anulado_at` y `anulado_por`;
   `imputaciones.alumno_id`; en `caja_movimientos`: `anulado`, `anulado_motivo` (el cobro se anula junto con
   el pago) y `client_uuid` (cola offline de caja).
7. **`alumnos.lista_id` vacío = lista por defecto.** Así, prender o apagar `listas_precio` no obliga a
   completar nada.
8. **Historial de precios de compra:** una fila por insumo y día (`unique (insumo_id, fecha)`); dos cambios el
   mismo día se resuelven con upsert.
9. **`menu_dia_costos.costo_total_cent`** es el costo por menú de la lista General; para otras listas se
   multiplica por `factor_porcion` al mostrarlo (no se guarda por lista).
10. **Borrado de insumos y recetas en uso:** las claves foráneas lo impiden (`restrict`). En la Fase 1 la app
    avisa y ofrece desactivar (`activo = false`) en lugar de borrar.
11. **Categorías de insumo como `enum`** con las 8 de la especificación. Si otro rubro necesita otras, se
    agregan valores con una migración.
12. **Módulos y términos:** un trigger impide que la Dueña cambie `cantinas.modulos` o `cantinas.terminos`
    (sí puede editar nombre, menús por defecto y objetivo de costo). El perfil solo deja cambiar el nombre;
    `es_admin_global` se pone por script.
13. **Fechas de fin de semana** no se bloquean en la base (la app solo muestra lunes a viernes), para no
    cerrarle la puerta a otros emprendimientos.
14. **Sin anon:** el rol `anon` no tiene acceso a ninguna tabla ni función.

### Permisos del ayudante

15. **Confirmado (2026-10-01):** el ayudante **no** carga los "menús pedidos" del día (Menú y Hoy son solo
    lectura para él) y **no** da de alta ni edita alumnos. La especificación dice "ver" para esas pantallas y
    solo menciona "anotar consumos" como escritura.

### Interfaz

16. **Navegación:** las 7 pestañas entran sin cortarse en 360 px de ancho (la letra baja a 10,5 px en
    pantallas de 380 px o menos), así que no hizo falta el "Más".
17. **Cerrar sesión y cambiar de cantina** están en un botón de usuario en el encabezado, visible para todos
    los roles (el ayudante no tiene Ajustes).
18. **Recuperar contraseña:** no hay envío de email; el login explica que la cambia el administrador.
    El registro público está apagado (`enable_signup = false`; en el proyecto real también hay que apagarlo
    en el panel de Supabase).
19. **Formato de dinero:** siempre con centésimos (`$ 1.234,50`); los negativos como `-$ 410,00`. Hay una
    opción sin centésimos para totales y resúmenes.
20. **Tipografías locales** (`@fontsource`) en vez de Google Fonts, para que la app funcione sin conexión.

### Pruebas

21. **Tests de base de datos con PGlite** (Postgres en memoria), con un esquema `auth` mínimo que imita a
    Supabase. Corren con `npm test` sin Docker ni proyecto remoto. `pg_cron` no existe en PGlite: el
    congelamiento diario (Fase 2) va en una migración aparte que se prueba contra Supabase.

## Fase 1

22. **Guardado atómico por funciones** (`guardar_insumo`, `guardar_insumos_lote`, `guardar_receta`,
    `fijar_precio_venta`, `fijar_precio_menu`). Son *security invoker*: la RLS sigue mandando. La carga
    rápida y "Actualizar precios" guardan todo o nada; una receta se guarda junto con sus ingredientes, así
    que un ciclo detectado por la base no deja la receta a medias.
23. **Historial de precios:** solo se agrega una fila si cambia el precio, la cantidad o la unidad respecto
    del vigente. La merma no va al historial (es del insumo, no de la compra).
24. **El costo usa la cantidad y unidad del precio vigente** (la de la última compra), no la de
    `insumos.cantidad_compra`; las dos se guardan iguales al editar.
25. **Ciclos:** la app los detecta antes de guardar y muestra el camino ("Tuco → Puré → Tuco"); la base los
    vuelve a controlar.
26. **Borrar vs. desactivar:** si un insumo o una receta están en uso (en recetas o en días del menú), no se
    muestra "Borrar" sino la opción "Desactivado". Lo desactivado sigue costeando las recetas que lo usan,
    pero no aparece para elegir en recetas nuevas.
27. **Equivalencia en modo porción:** "para N porciones" usa los menús por defecto de la cantina (o 60 si no
    están cargados).
28. **De porción a olla** se pregunta cuántas porciones rinde la olla (propone los menús por defecto) antes de
    multiplicar. Si la receta no tiene cantidades todavía, se cambia directo.
29. **Carga rápida:** si un nombre ya existe, se actualizan cantidad, unidad y precio, y se conservan la
    categoría, el proveedor y la merma. Si la fila trae precio de venta, el insumo pasa a reventa. Si el
    mismo nombre aparece dos veces, vale la última fila.
30. **Variación en "Actualizar precios":** se compara el precio por unidad base, así que cambiar de 1 kg a
    5 kg no se ve como una suba del 400%.
31. **Modo demostración** (`npm run demo`): la app con datos de ejemplo en memoria y elección de rol, sin
    Supabase. No entra en el build de producción. Los mismos datos se pueden cargar en Supabase con
    `node scripts/seed-demo.ts`.

## Fase 2

32. **Qué congela el cron:** cada noche congela solo **el día anterior** de cada cantina. Si ese día ya tiene
    un costo congelado (por ejemplo, porque la Dueña tocó "Recalcular este día"), no lo pisa. Si una noche el
    cron no corre, ese día queda "Sin costear" hasta que la Dueña lo recalcule a mano. No se congelan días
    atrasados automáticamente, porque se haría con precios de otra fecha.
33. **"Recalcular este día"** se hace desde la app con la misma librería: guarda el día como está en el
    editor y congela su costo con los precios de hoy (si queda incompleto, borra el congelado y el día pasa a
    "Sin costear"). Pide doble toque.
34. **Editar un día pasado no cambia su costo congelado.** El editor muestra el costo congelado y, como
    referencia, cuánto daría con los precios de hoy.
35. **Hora del cron:** 03:15 UTC = 00:15 en Montevideo (Uruguay no tiene horario de verano desde 2015).
    Necesita dos secretos en Vault (`project_url` y `service_role_key`); está explicado en la migración 08.
36. **La Edge Function importa la librería de `src/lib`** (por eso esos archivos usan imports con extensión
    `.ts`). Está chequeada con Deno (`deno check`) y la librería corre en Deno, pero la función todavía no se
    probó contra Supabase.
37. **Ganancia de días pasados:** usa el precio del menú vigente ese día (historial de `precios_venta`).
38. **Menús pedidos vacíos:** en el resumen, la ganancia del día y el Excel interno se usan los menús por
    defecto de la cantina; en pantalla se aclara "(por defecto)".
39. **Copiar mes anterior** no pisa ningún día que ya tenga fila, aunque sea "sin cocina". Si hay más días
    de origen que días vacíos, se copian los primeros.
40. **Exportaciones:** el Excel y la imagen se arman en el teléfono. La imagen tiene "Guardar imagen" y,
    si el celular lo permite, "Compartir" (hoja de compartir del sistema, por ejemplo WhatsApp). SheetJS se
    instala desde el CDN oficial de SheetJS: la versión de npm está abandonada y tiene avisos de seguridad.
41. **El ayudante** ve el calendario y Hoy sin ningún costo; al tocar un día ve plato, postre y menús
    pedidos en solo lectura. Puede bajar la imagen y el Excel para las familias, no el interno.

## Fase 3

42. **"Esta semana"** va de hoy (o del lunes, si es fin de semana) al viernes: no incluye los días que ya
    pasaron. **"Próxima semana"** es de lunes a viernes de la siguiente.
43. **Unidad de la lista:** la de compra, pasada a la más legible (1150 ml → 1,2 l; 340 g de algo que se
    compra por kg → 340 g), redondeada hacia arriba a 1 decimal (unidades a entero). Los paquetes se cuentan
    redondeando hacia arriba ("73 u · 7 × 12 u").
44. **Días sin menús pedidos:** si hay valor por defecto se usan esos menús y se avisa qué días fueron; si no
    hay valor por defecto, el día no entra y se avisa.
45. **Costo estimado:** la cantidad exacta a comprar (con merma) por el precio vigente, no los paquetes
    enteros. Los insumos sin precio se listan y se avisa que no entran en el total.
46. **Unidad incompatible** entre receta e insumo: la línea no se suma y aparece un aviso para revisarla.
47. **Las casillas tachadas** se guardan en el dispositivo por cantina y por rango de fechas.

## Fase 4

48. **Concepto del menú en la cuenta:** se guarda con el plato de ese día ("Menú: Tallarines con tuco"),
    así el estado de cuenta para las familias dice qué se consumió. Lo hace un trigger (migración 09). Si la
    Dueña escribe otro concepto, se respeta.
49. **La imputación existe dos veces:** en la base (`reimputar_alumno`, la que vale) y en TypeScript
    (`src/lib/cuentas.ts`, para el modo demo y, en la Fase 6, para los saldos provisorios sin conexión). Un
    test carga los datos de ejemplo en la base y comprueba que las dos den exactamente lo mismo.
50. **Estado de cuenta:** muestra solo lo que falta pagar (partidas abiertas: fecha, concepto, importe
    original y pendiente), el saldo a favor si hay y el total a pagar. Se genera en el teléfono como imagen
    (con "Compartir" si el celular lo permite) y como PDF.
51. **Excel de cuentas** y **estado de cuenta**: los puede bajar también el ayudante, porque ya ve los saldos.
52. **Fecha de consumos y pagos:** por defecto hoy; se puede elegir un día anterior (no futuro), para
    cargar algo que quedó sin anotar.
53. **Alumnos que ya no vienen:** se marcan como inactivos. Salen de la lista si su cuenta está en cero;
    si deben o tienen saldo a favor, siguen apareciendo (atenuados).
54. **Anular** pide motivo y doble toque. Si es un pago, también queda anulado su cobro en Caja.
55. **Partes opcionales de jsPDF** (HTML y SVG a PDF) no se precachean en la PWA: la app no las usa.

## Fase 5

56. **Cierre del día:** la propuesta usa los menús pedidos del día (o los de por defecto, y lo aclara) menos
    los menús anotados en cuentas ese día, por el precio del menú vigente ese día. Se guardan dos ventas al
    contado separadas: "Menús al contado (N)" y "Kiosco al contado". Hacer el cierre de nuevo para el mismo día
    **reemplaza** el anterior (no se duplica). Lo hace la función `guardar_cierre_dia` (migración 10).
57. **Deuda de cuentas en el resumen:** para meses pasados es la deuda al último día del mes; para el mes en
    curso, la de hoy. Se calcula con los movimientos hasta esa fecha (`deuda_cuentas_al`); los saldos a favor
    no la achican. Si después se anula un movimiento viejo, la deuda de ese mes también cambia.
58. **Cobros de cuentas en Caja:** no se editan ni se borran desde Caja (al tocarlos se explica que se anulan
    desde la cuenta). Los movimientos manuales y los del cierre sí se editan y se borran (con doble toque).
59. **Medio de pago:** con el módulo prendido se pide en pagos, movimientos y cierre, y el resumen muestra el
    neto en efectivo y por transferencia (más "sin medio de pago" para lo cargado antes de prenderlo).
60. **Fechas en Caja:** no se aceptan fechas futuras.
61. **Modo demo:** en la pantalla de entrada se pueden prender y apagar Caja, Cierre del día y Medio de pago
    para probarlos (en la app real eso lo hace el Administrador en la Fase 7).

## Fase 6

62. **Caché en el dispositivo:** se guarda en IndexedDB todo lo que la app cargó (React Query persistido con
    Dexie), por usuario: si entra otra persona en el mismo teléfono, la caché anterior se descarta. Dura hasta
    30 días. Al dueño le quedan guardados también los precios de compra; al ayudante la base nunca se los manda.
63. **Precarga:** al abrir la app con conexión se traen productos, alumnos, saldos, recetas, insumos, el menú
    de este mes y el siguiente y la caja del mes, aunque no se entre a esas pantallas, para que estén
    disponibles sin conexión. Los movimientos de cada alumno se guardan solo si se abrió su ficha.
64. **Qué se puede hacer sin conexión:** anotar consumos, registrar pagos y cargar movimientos **nuevos** de
    caja. Editar o borrar un movimiento de caja, anular, el cierre del día y todo lo de insumos, recetas, menú,
    alumnos y ajustes necesita conexión: el botón se deshabilita y se explica por qué.
65. **Cola:** cada alta se guarda primero en el dispositivo y se intenta enviar enseguida. Si no hay
    conexión, se envía sola al volver internet (y cada 30 segundos mientras quede algo), en el orden en que se
    cargó. Antes de enviar se renueva la sesión si venció.
66. **Si el servidor rechaza un alta** que se cargó sin conexión (por ejemplo, un producto que se quedó sin
    precio), queda marcada en la lista "Sin sincronizar" con el motivo, para que la persona la descarte y la
    vuelva a cargar bien. No se reintenta sola.
67. **Importe provisorio:** mientras un consumo no se envía, se muestra con el precio que la app tiene guardado;
    el definitivo lo pone el servidor al recibirlo. Los saldos y partidas afectados dicen "provisorio".
68. **Cerrar sesión con pendientes:** se avisa que se pierden y se pide doble toque. Al cerrar sesión se borra
    toda la información local (caché y cola).
69. **Sesión sin conexión:** si al abrir la app no hay internet, se entra con los datos de usuario y cantinas
    de la última vez en ese dispositivo.

## Fase 7

70. **Usuarios:** los administra el Administrador desde Ajustes, con la Edge Function `admin-usuarios` (service
    role). Al crear un usuario se genera una contraseña temporal que se muestra **una sola vez** para pasársela;
    no se mandan emails. Si el email ya tiene usuario (por ejemplo, de otra cantina), solo se lo agrega con el rol
    elegido y conserva su contraseña. "Generar contraseña nueva" sirve para quien se la olvidó.
71. **Listas de precio:** un producto sin precio en la lista del alumno se cobra al de la General (también el
    menú). El costo de cada lista es el de la General × su factor de porción. Los pedidos del día se cargan por
    lista y `menu_dias.pedidos` guarda el total. La lista de compras usa la porción promedio de cada día.
72. **Resúmenes con listas:** costo promedio, ganancia del mes, semáforo y Excel interno siguen en la lista
    General. El editor del día muestra además costo, precio y ganancia de cada lista, y el cierre del día calcula
    lista por lista.
73. **Precio por plato:** el menú se cobra al precio de venta del plato del día si lo tiene; si no, al precio del
    menú. Combinado con listas, un plato sin precio propio en "Grandes" se cobra a su precio General (no al
    precio del menú de Grandes). **A confirmar.** Para la ganancia de días pasados se usa el precio actual del
    plato (el del menú sí tiene historial).
74. **Días fijos:** un cron anota el menú a las 9:00 de Montevideo de lunes a viernes (migración 12, dentro de la
    base). No anota si ese día no se cocina, si no hay menú o si el alumno ya tiene un menú anotado, y no
    duplica si se corre dos veces. La Dueña puede forzarlo con "Días fijos de hoy" en Cuentas.
75. **Términos:** cambian lo que se lee en pantalla, el estado de cuenta y el Excel de cuentas. Lo que ya quedó
    guardado no cambia (por ejemplo, el concepto "Menú: …" de los consumos) ni el respaldo de "Exportar todo".
76. **Borrado general (solo Administrador):** "Vaciar datos" deja la cantina con sus usuarios, módulos y listas;
    "Borrar cantina" la elimina entera. Los dos piden escribir el nombre de la cantina y doble toque.
77. **Exportar todo** lo pueden usar la Dueña y el Administrador; necesita conexión.
78. **Funciones `security definer`:** para saber si las llama un usuario de la app se usa `auth.uid()`, no
    `current_user` (que adentro de esas funciones es el dueño). Se encontró y corrigió en `anotar_dias_fijos`.
