import { useEffect, useRef } from 'react'
import type { LayerItem } from '../../shared/courseProjectTypes'
import type { TeacherControllerSceneInfo } from '../../shared/teacherControllerLayout'
import {
  TeacherControllerDom,
  teacherControllerDomNode,
} from '../../player/teacherControllerDom'
import { isTeacherControllerLayerItem } from '../course/globalLayerCommands'

export interface TeacherControllerAuthoringChromeProps {
  readonly item: LayerItem
  readonly frame: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  readonly rotation: number
  readonly canvas: { readonly width: number; readonly height: number }
  readonly getRenderedStageBounds: () => { width: number; height: number }
  readonly scenes: readonly TeacherControllerSceneInfo[]
  readonly currentSceneId: string | null
}

/**
 * Authoring-time controller chrome. Interactive playback stays off so Flow/Spatial
 * overlay gestures own the hit region.
 */
export function TeacherControllerAuthoringChrome({
  item,
  frame,
  rotation,
  canvas,
  getRenderedStageBounds,
  scenes,
  currentSceneId,
}: TeacherControllerAuthoringChromeProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const controllerRef = useRef<TeacherControllerDom | null>(null)
  const liveRef = useRef({
    item,
    frame,
    rotation,
    canvas,
    getRenderedStageBounds,
    scenes,
    currentSceneId,
  })
  liveRef.current = {
    item,
    frame,
    rotation,
    canvas,
    getRenderedStageBounds,
    scenes,
    currentSceneId,
  }

  useEffect(() => {
    const host = hostRef.current
    if (!host || !isTeacherControllerLayerItem(item)) return
    const live = () => liveRef.current
    const controller = new TeacherControllerDom({
      node: teacherControllerDomNode(frame, rotation, item.content.data),
      container: host,
      canvas,
      getRenderedStageBounds: () => live().getRenderedStageBounds(),
      scenes: [...scenes],
      getCurrentSceneId: () => live().currentSceneId,
      getStateLabel: () => null,
      getStatus: () => ({ muted: false, fullscreen: false }),
      getSession: () => ({ offset: { dx: 0, dy: 0 }, collapsed: false }),
      onSessionChange: () => undefined,
      onAction: () => undefined,
      getInteractive: () => false,
    })
    controllerRef.current = controller
    return () => {
      controller.destroy()
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [item.layerItemId])

  useEffect(() => {
    const current = liveRef.current
    if (!controllerRef.current || !isTeacherControllerLayerItem(current.item)) return
    controllerRef.current.update(teacherControllerDomNode(
      current.frame,
      current.rotation,
      current.item.content.data,
    ))
  }, [currentSceneId, frame.height, frame.width, frame.x, frame.y, item, rotation, scenes])

  if (!isTeacherControllerLayerItem(item)) return null

  return (
    <div
      ref={hostRef}
      className="teacher-controller-authoring-chrome"
      data-testid="teacher-controller-authoring-chrome"
      style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  )
}
