import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/globals.css'
import { useEditorStore } from './store/editorStore'
import { AppErrorBoundary } from './ui/AppErrorBoundary'
import { installRendererDiagnostics } from './diagnostics/installRendererDiagnostics'

installRendererDiagnostics()

window.__COURSEWARE_EDITOR_DIRTY__ = useEditorStore.getState().dirty
useEditorStore.subscribe((state) => {
  window.__COURSEWARE_EDITOR_DIRTY__ = state.dirty
})

const root = document.getElementById('root')
if (!root) throw new Error('应用根节点不存在')

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
