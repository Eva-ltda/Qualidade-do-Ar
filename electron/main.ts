import path from 'node:path'
import fs from 'node:fs'
import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import { SerialManager } from './serial/SerialManager.js'
import { defaultNotificationSettings, normalizeNotificationSettings, readSettings, writeSettings } from './settings.js'
import type { ConnectionStatus, SensorFrame, SerialRawLine } from './serial/types.js'

const serial = new SerialManager()
let notificationSettings = normalizeNotificationSettings(readSettings().notifications ?? defaultNotificationSettings)
let hasActiveCollection = false
let lastCollectionAt: number | undefined
let lastHeartbeatNotificationAt = 0
let lastStopNotificationFor = 0
let collectionFrames: SensorFrame[] = []
let lastSensorFrame: SensorFrame | undefined
let autoUpdateCheckTimer: NodeJS.Timeout | undefined
type NotificationKind = 'inicio' | 'intervalo' | 'parada' | 'reativacao' | 'teste'

type NotificationRuntimeState = {
  lastSentAt?: number
  lastSentKind?: NotificationKind
  lastErrorAt?: number
  lastErrorMessage?: string
  nextNotificationAt?: number
  collectionState: 'aguardando' | 'coletando' | 'parada'
}

let notificationRuntimeState: NotificationRuntimeState = {
  collectionState: 'aguardando',
}

function formatDateTimePtBr(ts: number) {
  const formatted = new Date(ts).toLocaleString('pt-BR', { hour12: false })
  const [datePart, timePart] = formatted.split(', ')
  return { datePart: datePart ?? '--/--/----', timePart: timePart ?? '--:--:--' }
}

function formatDateTimeInlinePtBr(ts: number) {
  const { datePart, timePart } = formatDateTimePtBr(ts)
  return `${datePart} ${timePart}`
}

function formatNumberPtBr(value: number, fractionDigits = 1) {
  if (!Number.isFinite(value)) return '--'
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
}

function mapRange(value: number, inMin: number, inMax: number, outMin: number, outMax: number) {
  if (inMax === inMin) return outMin
  const ratio = (value - inMin) / (inMax - inMin)
  return outMin + ratio * (outMax - outMin)
}

function vocToPPM(voc: number) {
  const vocToPpmTable = [
    { voc: 10, ppm: 370 },
    { voc: 20, ppm: 274 },
    { voc: 30, ppm: 203 },
    { voc: 40, ppm: 150 },
    { voc: 50, ppm: 112 },
    { voc: 60, ppm: 83 },
    { voc: 70, ppm: 61 },
    { voc: 80, ppm: 45 },
    { voc: 100, ppm: 25 },
  ]

  if (!Number.isFinite(voc) || voc <= 0) return 0

  for (let i = 0; i < vocToPpmTable.length - 1; i += 1) {
    const current = vocToPpmTable[i]
    const next = vocToPpmTable[i + 1]

    if (voc >= current.voc && voc <= next.voc) {
      return Math.max(0, Math.round(mapRange(voc, current.voc, next.voc, current.ppm, next.ppm)))
    }
  }

  const first = vocToPpmTable[0]
  const second = vocToPpmTable[1]
  if (voc < first.voc) {
    return Math.max(0, Math.round(mapRange(voc, first.voc, second.voc, first.ppm, second.ppm)))
  }

  const last = vocToPpmTable[vocToPpmTable.length - 1]
  const previous = vocToPpmTable[vocToPpmTable.length - 2]
  return Math.max(0, Math.round(mapRange(voc, previous.voc, last.voc, previous.ppm, last.ppm)))
}

function buildTelegramVocDataMessage() {
  if (!lastSensorFrame) {
    return '💾 Dados:\nNenhum dado de coleta foi recebido ainda.'
  }

  const vocInterno = lastSensorFrame.vocInternoCorrigido
  const vocExterno = lastSensorFrame.vocExternoCorrigido
  const ppmInterno = vocToPPM(vocInterno)
  const ppmExterno = vocToPPM(vocExterno)

  return [
    '💾 Dados:',
    `Voc interno: ${formatNumberPtBr(vocInterno, 1)}`,
    `ppm interno: ${ppmInterno}`,
    `Umidade: ${formatNumberPtBr(lastSensorFrame.humInterno, 0)}`,
    '',
    '---------------',
    `Voc externo: ${formatNumberPtBr(vocExterno, 1)}`,
    `ppm externo: ${ppmExterno}`,
    `Umidade: ${formatNumberPtBr(lastSensorFrame.humExterno, 0)}`,
  ].join('\n')
}

function buildBackupCsvText(rows: SensorFrame[]) {
  const delimiter = ';'

  const escapeCsv = (value: string) => {
    const needsQuotes = value.includes('"') || value.includes('\n') || value.includes('\r') || value.includes(delimiter)
    const escaped = value.replaceAll('"', '""')
    return needsQuotes ? `"${escaped}"` : escaped
  }

  const fmt1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1).replace('.', ',') : '')
  const fmt0 = (n: number) => (Number.isFinite(n) ? Math.round(n).toString() : '')

  const header = [
    'timestamp_iso',
    'tempInterno_c',
    'humInterno_pct',
    'pressInterno_hpa',
    'vocInternoReal_kohm',
    'vocInterno_kohm',
    'tempExterno_c',
    'humExterno_pct',
    'pressExterno_hpa',
    'vocExternoReal_kohm',
    'vocExterno_kohm',
    'raw',
  ].join(delimiter)

  const lines = rows.map((r) =>
    [
      escapeCsv(new Date(r.receivedAt).toISOString()),
      fmt1(r.tempInterno),
      fmt0(r.humInterno),
      fmt0(r.pressInterno),
      fmt1(r.vocInternoReal),
      fmt1(r.vocInterno),
      fmt1(r.tempExterno),
      fmt0(r.humExterno),
      fmt0(r.pressExterno),
      fmt1(r.vocExternoReal),
      fmt1(r.vocExterno),
      escapeCsv(String(r.raw ?? '')),
    ].join(delimiter),
  )

  const firstRow = rows[0]
  const lastRow = rows[rows.length - 1]
  const metadata = [
    'sep=;',
    ['tipo', 'backup_automatico'].join(delimiter),
    ['primeiro_dado_iso', escapeCsv(firstRow ? new Date(firstRow.receivedAt).toISOString() : '')].join(delimiter),
    ['ultimo_dado_iso', escapeCsv(lastRow ? new Date(lastRow.receivedAt).toISOString() : '')].join(delimiter),
    ['total_registros', String(rows.length)].join(delimiter),
    '',
  ]

  return [...metadata, header, ...lines].join('\r\n')
}

function saveAutomaticBackup(rows: SensorFrame[], stoppedAt: number) {
  if (rows.length === 0) {
    return { ok: false as const, error: 'Nenhum dado disponível para backup.' }
  }

  const backupDir = path.join(app.getPath('documents'), 'EVA Cortex', 'backups')
  const timestamp = new Date(stoppedAt).toISOString().replace(/[:.]/g, '-')
  const filePath = path.join(backupDir, `backup_automatico_${timestamp}.csv`)

  fs.mkdirSync(backupDir, { recursive: true })
  fs.writeFileSync(filePath, buildBackupCsvText(rows), 'utf8')

  return { ok: true as const, filePath }
}

function normalizePhoneNumber(value: string) {
  return String(value ?? '').replace(/[^\d+]/g, '')
}

function getTelegramSecret() {
  try {
    const candidatePaths = Array.from(
      new Set([
        path.join(process.resourcesPath, 'telegram.secret.json'),
        path.join(app.getAppPath(), 'telegram.secret.json'),
        path.join(path.dirname(app.getPath('exe')), 'resources', 'telegram.secret.json'),
      ]),
    )

    for (const secretPath of candidatePaths) {
      if (!fs.existsSync(secretPath)) continue

      const raw = fs.readFileSync(secretPath, 'utf8')
      const parsed = JSON.parse(raw) as { token?: string; chatId?: string | number; linkCode?: string }
      return {
        token: String(parsed?.token ?? '').trim(),
        chatId: String(parsed?.chatId ?? '').trim(),
        linkCode: String(parsed?.linkCode ?? '').trim(),
      }
    }

    return { token: '', chatId: '' }
  } catch {
    return { token: '', chatId: '' }
  }
}

function normalizeLinkCode(value: string) {
  return String(value ?? '').trim().toUpperCase()
}

function getTelegramLinkCode() {
  const envCode = String(process.env.EVA_TELEGRAM_LINK_CODE ?? '').trim()
  if (envCode) return normalizeLinkCode(envCode)

  const secret = getTelegramSecret()
  if (secret.linkCode) return normalizeLinkCode(secret.linkCode)

  return 'EVA'
}

function getTelegramBotToken() {
  const secretToken = getTelegramSecret().token
  if (app.isPackaged) {
    return secretToken
  }

  const envToken = String(process.env.EVA_TELEGRAM_BOT_TOKEN ?? '').trim()
  if (envToken) {
    return envToken
  }

  return secretToken
}

function getTelegramDefaultChatId() {
  return getTelegramSecret().chatId
}

function canSendNotificationWithSettings(settings = notificationSettings) {
  return settings.enabled && Boolean(settings.chatId) && Boolean(getTelegramBotToken())
}

async function sendTelegramMessage(text: string, settingsOverride = notificationSettings) {
  const token = getTelegramBotToken()
  if (!token) {
    throw new Error('Token do Telegram nao configurado.')
  }

  if (!settingsOverride.chatId) {
    throw new Error('Nao vinculado. Abra o bot no Telegram, clique em Start e compartilhe seu contato (telefone) com o bot.')
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: settingsOverride.chatId,
      text,
    }),
  })

  const payload = (await response.json().catch(() => null)) as
    | { ok: true; result?: unknown }
    | { ok: false; description?: string; error_code?: number }
    | null

  if (!response.ok || !payload || (payload as { ok: boolean }).ok === false) {
    const description =
      payload && 'description' in payload && payload.description ? payload.description : `Falha HTTP ${response.status}`
    const code = payload && 'error_code' in payload && payload.error_code ? ` (${payload.error_code})` : ''
    throw new Error(`${description}${code}`)
  }
}

type TelegramUpdate = {
  update_id: number
  message?: {
    chat?: { id?: number | string }
    contact?: { phone_number?: string }
    text?: string
  }
}

let telegramUpdatesOffset = 0

async function handleTelegramDatavocCommand(chatId: string) {
  await sendTelegramMessage(buildTelegramVocDataMessage(), {
    ...notificationSettings,
    chatId,
    enabled: true,
  })
}

function parseTelegramRegisterCode(text: string) {
  const raw = String(text ?? '').trim()
  if (!raw) return null
  const lower = raw.toLowerCase()

  if (lower === '/registrar_eva' || lower.startsWith('/registrar_eva@')) {
    return { code: 'EVA' }
  }

  if (lower === '/registrar' || lower.startsWith('/registrar@')) {
    return { code: '' }
  }

  if (lower.startsWith('/registrar ')) {
    const parts = raw.split(/\s+/).filter(Boolean)
    const code = parts[1] ?? ''
    return { code }
  }

  return null
}

async function handleTelegramRegisterCommand(chatId: string, providedCode: string) {
  const expectedCode = getTelegramLinkCode()
  const normalizedProvided = normalizeLinkCode(providedCode)

  if (!normalizedProvided) {
    await sendTelegramMessage(`Use: /registrar ${expectedCode}`, { ...notificationSettings, chatId, enabled: true })
    return
  }

  if (normalizedProvided !== expectedCode) {
    await sendTelegramMessage(`Código inválido. Use: /registrar ${expectedCode}`, {
      ...notificationSettings,
      chatId,
      enabled: true,
    })
    return
  }

  const nextSettings = normalizeNotificationSettings({
    ...notificationSettings,
    phoneNumber: '',
    chatId,
    enabled: true,
  })
  notificationSettings = nextSettings
  writeSettings({ notifications: notificationSettings })
  publishNotificationRuntimeState()

  await sendTelegramMessage(`✅ EVA Cortex\nVinculação concluída.\n\nCódigo: ${expectedCode}`, {
    ...notificationSettings,
    chatId,
    enabled: true,
  })

  if (hasActiveCollection && lastCollectionAt) {
    lastHeartbeatNotificationAt = lastCollectionAt
    notifyCollectionResumedForNewRecipient(lastCollectionAt)
  }
}

async function pollTelegramUpdates() {
  const token = getTelegramBotToken()
  if (!token) return

  const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${telegramUpdatesOffset}&timeout=0`
  const response = await fetch(url).catch(() => null)
  if (!response || !response.ok) return

  const payload = (await response.json().catch(() => null)) as
    | { ok: true; result: TelegramUpdate[] }
    | { ok: false; description?: string }
    | null

  if (!payload || !('ok' in payload) || !payload.ok) return

  const updates = payload.result ?? []
  for (const update of updates) {
    telegramUpdatesOffset = Math.max(telegramUpdatesOffset, update.update_id + 1)
    const contactPhone = update.message?.contact?.phone_number
    const chatId = update.message?.chat?.id
    const rawText = String(update.message?.text ?? '').trim()
    const text = rawText.toLowerCase()

    const register = parseTelegramRegisterCode(rawText)
    if (register && chatId !== undefined && chatId !== null) {
      await handleTelegramRegisterCommand(String(chatId), register.code).catch(() => {})
      continue
    }

    if (text.startsWith('/datavoc')) {
      const linkedChatId = String(notificationSettings.chatId ?? '').trim()
      if (linkedChatId && chatId !== undefined && chatId !== null && String(chatId) === linkedChatId) {
        await handleTelegramDatavocCommand(String(chatId)).catch(() => {})
      }
    }

    if (!notificationSettings.phoneNumber) continue
    if (notificationSettings.chatId) continue
    if (!contactPhone || chatId === undefined || chatId === null) continue

    const savedPhone = normalizePhoneNumber(notificationSettings.phoneNumber)
    const incomingPhone = normalizePhoneNumber(contactPhone)
    if (!savedPhone || !incomingPhone) continue
    if (savedPhone !== incomingPhone && !incomingPhone.endsWith(savedPhone.replace(/^\+/, ''))) continue

    const nextSettings = normalizeNotificationSettings({
      ...notificationSettings,
      chatId: String(chatId),
      enabled: true,
    })
    notificationSettings = nextSettings
    writeSettings({ notifications: notificationSettings })
    publishNotificationRuntimeState()

    if (hasActiveCollection && lastCollectionAt) {
      lastHeartbeatNotificationAt = lastCollectionAt
      notifyCollectionResumedForNewRecipient(lastCollectionAt)
    }
    break
  }
}

async function sendTrackedNotification(
  kind: NotificationKind,
  text: string,
  settingsOverride = notificationSettings,
) {
  try {
    const token = getTelegramBotToken()
    if (!token) {
      throw new Error('Token do Telegram nao configurado.')
    }

    if (!settingsOverride.chatId) {
      throw new Error('Nao vinculado. Abra o bot no Telegram, clique em Start e compartilhe seu contato (telefone) com o bot.')
    }

    if (kind !== 'teste' && !settingsOverride.enabled) {
      throw new Error('Notificacoes desativadas.')
    }

    await sendTelegramMessage(text, settingsOverride)
    publishNotificationRuntimeState({
      lastSentAt: Date.now(),
      lastSentKind: kind,
      lastErrorAt: undefined,
      lastErrorMessage: undefined,
    })
  } catch (error) {
    publishNotificationRuntimeState({
      lastErrorAt: Date.now(),
      lastErrorMessage: error instanceof Error ? error.message : 'Falha ao enviar notificacao.',
    })
    throw error
  }
}

function notifyCollectionStarted(ts: number) {
  const dateTimeText = formatDateTimeInlinePtBr(ts)
  sendTrackedNotification(
    'inicio',
    `🟢 EVA Cortex\nA coleta foi iniciada.\n\nData: ${dateTimeText}`,
  ).catch(() => {})
}

function notifyCollectionHeartbeat(ts: number) {
  const intervalMinutes = notificationSettings.heartbeatIntervalMinutes
  sendTrackedNotification(
    'intervalo',
    `📊 Atualização periódica\nColeta em andamento.\n\nPróxima atualização em ${intervalMinutes} minutos.`,
  ).catch(() => {})
}

function notifyCollectionStopped(ts: number, backupResult: { ok: true; filePath: string } | { ok: false; error: string }) {
  const { datePart, timePart } = formatDateTimePtBr(ts)
  const backupText = backupResult.ok
    ? 'Foi realizado um backup automatico por interrupição!'
    : `Falha no backup automatico por interrupição: ${backupResult.error}`
  sendTrackedNotification(
    'parada',
    `🔴Coleta interrompida\nA coleta foi interrompida.\n\nÚltima coleta registrada:\n${datePart} às ${timePart}.\n\n${backupText}`,
  ).catch(() => {})
}

function notifyCollectionResumedForNewRecipient(ts: number) {
  const { datePart, timePart } = formatDateTimePtBr(ts)
  sendTrackedNotification(
    'reativacao',
    `🟢 EVA Cortex\nA coleta já está em andamento.\n\nÚltima coleta registrada:\n${datePart} às ${timePart}.`,
  ).catch(() => {})
}

function resolvePreloadPath() {
  return path.join(app.getAppPath(), 'dist-electron', 'preload.cjs')
}

function resolveRendererIndexPath() {
  return path.join(app.getAppPath(), 'dist', 'renderer', 'index.html')
}

function resolveAppIconPath() {
  return path.join(app.getAppPath(), 'Logo.png')
}

function computeNextNotificationAt() {
  if (!notificationSettings.enabled || !notificationSettings.chatId) return undefined
  if (!hasActiveCollection || !lastCollectionAt) return undefined

  const timeoutMs = notificationSettings.staleTimeoutSeconds * 1000
  if (Date.now() - lastCollectionAt >= timeoutMs) return undefined

  const intervalMs = notificationSettings.heartbeatIntervalMinutes * 60 * 1000
  return lastHeartbeatNotificationAt > 0 ? lastHeartbeatNotificationAt + intervalMs : undefined
}

function publishNotificationRuntimeState(partial?: Partial<NotificationRuntimeState>) {
  notificationRuntimeState = {
    ...notificationRuntimeState,
    ...partial,
    nextNotificationAt: computeNextNotificationAt(),
  }
  broadcast('notifications:runtimeState', notificationRuntimeState)
}

function broadcast(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

function getMainWindow() {
  return BrowserWindow.getAllWindows()[0]
}

function configureAutoUpdater() {
  if (!app.isPackaged || process.platform !== 'win32') return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', (error) => {
    console.error('Falha no auto update:', error)
  })

  autoUpdater.on('update-available', () => {
    dialog
      .showMessageBox(getMainWindow(), {
        type: 'info',
        title: 'Atualização disponível',
        message: 'Uma nova versão do EVA Cortex foi encontrada.',
        detail: 'O download será feito automaticamente em segundo plano.',
        buttons: ['OK'],
      })
      .catch(() => {})
  })

  autoUpdater.on('update-downloaded', () => {
    dialog
      .showMessageBox(getMainWindow(), {
        type: 'question',
        title: 'Atualização pronta',
        message: 'A nova versão do EVA Cortex já foi baixada.',
        detail: 'Clique em "Reiniciar agora" para instalar a atualização.',
        buttons: ['Reiniciar agora', 'Depois'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall()
        }
      })
      .catch(() => {})
  })

  const checkForUpdates = () => {
    autoUpdater.checkForUpdates().catch((error: unknown) => {
      console.error('Falha ao verificar atualizações:', error)
    })
  }

  checkForUpdates()
  autoUpdateCheckTimer = setInterval(checkForUpdates, 30 * 60 * 1000)
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: '#f6f7fb',
    icon: resolveAppIconPath(),
    autoHideMenuBar: true,
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
  }

  win.removeMenu()
  win.setMenuBarVisibility(false)

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

  ipcMain.handle('notifications:getSettings', async () => {
    return notificationSettings
  })

  ipcMain.handle('notifications:getRuntimeState', async () => {
    return notificationRuntimeState
  })

  ipcMain.handle('notifications:saveSettings', async (_event, nextSettings) => {
    try {
      const previousSettings = notificationSettings
      const normalizedNext = normalizeNotificationSettings(nextSettings)
      const phoneChanged = normalizePhoneNumber(previousSettings.phoneNumber) !== normalizePhoneNumber(normalizedNext.phoneNumber)
      notificationSettings = normalizeNotificationSettings({
        ...normalizedNext,
        chatId: phoneChanged ? undefined : normalizedNext.chatId,
        enabled: phoneChanged ? false : normalizedNext.enabled,
      })
      writeSettings({ notifications: notificationSettings })
      publishNotificationRuntimeState()

      const recipientChanged = previousSettings.chatId !== notificationSettings.chatId
      const justEnabled = !previousSettings.enabled && notificationSettings.enabled
      if ((recipientChanged || justEnabled) && hasActiveCollection && lastCollectionAt) {
        lastHeartbeatNotificationAt = lastCollectionAt
        notifyCollectionResumedForNewRecipient(lastCollectionAt)
      }

      return notificationSettings
    } catch (error) {
      publishNotificationRuntimeState({
        lastErrorAt: Date.now(),
        lastErrorMessage: error instanceof Error ? error.message : 'Falha ao salvar configuracoes de notificacao.',
      })
      throw new Error(error instanceof Error ? error.message : 'Falha ao salvar as configuracoes de notificacao.')
    }
  })

  ipcMain.handle('notifications:testNotification', async (_event, nextSettings) => {
    try {
      const settingsToTest = normalizeNotificationSettings(nextSettings)
      await sendTrackedNotification(
        'teste',
        'EVA Dashboard: esta e uma notificacao de teste do Telegram.',
        { ...settingsToTest, enabled: true },
      )
      return { ok: true as const }
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : 'Falha ao enviar notificacao de teste.' }
    }
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

  ipcMain.handle('data:backupCsv', async (_event, csvText: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Salvar backup completo',
      defaultPath: `backup_voc_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    })

    if (canceled || !filePath) return { ok: false, canceled: true }

    fs.writeFileSync(filePath, csvText, 'utf8')
    return { ok: true, filePath }
  })
}

async function tryAutoConnect() {
  const settings = readSettings()
  const ports: Array<{ path: string }> = await serial.listPorts().catch(() => [])

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
  lastCollectionAt = frame.receivedAt
  lastSensorFrame = frame

  if (!hasActiveCollection) {
    collectionFrames = [frame]
    hasActiveCollection = true
    lastHeartbeatNotificationAt = frame.receivedAt
    lastStopNotificationFor = 0
    publishNotificationRuntimeState({ collectionState: 'coletando' })
    notifyCollectionStarted(frame.receivedAt)
  } else {
    collectionFrames.push(frame)
    const heartbeatIntervalMs = notificationSettings.heartbeatIntervalMinutes * 60 * 1000
    if (frame.receivedAt - lastHeartbeatNotificationAt >= heartbeatIntervalMs) {
      lastHeartbeatNotificationAt = frame.receivedAt
      publishNotificationRuntimeState({ collectionState: 'coletando' })
      notifyCollectionHeartbeat(frame.receivedAt)
    } else {
      publishNotificationRuntimeState({ collectionState: 'coletando' })
    }
  }

  broadcast('serial:frame', frame)
})

serial.on('rawLine', (line: SerialRawLine) => {
  broadcast('serial:rawLine', line)
})

app.whenReady().then(async () => {
  registerIpc()
  createWindow()
  configureAutoUpdater()
  await tryAutoConnect()

  const hasPhone = Boolean(notificationSettings.phoneNumber && notificationSettings.phoneNumber.trim())
  if (!hasPhone && !notificationSettings.chatId) {
    const defaultChatId = getTelegramDefaultChatId()
    if (defaultChatId) {
      notificationSettings = normalizeNotificationSettings({ ...notificationSettings, chatId: defaultChatId })
      writeSettings({ notifications: notificationSettings })
    }
  }

  publishNotificationRuntimeState()

  setInterval(() => {
      pollTelegramUpdates().catch(() => {})
  }, 3000)

  setInterval(() => {
    if (!hasActiveCollection || !lastCollectionAt) return

    const timeoutMs = notificationSettings.staleTimeoutSeconds * 1000
    if (Date.now() - lastCollectionAt < timeoutMs) return
    if (lastStopNotificationFor === lastCollectionAt) return

    lastStopNotificationFor = lastCollectionAt
    hasActiveCollection = false
    lastHeartbeatNotificationAt = 0
    publishNotificationRuntimeState({ collectionState: 'parada' })
    const backupResult = (() => {
      try {
        return saveAutomaticBackup(collectionFrames, lastCollectionAt)
      } catch (error) {
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : 'Falha ao salvar o arquivo de backup.',
        }
      }
    })()
    notifyCollectionStopped(lastCollectionAt, backupResult)
  }, 1000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (autoUpdateCheckTimer) {
    clearInterval(autoUpdateCheckTimer)
    autoUpdateCheckTimer = undefined
  }
})
