import 'C:/Users/A2024/AppData/Local/Temp/claude/C--Programing-claude-proyect-proyect/0224f4cb-2bff-496a-8d86-74c27a3ead48/scratchpad/node_modules/fake-indexeddb/auto/index.mjs'
import { crearSupabaseFalso } from 'C:/Users/A2024/AppData/Local/Temp/claude/C--Programing-claude-proyect-proyect/0224f4cb-2bff-496a-8d86-74c27a3ead48/scratchpad/supabase-falso.ts'
import { supabase } from './src/services/supabaseClient'
import { db } from './src/db/database'
import { sincronizar } from './src/services/syncService'
import { crearTransaccion, eliminarTransaccion, crearTransferencia } from './src/services/transaccionService'
import { asegurarCategoriasPorDefecto } from './src/services/categoriaService'
import { asegurarCuentasPorDefecto } from './src/services/cuentaService'

const U = '0e1c9a52-5d2b-4c1e-9b7a-3f2d8c1a0001'
const tablas = ['transacciones','categorias','cuentas','presupuestos','metas','deudas','recurrentes','chanchitos','reglas','plantillas','ajustes','cuotas','deseos','suscripciones_push','cuentas_compartidas','inversiones']
const f = crearSupabaseFalso(U, tablas)
Object.assign(supabase as any, { from: f.cliente.from, auth: f.cliente.auth, storage: f.cliente.storage, rpc: f.cliente.rpc })

await asegurarCategoriasPorDefecto(U); await asegurarCuentasPorDefecto(U)
const cat = (await db.categorias.toArray()).find((c) => c.tipo === 'gasto')!
const [c1, c2] = await db.cuentas.toArray()
const t = await crearTransaccion({ monto: 25, tipo: 'gasto', categoriaId: cat.id, cuentaId: c1.id, fecha: new Date(), concepto: 'Almuerzo', origen: 'manual' }, U)
await crearTransferencia({ cuentaOrigenId: c1.id, cuentaDestinoId: c2.id, monto: 10, fecha: new Date() }, U)
const r1 = await sincronizar(U).catch((e) => e.message)
const remotas = () => f.datos.get('transacciones')!.length
console.log('sync1', typeof r1 === 'string' ? r1 : 'ok', 'remotas', remotas(), 'locales', await db.transacciones.count())

await eliminarTransaccion(t.id)
console.log('tras borrar local', await db.transacciones.count(), 'pendientes borrado', await db.eliminacionesPendientes.count())
const r2 = await sincronizar(U).catch((e) => e.message)
console.log('sync2', typeof r2 === 'string' ? r2 : 'ok', 'remotas', remotas(), 'locales', await db.transacciones.count(), 'pendientes', await db.eliminacionesPendientes.count())
await sincronizar(U).catch((e) => e.message)
console.log('sync3 (¿reaparece?)', 'locales', await db.transacciones.count(), (await db.transacciones.toArray()).map((x) => x.concepto ?? x.tipo))

// Transferencia (2 patas)
const pata = (await db.transacciones.toArray())[0]
await eliminarTransaccion(pata.id)
await sincronizar(U).catch((e) => e.message)
await sincronizar(U).catch((e) => e.message)
console.log('transferencia borrada', 'remotas', remotas(), 'locales', await db.transacciones.count())

// Borrado que el servidor ignora (0 filas afectadas)
const t2 = await crearTransaccion({ monto: 7, tipo: 'gasto', categoriaId: cat.id, cuentaId: c1.id, fecha: new Date(), concepto: 'Café', origen: 'manual' }, U)
await sincronizar(U)
f.bloquearBorrado(() => false)
await eliminarTransaccion(t2.id)
const r4 = await sincronizar(U).catch((e) => e.message)
console.log('borrado ignorado ->', typeof r4 === 'string' ? r4 : 'ok', 'locales', await db.transacciones.count(), 'pendientes', await db.eliminacionesPendientes.count())
await sincronizar(U).catch(() => {})
console.log('ciclo siguiente: locales', await db.transacciones.count(), (await db.transacciones.toArray()).map((x) => x.concepto))
