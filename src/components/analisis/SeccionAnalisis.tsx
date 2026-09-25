import type { ReactNode } from 'react'
import type { Categoria, Cuenta, Deuda, Meta, Presupuesto, Transaccion } from '../../types'
import Analisis from '../Analisis'
import PanelComparar from './PanelComparar'
import PanelPatrimonio from './PanelPatrimonio'
import PanelReporte from './PanelReporte'

export type PestanaAnalisis = 'resumen' | 'comparar' | 'patrimonio' | 'reporte'

const PESTANAS: { id: PestanaAnalisis; etiqueta: string; icono: string }[] = [
  { id: 'resumen', etiqueta: 'Resumen', icono: 'chart bar' },
  { id: 'comparar', etiqueta: 'Comparar', icono: 'exchange' },
  { id: 'patrimonio', etiqueta: 'Patrimonio', icono: 'balance scale' },
  { id: 'reporte', etiqueta: 'Reporte mensual', icono: 'file alternate outline' },
]

interface SeccionAnalisisProps {
  pestana: PestanaAnalisis
  onCambiarPestana: (p: PestanaAnalisis) => void
  email: string
  /** Filtradas por la cuenta elegida (solo las usa "Resumen"). */
  transaccionesFiltradas: Transaccion[]
  transacciones: Transaccion[]
  categorias: Categoria[]
  cuentas: Cuenta[]
  deudas: Deuda[]
  presupuestos: Presupuesto[]
  metas: Meta[]
  filtroCuenta: ReactNode
}

function SeccionAnalisis(props: SeccionAnalisisProps) {
  const { pestana, onCambiarPestana, transacciones, categorias, cuentas } = props

  return (
    <>
      <div className="ui secondary pointing menu submenu-mas pestanas-desplazables no-imprimir">
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
        {pestana === 'resumen' && (
          <Analisis
            transacciones={props.transaccionesFiltradas}
            categorias={categorias}
            cuentas={cuentas}
            filtroCuenta={props.filtroCuenta}
          />
        )}
        {pestana === 'comparar' && <PanelComparar transacciones={transacciones} categorias={categorias} />}
        {pestana === 'patrimonio' && (
          <PanelPatrimonio cuentas={cuentas} transacciones={transacciones} deudas={props.deudas} />
        )}
        {pestana === 'reporte' && (
          <PanelReporte
            email={props.email}
            transacciones={transacciones}
            categorias={categorias}
            cuentas={cuentas}
            presupuestos={props.presupuestos}
            metas={props.metas}
          />
        )}
      </div>
    </>
  )
}

export default SeccionAnalisis
