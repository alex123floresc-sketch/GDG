import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fomantic UI (fork mantenido de Semantic UI, mismas clases `ui ...`). Solo
// se importan los componentes que usa la app en vez del semantic.min.css
// completo (~1.5MB). Si un componente nuevo usa otra clase de Semantic,
// agregar aquí su CSS.
import 'fomantic-ui-css/components/reset.min.css'
import 'fomantic-ui-css/components/site.min.css'
import 'fomantic-ui-css/components/button.min.css'
import 'fomantic-ui-css/components/container.min.css'
import 'fomantic-ui-css/components/dimmer.min.css'
import 'fomantic-ui-css/components/dropdown.min.css'
import 'fomantic-ui-css/components/form.min.css'
import 'fomantic-ui-css/components/grid.min.css'
import 'fomantic-ui-css/components/header.min.css'
import 'fomantic-ui-css/components/icon.min.css'
import 'fomantic-ui-css/components/input.min.css'
import 'fomantic-ui-css/components/label.min.css'
import 'fomantic-ui-css/components/list.min.css'
import 'fomantic-ui-css/components/loader.min.css'
import 'fomantic-ui-css/components/menu.min.css'
import 'fomantic-ui-css/components/message.min.css'
import 'fomantic-ui-css/components/progress.min.css'
import 'fomantic-ui-css/components/segment.min.css'
import 'fomantic-ui-css/components/statistic.min.css'
import 'fomantic-ui-css/components/table.min.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
