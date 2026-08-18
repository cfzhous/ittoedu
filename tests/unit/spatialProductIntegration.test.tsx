import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { stageResizeHandleWorldPoint, worldToClient } from '@/renderer/authoring/stageViewportTransform'
import { createSpatialWorldAuthoringController } from '@/renderer/authoring/spatialWorldAuthoring'
import { createSpatialWorldViewTransform } from '@/renderer/course/spatialEditorView'
import { addSpatialPathInSession } from '@/renderer/course/spatialPathCommands'
import { addSpatialRelationInSession } from '@/renderer/course/spatialRelationCommands'
import {
  selectActiveCourseProjectDocument,
  selectEditingNodes,
  useEditorStore,
} from '@/renderer/store/editorStore'
import { ElementsTab } from '@/renderer/ui/ElementsTab'
import { NodesTab } from '@/renderer/ui/NodesTab'
import { PropertiesTab } from '@/renderer/ui/PropertiesTab'
import { ScenePanel } from '@/renderer/ui/ScenePanel'
import { TopToolbar } from '@/renderer/ui/TopToolbar'
import type { SpatialAuthoringSession } from '@/renderer/course/spatialEditorCommands'

const VIEWPORT = { x: 0, y: 0, width: 800, height: 450 }

function spatialDocument() {
  const document = selectActiveCourseProjectDocument(useEditorStore.getState())
  if (!document) throw new Error('expected course document')
  return document
}

function spatialSurface() {
  const surface = spatialDocument().surfaces.find((candidate) => candidate.type === 'spatial-2d')
  if (!surface || surface.type !== 'spatial-2d') throw new Error('expected spatial surface')
  return surface
}

function storeHost() {
  return {
    getSession: () => {
      const session = useEditorStore.getState().spatialSession
      if (!session) throw new Error('not-spatial-session')
      return session
    },
    setSession: (next: SpatialAuthoringSession) => {
      const previous = useEditorStore.getState().spatialSession
      useEditorStore.getState().applySpatialAuthoringSession(next, {
        historyEntry: Boolean(
          previous && next.history.present.revision !== previous.history.present.revision,
        ),
      })
    },
  }
}

beforeEach(() => {
  useEditorStore.getState().createNewProject()
})

afterEach(() => {
  cleanup()
  useEditorStore.getState().createNewProject()
})

describe('Spatial product shell wiring', () => {
  it('keeps default new project on Slide and adds a visible blank Spatial entry', () => {
    const slide = spatialDocument()
    expect(slide.surfaces[0]?.type).toBe('slide')
    expect(useEditorStore.getState().spatialSession).toBeNull()

    render(
      <TopToolbar
        busy={false}
        onNew={() => useEditorStore.getState().createNewProject()}
        onNewSpatial={() => useEditorStore.getState().createNewSpatialProject()}
        onOpen={() => undefined}
        recentProjects={[]}
        onOpenRecent={() => undefined}
        onSave={() => undefined}
        healthSummary={{ error: 0, warning: 0, info: 0, total: 0, canExport: true }}
        onOpenHealth={() => undefined}
        onPreview={() => undefined}
        onExport={() => undefined}
      />,
    )
    fireEvent.click(screen.getByTestId('new-spatial-project'))
    const spatial = spatialDocument()
    expect(spatial.surfaces[0]?.type).toBe('spatial-2d')
    expect(useEditorStore.getState().spatialSession).not.toBeNull()
  })

  it('notifies Zustand after inserting world text and keeps cameras after archive reopen', () => {
    useEditorStore.getState().createNewSpatialProject()
    const startRevision = spatialDocument().revision
    let notifications = 0
    const unsubscribe = useEditorStore.subscribe(() => {
      notifications += 1
    })
    render(<ElementsTab onAddImage={() => undefined} />)
    fireEvent.click(screen.getByTestId('add-text'))
    fireEvent.click(screen.getByTestId('add-text'))
    unsubscribe()
    expect(useEditorStore.getState().errorMessage).toBeNull()
    expect(notifications).toBeGreaterThan(0)
    expect(spatialDocument().revision).toBe(startRevision + 2)
    expect(selectEditingNodes(useEditorStore.getState()).filter((node) => node.type === 'text')).toHaveLength(2)

    const firstFrameCount = spatialSurface().camera.frames.length
    fireEvent.click(screen.getByTestId('add-text'))
    render(<ScenePanel />)
    fireEvent.click(screen.getByTestId('add-spatial-camera'))
    fireEvent.click(screen.getByTestId('add-spatial-camera'))
    expect(spatialSurface().camera.frames.length).toBe(firstFrameCount + 2)

    const ids = spatialSurface().world.layerItems.map((item) => item.layerItemId)
    useEditorStore.getState().runSpatialCommand((session) => addSpatialPathInSession(session, {
      name: '食物网路径',
      layerItemIds: ids.slice(0, Math.min(2, ids.length)),
    }))
    const bytes = useEditorStore.getState().exportV9SlideCandidateArchive()
    expect(bytes).toBeTruthy()
    useEditorStore.getState().createNewProject()
    expect(useEditorStore.getState().spatialSession).toBeNull()
    expect(useEditorStore.getState().reopenV9SlideCandidateArchive(bytes!)).toBe(true)
    expect(spatialSurface().camera.frames.length).toBe(firstFrameCount + 2)
    expect(spatialSurface().world.paths?.some((path) => path.name === '食物网路径')).toBe(true)
  })

  it('shows 本页镜头, page camera/path sections, hides path editor on text, and keeps paths out of Nodes', () => {
    useEditorStore.getState().createNewSpatialProject()
    render(<ScenePanel />)
    expect(screen.getByText('本页镜头')).toBeTruthy()
    expect(screen.queryByTestId('add-scene')).toBeNull()

    render(<PropertiesTab onReplaceImage={() => undefined} />)
    expect(screen.getByRole('heading', { name: '镜头调度' })).toBeTruthy()
    expect(screen.getByText('路径与关系')).toBeTruthy()
    expect(screen.getByText('语义缩放')).toBeTruthy()

    render(<ElementsTab onAddImage={() => undefined} />)
    fireEvent.click(screen.getByTestId('add-text'))
    fireEvent.click(screen.getByTestId('add-text'))
    const textId = selectEditingNodes(useEditorStore.getState())[0]?.id
    expect(textId).toBeTruthy()
    useEditorStore.getState().selectNode(textId!)
    cleanup()
    render(<PropertiesTab onReplaceImage={() => undefined} />)
    expect(screen.queryByRole('heading', { name: '镜头调度' })).toBeNull()
    expect(screen.queryByText('路径与关系')).toBeNull()
    expect(screen.queryByLabelText('播放路径')).toBeNull()

    const ids = spatialSurface().world.layerItems.map((item) => item.layerItemId)
    useEditorStore.getState().runSpatialCommand((session) => addSpatialPathInSession(session, {
      name: '不应出现在图层',
      layerItemIds: ids.slice(0, 1),
    }))
    useEditorStore.getState().runSpatialCommand((session) => addSpatialRelationInSession(session, {
      sourceLayerItemId: ids[0]!,
      targetLayerItemId: ids[1] ?? ids[0]!,
      kind: 'arrow',
    }))
    const pathId = spatialSurface().world.paths?.[0]?.id
    render(<NodesTab />)
    expect(screen.queryByText('不应出现在图层')).toBeNull()
    if (pathId) expect(screen.queryByTestId(`node-item-${pathId}`)).toBeNull()
  })

  it('commits west resize once and does not write revision for G1 camera frames', () => {
    useEditorStore.getState().createNewSpatialProject()
    render(<ElementsTab onAddImage={() => undefined} />)
    fireEvent.click(screen.getByTestId('add-text'))
    const item = spatialSurface().world.layerItems[0]
    expect(item).toBeTruthy()
    useEditorStore.getState().selectNode(item!.layerItemId)
    const startRevision = spatialDocument().revision
    const controller = createSpatialWorldAuthoringController(storeHost())
    controller.zoomSession(2, VIEWPORT)
    expect(spatialDocument().revision).toBe(startRevision)
    expect(useEditorStore.getState().spatialSession?.sessionCamera.zoom).toBe(2)

    const west = stageResizeHandleWorldPoint({
      x: item!.frame.x,
      y: item!.frame.y,
      width: item!.frame.width,
      height: item!.frame.height,
    }, 'w')
    const westClient = worldToClient(
      createSpatialWorldViewTransform(VIEWPORT, useEditorStore.getState().spatialSession!.sessionCamera),
      west,
    )
    controller.pointerDown({ x: westClient.x, y: westClient.y }, VIEWPORT)
    expect(spatialDocument().revision).toBe(startRevision)
    controller.pointerMove({ x: westClient.x - 40, y: westClient.y }, VIEWPORT)
    expect(spatialDocument().revision).toBe(startRevision)
    controller.pointerUp({ x: westClient.x - 40, y: westClient.y }, VIEWPORT)
    expect(spatialDocument().revision).toBe(startRevision + 1)

    useEditorStore.getState().selectNode(null)
    cleanup()
    render(<PropertiesTab onReplaceImage={() => undefined} />)
    const framesToggle = screen.getByLabelText('显示镜头框')
    expect(useEditorStore.getState().spatialSession?.showCameraFrames).toBe(true)
    fireEvent.click(framesToggle)
    expect(useEditorStore.getState().spatialSession?.showCameraFrames).toBe(false)
    expect(spatialDocument().revision).toBe(startRevision + 1)
  })
})
