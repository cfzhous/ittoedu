import { useState } from 'react'
import LegacyApp from './App'
import CourseStudioApp from './course/CourseStudioApp'

export type ProductEditorRoute = 'course-v9' | 'legacy-v8'

function initialRoute(): ProductEditorRoute {
  const query = new URLSearchParams(window.location.search).get('editor')
  if (query === 'legacy-v8') return 'legacy-v8'
  if (query === 'course-v9') return 'course-v9'
  return 'course-v9'
}

/**
 * Course V9 is the product path. Project V8 remains deliberately reachable for
 * maintenance and migration, with a stable query switch for legacy E2E suites:
 * `?editor=legacy-v8`.
 */
export default function ProductApp() {
  const [route, setRoute] = useState<ProductEditorRoute>(initialRoute)
  if (route === 'legacy-v8') {
    return (
      <div data-testid="legacy-v8-product-route">
        <button
          type="button"
          className="product-route-switch"
          data-testid="open-course-v9"
          onClick={() => setRoute('course-v9')}
        >
          返回 Course Studio V9
        </button>
        <LegacyApp />
      </div>
    )
  }
  return <CourseStudioApp onOpenLegacy={() => setRoute('legacy-v8')} />
}
