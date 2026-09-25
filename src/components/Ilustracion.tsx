/*
 * Ilustraciones de los estados vacíos. SVG propios dibujados con las
 * variables de color de la app, así se adaptan solos al modo oscuro.
 */

export type NombreIlustracion =
  | 'movimientos'
  | 'buscar'
  | 'metas'
  | 'deudas'
  | 'presupuestos'
  | 'recurrentes'
  | 'graficos'
  | 'etiquetas'

const FONDO = 'var(--color-marca-suave)'
const TRAZO = 'var(--color-marca)'
const SUPERFICIE = 'var(--color-superficie)'
const INGRESO = 'var(--serie-ingreso)'
const GASTO = 'var(--serie-gasto)'
const SUAVE = 'var(--grafico-eje)'

function Dibujo({ nombre }: { nombre: NombreIlustracion }) {
  switch (nombre) {
    case 'movimientos':
      return (
        <>
          <rect x="38" y="18" width="64" height="80" rx="8" fill={SUPERFICIE} stroke={TRAZO} strokeWidth="2.5" />
          <path d="M38 90 l8 8 8-8 8 8 8-8 8 8 8-8 8 8 8-8" fill="none" stroke={TRAZO} strokeWidth="2.5" strokeLinejoin="round" />
          <rect x="48" y="30" width="30" height="6" rx="3" fill={TRAZO} />
          <rect x="48" y="46" width="44" height="4" rx="2" fill={SUAVE} />
          <rect x="48" y="56" width="36" height="4" rx="2" fill={SUAVE} />
          <rect x="48" y="66" width="40" height="4" rx="2" fill={SUAVE} />
          <circle cx="108" cy="30" r="12" fill={INGRESO} />
          <path d="M108 24 v12 M102 30 h12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
        </>
      )
    case 'buscar':
      return (
        <>
          <circle cx="62" cy="52" r="26" fill={SUPERFICIE} stroke={TRAZO} strokeWidth="3" />
          <path d="M81 71 l20 20" stroke={TRAZO} strokeWidth="7" strokeLinecap="round" />
          <path d="M52 52 h20" stroke={SUAVE} strokeWidth="4" strokeLinecap="round" />
        </>
      )
    case 'metas':
      return (
        <>
          <circle cx="66" cy="58" r="36" fill={SUPERFICIE} stroke={TRAZO} strokeWidth="2.5" />
          <circle cx="66" cy="58" r="24" fill="none" stroke={SUAVE} strokeWidth="2.5" />
          <circle cx="66" cy="58" r="11" fill={GASTO} />
          <path d="M66 58 L104 20" stroke={TRAZO} strokeWidth="3" strokeLinecap="round" />
          <path d="M98 16 l10 -2 -2 10 z" fill={TRAZO} />
          <path d="M104 20 l6 6 M100 24 l6 6" stroke={INGRESO} strokeWidth="3" strokeLinecap="round" />
        </>
      )
    case 'deudas':
      return (
        <>
          <circle cx="44" cy="40" r="13" fill={SUPERFICIE} stroke={TRAZO} strokeWidth="2.5" />
          <circle cx="96" cy="40" r="13" fill={SUPERFICIE} stroke={TRAZO} strokeWidth="2.5" />
          <path d="M22 88 c0 -18 12 -28 22 -28 s22 10 22 28" fill={SUPERFICIE} stroke={TRAZO} strokeWidth="2.5" />
          <path d="M74 88 c0 -18 12 -28 22 -28 s22 10 22 28" fill={SUPERFICIE} stroke={TRAZO} strokeWidth="2.5" />
          <path d="M58 66 h24" stroke={INGRESO} strokeWidth="3" strokeLinecap="round" />
          <path d="M76 60 l6 6 -6 6" fill="none" stroke={INGRESO} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="70" cy="30" r="9" fill={GASTO} />
          <text x="70" y="34" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">S/</text>
        </>
      )
    case 'presupuestos':
      return (
        <>
          <circle cx="62" cy="58" r="34" fill={SUPERFICIE} stroke={TRAZO} strokeWidth="2.5" />
          <path d="M62 58 L62 24 A34 34 0 0 1 94 70 Z" fill={TRAZO} />
          <path d="M62 58 L94 70 A34 34 0 0 1 72 90 Z" fill={GASTO} />
          <rect x="100" y="30" width="22" height="6" rx="3" fill={SUAVE} />
          <rect x="100" y="44" width="16" height="6" rx="3" fill={SUAVE} />
          <rect x="100" y="58" width="19" height="6" rx="3" fill={SUAVE} />
        </>
      )
    case 'recurrentes':
      return (
        <>
          <rect x="30" y="26" width="64" height="62" rx="8" fill={SUPERFICIE} stroke={TRAZO} strokeWidth="2.5" />
          <rect x="30" y="26" width="64" height="14" rx="7" fill={TRAZO} />
          {[0, 1, 2, 3].map((i) =>
            [0, 1, 2].map((j) => (
              <rect key={`${i}-${j}`} x={38 + i * 13} y={48 + j * 12} width="8" height="7" rx="2" fill={i === 1 && j === 1 ? GASTO : SUAVE} />
            )),
          )}
          <circle cx="100" cy="78" r="16" fill={SUPERFICIE} stroke={INGRESO} strokeWidth="3" />
          <path d="M92 76 a8 8 0 0 1 14 -4 M108 80 a8 8 0 0 1 -14 4" fill="none" stroke={INGRESO} strokeWidth="2.5" strokeLinecap="round" />
        </>
      )
    case 'graficos':
      return (
        <>
          <path d="M26 92 h92" stroke={SUAVE} strokeWidth="2.5" strokeLinecap="round" />
          <rect x="36" y="60" width="14" height="32" rx="3" fill={INGRESO} />
          <rect x="56" y="44" width="14" height="48" rx="3" fill={TRAZO} />
          <rect x="76" y="70" width="14" height="22" rx="3" fill={GASTO} />
          <rect x="96" y="34" width="14" height="58" rx="3" fill={SUAVE} />
        </>
      )
    case 'etiquetas':
      return (
        <>
          <path d="M34 34 h34 l30 30 -26 26 -30 -30 z" fill={SUPERFICIE} stroke={TRAZO} strokeWidth="2.5" strokeLinejoin="round" />
          <circle cx="48" cy="48" r="5" fill={TRAZO} />
          <text x="88" y="36" fontSize="26" fontWeight="700" fill={GASTO}>#</text>
        </>
      )
  }
}

/** Ilustración decorativa (oculta a lectores de pantalla). */
function Ilustracion({ nombre, tamano = 140 }: { nombre: NombreIlustracion; tamano?: number }) {
  return (
    <svg
      className="ilustracion"
      width={tamano}
      height={(tamano * 110) / 140}
      viewBox="0 0 140 110"
      aria-hidden="true"
    >
      <ellipse cx="70" cy="100" rx="52" ry="6" fill={FONDO} />
      <circle cx="70" cy="56" r="50" fill={FONDO} />
      <Dibujo nombre={nombre} />
    </svg>
  )
}

export default Ilustracion
