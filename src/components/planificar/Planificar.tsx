import type { Categoria, Chanchito, Cuenta, Deuda, Meta, Presupuesto, Recurrente, Transaccion } from '../../types'
import { cuentasOperativas } from '../../utils/cuentas'
import PanelChanchitos from './PanelChanchitos'
import PanelDeudas from './PanelDeudas'
import PanelMetas from './PanelMetas'
import PanelPresupuestos from './PanelPresupuestos'
import PanelRecurrentes from './PanelRecurrentes'

export type PestanaPlanificar = 'presupuestos' | 'metas' | 'chanchitos' | 'deudas' | 'recurrentes'

const PESTANAS: { id: PestanaPlanificar; etiqueta: string; icono: string }[] = [
  { id: 'presupuestos', etiqueta: 'Presupuestos', icono: 'chart pie' },
  { id: 'metas', etiqueta: 'Metas', icono: 'bullseye' },
  { id: 'chanchitos', etiqueta: 'Chanchitos', icono: 'piggy bank' },
  { id: 'deudas', etiqueta: 'Deudas', icono: 'handshake' },
  { id: 'recurrentes', etiqueta: 'Recurrentes', icono: 'redo alternate' },
]

interface PlanificarProps {
  usuarioId: string
  pestana: PestanaPlanificar
  onCambiarPestana: (p: PestanaPlanificar) => void
  categorias: Categoria[]
  cuentas: Cuenta[]
  transacciones: Transaccion[]
  presupuestos: Presupuesto[]
  metas: Meta[]
  chanchitos: Chanchito[]
  deudas: Deuda[]
  recurrentes: Recurrente[]
}

function Planificar(props: PlanificarProps) {
  const { usuarioId, pestana, onCambiarPestana, categorias, cuentas, transacciones } = props

  return (
    <>
      <div className="barra-filtros">
        <h2 className="ui header">
          <i className="compass outline icon" />
          <div className="content">
            Planificar
            <div className="sub header">Presupuestos, metas, chanchitos, deudas y pagos fijos</div>
          </div>
        </h2>
      </div>

      <div className="ui secondary pointing menu submenu-mas pestanas-desplazables">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`item ${pestana === p.id ? 'active' : ''}`}
            onClick={() => onCambiarPestana(p.id)}
          >
            <i className={`${p.icono} icon`} />
            {p.etiqueta}
          </button>
        ))}
      </div>

      <div key={pestana} className="entrada-suave">
        {pestana === 'presupuestos' && (
          <PanelPresupuestos
            usuarioId={usuarioId}
            presupuestos={props.presupuestos}
            categorias={categorias}
            transacciones={transacciones}
          />
        )}
        {pestana === 'metas' && <PanelMetas usuarioId={usuarioId} metas={props.metas} />}
        {pestana === 'chanchitos' && (
          <PanelChanchitos
            usuarioId={usuarioId}
            chanchitos={props.chanchitos}
            cuentas={cuentas}
            transacciones={transacciones}
            categorias={categorias}
            metas={props.metas}
          />
        )}
        {pestana === 'deudas' && (
          <PanelDeudas usuarioId={usuarioId} deudas={props.deudas} cuentas={cuentasOperativas(cuentas)} categorias={categorias} />
        )}
        {pestana === 'recurrentes' && (
          <PanelRecurrentes
            usuarioId={usuarioId}
            recurrentes={props.recurrentes}
            categorias={categorias}
            cuentas={cuentasOperativas(cuentas)}
          />
        )}
      </div>
    </>
  )
}

export default Planificar
