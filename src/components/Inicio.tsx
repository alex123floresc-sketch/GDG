import { useMemo, useState } from 'react'
import { useNumeroAnimado } from '../hooks/useNumeroAnimado'
import type { Categoria, Cuenta, Meta, Presupuesto, Transaccion } from '../types'
import { clavePeriodo, esMovimientoReal, resumenPorCategoria, resumenUltimosMeses } from '../utils/analisis'
import { ICONO_CUENTA, saldosPorCuenta } from '../utils/cuentas'
import { formatearMoneda, formatearPorcentaje } from '../utils/formato'
import type { Insight } from '../utils/insights'
import { estadoMeta, estadoPresupuestos } from '../utils/planificacion'
import BarraProgreso from './BarraProgreso'
import type { TipoFormulario } from './FormularioTransaccion'
import GraficoBarras from './graficos/GraficoBarras'
import GraficoDona from './graficos/GraficoDona'
import ListaTransacciones from './ListaTransacciones'
import ResumenInteligente from './ResumenInteligente'

type Destino = NonNullable<Insight['destino']> | 'movimientos'

interface InicioProps {
  email: string
  transacciones: Transaccion[]
  categorias: Categoria[]
  cuentas: Cuenta[]
  presupuestos: Presupuesto[]
  metas: Meta[]
  insights: Insight[]
  onRegistrar: (tipo: TipoFormulario) => void
  onNavegar: (destino: Destino) => void
  onSeleccionar: (t: Transaccion) => void
}

const MESES_TENDENCIA = 6
const RECIENTES = 6

function saludo(hora: number): string {
  if (hora < 12) return 'Buenos días'
  if (hora < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

function Inicio({
  email,
  transacciones,
  categorias,
  cuentas,
  presupuestos,
  metas,
  insights,
  onRegistrar,
  onNavegar,
  onSeleccionar,
}: InicioProps) {
  const [hoy] = useState(() => new Date())

  const saldos = useMemo(() => saldosPorCuenta(cuentas, transacciones), [cuentas, transacciones])
  const saldoTotal = [...saldos.values()].reduce((s, v) => s + v, 0)

  const mes = useMemo(() => {
    const clave = clavePeriodo(hoy, 'mes')
    const delMes = transacciones.filter((t) => esMovimientoReal(t) && clavePeriodo(t.fecha, 'mes') === clave)
    const ingresos = delMes.filter((t) => t.tipo === 'ingreso').reduce((s, t) => s + t.monto, 0)
    const gastos = delMes.filter((t) => t.tipo === 'gasto').reduce((s, t) => s + t.monto, 0)
    return { delMes, ingresos, gastos, ahorro: ingresos - gastos }
  }, [transacciones, hoy])

  const tendencia = useMemo(() => resumenUltimosMeses(transacciones, MESES_TENDENCIA), [transacciones])
  const gastosPorCategoria = useMemo(
    () => resumenPorCategoria(mes.delMes, categorias, 'gasto'),
    [mes.delMes, categorias],
  )
  const presupuestosMes = useMemo(
    () => estadoPresupuestos(presupuestos, categorias, transacciones, hoy.getFullYear(), hoy.getMonth(), hoy).slice(0, 3),
    [presupuestos, categorias, transacciones, hoy],
  )
  const metasActivas = useMemo(
    () =>
      metas
        .map((m) => ({ m, e: estadoMeta(m, hoy) }))
        .filter((x) => !x.e.completada)
        .sort((a, b) => b.e.porcentaje - a.e.porcentaje)
        .slice(0, 3),
    [metas, hoy],
  )

  const saldoAnimado = useNumeroAnimado(saldoTotal)
  const ingresosAnimados = useNumeroAnimado(mes.ingresos)
  const gastosAnimados = useNumeroAnimado(mes.gastos)
  const nombreMes = new Intl.DateTimeFormat('es-PE', { month: 'long' }).format(hoy)
  const nombre = email.split('@')[0]
  const fechaLarga = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long' }).format(hoy)

  return (
    <div className="vista-inicio">
      <section className="tarjeta-principal">
        <div className="saludo">
          <span>
            {saludo(hoy.getHours())}
            {nombre ? `, ${nombre}` : ''}
          </span>
          <span className="fecha">{fechaLarga.charAt(0).toUpperCase() + fechaLarga.slice(1)}</span>
        </div>
        <div className="saldo-total">
          <span className="etiqueta">Saldo total</span>
          <strong className="cifra">{formatearMoneda(saldoAnimado)}</strong>
        </div>
        <div className="mes-actual">
          <div>
            <span><i className="arrow down icon" />Ingresos de {nombreMes}</span>
            <strong>{formatearMoneda(ingresosAnimados)}</strong>
          </div>
          <div>
            <span><i className="arrow up icon" />Gastos de {nombreMes}</span>
            <strong>{formatearMoneda(gastosAnimados)}</strong>
          </div>
          <div>
            <span><i className="piggy bank icon" />{mes.ahorro >= 0 ? 'Ahorro' : 'Déficit'}</span>
            <strong>
              {formatearMoneda(Math.abs(mes.ahorro))}
              {mes.ingresos > 0 && mes.ahorro > 0 && (
                <small> · {formatearPorcentaje(mes.ahorro / mes.ingresos)}</small>
              )}
            </strong>
          </div>
        </div>
        <div className="acciones-rapidas">
          <button type="button" onClick={() => onRegistrar('gasto')}>
            <i className="minus circle icon" />
            Gasto
          </button>
          <button type="button" onClick={() => onRegistrar('ingreso')}>
            <i className="plus circle icon" />
            Ingreso
          </button>
          <button type="button" onClick={() => onRegistrar('transferencia')} disabled={cuentas.length < 2}>
            <i className="exchange icon" />
            Transferir
          </button>
        </div>
      </section>

      <section className="carrusel-cuentas" aria-label="Tus cuentas">
        {cuentas.filter((c) => c.tipo !== 'chanchito').map((c) => {
          const saldo = saldos.get(c.id) ?? c.saldoInicial
          return (
            <button key={c.id} type="button" className="chip-cuenta" onClick={() => onNavegar('mas:cuentas')}>
              <span className="icono-circulo mini fondo-marca">
                <i className={`${ICONO_CUENTA[c.tipo]} icon`} />
              </span>
              <span className="datos">
                <span className="nombre">{c.nombre}</span>
                <strong className={saldo < 0 ? 'texto-gasto' : ''}>{formatearMoneda(saldo)}</strong>
              </span>
            </button>
          )
        })}
        {cuentas.some((c) => c.tipo === 'chanchito') && (
          <button type="button" className="chip-cuenta" onClick={() => onNavegar('planificar:chanchitos')}>
            <span className="icono-circulo mini fondo-marca">
              <i className="piggy bank icon" />
            </span>
            <span className="datos">
              <span className="nombre">Chanchitos</span>
              <strong>
                {formatearMoneda(
                  cuentas.filter((c) => c.tipo === 'chanchito').reduce((s, c) => s + (saldos.get(c.id) ?? 0), 0),
                )}
              </strong>
            </span>
          </button>
        )}
      </section>

      <ResumenInteligente insights={insights} onNavegar={onNavegar} />

      <div className="rejilla-inicio">
        <section className="ui segment">
          <div className="titulo-bloque">
            <h3 className="ui header">
              <i className="chart pie icon" />
              <div className="content">Presupuestos</div>
            </h3>
            <button type="button" className="enlace-sugerencia" onClick={() => onNavegar('planificar:presupuestos')}>
              {presupuestosMes.length ? 'Ver todos' : 'Crear'}
            </button>
          </div>
          {presupuestosMes.length === 0 ? (
            <p className="texto-suave">Ponle un límite a tus gastos y ve cuánto te queda cada mes.</p>
          ) : (
            presupuestosMes.map((e) => (
              <div key={e.presupuesto.id} className="fila-mini">
                <div className="linea">
                  <span>{e.categoria?.nombre ?? '—'}</span>
                  <span className={e.nivel === 'excedido' ? 'texto-gasto' : e.nivel === 'alerta' ? 'texto-alerta' : 'texto-suave'}>
                    {formatearMoneda(e.gastado)} / {formatearMoneda(e.presupuesto.montoLimite)}
                  </span>
                </div>
                <BarraProgreso
                  valor={e.porcentaje}
                  color={e.nivel === 'excedido' ? 'var(--color-gasto)' : e.nivel === 'alerta' ? 'var(--color-alerta)' : 'var(--color-marca)'}
                  etiqueta={`${e.categoria?.nombre}: ${formatearPorcentaje(e.porcentaje)}`}
                  grosor={6}
                />
              </div>
            ))
          )}
        </section>

        <section className="ui segment">
          <div className="titulo-bloque">
            <h3 className="ui header">
              <i className="bullseye icon" />
              <div className="content">Metas de ahorro</div>
            </h3>
            <button type="button" className="enlace-sugerencia" onClick={() => onNavegar('planificar:metas')}>
              {metasActivas.length ? 'Ver todas' : 'Crear'}
            </button>
          </div>
          {metasActivas.length === 0 ? (
            <p className="texto-suave">¿Ahorrando para algo? Crea una meta y sigue tu avance.</p>
          ) : (
            metasActivas.map(({ m, e }) => (
              <div key={m.id} className="fila-mini">
                <div className="linea">
                  <span>
                    <i className={`${m.icono} icon`} style={{ color: m.color }} />
                    {m.nombre}
                  </span>
                  <span className="texto-suave">{formatearPorcentaje(e.porcentaje)}</span>
                </div>
                <BarraProgreso valor={e.porcentaje} color={m.color} etiqueta={`${m.nombre}: ${formatearPorcentaje(e.porcentaje)}`} grosor={6} />
              </div>
            ))
          )}
        </section>
      </div>

      <div className="rejilla-inicio">
        <section className="ui segment">
          <h3 className="ui header">
            <i className="chart bar outline icon" />
            <div className="content">
              Últimos {MESES_TENDENCIA} meses
              <div className="sub header">Ingresos vs. gastos</div>
            </div>
          </h3>
          <GraficoBarras periodos={tendencia} alto={220} />
        </section>
        <section className="ui segment">
          <h3 className="ui header">
            <i className="chart pie icon" />
            <div className="content">
              Gastos de {nombreMes}
              <div className="sub header">Por categoría</div>
            </div>
          </h3>
          <GraficoDona datos={gastosPorCategoria} titulo="Gastos" maxPorciones={5} />
        </section>
      </div>

      <ListaTransacciones
        transacciones={transacciones}
        categorias={categorias}
        cuentas={cuentas}
        titulo="Últimos movimientos"
        limite={RECIENTES}
        onSeleccionar={onSeleccionar}
        accion={{ texto: 'Ver todos', onClick: () => onNavegar('movimientos') }}
        vacio='Aún no hay movimientos. Toca "Gasto" o "Ingreso" arriba para registrar el primero.'
      />
    </div>
  )
}

export default Inicio
