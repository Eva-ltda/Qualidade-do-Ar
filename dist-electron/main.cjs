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
      const frame = this.parseFrame(trimmed);
      if (!frame) return;
      const now = Date.now();
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
    const nums = parts.slice(0, 8).map((p) => Number(p));
    if (nums.some((n) => Number.isNaN(n))) return null;
    return {
      tempInterno: nums[0],
      humInterno: nums[1],
      pressInterno: nums[2],
      vocInterno: nums[3],
      tempExterno: nums[4],
      humExterno: nums[5],
      pressExterno: nums[6],
      vocExterno: nums[7],
      raw: rawLine
    };
  }
};

// electron/settings.ts
var import_node_fs = __toESM(require("fs"), 1);
var import_node_path = __toESM(require("path"), 1);
var import_electron = require("electron");
function getSettingsPath() {
  return import_node_path.default.join(import_electron.app.getPath("userData"), "settings.json");
}
function readSettings() {
  try {
    const filePath = getSettingsPath();
    const raw = import_node_fs.default.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed ?? {};
  } catch {
    return {};
  }
}
function writeSettings(next) {
  const filePath = getSettingsPath();
  import_node_fs.default.mkdirSync(import_node_path.default.dirname(filePath), { recursive: true });
  import_node_fs.default.writeFileSync(filePath, JSON.stringify(next, null, 2), "utf8");
}

// electron/main.ts
var serial = new SerialManager();
function resolvePreloadPath() {
  return import_node_path2.default.join(import_electron2.app.getAppPath(), "dist-electron", "preload.cjs");
}
function resolveRendererIndexPath() {
  return import_node_path2.default.join(import_electron2.app.getAppPath(), "dist", "renderer", "index.html");
}
function broadcast(channel, payload) {
  for (const win of import_electron2.BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload);
  }
}
function createWindow() {
  const win = new import_electron2.BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#f6f7fb",
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
    win.webContents.openDevTools({ mode: "detach" });
  }
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
  broadcast("serial:frame", frame);
});
import_electron2.app.whenReady().then(async () => {
  registerIpc();
  createWindow();
  await tryAutoConnect();
  import_electron2.app.on("activate", () => {
    if (import_electron2.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
import_electron2.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") import_electron2.app.quit();
});
//# sourceMappingURL=main.cjs.map