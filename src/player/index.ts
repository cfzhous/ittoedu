import { startPublishedCourse } from './PublishedCourseApp'

function showBootstrapError(error: unknown): void {
  console.error('Published course player failed to start', error)
  const root = document.getElementById('course-root')
  if (!root) return
  const message = document.createElement('div')
  message.className = 'course-player-error'
  message.textContent = '课件加载失败，其他文件未受影响。'
  root.replaceChildren(message)
}

export async function bootstrapPublishedCourse(): Promise<import('./PublishedCourseApp').PublishedCourseApp | null> {
  if (window.__H5_COURSE_PLAYER__) return window.__H5_COURSE_PLAYER__
  const payload = window.__H5_COURSE_PAYLOAD__
  if (!payload) return null
  try {
    const player = await startPublishedCourse(payload, 'course-root')
    window.__H5_COURSE_PLAYER__ = player
    return player
  } catch (error) {
    showBootstrapError(error)
    return null
  }
}

function destroyPublishedCourse(event: PageTransitionEvent): void {
  if (event.persisted) return
  const player = window.__H5_COURSE_PLAYER__
  delete window.__H5_COURSE_PLAYER__
  if (player) void player.destroy()
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('pagehide', destroyPublishedCourse)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void bootstrapPublishedCourse(), { once: true })
  } else {
    void bootstrapPublishedCourse()
  }
}

export { ComponentRegistry } from './ComponentRegistry'
export { PublishedCourseApp, startPublishedCourse } from './PublishedCourseApp'
export {
  decodePublishedCourseCode,
  isPublishedCourseV2Payload,
  publishedCourseToPlayerDocument,
} from './publishedCourse'
export * from './surfaces'
