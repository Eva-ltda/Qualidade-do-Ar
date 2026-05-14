import path from 'node:path'
import fs from 'node:fs'
import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { SerialManager } from './serial/SerialManager'
import { readSettings, writeSettings } from './settings'
import type { ConnectionStatus, SensorFrame } from './serial/types'

const serial = new SerialManager()

function resolvePreloadPath() {
  return path.join(app.getAppPath(), 'dist-electron', 'preload.cjs')
}

function resolveRendererIndexPath() {
  return path.join(app.getAppPath(), 'dist', 'renderer', 'index.html')
}

function broadcast(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: '#f6f7fb',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: resolvePreloadPath(),
    },
    title: 'Dashboard Qualidade do Ar',
  })

  if (app.isPackaged) {
    win.loadFile(resolveRendererIndexPath())
  } else {
    win.loadURL('http://localhost:5173/')
    win.webContents.openDevTools({ mode: 'detach' })
  }

  return win
}

function registerIpc() {
  ipcMain.handle('serial:listPorts', async () => {
    return serial.listPorts()
  })

  ipcMain.handle('serial:getStatus', async () => {
    return serial.getStatus()
  })

  ipcMain.handle('serial:getLastPort', async () => {
    return readSettings().lastPortPath
  })

  ipcMain.handle('serial:connect', async (_event, portPath: string) => {
    writeSettings({ lastPortPath: portPath })
    await serial.connect(portPath)
    return true
  })

  ipcMain.handle('serial:disconnect', async () => {
    await serial.disconnect()
    return true
  })

  ipcMain.handle('data:exportCsv', async (_event, csvText: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Exportar CSV',
      defaultPath: `voc_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    })

    if (canceled || !filePath) return { ok: false, canceled: true }

    fs.writeFileSync(filePath, csvText, 'utf8')
    return { ok: true, filePath }
  })
}

async function tryAutoConnect() {
  const settings = readSettings()
  const ports = await serial.listPorts().catch(() => [])

  const wanted = settings.lastPortPath
  if (wanted && ports.some((p) => p.path === wanted)) {
    serial.connect(wanted).catch(() => {})
    return
  }

  if (ports.length === 1) {
    serial.connect(ports[0].path).catch(() => {})
  }
}

serial.on('status', (status: ConnectionStatus) => {
  broadcast('serial:status', status)
})

serial.on('frame', (frame: SensorFrame) => {
  broadcast('serial:frame', frame)
})

app.whenReady().then(async () => {
  registerIpc()
  createWindow()
  await tryAutoConnect()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
