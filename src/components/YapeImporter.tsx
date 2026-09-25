import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react'
import { importarFilasYape, leerArchivoExcelYape } from '../services/yapeImporter'
import type {
  Categoria,
  Cuenta,
  ResultadoImportacionYape,
  ResultadoParseoYape,
} from '../types'
import { formatearFecha, formatearMoneda } from '../utils/formato'

interface YapeImporterProps {
  usuarioId: string
  cuentas: Cuenta[]
  categorias: Categoria[]
  sincronizarAhora: () => Promise<void>
  onImportado?: () => void
}

const MAX_FILAS_PREVIEW = 25

function YapeImporter({
  usuarioId,
  cuentas,
  categorias,
  sincronizarAhora,
  onImportado,
}: YapeImporterProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const [arrastrando, setArrastrando] = useState(false)
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null)
  const [cargandoArchivo, setCargandoArchivo] = useState(false)
  const [resultadoParseo, setResultadoParseo] =
    useState<ResultadoParseoYape | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [cuentaId, setCuentaId] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [importando, setImportando] = useState(false)
  const [resultadoImportacion, setResultadoImportacion] =
    useState<ResultadoImportacionYape | null>(null)

  const cuentaPorDefecto = useMemo(
    () => cuentas.find((c) => /yape/i.test(c.nombre)) ?? cuentas[0],
    [cuentas],
  )
  const categoriaPorDefecto = useMemo(
    () => categorias.find((c) => c.tipo === 'ambos') ?? categorias[0],
    [categorias],
  )

  const cuentaSeleccionada = cuentas.some((c) => c.id === cuentaId)
    ? cuentaId
    : (cuentaPorDefecto?.id ?? '')
  const categoriaSeleccionada = categorias.some((c) => c.id === categoriaId)
    ? categoriaId
    : (categoriaPorDefecto?.id ?? '')

  const resumen = useMemo(() => {
    if (!resultadoParseo) return null

    const ingresos = resultadoParseo.filas.filter((f) => f.tipo === 'ingreso')
    const gastos = resultadoParseo.filas.filter((f) => f.tipo === 'gasto')

    return {
      ingresos: ingresos.length,
      gastos: gastos.length,
      totalIngresos: ingresos.reduce((s, f) => s + f.monto, 0),
      totalGastos: gastos.reduce((s, f) => s + f.monto, 0),
    }
  }, [resultadoParseo])

  async function procesarArchivo(archivo: File) {
    setError(null)
    setResultadoImportacion(null)
    setResultadoParseo(null)
    setNombreArchivo(archivo.name)

    if (!/\.xlsx?$/i.test(archivo.name)) {
      setError('Selecciona un archivo Excel (.xlsx o .xls) exportado desde Yape.')
      return
    }

    setCargandoArchivo(true)

    try {
      const resultado = await leerArchivoExcelYape(archivo)

      if (resultado.filas.length === 0) {
        setError('No se detectaron transacciones válidas en el archivo.')
        return
      }

      setResultadoParseo(resultado)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el archivo.')
    } finally {
      setCargandoArchivo(false)
    }
  }

  function manejarSeleccion(evento: ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0]
    if (archivo) void procesarArchivo(archivo)
  }

  function manejarDrop(evento: DragEvent<HTMLLabelElement>) {
    evento.preventDefault()
    setArrastrando(false)
    const archivo = evento.dataTransfer.files?.[0]
    if (archivo) void procesarArchivo(archivo)
  }

  async function confirmarImportacion() {
    if (!resultadoParseo || !cuentaSeleccionada || !categoriaSeleccionada) return

    setImportando(true)
    setError(null)

    try {
      const resultado = await importarFilasYape(
        resultadoParseo.filas,
        usuarioId,
        cuentaSeleccionada,
        categoriaSeleccionada,
      )

      setResultadoImportacion(resultado)
      setResultadoParseo(null)
      setNombreArchivo(null)
      if (inputRef.current) inputRef.current.value = ''

      if (navigator.onLine) {
        void sincronizarAhora()
      }

      onImportado?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo importar el archivo.')
    } finally {
      setImportando(false)
    }
  }

  return (
    <div className="ui segment">
      <h3 className="ui header">
        <i className="file excel outline green icon" />
        <div className="content">
          Importar reporte de Yape
          <div className="sub header">
            Sube el Excel que exportas desde la app de Yape
          </div>
        </div>
      </h3>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={manejarSeleccion}
        hidden
        id="yape-archivo"
      />
      <label
        htmlFor="yape-archivo"
        onDragOver={(e) => {
          e.preventDefault()
          setArrastrando(true)
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={manejarDrop}
        className={`zona-archivo ui placeholder segment ${arrastrando ? 'arrastrando' : ''}`}
      >
        <div className="ui icon header">
          <i className={`${cargandoArchivo ? 'spinner loading' : 'cloud upload'} icon`} />
          {nombreArchivo ?? (
            <>
              Arrastra aquí tu <strong>ReporteTransacciones.xlsx</strong>
            </>
          )}
        </div>
        <span className="ui basic button">
          <i className="folder open outline icon" />
          {nombreArchivo ? 'Elegir otro archivo' : 'Seleccionar archivo'}
        </span>
      </label>

      {error && (
        <div className="ui error icon message">
          <i className="exclamation triangle icon" />
          <div className="content">{error}</div>
        </div>
      )}

      {resultadoImportacion && (
        <div className="ui success icon message">
          <i className="check circle icon" />
          <div className="content">
            Se importaron {resultadoImportacion.nuevas} transacciones nuevas de{' '}
            {resultadoImportacion.total} detectadas
            {resultadoImportacion.duplicadas > 0 &&
              ` (${resultadoImportacion.duplicadas} ya existían y se omitieron)`}
            .
          </div>
        </div>
      )}

      {resultadoParseo && resumen && (
        <>
          <div className="ui two column stackable grid">
            <div className="column">
              <div className="ui green segment">
                <div className="ui tiny statistic">
                  <div className="value texto-ingreso">
                    {formatearMoneda(resumen.totalIngresos)}
                  </div>
                  <div className="label">{resumen.ingresos} ingresos</div>
                </div>
              </div>
            </div>
            <div className="column">
              <div className="ui red segment">
                <div className="ui tiny statistic">
                  <div className="value texto-gasto">
                    {formatearMoneda(resumen.totalGastos)}
                  </div>
                  <div className="label">{resumen.gastos} gastos</div>
                </div>
              </div>
            </div>
          </div>

          {resultadoParseo.erroresFilas > 0 && (
            <div className="ui warning message">
              <i className="exclamation circle icon" />
              {resultadoParseo.erroresFilas} fila(s) no se pudieron interpretar y
              serán omitidas.
            </div>
          )}

          <div className="tabla-preview">
            <table className="ui very compact unstackable striped small table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Concepto</th>
                  <th>N° operación</th>
                  <th className="right aligned">Monto</th>
                </tr>
              </thead>
              <tbody>
                {resultadoParseo.filas.slice(0, MAX_FILAS_PREVIEW).map((fila, i) => (
                  <tr key={`${fila.nroOperacion}-${i}`}>
                    <td className="single line">{formatearFecha(fila.fecha)}</td>
                    <td>{fila.concepto || '—'}</td>
                    <td>{fila.nroOperacion}</td>
                    <td
                      className={`right aligned single line ${
                        fila.tipo === 'ingreso' ? 'texto-ingreso' : 'texto-gasto'
                      }`}
                    >
                      {fila.tipo === 'ingreso' ? '+' : '-'}
                      {formatearMoneda(fila.monto)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {resultadoParseo.filas.length > MAX_FILAS_PREVIEW && (
                <tfoot>
                  <tr>
                    <th colSpan={4} className="center aligned">
                      Mostrando {MAX_FILAS_PREVIEW} de {resultadoParseo.filas.length}{' '}
                      filas
                    </th>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="ui form" style={{ marginTop: '1em' }}>
            <div className="two fields">
              <div className="field">
                <label htmlFor="yape-cuenta">Cuenta destino</label>
                <select
                  id="yape-cuenta"
                  value={cuentaSeleccionada}
                  onChange={(e) => setCuentaId(e.target.value)}
                  className="ui fluid dropdown"
                >
                  {cuentas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="yape-categoria">Categoría</label>
                <select
                  id="yape-categoria"
                  value={categoriaSeleccionada}
                  onChange={(e) => setCategoriaId(e.target.value)}
                  className="ui fluid dropdown"
                >
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={confirmarImportacion}
              disabled={importando || !cuentaSeleccionada || !categoriaSeleccionada}
              className={`ui fluid primary button ${importando ? 'loading' : ''}`}
            >
              <i className="download icon" />
              Confirmar e importar
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default YapeImporter
