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
  Movimientos, Análisis, Planificar → Presupuestos/Metas/Chanchitos/
  Deudas/Recurrentes/Cuotas/Calendario/Deseos, Más → Cuentas/Compartir/Categorías/Automatizar/Logros/Personalizar/Importar Yape/
  Seguridad); en móvil (<768px)
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
  `analisis/` (`SeccionAnalisis` con pestañas Resumen/Comparar/Patrimonio/
  Reporte mensual),
  `TecladoNumerico` (en pantallas táctiles; suma/resta), `CampoEtiquetas`,
  `DividirGasto`, `Ilustracion` (SVG de estados vacíos con variables de
  color),
  `VistaMovimientos` (búsqueda, filtros avanzados, lista/calendario,
  exportar lo filtrado), `CalendarioGastos`, `ResumenInteligente`,
  `Modal` (modal de Fomantic sin jQuery, vía portal), `Avisos` (toasts;
  se usan con `useAvisos().avisar(...)`), `graficos/`, `YapeImporter`
  (cargado con `React.lazy`, ver Rendimiento)
- `src/db/database.ts` — esquema Dexie v15 (`GestorGastosDB`, tablas
  `transacciones`, `categorias`, `cuentas`, `presupuestos`, `metas`,
  `deudas`, `recurrentes`, `chanchitos`, `reglas`, `plantillas`,
  `ajustes`, `cuotas`, `deseos`, `eliminacionesPendientes`, `recibos`
  (fotos; no es "sincronizable", ver v0.23), `compartidas`,
  `cuentasAjenas`, `movimientosAjenos` (copias de solo lectura, v0.24)). `TABLAS_SINCRONIZABLES` es la lista única
  de tablas del usuario (la usan `useSync` para contar pendientes,
  `respaldoService` y `limpiarDatosLocales`): una tabla nueva se agrega
  ahí.
- `src/services` — lógica sin React: `supabaseClient.ts`, `syncService.ts`,
  `transaccionService.ts` (+ transferencias, eliminar/restaurar),
  `categoriaService.ts`, `cuentaService.ts`, `presupuestoService.ts`,
  `metaService.ts`, `deudaService.ts`, `recurrenteService.ts`,
  `divisionService.ts` (gastos divididos), `reglaService.ts`,
  `plantillaService.ts`,
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
- `src/utils/patrimonio.ts` (`evolucionPatrimonio`: cuentas + te deben −
  debes al cierre de cada mes; los "me deben" de gastos divididos no se
  suman porque ya están en la cuenta "Por cobrar"), `comparacion.ts`
  (`compararPeriodos`; "este mes vs. anterior" corta el anterior en el
  mismo día para que sea justo)
- `src/utils/categorias.ts` (subcategorías: `idRaiz`, `nombreCompleto`,
  `ordenJerarquico`), `reglas.ts` (`reglaPara`, `afectadasPorRegla`),
  `plantillas.ts`
- `src/utils/etiquetas.ts`, `expresion.ts` (sumas/restas del teclado, sin
  `eval`), `division.ts`, `tipoCambio.ts` (dólar del día desde
  open.er-api.com, caché 6 h en localStorage; es tipo de mercado, se
  ofrece como sugerencia editable)
- `src/utils/preferencias.ts` — preferencias del dispositivo en
  localStorage (tipo de cambio, tema, color, letra, compacto), siempre en
  try/catch
- `BASE_DE_DATOS.sql` — todo el SQL de Supabase en un solo archivo
- `supabase/migraciones/` — historial de migraciones (ya incluidas arriba)

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
  `cuentaService.asegurarCuentasPorDefecto`). La siembra usa ids
  deterministas (`uuidDeterminista(usuarioId|cuenta|nombre)`) dentro de
  una transacción Dexie: dos siembras simultáneas (doble efecto de
  StrictMode, dos pestañas o dispositivos) no duplican. Los repetidos
  que ya existían (antes de v0.13.2) los une
  `syncService.deduplicarCatalogos` al inicio y tras la descarga de cada
  sincronización: conserva la del servidor con id menor (misma elección
  en todos los dispositivos), re-apunta movimientos/recurrentes/
  presupuestos, suma saldos iniciales y borra el resto también remoto. Los hooks/servicios
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
- **Recurrentes**: `diaMes` guarda el día elegido (mensual/anual) porque
  `proximaFecha` puede quedar recortada (31 → 30 de abril); así mayo
  vuelve al 31. Remoto `dia_mes` (v0.13) solo viaja si difiere del día de
  `proxima_fecha`. `useRecurrentes` (llamado siempre desde `Dashboard`)
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

## Etiquetas y gastos divididos (v0.11)

- **Etiquetas**: `Transaccion.etiquetas` (normalizadas: minúsculas, sin
  '#', espacios → '-'; máx. 5). Índice multiEntry `*etiquetas` en Dexie.
  Al editar, `[]` explícito = quitar todas (debe viajar para limpiarlas en
  Supabase); `undefined` = nunca tuvo.
- **Dividir un gasto** (`divisionService.registrarGastoDividido`, en una
  transacción Dexie): tu parte → gasto; lo que pagaste por los demás →
  transferencia a la cuenta de sistema **"Por cobrar"** (así no cuenta
  como gasto tuyo, pero el saldo de tu cuenta baja el total); por cada
  persona → deuda `me_deben` con `gastoDividido`. Al cobrarla se hace una
  transferencia "Por cobrar" → cuenta (no es ingreso). "Por cobrar" no se
  ofrece como cuenta al registrar gastos/ingresos normales.
- "Marcar como pagada" (deudas normales) salda sin mover cuentas y se
  puede deshacer.

## Automatizar: reglas, subcategorías, plantillas y atajos (v0.16)

- **Subcategorías**: `Categoria.padreId` (un solo nivel; la madre debe ser
  de primer nivel y de tipo compatible). `resumenPorCategoria` suma cada
  subcategoría a su madre (parámetro `agruparSubcategorias`) y
  `estadoPresupuestos` cuenta lo de las hijas en el presupuesto de la
  madre. El filtro de categoría en Movimientos incluye las hijas. En el
  formulario se eligen las principales y, si tienen hijas, aparece una
  fila para afinar. Remoto `categorias.padre_id` (sin llave foránea);
  solo viaja si la migración v0.16 está confirmada, y
  `Entidad.conservar` evita que una descarga sin esa columna borre el
  valor local.
- **Reglas** (`Regla`): si el concepto contiene `patron` (sin tildes ni
  mayúsculas; gana el patrón más largo) → categoría (+ cuenta y
  etiquetas opcionales). Se aplican al crear un movimiento (solo si no
  se eligió categoría a mano), al importar Yape, y "a lo ya registrado"
  con vista previa. El formulario ofrece "Recordar «X» siempre en …" y
  Más → Automatizar sugiere reglas a partir de conceptos repetidos.
- **Plantillas** (`Plantilla`): con monto fijo se registran de un toque
  desde Inicio (aviso con deshacer); sin monto abren el formulario
  lleno (`plantillaInicial`). También aparecen arriba del formulario y
  se pueden crear con "Guardar también como plantilla".
- Al eliminar una categoría/cuenta, sus reglas y plantillas pasan a la
  de reasignación (o se eliminan); `reapuntarReferencias` (syncService)
  las re-apunta al fusionar/deduplicar catálogos.
- **Atajos del ícono** (manifest `shortcuts`, íconos en
  `public/atajos/`): `/?accion=gasto|ingreso|transferencia` y
  `/?seccion=movimientos`; los interpreta `accionDeUrl` en Dashboard.

## Salud financiera (v0.17)

- `utils/salud.ts`: `calcularReparto` (50/30/20: `Categoria.clase`
  necesidad/deseo; sin clase se estima por el nombre con
  `claseDeCategoria`, las subcategorías heredan la de su madre),
  `estadoFondo` (fondo de emergencia: todo lo líquido o una cuenta/meta/
  chanchito elegido; meses cubiertos sobre el promedio de necesidades de
  3 meses completos), `proyectarSaldo` (cuentas líquidas día a día:
  recurrentes de esas cuentas, pago de tarjetas, deudas "debo" y el
  promedio variable de 90 días), `cuantoPuedoGastar` (margen del mes ÷
  días que quedan; si no hay ingresos del mes usa el promedio) y
  `puntajeSalud` (0–100: ahorro 25, fondo 25, deudas 20, presupuestos
  15, constancia 15).
- UI: Análisis → Salud financiera (`PanelSalud`) y en Inicio
  `TarjetaHoy` (con desglose y el puntaje, que lleva a esa pestaña).
- `Ajustes` (tabla `ajustes`, una fila por usuario con id = usuarioId,
  remoto `datos jsonb`): meses del fondo, origen del fondo, porcentajes
  del reparto y (v0.19) horas de trabajo. `useAjustes` /
  `guardarAjustes`. Remoto `categorias.clase` (migración `v0.17.sql`).

## Cuotas, calendario de pagos y suscripciones (v0.18)

- **Cuotas** (`CompraCuotas`, tabla `cuotas`, Planificar → Cuotas): modo
  `total` (un gasto por el precio el día de la compra, `transaccionId`) o
  `por_cuota` (`useCuotas` → `generarCuotasPendientes` registra cada cuota
  vencida como gasto con origen 'recurrente' y `recurrenteId` = id de la
  compra; ids deterministas; `cuotasGeneradas` evita regenerar una que el
  usuario borró). Una cuota cuenta como pagada al llegar su fecha
  (`estadoCuotas`); `teaAproximada` estima la TEA desde la cuota.
- Tarjetas: `pagoTarjetaEstimado` = deuda − `capitalNoFacturado` (parte
  del precio de compras en modo total cuyas cuotas vencen después del
  pago). Lo usan la proyección de saldo, el calendario y el insight de
  pago de tarjeta.
- **Calendario** (Planificar → Calendario, `eventosDelMes`): recurrentes
  (futuros por la regla; pasados según lo registrado), cuotas, fecha de
  pago de tarjetas (con monto solo el próximo pago), deudas y metas con
  fecha límite.
- **Suscripciones detectadas** (`detectarSuscripciones`): gastos no
  recurrentes con el mismo concepto, uno por mes (~25–35 días), monto
  ±20 %, el último hace ≤ 45 días; ≥ 3 veces (≥ 2 si es un servicio
  conocido). Se ofrecen en Recurrentes ("Hacer recurrente" / "No es",
  guardado en `Ajustes.suscripcionesIgnoradas`) y como insight.

## Deseos, logros, horas de trabajo y tu año (v0.19)

- **Lista de deseos** (`Deseo`, tabla `deseos`, Planificar → Deseos):
  prioridad, enlace, regla de los 30 días (`esperarHasta`), "Lo compré"
  (registra el gasto), "Ya no lo quiero" (suma a "te resististe"),
  "Ahorrar para esto" (crea una meta y guarda `metaId`).
- **Horas de trabajo** (`utils/horas.ts`): `valorHora` = ingreso mensual
  (`Ajustes.ingresoMensual`, o el promedio de 3 meses) ÷ horas al mes
  (`Ajustes.horasSemana`, 48 por defecto). Se muestra al registrar un
  gasto, en deseos y en "Tu año". Se configura en Planificar → Deseos.
- **Logros y racha** (`utils/logros.ts`, Más → Logros): racha = días
  seguidos con algún movimiento propio (sin transferencias ni generados
  solos); 19 logros calculados de los datos (nada se guarda). Dashboard
  avisa los nuevos comparando con `localStorage gg:logrosVistos:<id>`
  (espera 3 s a que carguen las tablas; la primera vez solo guarda).
  Chip de racha en Inicio (≥ 2 días).
- **Tu año** (`utils/anual.ts`, Análisis → Tu año): totales, categoría
  y mes top, gasto más repetido, día de la semana, mayor gasto, racha;
  "Compartir" usa Web Share o copia el texto. Insight del 15 de
  diciembre a fin de enero.

## Personalizar (v0.20)

- Más → Personalizar (`Personalizar.tsx`). Del dispositivo
  (`utils/preferencias.ts`, localStorage): tema, **color de la app**
  (`ColorApp`: índigo, azul, verde, rosa, turquesa, grafito →
  `<html data-color>`; cada tema redefine solo los tokens de marca y el
  degradado `--grad-1/2/3`, en claro y oscuro; botones con contraste
  ≥ 4.5 con texto blanco), **tamaño de letra** (`data-letra`, cambia el
  `font-size` de html/body que Fomantic fija en 14px) y **modo compacto**
  (`data-compacto`). `aplicarTema` aplica todo antes del primer render y
  pinta la barra del navegador con `--color-header-1`. El Header escucha
  `EVENTO_TEMA` para reflejar un cambio de tema hecho aquí.
- **Inicio a tu gusto**: `Ajustes.inicio` ({orden, ocultas}, se
  sincroniza); `ordenInicio` + `SECCIONES_INICIO` (utils/inicio.ts). En
  Inicio cada sección es una entrada de `secciones`.
- **Íconos/logos de cuentas**: `Cuenta.icono` (icono de Semantic o
  'logo:<id>' de `LOGOS_CUENTA`: sigla sobre el color de la marca, sin
  imágenes oficiales) y `Cuenta.color`. Sin elección, `logoSugerido` usa
  el nombre ("Yape" → logo de Yape) y si no, el icono del tipo. Se
  dibujan con `IconoCuenta` (no usar `ICONO_CUENTA` directo). Remoto
  `cuentas.icono/color` (migración `v0.20.sql`).

## Captura rápida (v0.21)

- Formulario (solo al crear): **Dictar** (`useDictado`, Web Speech API
  es-PE) e interpretación con `utils/dictado.ts` (`interpretarTexto`:
  monto en cifras o palabras, tipo, fecha "ayer", cuenta nombrada,
  categoría por regla/nombre/pistas; también entiende notificaciones de
  Yape). **Leer boleta**: `ocrService.leerBoleta` carga tesseract.js bajo
  demanda (modelo `spa` desde CDN la primera vez) y `utils/boleta.ts`
  saca total/fecha/comercio. Props `textoInicial`/`imagenInicial` para
  lo compartido.
- **Ubicación**: `Transaccion.ubicacion` {lat, lng, lugar} con el GPS al
  tocar el botón; remoto `transacciones.ubicacion` (migración
  `v0.21.sql`, solo se envía si está confirmada; la descarga conserva la
  local). `subirLoQueFaltaba` re-marca como pendiente lo editado antes de
  cada migración para que suba completo.

## Compartir a la app y mapa (v0.22)

- **Web Share Target**: manifest `share_target` (POST multipart a
  `/compartir`, campos title/text/url + `imagen`). `public/sw-extra.js`
  (importado por el SW de Workbox con `workbox.importScripts`) lo guarda
  en la caché `gg-compartido` y redirige a `/?compartido=1`;
  `utils/compartir.ts` (`leerCompartido`, una sola lectura aunque se llame
  dos veces) y Dashboard abren el registro con `textoInicial`/
  `imagenInicial` (la foto pasa por el OCR). Solo funciona con la app
  instalada (el SW debe estar activo).
- **Análisis → Mapa** (`PanelMapa`, cargado con `React.lazy`: Leaflet +
  su CSS solo para esa pestaña): gastos con `ubicacion`, agrupados por
  lugar (`utils/mapa.ts`: mismo nombre sin tildes, o ≤ 60 m si no tiene
  nombre); círculo con área ∝ gasto y color de la categoría principal,
  tabla "Dónde gastas más" (clic = centrar el lugar). Teselas de
  OpenStreetMap (invertidas en tema oscuro); popups armados con
  `textContent` (el nombre lo escribe el usuario).

## Foto del recibo y recordatorios push (v0.23)

- **Foto del recibo**: `Transaccion.recibo` = ruta en el bucket privado
  `recibos` de Storage (`<user_id>/<id>.jpg`; política: solo la carpeta
  propia). `reciboService`: `guardarRecibo` comprime (`utils/imagen.ts`,
  JPEG ≤ 1600 px) y guarda el Blob en la tabla local `recibos`;
  `sincronizarRecibos` (al final de `sincronizar`, solo con `v0.23.sql`)
  sube lo pendiente y borra las **huérfanas** (su movimiento ya no existe
  o ya no la usa) pasados 3 min — así "Deshacer" la recupera y no hace
  falta tocar `eliminarTransaccion`. `obtenerRecibo` la descarga bajo
  demanda en otro dispositivo. Las fotos pendientes cuentan en `useSync`.
  UI: `CampoRecibo` en el formulario (la foto de "Leer boleta" queda
  como recibo), clip en `ListaTransacciones`. No van en el respaldo JSON.
- **Recordatorios push**: `pushService` (Web Push con
  `VITE_VAPID_PUBLIC_KEY`; tabla `suscripciones_push`, única por
  usuario+endpoint, con `hora` local y `zona`), UI `Recordatorios` en Más
  → Personalizar; al cerrar sesión se da de baja el dispositivo. Edge
  Function `supabase/functions/recordatorios` (Deno; lógica pura en
  `eventos.ts`: recurrentes, cuotas, pago de tarjetas y deudas que vencen
  hoy/mañana → un aviso por día) llamada cada hora por pg_cron (sección 4
  de `BASE_DE_DATOS.sql`, comentada). Despliegue: su `LEEME.md`.
  `sw-extra.js` muestra la notificación y al tocarla abre `?seccion=…`.

## Cuentas compartidas (v0.24)

- Más → Compartir (`CuentasCompartidas`). El dueño invita por correo a una
  de sus cuentas (`compartirService.invitarACuenta`, necesita conexión y
  que la cuenta ya esté sincronizada); el invitado la ve al entrar con ese
  correo y acepta/rechaza/sale con las funciones SQL `aceptar_invitacion`
  / `salir_de_cuenta` (no puede editar la fila). Avisar: `mailto:` o Web
  Share con `textoInvitacion`.
- Remoto (`BASE_DE_DATOS.sql` 1.15 y 2.4): tabla `cuentas_compartidas`;
  `puede_ver_cuenta(cuenta)` (mía o aceptada) da SELECT a la cuenta, a
  TODOS sus movimientos y (con `comparte_cuenta_con`) a las categorías de
  quienes comparten; política RESTRICTIVE: un movimiento solo puede usar
  una cuenta propia o compartida contigo. El "Acceso personal" no cambia
  y **toda lectura propia de syncService sigue filtrando `user_id`** (si
  no, lo compartido se mezclaría con lo tuyo).
- Local: `sincronizarCompartidas` (al final de `sincronizar`, solo con
  `v0.24.sql`) reemplaza por completo `compartidas`, `cuentasAjenas` y
  `movimientosAjenos` (lo que OTRAS personas registraron en cuentas
  compartidas, mías o ajenas, con autor y nombre de categoría). Nada de
  eso se sube. `useCompartidas` lo expone.
- Uso: lo que registro en una cuenta ajena es una transacción mía normal
  (cuenta mis análisis). Dashboard pasa `cuentasConCompartidas` (ajenas
  con "(compartida)") a los formularios y a Movimientos; `Inicio` y
  `GestionCuentas` suman `movimientosCompartidos` solo a los saldos. Las
  ajenas no suman a mi saldo total ni se editan en Cuentas.
  `repararReferenciasHuerfanas` considera válidas las ajenas. Una cuenta
  compartida no se puede eliminar hasta quitar a sus miembros.

## Reporte mensual (v0.12)

- `PanelReporte` genera el reporte de un mes; "Descargar PDF" llama a
  `window.print()` con la clase `imprimiendo-reporte` en `<body>` (el CSS
  de impresión oculta todo menos `.reporte-imprimible`) y fuerza el tema
  claro mientras dura la impresión. Del día 1 al 7 el resumen inteligente
  avisa que el reporte del mes anterior está listo.

## Chanchitos (v0.14)

- Planificar → Chanchitos (`PanelChanchitos`, `chanchitoService`,
  `utils/chanchitos.ts`, `utils/retos.ts`). Distinto de Metas: sin
  objetivo ni fecha. Tabla remota `chanchitos` (movimientos/reto jsonb).
- Tipo `cuenta` ("apartado"): crea una cuenta de sistema `tipo:
  'chanchito'` (nombre único "Chanchito X", "… (2)"); echar/sacar son
  transferencias → bajan el saldo disponible sin contar como gasto y el
  patrimonio incluye lo apartado. Esas cuentas NO se ofrecen al registrar
  (`cuentasOperativas`, FormularioTransaccion), no se editan en Cuentas
  y `deduplicarCatalogos` las ignora. Saldo = saldo de su cuenta.
- Tipo `fisico`: solo `movimientos` (no toca cuentas). Sacarlo a una
  cuenta = ingreso con categoría; "lo usé" = solo se descuenta.
- Retos (`RetoAhorro`): `semanas52` (semana N = N × base), `diario`
  (base × días), `monedas` (contador). `cumplidos` guarda claves
  ('s3', 'AAAA-MM-DD', 'm<ts>'); `estadoReto` calcula lo de hoy y los
  atrasados. Insight "reto-chanchito" en Inicio.
- Romper = sacar todo, a una cuenta o a una meta (aporte). Eliminar exige
  saldo 0; un apartado con historial se archiva (borrar sus
  transferencias cambiaría otras cuentas).

## Ocultar montos y respaldo (v0.15)

- Ojo del Header → `utils/privacidad.ts` (`useMontosOcultos`,
  localStorage). `formatearMoneda/MonedaCorta/Dolares` devuelven
  "S/ •••" mientras está activo; App usa el hook arriba del todo para que
  se repinte todo. Si un `useMemo` guarda textos con montos, agregar
  `ocultos` a sus dependencias (como `insights` en Dashboard).
- Más → Seguridad y respaldo: `respaldoService` exporta todas las tablas
  del usuario a JSON (sin `sincronizado`) y restaura: `bulkPut` como
  pendiente de subir, cancela borrados pendientes de lo restaurado. Si el
  respaldo es de otro usuario, renueva todos los ids y re-apunta
  `cuentaId`/`categoriaId`/`recurrenteId`/`transferenciaId`; los
  catálogos repetidos los une `deduplicarCatalogos`.

## Bloqueo con PIN (v0.13)

- `utils/pin.ts`: PIN de 4–6 dígitos por dispositivo (localStorage, NO se
  sincroniza); se guarda solo un hash PBKDF2 con sal. 5 fallos → espera de
  30 s por intento. Es barrera de privacidad, no cifrado.
- `App.tsx` arranca bloqueado si hay PIN y vuelve a bloquear tras N
  minutos en segundo plano (`visibilitychange`); `BloqueoPin` tapa toda la
  app. "Olvidé mi PIN" = cerrar sesión. Cerrar sesión quita el PIN.
- Configuración en Más → Seguridad (`Seguridad.tsx`).

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

- `vite.config.ts` separa supabase, react y dexie en chunks propios
  (`rolldownOptions.output.codeSplitting.groups`): se cachean entre
  versiones y ningún chunk supera 500 kB.
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
VITE_VAPID_PUBLIC_KEY=   # opcional: recordatorios push
```

## Esquema remoto (Supabase)

**`BASE_DE_DATOS.sql` (raíz del repo) es el SQL completo y único** que el
usuario pega en el SQL Editor (pedido explícito del usuario):
- Sección 1 tablas, 2 índices/RLS/permisos + consulta de comprobación,
  3 borrado total (3A vaciar datos, 3B eliminar tablas) dentro de
  `/* */` para que pegar el archivo entero nunca borre nada.
- Idempotente: sirve en base vacía y en la actual (`CREATE TABLE IF NOT
  EXISTS` con todas las columnas + `ADD COLUMN IF NOT EXISTS`).
- **Todo cambio de base que necesite una función nueva se agrega ahí**
  (y en su HISTORIAL), no en archivos sueltos. `supabase/migraciones/`
  queda solo como historial. Probar el script con PGlite (esquema `auth`
  simulado) en base vacía, base antigua y ejecutándolo dos veces.

El esquema inicial se creó a mano en el panel;
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

### Migraciones

`syncService.MIGRACIONES` lista cada archivo con una consulta `limit 0` que
solo funciona si ya se ejecutó; `sincronizar` devuelve
`migracionesPendientes` y `App.tsx` pide ejecutar `BASE_DE_DATOS.sql`. Al
cambiar el esquema: agregarlo a `BASE_DE_DATOS.sql` + entrada en
`MIGRACIONES` (el nombre `v0.X.sql` es solo un identificador), y enviar las
columnas nuevas solo cuando tienen valor (así lo demás sigue subiendo sin
la migración).

- `v0.11.sql`: `transacciones.etiquetas text[]` y `deudas.gasto_dividido`.
- `v0.13.sql`: `recurrentes.dia_mes`.
- `v0.14.sql`: tabla `chanchitos`.
- `v0.16.sql`: `categorias.padre_id`, tablas `reglas` y `plantillas`.
- `v0.17.sql`: `categorias.clase`, tabla `ajustes`.
- `v0.18.sql`: tabla `cuotas`.
- `v0.19.sql`: tabla `deseos`.
- `v0.20.sql`: `cuentas.icono`, `cuentas.color`.
- `v0.21.sql`: `transacciones.ubicacion`.
- `v0.23.sql`: `transacciones.recibo`, bucket `recibos`, tabla
  `suscripciones_push`.
- `v0.24.sql`: tabla `cuentas_compartidas` + funciones y políticas.
  `esquemaListo(archivo)` dice si ya está confirmada (las columnas nuevas
  de tablas existentes solo se envían entonces). El aviso de App.tsx
  usa `FUNCIONES_POR_MIGRACION`.

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
  `vercel.json` ya está listo (Vite, sin caché para `sw.js`, assets
  inmutables); falta importar el repo en Vercel y cargar las env vars.
- `BASE_DE_DATOS.sql`: el usuario debe ejecutarlo en su proyecto de
  Supabase (ver "Esquema remoto").
- Recurrentes recortados ANTES de v0.13 (sin `diaMes`) siguen en el día
  recortado; basta con editar la fecha de la regla para corregirlos.
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
