import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useAvisos } from '../hooks/useAvisos'
import { importarExtracto, leerArchivoExtracto, revisarExtracto, type RevisionExtracto } from '../services/extractoService'
import type { Categoria, Cuenta, Regla } from '../types'
import { detectarMapeo, interpretarExtracto, nombresColumnas, type MapeoExtracto } from '../utils/extracto'
import { formatearFecha, formatearMoneda } from '../utils/formato'
import { reglaPara } from '../utils/reglas'

interface ImportarExtractoProps {
  usuarioId: string
  cuentas: Cuenta[]
  categorias: Categoria[]
  reglas: Regla[]
  sincronizarAhora: () => Promise<void>
  onImportado?: () => void
}

const MAX_PREVIEW = 30
const SIN_COLUMNA = -1

type Rol = 'fecha' | 'descripcion' | 'monto' | 'cargo' | 'abono'
const ROLES: { id: Rol; etiqueta: string; ayuda: string }[] = [
  { id: 'fecha', etiqueta: 'Fecha', ayuda: 'Fecha de la operación' },
  { id: 'descripcion', etiqueta: 'Descripción', ayuda: 'Concepto, glosa o comercio' },
  { id: 'monto', etiqueta: 'Monto (con signo)', ayuda: 'Negativo = gasto. Déjalo vacío si hay cargo/abono' },
  { id: 'cargo', etiqueta: 'Cargo', ayuda: 'Salidas de dinero (gastos)' },
  { id: 'abono', etiqueta: 'Abono', ayuda: 'Entradas de dinero (ingresos)' },
]

/** Más → Importar → Extracto del banco (Excel o CSV de cualquier banco). */
function ImportarExtracto({ usuarioId, cuentas, categorias, reglas, sincronizarAhora, onImportado }: ImportarExtractoProps) {
  const { avisar } = useAvisos()
  const inputRef = useRef<HTMLInputElement>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null)
  const [filas, setFilas] = useState<unknown[][] | null>(null)
  const [mapeo, setMapeo] = useState<MapeoExtracto | null>(null)
  const [anio, setAnio] = useState(() => new Date().getFullYear())
  const [error, setError] = useState<string | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [importando, setImportando] = useState(false)

  const cuentasBanco = useMemo(() => cuentas.filter((c) => c.tipo !== 'chanchito'), [cuentas])
  const [cuentaId, setCuentaId] = useState('')
  const cuenta = cuentasBanco.find((c) => c.id === cuentaId) ?? cuentasBanco.find((c) => c.tipo === 'banco') ?? cuentasBanco[0]

  const gastos = categorias.filter((c) => c.tipo !== 'ingreso')
  const ingresos = categorias.filter((c) => c.tipo !== 'gasto')
  const porDefecto = (lista: Categoria[]) => lista.find((c) => /otro/i.test(c.nombre)) ?? lista[0]
  const [catGasto, setCatGasto] = useState('')
  const [catIngreso, setCatIngreso] = useState('')
  const categoriaGasto = gastos.find((c) => c.id === catGasto) ?? porDefecto(gastos)
  const categoriaIngreso = ingresos.find((c) => c.id === catIngreso) ?? porDefecto(ingresos)
  const [omitirRepetidos, setOmitirRepetidos] = useState(true)

  const resultado = useMemo(
    () => (filas && mapeo ? interpretarExtracto(filas, mapeo, anio) : null),
    [filas, mapeo, anio],
  )
  const columnas = useMemo(() => (filas && mapeo ? nombresColumnas(filas, mapeo.filaEncabezado) : []), [filas, mapeo])

  // Qué ya está en la app (depende de la cuenta elegida).
  const [revision, setRevision] = useState<RevisionExtracto | null>(null)
  useEffect(() => {
    if (!resultado || !cuenta) return
    let vigente = true
    void revisarExtracto(resultado.movimientos, usuarioId, cuenta.id).then((r) => vigente && setRevision(r))
    return () => {
      vigente = false
    }
  }, [resultado, cuenta, usuarioId])

  const aImportar = useMemo(() => {
    if (!resultado) return []
    return resultado.movimientos.filter(
      (m) => !revision?.yaImportados.has(m.clave) && !(omitirRepetidos && revision?.posiblesRepetidos.has(m.clave)),
    )
  }, [resultado, revision, omitirRepetidos])

  const resumen = useMemo(() => {
    const g = aImportar.filter((m) => m.tipo === 'gasto')
    const i = aImportar.filter((m) => m.tipo === 'ingreso')
    return {
      gastos: g.length,
      totalGastos: g.reduce((s, m) => s + m.monto, 0),
      ingresos: i.length,
      totalIngresos: i.reduce((s, m) => s + m.monto, 0),
      porRegla: aImportar.filter((m) => reglaPara(m.concepto, m.tipo, reglas)).length,
    }
  }, [aImportar, reglas])

  async function procesar(archivo: File) {
    setError(null)
    setFilas(null)
    setMapeo(null)
    setRevision(null)
    setNombreArchivo(archivo.name)
    if (/\.pdf$/i.test(archivo.name)) {
      setError('Los PDF no se pueden leer: en la web de tu banco descarga los movimientos en Excel o CSV.')
      return
    }
    if (!/\.(xlsx?|csv|txt|tsv)$/i.test(archivo.name)) {
      setError('Elige un archivo Excel (.xlsx, .xls) o CSV.')
      return
    }
    setLeyendo(true)
    try {
      const datos = await leerArchivoExtracto(archivo)
      const detectado = detectarMapeo(datos)
      setFilas(datos)
      setMapeo(
        detectado ?? {
          filaEncabezado: 0,
          fecha: SIN_COLUMNA,
          descripcion: SIN_COLUMNA,
          monto: SIN_COLUMNA,
          cargo: SIN_COLUMNA,
          abono: SIN_COLUMNA,
          operacion: SIN_COLUMNA,
          invertirSigno: false,
        },
      )
      if (!detectado) setError('No reconocimos las columnas: elígelas abajo (fila de títulos, fecha, monto…).')
      // Un extracto de tarjeta: por defecto los consumos vienen en positivo.
      if (detectado && cuenta?.tipo === 'tarjeta_credito' && detectado.monto >= 0) {
        setMapeo({ ...detectado, invertirSigno: true })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.')
    } finally {
      setLeyendo(false)
    }
  }

  function cambiarRol(rol: Rol, columna: number) {
    if (!mapeo) return
    const nuevo = { ...mapeo, [rol]: columna }
    // Monto con signo y cargo/abono son excluyentes.
    if (rol === 'monto' && columna >= 0) Object.assign(nuevo, { cargo: SIN_COLUMNA, abono: SIN_COLUMNA })
    if ((rol === 'cargo' || rol === 'abono') && columna >= 0) nuevo.monto = SIN_COLUMNA
    setMapeo(nuevo)
  }

  async function importar() {
    if (!cuenta || !categoriaGasto || !categoriaIngreso || aImportar.length === 0) return
    setImportando(true)
    try {
      const n = await importarExtracto(aImportar, {
        usuarioId,
        cuentaId: cuenta.id,
        categoriaGasto: categoriaGasto.id,
        categoriaIngreso: categoriaIngreso.id,
        reglas,
      })
      avisar(`Se importaron ${n} movimientos a ${cuenta.nombre}`)
      setFilas(null)
      setMapeo(null)
      setNombreArchivo(null)
      if (inputRef.current) inputRef.current.value = ''
      if (navigator.onLine) void sincronizarAhora()
      onImportado?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo importar.')
    } finally {
      setImportando(false)
    }
  }

  function soltar(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setArrastrando(false)
    const archivo = e.dataTransfer.files?.[0]
    if (archivo) void procesar(archivo)
  }

  const estadoDe = (clave: string) =>
    revision?.yaImportados.has(clave)
      ? 'ya'
      : revision?.posiblesRepetidos.has(clave)
        ? omitirRepetidos
          ? 'repetido'
          : 'repetido-incluido'
        : 'nuevo'

  return (
    <div className="ui segment">
      <h3 className="ui header">
        <i className="university icon" />
        <div className="content">
          Importar extracto del banco
          <div className="sub header">
            BCP, Interbank, BBVA, Scotiabank… Descarga tus movimientos en Excel o CSV desde la web del banco.
          </div>
        </div>
      </h3>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv,.txt,.tsv"
        hidden
        id="extracto-archivo"
        onChange={(e) => {
          const archivo = e.target.files?.[0]
          if (archivo) void procesar(archivo)
        }}
      />
      <label
        htmlFor="extracto-archivo"
        onDragOver={(e) => {
          e.preventDefault()
          setArrastrando(true)
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={soltar}
        className={`zona-archivo ui placeholder segment ${arrastrando ? 'arrastrando' : ''}`}
      >
        <div className="ui icon header">
          <i className={`${leyendo ? 'spinner loading' : 'cloud upload'} icon`} />
          {nombreArchivo ?? 'Arrastra aquí el extracto (.xlsx o .csv)'}
        </div>
        <span className="ui basic button">
          <i className="folder open outline icon" />
          {nombreArchivo ? 'Elegir otro archivo' : 'Seleccionar archivo'}
        </span>
      </label>

      {error && (
        <div className="ui warning message">
          <i className="exclamation triangle icon" />
          {error}
        </div>
      )}

      {filas && mapeo && (
        <div className="ui form mapeo-extracto">
          <h4 className="ui dividing header">1. Revisa las columnas</h4>
          <div className="fields-extracto">
            <div className="field">
              <label htmlFor="ext-fila">Fila de títulos</label>
              <input
                id="ext-fila"
                type="number"
                min={1}
                max={Math.max(1, filas.length)}
                value={mapeo.filaEncabezado + 1}
                onChange={(e) => {
                  const n = Math.min(Math.max(1, Number(e.target.value) || 1), filas.length)
                  setMapeo({ ...mapeo, filaEncabezado: n - 1 })
                }}
              />
            </div>
            {ROLES.map((r) => (
              <div className="field" key={r.id}>
                <label htmlFor={`ext-${r.id}`} title={r.ayuda}>
                  {r.etiqueta}
                </label>
                <select
                  id={`ext-${r.id}`}
                  className="ui dropdown"
                  value={mapeo[r.id]}
                  onChange={(e) => cambiarRol(r.id, Number(e.target.value))}
                >
                  <option value={SIN_COLUMNA}>—</option>
                  {columnas.map((nombre, i) => (
                    <option key={i} value={i}>
                      {nombre}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <div className="field">
              <label htmlFor="ext-anio" title="Para fechas sin año (p. ej. «05 SET»)">
                Año
              </label>
              <input id="ext-anio" type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value) || anio)} />
            </div>
          </div>
          <label className="casilla-simple">
            <input
              type="checkbox"
              checked={mapeo.invertirSigno}
              onChange={(e) => setMapeo({ ...mapeo, invertirSigno: e.target.checked })}
            />
            Invertir signos (extracto de tarjeta: los consumos vienen en positivo)
          </label>

          {resultado && (
            <>
              <h4 className="ui dividing header">2. Vista previa</h4>
              <p className="texto-suave">
                {resultado.movimientos.length} movimientos leídos
                {revision && revision.yaImportados.size > 0 && ` · ${revision.yaImportados.size} ya estaban importados`}
                {resultado.omitidas > 0 && ` · ${resultado.omitidas} filas no se entendieron (se omiten)`}
              </p>
              {revision && revision.posiblesRepetidos.size > 0 && (
                <label className="casilla-simple">
                  <input type="checkbox" checked={omitirRepetidos} onChange={(e) => setOmitirRepetidos(e.target.checked)} />
                  Omitir {revision.posiblesRepetidos.size} que parecen ya registrados a mano (mismo día, tipo y monto en
                  esa cuenta)
                </label>
              )}
              <div className="tabla-preview">
                <table className="ui very compact unstackable small table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Descripción</th>
                      <th className="right aligned">Monto</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.movimientos.slice(0, MAX_PREVIEW).map((m) => {
                      const estado = estadoDe(m.clave)
                      const omitido = estado === 'ya' || estado === 'repetido'
                      return (
                        <tr key={m.clave} className={omitido ? 'fila-omitida' : ''}>
                          <td className="single line">{formatearFecha(m.fecha)}</td>
                          <td>{m.concepto || '—'}</td>
                          <td className={`right aligned single line ${m.tipo === 'ingreso' ? 'texto-ingreso' : 'texto-gasto'}`}>
                            {m.tipo === 'ingreso' ? '+' : '−'}
                            {formatearMoneda(m.monto)}
                          </td>
                          <td className="single line texto-suave">
                            {estado === 'ya' ? 'Ya importado' : estado === 'repetido' ? 'Parece repetido' : 'Nuevo'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {resultado.movimientos.length > MAX_PREVIEW && (
                    <tfoot>
                      <tr>
                        <th colSpan={4} className="center aligned">
                          Mostrando {MAX_PREVIEW} de {resultado.movimientos.length}
                        </th>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              <h4 className="ui dividing header">3. Dónde registrarlos</h4>
              <div className="three fields">
                <div className="field">
                  <label htmlFor="ext-cuenta">Cuenta</label>
                  <select id="ext-cuenta" className="ui dropdown" value={cuenta?.id ?? ''} onChange={(e) => setCuentaId(e.target.value)}>
                    {cuentasBanco.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ext-cat-gasto">Categoría de gastos</label>
                  <select id="ext-cat-gasto" className="ui dropdown" value={categoriaGasto?.id ?? ''} onChange={(e) => setCatGasto(e.target.value)}>
                    {gastos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ext-cat-ingreso">Categoría de ingresos</label>
                  <select id="ext-cat-ingreso" className="ui dropdown" value={categoriaIngreso?.id ?? ''} onChange={(e) => setCatIngreso(e.target.value)}>
                    {ingresos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {resumen.porRegla > 0 && (
                <p className="texto-suave">
                  <i className="magic icon" />
                  {resumen.porRegla} se categorizarán con tus reglas automáticas.
                </p>
              )}
              <button
                type="button"
                className={`ui fluid primary button ${importando ? 'loading' : ''}`}
                disabled={importando || aImportar.length === 0 || !cuenta}
                onClick={() => void importar()}
              >
                <i className="download icon" />
                {aImportar.length === 0
                  ? 'No hay movimientos nuevos'
                  : `Importar ${resumen.gastos} gastos (${formatearMoneda(resumen.totalGastos)}) y ${resumen.ingresos} ingresos (${formatearMoneda(resumen.totalIngresos)})`}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default ImportarExtracto
