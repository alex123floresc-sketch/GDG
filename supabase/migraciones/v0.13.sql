-- =============================================================================
-- Gestor de Gastos — migración v0.13
--
-- Ejecutar en Supabase → SQL Editor → New query → Run, DESPUÉS de v0.11.sql.
-- Es idempotente: se puede volver a ejecutar sin romper nada.
--
-- Agrega:
--   * recurrentes.dia_mes: día del mes elegido para los recurrentes
--     mensuales/anuales. Solo se llena cuando proxima_fecha está recortada
--     (p. ej. una regla del 31 cuya próxima fecha es el 30 de abril), para
--     que los meses siguientes vuelvan al 31.
-- =============================================================================

ALTER TABLE recurrentes
  ADD COLUMN IF NOT EXISTS dia_mes smallint
  CHECK (dia_mes IS NULL OR dia_mes BETWEEN 1 AND 31);

NOTIFY pgrst, 'reload schema';
