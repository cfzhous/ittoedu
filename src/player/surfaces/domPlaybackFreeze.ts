type AnimationRoot = HTMLElement & {
  getAnimations?: (options?: { subtree?: boolean }) => Animation[]
}

/**
 * Pauses browser-owned playback without replacing DOM nodes or rewinding time.
 * A later release only restarts entries that this instance observed running.
 */
export class DomPlaybackFreeze {
  #frozen = false
  #root: HTMLElement | null = null
  #mediaToResume = new Set<HTMLMediaElement>()
  #guardedMedia = new Set<HTMLMediaElement>()
  #animationsToResume = new Set<Animation>()

  freeze(
    root: HTMLElement | null,
    mediaRoot: ParentNode | null = root,
    mediaSelector = 'audio, video',
  ): void {
    if (!root) return
    this.#root = root
    this.#frozen = true

    for (const media of mediaRoot?.querySelectorAll<HTMLMediaElement>(mediaSelector) ?? []) {
      if (media.ended) continue
      if (!this.#guardedMedia.has(media)) {
        this.#guardedMedia.add(media)
        media.addEventListener('play', this.#preventPlayback)
      }
      if (media.paused) continue
      this.#mediaToResume.add(media)
      try { media.pause() } catch { /* one broken media element must not block inspection */ }
    }

    for (const animation of this.#animations(root)) {
      if (
        this.#animationsToResume.has(animation) ||
        animation.playState !== 'running'
      ) continue
      this.#animationsToResume.add(animation)
      try { animation.pause() } catch { /* detached/cancelled animations are harmless */ }
    }
  }

  release(): void {
    if (!this.#frozen) return
    this.#frozen = false
    const root = this.#root
    const media = [...this.#mediaToResume]
    const animations = [...this.#animationsToResume]
    this.#mediaToResume.clear()
    this.#animationsToResume.clear()
    this.#removeMediaGuards()

    for (const animation of animations) {
      if (animation.playState !== 'paused') continue
      try { animation.play() } catch { /* animation may have been cancelled while inspecting */ }
    }
    for (const element of media) {
      if (!root?.contains(element) || !element.paused || element.ended) continue
      try { void element.play().catch(() => undefined) } catch { /* autoplay policy can reject */ }
    }
  }

  discard(): void {
    this.#frozen = false
    this.#root = null
    this.#mediaToResume.clear()
    this.#animationsToResume.clear()
    this.#removeMediaGuards()
  }

  #preventPlayback = (event: Event): void => {
    if (!this.#frozen) return
    try { (event.currentTarget as HTMLMediaElement).pause() } catch { /* media may be detaching */ }
  }

  #removeMediaGuards(): void {
    for (const media of this.#guardedMedia) media.removeEventListener('play', this.#preventPlayback)
    this.#guardedMedia.clear()
  }

  #animations(root: AnimationRoot): Animation[] {
    if (typeof root.getAnimations !== 'function') return []
    try {
      return root.getAnimations({ subtree: true })
    } catch {
      try { return root.getAnimations() } catch { return [] }
    }
  }
}
