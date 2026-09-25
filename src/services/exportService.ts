import type { Categoria, Cuenta, Transaccion } from '../types'
import {
  clavePeriodo,
  resumenPorCategoria,
  resumenPorPeriodo,
  type Granularidad,
} from '../utils/analisis'

interface OpcionesExportacion {
  transacciones: Transaccion[]
  categorias: Categoria[]
  cuentas: Cuenta[]
  anio: number
  granularidad: Granularidad
}

const redondear = (n: number) => Math.round(n * 100) / 100

/**
 * Genera y descarga un Excel con el análisis del año agrupado por mes o
 * trimestre. Hojas:
 * 1. Resumen: ingresos, gastos, balance, ahorro % y n° de movimientos por
 *    periodo, con fila de totales.
 * 2. Gastos por categoría: matriz categoría × periodo (+ total y % del año).
 * 3. Ingresos por categoría: ídem para ingresos.
 * 4. Detalle: cada transacción del año con su periodo.
 *
 * `xlsx` se importa bajo demanda (pesa ~370kB, ver "Rendimiento" en
 * CLAUDE.md).
 */
export async function exportarAnalisisExcel({
  transacciones,
  categorias,
  cuentas,
  anio,
  granularidad,
}: OpcionesExportacion): Promise<void> {
  const XLSX = await import('xlsx')

  const delAnio = transacciones
    .filter((t) => t.fecha.getFullYear() === anio)
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
  const periodos = resumenPorPeriodo(delAnio, anio, granularidad)
  const nombrePeriodo = granularidad === 'mes' ? 'Mes' : 'Trimestre'

  // 1. Resumen por periodo
  const totales = periodos.reduce(
    (s, p) => ({
      ingresos: s.ingresos + p.ingresos,
      gastos: s.gastos + p.gastos,
      cantidad: s.cantidad + p.cantidad,
    }),
    { ingresos: 0, gastos: 0, cantidad: 0 },
  )
  const tasaAhorro = (ingresos: number, gastos: number) =>
    ingresos > 0 ? redondear(((ingresos - gastos) / ingresos) * 100) : null

  const hojaResumen = XLSX.utils.json_to_sheet([
    ...periodos.map((p) => ({
      [nombrePeriodo]: p.etiquetaLarga,
      Ingresos: redondear(p.ingresos),
      Gastos: redondear(p.gastos),
      Balance: redondear(p.balance),
      'Ahorro %': tasaAhorro(p.ingresos, p.gastos),
      Movimientos: p.cantidad,
    })),
    {
      [nombrePeriodo]: `TOTAL ${anio}`,
      Ingresos: redondear(totales.ingresos),
      Gastos: redondear(totales.gastos),
      Balance: redondear(totales.ingresos - totales.gastos),
      'Ahorro %': tasaAhorro(totales.ingresos, totales.gastos),
      Movimientos: totales.cantidad,
    },
  ])
  hojaResumen['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }]

  // 2 y 3. Matriz categoría × periodo
  function matrizCategorias(tipo: Transaccion['tipo']) {
    const resumen = resumenPorCategoria(delAnio, categorias, tipo)
    const filas = resumen.map((c) => {
      const fila: Record<string, string | number> = { Categoría: c.nombre }
      for (const p of periodos) fila[p.etiqueta] = 0
      for (const t of delAnio) {
        if (t.tipo !== tipo || t.categoriaId !== c.categoriaId) continue
        const periodo = periodos.find((p) => p.clave === clavePeriodo(t.fecha, granularidad))
        if (periodo) fila[periodo.etiqueta] = (fila[periodo.etiqueta] as number) + t.monto
      }
      for (const p of periodos) fila[p.etiqueta] = redondear(fila[p.etiqueta] as number)
      fila.Total = redondear(c.total)
      fila['% del año'] = redondear(c.porcentaje * 100)
      return fila
    })

    const hoja = XLSX.utils.json_to_sheet(
      filas.length > 0 ? filas : [{ Categoría: `Sin ${tipo === 'gasto' ? 'gastos' : 'ingresos'} en ${anio}` }],
    )
    hoja['!cols'] = [{ wch: 20 }, ...periodos.map(() => ({ wch: 10 })), { wch: 12 }, { wch: 10 }]
    return hoja
  }

  // 4. Detalle
  const categoriasPorId = new Map(categorias.map((c) => [c.id, c.nombre]))
  const cuentasPorId = new Map(cuentas.map((c) => [c.id, c.nombre]))
  const hojaDetalle = XLSX.utils.json_to_sheet(
    delAnio.map((t) => ({
      Fecha: t.fecha,
      [nombrePeriodo]: periodos.find((p) => p.clave === clavePeriodo(t.fecha, granularidad))?.etiqueta ?? '',
      Tipo: t.tipo === 'ingreso' ? 'Ingreso' : 'Gasto',
      Categoría: categoriasPorId.get(t.categoriaId) ?? 'Sin categoría',
      Cuenta: cuentasPorId.get(t.cuentaId) ?? '',
      Concepto: t.concepto ?? '',
      Monto: redondear(t.tipo === 'ingreso' ? t.monto : -t.monto),
      Origen: t.origen === 'yape' ? 'Yape' : 'Manual',
      'N° operación': t.nroOperacion ?? '',
    })),
    { cellDates: true, dateNF: 'dd/mm/yyyy' },
  )
  hojaDetalle['!cols'] = [
    { wch: 12 }, { wch: 10 }, { wch: 9 }, { wch: 18 }, { wch: 12 },
    { wch: 32 }, { wch: 12 }, { wch: 8 }, { wch: 14 },
  ]

  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hojaResumen, `Resumen por ${nombrePeriodo.toLowerCase()}`)
  XLSX.utils.book_append_sheet(libro, matrizCategorias('gasto'), 'Gastos por categoría')
  XLSX.utils.book_append_sheet(libro, matrizCategorias('ingreso'), 'Ingresos por categoría')
  XLSX.utils.book_append_sheet(libro, hojaDetalle, 'Detalle')

  const sufijo = granularidad === 'mes' ? 'mensual' : 'trimestral'
  XLSX.writeFile(libro, `gastos-${anio}-${sufijo}.xlsx`)
}
