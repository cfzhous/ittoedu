import type { FlowBlock } from '../../shared/courseProjectTypes'
import {
  commitFlowFormulaAst,
  flowFormulaBlockToAuthoringNode,
} from '../authoring/flowTextEdit'
import type { FlowAuthoringSession } from '../project/createFlowCourseProject'
import { useEditorStore } from '../store/editorStore'
import { FormulaAuthoringEditor } from './FormulaAuthoringEditor'

function findBlock(blocks: readonly FlowBlock[], id: string): FlowBlock | null {
  for (const block of blocks) {
    if (block.id === id) return block
    if (block.type === 'section') {
      const nested = findBlock(block.blocks, id)
      if (nested) return nested
    }
  }
  return null
}

export function FlowFormulaBlockProperties({ session }: { session: FlowAuthoringSession }) {
  const applyFlowCommand = useEditorStore((s) => s.applyFlowCommand)
  const selectedBlockId = session.selection.selectedBlockId
  if (!selectedBlockId) return null

  const surface = session.history.present.surfaces.find(
    (entry) => entry.id === session.selection.surfaceId,
  )
  if (!surface || surface.type !== 'flow') return null

  const block = findBlock(surface.blocks, selectedBlockId)
  if (!block || block.type !== 'formula') return null

  const node = flowFormulaBlockToAuthoringNode(block)

  return (
    <section className="property-section" data-testid="flow-formula-properties">
      <h3 className="property-title">公式</h3>
      <FormulaAuthoringEditor
        node={node}
        onCommit={(ast, accessibleText) => {
          applyFlowCommand(
            commitFlowFormulaAst(
              session.history.present,
              session.selection,
              ast,
              accessibleText,
              { expectedRevision: session.history.present.revision },
            ),
          )
        }}
      />
    </section>
  )
}
