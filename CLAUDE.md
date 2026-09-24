# Gestor de Gastos

PWA de control de finanzas personales. Offline-first: Dexie.js (IndexedDB) es
la fuente de verdad local — la app funciona sin conexión y sincroniza con
Supabase cuando hay red.

Repo: https://github.com/alex123floresc-sketch/GDG

## Stack

- Vite 8 + React 19 + TypeScript
- Tailwind CSS 4 (`@tailwindcss/vite`)
- Dexie.js + dexie-react-hooks (IndexedDB)
- Supabase (Auth + Postgres) vía `@supabase/supabase-js`
- vite-plugin-pwa (manifest + Service Worker)

## Estructura

- `src/components` — UI: `Header`, `Auth`, `FormularioTransaccion`,
  `ResumenFinanciero`, `ListaTransacciones`
- `src/db/database.ts` — esquema Dexie (`GestorGastosDB`, tablas
  `transacciones` y `categorias`)
- `src/services` — lógica sin React: `supabaseClient.ts`, `syncService.ts`,
  `transaccionService.ts`
- `src/hooks` — `useSync`, `useTransacciones`, `useCategorias`
- `src/types/index.ts` — única fuente de tipos del dominio
- `src/utils/formato.ts` — formato de moneda (`es-PE`/PEN) y fecha

## Convenciones

- Todo el código de dominio (variables, funciones, componentes de negocio)
  está en español: `Transaccion`, `Categoria`, `crearTransaccion`,
  `sincronizar`.
- `Transaccion.categoria` referencia `Categoria.id` (ids fijos como
  `cat-alimentacion`, sembrados vía `db.on('populate')` en `database.ts`).
- `sincronizado` (boolean) NO está indexado en Dexie — IndexedDB no admite
  booleans como clave de índice. Se filtra con `.filter()` en memoria.
- Cada usuario autenticado tiene su propio `usuarioId` en `Transaccion`
  (indexado, Dexie schema v2). Los hooks/servicios siempre reciben
  `usuarioId` de forma explícita, nunca lo infieren de un estado global.
- `supabaseClient.ts` exporta `supabase: SupabaseClient | null`. Si faltan
  las env vars, es `null` y la app debe seguir funcionando 100% offline —
  nunca lanzar en el nivel de módulo (rompería el arranque completo).

## Autenticación y multiusuario

- `App.tsx` gestiona la sesión con `supabase.auth.onAuthStateChange` +
  `getSession()`. Sin sesión → `<Auth />`; con sesión → app completa.
- Al cerrar sesión (`App.manejarCerrarSesion`):
  1. Si hay red, sube pendientes (mejor esfuerzo, no bloquea el logout).
  2. `signOut({ scope: 'local' })` — evita depender de red para salir
     (app offline-first).
  3. `transaccionService.limpiarDatosLocales()` — limpia `transacciones`
     local para que, en un dispositivo compartido, el siguiente usuario no
     vea datos de la sesión anterior.

## Variables de entorno

`.env.local` (gitignorado; plantilla en `.env.example`):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## Tabla remota (Supabase)

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

No existe tabla remota de `categorias` — es una taxonomía local fija (ver
`CATEGORIAS_INICIALES` en `database.ts`), no sincroniza con Supabase.

`syncService.ts` siempre envía/filtra por `user_id`; requiere que la política
RLS de arriba esté activa (no la versión relajada `USING (true)` que se usó
temporalmente antes de implementar autenticación).

## Comandos

- `npm run dev` — servidor de desarrollo
- `npm run build` — `tsc -b && vite build`
- `npm run preview` — sirve el build de producción

## Pendientes conocidos

- Iconos PWA siguen siendo `favicon.svg` (sin PNG 192x192/512x512 reales).
- Deploy en Vercel: no hecho (requiere login del usuario en vercel.com).
- Bundle de producción supera 500kB (aviso de Vite) por
  `@supabase/supabase-js`; no se ha aplicado code-splitting.

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
