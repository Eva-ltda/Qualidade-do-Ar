// electron/preload.ts
var import_electron = require("electron");
var api = {
  listPorts() {
    return import_electron.ipcRenderer.invoke("serial:listPorts");
  },
  getStatus() {
    return import_electron.ipcRenderer.invoke("serial:getStatus");
  },
  getLastPort() {
    return import_electron.ipcRenderer.invoke("serial:getLastPort");
  },
  connect(portPath) {
    return import_electron.ipcRenderer.invoke("serial:connect", portPath);
  },
  disconnect() {
    return import_electron.ipcRenderer.invoke("serial:disconnect");
  },
  exportCsv(csvText) {
    return import_electron.ipcRenderer.invoke("data:exportCsv", csvText);
  },
  onFrame(handler) {
    const listener = (_e, payload) => handler(payload);
    import_electron.ipcRenderer.on("serial:frame", listener);
    return () => import_electron.ipcRenderer.removeListener("serial:frame", listener);
  },
  onRawLine(handler) {
    const listener = (_e, payload) => handler(payload);
    import_electron.ipcRenderer.on("serial:rawLine", listener);
    return () => import_electron.ipcRenderer.removeListener("serial:rawLine", listener);
  },
  onStatus(handler) {
    const listener = (_e, payload) => handler(payload);
    import_electron.ipcRenderer.on("serial:status", listener);
    return () => import_electron.ipcRenderer.removeListener("serial:status", listener);
  }
};
import_electron.contextBridge.exposeInMainWorld("eva", api);
//# sourceMappingURL=preload.cjs.map