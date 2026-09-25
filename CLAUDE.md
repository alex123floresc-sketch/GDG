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
- Paleta: variables CSS en `:root` de `src/index.css` (índigo como marca).
  `index.css` sobrescribe los colores de `.ui.primary/.green/.red` de
  Semantic con esa paleta; usar `primary` para acciones principales (ya
  no `teal`). Colores de series de gráficos: `--serie-ingreso`,
  `--serie-gasto`, `--serie-balance`. Colores de categorías:
  `categoriaService.COLORES_CATEGORIA` (8 tonos validados para daltonismo
  + gris; mantener ese orden).
- Navegación principal en `Dashboard.tsx`: 5 secciones (Inicio,
  Registrar, Movimientos, Análisis, Más → subpestañas Categorías /
  Importar Yape); en móvil (<768px) la barra pasa al pie de pantalla.
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
  `FormularioTransaccion`, `ResumenFinanciero`, `ListaTransacciones`,
  `Analisis` (vista mensual/trimestral + exportación),
  `GestionCategorias` (crear/editar/eliminar categorías), `graficos/`,
  `YapeImporter` (cargado con `React.lazy`, ver Rendimiento)
- `src/db/database.ts` — esquema Dexie v6 (`GestorGastosDB`, tablas
  `transacciones`, `categorias`, `cuentas`, `presupuestos`,
  `eliminacionesPendientes`)
- `src/services` — lógica sin React: `supabaseClient.ts`, `syncService.ts`,
  `transaccionService.ts`, `categoriaService.ts`, `cuentaService.ts`,
  `yapeImporter.ts`, `exportService.ts` (Excel del análisis)
- `src/hooks` — `useSync`, `useTransacciones`, `useCategorias`, `useCuentas`
- `src/types/index.ts` — única fuente de tipos del dominio
- `src/utils/formato.ts` — formato de moneda (`es-PE`/PEN), fecha y %
- `src/utils/analisis.ts` — agregaciones puras (por mes/trimestre, por
  categoría, últimos N meses); las usan tanto la UI como la exportación

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
  referencia `Cuenta.id`, ambas por usuario (ver siguiente punto). `origen`
  distingue transacciones creadas a mano (`'manual'`) de las importadas
  desde un reporte de Yape (`'yape'`).
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

## Autenticación y multiusuario

- `App.tsx` gestiona la sesión con `supabase.auth.onAuthStateChange` +
  `getSession()`. Sin sesión → `<Auth />`; con sesión → `<Dashboard />`.
- Al cerrar sesión (`App.manejarCerrarSesion`):
  1. Si hay red, sube pendientes (mejor esfuerzo, no bloquea el logout).
  2. `signOut({ scope: 'local' })` — evita depender de red para salir
     (app offline-first).
  3. `transaccionService.limpiarDatosLocales()` — limpia **las 4 tablas**
     (`transacciones`, `categorias`, `cuentas`, `presupuestos`) para que,
     en un dispositivo compartido, el siguiente usuario no vea datos de la
     sesión anterior. Se re-siembran al volver a iniciar sesión.

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

## Tabla remota (Supabase)

Definición original (`categoria` como texto libre, sin `cuenta_id`/
`concepto`/`nro_operacion`/`origen`):

```sql
CREATE TABLE transacciones (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
    monto DECIMAL(12,2) NOT NULL,
    tipo VARCHAR(10) CHECK (tipo IN ('ingreso', 'gasto')),
    categoria VARCHAR(50) NOT NULL,
    fecha TIMESTAMP WITH TIME ZONE NOT NULL,
    nota TEXT,
    fecha_actualizacion TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE transacciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acceso personal" ON transacciones
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

**Migración pendiente** (`syncService.ts` ya asume estas columnas; ejecutar
en el SQL Editor de Supabase — `cuenta_id`/`categoria_id` quedan como TEXT,
no UUID con FK, porque `categoria` ya tenía valores de texto libre que no
son UUIDs válidos y castearlos rompería filas existentes):

```sql
ALTER TABLE transacciones RENAME COLUMN categoria TO categoria_id;
ALTER TABLE transacciones ADD COLUMN cuenta_id TEXT;
ALTER TABLE transacciones ADD COLUMN concepto TEXT;
ALTER TABLE transacciones ADD COLUMN nro_operacion TEXT;
ALTER TABLE transacciones ADD COLUMN origen VARCHAR(20) NOT NULL DEFAULT 'manual';

-- Solo si 'nota' ya no tiene datos que te importe conservar (se reemplazó
-- por 'concepto' en el cliente):
-- ALTER TABLE transacciones DROP COLUMN nota;

-- Habilita el manejo de duplicados por (usuario, n° de operación) que
-- syncService.subirUnaPorUna espera (error Postgres 23505):
CREATE UNIQUE INDEX transacciones_user_nro_operacion_idx
  ON transacciones (user_id, nro_operacion)
  WHERE nro_operacion IS NOT NULL;
```

Tablas remotas `categorias` y `cuentas` (ya existen en el proyecto de
Supabase; esquema deducido por PostgREST, no hay SQL versionado en el
repo). `transacciones.cuenta_id` y `transacciones.categoria_id` son UUID
con **llave foránea** a ellas, así que deben subirse antes que las
transacciones:

- `categorias`: `id uuid`, `user_id uuid`, `nombre`, `tipo`, `icono`, `color`
- `cuentas`: `id uuid`, `user_id uuid`, `nombre`, `tipo`, `saldo_inicial numeric`

`presupuestos` también existe remotamente pero la app aún no la usa.

Las columnas `tipo` tienen CHECK en Supabase y deben aceptar los valores
del dominio de la app (`TipoCategoria` / `TipoCuenta` en `types/index.ts`).
El CHECK original de `categorias` no incluía `'ambos'` (error 23514 que
bloqueaba toda la sincronización); corrección a ejecutar en el SQL Editor:

```sql
ALTER TABLE categorias DROP CONSTRAINT categorias_tipo_check;
ALTER TABLE categorias ADD CONSTRAINT categorias_tipo_check
  CHECK (tipo IN ('ingreso', 'gasto', 'ambos'));

ALTER TABLE cuentas DROP CONSTRAINT IF EXISTS cuentas_tipo_check;
ALTER TABLE cuentas ADD CONSTRAINT cuentas_tipo_check
  CHECK (tipo IN ('efectivo', 'banco', 'billetera_digital', 'otro')) NOT VALID;
```

Si se agrega un valor nuevo a `TipoCategoria`/`TipoCuenta`, hay que
ampliar también estos CHECK o la sincronización falla.

## Sincronización (`useSync` + `syncService`)

- `useSync` sincroniza al iniciar sesión, al evento `online`, al volver a
  la pestaña (`visibilitychange`) y **cada vez que hay transacciones
  pendientes** (observa con `useLiveQuery` el conteo de
  `sincronizado === false`, con 1,5 s de espera y reintento cada 60 s).
  Así una transacción registrada a mano sube sin recargar la página.
- El Header muestra el estado (En línea / Pendiente N / Error / Sin
  conexión) y el botón "Sincronizar ahora"; `App.tsx` muestra el mensaje
  de error de la última sincronización.
- `syncService.subirTransaccionesPendientes` toma el `user_id` de
  `supabase.auth.getSession()` (y exige que coincida con `usuarioId`).
  `aFilaRemota` es una lista blanca tipada como `FilaTransaccionRemota`:
  campos locales como `sincronizado` nunca se envían. `sincronizado` es
  boolean en Dexie (no 0/1) y se pone en `true` justo después de que el
  upsert responde sin error.
- Orden de `sincronizar` (importa por las llaves foráneas): fusionar
  categorías/cuentas remotas → subirlas → re-apuntar pendientes con
  referencias rotas a "Otros"/primera cuenta → subir transacciones →
  replicar borrados (`eliminacionesPendientes`) → descargar transacciones.
- `fusionarCatalogo`: si una categoría/cuenta local solo existe en este
  dispositivo y coincide en nombre+tipo con una remota (típico de las
  sembradas por defecto sin red), se adopta el id remoto y se re-apuntan
  sus transacciones; así no se duplican.
- `describirError` traduce los errores de PostgREST (`23503` = llave
  foránea): `PGRST204`/`42703` =
  falta la migración SQL, `42501` = rechazo de RLS.

`syncService.ts` siempre envía/filtra por `user_id`; requiere que la política
RLS de arriba esté activa (no la versión relajada `USING (true)` que se usó
temporalmente antes de implementar autenticación).

## Comandos

- `npm run dev` — servidor de desarrollo
- `npm run build` — `tsc -b && vite build`
- `npm run preview` — sirve el build de producción

## Pendientes conocidos

- Deploy en Vercel: no hecho (requiere login del usuario en vercel.com).
- **Migración SQL de Supabase sin ejecutar** (ver sección "Tabla remota"):
  hasta que se aplique, la sincronización de transacciones fallará porque
  `syncService.ts` ya envía `categoria_id`/`cuenta_id`/`concepto`/
  `nro_operacion`/`origen`, columnas que la tabla remota original no tiene.
- El chunk principal (`index-*.js`) sigue por encima de 500kB (aviso de
  Vite) por `@supabase/supabase-js`; `xlsx` ya se separó con
  `React.lazy` (ver Rendimiento) pero el resto no se ha optimizado.
- `presupuestos`: solo existe el esquema en Dexie y el tipo `Presupuesto`;
  no hay UI ni servicio para crearlos/consultarlos todavía.
- El importador de Yape no se probó contra un archivo real exportado desde
  la app (ver sección "Importador de Yape").
- Categorías/cuentas: no hay marca de tiempo remota, así que si el mismo
  registro se edita en dos dispositivos gana el último que sincroniza
  (cada ciclo sube todas las locales).

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
