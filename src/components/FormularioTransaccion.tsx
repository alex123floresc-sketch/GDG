import { useMemo, useRef, useState, type FormEvent } from 'react'
import { useAvisos } from '../hooks/useAvisos'
import {
  actualizarTransaccion,
  actualizarTransferencia,
  crearTransaccion,
  crearTransferencia,
  eliminarTransaccion,
  restaurarTransacciones,
} from '../services/transaccionService'
import type { Categoria, Cuenta, Moneda, Transaccion, TipoTransaccion } from '../types'
import { ICONO_CUENTA } from '../utils/cuentas'
import {
  fechaDesdeInput,
  fechaParaInput,
  formatearMoneda,
} from '../utils/formato'
import { guardarTipoCambio, leerTipoCambio } from '../utils/preferencias'

export type TipoFormulario = TipoTransaccion | 'transferencia'

interface FormularioTransaccionProps {
  usuarioId: string
  cuentas: Cuenta[]
  categorias: Categoria[]
  /** Todas las del usuario: para ordenar categorías por uso y hallar la otra pata de una transferencia. */
  transacciones: Transaccion[]
  /** Si se pasa, el formulario edita esa transacción en vez de crear una. */
  transaccion?: Transaccion
  tipoInicial?: TipoFormulario
  /** Se llama al guardar o eliminar, con el texto del aviso ya mostrado. */
  onListo?: () => void
  /** Lleva a la pantalla de categorías (para crear una que falte). */
  onGestionarCategorias?: () => void
  /** Muestra "Registrar otro después" (el formulario sigue abierto al guardar). */
  permitirContinuar?: boolean
}

const TIPOS: { id: TipoFormulario; etiqueta: string; icono: string; color: string }[] = [
  { id: 'gasto', etiqueta: 'Gasto', icono: 'arrow up', color: 'red' },
  { id: 'ingreso', etiqueta: 'Ingreso', icono: 'arrow down', color: 'green' },
  { id: 'transferencia', etiqueta: 'Transferir', icono: 'exchange', color: 'primary' },
]

const DIAS_USO_RECIENTE = 60

function FormularioTransaccion({
  usuarioId,
  cuentas,
  categorias,
  transacciones,
  transaccion,
  tipoInicial = 'gasto',
  onListo,
  onGestionarCategorias,
  permitirContinuar = false,
}: FormularioTransaccionProps) {
  const { avisar } = useAvisos()
  const editando = Boolean(transaccion)

  // Si se edita una transferencia, se recuperan sus dos patas.
  const patas = useMemo(() => {
    if (!transaccion?.transferenciaId) return null
    const delPar = transacciones.filter((t) => t.transferenciaId === transaccion.transferenciaId)
    return {
      salida: delPar.find((t) => t.tipo === 'gasto'),
      entrada: delPar.find((t) => t.tipo === 'ingreso'),
    }
  }, [transaccion, transacciones])

  const [tipo, setTipo] = useState<TipoFormulario>(
    transaccion ? (transaccion.transferenciaId ? 'transferencia' : transaccion.tipo) : tipoInicial,
  )
  const [moneda, setMoneda] = useState<Moneda>(transaccion?.moneda ?? 'PEN')
  const [monto, setMonto] = useState(() =>
    transaccion ? String(transaccion.montoOriginal ?? transaccion.monto) : '',
  )
  const [tipoCambio, setTipoCambio] = useState(() =>
    String(transaccion?.tipoCambio ?? leerTipoCambio()),
  )
  const [cuentaId, setCuentaId] = useState(
    patas?.salida?.cuentaId ?? transaccion?.cuentaId ?? '',
  )
  const [cuentaDestinoId, setCuentaDestinoId] = useState(patas?.entrada?.cuentaId ?? '')
  const [categoriaId, setCategoriaId] = useState(transaccion?.categoriaId ?? '')
  const [fecha, setFecha] = useState(() => fechaParaInput(transaccion?.fecha))
  const [concepto, setConcepto] = useState(transaccion?.concepto ?? '')
  const [enviando, setEnviando] = useState(false)
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const montoRef = useRef<HTMLInputElement>(null)

  const [continuar, setContinuar] = useState(false)
  const esTransferencia = tipo === 'transferencia'

  // Categorías del tipo elegido, las más usadas últimamente primero.
  const [montadoEn] = useState(() => Date.now())
  const categoriasDisponibles = useMemo(() => {
    const desde = montadoEn - DIAS_USO_RECIENTE * 86_400_000
    const usos = new Map<string, number>()
    for (const t of transacciones) {
      if (t.fecha.getTime() >= desde) usos.set(t.categoriaId, (usos.get(t.categoriaId) ?? 0) + 1)
    }
    return categorias
      .filter((c) => c.tipo === tipo || c.tipo === 'ambos')
      .sort(
        (a, b) =>
          (usos.get(b.id) ?? 0) - (usos.get(a.id) ?? 0) || a.nombre.localeCompare(b.nombre, 'es'),
      )
  }, [categorias, transacciones, tipo, montadoEn])

  // Selecciones efectivas (caen a un valor válido si la elegida ya no aplica).
  const cuentaSeleccionada = cuentas.some((c) => c.id === cuentaId) ? cuentaId : (cuentas[0]?.id ?? '')
  const destinoSeleccionado =
    cuentas.some((c) => c.id === cuentaDestinoId) && cuentaDestinoId !== cuentaSeleccionada
      ? cuentaDestinoId
      : (cuentas.find((c) => c.id !== cuentaSeleccionada)?.id ?? '')
  const categoriaSeleccionada = categoriasDisponibles.some((c) => c.id === categoriaId)
    ? categoriaId
    : ''

  // Montos que más se repiten en la categoría elegida (atajos de un toque).
  const montosFrecuentes = useMemo(() => {
    if (!categoriaSeleccionada || editando) return []
    const conteo = new Map<number, number>()
    for (const t of transacciones) {
      if (t.categoriaId !== categoriaSeleccionada || t.origen === 'transferencia') continue
      const valor = t.montoOriginal ?? t.monto
      conteo.set(valor, (conteo.get(valor) ?? 0) + 1)
    }
    return [...conteo]
      .filter(([, veces]) => veces >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([valor]) => valor)
      .sort((a, b) => a - b)
  }, [transacciones, categoriaSeleccionada, editando])

  // Conceptos ya usados (autocompletado nativo con <datalist>).
  const conceptosPrevios = useMemo(() => {
    const vistos = new Set<string>()
    for (const t of transacciones) {
      if (t.concepto && (esTransferencia ? t.origen === 'transferencia' : t.tipo === tipo)) vistos.add(t.concepto)
      if (vistos.size >= 30) break
    }
    return [...vistos]
  }, [transacciones, tipo, esTransferencia])

  const montoNumerico = Number(monto)
  const cambioNumerico = Number(tipoCambio)
  const montoEnSoles =
    moneda === 'USD' ? Math.round(montoNumerico * cambioNumerico * 100) / 100 : montoNumerico

  function limpiar() {
    setMonto('')
    setConcepto('')
    setFecha(fechaParaInput())
    montoRef.current?.focus()
  }

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setError(null)

    if (!Number.isFinite(montoNumerico) || montoNumerico <= 0) {
      setError('Ingresa un monto válido mayor a 0.')
      return
    }
    if (moneda === 'USD' && (!Number.isFinite(cambioNumerico) || cambioNumerico <= 0)) {
      setError('Ingresa un tipo de cambio válido.')
      return
    }
    if (!cuentaSeleccionada) {
      setError('Selecciona una cuenta.')
      return
    }
    if (esTransferencia && !destinoSeleccionado) {
      setError('Necesitas al menos dos cuentas para transferir.')
      return
    }
    if (!esTransferencia && !categoriaSeleccionada) {
      setError('Selecciona una categoría.')
      return
    }

    setEnviando(true)
    // Al editar se conserva la hora original si no cambió el día.
    const fechaFinal = fechaDesdeInput(fecha, transaccion?.fecha)
    const conceptoFinal = concepto.trim() || undefined

    try {
      if (esTransferencia) {
        const datos = {
          cuentaOrigenId: cuentaSeleccionada,
          cuentaDestinoId: destinoSeleccionado,
          monto: montoNumerico,
          fecha: fechaFinal,
          concepto: conceptoFinal,
        }
        if (transaccion?.transferenciaId) {
          await actualizarTransferencia(transaccion.transferenciaId, datos)
        } else {
          await crearTransferencia(datos, usuarioId)
        }
        avisar(editando ? 'Transferencia actualizada' : 'Transferencia registrada')
      } else {
        if (moneda === 'USD') guardarTipoCambio(cambioNumerico)
        const datos = {
          monto: montoEnSoles,
          tipo,
          cuentaId: cuentaSeleccionada,
          categoriaId: categoriaSeleccionada,
          fecha: fechaFinal,
          concepto: conceptoFinal,
          // 'PEN' explícito solo si antes estaba en otra moneda (para que
          // Supabase la corrija); las nuevas en soles no la envían.
          moneda: moneda === 'USD' ? moneda : transaccion?.moneda ? ('PEN' as const) : undefined,
          montoOriginal: moneda === 'USD' ? montoNumerico : undefined,
          tipoCambio: moneda === 'USD' ? cambioNumerico : undefined,
        }
        if (transaccion) {
          await actualizarTransaccion(transaccion.id, datos)
          avisar('Movimiento actualizado')
        } else {
          await crearTransaccion({ ...datos, origen: 'manual' }, usuarioId)
          avisar(tipo === 'gasto' ? 'Gasto registrado' : 'Ingreso registrado')
        }
      }

      if (!editando) limpiar()
      if (!(permitirContinuar && continuar)) onListo?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el movimiento.')
    } finally {
      setEnviando(false)
    }
  }

  async function eliminar() {
    if (!transaccion) return
    setEnviando(true)
    try {
      const borradas = await eliminarTransaccion(transaccion.id)
      avisar('Movimiento eliminado', 'info', {
        texto: 'Deshacer',
        onClick: () => void restaurarTransacciones(borradas),
      })
      onListo?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar.')
      setEnviando(false)
    }
  }

  const botonesCuenta = (seleccionada: string, onElegir: (id: string) => void, excluir?: string) => (
    <div className="selector-cuenta ui fluid buttons" role="radiogroup">
      {cuentas
        .filter((c) => c.id !== excluir)
        .map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={seleccionada === c.id}
            onClick={() => onElegir(c.id)}
            className={`ui button ${seleccionada === c.id ? 'primary' : 'basic'}`}
          >
            <i className={`${ICONO_CUENTA[c.tipo]} icon`} />
            {c.nombre}
          </button>
        ))}
    </div>
  )

  return (
    <form onSubmit={manejarEnvio} className={`ui form formulario-movimiento ${error ? 'error' : ''}`}>
      <div className="selector-tipo ui fluid three buttons field">
        {TIPOS.map((t) => {
          // Una transacción normal no se convierte en transferencia (ni al revés).
          const bloqueado =
            editando && (t.id === 'transferencia') !== Boolean(transaccion?.transferenciaId)
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTipo(t.id)}
              disabled={bloqueado}
              aria-pressed={tipo === t.id}
              className={`ui button ${tipo === t.id ? t.color : 'basic'}`}
            >
              <i className={`${t.icono} icon`} />
              {t.etiqueta}
            </button>
          )
        })}
      </div>

      <div className="campo-monto field required">
        <label htmlFor="tx-monto">Monto</label>
        <div className="ui action input monto-grande">
          <input
            ref={montoRef}
            id="tx-monto"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="0.00"
            autoFocus={!editando}
            required
          />
          {!esTransferencia && (
            <div className="ui buttons selector-moneda">
              {(['PEN', 'USD'] as Moneda[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`ui button ${moneda === m ? 'primary' : 'basic'}`}
                  onClick={() => setMoneda(m)}
                  aria-pressed={moneda === m}
                >
                  {m === 'PEN' ? 'S/' : 'US$'}
                </button>
              ))}
            </div>
          )}
          {esTransferencia && <span className="ui basic label">S/</span>}
        </div>
      </div>

      {montosFrecuentes.length > 0 && (
        <div className="montos-frecuentes" aria-label="Montos frecuentes">
          {montosFrecuentes.map((m) => (
            <button key={m} type="button" className="ui mini basic button" onClick={() => setMonto(String(m))}>
              {moneda === 'USD' ? 'US$' : 'S/'} {m.toFixed(2)}
            </button>
          ))}
        </div>
      )}

      {moneda === 'USD' && !esTransferencia && (
        <div className="fields tipo-cambio">
          <div className="field">
            <label htmlFor="tx-cambio">Tipo de cambio (S/ por US$)</label>
            <input
              id="tx-cambio"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.001"
              value={tipoCambio}
              onChange={(e) => setTipoCambio(e.target.value)}
            />
          </div>
          <div className="field equivalente">
            <label>Equivale a</label>
            <strong>{Number.isFinite(montoEnSoles) ? formatearMoneda(montoEnSoles) : '—'}</strong>
          </div>
        </div>
      )}

      <div className="field required">
        <label htmlFor="tx-fecha">Fecha</label>
        <input
          id="tx-fecha"
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          required
        />
      </div>

      <div className="field required">
        <label id="tx-cuenta">{esTransferencia ? 'Desde' : 'Cuenta'}</label>
        {botonesCuenta(cuentaSeleccionada, setCuentaId)}
      </div>

      {esTransferencia ? (
        <div className="field required">
          <label>Hacia</label>
          {cuentas.length < 2 ? (
            <p className="texto-suave">Crea otra cuenta en Más → Cuentas para poder transferir.</p>
          ) : (
            botonesCuenta(destinoSeleccionado, setCuentaDestinoId, cuentaSeleccionada)
          )}
        </div>
      ) : (
        <div className="field required">
          <label>
            Categoría
            {onGestionarCategorias && (
              <button type="button" className="enlace-lateral" onClick={onGestionarCategorias}>
                <i className="cog icon" />
                Gestionar
              </button>
            )}
          </label>
          <div className="selector-categoria" role="radiogroup" aria-label="Categoría">
            {categoriasDisponibles.map((c) => {
              const activa = categoriaSeleccionada === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={activa}
                  onClick={() => setCategoriaId(c.id)}
                  className={`opcion-categoria ${activa ? 'activa' : ''}`}
                  style={activa ? { borderColor: c.color, background: `${c.color}1a` } : undefined}
                >
                  <span className="icono-circulo" style={{ background: c.color ?? '#898781' }}>
                    <i className={`${c.icono ?? 'tag'} icon`} />
                  </span>
                  <span className="nombre">{c.nombre}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor="tx-concepto">Concepto (opcional)</label>
        <input
          id="tx-concepto"
          type="text"
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          placeholder={esTransferencia ? 'Ej. Pago de tarjeta' : 'Ej. Almuerzo con el equipo'}
          maxLength={140}
          list="conceptos-previos"
          autoComplete="off"
        />
        <datalist id="conceptos-previos">
          {conceptosPrevios.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      {error && (
        <div className="ui error message">
          <p>{error}</p>
        </div>
      )}

      {confirmandoBorrado ? (
        <div className="ui warning message confirmar-borrado">
          <p>
            {esTransferencia
              ? '¿Eliminar esta transferencia? Se quitará de ambas cuentas.'
              : '¿Eliminar este movimiento?'}
          </p>
          <div className="acciones-formulario">
            <button type="button" className="ui basic button" onClick={() => setConfirmandoBorrado(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className={`ui red button ${enviando ? 'loading' : ''}`}
              disabled={enviando}
              onClick={eliminar}
            >
              <i className="trash icon" />
              Eliminar
            </button>
          </div>
        </div>
      ) : (
        <div className="acciones-formulario">
          {editando && (
            <button
              type="button"
              className="ui basic red button boton-eliminar"
              onClick={() => setConfirmandoBorrado(true)}
            >
              <i className="trash alternate outline icon" />
              Eliminar
            </button>
          )}
          {permitirContinuar && !editando && (
            <label className="casilla continuar">
              <input type="checkbox" checked={continuar} onChange={(e) => setContinuar(e.target.checked)} />
              Registrar otro después
            </label>
          )}
          <button
            type="submit"
            disabled={enviando}
            className={`ui primary button boton-guardar ${enviando ? 'loading' : ''}`}
          >
            <i className="save icon" />
            {editando ? 'Guardar cambios' : 'Registrar'}
          </button>
        </div>
      )}
    </form>
  )
}

export default FormularioTransaccion
