import type { FlowAuthoringSession } from '../project/createFlowCourseProject'

/**
 * Lane F scaffold. F3 replaces this stub with FormulaAuthoringEditor + commitFlowFormulaAst.
 * PropertiesTab already mounts this when the selected Flow block is type === 'formula'.
 */
export function FlowFormulaBlockProperties({ session }: { session: FlowAuthoringSession }) {
  void session
  return (
    <section className="property-section" data-testid="flow-formula-properties">
      <h3 className="property-title">公式</h3>
      <p className="property-hint">改正文请在稿纸里双击就地编辑。</p>
    </section>
  )
}
