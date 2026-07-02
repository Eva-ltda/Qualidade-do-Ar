var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// electron/main.ts
var import_node_path2 = __toESM(require("path"), 1);
var import_node_fs2 = __toESM(require("fs"), 1);
var import_electron2 = require("electron");
var import_electron_updater = require("electron-updater");

// electron/serial/SerialManager.ts
var import_node_events = require("events");
var import_serialport = require("serialport");
var import_parser_readline = require("@serialport/parser-readline");
var SerialManager = class extends import_node_events.EventEmitter {
  port;
  desiredPortPath;
  status = { state: "disconnected" };
  reconnectTimer;
  staleTimer;
  userInitiatedDisconnect = false;
  on(event, listener) {
    return super.on(event, listener);
  }
  emit(event, ...args) {
    return super.emit(event, ...args);
  }
  getStatus() {
    return this.status;
  }
  async listPorts() {
    const ports = await import_serialport.SerialPort.list();
    return ports.filter((p) => p.path).map((p) => ({
      path: p.path,
      manufacturer: p.manufacturer,
      serialNumber: p.serialNumber,
      vendorId: p.vendorId,
      productId: p.productId,
      friendlyName: p.friendlyName
    }));
  }
  async connect(portPath, baudRate = 9600) {
    this.userInitiatedDisconnect = false;
    this.desiredPortPath = portPath;
    if (this.port?.isOpen && this.status.portPath === portPath) {
      return;
    }
    await this.disconnectInternal();
    this.setStatus({ state: "connecting", portPath });
    const port = new import_serialport.SerialPort({ path: portPath, baudRate, autoOpen: false });
    this.port = port;
    port.on("error", (err) => {
      this.setStatus({ state: "error", portPath, error: err?.message ?? "Erro serial" });
    });
    port.on("close", () => {
      const lastPath = this.status.portPath;
      this.port = void 0;
      if (this.userInitiatedDisconnect) {
        this.setStatus({ state: "disconnected", portPath: lastPath });
        return;
      }
      this.setStatus({ state: "disconnected", portPath: lastPath, error: "Conex\xE3o encerrada" });
      this.scheduleReconnect();
    });
    const parser = port.pipe(new import_parser_readline.ReadlineParser({ delimiter: "\n" }));
    parser.on("data", (line) => {
      const trimmed = String(line ?? "").trim();
      if (!trimmed) return;
      const now = Date.now();
      this.emit("rawLine", { text: trimmed, receivedAt: now });
      const frame = this.parseFrame(trimmed);
      if (!frame) return;
      this.setStatus({ state: "connected", portPath, lastReceivedAt: now });
      this.emit("frame", { ...frame, receivedAt: now });
    });
    await new Promise((resolve, reject) => {
      port.open((err) => {
        if (err) reject(err);
        else resolve();
      });
    }).catch((err) => {
      this.setStatus({ state: "error", portPath, error: err?.message ?? "Falha ao abrir porta" });
      this.scheduleReconnect();
      throw err;
    });
    this.setStatus({ state: "connected", portPath, lastReceivedAt: this.status.lastReceivedAt });
    this.startStaleDetection();
  }
  async disconnect() {
    this.userInitiatedDisconnect = true;
    this.desiredPortPath = void 0;
    await this.disconnectInternal();
    this.setStatus({ state: "disconnected", portPath: this.status.portPath });
  }
  async disconnectInternal() {
    this.clearReconnect();
    this.stopStaleDetection();
    const port = this.port;
    this.port = void 0;
    if (!port) return;
    if (!port.isOpen) return;
    await new Promise((resolve) => {
      port.close(() => resolve());
    });
  }
  setStatus(next) {
    const merged = {
      ...this.status,
      ...next
    };
    if (merged.state === "connected") {
      merged.error = void 0;
    }
    this.status = merged;
    this.emit("status", this.status);
  }
  scheduleReconnect() {
    this.clearReconnect();
    const desired = this.desiredPortPath;
    if (!desired) return;
    this.reconnectTimer = setTimeout(() => {
      const stillDesired = this.desiredPortPath;
      if (!stillDesired) return;
      this.connect(stillDesired).catch(() => {
      });
    }, 1500);
  }
  clearReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = void 0;
  }
  startStaleDetection() {
    this.stopStaleDetection();
    this.staleTimer = setInterval(() => {
      if (this.status.state !== "connected") return;
      if (!this.status.lastReceivedAt) return;
      const age = Date.now() - this.status.lastReceivedAt;
      if (age < 6500) return;
      const portPath = this.status.portPath;
      this.setStatus({ state: "error", portPath, error: "Sem dados (timeout)" });
    }, 1e3);
  }
  stopStaleDetection() {
    if (this.staleTimer) clearInterval(this.staleTimer);
    this.staleTimer = void 0;
  }
  parseFrame(rawLine) {
    if (!rawLine) return null;
    const parts = rawLine.split(",").map((s) => s.trim());
    if (parts.length < 8) return null;
    const take = parts.length >= 10 ? 10 : 8;
    const nums = parts.slice(0, take).map((p) => Number(p));
    if (nums.some((n) => Number.isNaN(n))) return null;
    const hasCorrectedVoc = nums.length >= 10;
    const vocInternoReal = hasCorrectedVoc ? nums[3] : nums[3];
    const vocInternoCorrigido = hasCorrectedVoc ? nums[4] : nums[3];
    const tempExterno = hasCorrectedVoc ? nums[5] : nums[4];
    const humExterno = hasCorrectedVoc ? nums[6] : nums[5];
    const pressExterno = hasCorrectedVoc ? nums[7] : nums[6];
    const vocExternoReal = hasCorrectedVoc ? nums[8] : nums[7];
    const vocExternoCorrigido = hasCorrectedVoc ? nums[9] : nums[7];
    return {
      tempInterno: nums[0],
      humInterno: nums[1],
      pressInterno: nums[2],
      vocInterno: vocInternoCorrigido,
      vocInternoReal,
      vocInternoCorrigido,
      tempExterno,
      humExterno,
      pressExterno,
      vocExterno: vocExternoCorrigido,
      vocExternoReal,
      vocExternoCorrigido,
      raw: rawLine
    };
  }
};

// electron/settings.ts
var import_node_fs = __toESM(require("fs"), 1);
var import_node_path = __toESM(require("path"), 1);
var import_electron = require("electron");
var defaultNotificationSettings = {
  enabled: false,
  phoneNumber: "",
  chatId: void 0,
  chatIds: [],
  chatIntervals: {},
  heartbeatIntervalMinutes: 60,
  staleTimeoutSeconds: 60
};
function normalizeNotificationSettings(input) {
  const phoneNumber = String(input?.phoneNumber ?? "").trim();
  const chatIdRaw = input?.chatId;
  const chatId = chatIdRaw === void 0 || chatIdRaw === null ? void 0 : String(chatIdRaw).trim() || void 0;
  const chatIds = Array.from(
    new Set(
      (Array.isArray(input?.chatIds) ? input?.chatIds : []).map((value) => String(value ?? "").trim()).filter(Boolean).concat(chatId ? [chatId] : [])
    )
  );
  const rawChatIntervals = input?.chatIntervals && typeof input.chatIntervals === "object" ? input.chatIntervals : {};
  const chatIntervals = Object.fromEntries(
    Object.entries(rawChatIntervals).map(([chatIdKey, value]) => [
      String(chatIdKey ?? "").trim(),
      Math.max(1, Math.min(60, Number(value) || defaultNotificationSettings.heartbeatIntervalMinutes))
    ]).filter(([chatIdKey]) => Boolean(chatIdKey))
  );
  return {
    enabled: input?.enabled === void 0 ? chatIds.length > 0 : Boolean(input.enabled),
    phoneNumber,
    chatId: chatIds[0],
    chatIds,
    chatIntervals,
    heartbeatIntervalMinutes: Math.max(1, Number(input?.heartbeatIntervalMinutes) || defaultNotificationSettings.heartbeatIntervalMinutes),
    staleTimeoutSeconds: Math.max(5, Number(input?.staleTimeoutSeconds) || defaultNotificationSettings.staleTimeoutSeconds)
  };
}
var preferredSettingsPath;
function getPrimarySettingsPath() {
  return import_node_path.default.join(import_electron.app.getPath("userData"), "settings.json");
}
function getFallbackSettingsPath() {
  return import_node_path.default.join(import_electron.app.getPath("userData"), "settings.local.json");
}
function pickReadableSettingsPath() {
  const primary = getPrimarySettingsPath();
  const fallback = getFallbackSettingsPath();
  try {
    if (import_node_fs.default.existsSync(primary)) return primary;
  } catch {
  }
  try {
    if (import_node_fs.default.existsSync(fallback)) return fallback;
  } catch {
  }
  return primary;
}
function getSettingsPath() {
  if (preferredSettingsPath) return preferredSettingsPath;
  preferredSettingsPath = pickReadableSettingsPath();
  return preferredSettingsPath;
}
function readSettings() {
  const primary = getPrimarySettingsPath();
  const fallback = getFallbackSettingsPath();
  const tryRead = (filePath) => {
    try {
      const raw = import_node_fs.default.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (!parsed) return {};
      preferredSettingsPath = filePath;
      return {
        ...parsed,
        notifications: normalizeNotificationSettings(parsed.notifications)
      };
    } catch {
      return void 0;
    }
  };
  const first = tryRead(getSettingsPath());
  if (first) return first;
  const second = getSettingsPath() === primary ? tryRead(fallback) : tryRead(primary);
  if (second) return second;
  return {};
}
function writeSettings(next) {
  const ensureDir = (filePath) => {
    import_node_fs.default.mkdirSync(import_node_path.default.dirname(filePath), { recursive: true });
  };
  const writeToPath = (filePath) => {
    ensureDir(filePath);
    const current = readSettings();
    const merged = {
      ...current,
      ...next,
      notifications: normalizeNotificationSettings(next.notifications ?? current.notifications)
    };
    const text = JSON.stringify(merged, null, 2);
    try {
      if (import_node_fs.default.existsSync(filePath)) {
        try {
          import_node_fs.default.chmodSync(filePath, 438);
        } catch {
        }
      }
    } catch {
    }
    import_node_fs.default.writeFileSync(filePath, text, "utf8");
  };
  const primary = getPrimarySettingsPath();
  const fallback = getFallbackSettingsPath();
  const preferred = getSettingsPath();
  try {
    writeToPath(preferred);
    preferredSettingsPath = preferred;
    return;
  } catch {
  }
  const alt = preferred === primary ? fallback : primary;
  try {
    writeToPath(alt);
    preferredSettingsPath = alt;
    return;
  } catch (error) {
    preferredSettingsPath = preferred;
    throw error;
  }
}

// electron/main.ts
var serial = new SerialManager();
var notificationSettings = normalizeNotificationSettings(readSettings().notifications ?? defaultNotificationSettings);
var hasActiveCollection = false;
var lastCollectionAt;
var lastHeartbeatNotificationAtByChat = {};
var lastStopNotificationFor = 0;
var collectionFrames = [];
var lastSensorFrame;
var autoUpdateCheckTimer;
var notificationRuntimeState = {
  collectionState: "aguardando"
};
function formatDateTimePtBr(ts) {
  const formatted = new Date(ts).toLocaleString("pt-BR", { hour12: false });
  const [datePart, timePart] = formatted.split(", ");
  return { datePart: datePart ?? "--/--/----", timePart: timePart ?? "--:--:--" };
}
function formatDateTimeInlinePtBr(ts) {
  const { datePart, timePart } = formatDateTimePtBr(ts);
  return `${datePart} ${timePart}`;
}
function formatNumberPtBr(value, fractionDigits = 1) {
  if (!Number.isFinite(value)) return "--";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  });
}
function mapRange(value, inMin, inMax, outMin, outMax) {
  if (inMax === inMin) return outMin;
  const ratio = (value - inMin) / (inMax - inMin);
  return outMin + ratio * (outMax - outMin);
}
function vocToPPM(voc) {
  const vocToPpmTable = [
    { voc: 10, ppm: 370 },
    { voc: 20, ppm: 274 },
    { voc: 30, ppm: 203 },
    { voc: 40, ppm: 150 },
    { voc: 50, ppm: 112 },
    { voc: 60, ppm: 83 },
    { voc: 70, ppm: 61 },
    { voc: 80, ppm: 45 },
    { voc: 100, ppm: 25 }
  ];
  if (!Number.isFinite(voc) || voc <= 0) return 0;
  for (let i = 0; i < vocToPpmTable.length - 1; i += 1) {
    const current = vocToPpmTable[i];
    const next = vocToPpmTable[i + 1];
    if (voc >= current.voc && voc <= next.voc) {
      return Math.max(0, Math.round(mapRange(voc, current.voc, next.voc, current.ppm, next.ppm)));
    }
  }
  const first = vocToPpmTable[0];
  const second = vocToPpmTable[1];
  if (voc < first.voc) {
    return Math.max(0, Math.round(mapRange(voc, first.voc, second.voc, first.ppm, second.ppm)));
  }
  const last = vocToPpmTable[vocToPpmTable.length - 1];
  const previous = vocToPpmTable[vocToPpmTable.length - 2];
  return Math.max(0, Math.round(mapRange(voc, previous.voc, last.voc, previous.ppm, last.ppm)));
}
function getAirQualityLabelFromVoc(voc) {
  const ppm = vocToPPM(voc);
  if (ppm <= 65) return "Excelente";
  if (ppm <= 150) return "Boa";
  if (ppm <= 300) return "Moderada";
  if (ppm <= 500) return "Ruim";
  return "Muito Ruim";
}
function buildTelegramMenuMessage() {
  return [
    "\u{1F916} EVA Cortex - Menu Principal",
    "",
    "Bem-vindo ao sistema de notifica\xE7\xF5es da EVA Cortex.",
    "",
    "\u{1F4CB} Comandos dispon\xEDveis:",
    "",
    "/menu",
    "Exibe este menu de comandos.",
    "",
    "/registrar_eva",
    "Conecta sua EVA ao Telegram.",
    "",
    "/datavoc",
    "Mostra os \xFAltimos dados coletados:",
    "\u2022 VOC",
    "\u2022 Temperatura",
    "\u2022 Umidade",
    "\u2022 Qualidade do ar",
    "",
    "/notificar",
    "Configura o intervalo das notifica\xE7\xF5es.",
    "Exemplo:",
    "5 min, 15 min, 30 min, 60 min.",
    "",
    "/backup",
    "Solicita o \xFAltimo backup dispon\xEDvel da coleta.",
    "",
    "/print",
    "Envia uma captura da tela atual da EVA.",
    "",
    "\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501",
    "",
    "\u{1F4CA} Status do monitoramento:",
    "Use /datavoc para consultar os dados atuais.",
    "",
    "\u{1F514} Notifica\xE7\xF5es:",
    "Use /notificar para escolher o intervalo dos avisos.",
    "",
    "\u{1F6E0} EVA Cortex",
    "Monitoramento Inteligente da Qualidade do Ar."
  ].join("\n");
}
function buildTelegramVocDataMessage() {
  if (!lastSensorFrame) {
    return "\u{1F4BE} Dados:\nNenhum dado de coleta foi recebido ainda.";
  }
  const vocInterno = lastSensorFrame.vocInternoCorrigido;
  const vocExterno = lastSensorFrame.vocExternoCorrigido;
  const ppmInterno = vocToPPM(vocInterno);
  const ppmExterno = vocToPPM(vocExterno);
  const qualidadeInterna = getAirQualityLabelFromVoc(vocInterno);
  const qualidadeExterna = getAirQualityLabelFromVoc(vocExterno);
  return [
    "\u{1F4BE} Dados:",
    `Voc interno: ${formatNumberPtBr(vocInterno, 1)}`,
    `ppm interno: ${ppmInterno}`,
    `Temperatura interna: ${formatNumberPtBr(lastSensorFrame.tempInterno, 1)} \xB0C`,
    `Umidade: ${formatNumberPtBr(lastSensorFrame.humInterno, 0)}`,
    `Qualidade do ar: ${qualidadeInterna}`,
    "",
    "---------------",
    `Voc externo: ${formatNumberPtBr(vocExterno, 1)}`,
    `ppm externo: ${ppmExterno}`,
    `Temperatura externa: ${formatNumberPtBr(lastSensorFrame.tempExterno, 1)} \xB0C`,
    `Umidade: ${formatNumberPtBr(lastSensorFrame.humExterno, 0)}`,
    `Qualidade do ar: ${qualidadeExterna}`
  ].join("\n");
}
function getBackupDirectory() {
  return import_node_path2.default.join(import_electron2.app.getPath("documents"), "EVA Cortex", "backups");
}
function buildBackupCsvText(rows) {
  const delimiter = ";";
  const escapeCsv = (value) => {
    const needsQuotes = value.includes('"') || value.includes("\n") || value.includes("\r") || value.includes(delimiter);
    const escaped = value.replaceAll('"', '""');
    return needsQuotes ? `"${escaped}"` : escaped;
  };
  const fmt1 = (n) => Number.isFinite(n) ? n.toFixed(1).replace(".", ",") : "";
  const fmt0 = (n) => Number.isFinite(n) ? Math.round(n).toString() : "";
  const header = [
    "timestamp_iso",
    "tempInterno_c",
    "humInterno_pct",
    "pressInterno_hpa",
    "vocInternoReal_kohm",
    "vocInterno_kohm",
    "tempExterno_c",
    "humExterno_pct",
    "pressExterno_hpa",
    "vocExternoReal_kohm",
    "vocExterno_kohm",
    "raw"
  ].join(delimiter);
  const lines = rows.map(
    (r) => [
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
      escapeCsv(String(r.raw ?? ""))
    ].join(delimiter)
  );
  const firstRow = rows[0];
  const lastRow = rows[rows.length - 1];
  const metadata = [
    "sep=;",
    ["tipo", "backup_automatico"].join(delimiter),
    ["primeiro_dado_iso", escapeCsv(firstRow ? new Date(firstRow.receivedAt).toISOString() : "")].join(delimiter),
    ["ultimo_dado_iso", escapeCsv(lastRow ? new Date(lastRow.receivedAt).toISOString() : "")].join(delimiter),
    ["total_registros", String(rows.length)].join(delimiter),
    ""
  ];
  return [...metadata, header, ...lines].join("\r\n");
}
function saveAutomaticBackup(rows, stoppedAt) {
  if (rows.length === 0) {
    return { ok: false, error: "Nenhum dado dispon\xEDvel para backup." };
  }
  const backupDir = getBackupDirectory();
  const timestamp = new Date(stoppedAt).toISOString().replace(/[:.]/g, "-");
  const filePath = import_node_path2.default.join(backupDir, `backup_automatico_${timestamp}.csv`);
  import_node_fs2.default.mkdirSync(backupDir, { recursive: true });
  import_node_fs2.default.writeFileSync(filePath, buildBackupCsvText(rows), "utf8");
  return { ok: true, filePath };
}
function saveRequestedBackup(rows, requestedAt) {
  if (rows.length === 0) {
    return { ok: false, error: "Nenhum dado dispon\xEDvel para backup." };
  }
  const backupDir = getBackupDirectory();
  const timestamp = new Date(requestedAt).toISOString().replace(/[:.]/g, "-");
  const filePath = import_node_path2.default.join(backupDir, `backup_solicitado_${timestamp}.csv`);
  import_node_fs2.default.mkdirSync(backupDir, { recursive: true });
  import_node_fs2.default.writeFileSync(filePath, buildBackupCsvText(rows), "utf8");
  return { ok: true, filePath };
}
function findLatestBackupFile() {
  const backupDir = getBackupDirectory();
  if (!import_node_fs2.default.existsSync(backupDir)) return void 0;
  const latest = import_node_fs2.default.readdirSync(backupDir).filter((fileName) => fileName.toLowerCase().endsWith(".csv")).map((fileName) => {
    const filePath = import_node_path2.default.join(backupDir, fileName);
    const stats = import_node_fs2.default.statSync(filePath);
    return { filePath, mtimeMs: stats.mtimeMs };
  }).sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
  return latest?.filePath;
}
function normalizePhoneNumber(value) {
  return String(value ?? "").replace(/[^\d+]/g, "");
}
function getTelegramSecret() {
  try {
    const userDataSecretPath = import_node_path2.default.join(import_electron2.app.getPath("userData"), "telegram.secret.json");
    const candidatePaths = Array.from(
      /* @__PURE__ */ new Set([
        userDataSecretPath,
        import_node_path2.default.join(process.resourcesPath, "telegram.secret.json"),
        import_node_path2.default.join(import_electron2.app.getAppPath(), "telegram.secret.json"),
        import_node_path2.default.join(import_node_path2.default.dirname(import_electron2.app.getPath("exe")), "resources", "telegram.secret.json")
      ])
    );
    for (const secretPath of candidatePaths) {
      if (!import_node_fs2.default.existsSync(secretPath)) continue;
      const raw = import_node_fs2.default.readFileSync(secretPath, "utf8");
      const parsed = JSON.parse(raw);
      return {
        token: String(parsed?.token ?? "").trim(),
        chatId: String(parsed?.chatId ?? "").trim(),
        linkCode: String(parsed?.linkCode ?? "").trim()
      };
    }
    return { token: "", chatId: "" };
  } catch {
    return { token: "", chatId: "" };
  }
}
function ensureTelegramSecretInUserData() {
  try {
    const userDataSecretPath = import_node_path2.default.join(import_electron2.app.getPath("userData"), "telegram.secret.json");
    if (import_node_fs2.default.existsSync(userDataSecretPath)) return;
    const resourcesSecretPath = import_node_path2.default.join(process.resourcesPath, "telegram.secret.json");
    if (!import_node_fs2.default.existsSync(resourcesSecretPath)) return;
    import_node_fs2.default.mkdirSync(import_node_path2.default.dirname(userDataSecretPath), { recursive: true });
    import_node_fs2.default.copyFileSync(resourcesSecretPath, userDataSecretPath);
  } catch {
  }
}
function normalizeLinkCode(value) {
  return String(value ?? "").trim().toUpperCase();
}
function getTelegramLinkCode() {
  const envCode = String(process.env.EVA_TELEGRAM_LINK_CODE ?? "").trim();
  if (envCode) return normalizeLinkCode(envCode);
  const secret = getTelegramSecret();
  if (secret.linkCode) return normalizeLinkCode(secret.linkCode);
  return "EVA";
}
function getTelegramBotToken() {
  const secretToken = getTelegramSecret().token;
  if (import_electron2.app.isPackaged) {
    return secretToken;
  }
  const envToken = String(process.env.EVA_TELEGRAM_BOT_TOKEN ?? "").trim();
  if (envToken) {
    return envToken;
  }
  return secretToken;
}
function getTelegramDefaultChatId() {
  return getTelegramSecret().chatId;
}
function getLinkedChatIds(settings = notificationSettings) {
  return Array.from(
    new Set(
      [settings.chatId, ...settings.chatIds ?? []].map((value) => String(value ?? "").trim()).filter(Boolean)
    )
  );
}
function withLinkedChatId(settings, chatId) {
  const normalizedChatId = String(chatId ?? "").trim();
  const chatIds = Array.from(new Set([...getLinkedChatIds(settings), normalizedChatId].filter(Boolean)));
  return normalizeNotificationSettings({
    ...settings,
    chatId: chatIds[0],
    chatIds,
    enabled: chatIds.length > 0
  });
}
function getChatIntervalMap(settings = notificationSettings) {
  const fallbackInterval = Math.max(1, Math.min(60, Number(settings.heartbeatIntervalMinutes) || 60));
  const entries = Object.entries(settings.chatIntervals ?? {}).map(([chatId, minutes]) => [
    String(chatId ?? "").trim(),
    Math.max(1, Math.min(60, Number(minutes) || fallbackInterval))
  ]);
  return Object.fromEntries(entries.filter(([chatId]) => Boolean(chatId)));
}
function getHeartbeatIntervalForChat(chatId, settings = notificationSettings) {
  const normalizedChatId = String(chatId ?? "").trim();
  const chatIntervals = getChatIntervalMap(settings);
  return Math.max(1, Math.min(60, Number(chatIntervals[normalizedChatId]) || Number(settings.heartbeatIntervalMinutes) || 60));
}
function syncHeartbeatRecipients(baseTs) {
  const linkedChatIds = getLinkedChatIds(notificationSettings);
  const nextMap = {};
  for (const chatId of linkedChatIds) {
    nextMap[chatId] = lastHeartbeatNotificationAtByChat[chatId] ?? baseTs ?? 0;
  }
  lastHeartbeatNotificationAtByChat = nextMap;
}
async function sendTelegramMessage(text, chatId) {
  const token = getTelegramBotToken();
  if (!token) {
    throw new Error("Token do Telegram nao configurado.");
  }
  const targetChatId = String(chatId ?? "").trim();
  if (!targetChatId) {
    throw new Error("Nenhum chat do Telegram vinculado.");
  }
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: targetChatId,
      text
    })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.ok === false) {
    const description = payload && "description" in payload && payload.description ? payload.description : `Falha HTTP ${response.status}`;
    const code = payload && "error_code" in payload && payload.error_code ? ` (${payload.error_code})` : "";
    throw new Error(`${description}${code}`);
  }
}
async function sendTelegramFile(method, fieldName, filePath, chatId, caption) {
  const token = getTelegramBotToken();
  if (!token) {
    throw new Error("Token do Telegram nao configurado.");
  }
  const targetChatId = String(chatId ?? "").trim();
  if (!targetChatId) {
    throw new Error("Nenhum chat do Telegram vinculado.");
  }
  const fileBuffer = import_node_fs2.default.readFileSync(filePath);
  const form = new FormData();
  form.set("chat_id", targetChatId);
  if (caption) {
    form.set("caption", caption);
  }
  form.append(fieldName, new Blob([fileBuffer]), import_node_path2.default.basename(filePath));
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const response = await fetch(url, {
    method: "POST",
    body: form
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.ok === false) {
    const description = payload && "description" in payload && payload.description ? payload.description : `Falha HTTP ${response.status}`;
    const code = payload && "error_code" in payload && payload.error_code ? ` (${payload.error_code})` : "";
    throw new Error(`${description}${code}`);
  }
}
var telegramUpdatesOffset = 0;
async function handleTelegramDatavocCommand(chatId) {
  await sendTelegramMessage(buildTelegramVocDataMessage(), chatId);
}
async function handleTelegramMenuCommand(chatId) {
  await sendTelegramMessage(buildTelegramMenuMessage(), chatId);
}
async function handleTelegramNotifyCommand(chatId, intervalMinutes) {
  if (!intervalMinutes) {
    await sendTelegramMessage(
      "\u{1F514} Defina seu intervalo individual de notifica\xE7\xF5es.\nUse qualquer valor entre 1 e 60 minutos.\n\nExemplos:\n\u2022 /notificar 5 min\n\u2022 /notificar 15 min\n\u2022 /notificar 30 min\n\u2022 /notificar 60 min",
      chatId
    );
    return;
  }
  if (!Number.isFinite(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 60) {
    await sendTelegramMessage(
      "Intervalo inv\xE1lido. Use um valor entre 1 e 60 minutos.",
      chatId
    );
    return;
  }
  const chatIntervals = {
    ...getChatIntervalMap(notificationSettings),
    [chatId]: Math.round(intervalMinutes)
  };
  notificationSettings = normalizeNotificationSettings({
    ...notificationSettings,
    chatIntervals,
    enabled: getLinkedChatIds(notificationSettings).length > 0
  });
  lastHeartbeatNotificationAtByChat[chatId] = lastCollectionAt ?? Date.now();
  writeSettings({ notifications: notificationSettings });
  publishNotificationSettings();
  publishNotificationRuntimeState();
  await sendTelegramMessage(`\u{1F514} Intervalo atualizado com sucesso.
Suas notifica\xE7\xF5es peri\xF3dicas ser\xE3o enviadas a cada ${Math.round(intervalMinutes)} minutos.`, chatId);
}
async function handleTelegramBackupCommand(chatId) {
  let filePath = findLatestBackupFile();
  if (!filePath && collectionFrames.length > 0) {
    const created = saveRequestedBackup(collectionFrames, Date.now());
    if (created.ok) {
      filePath = created.filePath;
    }
  }
  if (!filePath) {
    await sendTelegramMessage("Nenhum backup dispon\xEDvel no momento.", chatId);
    return;
  }
  const stats = import_node_fs2.default.statSync(filePath);
  const caption = `\u{1F4BE} Backup da coleta
Arquivo: ${import_node_path2.default.basename(filePath)}
Data: ${formatDateTimeInlinePtBr(stats.mtimeMs)}`;
  await sendTelegramFile("sendDocument", "document", filePath, chatId, caption);
}
async function handleTelegramPrintCommand(chatId) {
  const win = getMainWindow();
  if (!win) {
    await sendTelegramMessage("Nao foi possivel capturar a tela da EVA neste momento.", chatId);
    return;
  }
  await prepareWindowForPrintCapture(win, lastSensorFrame);
  const image = await win.webContents.capturePage();
  const screenshotDir = import_node_path2.default.join(import_electron2.app.getPath("temp"), "eva-cortex");
  const screenshotPath = import_node_path2.default.join(screenshotDir, `print_eva_${Date.now()}.png`);
  import_node_fs2.default.mkdirSync(screenshotDir, { recursive: true });
  import_node_fs2.default.writeFileSync(screenshotPath, image.toPNG());
  try {
    const captureAt = Date.now();
    const latestDataText = lastSensorFrame ? `
Ultimo dado: ${formatDateTimeInlinePtBr(lastSensorFrame.receivedAt)}` : "";
    await sendTelegramFile(
      "sendPhoto",
      "photo",
      screenshotPath,
      chatId,
      `\u{1F5BC} Captura atual da EVA
Data: ${formatDateTimeInlinePtBr(captureAt)}${latestDataText}`
    );
  } finally {
    win.webContents.send("dashboard:finish-print");
    try {
      import_node_fs2.default.unlinkSync(screenshotPath);
    } catch {
    }
  }
}
function parseTelegramRegisterCode(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === "/registrar_eva" || lower.startsWith("/registrar_eva@")) {
    return { code: "EVA" };
  }
  if (lower === "/registrar" || lower.startsWith("/registrar@")) {
    return { code: "" };
  }
  if (lower.startsWith("/registrar ")) {
    const parts = raw.split(/\s+/).filter(Boolean);
    const code = parts[1] ?? "";
    return { code };
  }
  return null;
}
function parseTelegramNotifyInterval(text) {
  const raw = String(text ?? "").trim();
  const match = raw.match(/^\/notificar(?:@\w+)?(?:\s+(\d+))?(?:\s*(?:min|minuto|minutos))?$/i);
  if (!match) return null;
  const minutesText = String(match[1] ?? "").trim();
  return { minutes: minutesText ? Number(minutesText) : void 0 };
}
async function handleTelegramRegisterCommand(chatId, providedCode) {
  const expectedCode = getTelegramLinkCode();
  const normalizedProvided = normalizeLinkCode(providedCode);
  if (!normalizedProvided) {
    await sendTelegramMessage(`Use: /registrar ${expectedCode}`, chatId);
    return;
  }
  if (normalizedProvided !== expectedCode) {
    await sendTelegramMessage(`C\xF3digo inv\xE1lido. Use: /registrar ${expectedCode}`, chatId);
    return;
  }
  const nextSettings = withLinkedChatId(
    normalizeNotificationSettings({
      ...notificationSettings,
      phoneNumber: ""
    }),
    chatId
  );
  notificationSettings = nextSettings;
  writeSettings({ notifications: notificationSettings });
  publishNotificationSettings();
  publishNotificationRuntimeState();
  await sendTelegramMessage(`\u2705 EVA Cortex
Vincula\xE7\xE3o conclu\xEDda.

C\xF3digo: ${expectedCode}`, chatId);
  if (hasActiveCollection && lastCollectionAt) {
    notifyCollectionResumedForNewRecipient(lastCollectionAt, chatId);
  }
}
async function pollTelegramUpdates() {
  const token = getTelegramBotToken();
  if (!token) return;
  const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${telegramUpdatesOffset}&timeout=0`;
  const response = await fetch(url).catch(() => null);
  if (!response || !response.ok) return;
  const payload = await response.json().catch(() => null);
  if (!payload || !("ok" in payload) || !payload.ok) return;
  const updates = payload.result ?? [];
  for (const update of updates) {
    telegramUpdatesOffset = Math.max(telegramUpdatesOffset, update.update_id + 1);
    const contactPhone = update.message?.contact?.phone_number;
    const chatId = update.message?.chat?.id;
    const rawText = String(update.message?.text ?? "").trim();
    const text = rawText.toLowerCase();
    const chatIdText = chatId === void 0 || chatId === null ? "" : String(chatId);
    const linkedChatIds = getLinkedChatIds(notificationSettings);
    const register = parseTelegramRegisterCode(rawText);
    if (register && chatId !== void 0 && chatId !== null) {
      await handleTelegramRegisterCommand(chatIdText, register.code).catch(() => {
      });
      continue;
    }
    if ((text === "/menu" || text.startsWith("/menu@")) && chatId !== void 0 && chatId !== null) {
      await handleTelegramMenuCommand(chatIdText).catch(() => {
      });
      continue;
    }
    const notifyCommand = parseTelegramNotifyInterval(rawText);
    if (notifyCommand && chatId !== void 0 && chatId !== null) {
      if (!linkedChatIds.includes(chatIdText)) {
        await sendTelegramMessage("Nao vinculado. Envie /registrar EVA para conectar sua EVA ao Telegram.", chatIdText).catch(() => {
        });
        continue;
      }
      await handleTelegramNotifyCommand(chatIdText, notifyCommand.minutes).catch(() => {
      });
      continue;
    }
    if (text.startsWith("/datavoc")) {
      if (chatId !== void 0 && chatId !== null && linkedChatIds.includes(chatIdText)) {
        await handleTelegramDatavocCommand(chatIdText).catch(() => {
        });
      }
      continue;
    }
    if (text.startsWith("/backup")) {
      if (chatId !== void 0 && chatId !== null && linkedChatIds.includes(chatIdText)) {
        await handleTelegramBackupCommand(chatIdText).catch(() => {
        });
      }
      continue;
    }
    if (text.startsWith("/print")) {
      if (chatId !== void 0 && chatId !== null && linkedChatIds.includes(chatIdText)) {
        await handleTelegramPrintCommand(chatIdText).catch(() => {
        });
      }
      continue;
    }
    if (!notificationSettings.phoneNumber) continue;
    if (!contactPhone || chatId === void 0 || chatId === null) continue;
    const savedPhone = normalizePhoneNumber(notificationSettings.phoneNumber);
    const incomingPhone = normalizePhoneNumber(contactPhone);
    if (!savedPhone || !incomingPhone) continue;
    if (savedPhone !== incomingPhone && !incomingPhone.endsWith(savedPhone.replace(/^\+/, ""))) continue;
    const nextSettings = withLinkedChatId(notificationSettings, chatIdText);
    notificationSettings = nextSettings;
    lastHeartbeatNotificationAtByChat[chatIdText] = lastCollectionAt ?? Date.now();
    writeSettings({ notifications: notificationSettings });
    publishNotificationSettings();
    publishNotificationRuntimeState();
    if (hasActiveCollection && lastCollectionAt) {
      notifyCollectionResumedForNewRecipient(lastCollectionAt, chatIdText);
    }
    break;
  }
}
async function sendTrackedNotification(kind, text, settingsOverride = notificationSettings) {
  try {
    const token = getTelegramBotToken();
    if (!token) {
      throw new Error("Token do Telegram nao configurado.");
    }
    const chatIds = getLinkedChatIds(settingsOverride);
    if (chatIds.length === 0) {
      throw new Error("Nao vinculado. Abra o bot no Telegram e envie /registrar EVA.");
    }
    if (kind !== "teste" && !settingsOverride.enabled) {
      throw new Error("Notificacoes desativadas.");
    }
    await Promise.all(chatIds.map((chatId) => sendTelegramMessage(text, chatId)));
    publishNotificationRuntimeState({
      lastSentAt: Date.now(),
      lastSentKind: kind,
      lastErrorAt: void 0,
      lastErrorMessage: void 0
    });
  } catch (error) {
    publishNotificationRuntimeState({
      lastErrorAt: Date.now(),
      lastErrorMessage: error instanceof Error ? error.message : "Falha ao enviar notificacao."
    });
    throw error;
  }
}
function notifyCollectionStarted(ts) {
  const dateTimeText = formatDateTimeInlinePtBr(ts);
  sendTrackedNotification(
    "inicio",
    `\u{1F7E2} EVA Cortex
A coleta foi iniciada.

Data: ${dateTimeText}`
  ).catch(() => {
  });
}
function notifyCollectionHeartbeat(ts, chatId) {
  const intervalMinutes = getHeartbeatIntervalForChat(chatId);
  sendTelegramMessage(`\u{1F4CA} Atualiza\xE7\xE3o peri\xF3dica
Coleta em andamento.

Pr\xF3xima atualiza\xE7\xE3o em ${intervalMinutes} minutos.`, chatId).then(() => {
    publishNotificationRuntimeState({
      lastSentAt: Date.now(),
      lastSentKind: "intervalo",
      lastErrorAt: void 0,
      lastErrorMessage: void 0
    });
  }).catch((error) => {
    publishNotificationRuntimeState({
      lastErrorAt: Date.now(),
      lastErrorMessage: error instanceof Error ? error.message : "Falha ao enviar notificacao."
    });
  });
}
function notifyCollectionStopped(ts, backupResult) {
  const { datePart, timePart } = formatDateTimePtBr(ts);
  const backupText = backupResult.ok ? "Foi realizado um backup automatico por interrupi\xE7\xE3o!" : `Falha no backup automatico por interrupi\xE7\xE3o: ${backupResult.error}`;
  sendTrackedNotification(
    "parada",
    `\u{1F534}Coleta interrompida
A coleta foi interrompida.

\xDAltima coleta registrada:
${datePart} \xE0s ${timePart}.

${backupText}`
  ).catch(() => {
  });
}
function notifyCollectionResumedForNewRecipient(ts, chatId) {
  const { datePart, timePart } = formatDateTimePtBr(ts);
  const text = `\u{1F7E2} EVA Cortex
A coleta j\xE1 est\xE1 em andamento.

\xDAltima coleta registrada:
${datePart} \xE0s ${timePart}.`;
  if (chatId) {
    lastHeartbeatNotificationAtByChat[chatId] = ts;
    sendTelegramMessage(text, chatId).catch(() => {
    });
    return;
  }
  sendTrackedNotification("reativacao", text).catch(() => {
  });
}
function resolvePreloadPath() {
  return import_node_path2.default.join(import_electron2.app.getAppPath(), "dist-electron", "preload.cjs");
}
function resolveRendererIndexPath() {
  return import_node_path2.default.join(import_electron2.app.getAppPath(), "dist", "renderer", "index.html");
}
function resolveAppIconPath() {
  return import_node_path2.default.join(import_electron2.app.getAppPath(), "Logo.png");
}
function computeNextNotificationAt() {
  if (!notificationSettings.enabled || getLinkedChatIds(notificationSettings).length === 0) return void 0;
  if (!hasActiveCollection || !lastCollectionAt) return void 0;
  const timeoutMs = notificationSettings.staleTimeoutSeconds * 1e3;
  if (Date.now() - lastCollectionAt >= timeoutMs) return void 0;
  const nextValues = getLinkedChatIds(notificationSettings).map((chatId) => {
    const lastSentAt = lastHeartbeatNotificationAtByChat[chatId];
    if (!lastSentAt || lastSentAt <= 0) return void 0;
    return lastSentAt + getHeartbeatIntervalForChat(chatId) * 60 * 1e3;
  }).filter((value) => Boolean(value));
  if (nextValues.length === 0) return void 0;
  return Math.min(...nextValues);
}
function publishNotificationRuntimeState(partial) {
  notificationRuntimeState = {
    ...notificationRuntimeState,
    ...partial,
    nextNotificationAt: computeNextNotificationAt()
  };
  broadcast("notifications:runtimeState", notificationRuntimeState);
}
function publishNotificationSettings() {
  broadcast("notifications:settings", notificationSettings);
}
function broadcast(channel, payload) {
  for (const win of import_electron2.BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload);
  }
}
function getMainWindow() {
  return import_electron2.BrowserWindow.getAllWindows()[0];
}
async function prepareWindowForPrintCapture(win, frame) {
  if (win.isMinimized()) {
    win.restore();
  }
  if (!win.isVisible()) {
    win.show();
  }
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      import_electron2.ipcMain.removeListener("dashboard:print-ready", onReady);
      resolve();
    };
    const onReady = (event) => {
      if (event.sender.id !== win.webContents.id) return;
      finish();
    };
    const timeoutId = setTimeout(finish, 1500);
    import_electron2.ipcMain.on("dashboard:print-ready", onReady);
    win.webContents.send("dashboard:prepare-print", frame);
  });
  win.webContents.invalidate();
  await new Promise((resolve) => setTimeout(resolve, 120));
}
function configureAutoUpdater() {
  if (!import_electron2.app.isPackaged || process.platform !== "win32") return;
  import_electron_updater.autoUpdater.autoDownload = true;
  import_electron_updater.autoUpdater.autoInstallOnAppQuit = true;
  import_electron_updater.autoUpdater.on("error", (error) => {
    console.error("Falha no auto update:", error);
  });
  import_electron_updater.autoUpdater.on("update-available", () => {
    import_electron2.dialog.showMessageBox(getMainWindow(), {
      type: "info",
      title: "Atualiza\xE7\xE3o dispon\xEDvel",
      message: "Uma nova vers\xE3o do EVA Cortex foi encontrada.",
      detail: "O download ser\xE1 feito automaticamente em segundo plano.",
      buttons: ["OK"]
    }).catch(() => {
    });
  });
  import_electron_updater.autoUpdater.on("update-downloaded", () => {
    import_electron2.dialog.showMessageBox(getMainWindow(), {
      type: "question",
      title: "Atualiza\xE7\xE3o pronta",
      message: "A nova vers\xE3o do EVA Cortex j\xE1 foi baixada.",
      detail: 'Clique em "Reiniciar agora" para instalar a atualiza\xE7\xE3o.',
      buttons: ["Reiniciar agora", "Depois"],
      defaultId: 0,
      cancelId: 1
    }).then(({ response }) => {
      if (response === 0) {
        import_electron_updater.autoUpdater.quitAndInstall();
      }
    }).catch(() => {
    });
  });
  const checkForUpdates = () => {
    import_electron_updater.autoUpdater.checkForUpdates().catch((error) => {
      console.error("Falha ao verificar atualiza\xE7\xF5es:", error);
    });
  };
  checkForUpdates();
  autoUpdateCheckTimer = setInterval(checkForUpdates, 30 * 60 * 1e3);
}
function createWindow() {
  const win = new import_electron2.BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#f6f7fb",
    icon: resolveAppIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: resolvePreloadPath()
    },
    title: "Dashboard Qualidade do Ar"
  });
  if (import_electron2.app.isPackaged) {
    win.loadFile(resolveRendererIndexPath());
  } else {
    win.loadURL("http://localhost:5173/");
  }
  win.removeMenu();
  win.setMenuBarVisibility(false);
  return win;
}
function registerIpc() {
  import_electron2.ipcMain.handle("serial:listPorts", async () => {
    return serial.listPorts();
  });
  import_electron2.ipcMain.handle("serial:getStatus", async () => {
    return serial.getStatus();
  });
  import_electron2.ipcMain.handle("serial:getLastPort", async () => {
    return readSettings().lastPortPath;
  });
  import_electron2.ipcMain.handle("notifications:getSettings", async () => {
    return notificationSettings;
  });
  import_electron2.ipcMain.handle("notifications:getRuntimeState", async () => {
    return notificationRuntimeState;
  });
  import_electron2.ipcMain.handle("notifications:saveSettings", async (_event, nextSettings) => {
    try {
      const previousSettings = notificationSettings;
      const normalizedNext = normalizeNotificationSettings(nextSettings);
      const phoneChanged = normalizePhoneNumber(previousSettings.phoneNumber) !== normalizePhoneNumber(normalizedNext.phoneNumber);
      notificationSettings = normalizeNotificationSettings({
        ...normalizedNext,
        chatId: phoneChanged ? previousSettings.chatId : normalizedNext.chatId,
        chatIds: phoneChanged ? previousSettings.chatIds : normalizedNext.chatIds,
        chatIntervals: previousSettings.chatIntervals,
        enabled: phoneChanged ? previousSettings.enabled : normalizedNext.enabled
      });
      syncHeartbeatRecipients(lastCollectionAt ?? Date.now());
      writeSettings({ notifications: notificationSettings });
      publishNotificationSettings();
      publishNotificationRuntimeState();
      const recipientChanged = getLinkedChatIds(previousSettings).join("|") !== getLinkedChatIds(notificationSettings).join("|");
      const justEnabled = !previousSettings.enabled && notificationSettings.enabled;
      if ((recipientChanged || justEnabled) && hasActiveCollection && lastCollectionAt) {
        notifyCollectionResumedForNewRecipient(lastCollectionAt);
      }
      return notificationSettings;
    } catch (error) {
      publishNotificationRuntimeState({
        lastErrorAt: Date.now(),
        lastErrorMessage: error instanceof Error ? error.message : "Falha ao salvar configuracoes de notificacao."
      });
      throw new Error(error instanceof Error ? error.message : "Falha ao salvar as configuracoes de notificacao.");
    }
  });
  import_electron2.ipcMain.handle("notifications:testNotification", async (_event, nextSettings) => {
    try {
      const settingsToTest = normalizeNotificationSettings(nextSettings);
      await sendTrackedNotification(
        "teste",
        "EVA Dashboard: esta e uma notificacao de teste do Telegram.",
        { ...settingsToTest, enabled: true }
      );
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Falha ao enviar notificacao de teste." };
    }
  });
  import_electron2.ipcMain.handle("serial:connect", async (_event, portPath) => {
    writeSettings({ lastPortPath: portPath });
    await serial.connect(portPath);
    return true;
  });
  import_electron2.ipcMain.handle("serial:disconnect", async () => {
    await serial.disconnect();
    return true;
  });
  import_electron2.ipcMain.handle("data:exportCsv", async (_event, csvText) => {
    const { canceled, filePath } = await import_electron2.dialog.showSaveDialog({
      title: "Exportar CSV",
      defaultPath: `voc_${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }]
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    import_node_fs2.default.writeFileSync(filePath, csvText, "utf8");
    return { ok: true, filePath };
  });
  import_electron2.ipcMain.handle("data:backupCsv", async (_event, csvText) => {
    const { canceled, filePath } = await import_electron2.dialog.showSaveDialog({
      title: "Salvar backup completo",
      defaultPath: `backup_voc_${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }]
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    import_node_fs2.default.writeFileSync(filePath, csvText, "utf8");
    return { ok: true, filePath };
  });
}
async function tryAutoConnect() {
  const settings = readSettings();
  const ports = await serial.listPorts().catch(() => []);
  const wanted = settings.lastPortPath;
  if (wanted && ports.some((p) => p.path === wanted)) {
    serial.connect(wanted).catch(() => {
    });
    return;
  }
  if (ports.length === 1) {
    serial.connect(ports[0].path).catch(() => {
    });
  }
}
serial.on("status", (status) => {
  broadcast("serial:status", status);
});
serial.on("frame", (frame) => {
  lastCollectionAt = frame.receivedAt;
  lastSensorFrame = frame;
  if (!hasActiveCollection) {
    collectionFrames = [frame];
    hasActiveCollection = true;
    syncHeartbeatRecipients(frame.receivedAt);
    lastStopNotificationFor = 0;
    publishNotificationRuntimeState({ collectionState: "coletando" });
    notifyCollectionStarted(frame.receivedAt);
  } else {
    collectionFrames.push(frame);
    syncHeartbeatRecipients(lastCollectionAt);
    for (const chatId of getLinkedChatIds(notificationSettings)) {
      const lastSentAt = lastHeartbeatNotificationAtByChat[chatId] ?? frame.receivedAt;
      const heartbeatIntervalMs = getHeartbeatIntervalForChat(chatId) * 60 * 1e3;
      if (frame.receivedAt - lastSentAt >= heartbeatIntervalMs) {
        lastHeartbeatNotificationAtByChat[chatId] = frame.receivedAt;
        notifyCollectionHeartbeat(frame.receivedAt, chatId);
      }
    }
    publishNotificationRuntimeState({ collectionState: "coletando" });
  }
  broadcast("serial:frame", frame);
});
serial.on("rawLine", (line) => {
  broadcast("serial:rawLine", line);
});
import_electron2.app.whenReady().then(async () => {
  ensureTelegramSecretInUserData();
  registerIpc();
  createWindow();
  configureAutoUpdater();
  await tryAutoConnect();
  const hasPhone = Boolean(notificationSettings.phoneNumber && notificationSettings.phoneNumber.trim());
  if (!hasPhone && getLinkedChatIds(notificationSettings).length === 0) {
    const defaultChatId = getTelegramDefaultChatId();
    if (defaultChatId) {
      notificationSettings = withLinkedChatId(notificationSettings, defaultChatId);
      writeSettings({ notifications: notificationSettings });
      publishNotificationSettings();
    }
  }
  publishNotificationSettings();
  publishNotificationRuntimeState();
  setInterval(() => {
    pollTelegramUpdates().catch(() => {
    });
  }, 3e3);
  setInterval(() => {
    if (!hasActiveCollection || !lastCollectionAt) return;
    const timeoutMs = notificationSettings.staleTimeoutSeconds * 1e3;
    if (Date.now() - lastCollectionAt < timeoutMs) return;
    if (lastStopNotificationFor === lastCollectionAt) return;
    lastStopNotificationFor = lastCollectionAt;
    hasActiveCollection = false;
    lastHeartbeatNotificationAtByChat = {};
    publishNotificationRuntimeState({ collectionState: "parada" });
    const backupResult = (() => {
      try {
        return saveAutomaticBackup(collectionFrames, lastCollectionAt);
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Falha ao salvar o arquivo de backup."
        };
      }
    })();
    notifyCollectionStopped(lastCollectionAt, backupResult);
  }, 1e3);
  import_electron2.app.on("activate", () => {
    if (import_electron2.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
import_electron2.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") import_electron2.app.quit();
});
import_electron2.app.on("before-quit", () => {
  if (autoUpdateCheckTimer) {
    clearInterval(autoUpdateCheckTimer);
    autoUpdateCheckTimer = void 0;
  }
});
//# sourceMappingURL=main.cjs.map