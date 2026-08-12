import path from 'node:path'
import type { App } from 'electron'
import { APP_USER_DATA_DIRECTORY_NAME } from '../shared/constants'

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
    APP_USER_DATA_DIRECTORY_NAME,
  )
  application.setPath('userData', userDataPath)
  return userDataPath
}
