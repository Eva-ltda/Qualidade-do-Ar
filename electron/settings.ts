import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

type Settings = {
  lastPortPath?: string
}

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json')
}

export function readSettings(): Settings {
  try {
    const filePath = getSettingsPath()
    const raw = fs.readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw) as Settings
    return parsed ?? {}
  } catch {
    return {}
  }
}

export function writeSettings(next: Settings) {
  const filePath = getSettingsPath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf8')
}
