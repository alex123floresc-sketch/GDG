-- =============================================================================
-- Gestor de Gastos — migración v0.7
--
-- Ejecutar UNA vez en Supabase → SQL Editor → New query → Run.
-- Es idempotente: se puede volver a ejecutar sin romper nada.
--
-- Agrega:
--   * fecha_actualizacion en categorias/cuentas/presupuestos (sincronizar
--     ediciones entre dispositivos: gana la más reciente)
--   * tarjetas de crédito (columnas en cuentas + tipo 'tarjeta_credito')
--   * transferencias y varias monedas (columnas en transacciones)
--   * tablas nuevas: metas, deudas, recurrentes (con RLS por usuario)
--
-- Mientras no se ejecute, la app sigue sincronizando transacciones,
-- categorías y cuentas como antes; lo nuevo queda solo en el dispositivo.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Categorías
-- ---------------------------------------------------------------------------
ALTER TABLE categorias
  ADD COLUMN IF NOT EXISTS fecha_actualizacion timestamptz NOT NULL DEFAULT now();

ALTER TABLE categorias DROP CONSTRAINT IF EXISTS categorias_tipo_check;
ALTER TABLE categorias ADD CONSTRAINT categorias_tipo_check
  CHECK (tipo IN ('ingreso', 'gasto', 'ambos')) NOT VALID;

-- ---------------------------------------------------------------------------
-- Cuentas (+ tarjetas de crédito)
-- ---------------------------------------------------------------------------
ALTER TABLE cuentas
  ADD COLUMN IF NOT EXISTS fecha_actualizacion timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS limite_credito numeric(12, 2),
  ADD COLUMN IF NOT EXISTS dia_corte smallint CHECK (dia_corte BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS dia_pago smallint CHECK (dia_pago BETWEEN 1 AND 31);

ALTER TABLE cuentas DROP CONSTRAINT IF EXISTS cuentas_tipo_check;
ALTER TABLE cuentas ADD CONSTRAINT cuentas_tipo_check
  CHECK (tipo IN ('efectivo', 'banco', 'billetera_digital', 'tarjeta_credito', 'otro')) NOT VALID;

-- ---------------------------------------------------------------------------
-- Presupuestos (la tabla ya existía; solo se agrega la marca de tiempo)
-- ---------------------------------------------------------------------------
ALTER TABLE presupuestos
  ADD COLUMN IF NOT EXISTS fecha_actualizacion timestamptz NOT NULL DEFAULT now();

ALTER TABLE presupuestos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso personal" ON presupuestos;
CREATE POLICY "Acceso personal" ON presupuestos
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Transacciones: transferencias, recurrentes y varias monedas
-- ---------------------------------------------------------------------------
-- Las transferencias entre cuentas propias no tienen categoría.
ALTER TABLE transacciones ALTER COLUMN categoria_id DROP NOT NULL;

ALTER TABLE transacciones
  ADD COLUMN IF NOT EXISTS moneda text NOT NULL DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS monto_original numeric(12, 2),
  ADD COLUMN IF NOT EXISTS tipo_cambio numeric(10, 4),
  ADD COLUMN IF NOT EXISTS transferencia_id uuid,
  ADD COLUMN IF NOT EXISTS recurrente_id uuid;

-- origen: 'manual' | 'yape' | 'transferencia' | 'recurrente'
ALTER TABLE transacciones DROP CONSTRAINT IF EXISTS transacciones_origen_check;
ALTER TABLE transacciones ADD CONSTRAINT transacciones_origen_check
  CHECK (origen IN ('manual', 'yape', 'transferencia', 'recurrente')) NOT VALID;

ALTER TABLE transacciones DROP CONSTRAINT IF EXISTS transacciones_moneda_check;
ALTER TABLE transacciones ADD CONSTRAINT transacciones_moneda_check
  CHECK (moneda IN ('PEN', 'USD')) NOT VALID;

CREATE INDEX IF NOT EXISTS transacciones_transferencia_idx
  ON transacciones (transferencia_id) WHERE transferencia_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Metas de ahorro
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS metas (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  nombre text NOT NULL,
  monto_objetivo numeric(12, 2) NOT NULL CHECK (monto_objetivo > 0),
  fecha_limite date,
  icono text,
  color text,
  -- [{ id, fecha, monto, nota }] — monto negativo = retiro
  aportes jsonb NOT NULL DEFAULT '[]'::jsonb,
  fecha_actualizacion timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE metas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso personal" ON metas;
CREATE POLICY "Acceso personal" ON metas
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Deudas y préstamos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deudas (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  persona text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('me_deben', 'debo')),
  monto numeric(12, 2) NOT NULL CHECK (monto > 0),
  concepto text,
  fecha date NOT NULL,
  fecha_limite date,
  -- [{ id, fecha, monto, nota }] — pagos parciales
  abonos jsonb NOT NULL DEFAULT '[]'::jsonb,
  fecha_actualizacion timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE deudas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso personal" ON deudas;
CREATE POLICY "Acceso personal" ON deudas
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Movimientos recurrentes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recurrentes (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('ingreso', 'gasto')),
  monto numeric(12, 2) NOT NULL CHECK (monto > 0),
  moneda text NOT NULL DEFAULT 'PEN' CHECK (moneda IN ('PEN', 'USD')),
  categoria_id uuid NOT NULL REFERENCES categorias (id) ON DELETE CASCADE,
  cuenta_id uuid NOT NULL REFERENCES cuentas (id) ON DELETE CASCADE,
  concepto text NOT NULL,
  frecuencia text NOT NULL CHECK (frecuencia IN ('semanal', 'quincenal', 'mensual', 'anual')),
  proxima_fecha date NOT NULL,
  activa boolean NOT NULL DEFAULT true,
  fecha_actualizacion timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE recurrentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso personal" ON recurrentes;
CREATE POLICY "Acceso personal" ON recurrentes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Recarga el caché de esquema de la API para que vea lo nuevo de inmediato
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
