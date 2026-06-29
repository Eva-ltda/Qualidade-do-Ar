import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export type NotificationSettings = {
  enabled: boolean
  phoneNumber: string
  chatId?: string
  heartbeatIntervalMinutes: number
  staleTimeoutSeconds: number
}

export type Settings = {
  lastPortPath?: string
  notifications?: NotificationSettings
}

export const defaultNotificationSettings: NotificationSettings = {
  enabled: false,
  phoneNumber: '',
  chatId: undefined,
  heartbeatIntervalMinutes: 60,
  staleTimeoutSeconds: 60,
}

export function normalizeNotificationSettings(input?: Partial<NotificationSettings>): NotificationSettings {
  const phoneNumber = String(input?.phoneNumber ?? '').trim()
  const chatIdRaw = input?.chatId
  const chatId = chatIdRaw === undefined || chatIdRaw === null ? undefined : String(chatIdRaw).trim() || undefined
  return {
    enabled: input?.enabled === undefined ? Boolean(chatId) : Boolean(input.enabled),
    phoneNumber,
    chatId,
    heartbeatIntervalMinutes: Math.max(1, Number(input?.heartbeatIntervalMinutes) || defaultNotificationSettings.heartbeatIntervalMinutes),
    staleTimeoutSeconds: Math.max(5, Number(input?.staleTimeoutSeconds) || defaultNotificationSettings.staleTimeoutSeconds),
  }
}

let preferredSettingsPath: string | undefined

function getPrimarySettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json')
}

function getFallbackSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.local.json')
}

function pickReadableSettingsPath() {
  const primary = getPrimarySettingsPath()
  const fallback = getFallbackSettingsPath()

  try {
    if (fs.existsSync(primary)) return primary
  } catch {}

  try {
    if (fs.existsSync(fallback)) return fallback
  } catch {}

  return primary
}

function getSettingsPath() {
  if (preferredSettingsPath) return preferredSettingsPath
  preferredSettingsPath = pickReadableSettingsPath()
  return preferredSettingsPath
}

export function readSettings(): Settings {
  const primary = getPrimarySettingsPath()
  const fallback = getFallbackSettingsPath()

  const tryRead = (filePath: string): Settings | undefined => {
    try {
      const raw = fs.readFileSync(filePath, 'utf8')
      const parsed = JSON.parse(raw) as Settings
      if (!parsed) return {}
      preferredSettingsPath = filePath
      return {
        ...parsed,
        notifications: normalizeNotificationSettings(parsed.notifications),
      }
    } catch {
      return undefined
    }
  }

  const first = tryRead(getSettingsPath())
  if (first) return first

  const second = getSettingsPath() === primary ? tryRead(fallback) : tryRead(primary)
  if (second) return second

  return {}
}

export function writeSettings(next: Settings) {
  const ensureDir = (filePath: string) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
  }

  const writeToPath = (filePath: string) => {
    ensureDir(filePath)
    const current = readSettings()
    const merged: Settings = {
      ...current,
      ...next,
      notifications: normalizeNotificationSettings(next.notifications ?? current.notifications),
    }
    const text = JSON.stringify(merged, null, 2)

    try {
      if (fs.existsSync(filePath)) {
        try {
          fs.chmodSync(filePath, 0o666)
        } catch {}
      }
    } catch {}

    fs.writeFileSync(filePath, text, 'utf8')
  }

  const primary = getPrimarySettingsPath()
  const fallback = getFallbackSettingsPath()
  const preferred = getSettingsPath()

  try {
    writeToPath(preferred)
    preferredSettingsPath = preferred
    return
  } catch {}

  const alt = preferred === primary ? fallback : primary
  try {
    writeToPath(alt)
    preferredSettingsPath = alt
    return
  } catch (error) {
    preferredSettingsPath = preferred
    throw error
  }
}
