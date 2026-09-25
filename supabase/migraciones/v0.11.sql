-- =============================================================================
-- Gestor de Gastos — migración v0.11
--
-- Ejecutar en Supabase → SQL Editor → New query → Run, DESPUÉS de v0.7.sql.
-- Es idempotente: se puede volver a ejecutar sin romper nada.
--
-- Agrega:
--   * etiquetas libres en transacciones (#viaje, #cumpleaños…)
--   * marca de "gasto dividido" en deudas
-- =============================================================================

ALTER TABLE transacciones
  ADD COLUMN IF NOT EXISTS etiquetas text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS transacciones_etiquetas_idx
  ON transacciones USING gin (etiquetas);

ALTER TABLE deudas
  ADD COLUMN IF NOT EXISTS gasto_dividido boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
