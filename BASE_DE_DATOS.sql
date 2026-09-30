-- =============================================================================
--  GESTOR DE GASTOS — BASE DE DATOS COMPLETA (Supabase / PostgreSQL)
-- =============================================================================
--
--  Esquema al día con la app v0.24.0.
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
--  v0.14  tabla chanchitos; tipo de cuenta 'chanchito'
--  v0.16  categorias.padre_id (subcategorías); tablas reglas y plantillas
--  v0.17  categorias.clase (regla 50/30/20); tabla ajustes
--  v0.18  tabla cuotas (compras en cuotas)
--  v0.19  tabla deseos (lista de deseos)
--  v0.20  cuentas.icono y cuentas.color (ícono o logo de cada cuenta)
--  v0.21  transacciones.ubicacion (dónde fue el gasto)
--  v0.23  transacciones.recibo + bucket de Storage 'recibos' (foto del
--         recibo); tabla suscripciones_push (recordatorios en el celular);
--         sección 4 (opcional): programar los recordatorios con pg_cron
--  v0.24  tabla cuentas_compartidas (compartir una cuenta por correo),
--         funciones puede_ver_cuenta / comparte_cuenta_con /
--         aceptar_invitacion / salir_de_cuenta y sus políticas (2.4)
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
  ADD COLUMN IF NOT EXISTS fecha_actualizacion timestamptz NOT NULL DEFAULT now(),
  -- Subcategoría: id de la categoría madre (un solo nivel). Sin llave
  -- foránea a propósito: madre e hija pueden subir en cualquier orden.
  ADD COLUMN IF NOT EXISTS padre_id            uuid,
  -- Regla 50/30/20: 'necesidad' | 'deseo' (NULL = la app la estima)
  ADD COLUMN IF NOT EXISTS clase               text;

ALTER TABLE public.categorias DROP CONSTRAINT IF EXISTS categorias_clase_check;
ALTER TABLE public.categorias ADD CONSTRAINT categorias_clase_check
  CHECK (clase IS NULL OR clase IN ('necesidad', 'deseo')) NOT VALID;

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
  ADD COLUMN IF NOT EXISTS fecha_actualizacion timestamptz NOT NULL DEFAULT now(),
  -- Ícono de Semantic UI o 'logo:<banco>' (NULL = según el tipo/nombre)
  ADD COLUMN IF NOT EXISTS icono               text,
  ADD COLUMN IF NOT EXISTS color               text;

ALTER TABLE public.cuentas DROP CONSTRAINT IF EXISTS cuentas_tipo_check;
ALTER TABLE public.cuentas ADD CONSTRAINT cuentas_tipo_check
  CHECK (tipo IN ('efectivo', 'banco', 'billetera_digital', 'tarjeta_credito', 'otro', 'chanchito')) NOT VALID;

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
  ubicacion           jsonb,
  -- Ruta de la foto en el bucket 'recibos' ('<user_id>/<id>.jpg') o NULL
  recibo              text,
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
  ADD COLUMN IF NOT EXISTS fecha_actualizacion timestamptz NOT NULL DEFAULT now(),
  -- { lat, lng, lugar } o NULL
  ADD COLUMN IF NOT EXISTS ubicacion           jsonb,
  ADD COLUMN IF NOT EXISTS recibo              text;

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


-- -----------------------------------------------------------------------------
-- 1.8 Chanchitos (alcancías; distintos de las metas: sin objetivo ni fecha)
-- -----------------------------------------------------------------------------
-- tipo 'cuenta': el dinero está apartado en una cuenta de sistema
--   (cuentas.tipo = 'chanchito', cuenta_id); echar/sacar son transferencias.
-- tipo 'fisico': alcancía de verdad; solo se anotan los movimientos.
CREATE TABLE IF NOT EXISTS public.chanchitos (
  id                  uuid PRIMARY KEY,
  user_id             uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  nombre              text NOT NULL,
  icono               text,
  color               text,
  tipo                text NOT NULL CHECK (tipo IN ('cuenta', 'fisico')),
  cuenta_id           uuid REFERENCES public.cuentas (id) ON DELETE SET NULL,
  -- Solo físicos: [{ id, fecha, monto, nota }] — monto negativo = sacaste
  movimientos         jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Reto de ahorro: { tipo: 'semanas52'|'diario'|'monedas', monto_base,
  --   inicio, duracion, cumplidos: [...] } o NULL
  reto                jsonb,
  archivado           boolean NOT NULL DEFAULT false,
  fecha_actualizacion timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 1.9 Reglas automáticas (si el concepto contiene…, poner esta categoría)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reglas (
  id                  uuid PRIMARY KEY,
  user_id             uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  patron              text NOT NULL,
  categoria_id        uuid NOT NULL REFERENCES public.categorias (id) ON DELETE CASCADE,
  -- NULL = aplica a gastos e ingresos
  tipo                text CHECK (tipo IS NULL OR tipo IN ('ingreso', 'gasto')),
  cuenta_id           uuid REFERENCES public.cuentas (id) ON DELETE SET NULL,
  etiquetas           text[] NOT NULL DEFAULT '{}',
  fecha_actualizacion timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 1.10 Plantillas de registro rápido ("Café S/ 8", "Pasaje"…)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plantillas (
  id                  uuid PRIMARY KEY,
  user_id             uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  nombre              text NOT NULL,
  tipo                text NOT NULL CHECK (tipo IN ('ingreso', 'gasto')),
  -- NULL = monto variable (se escribe cada vez)
  monto               numeric(12, 2) CHECK (monto IS NULL OR monto > 0),
  moneda              text NOT NULL DEFAULT 'PEN' CHECK (moneda IN ('PEN', 'USD')),
  categoria_id        uuid NOT NULL REFERENCES public.categorias (id) ON DELETE CASCADE,
  cuenta_id           uuid NOT NULL REFERENCES public.cuentas (id) ON DELETE CASCADE,
  concepto            text,
  etiquetas           text[] NOT NULL DEFAULT '{}',
  orden               integer NOT NULL DEFAULT 0,
  fecha_actualizacion timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 1.12 Compras en cuotas
-- -----------------------------------------------------------------------------
-- modo 'total': se registró un gasto por el precio (transaccion_id).
-- modo 'por_cuota': cada cuota se registra como gasto al llegar su fecha
--   (cuotas_generadas = cuántas ya se registraron).
CREATE TABLE IF NOT EXISTS public.cuotas (
  id                  uuid PRIMARY KEY,
  user_id             uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  descripcion         text NOT NULL,
  cuenta_id           uuid NOT NULL REFERENCES public.cuentas (id) ON DELETE CASCADE,
  categoria_id        uuid NOT NULL REFERENCES public.categorias (id) ON DELETE CASCADE,
  monto_total         numeric(12, 2) NOT NULL CHECK (monto_total > 0),
  numero_cuotas       smallint NOT NULL CHECK (numero_cuotas BETWEEN 2 AND 72),
  monto_cuota         numeric(12, 2) NOT NULL CHECK (monto_cuota > 0),
  fecha_compra        date NOT NULL,
  primera_cuota       date NOT NULL,
  modo                text NOT NULL DEFAULT 'total' CHECK (modo IN ('total', 'por_cuota')),
  transaccion_id      uuid,
  cuotas_generadas    smallint NOT NULL DEFAULT 0,
  fecha_actualizacion timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 1.13 Lista de deseos
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deseos (
  id                  uuid PRIMARY KEY,
  user_id             uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  nombre              text NOT NULL,
  precio              numeric(12, 2) NOT NULL CHECK (precio > 0),
  prioridad           smallint NOT NULL DEFAULT 2 CHECK (prioridad BETWEEN 1 AND 3),
  enlace              text,
  nota                text,
  fecha_creacion      timestamptz NOT NULL DEFAULT now(),
  -- Regla de los 30 días: no comprarlo antes de esta fecha
  esperar_hasta       date,
  estado              text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'comprado', 'descartado')),
  fecha_estado        timestamptz,
  meta_id             uuid,
  fecha_actualizacion timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 1.14 Recordatorios push: un dispositivo suscrito por fila
-- -----------------------------------------------------------------------------
-- Los envía la Edge Function "recordatorios" (ver sección 4). hora = hora
-- local (0-23) del aviso diario; ultimo_envio evita repetirlo el mismo día.
CREATE TABLE IF NOT EXISTS public.suscripciones_push (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  endpoint            text NOT NULL,
  p256dh              text NOT NULL,
  auth                text NOT NULL,
  hora                smallint NOT NULL DEFAULT 8 CHECK (hora BETWEEN 0 AND 23),
  zona                text NOT NULL DEFAULT 'America/Lima',
  ultimo_envio        date,
  fecha_creacion      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

-- -----------------------------------------------------------------------------
-- 1.15 Cuentas compartidas: una fila por persona invitada a una cuenta
-- -----------------------------------------------------------------------------
-- user_id = dueño de la cuenta. El invitado la ve al iniciar sesión con ese
-- correo y la acepta con aceptar_invitacion() (sección 2.4).
CREATE TABLE IF NOT EXISTS public.cuentas_compartidas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id           uuid NOT NULL REFERENCES public.cuentas (id) ON DELETE CASCADE,
  user_id             uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  cuenta_nombre       text NOT NULL,
  dueno_email         text NOT NULL,
  email               text NOT NULL CHECK (email = lower(email)),
  miembro_id          uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  estado              text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aceptada')),
  fecha_creacion      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cuenta_id, email)
);

-- -----------------------------------------------------------------------------
-- 1.11 Ajustes del usuario (una fila por usuario: id = user_id)
-- -----------------------------------------------------------------------------
-- datos: { fondoMeses, fondoOrigen, fondoId, reparto: {necesidades, deseos,
--   ahorro}, ingresoMensual, horasSemana }
CREATE TABLE IF NOT EXISTS public.ajustes (
  id                  uuid PRIMARY KEY,
  user_id             uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  datos               jsonb NOT NULL DEFAULT '{}'::jsonb,
  fecha_actualizacion timestamptz NOT NULL DEFAULT now()
);


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
CREATE INDEX IF NOT EXISTS chanchitos_user_idx    ON public.chanchitos (user_id);
CREATE INDEX IF NOT EXISTS reglas_user_idx        ON public.reglas (user_id);
CREATE INDEX IF NOT EXISTS plantillas_user_idx    ON public.plantillas (user_id);
CREATE INDEX IF NOT EXISTS ajustes_user_idx       ON public.ajustes (user_id);
CREATE INDEX IF NOT EXISTS cuotas_user_idx        ON public.cuotas (user_id);
CREATE INDEX IF NOT EXISTS deseos_user_idx        ON public.deseos (user_id);
CREATE INDEX IF NOT EXISTS suscripciones_push_user_idx ON public.suscripciones_push (user_id);
CREATE INDEX IF NOT EXISTS cuentas_compartidas_cuenta_idx  ON public.cuentas_compartidas (cuenta_id);
CREATE INDEX IF NOT EXISTS cuentas_compartidas_miembro_idx ON public.cuentas_compartidas (miembro_id);
CREATE INDEX IF NOT EXISTS cuentas_compartidas_email_idx   ON public.cuentas_compartidas (email);
CREATE INDEX IF NOT EXISTS transacciones_cuenta_idx        ON public.transacciones (cuenta_id);

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
    'metas', 'deudas', 'recurrentes', 'chanchitos', 'reglas', 'plantillas',
    'ajustes', 'cuotas', 'deseos', 'suscripciones_push'
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
-- 2.3 Fotos de recibos: bucket PRIVADO 'recibos' en Supabase Storage
-- -----------------------------------------------------------------------------
-- Cada usuario solo ve y toca su carpeta ('<user_id>/...'). Máx. 5 MB por
-- foto (la app las comprime a ~300 kB).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('recibos', 'recibos', false, 5242880, ARRAY['image/*'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Recibos propios" ON storage.objects;
CREATE POLICY "Recibos propios" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'recibos' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
  WITH CHECK (bucket_id = 'recibos' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

-- -----------------------------------------------------------------------------
-- 2.4 Cuentas compartidas: quién ve qué
-- -----------------------------------------------------------------------------
-- Además del "Acceso personal" de 2.2 (que no cambia):
--  * el miembro ve la cuenta compartida, todos sus movimientos (de quien
--    sea) y los nombres de las categorías de las personas con quienes
--    comparte;
--  * nadie puede registrar movimientos en una cuenta que no es suya ni
--    compartida con él (política RESTRICTIVE);
--  * el invitado solo acepta o sale con las funciones de abajo (no puede
--    editar la invitación directamente).

-- ¿La cuenta es mía o me la compartieron (invitación aceptada)?
CREATE OR REPLACE FUNCTION public.puede_ver_cuenta(p_cuenta uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.cuentas c
                 WHERE c.id = p_cuenta AND c.user_id = (SELECT auth.uid()))
      OR EXISTS (SELECT 1 FROM public.cuentas_compartidas m
                 WHERE m.cuenta_id = p_cuenta AND m.estado = 'aceptada'
                   AND m.miembro_id = (SELECT auth.uid()));
$$;

-- ¿Comparto alguna cuenta con esa persona (como dueño o como miembro)?
CREATE OR REPLACE FUNCTION public.comparte_cuenta_con(p_usuario uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cuentas_compartidas m
    WHERE m.estado = 'aceptada'
      AND (   (m.user_id = (SELECT auth.uid()) AND m.miembro_id = p_usuario)
           OR (m.miembro_id = (SELECT auth.uid()) AND m.user_id = p_usuario)
           OR (m.miembro_id = p_usuario AND EXISTS (
                 SELECT 1 FROM public.cuentas_compartidas yo
                 WHERE yo.cuenta_id = m.cuenta_id AND yo.estado = 'aceptada'
                   AND yo.miembro_id = (SELECT auth.uid()))))
  );
$$;

-- El invitado acepta (con el correo de su sesión).
CREATE OR REPLACE FUNCTION public.aceptar_invitacion(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  UPDATE public.cuentas_compartidas
     SET miembro_id = (SELECT auth.uid()), estado = 'aceptada'
   WHERE id = p_id
     AND estado = 'pendiente'
     AND email = lower((SELECT auth.jwt()) ->> 'email');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La invitación ya no existe o es para otro correo';
  END IF;
END;
$$;

-- El invitado rechaza la invitación o sale de la cuenta.
CREATE OR REPLACE FUNCTION public.salir_de_cuenta(p_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  DELETE FROM public.cuentas_compartidas
   WHERE id = p_id
     AND (miembro_id = (SELECT auth.uid())
          OR email = lower((SELECT auth.jwt()) ->> 'email'));
$$;

REVOKE ALL ON FUNCTION public.puede_ver_cuenta(uuid), public.comparte_cuenta_con(uuid),
  public.aceptar_invitacion(uuid), public.salir_de_cuenta(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_ver_cuenta(uuid), public.comparte_cuenta_con(uuid),
  public.aceptar_invitacion(uuid), public.salir_de_cuenta(uuid) TO authenticated;

-- Invitaciones: el dueño las crea y borra (a su nombre, con su correo y
-- sobre sus cuentas); las ven el dueño, el invitado y los otros miembros.
ALTER TABLE public.cuentas_compartidas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ver invitaciones" ON public.cuentas_compartidas;
DROP POLICY IF EXISTS "Invitar" ON public.cuentas_compartidas;
DROP POLICY IF EXISTS "Quitar invitados" ON public.cuentas_compartidas;
CREATE POLICY "Ver invitaciones" ON public.cuentas_compartidas FOR SELECT TO authenticated
  USING (   user_id = (SELECT auth.uid())
         OR miembro_id = (SELECT auth.uid())
         OR email = lower((SELECT auth.jwt()) ->> 'email')
         OR public.puede_ver_cuenta(cuenta_id));
CREATE POLICY "Invitar" ON public.cuentas_compartidas FOR INSERT TO authenticated
  WITH CHECK (   user_id = (SELECT auth.uid())
             AND miembro_id IS NULL AND estado = 'pendiente'
             AND dueno_email = lower((SELECT auth.jwt()) ->> 'email')
             AND email <> dueno_email
             AND EXISTS (SELECT 1 FROM public.cuentas c
                         WHERE c.id = cuenta_id AND c.user_id = (SELECT auth.uid())));
CREATE POLICY "Quitar invitados" ON public.cuentas_compartidas FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));
GRANT SELECT, INSERT, DELETE ON public.cuentas_compartidas TO authenticated;

-- La cuenta compartida la ven sus miembros.
DROP POLICY IF EXISTS "Cuentas compartidas conmigo" ON public.cuentas;
CREATE POLICY "Cuentas compartidas conmigo" ON public.cuentas FOR SELECT TO authenticated
  USING (public.puede_ver_cuenta(id));

-- Los movimientos de una cuenta compartida los ven todos sus miembros.
DROP POLICY IF EXISTS "Movimientos de cuentas compartidas" ON public.transacciones;
CREATE POLICY "Movimientos de cuentas compartidas" ON public.transacciones FOR SELECT TO authenticated
  USING (cuenta_id IS NOT NULL AND public.puede_ver_cuenta(cuenta_id));

-- Solo se registra en una cuenta propia o compartida contigo.
DROP POLICY IF EXISTS "Solo cuentas permitidas (alta)" ON public.transacciones;
DROP POLICY IF EXISTS "Solo cuentas permitidas (cambio)" ON public.transacciones;
CREATE POLICY "Solo cuentas permitidas (alta)" ON public.transacciones AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (cuenta_id IS NULL OR public.puede_ver_cuenta(cuenta_id));
CREATE POLICY "Solo cuentas permitidas (cambio)" ON public.transacciones AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (cuenta_id IS NULL OR public.puede_ver_cuenta(cuenta_id));

-- Nombres de las categorías de quienes comparten una cuenta contigo.
DROP POLICY IF EXISTS "Categorias de quienes comparten conmigo" ON public.categorias;
CREATE POLICY "Categorias de quienes comparten conmigo" ON public.categorias FOR SELECT TO authenticated
  USING (public.comparte_cuenta_con(user_id));

-- -----------------------------------------------------------------------------
-- 2.5 Recarga el caché de la API para que vea los cambios de inmediato
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- -----------------------------------------------------------------------------
-- 2.6 Comprobación: debe mostrar 15 filas, todas con rls = true
-- -----------------------------------------------------------------------------
SELECT c.relname                                   AS tabla,
       c.relrowsecurity                            AS rls,
       (SELECT count(*) FROM information_schema.columns col
         WHERE col.table_schema = 'public' AND col.table_name = c.relname) AS columnas
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('categorias', 'cuentas', 'transacciones', 'presupuestos',
                    'metas', 'deudas', 'recurrentes', 'chanchitos',
                    'reglas', 'plantillas', 'ajustes', 'cuotas', 'deseos',
                    'suscripciones_push', 'cuentas_compartidas')
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
  public.cuentas_compartidas,
  public.suscripciones_push,
  public.cuotas,
  public.deseos,
  public.transacciones,
  public.presupuestos,
  public.recurrentes,
  public.metas,
  public.deudas,
  public.chanchitos,
  public.reglas,
  public.plantillas,
  public.ajustes,
  public.categorias,
  public.cuentas
RESTART IDENTITY CASCADE;
-- Las fotos de recibos no se borran con SQL: Storage → recibos → selecciona
-- todo → Delete (o elimina el bucket completo).
*/

/*
-- ---------- 3B. ELIMINAR TODO: tablas, datos y (opcional) usuarios --------
-- Primero lo que apunta a otras tablas, al final categorias/cuentas.
DROP TABLE IF EXISTS public.cuentas_compartidas CASCADE;
DROP TABLE IF EXISTS public.suscripciones_push CASCADE;
DROP TABLE IF EXISTS public.cuotas        CASCADE;
DROP TABLE IF EXISTS public.deseos        CASCADE;
DROP TABLE IF EXISTS public.transacciones CASCADE;
DROP TABLE IF EXISTS public.presupuestos  CASCADE;
DROP TABLE IF EXISTS public.recurrentes   CASCADE;
DROP TABLE IF EXISTS public.metas         CASCADE;
DROP TABLE IF EXISTS public.deudas        CASCADE;
DROP TABLE IF EXISTS public.chanchitos    CASCADE;
DROP TABLE IF EXISTS public.reglas        CASCADE;
DROP TABLE IF EXISTS public.plantillas    CASCADE;
DROP TABLE IF EXISTS public.ajustes       CASCADE;
DROP TABLE IF EXISTS public.categorias    CASCADE;
DROP TABLE IF EXISTS public.cuentas       CASCADE;
DROP FUNCTION IF EXISTS public.puede_ver_cuenta(uuid), public.comparte_cuenta_con(uuid),
  public.aceptar_invitacion(uuid), public.salir_de_cuenta(uuid);

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

-- Fotos de recibos y recordatorios programados: vacía y elimina el bucket
-- 'recibos' desde Storage, y quita la tarea programada:
-- SELECT cron.unschedule('gestor-gastos-recordatorios');
*/


-- #############################################################################
-- 4. RECORDATORIOS PUSH (OPCIONAL)
-- #############################################################################
-- Solo si desplegaste la Edge Function "recordatorios" (instrucciones en
-- supabase/functions/recordatorios/LEEME.md). Programa una llamada por hora;
-- la función avisa a cada dispositivo en la hora que eligió.
--   1. Database → Extensions: activa pg_cron y pg_net.
--   2. Copia el bloque de abajo SIN las líneas /* y */, reemplaza
--      TU-PROYECTO y TU_SECRETO (el mismo CRON_SECRET de la función) y
--      ejecútalo en una consulta NUEVA. Repetirlo solo actualiza la tarea.

/*
SELECT cron.schedule(
  'gestor-gastos-recordatorios',
  '5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://TU-PROYECTO.supabase.co/functions/v1/recordatorios',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-secret', 'TU_SECRETO'),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
*/
