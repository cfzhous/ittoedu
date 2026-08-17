// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildCourseStructureViewModel,
} from '@/renderer/course/courseEditorLayout'
import {
  createBlankFlowCourse,
  createBlankSlideCourse,
  createBlankSpatialCourse,
} from '@/renderer/course/courseLocationCommands'
import { addCoursePage } from '@/renderer/course/courseLocationCommands'
import { ScenePanel } from '@/renderer/ui/ScenePanel'

afterEach(cleanup)

describe('editor shell collapse and shared-content persistence', () => {
  it('keeps 共享内容 visible across slide, flow, spatial and mixed structures', () => {
    const slide = buildCourseStructureViewModel(createBlankSlideCourse().project)
    const flow = buildCourseStructureViewModel(createBlankFlowCourse().project)
    const spatial = buildCourseStructureViewModel(createBlankSpatialCourse().project)
    const mixedProject = addCoursePage(
      addCoursePage(createBlankSlideCourse().project, 'flow').project,
      'spatial-2d',
    ).project
    const mixed = buildCourseStructureViewModel(mixedProject)

    const { rerender } = render(
      <ScenePanel courseStructure={slide} authoringScope="location" />,
    )
    expect(screen.getByTestId('shared-content-section')).toBeInTheDocument()
    expect(screen.getByTestId('add-content-menu')).toBeInTheDocument()

    rerender(<ScenePanel courseStructure={flow} authoringScope="global-layer" />)
    expect(screen.getByTestId('shared-content-section')).toBeInTheDocument()
    expect(screen.getByTestId('global-layer-entry')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('course-page-tree')).toBeInTheDocument()

    rerender(<ScenePanel courseStructure={spatial} authoringScope="location" />)
    expect(screen.getByTestId('shared-content-section')).toBeInTheDocument()
    expect(screen.getByText('本页镜头')).toBeInTheDocument()

    rerender(<ScenePanel courseStructure={mixed} authoringScope="location" />)
    expect(screen.getByTestId('shared-content-section')).toBeInTheDocument()
    expect(screen.getByTestId('course-page-tree')).toBeInTheDocument()
    expect(document.querySelector('.hide-shared-layer-entries')).toBeNull()
  })
})
