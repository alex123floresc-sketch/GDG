import FormularioTransaccion from './components/FormularioTransaccion'
import Header from './components/Header'
import ListaTransacciones from './components/ListaTransacciones'
import ResumenFinanciero from './components/ResumenFinanciero'
import { useSync } from './hooks/useSync'

function App() {
  const { enLinea, sincronizando, ultimaSincronizacion } = useSync()

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Header
        enLinea={enLinea}
        sincronizando={sincronizando}
        ultimaSincronizacion={ultimaSincronizacion}
      />

      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
        <ResumenFinanciero />
        <FormularioTransaccion />
        <ListaTransacciones />
      </main>
    </div>
  )
}

export default App
