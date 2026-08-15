import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ProductApp from './ProductApp'
import './styles/globals.css'
import { AppErrorBoundary } from './ui/AppErrorBoundary'
import { installRendererDiagnostics } from './diagnostics/installRendererDiagnostics'
import {
  resolveEditorStartupBackend,
  V9_SLIDE_TEST_BACKEND,
} from './course/v9SlideVerticalSlice'
import { useEditorStore } from './store/editorStore'

installRendererDiagnostics()

if (resolveEditorStartupBackend(window.location.search) === V9_SLIDE_TEST_BACKEND) {
  useEditorStore.getState().activateV9SlideFixture()
}

window.__COURSEWARE_EDITOR_DIRTY__ = false

const root = document.getElementById('root')
if (!root) throw new Error('应用根节点不存在')

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <ProductApp />
    </AppErrorBoundary>
  </StrictMode>,
)
