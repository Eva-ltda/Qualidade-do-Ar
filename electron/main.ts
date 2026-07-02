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
let lastHeartbeatNotificationAtByChat: Record<string, number> = {}
let lastBackupNotificationAtByChat: Record<string, number> = {}
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

function getAirQualityLabelFromVoc(voc: number) {
  const ppm = vocToPPM(voc)
  if (ppm <= 65) return 'Excelente'
  if (ppm <= 150) return 'Boa'
  if (ppm <= 300) return 'Moderada'
  if (ppm <= 500) return 'Ruim'
  return 'Muito Ruim'
}

function buildTelegramMenuMessage() {
  return [
    '🤖 EVA Cortex - Menu Principal',
    '',
    'Bem-vindo ao sistema de notificações da EVA Cortex.',
    '',
    '📋 Comandos disponíveis:',
    '',
    '/menu',
    'Exibe este menu de comandos.',
    '',
    '/registrar_eva',
    'Conecta sua EVA ao Telegram.',
    '',
    '/datavoc',
    'Mostra os últimos dados coletados:',
    '• VOC',
    '• Temperatura',
    '• Umidade',
    '• Qualidade do ar',
    '',
    '/notificar',
    'Configura o intervalo das notificações.',
    'Exemplo:',
    '5 min, 15 min, 30 min, 60 min.',
    '',
    '/backup',
    'Envia um backup atual da coleta ou agenda backups automáticos.',
    'Exemplos:',
    '/backup',
    '/backup 10 min',
    '/backup 1 hora',
    '',
    '/print',
    'Envia uma captura da tela atual da EVA.',
    '',
    '━━━━━━━━━━━━━━',
    '',
    '📊 Status do monitoramento:',
    'Use /datavoc para consultar os dados atuais.',
    '',
    '🔔 Notificações:',
    'Use /notificar para escolher o intervalo dos avisos.',
    '',
    '🛠 EVA Cortex',
    'Monitoramento Inteligente da Qualidade do Ar.',
  ].join('\n')
}

function buildTelegramVocDataMessage() {
  if (!lastSensorFrame) {
    return '💾 Dados:\nNenhum dado de coleta foi recebido ainda.'
  }

  const vocInterno = lastSensorFrame.vocInternoCorrigido
  const vocExterno = lastSensorFrame.vocExternoCorrigido
  const ppmInterno = vocToPPM(vocInterno)
  const ppmExterno = vocToPPM(vocExterno)
  const qualidadeInterna = getAirQualityLabelFromVoc(vocInterno)
  const qualidadeExterna = getAirQualityLabelFromVoc(vocExterno)

  return [
    '💾 Dados:',
    `Voc interno: ${formatNumberPtBr(vocInterno, 1)}`,
    `ppm interno: ${ppmInterno}`,
    `Temperatura interna: ${formatNumberPtBr(lastSensorFrame.tempInterno, 1)} °C`,
    `Umidade: ${formatNumberPtBr(lastSensorFrame.humInterno, 0)}`,
    `Qualidade do ar: ${qualidadeInterna}`,
    '',
    '---------------',
    `Voc externo: ${formatNumberPtBr(vocExterno, 1)}`,
    `ppm externo: ${ppmExterno}`,
    `Temperatura externa: ${formatNumberPtBr(lastSensorFrame.tempExterno, 1)} °C`,
    `Umidade: ${formatNumberPtBr(lastSensorFrame.humExterno, 0)}`,
    `Qualidade do ar: ${qualidadeExterna}`,
  ].join('\n')
}

function getBackupDirectory() {
  return path.join(app.getPath('documents'), 'EVA Cortex', 'backups')
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

  const backupDir = getBackupDirectory()
  const timestamp = new Date(stoppedAt).toISOString().replace(/[:.]/g, '-')
  const filePath = path.join(backupDir, `backup_automatico_${timestamp}.csv`)

  fs.mkdirSync(backupDir, { recursive: true })
  fs.writeFileSync(filePath, buildBackupCsvText(rows), 'utf8')

  return { ok: true as const, filePath }
}

function saveRequestedBackup(rows: SensorFrame[], requestedAt: number) {
  if (rows.length === 0) {
    return { ok: false as const, error: 'Nenhum dado disponível para backup.' }
  }

  const backupDir = getBackupDirectory()
  const timestamp = new Date(requestedAt).toISOString().replace(/[:.]/g, '-')
  const filePath = path.join(backupDir, `backup_solicitado_${timestamp}.csv`)

  fs.mkdirSync(backupDir, { recursive: true })
  fs.writeFileSync(filePath, buildBackupCsvText(rows), 'utf8')

  return { ok: true as const, filePath }
}

function saveScheduledBackup(rows: SensorFrame[], requestedAt: number) {
  if (rows.length === 0) {
    return { ok: false as const, error: 'Nenhum dado disponível para backup.' }
  }

  const backupDir = getBackupDirectory()
  const timestamp = new Date(requestedAt).toISOString().replace(/[:.]/g, '-')
  const filePath = path.join(backupDir, `backup_agendado_${timestamp}.csv`)

  fs.mkdirSync(backupDir, { recursive: true })
  fs.writeFileSync(filePath, buildBackupCsvText(rows), 'utf8')

  return { ok: true as const, filePath }
}

function findLatestBackupFile() {
  const backupDir = getBackupDirectory()
  if (!fs.existsSync(backupDir)) return undefined

  const latest = fs
    .readdirSync(backupDir)
    .filter((fileName) => fileName.toLowerCase().endsWith('.csv'))
    .map((fileName) => {
      const filePath = path.join(backupDir, fileName)
      const stats = fs.statSync(filePath)
      return { filePath, mtimeMs: stats.mtimeMs }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]

  return latest?.filePath
}

function normalizePhoneNumber(value: string) {
  return String(value ?? '').replace(/[^\d+]/g, '')
}

function getTelegramSecret() {
  try {
    const userDataSecretPath = path.join(app.getPath('userData'), 'telegram.secret.json')
    const candidatePaths = Array.from(
      new Set([
        userDataSecretPath,
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

function ensureTelegramSecretInUserData() {
  try {
    const userDataSecretPath = path.join(app.getPath('userData'), 'telegram.secret.json')
    if (fs.existsSync(userDataSecretPath)) return

    const resourcesSecretPath = path.join(process.resourcesPath, 'telegram.secret.json')
    if (!fs.existsSync(resourcesSecretPath)) return

    fs.mkdirSync(path.dirname(userDataSecretPath), { recursive: true })
    fs.copyFileSync(resourcesSecretPath, userDataSecretPath)
  } catch {}
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

function getLinkedChatIds(settings = notificationSettings) {
  return Array.from(
    new Set(
      [settings.chatId, ...(settings.chatIds ?? [])]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean),
    ),
  )
}

function withLinkedChatId(settings: typeof notificationSettings, chatId: string) {
  const normalizedChatId = String(chatId ?? '').trim()
  const chatIds = Array.from(new Set([...getLinkedChatIds(settings), normalizedChatId].filter(Boolean)))
  return normalizeNotificationSettings({
    ...settings,
    chatId: chatIds[0],
    chatIds,
    enabled: chatIds.length > 0,
  })
}

function getChatIntervalMap(settings = notificationSettings) {
  const fallbackInterval = Math.max(1, Math.min(60, Number(settings.heartbeatIntervalMinutes) || 60))
  const entries = Object.entries(settings.chatIntervals ?? {}).map(([chatId, minutes]) => [
    String(chatId ?? '').trim(),
    Math.max(1, Math.min(60, Number(minutes) || fallbackInterval)),
  ])
  return Object.fromEntries(entries.filter(([chatId]) => Boolean(chatId))) as Record<string, number>
}

function getHeartbeatIntervalForChat(chatId: string, settings = notificationSettings) {
  const normalizedChatId = String(chatId ?? '').trim()
  const chatIntervals = getChatIntervalMap(settings)
  return Math.max(1, Math.min(60, Number(chatIntervals[normalizedChatId]) || Number(settings.heartbeatIntervalMinutes) || 60))
}

function getChatBackupIntervalMap(settings = notificationSettings) {
  const entries = Object.entries(settings.chatBackupIntervals ?? {}).map(([chatId, minutes]) => [
    String(chatId ?? '').trim(),
    Math.max(1, Math.min(3600, Number(minutes) || 0)),
  ])
  return Object.fromEntries(entries.filter(([chatId, minutes]) => Boolean(chatId) && Number(minutes) > 0)) as Record<string, number>
}

function getBackupIntervalForChat(chatId: string, settings = notificationSettings) {
  const normalizedChatId = String(chatId ?? '').trim()
  const chatBackupIntervals = getChatBackupIntervalMap(settings)
  return Math.max(0, Math.min(3600, Number(chatBackupIntervals[normalizedChatId]) || 0))
}

function formatBackupIntervalLabel(totalMinutes: number) {
  const normalized = Math.max(1, Math.round(totalMinutes))
  if (normalized % 60 === 0) {
    const hours = normalized / 60
    return `${hours} ${hours === 1 ? 'hora' : 'horas'}`
  }

  return `${normalized} ${normalized === 1 ? 'minuto' : 'minutos'}`
}

function syncHeartbeatRecipients(baseTs?: number) {
  const linkedChatIds = getLinkedChatIds(notificationSettings)
  const nextMap: Record<string, number> = {}

  for (const chatId of linkedChatIds) {
    nextMap[chatId] = lastHeartbeatNotificationAtByChat[chatId] ?? baseTs ?? 0
  }

  lastHeartbeatNotificationAtByChat = nextMap
}

function syncBackupRecipients(baseTs?: number) {
  const linkedChatIds = getLinkedChatIds(notificationSettings)
  const nextMap: Record<string, number> = {}

  for (const chatId of linkedChatIds) {
    nextMap[chatId] = lastBackupNotificationAtByChat[chatId] ?? baseTs ?? 0
  }

  lastBackupNotificationAtByChat = nextMap
}

function canSendNotificationWithSettings(settings = notificationSettings) {
  return settings.enabled && getLinkedChatIds(settings).length > 0 && Boolean(getTelegramBotToken())
}

async function sendTelegramMessage(text: string, chatId: string) {
  const token = getTelegramBotToken()
  if (!token) {
    throw new Error('Token do Telegram nao configurado.')
  }

  const targetChatId = String(chatId ?? '').trim()
  if (!targetChatId) {
    throw new Error('Nenhum chat do Telegram vinculado.')
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: targetChatId,
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

async function sendTelegramFile(
  method: 'sendDocument' | 'sendPhoto',
  fieldName: 'document' | 'photo',
  filePath: string,
  chatId: string,
  caption?: string,
) {
  const token = getTelegramBotToken()
  if (!token) {
    throw new Error('Token do Telegram nao configurado.')
  }

  const targetChatId = String(chatId ?? '').trim()
  if (!targetChatId) {
    throw new Error('Nenhum chat do Telegram vinculado.')
  }

  const fileBuffer = fs.readFileSync(filePath)
  const form = new FormData()
  form.set('chat_id', targetChatId)
  if (caption) {
    form.set('caption', caption)
  }
  form.append(fieldName, new Blob([fileBuffer]), path.basename(filePath))

  const url = `https://api.telegram.org/bot${token}/${method}`
  const response = await fetch(url, {
    method: 'POST',
    body: form,
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
  await sendTelegramMessage(buildTelegramVocDataMessage(), chatId)
}

async function handleTelegramMenuCommand(chatId: string) {
  await sendTelegramMessage(buildTelegramMenuMessage(), chatId)
}

async function handleTelegramNotifyCommand(chatId: string, intervalMinutes?: number) {
  if (!intervalMinutes) {
    await sendTelegramMessage(
      '🔔 Defina seu intervalo individual de notificações.\nUse qualquer valor entre 1 e 60 minutos.\n\nExemplos:\n• /notificar 5 min\n• /notificar 15 min\n• /notificar 30 min\n• /notificar 60 min',
      chatId,
    )
    return
  }

  if (!Number.isFinite(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 60) {
    await sendTelegramMessage(
      'Intervalo inválido. Use um valor entre 1 e 60 minutos.',
      chatId,
    )
    return
  }

  const chatIntervals = {
    ...getChatIntervalMap(notificationSettings),
    [chatId]: Math.round(intervalMinutes),
  }

  notificationSettings = normalizeNotificationSettings({
    ...notificationSettings,
    chatIntervals,
    enabled: getLinkedChatIds(notificationSettings).length > 0,
  })
  lastHeartbeatNotificationAtByChat[chatId] = lastCollectionAt ?? Date.now()
  writeSettings({ notifications: notificationSettings })
  publishNotificationSettings()
  publishNotificationRuntimeState()

  await sendTelegramMessage(`🔔 Intervalo atualizado com sucesso.\nSuas notificações periódicas serão enviadas a cada ${Math.round(intervalMinutes)} minutos.`, chatId)
}

type ParsedBackupCommand =
  | { mode: 'send-now' }
  | { mode: 'disable-auto' }
  | { mode: 'schedule'; intervalMinutes: number }

function parseTelegramBackupCommand(text: string): ParsedBackupCommand | null {
  const raw = String(text ?? '').trim()
  if (!raw) return null

  const match = raw.match(/^\/backup(?:@\w+)?(?:\s+(.+))?$/i)
  if (!match) return null

  const argument = String(match[1] ?? '').trim()
  if (!argument) {
    return { mode: 'send-now' }
  }

  const normalizedArgument = argument.toLowerCase()
  if (['off', 'desligar', 'desativar', 'parar', '0'].includes(normalizedArgument)) {
    return { mode: 'disable-auto' }
  }

  const intervalMatch = normalizedArgument.match(/^(\d+)(?:\s*(min|minuto|minutos|h|hr|hora|horas))?$/i)
  if (!intervalMatch) return null

  const value = Number(intervalMatch[1] ?? 0)
  const unit = String(intervalMatch[2] ?? 'min').toLowerCase()
  if (!Number.isFinite(value) || value <= 0) return null

  const isHourUnit = ['h', 'hr', 'hora', 'horas'].includes(unit)
  return { mode: 'schedule', intervalMinutes: isHourUnit ? value * 60 : value }
}

function buildBackupCaption(filePath: string, generatedAt: number, originLabel: string) {
  const stats = fs.statSync(filePath)
  const latestFrame = collectionFrames[collectionFrames.length - 1]
  const latestDataText = latestFrame ? `\nUltimo dado da coleta: ${formatDateTimeInlinePtBr(latestFrame.receivedAt)}` : ''
  return `💾 Backup da coleta\nOrigem: ${originLabel}\nArquivo: ${path.basename(filePath)}\nGerado em: ${formatDateTimeInlinePtBr(generatedAt)}\nArquivo atualizado em: ${formatDateTimeInlinePtBr(stats.mtimeMs)}${latestDataText}`
}

function createCurrentBackupFile(requestedAt: number, mode: 'manual' | 'scheduled') {
  if (collectionFrames.length > 0) {
    return mode === 'scheduled' ? saveScheduledBackup(collectionFrames, requestedAt) : saveRequestedBackup(collectionFrames, requestedAt)
  }

  const filePath = findLatestBackupFile()
  if (!filePath) {
    return { ok: false as const, error: 'Nenhum backup disponível no momento.' }
  }

  return { ok: true as const, filePath, fromExistingFile: true as const }
}

async function handleTelegramBackupCommand(chatId: string, command: ParsedBackupCommand = { mode: 'send-now' }) {
  if (command.mode === 'disable-auto') {
    const chatBackupIntervals = { ...getChatBackupIntervalMap(notificationSettings) }
    delete chatBackupIntervals[chatId]

    notificationSettings = normalizeNotificationSettings({
      ...notificationSettings,
      chatBackupIntervals,
      enabled: getLinkedChatIds(notificationSettings).length > 0,
    })
    delete lastBackupNotificationAtByChat[chatId]
    writeSettings({ notifications: notificationSettings })
    publishNotificationSettings()
    publishNotificationRuntimeState()

    await sendTelegramMessage('💾 Backup automático desativado para este chat.', chatId)
    return
  }

  if (command.mode === 'schedule') {
    if (!Number.isFinite(command.intervalMinutes) || command.intervalMinutes < 1 || command.intervalMinutes > 3600) {
      await sendTelegramMessage(
        'Intervalo inválido. Use de 1 a 60 minutos, ou de 1 a 60 horas.\n\nExemplos:\n• /backup 10 min\n• /backup 1 hora\n• /backup 2 horas',
        chatId,
      )
      return
    }

    const chatBackupIntervals = {
      ...getChatBackupIntervalMap(notificationSettings),
      [chatId]: Math.round(command.intervalMinutes),
    }

    notificationSettings = normalizeNotificationSettings({
      ...notificationSettings,
      chatBackupIntervals,
      enabled: getLinkedChatIds(notificationSettings).length > 0,
    })
    lastBackupNotificationAtByChat[chatId] = lastCollectionAt ?? Date.now()
    writeSettings({ notifications: notificationSettings })
    publishNotificationSettings()
    publishNotificationRuntimeState()

    await sendTelegramMessage(
      `💾 Backup automático ativado com sucesso.\nEste chat receberá um CSV novo a cada ${formatBackupIntervalLabel(command.intervalMinutes)}.\n\nPara desativar, use:\n• /backup off`,
      chatId,
    )
    return
  }

  const requestedAt = Date.now()
  const result = createCurrentBackupFile(requestedAt, 'manual')
  if (!result.ok) {
    await sendTelegramMessage(result.error, chatId)
    return
  }

  const caption = buildBackupCaption(
    result.filePath,
    requestedAt,
    result.fromExistingFile ? 'arquivo disponível mais recente' : 'coleta atual',
  )
  await sendTelegramFile('sendDocument', 'document', result.filePath, chatId, caption)
}

async function handleTelegramPrintCommand(chatId: string) {
  const win = getMainWindow()
  if (!win) {
    await sendTelegramMessage('Nao foi possivel capturar a tela da EVA neste momento.', chatId)
    return
  }

  await prepareWindowForPrintCapture(win, lastSensorFrame)

  const image = await win.webContents.capturePage()
  const screenshotDir = path.join(app.getPath('temp'), 'eva-cortex')
  const screenshotPath = path.join(screenshotDir, `print_eva_${Date.now()}.png`)
  fs.mkdirSync(screenshotDir, { recursive: true })
  fs.writeFileSync(screenshotPath, image.toPNG())

  try {
    const captureAt = Date.now()
    const latestDataText = lastSensorFrame
      ? `\nUltimo dado: ${formatDateTimeInlinePtBr(lastSensorFrame.receivedAt)}`
      : ''
    await sendTelegramFile(
      'sendPhoto',
      'photo',
      screenshotPath,
      chatId,
      `🖼 Captura atual da EVA\nData: ${formatDateTimeInlinePtBr(captureAt)}${latestDataText}`,
    )
  } finally {
    win.webContents.send('dashboard:finish-print')
    try {
      fs.unlinkSync(screenshotPath)
    } catch {}
  }
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

function parseTelegramNotifyInterval(text: string) {
  const raw = String(text ?? '').trim()
  const match = raw.match(/^\/notificar(?:@\w+)?(?:\s+(\d+))?(?:\s*(?:min|minuto|minutos))?$/i)
  if (!match) return null

  const minutesText = String(match[1] ?? '').trim()
  return { minutes: minutesText ? Number(minutesText) : undefined }
}

async function handleTelegramRegisterCommand(chatId: string, providedCode: string) {
  const expectedCode = getTelegramLinkCode()
  const normalizedProvided = normalizeLinkCode(providedCode)

  if (!normalizedProvided) {
    await sendTelegramMessage(`Use: /registrar ${expectedCode}`, chatId)
    return
  }

  if (normalizedProvided !== expectedCode) {
    await sendTelegramMessage(`Código inválido. Use: /registrar ${expectedCode}`, chatId)
    return
  }

  const nextSettings = withLinkedChatId(
    normalizeNotificationSettings({
      ...notificationSettings,
      phoneNumber: '',
    }),
    chatId,
  )
  notificationSettings = nextSettings
  writeSettings({ notifications: notificationSettings })
  publishNotificationSettings()
  publishNotificationRuntimeState()

  await sendTelegramMessage(`✅ EVA Cortex\nVinculação concluída.\n\nCódigo: ${expectedCode}`, chatId)

  if (hasActiveCollection && lastCollectionAt) {
    notifyCollectionResumedForNewRecipient(lastCollectionAt, chatId)
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
    const chatIdText = chatId === undefined || chatId === null ? '' : String(chatId)
    const linkedChatIds = getLinkedChatIds(notificationSettings)

    const register = parseTelegramRegisterCode(rawText)
    if (register && chatId !== undefined && chatId !== null) {
      await handleTelegramRegisterCommand(chatIdText, register.code).catch(() => {})
      continue
    }

    if ((text === '/menu' || text.startsWith('/menu@')) && chatId !== undefined && chatId !== null) {
      await handleTelegramMenuCommand(chatIdText).catch(() => {})
      continue
    }

    const notifyCommand = parseTelegramNotifyInterval(rawText)
    if (notifyCommand && chatId !== undefined && chatId !== null) {
      if (!linkedChatIds.includes(chatIdText)) {
        await sendTelegramMessage('Nao vinculado. Envie /registrar EVA para conectar sua EVA ao Telegram.', chatIdText).catch(() => {})
        continue
      }

      await handleTelegramNotifyCommand(chatIdText, notifyCommand.minutes).catch(() => {})
      continue
    }

    const backupCommand = parseTelegramBackupCommand(rawText)
    if (backupCommand && chatId !== undefined && chatId !== null) {
      if (!linkedChatIds.includes(chatIdText)) {
        await sendTelegramMessage('Nao vinculado. Envie /registrar EVA para conectar sua EVA ao Telegram.', chatIdText).catch(() => {})
        continue
      }

      await handleTelegramBackupCommand(chatIdText, backupCommand).catch(() => {})
      continue
    }

    if (text.startsWith('/datavoc')) {
      if (chatId !== undefined && chatId !== null && linkedChatIds.includes(chatIdText)) {
        await handleTelegramDatavocCommand(chatIdText).catch(() => {})
      }
      continue
    }

    if (text.startsWith('/print')) {
      if (chatId !== undefined && chatId !== null && linkedChatIds.includes(chatIdText)) {
        await handleTelegramPrintCommand(chatIdText).catch(() => {})
      }
      continue
    }

    if (!notificationSettings.phoneNumber) continue
    if (!contactPhone || chatId === undefined || chatId === null) continue

    const savedPhone = normalizePhoneNumber(notificationSettings.phoneNumber)
    const incomingPhone = normalizePhoneNumber(contactPhone)
    if (!savedPhone || !incomingPhone) continue
    if (savedPhone !== incomingPhone && !incomingPhone.endsWith(savedPhone.replace(/^\+/, ''))) continue

    const nextSettings = withLinkedChatId(notificationSettings, chatIdText)
    notificationSettings = nextSettings
    lastHeartbeatNotificationAtByChat[chatIdText] = lastCollectionAt ?? Date.now()
    lastBackupNotificationAtByChat[chatIdText] = lastCollectionAt ?? Date.now()
    writeSettings({ notifications: notificationSettings })
    publishNotificationSettings()
    publishNotificationRuntimeState()

    if (hasActiveCollection && lastCollectionAt) {
      notifyCollectionResumedForNewRecipient(lastCollectionAt, chatIdText)
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

    const chatIds = getLinkedChatIds(settingsOverride)
    if (chatIds.length === 0) {
      throw new Error('Nao vinculado. Abra o bot no Telegram e envie /registrar EVA.')
    }

    if (kind !== 'teste' && !settingsOverride.enabled) {
      throw new Error('Notificacoes desativadas.')
    }

    await Promise.all(chatIds.map((chatId) => sendTelegramMessage(text, chatId)))
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

function notifyCollectionHeartbeat(ts: number, chatId: string) {
  const intervalMinutes = getHeartbeatIntervalForChat(chatId)
  sendTelegramMessage(`📊 Atualização periódica\nColeta em andamento.\n\nPróxima atualização em ${intervalMinutes} minutos.`, chatId)
    .then(() => {
      publishNotificationRuntimeState({
        lastSentAt: Date.now(),
        lastSentKind: 'intervalo',
        lastErrorAt: undefined,
        lastErrorMessage: undefined,
      })
    })
    .catch((error) => {
      publishNotificationRuntimeState({
        lastErrorAt: Date.now(),
        lastErrorMessage: error instanceof Error ? error.message : 'Falha ao enviar notificacao.',
      })
    })
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

function notifyCollectionResumedForNewRecipient(ts: number, chatId?: string) {
  const { datePart, timePart } = formatDateTimePtBr(ts)
  const text = `🟢 EVA Cortex\nA coleta já está em andamento.\n\nÚltima coleta registrada:\n${datePart} às ${timePart}.`
  if (chatId) {
    lastHeartbeatNotificationAtByChat[chatId] = ts
    sendTelegramMessage(text, chatId).catch(() => {})
    return
  }
  sendTrackedNotification('reativacao', text).catch(() => {})
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
  if (!notificationSettings.enabled || getLinkedChatIds(notificationSettings).length === 0) return undefined
  if (!hasActiveCollection || !lastCollectionAt) return undefined

  const timeoutMs = notificationSettings.staleTimeoutSeconds * 1000
  if (Date.now() - lastCollectionAt >= timeoutMs) return undefined

  const nextValues = getLinkedChatIds(notificationSettings)
    .map((chatId) => {
      const lastSentAt = lastHeartbeatNotificationAtByChat[chatId]
      if (!lastSentAt || lastSentAt <= 0) return undefined
      return lastSentAt + getHeartbeatIntervalForChat(chatId) * 60 * 1000
    })
    .filter((value): value is number => Boolean(value))

  if (nextValues.length === 0) return undefined
  return Math.min(...nextValues)
}

function publishNotificationRuntimeState(partial?: Partial<NotificationRuntimeState>) {
  notificationRuntimeState = {
    ...notificationRuntimeState,
    ...partial,
    nextNotificationAt: computeNextNotificationAt(),
  }
  broadcast('notifications:runtimeState', notificationRuntimeState)
}

function publishNotificationSettings() {
  broadcast('notifications:settings', notificationSettings)
}

function broadcast(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

function getMainWindow() {
  return BrowserWindow.getAllWindows()[0]
}

async function prepareWindowForPrintCapture(win: BrowserWindow, frame?: SensorFrame) {
  if (win.isMinimized()) {
    win.restore()
  }
  if (!win.isVisible()) {
    win.show()
  }

  await new Promise<void>((resolve) => {
    let settled = false

    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      ipcMain.removeListener('dashboard:print-ready', onReady)
      resolve()
    }

    const onReady = (event: Electron.IpcMainEvent) => {
      if (event.sender.id !== win.webContents.id) return
      finish()
    }

    const timeoutId = setTimeout(finish, 1500)
    ipcMain.on('dashboard:print-ready', onReady)
    win.webContents.send('dashboard:prepare-print', frame)
  })

  win.webContents.invalidate()
  await new Promise((resolve) => setTimeout(resolve, 120))
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
        chatId: phoneChanged ? previousSettings.chatId : normalizedNext.chatId,
        chatIds: phoneChanged ? previousSettings.chatIds : normalizedNext.chatIds,
        chatIntervals: previousSettings.chatIntervals,
        chatBackupIntervals: previousSettings.chatBackupIntervals,
        enabled: phoneChanged ? previousSettings.enabled : normalizedNext.enabled,
      })
      syncHeartbeatRecipients(lastCollectionAt ?? Date.now())
      syncBackupRecipients(lastCollectionAt ?? Date.now())
      writeSettings({ notifications: notificationSettings })
      publishNotificationSettings()
      publishNotificationRuntimeState()

      const recipientChanged = getLinkedChatIds(previousSettings).join('|') !== getLinkedChatIds(notificationSettings).join('|')
      const justEnabled = !previousSettings.enabled && notificationSettings.enabled
      if ((recipientChanged || justEnabled) && hasActiveCollection && lastCollectionAt) {
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
    syncHeartbeatRecipients(frame.receivedAt)
    syncBackupRecipients(frame.receivedAt)
    lastStopNotificationFor = 0
    publishNotificationRuntimeState({ collectionState: 'coletando' })
    notifyCollectionStarted(frame.receivedAt)
  } else {
    collectionFrames.push(frame)
    syncHeartbeatRecipients(lastCollectionAt)
    syncBackupRecipients(lastCollectionAt)
    for (const chatId of getLinkedChatIds(notificationSettings)) {
      const lastSentAt = lastHeartbeatNotificationAtByChat[chatId] ?? frame.receivedAt
      const heartbeatIntervalMs = getHeartbeatIntervalForChat(chatId) * 60 * 1000
      if (frame.receivedAt - lastSentAt >= heartbeatIntervalMs) {
        lastHeartbeatNotificationAtByChat[chatId] = frame.receivedAt
        notifyCollectionHeartbeat(frame.receivedAt, chatId)
      }
    }

    const dueBackupChatIds = getLinkedChatIds(notificationSettings).filter((chatId) => {
      const backupIntervalMinutes = getBackupIntervalForChat(chatId)
      if (!backupIntervalMinutes) return false

      const lastSentAt = lastBackupNotificationAtByChat[chatId] ?? frame.receivedAt
      return frame.receivedAt - lastSentAt >= backupIntervalMinutes * 60 * 1000
    })

    if (dueBackupChatIds.length > 0) {
      for (const chatId of dueBackupChatIds) {
        lastBackupNotificationAtByChat[chatId] = frame.receivedAt
      }

      const requestedAt = Date.now()
      const backupResult = createCurrentBackupFile(requestedAt, 'scheduled')
      if (backupResult.ok) {
        const caption = buildBackupCaption(backupResult.filePath, requestedAt, 'backup automático')
        for (const chatId of dueBackupChatIds) {
          sendTelegramFile('sendDocument', 'document', backupResult.filePath, chatId, caption)
            .then(() => {
              publishNotificationRuntimeState({
                lastSentAt: Date.now(),
                lastSentKind: 'intervalo',
                lastErrorAt: undefined,
                lastErrorMessage: undefined,
              })
            })
            .catch((error) => {
              publishNotificationRuntimeState({
                lastErrorAt: Date.now(),
                lastErrorMessage: error instanceof Error ? error.message : 'Falha ao enviar backup automatico.',
              })
            })
        }
      } else {
        publishNotificationRuntimeState({
          lastErrorAt: Date.now(),
          lastErrorMessage: backupResult.error,
        })
      }
    }

    publishNotificationRuntimeState({ collectionState: 'coletando' })
  }

  broadcast('serial:frame', frame)
})

serial.on('rawLine', (line: SerialRawLine) => {
  broadcast('serial:rawLine', line)
})

app.whenReady().then(async () => {
  ensureTelegramSecretInUserData()
  registerIpc()
  createWindow()
  configureAutoUpdater()
  await tryAutoConnect()

  const hasPhone = Boolean(notificationSettings.phoneNumber && notificationSettings.phoneNumber.trim())
  if (!hasPhone && getLinkedChatIds(notificationSettings).length === 0) {
    const defaultChatId = getTelegramDefaultChatId()
    if (defaultChatId) {
      notificationSettings = withLinkedChatId(notificationSettings, defaultChatId)
      writeSettings({ notifications: notificationSettings })
      publishNotificationSettings()
    }
  }

  publishNotificationSettings()
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
    lastHeartbeatNotificationAtByChat = {}
    lastBackupNotificationAtByChat = {}
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
