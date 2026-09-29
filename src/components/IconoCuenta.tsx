import type { Cuenta } from '../types'
import { aparienciaCuenta } from '../utils/cuentas'

interface IconoCuentaProps {
  cuenta: Pick<Cuenta, 'icono' | 'color' | 'nombre' | 'tipo'>
  /** `mini` (círculo chico), `normal` o `linea` (dentro de un botón o texto). */
  tamano?: 'mini' | 'normal' | 'linea'
}

/** Icono o "logo" (sigla con el color de la marca) de una cuenta. */
function IconoCuenta({ cuenta, tamano = 'mini' }: IconoCuentaProps) {
  const a = aparienciaCuenta(cuenta)

  if (tamano === 'linea') {
    return a.tipo === 'logo' ? (
      <span className="logo-cuenta en-linea" style={{ background: a.fondo, color: a.texto }} aria-hidden="true">
        {a.sigla}
      </span>
    ) : (
      <i className={`${a.icono} icon`} style={a.fondo ? { color: a.fondo } : undefined} />
    )
  }

  const clase = `icono-circulo ${tamano === 'mini' ? 'mini' : ''}`
  if (a.tipo === 'logo') {
    return (
      <span className={`${clase} logo-cuenta`} style={{ background: a.fondo, color: a.texto }} title={a.nombre} aria-hidden="true">
        {a.sigla}
      </span>
    )
  }
  return (
    <span className={`${clase} ${a.fondo ? '' : 'fondo-marca'}`} style={a.fondo ? { background: a.fondo } : undefined}>
      <i className={`${a.icono} icon`} />
    </span>
  )
}

export default IconoCuenta
