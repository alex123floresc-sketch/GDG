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

  function manejarDrop(evento: DragEvent<HTMLDivElement>) {
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
    <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h2 className="text-sm font-semibold text-slate-200">
        Importar reporte de Yape
      </h2>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setArrastrando(true)
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={manejarDrop}
        className={`rounded-xl border-2 border-dashed p-6 text-center transition ${
          arrastrando ? 'border-sky-500 bg-sky-500/5' : 'border-slate-700'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={manejarSeleccion}
          className="hidden"
          id="yape-archivo"
        />
        <label htmlFor="yape-archivo" className="cursor-pointer text-sm text-slate-300">
          {nombreArchivo ?? (
            <>
              Arrastra aquí tu <strong>ReporteTransacciones.xlsx</strong> de Yape,
              o haz clic para seleccionarlo
            </>
          )}
        </label>
      </div>

      {cargandoArchivo && <p className="text-sm text-slate-400">Leyendo archivo...</p>}

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {resultadoImportacion && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          Se importaron {resultadoImportacion.nuevas} transacciones nuevas de{' '}
          {resultadoImportacion.total} detectadas
          {resultadoImportacion.duplicadas > 0 &&
            ` (${resultadoImportacion.duplicadas} ya existían y se omitieron)`}
          .
        </p>
      )}

      {resultadoParseo && resumen && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-slate-800 p-3">
              <p className="text-xs text-slate-400">Ingresos detectados</p>
              <p className="font-semibold text-emerald-400">
                {resumen.ingresos} · {formatearMoneda(resumen.totalIngresos)}
              </p>
            </div>
            <div className="rounded-lg bg-slate-800 p-3">
              <p className="text-xs text-slate-400">Gastos detectados</p>
              <p className="font-semibold text-red-400">
                {resumen.gastos} · {formatearMoneda(resumen.totalGastos)}
              </p>
            </div>
          </div>

          {resultadoParseo.erroresFilas > 0 && (
            <p className="text-xs text-amber-400">
              {resultadoParseo.erroresFilas} fila(s) no se pudieron interpretar y
              serán omitidas.
            </p>
          )}

          <div className="max-h-56 overflow-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-800 text-slate-400">
                <tr>
                  <th className="px-2 py-1.5">Fecha</th>
                  <th className="px-2 py-1.5">Concepto</th>
                  <th className="px-2 py-1.5">N° operación</th>
                  <th className="px-2 py-1.5 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {resultadoParseo.filas.slice(0, MAX_FILAS_PREVIEW).map((fila, i) => (
                  <tr key={`${fila.nroOperacion}-${i}`}>
                    <td className="whitespace-nowrap px-2 py-1.5 text-slate-400">
                      {formatearFecha(fila.fecha)}
                    </td>
                    <td className="max-w-[140px] truncate px-2 py-1.5 text-slate-300">
                      {fila.concepto || '—'}
                    </td>
                    <td className="px-2 py-1.5 text-slate-500">{fila.nroOperacion}</td>
                    <td
                      className={`whitespace-nowrap px-2 py-1.5 text-right font-medium ${
                        fila.tipo === 'ingreso' ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {fila.tipo === 'ingreso' ? '+' : '-'}
                      {formatearMoneda(fila.monto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {resultadoParseo.filas.length > MAX_FILAS_PREVIEW && (
              <p className="px-2 py-1.5 text-center text-[11px] text-slate-500">
                Mostrando {MAX_FILAS_PREVIEW} de {resultadoParseo.filas.length} filas
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              Cuenta destino
              <select
                value={cuentaSeleccionada}
                onChange={(e) => setCuentaId(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-sky-500"
              >
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm text-slate-300">
              Categoría
              <select
                value={categoriaSeleccionada}
                onChange={(e) => setCategoriaId(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-sky-500"
              >
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icono ? `${c.icono} ` : ''}
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="button"
            onClick={confirmarImportacion}
            disabled={importando || !cuentaSeleccionada || !categoriaSeleccionada}
            className="w-full rounded-lg bg-sky-500 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {importando ? 'Importando...' : 'Confirmar e importar'}
          </button>
        </div>
      )}
    </section>
  )
}

export default YapeImporter
