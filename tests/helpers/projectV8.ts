import type { ProjectDocument } from '../../src/shared/projectTypes'

export function createProjectV8Fields(
  controls: ProjectDocument['playback']['controls'] = 'none',
): Pick<ProjectDocument, 'media' | 'playback' | 'globalInteractions'> {
  return {
    globalInteractions: [],
    media: {
      audio: {
        defaultMuted: false,
        masterVolume: 1,
        channelVolumes: {
          music: 1,
          narration: 1,
          sfx: 1,
          ui: 1,
          video: 1,
        },
        sounds: {},
        narrationDucking: {
          enabled: true,
          musicVolume: 0.3,
          fadeMs: 250,
        },
      },
    },
    playback: {
      controls,
      keyboardNavigation: true,
      presenter: {
        enabled: true,
        strategy: 'scene-navigation',
        additionalBindings: [],
      },
    },
  }
}
