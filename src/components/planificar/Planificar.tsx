import type { Ajustes, Categoria, Chanchito, CompraCuotas, Cuenta, Deseo, Deuda, Inversion, Meta, Presupuesto, Recurrente, Transaccion } from '../../types'
import { cuentasOperativas } from '../../utils/cuentas'
import PanelCalendarioPagos from './PanelCalendarioPagos'
import PanelChanchitos from './PanelChanchitos'
import PanelCuotas from './PanelCuotas'
import PanelDeseos from './PanelDeseos'
import PanelDeudas from './PanelDeudas'
import PanelInversiones from './PanelInversiones'
import PanelMetas from './PanelMetas'
import PanelPresupuestos from './PanelPresupuestos'
import PanelRecurrentes from './PanelRecurrentes'

export type PestanaPlanificar =
  | 'presupuestos'
  | 'metas'
  | 'chanchitos'
  | 'inversiones'
  | 'deudas'
  | 'recurrentes'
  | 'cuotas'
  | 'calendario'
  | 'deseos'

const PESTANAS: { id: PestanaPlanificar; etiqueta: string; icono: string }[] = [
  { id: 'presupuestos', etiqueta: 'Presupuestos', icono: 'chart pie' },
  { id: 'metas', etiqueta: 'Metas', icono: 'bullseye' },
  { id: 'chanchitos', etiqueta: 'Chanchitos', icono: 'piggy bank' },
  { id: 'inversiones', etiqueta: 'Inversiones', icono: 'chartline' },
  { id: 'deudas', etiqueta: 'Deudas', icono: 'handshake' },
  { id: 'recurrentes', etiqueta: 'Recurrentes', icono: 'redo alternate' },
  { id: 'cuotas', etiqueta: 'Cuotas', icono: 'credit card outline' },
  { id: 'calendario', etiqueta: 'Calendario', icono: 'calendar alternate outline' },
  { id: 'deseos', etiqueta: 'Deseos', icono: 'gift' },
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
  inversiones: Inversion[]
  deudas: Deuda[]
  recurrentes: Recurrente[]
  cuotas: CompraCuotas[]
  deseos: Deseo[]
  ajustes: Ajustes
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
            <div className="sub header">Presupuestos, metas, chanchitos, inversiones, deudas, pagos fijos y cuotas</div>
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
        {pestana === 'inversiones' && <PanelInversiones usuarioId={usuarioId} inversiones={props.inversiones} />}
        {pestana === 'deudas' && (
          <PanelDeudas usuarioId={usuarioId} deudas={props.deudas} cuentas={cuentasOperativas(cuentas)} categorias={categorias} />
        )}
        {pestana === 'recurrentes' && (
          <PanelRecurrentes
            usuarioId={usuarioId}
            recurrentes={props.recurrentes}
            categorias={categorias}
            cuentas={cuentasOperativas(cuentas)}
            transacciones={transacciones}
            ajustes={props.ajustes}
          />
        )}
        {pestana === 'cuotas' && (
          <PanelCuotas
            usuarioId={usuarioId}
            cuotas={props.cuotas}
            cuentas={cuentasOperativas(cuentas)}
            categorias={categorias}
            transacciones={transacciones}
          />
        )}
        {pestana === 'deseos' && (
          <PanelDeseos
            usuarioId={usuarioId}
            deseos={props.deseos}
            metas={props.metas}
            ajustes={props.ajustes}
            cuentas={cuentasOperativas(cuentas)}
            categorias={categorias}
            transacciones={transacciones}
          />
        )}
        {pestana === 'calendario' && (
          <PanelCalendarioPagos
            recurrentes={props.recurrentes}
            transacciones={transacciones}
            cuentas={cuentas}
            cuotas={props.cuotas}
            deudas={props.deudas}
            metas={props.metas}
          />
        )}
      </div>
    </>
  )
}

export default Planificar
