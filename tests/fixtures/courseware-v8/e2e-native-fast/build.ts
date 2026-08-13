import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createProject,
  createScene,
  createTextNode,
} from '{{EDITOR_IMPORT_PREFIX}}/src/renderer/project/createProject'
import {
  createProjectArchive,
  openProjectArchive,
} from '{{EDITOR_IMPORT_PREFIX}}/src/renderer/project/projectArchive'
import { projectDocumentSchema } from '{{EDITOR_IMPORT_PREFIX}}/src/shared/projectSchema'

const timestamp = '2026-08-13T00:00:00.000Z'
const caseRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = path.join(caseRoot, 'project', 'e2e-native-fast.h5lesson')
const statePath = path.join(caseRoot, 'implementation', 'implementation-state.json')
const inventoryPath = path.join(caseRoot, 'implementation', 'authoring-inventory.json')
const targetSnapshotPath = path.join(caseRoot, 'implementation', 'authoring-target-snapshot.json')

function buildProject() {
  const project = createProject({
    id: 'project_e2e_native_fast',
    title: '分数意义：整体与等分',
    now: timestamp,
    includeDefaultController: false,
    controls: 'none',
  })
  const scene = createScene({
    id: 'scene_fraction_choice',
    name: '判断四分之一',
    backgroundColor: '#f8fafc',
  })
  scene.nodes = [
    createTextNode({
      id: 'node_fraction_title',
      name: '任务标题',
      x: 96,
      y: 64,
      width: 1088,
      height: 72,
      text: '判断哪幅图能表示四分之一',
      style: { fontSize: 40, color: '#172033', bold: true },
    }),
    createTextNode({
      id: 'node_fraction_prompt',
      name: '任务说明',
      x: 128,
      y: 184,
      width: 1024,
      height: 208,
      text: '图 A 是一个正方形平均分成四份并涂其中一份；图 B 是两个大小不同的长方形拼在一起并涂较小的一块。请选择图 A 或图 B，并说明理由。',
      style: { fontSize: 30, color: '#26344f', lineSpacing: 12 },
    }),
    createTextNode({
      id: 'node_fraction_feedback',
      name: '错误修复反馈',
      x: 128,
      y: 472,
      width: 1024,
      height: 112,
      text: '等待作答。',
      style: {
        fontSize: 30,
        color: '#7c2d12',
        backgroundColor: '#ffedd5',
        backgroundOpacity: 1,
        cornerRadius: 12,
        padding: 18,
      },
    }),
  ]
  scene.presentation = {
    initialStateId: 'state_fraction_initial',
    thumbnailStateId: 'state_fraction_result',
    states: [
      {
        id: 'state_fraction_initial',
        name: '初始｜等待作答',
        nodeOverrides: {
          node_fraction_feedback: { visible: false },
        },
      },
      {
        id: 'state_fraction_error',
        name: '反馈｜修复整体概念',
        nodeOverrides: {
          node_fraction_feedback: {
            visible: true,
          },
        },
      },
      {
        id: 'state_fraction_result',
        name: '稳定结果｜完整定义',
        nodeOverrides: {
          node_fraction_feedback: {
            visible: true,
            text: '正确：同一个整体被平均分成四份，涂色部分恰好是一份。',
          },
        },
      },
    ],
  }
  scene.runtime = {
    runtimeApiVersion: 2,
    enabled: true,
    renderMode: 'dom',
    source: `CoursewareRuntime.define({runtimeApiVersion:2,create(ctx){
      const root=ctx.dom.overlay;
      root.style.pointerEvents='auto';
      root.style.display='flex';root.style.alignItems='flex-end';root.style.justifyContent='center';root.style.padding='28px';
      const panel=document.createElement('section');panel.style.cssText='display:flex;gap:10px;align-items:center;padding:12px 16px;border-radius:16px;background:rgba(255,255,255,.96);box-shadow:0 8px 28px rgba(0,0,0,.18);pointer-events:auto';
      const result=document.createElement('p');result.dataset.responseResult='RESP-001';result.dataset.contentRef='CNT-001';result.dataset.release='answer';result.hidden=true;result.style.margin='0 0 0 8px';
      const inventoryMarker=document.createElement('span');inventoryMarker.dataset.inventoryEntityId='fraction-title';inventoryMarker.textContent='可编辑标题';inventoryMarker.style.cssText='position:absolute;left:8px;bottom:8px;font-size:12px;color:#475569';
      const choices=[['A','A','图 A'],['figure-a','图A','图A'],['select-figure-a','选择图 A','选择图 A'],['EMPTY','EMPTY','空白'],['B','B','图 B'],['AB','AB','AB']];
      for(const [value,input,label] of choices){
        const button=document.createElement('button');button.type='button';button.dataset.responseId='RESP-001';button.dataset.value=value;button.textContent=label;button.style.cssText='padding:9px 14px;border:1px solid #94a3b8;border-radius:10px;background:#fff;cursor:pointer';
        button.addEventListener('click',(event)=>{
          ctx.evidence.recordAction({actId:'ACT-001',responseId:'RESP-001',actionKind:'select',event});
          const evaluation=ctx.assessment.evaluate({responseId:'RESP-001',evaluatorId:'EVAL-finite-choice-v1',input,acceptedValues:['A','图A','选择图 A']});
          const passed=evaluation.status==='pass';result.hidden=false;result.dataset.assessment=evaluation.status;result.textContent=passed?'正确：同一个整体被平均分成四份。':'再次作答前，请先圈出同一个整体。';
          ctx.presentation.setState(passed?'state_fraction_result':'state_fraction_error');
          document.dispatchEvent(new CustomEvent('courseware-action-completed',{detail:{actId:'ACT-001',sceneRef:'SCN-001',actionKind:'select'}}));
          document.dispatchEvent(new CustomEvent('courseware-response-submitted',{detail:{responseId:'RESP-001'}}));
          document.dispatchEvent(new CustomEvent('courseware-assessment-result',{detail:{responseId:'RESP-001',passed}}));
        });
        panel.append(button);
      }
      panel.append(result);root.replaceChildren(panel,inventoryMarker);
      return{resize(){},setVisible(value){root.hidden=!value},suspend(){},resume(){},destroy(){root.replaceChildren()}};
    }})`,
    content: { values: {}, metadata: {} },
    assets: {},
    nodeBindings: {},
  }
  project.scenes = [scene]
  return projectDocumentSchema.parse(project)
}

async function main() {
  const project = buildProject()
  const archive = createProjectArchive({
    project,
    assetFiles: {},
    componentFiles: {},
  }, { mtime: timestamp })
  const reopened = openProjectArchive(archive)
  projectDocumentSchema.parse(reopened.project)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, archive)

  const inventoryBytes = await fs.readFile(inventoryPath)
  const projectSha256 = createHash('sha256').update(archive).digest('hex')
  const commonOperations = ['select', 'edit-content', 'move', 'resize', 'basic-style']
  const snapshot = {
    schemaVersion: 1,
    caseId: 'e2e-native-fast',
    coursewareContractSha256: '{{COURSEWARE_CONTRACT_SHA256}}',
    inventorySha256: createHash('sha256').update(inventoryBytes).digest('hex'),
    projectSha256,
    viewport: { width: 1280, height: 720 },
    captures: [
      ['fraction-title', 'node_fraction_title', 'state_fraction_initial', { x: 96, y: 64, width: 1088, height: 72 }],
      ['fraction-prompt', 'node_fraction_prompt', 'state_fraction_initial', { x: 128, y: 184, width: 1024, height: 208 }],
      ['fraction-feedback', 'node_fraction_feedback', 'state_fraction_error', { x: 128, y: 472, width: 1024, height: 112 }],
    ].map(([inventoryEntityId, nodeId, stateId, bounds]) => {
      const persistentBinding = `native:scene:scene_fraction_choice:${String(nodeId)}:text`
      const sessionTargetId = `native-target:${String(nodeId)}`
      return {
        inventoryEntityId,
        persistentBinding,
        sceneId: 'scene_fraction_choice',
        stateId,
        sessionTargetId,
        selectedTargetId: sessionTargetId,
        selectedBinding: persistentBinding,
        entryPoint: 'direct-canvas',
        operations: commonOperations,
        renderedBounds: bounds,
        selectionBounds: bounds,
        surface: 'editor-authoring',
        captureMethod: 'native-project-geometry-v1',
        capturedAt: timestamp,
      }
    }),
  }
  const snapshotBytes = Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
  await fs.writeFile(targetSnapshotPath, snapshotBytes)

  const state = JSON.parse(await fs.readFile(statePath, 'utf8')) as Record<string, unknown>
  state.status = 'implemented'
  state.currentProjectSha256 = projectSha256
  state.authoringInventorySha256 = snapshot.inventorySha256
  state.authoringTargetSnapshotSha256 = createHash('sha256').update(snapshotBytes).digest('hex')
  state.tasks = [{ id: 'TASK-001', status: 'verified' }]
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  process.stdout.write(`${outputPath}\n`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
