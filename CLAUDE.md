# Gestor de Gastos

PWA de control de finanzas personales. Offline-first: Dexie.js (IndexedDB) es
la fuente de verdad local — la app funciona sin conexión y sincroniza con
Supabase cuando hay red.

Repo: https://github.com/alex123floresc-sketch/GDG

## Stack

- Vite 8 + React 19 + TypeScript
- Fomantic UI 2.9 (`fomantic-ui-css`, fork mantenido de Semantic UI) — solo CSS
- Dexie.js + dexie-react-hooks (IndexedDB)
- Supabase (Auth + Postgres) vía `@supabase/supabase-js`
- vite-plugin-pwa (manifest + Service Worker)

## UI (Fomantic / Semantic UI)

- Se usan las clases de Semantic directamente en JSX (`className="ui teal button"`).
  NO se usa `semantic-ui-react`: su última versión (2.1.5) solo soporta
  React ≤18 y depende de `findDOMNode`, que React 19 eliminó.
- Tampoco se usa el JS de Fomantic (requiere jQuery): dropdowns son
  `<select className="ui dropdown">` nativos, tabs/estado se manejan con
  React.
- `main.tsx` importa solo el CSS de los componentes usados
  (`fomantic-ui-css/components/*.min.css`); si se usa un componente nuevo
  de Semantic, agregar su import ahí. Estilos propios en `src/index.css`.
- Iconos: fuente de iconos de Semantic (`<i className="bus icon" />`).
  `Categoria.icono` guarda el nombre del icono (ya no emojis; Dexie v4
  migra las categorías viejas). Verificar que el nombre exista en
  `fomantic-ui-css/components/icon.min.css` (p. ej. es `chartline`, no
  `chart line`: un nombre inválido se ve como un círculo vacío).
- **Tema claro/oscuro**: `utils/tema.ts` resuelve el tema (auto/claro/
  oscuro, guardado en `preferencias`) y pone `<html data-theme="light|dark">`
  antes del primer render (`main.tsx`); botón en el Header. En
  `index.css`, `:root[data-theme='dark']` redefine los tokens y hay un
  bloque de ajustes a componentes de Fomantic (traen colores claros
  fijos). Todo color nuevo debe salir de una variable, no de un hex suelto.
  Botones primarios usan `--color-boton` (no `--color-marca`, que en
  oscuro es demasiado claro para texto blanco).
- Paleta: variables CSS en `:root` de `src/index.css` (índigo como marca).
  `index.css` sobrescribe los colores de `.ui.primary/.green/.red` de
  Semantic con esa paleta; usar `primary` para acciones principales (ya
  no `teal`). Colores de series de gráficos: `--serie-ingreso`,
  `--serie-gasto`, `--serie-balance`. Colores de categorías:
  `categoriaService.COLORES_CATEGORIA` (8 tonos validados para daltonismo
  + gris; mantener ese orden).
- Navegación principal en `Dashboard.tsx`: 5 secciones (Inicio,
  Movimientos, Análisis, Planificar → Presupuestos/Metas/Deudas/
  Recurrentes, Más → Cuentas/Categorías/Importar Yape); en móvil (<768px)
  la barra pasa al pie de pantalla. Registrar es el botón flotante "+"
  (abre `FormularioTransaccion` en un `Modal`).
- Gráficos: SVG propio en `src/components/graficos/` (sin librería de
  gráficos, para no inflar el bundle): `GraficoBarras` (ingresos vs.
  gastos por periodo), `GraficoDona` (reparto por categoría, agrupa en
  "Otras" pasado `maxPorciones`), `GraficoLinea` (balance acumulado).
  Tooltip/leyenda en `comun.tsx`; hook `useAncho` y escalas en
  `utilidades.ts`. Todo gráfico va acompañado de leyenda y de una tabla
  con los mismos datos (el color nunca es la única pista).
- Iconos de la app/PWA: `public/favicon.svg` es la fuente; los PNG/ICO se
  regeneran con `npx pwa-assets-generator` (config en
  `pwa-assets.config.ts`).

## Estructura

- `src/components` — UI: `Header`, `Auth`, `Dashboard` (orquesta el resto),
  `FormularioTransaccion` (gasto/ingreso/transferencia, S/ o US$, crear y
  editar/eliminar), `ResumenFinanciero`, `ListaTransacciones` (agrupada por
  día, clic = editar), `Analisis` (vista mensual/trimestral + exportación),
  `GestionCategorias`, `GestionCuentas` (saldos, tarjetas de crédito),
  `planificar/` (`Planificar` + un panel por pestaña), `BarraProgreso`,
  `Inicio` (tarjeta principal con saldo total y mes, accesos rápidos,
  cuentas, resumen inteligente, presupuestos, metas, gráficos),
  `VistaMovimientos` (búsqueda, filtros avanzados, lista/calendario,
  exportar lo filtrado), `CalendarioGastos`, `ResumenInteligente`,
  `Modal` (modal de Fomantic sin jQuery, vía portal), `Avisos` (toasts;
  se usan con `useAvisos().avisar(...)`), `graficos/`, `YapeImporter`
  (cargado con `React.lazy`, ver Rendimiento)
- `src/db/database.ts` — esquema Dexie v7 (`GestorGastosDB`, tablas
  `transacciones`, `categorias`, `cuentas`, `presupuestos`, `metas`,
  `deudas`, `recurrentes`, `eliminacionesPendientes`)
- `src/services` — lógica sin React: `supabaseClient.ts`, `syncService.ts`,
  `transaccionService.ts` (+ transferencias, eliminar/restaurar),
  `categoriaService.ts`, `cuentaService.ts`, `presupuestoService.ts`,
  `metaService.ts`, `deudaService.ts`, `recurrenteService.ts`,
  `sincronizable.ts` (`marcaCambio`, `registrarBorrado`,
  `uuidDeterminista`), `yapeImporter.ts`, `exportService.ts`
- `src/hooks` — `useSync`, `useTransacciones`, `useCategorias`,
  `useCuentas`, `useAvisos`, `useNumeroAnimado`, `usePlanificacion` (`usePresupuestos`,
  `useMetas`, `useDeudas`, `useRecurrentes`)
- `src/types/index.ts` — única fuente de tipos del dominio
- `src/utils/formato.ts` — formato de moneda (`es-PE`/PEN), fecha y %
- `src/utils/analisis.ts` — agregaciones puras (por mes/trimestre, por
  categoría, últimos N meses); las usan tanto la UI como la exportación.
  `esMovimientoReal(t)` excluye las transferencias de todo resumen.
- `src/utils/cuentas.ts` — tipos de cuenta (icono/etiqueta), saldos y
  `estadoTarjeta` (deuda, línea disponible, ciclo, próximo pago)
- `src/utils/planificacion.ts` — `estadoPresupuestos` (gastado, nivel
  ok/alerta 80 %/excedido, proyección a fin de mes), `estadoMeta` (ahorro
  mensual necesario), `estadoDeuda`
- `src/utils/filtros.ts` — `FiltrosMovimientos`, `aplicarFiltros`
  (periodo, tipo, categoría, cuenta, origen, montos, texto sin tildes),
  chips legibles de los filtros activos
- `src/utils/insights.ts` — `generarInsights`: observaciones del "resumen
  inteligente" con prioridad y destino (sección a la que lleva)
- `src/utils/preferencias.ts` — preferencias del dispositivo en
  localStorage (tipo de cambio, tema), siempre en try/catch
- `supabase/migraciones/` — SQL a ejecutar a mano en el SQL Editor

## Convenciones

- Todo el código de dominio (variables, funciones, componentes de negocio)
  está en español: `Transaccion`, `Categoria`, `crearTransaccion`,
  `sincronizar`.
- Los tipos TS del dominio usan camelCase (`usuarioId`, `categoriaId`,
  `nroOperacion`, `fechaActualizacion`); Supabase usa snake_case
  (`user_id`, `categoria_id`, `nro_operacion`, `fecha_actualizacion`).
  `syncService.ts` (`aFilaRemota`/`aTransaccionLocal`) es el único lugar que
  traduce entre ambos — no dupliques ese mapeo en otro archivo.
- `Transaccion.categoriaId` referencia `Categoria.id` y `Transaccion.cuentaId`
  referencia `Cuenta.id`, ambas por usuario (ver siguiente punto). `origen`:
  `'manual'`, `'yape'` (importada), `'transferencia'` o `'recurrente'`.
- **Transferencias**: dos transacciones unidas por `transferenciaId` (gasto
  en la cuenta origen + ingreso en la destino), `categoriaId: ''`. Mueven
  saldos pero NO cuentan como ingreso/gasto: todo resumen/gráfico/
  presupuesto filtra con `esMovimientoReal`. Editar/eliminar una pata
  afecta a las dos (`actualizarTransferencia`, `eliminarTransaccion`).
- **Monedas**: `Transaccion.monto` está SIEMPRE en soles (lo que usan saldos
  y resúmenes). Si se registró en dólares, `moneda: 'USD'`,
  `montoOriginal` y `tipoCambio` guardan el original.
- **Tarjetas de crédito**: `Cuenta` con `tipo: 'tarjeta_credito'`; saldo
  negativo = deuda. Pagar la tarjeta = transferencia banco → tarjeta.
- `sincronizado` (boolean) NO está indexado en Dexie — IndexedDB no admite
  booleans como clave de índice. Se filtra con `.filter()` en memoria.
- Multiusuario: `Transaccion`, `Categoria` y `Cuenta` tienen `usuarioId`
  (indexado, Dexie schema v3). `categorias`/`cuentas` ya NO son una
  taxonomía global compartida — cada usuario tiene su propia copia, que se
  sincroniza con las tablas remotas `categorias`/`cuentas`. Al iniciar
  sesión, `App.tsx` primero llama a `syncService.descargarCatalogos` y
  solo si el usuario sigue sin ninguna siembra las de por defecto
  (`categoriaService.asegurarCategoriasPorDefecto` /
  `cuentaService.asegurarCuentasPorDefecto`). Los hooks/servicios
  siempre reciben `usuarioId` de forma explícita, nunca lo infieren de un
  estado global.
- `supabaseClient.ts` exporta `supabase: SupabaseClient | null`. Si faltan
  las env vars, es `null` y la app debe seguir funcionando 100% offline —
  nunca lanzar en el nivel de módulo (rompería el arranque completo).

## Importador de Yape (`yapeImporter.ts` + `YapeImporter.tsx`)

- Usa `xlsx` (SheetJS) — instalado desde `cdn.sheetjs.com`, NO desde el
  registro de npm: la última versión publicada en npm (0.18.5) tiene 2
  vulnerabilidades conocidas sin fix (prototype pollution + ReDoS). Si se
  reinstala o actualiza, mantener esa fuente
  (`npm install https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz`), no
  hacer `npm install xlsx` a secas.
- El parseo de columnas es heurístico (busca encabezados que calcen con
  regex de fecha/monto/concepto/operación/tipo), no una lista fija de
  nombres de columna exactos — los reportes de Yape pueden variar. No se
  probó contra un archivo real de Yape; si el formato real difiere,
  ajustar los regex en `yapeImporter.ts` (`RE_FECHA`, `RE_MONTO`, etc.).
- Anti-duplicados: se verifica `[usuarioId+nroOperacion]` en Dexie antes de
  insertar (índice compuesto en `database.ts`). Filas sin número de
  operación se descartan (se cuentan en `erroresFilas`).

## Categorías personalizadas y Análisis

- `GestionCategorias` permite crear/editar/eliminar categorías (nombre
  único por usuario, sin distinguir mayúsculas/tildes). Eliminar una
  categoría con transacciones exige reasignarlas a otra
  (`categoriaService.eliminarCategoria`); las reasignadas se marcan
  `sincronizado: false` para que el nuevo `categoria_id` suba a Supabase.
- `Analisis` agrupa por mes o trimestre del año elegido; el filtro de
  cuenta del Dashboard también aplica. Exporta a Excel
  (`exportService.exportarAnalisisExcel`: hojas Resumen, Gastos por
  categoría, Ingresos por categoría, Detalle) y a PDF vía
  `window.print()` (estilos `@media print` en `index.css`; `.no-imprimir`
  / `.solo-imprimir`).
- Dexie v5 recolorea las categorías por defecto a la paleta nueva (solo
  las que conservan el color viejo) y corrige el icono `chart line`.

## Planificar (v0.8)

- **Presupuestos**: uno por categoría de gasto (`guardarPresupuesto` crea
  o actualiza); es un límite mensual que rige para todos los meses
  (`mes`/`anio` = desde cuándo). Al crear se sugiere el promedio de los
  últimos 3 meses.
- **Metas**: `aportes` es un arreglo en la propia meta (jsonb remoto);
  monto negativo = retiro. No mueven saldos de cuentas.
- **Deudas**: `tipo` `me_deben`/`debo`, `abonos` en la propia deuda. Al
  registrar un cobro/pago se puede crear además la transacción (ingreso o
  gasto) en una cuenta.
- **Recurrentes**: `useRecurrentes` (llamado siempre desde `Dashboard`)
  ejecuta `generarRecurrentesPendientes` cuando hay reglas activas con
  `proximaFecha <= hoy`: crea las transacciones (`origen: 'recurrente'`,
  `recurrenteId`) y avanza la fecha. El id de cada ocurrencia es
  `uuidDeterminista(recurrenteId + fecha)`: si dos dispositivos generan la
  misma, no se duplica. Máx. 36 ocurrencias por ejecución.

## Movimientos, calendario y resumen inteligente (v0.9)

- `VistaMovimientos` recibe TODAS las transacciones (no usa el filtro de
  cuenta del Inicio: la cuenta es uno de sus filtros). En modo calendario
  se ignora el periodo (el calendario navega por meses).
- `CalendarioGastos`: intensidad por día con una escala secuencial de un
  solo tono (`color-mix` de `--serie-gasto` con la superficie), texto
  siempre oscuro por contraste; punto verde = día con ingresos.
- `generarInsights` (Inicio): ritmo de gasto vs. el mismo día del mes
  pasado, proyección de cierre, categoría que más subió vs. su promedio
  de 3 meses, mayor gasto, presupuestos, pago de tarjetas, deudas,
  recurrentes próximos y metas. Todo local; excluye transferencias.

## Registro rápido y pulido (v0.10)

- El botón "+" (y la tecla **N** fuera de campos de texto) abre el
  registro en un modal con `permitirContinuar` ("Registrar otro después"
  deja el formulario abierto). El formulario sugiere montos frecuentes de
  la categoría elegida y conceptos previos (`<datalist>`).
- Transiciones: cada sección entra con `.entrada-seccion`; todas las
  animaciones se anulan con `prefers-reduced-motion`.

## Autenticación y multiusuario

- `App.tsx` gestiona la sesión con `supabase.auth.onAuthStateChange` +
  `getSession()`. Sin sesión → `<Auth />`; con sesión → `<Dashboard />`.
- Al cerrar sesión (`App.manejarCerrarSesion`):
  1. Si hay red, sube pendientes (mejor esfuerzo, no bloquea el logout).
  2. `signOut({ scope: 'local' })` — evita depender de red para salir
     (app offline-first).
  3. `transaccionService.limpiarDatosLocales()` — limpia **todas las
     tablas** de Dexie para que, en un dispositivo compartido, el siguiente
     usuario no vea datos de la sesión anterior. Al volver a iniciar sesión
     se descargan de Supabase (y solo si no hay nada se siembran las
     categorías/cuentas por defecto).

## Rendimiento

- `YapeImporter` se carga con `React.lazy` desde `Dashboard.tsx`: `xlsx`
  pesa ~370kB y solo lo necesitan las sesiones que abren el importador, así
  que no va en el bundle inicial. `exportService` hace lo mismo con
  `await import('xlsx')` al pulsar "Exportar Excel". Si se agregan más dependencias pesadas
  de uso ocasional, seguir el mismo patrón en vez de importarlas arriba del
  archivo.

## Variables de entorno

`.env.local` (gitignorado; plantilla en `.env.example`):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## Esquema remoto (Supabase)

No hay SQL versionado del esquema inicial (se creó a mano en el panel);
lo que se sabe de él se dedujo consultando PostgREST. Tablas: `transacciones`,
`categorias`, `cuentas`, `presupuestos`, `profiles` (no usada), todas con
`id uuid` y `user_id uuid` + RLS por usuario. `transacciones.cuenta_id` y
`transacciones.categoria_id` son UUID con **llave foránea** a `cuentas` y
`categorias`: deben subirse antes que las transacciones.

Particularidades que el cliente respeta:
- `transacciones.concepto` es NOT NULL (en la app es opcional): se envía
  `''` si no hay. `nro_operacion` viaja como `null` (no `''`): el índice
  único `(user_id, nro_operacion)` trataría todos los `''` como duplicados.
- Las columnas `tipo` tienen CHECK; deben aceptar los valores de
  `TipoCategoria`/`TipoCuenta`. El CHECK original de `categorias` no
  aceptaba `'ambos'` (error 23514 que bloqueaba toda la sincronización).
  Si se agrega un valor nuevo a esos tipos, ampliar el CHECK.

### Migración v0.7 (`supabase/migraciones/v0.7.sql`)

Idempotente; se ejecuta a mano en el SQL Editor. Agrega
`fecha_actualizacion` a `categorias`/`cuentas`/`presupuestos`, columnas
de tarjeta en `cuentas`, `moneda`/`monto_original`/`tipo_cambio`/
`transferencia_id`/`recurrente_id` en `transacciones` (y `categoria_id`
pasa a admitir NULL), amplía los CHECK de `tipo`/`origen`/`moneda`, y crea
`metas`, `deudas`, `recurrentes` con RLS. Si se necesitan más cambios de
esquema, crear `v0.X.sql` nuevo (no editar uno ya ejecutado).

**Sin la migración la app sigue funcionando** ("modo legado"):
`syncService.esquemaV7()` lo detecta con consultas `limit 0`; se
sincronizan transacciones/categorías/cuentas como antes y `App.tsx` muestra
un aviso. Las transacciones que usan columnas nuevas (dólares,
transferencias) fallan individualmente sin bloquear al resto.

## Sincronización (`useSync` + `syncService`)

- `useSync` sincroniza al iniciar sesión, al evento `online`, al volver a
  la pestaña (`visibilitychange`) y **cada vez que hay cambios locales
  pendientes** en cualquier tabla (conteo con `useLiveQuery`, 1,5 s de
  espera y reintento cada 60 s).
- Header: estado (En línea / Pendiente N / Error / Sin conexión) y botón
  "Sincronizar ahora". `App.tsx` muestra el error completo (código,
  detalle, pista de PostgREST) con botón para copiarlo.
- Siempre con el `user_id` de `supabase.auth.getSession()` (debe coincidir
  con `usuarioId`). Los mapeos (`aFilaTransaccion` y la config `Entidad`
  de cada tabla) son listas blancas: `sincronizado` nunca viaja.
- **Transacciones**: cola `sincronizado === false` → upsert por lote; si
  falla por un error de datos, fila por fila (una mala no bloquea al
  resto). Al marcar como sincronizada se compara `fechaActualizacion` para
  no perder una edición hecha mientras se subía. Luego se descargan las 200
  más recientes (sin pisar pendientes ni borradas localmente) y
  `reconciliarBorradosTransacciones` elimina localmente las sincronizadas
  que ya no están en el servidor (borradas en otro dispositivo); por
  seguridad no hace nada si no leyó la lista completa de ids o si borraría
  una proporción sospechosa.
- **Resto de entidades** (esquema v7): `sincronizarEntidad` descarga todo,
  resuelve conflictos por "gana la `fechaActualizacion` más reciente",
  borra localmente lo que ya no existe remoto (si estaba sincronizado) y
  sube lo pendiente. Los servicios deben poner `sincronizado: false` +
  `fechaActualizacion: new Date()` en cada alta/edición.
- **Borrados**: se registran en `eliminacionesPendientes` y se replican en
  orden (`ORDEN_BORRADO`: primero lo que referencia a categorías/cuentas).
  Un error de llave foránea deja el borrado para el siguiente ciclo.
- Orden del ciclo: categorías/cuentas (con `fusionarCatalogo`, que une las
  sembradas por separado en dos dispositivos por nombre+tipo) → re-apuntar
  referencias rotas → subir transacciones → borrados → presupuestos/
  recurrentes/metas/deudas → descargar transacciones. Los errores de una
  entidad no detienen a las demás; se lanzan juntos al final.
- Hay pruebas de todo esto con un Supabase simulado en memoria (no están
  en el repo; se ejecutaron con `fake-indexeddb` + `tsx`).

## Comandos

- `npm run dev` — servidor de desarrollo
- `npm run build` — `tsc -b && vite build`
- `npm run preview` — sirve el build de producción

## Pendientes conocidos

- Deploy en Vercel: no hecho (requiere login del usuario en vercel.com).
- Migración `supabase/migraciones/v0.7.sql`: el usuario debe ejecutarla
  en su proyecto de Supabase (ver "Esquema remoto").
- El chunk principal (`index-*.js`) sigue por encima de 500kB (aviso de
  Vite) por `@supabase/supabase-js`; `xlsx` ya se separó con
  `React.lazy` (ver Rendimiento) pero el resto no se ha optimizado.
- Recurrentes mensuales: si el día original no existe en un mes (31 →
  30), la regla guarda la fecha recortada y los meses siguientes usan ese
  día (no vuelve al 31).
- El importador de Yape no se probó contra un archivo real exportado desde
  la app (ver sección "Importador de Yape").

## Flujo de trabajo con git (pedido explícitamente por el usuario)

Cada cambio de código implementado a pedido del usuario se commitea y se
sube a `origin/main` en GitHub:

1. Bump de `version` en `package.json` (semver: patch para fixes, minor
   para features, major para cambios que rompen compatibilidad).
2. Commit con mensaje descriptivo, prefijado con la versión
   (`vX.Y.Z: descripción`).
3. Tag anotado `vX.Y.Z` con un nombre corto de la release
   (`git tag -a vX.Y.Z -m "..."`).
4. `git push origin main --tags`.

No se hace squash ni se reescribe historial. Un pedido grande puede generar
más de un commit si tiene partes independientes, pero cada uno se tagea por
separado.
