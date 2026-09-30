# Recordatorios push (Edge Function `recordatorios`)

Una vez por hora, `pg_cron` llama a esta función. Para cada dispositivo que
activó los recordatorios (Más → Personalizar → Recordatorios) y cuya hora
elegida es la hora actual, envía **una** notificación con lo que vence hoy
o mañana: movimientos recurrentes, cuotas, pago de tarjetas y deudas con
fecha límite.

La foto del recibo NO necesita nada de esto (solo `BASE_DE_DATOS.sql`).

## 1. Base de datos

Ejecuta `BASE_DE_DATOS.sql` completo (crea `suscripciones_push`).

## 2. Claves VAPID (una sola vez)

```bash
npx web-push generate-vapid-keys
```

- La **pública** va en `.env.local` y en Vercel como
  `VITE_VAPID_PUBLIC_KEY=...` (sin ella, la app muestra "no configurado").
- La **privada** solo en los secretos de la función (paso 3). Nunca en el
  código ni en variables `VITE_`.

## 3. Desplegar la función (Supabase CLI)

```bash
npx supabase login
npx supabase link --project-ref TU-PROYECTO
npx supabase secrets set \
  VAPID_PUBLIC_KEY=... \
  VAPID_PRIVATE_KEY=... \
  VAPID_SUBJECT=mailto:tu-correo@ejemplo.com \
  CRON_SECRET=una-frase-larga-al-azar
npx supabase functions deploy recordatorios --no-verify-jwt
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya existen en toda Edge
Function. `--no-verify-jwt`: la función se protege con `CRON_SECRET` (la
llama pg_cron, no un usuario).

## 4. Programarla

Sección 4 de `BASE_DE_DATOS.sql` (activa `pg_cron` y `pg_net`, reemplaza
`TU-PROYECTO` y `TU_SECRETO`).

## Probar

```bash
curl -X POST https://TU-PROYECTO.supabase.co/functions/v1/recordatorios \
  -H "x-cron-secret: TU_SECRETO" -H "Content-Type: application/json" \
  -d '{"forzar": true}'
```

`forzar` ignora la hora y el "ya se avisó hoy". Responde un resumen
(`enviadas`, `sinNovedades`, `eliminadas`, `errores`). Si no hay nada que
venza hoy o mañana, no se envía nada (queda en `sinNovedades`).

La lógica (qué vence, texto del aviso) está en `eventos.ts`, sin
dependencias de Deno.
