// @vitest-environment node

import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { configureApplicationStorage } from '../../src/main/applicationIdentity'
import { APP_USER_DATA_DIRECTORY_NAME } from '../../src/shared/constants'

describe('application identity storage', () => {
  it('uses the ittoedu directory below the platform app-data root', () => {
    const setPath = vi.fn()
    const getPath = vi.fn((name: 'appData' | 'userData') =>
      name === 'appData'
        ? path.join('C:', 'Users', 'teacher', 'AppData', 'Roaming')
        : 'unused',
    )

    const result = configureApplicationStorage(
      { getPath, setPath },
      ['electron', '.'],
    )

    const expected = path.join(
      'C:',
      'Users',
      'teacher',
      'AppData',
      'Roaming',
      APP_USER_DATA_DIRECTORY_NAME,
    )
    expect(result).toBe(expected)
    expect(setPath).toHaveBeenCalledOnce()
    expect(setPath).toHaveBeenCalledWith('userData', expected)
  })

  it('preserves an explicit user-data-dir for isolated tests and tooling', () => {
    const setPath = vi.fn()
    const getPath = vi.fn((name: 'appData' | 'userData') =>
      name === 'userData' ? path.join('D:', 'isolated-profile') : 'unused',
    )

    const result = configureApplicationStorage(
      { getPath, setPath },
      ['electron', '.', '--user-data-dir=D:\\isolated-profile'],
    )

    expect(result).toBe(path.join('D:', 'isolated-profile'))
    expect(setPath).not.toHaveBeenCalled()
    expect(getPath).toHaveBeenCalledWith('userData')
  })
})
