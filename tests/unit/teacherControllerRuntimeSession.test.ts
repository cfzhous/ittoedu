import { describe, expect, it } from 'vitest'
import { teacherControllerNode } from '../helpers/nativeNodeFixtures'
import {
  constrainTeacherControllerOffset,
  logicalDragDelta,
  teacherControllerGestureOutcome,
} from '@/player/teacherControllerRuntimeSession'
import { createTeacherControllerLayout } from '@/shared/teacherControllerLayout'

describe('teacher controller runtime session geometry', () => {
  it('distinguishes click, drag, and cancelled pointer completion', () => {
    expect(teacherControllerGestureOutcome(false, false)).toBe('activate')
    expect(teacherControllerGestureOutcome(true, false)).toBe('moved')
    expect(teacherControllerGestureOutcome(false, true)).toBe('cancelled')
  })

  it('converts screen-space pointer movement to the fixed logical canvas', () => {
    expect(logicalDragDelta(
      { x: 100, y: 80 },
      { x: 150, y: 120 },
      { width: 640, height: 360 },
      { width: 1280, height: 720 },
    )).toEqual({ dx: 100, dy: 80 })
  })

  it('keeps the expanded controller inside the canvas and snaps near edges', () => {
    const node = teacherControllerNode({ x: 200, y: 100 })
    const constrained = constrainTeacherControllerOffset(
      node,
      { dx: -195, dy: -94 },
      false,
      { width: 1280, height: 720 },
    )

    expect(constrained).toEqual({ dx: -200, dy: -100 })
  })

  it('lets the collapsed pill reach an edge without reserving the hidden panel', () => {
    const node = teacherControllerNode({ x: 200, y: 100 })
    const collapse = createTeacherControllerLayout(node, node.width, node.height).collapse
    if (!collapse) throw new Error('fixture controller must be collapsible')

    const constrained = constrainTeacherControllerOffset(
      node,
      { dx: -10_000, dy: 0 },
      true,
      { width: 1280, height: 720 },
    )

    expect(node.x + constrained.dx + collapse.x).toBeCloseTo(0)
  })

  it('constrains the rotated visible bounds instead of only the author frame', () => {
    const node = teacherControllerNode({ x: 0, y: 0 })
    node.rotation = 45
    const constrained = constrainTeacherControllerOffset(
      node,
      { dx: -1000, dy: -1000 },
      false,
      { width: 1280, height: 720 },
      false,
    )

    expect(constrained.dx).toBeGreaterThan(-1000)
    expect(constrained.dy).toBeGreaterThan(-1000)
  })
})
