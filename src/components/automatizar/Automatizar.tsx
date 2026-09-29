import type { Categoria, Cuenta, Plantilla, Regla, Transaccion } from '../../types'
import PanelPlantillas from './PanelPlantillas'
import PanelReglas from './PanelReglas'

interface AutomatizarProps {
  usuarioId: string
  plantillas: Plantilla[]
  reglas: Regla[]
  categorias: Categoria[]
  /** Solo las operativas (sin chanchitos). */
  cuentas: Cuenta[]
  transacciones: Transaccion[]
}

/** Más → Automatizar: plantillas de registro rápido y reglas de categorías. */
function Automatizar(props: AutomatizarProps) {
  return (
    <>
      <div className="barra-filtros">
        <h2 className="ui header">
          <i className="magic icon" />
          <div className="content">
            Automatizar
            <div className="sub header">Registra más rápido y deja que la app categorice por ti</div>
          </div>
        </h2>
      </div>
      <PanelPlantillas
        usuarioId={props.usuarioId}
        plantillas={props.plantillas}
        categorias={props.categorias}
        cuentas={props.cuentas}
        transacciones={props.transacciones}
      />
      <PanelReglas
        usuarioId={props.usuarioId}
        reglas={props.reglas}
        categorias={props.categorias}
        cuentas={props.cuentas}
        transacciones={props.transacciones}
      />
    </>
  )
}

export default Automatizar
