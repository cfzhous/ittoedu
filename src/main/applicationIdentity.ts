import path from 'node:path'
import type { App } from 'electron'

/**
 * Rebuild-session AppData name. Intentionally different from the shared
 * product directory `ittoedu-courseware-editor` used by the V9 donor and
 * mature V8 installs, so leftover V9 recovery/recents cannot load here.
 * Explicit `--user-data-dir` still wins for e2e and tooling.
 */
export const REBUILD_USER_DATA_DIRECTORY_NAME = 'ittoedu-courseware-editor-v8-rebuild'

type ApplicationPathHost = Pick<App, 'getPath' | 'setPath'>

function hasExplicitUserDataDirectory(argv: readonly string[]): boolean {
  return argv.some(
    (argument) =>
      argument === '--user-data-dir' || argument.startsWith('--user-data-dir='),
  )
}

export function configureApplicationStorage(
  application: ApplicationPathHost,
  argv: readonly string[] = process.argv,
): string {
  if (hasExplicitUserDataDirectory(argv)) {
    return application.getPath('userData')
  }
  const userDataPath = path.join(
    application.getPath('appData'),
    REBUILD_USER_DATA_DIRECTORY_NAME,
  )
  application.setPath('userData', userDataPath)
  return userDataPath
}
