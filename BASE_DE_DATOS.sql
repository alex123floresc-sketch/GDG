-- =============================================================================
--  GESTOR DE GASTOS — BASE DE DATOS COMPLETA (Supabase / PostgreSQL)
-- =============================================================================
--
--  Esquema al día con la app v0.13.1.
--
--  CÓMO USARLO
--  -----------
--  Supabase → SQL Editor → New query → pega TODO este archivo → Run.
--
--  * Sirve para una base VACÍA (crea todo desde cero) y para tu base ACTUAL
--    (solo agrega lo que falte). Es idempotente: puedes ejecutarlo las veces
--    que quieras; no borra ni duplica datos.
--  * Reemplaza a supabase/migraciones/v0.7.sql, v0.11.sql y v0.13.sql (esos
--    quedan solo como historial). Si la app te avisa "Falta actualizar tu
--    base de datos", basta con ejecutar este archivo completo.
--  * La sección 3 (BORRADO TOTAL) está comentada a propósito: pegar el
--    archivo entero NUNCA borra nada. Lee sus instrucciones antes de usarla.
--
--  Cada vez que una función nueva de la app necesite cambios en la base, se
--  agregan AQUÍ (y se anota en el HISTORIAL de abajo).
--
--  HISTORIAL
--  ---------
--  v0.1   transacciones, categorias, cuentas, presupuestos (creadas a mano)
--  v0.7   fecha_actualizacion, tarjetas de crédito, transferencias, dólares;
--         tablas metas, deudas, recurrentes
--  v0.11  transacciones.etiquetas, deudas.gasto_dividido
--  v0.13  recurrentes.dia_mes (recurrentes del 29, 30 o 31)
--  v0.13.1 script único; índices por usuario; permisos explícitos
-- =============================================================================


-- #############################################################################
-- 1. TABLAS
-- #############################################################################
-- Orden: primero las tablas a las que otras apuntan (categorias, cuentas).
-- Cada tabla: CREATE TABLE IF NOT EXISTS con todas sus columnas (base vacía)
-- + ALTER TABLE ... ADD COLUMN IF NOT EXISTS (base que ya existía).

-- -----------------------------------------------------------------------------
-- 1.1 Categorías (cada usuario tiene las suyas)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categorias (
  id                  uuid PRIMARY KEY,
  user_id             uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  nombre              text NOT NULL,
  tipo                text NOT NULL,
  icono               text,
  color               text,
  fecha_actualizacion timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.categorias
  ADD COLUMN IF NOT EXISTS icono               text,
  ADD COLUMN IF NOT EXISTS color               text,
  ADD COLUMN IF NOT EXISTS fecha_actualizacion timestamptz NOT NULL DEFAULT now();

-- tipo: 'ingreso' | 'gasto' | 'ambos'
ALTER TABLE public.categorias DROP CONSTRAINT IF EXISTS categorias_tipo_check;
ALTER TABLE public.categorias ADD CONSTRAINT categorias_tipo_check
  CHECK (tipo IN ('ingreso', 'gasto', 'ambos')) NOT VALID;

-- -----------------------------------------------------------------------------
-- 1.2 Cuentas (efectivo, banco, billeteras, tarjetas de crédito)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cuentas (
  id                  uuid PRIMARY KEY,
  user_id             uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  nombre              text NOT NULL,
  tipo                text NOT NULL,
  saldo_inicial       numeric(12, 2) NOT NULL DEFAULT 0,
  -- Solo tarjetas de crédito:
  limite_credito      numeric(12, 2),
  dia_corte           smallint CHECK (dia_corte BETWEEN 1 AND 31),
  dia_pago            smallint CHECK (dia_pago BETWEEN 1 AND 31),
  fecha_actualizacion timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cuentas
  ADD COLUMN IF NOT EXISTS saldo_inicial       numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS limite_credito      numeric(12, 2),
  ADD COLUMN IF NOT EXISTS dia_corte           smallint CHECK (dia_corte BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS dia_pago            smallint CHECK (dia_pago BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS fecha_actualizacion timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.cuentas DROP CONSTRAINT IF EXISTS cuentas_tipo_check;
ALTER TABLE public.cuentas ADD CONSTRAINT cuentas_tipo_check
  CHECK (tipo IN ('efectivo', 'banco', 'billetera_digital', 'tarjeta_credito', 'otro')) NOT VALID;

-- -----------------------------------------------------------------------------
-- 1.3 Transacciones
-- -----------------------------------------------------------------------------
-- monto: SIEMPRE en soles. Si se registró en dólares: moneda = 'USD' y
-- monto_original / tipo_cambio guardan el original.
-- Transferencias: dos filas con el mismo transferencia_id y sin categoría.
CREATE TABLE IF NOT EXISTS public.transacciones (
  id                  uuid PRIMARY KEY,
  user_id             uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  cuenta_id           uuid REFERENCES public.cuentas (id),
  categoria_id        uuid REFERENCES public.categorias (id),
  monto               numeric(12, 2) NOT NULL,
  tipo                text NOT NULL,
  fecha               timestamptz NOT NULL,
  concepto            text NOT NULL DEFAULT '',
  nro_operacion       text,
  origen              text NOT NULL DEFAULT 'manual',
  moneda              text NOT NULL DEFAULT 'PEN',
  monto_original      numeric(12, 2),
  tipo_cambio         numeric(10, 4),
  transferencia_id    uuid,
  recurrente_id       uuid,
  etiquetas           text[] NOT NULL DEFAULT '{}',
  fecha_actualizacion timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transacciones
  ADD COLUMN IF NOT EXISTS nro_operacion       text,
  ADD COLUMN IF NOT EXISTS origen              text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS moneda              text NOT NULL DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS monto_original      numeric(12, 2),
  ADD COLUMN IF NOT EXISTS tipo_cambio         numeric(10, 4),
  ADD COLUMN IF NOT EXISTS transferencia_id    uuid,
  ADD COLUMN IF NOT EXISTS recurrente_id       uuid,
  ADD COLUMN IF NOT EXISTS etiquetas           text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS fecha_actualizacion timestamptz NOT NULL DEFAULT now();

-- Las transferencias no tienen categoría; las descargadas antiguas, cuenta.
ALTER TABLE public.transacciones ALTER COLUMN categoria_id DROP NOT NULL;
ALTER TABLE public.transacciones ALTER COLUMN cuenta_id DROP NOT NULL;

ALTER TABLE public.transacciones DROP CONSTRAINT IF EXISTS transacciones_tipo_check;
ALTER TABLE public.transacciones ADD CONSTRAINT transacciones_tipo_check
  CHECK (tipo IN ('ingreso', 'gasto')) NOT VALID;

ALTER TABLE public.transacciones DROP CONSTRAINT IF EXISTS transacciones_origen_check;
ALTER TABLE public.transacciones ADD CONSTRAINT transacciones_origen_check
  CHECK (origen IN ('manual', 'yape', 'transferencia', 'recurrente')) NOT VALID;

ALTER TABLE public.transacciones DROP CONSTRAINT IF EXISTS transacciones_moneda_check;
ALTER TABLE public.transacciones ADD CONSTRAINT transacciones_moneda_check
  CHECK (moneda IN ('PEN', 'USD')) NOT VALID;

-- -----------------------------------------------------------------------------
-- 1.4 Presupuestos (límite mensual por categoría de gasto)
-- -----------------------------------------------------------------------------
-- mes (1-12) / anio = desde cuándo rige.
CREATE TABLE IF NOT EXISTS public.presupuestos (
  id                  uuid PRIMARY KEY,
  user_id             uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  categoria_id        uuid NOT NULL REFERENCES public.categorias (id) ON DELETE CASCADE,
  monto_limite        numeric(12, 2) NOT NULL,
  mes                 smallint NOT NULL CHECK (mes BETWEEN 1 AND 12),
  anio                smallint NOT NULL,
  fecha_actualizacion timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.presupuestos
  ADD COLUMN IF NOT EXISTS fecha_actualizacion timestamptz NOT NULL DEFAULT now();

-- -----------------------------------------------------------------------------
-- 1.5 Metas de ahorro
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.metas (
  id                  uuid PRIMARY KEY,
  user_id             uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  nombre              text NOT NULL,
  monto_objetivo      numeric(12, 2) NOT NULL CHECK (monto_objetivo > 0),
  fecha_limite        date,
  icono               text,
  color               text,
  -- [{ id, fecha, monto, nota }] — monto negativo = retiro
  aportes             jsonb NOT NULL DEFAULT '[]'::jsonb,
  fecha_actualizacion timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 1.6 Deudas y préstamos (me deben / debo)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deudas (
  id                  uuid PRIMARY KEY,
  user_id             uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  persona             text NOT NULL,
  tipo                text NOT NULL CHECK (tipo IN ('me_deben', 'debo')),
  monto               numeric(12, 2) NOT NULL CHECK (monto > 0),
  concepto            text,
  fecha               date NOT NULL,
  fecha_limite        date,
  -- [{ id, fecha, monto, nota }] — pagos parciales
  abonos              jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- true = nació de dividir un gasto (se cobra desde la cuenta "Por cobrar")
  gasto_dividido      boolean NOT NULL DEFAULT false,
  fecha_actualizacion timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deudas
  ADD COLUMN IF NOT EXISTS gasto_dividido boolean NOT NULL DEFAULT false;

-- -----------------------------------------------------------------------------
-- 1.7 Movimientos recurrentes (Netflix, alquiler, sueldo…)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recurrentes (
  id                  uuid PRIMARY KEY,
  user_id             uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  tipo                text NOT NULL CHECK (tipo IN ('ingreso', 'gasto')),
  monto               numeric(12, 2) NOT NULL CHECK (monto > 0),
  moneda              text NOT NULL DEFAULT 'PEN' CHECK (moneda IN ('PEN', 'USD')),
  categoria_id        uuid NOT NULL REFERENCES public.categorias (id) ON DELETE CASCADE,
  cuenta_id           uuid NOT NULL REFERENCES public.cuentas (id) ON DELETE CASCADE,
  concepto            text NOT NULL,
  frecuencia          text NOT NULL CHECK (frecuencia IN ('semanal', 'quincenal', 'mensual', 'anual')),
  proxima_fecha       date NOT NULL,
  -- Día elegido (mensual/anual) cuando proxima_fecha quedó recortada
  -- (regla del 31 → 30 de abril): así mayo vuelve al 31.
  dia_mes             smallint CHECK (dia_mes IS NULL OR dia_mes BETWEEN 1 AND 31),
  activa              boolean NOT NULL DEFAULT true,
  fecha_actualizacion timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recurrentes
  ADD COLUMN IF NOT EXISTS dia_mes smallint CHECK (dia_mes IS NULL OR dia_mes BETWEEN 1 AND 31);


-- #############################################################################
-- 2. ÍNDICES, SEGURIDAD (RLS) Y PERMISOS
-- #############################################################################

-- -----------------------------------------------------------------------------
-- 2.1 Índices
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS categorias_user_idx    ON public.categorias (user_id);
CREATE INDEX IF NOT EXISTS cuentas_user_idx       ON public.cuentas (user_id);
CREATE INDEX IF NOT EXISTS transacciones_user_fecha_idx
  ON public.transacciones (user_id, fecha DESC);
CREATE INDEX IF NOT EXISTS transacciones_transferencia_idx
  ON public.transacciones (transferencia_id) WHERE transferencia_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transacciones_etiquetas_idx
  ON public.transacciones USING gin (etiquetas);
CREATE INDEX IF NOT EXISTS presupuestos_user_idx  ON public.presupuestos (user_id);
CREATE INDEX IF NOT EXISTS metas_user_idx         ON public.metas (user_id);
CREATE INDEX IF NOT EXISTS deudas_user_idx        ON public.deudas (user_id);
CREATE INDEX IF NOT EXISTS recurrentes_user_idx   ON public.recurrentes (user_id);

-- Anti-duplicados del importador de Yape: un nro_operacion por usuario.
-- (Los NULL no chocan entre sí.) Solo se crea si la base no tiene ya un
-- índice único equivalente, para no duplicarlo.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'transacciones'
      AND indexdef ILIKE '%UNIQUE%'
      AND indexdef ILIKE '%(user_id, nro_operacion)%'
  ) THEN
    CREATE UNIQUE INDEX transacciones_user_nro_operacion_key
      ON public.transacciones (user_id, nro_operacion);
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2.2 Seguridad por fila (RLS): cada usuario solo ve y toca lo suyo
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  tabla text;
BEGIN
  FOREACH tabla IN ARRAY ARRAY[
    'categorias', 'cuentas', 'transacciones', 'presupuestos',
    'metas', 'deudas', 'recurrentes'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tabla);
    EXECUTE format('DROP POLICY IF EXISTS "Acceso personal" ON public.%I', tabla);
    EXECUTE format(
      'CREATE POLICY "Acceso personal" ON public.%I FOR ALL TO authenticated
         USING ((SELECT auth.uid()) = user_id)
         WITH CHECK ((SELECT auth.uid()) = user_id)',
      tabla
    );
    -- La app solo trabaja con usuarios que iniciaron sesión.
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tabla);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 2.3 Recarga el caché de la API para que vea los cambios de inmediato
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- -----------------------------------------------------------------------------
-- 2.4 Comprobación: debe mostrar 7 filas, todas con rls = true
-- -----------------------------------------------------------------------------
SELECT c.relname                                   AS tabla,
       c.relrowsecurity                            AS rls,
       (SELECT count(*) FROM information_schema.columns col
         WHERE col.table_schema = 'public' AND col.table_name = c.relname) AS columnas
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('categorias', 'cuentas', 'transacciones', 'presupuestos',
                    'metas', 'deudas', 'recurrentes')
ORDER BY 1;


-- #############################################################################
-- 3. BORRADO TOTAL  ⚠️  IRREVERSIBLE  ⚠️
-- #############################################################################
-- Está dentro de un comentario /* ... */ para que no se ejecute al pegar el
-- archivo completo. Para usarlo:
--   1. Copia SOLO el bloque que quieras (3A o 3B), SIN las líneas /* y */.
--   2. Pégalo en una consulta NUEVA del SQL Editor y ejecútalo.
--   3. Luego, si quieres volver a empezar, ejecuta las secciones 1 y 2.
-- Antes de borrar: en la app, espera a que diga "En línea" (sin pendientes)
-- o no te importará perder lo que no se haya sincronizado. Recuerda que cada
-- dispositivo guarda una copia local: tras borrar, cierra sesión en todos
-- (al cerrar sesión se limpia esa copia) para que no vuelvan a subirla.

/*
-- ---------- 3A. VACIAR: borra TODOS los datos, conserva tablas y usuarios --
TRUNCATE TABLE
  public.transacciones,
  public.presupuestos,
  public.recurrentes,
  public.metas,
  public.deudas,
  public.categorias,
  public.cuentas
RESTART IDENTITY CASCADE;
*/

/*
-- ---------- 3B. ELIMINAR TODO: tablas, datos y (opcional) usuarios --------
-- Primero lo que apunta a otras tablas, al final categorias/cuentas.
DROP TABLE IF EXISTS public.transacciones CASCADE;
DROP TABLE IF EXISTS public.presupuestos  CASCADE;
DROP TABLE IF EXISTS public.recurrentes   CASCADE;
DROP TABLE IF EXISTS public.metas         CASCADE;
DROP TABLE IF EXISTS public.deudas        CASCADE;
DROP TABLE IF EXISTS public.categorias    CASCADE;
DROP TABLE IF EXISTS public.cuentas       CASCADE;

-- Tabla "profiles" de la plantilla de Supabase (la app no la usa). Si
-- existe un trigger que la llena al registrarse, se quita antes: si no,
-- crear cuentas nuevas fallaría con "relation profiles does not exist".
DROP TRIGGER  IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP TABLE    IF EXISTS public.profiles CASCADE;

NOTIFY pgrst, 'reload schema';

-- OPCIONAL: borra también TODAS las cuentas de usuario (correo/contraseña).
-- Quita los dos guiones de la línea siguiente solo si de verdad lo quieres.
-- DELETE FROM auth.users;
*/
