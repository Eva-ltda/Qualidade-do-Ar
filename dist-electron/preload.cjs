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
  getNotificationSettings() {
    return import_electron.ipcRenderer.invoke("notifications:getSettings");
  },
  getNotificationRuntimeState() {
    return import_electron.ipcRenderer.invoke("notifications:getRuntimeState");
  },
  saveNotificationSettings(settings) {
    return import_electron.ipcRenderer.invoke("notifications:saveSettings", settings);
  },
  testNotification(settings) {
    return import_electron.ipcRenderer.invoke("notifications:testNotification", settings);
  },
  getSavedMeasurements() {
    return import_electron.ipcRenderer.invoke("measurements:get");
  },
  setLastLocation(location) {
    return import_electron.ipcRenderer.invoke("measurements:setLastLocation", location);
  },
  saveMeasurement(measurement) {
    return import_electron.ipcRenderer.invoke("measurements:save", measurement);
  },
  clearSavedMeasurements() {
    return import_electron.ipcRenderer.invoke("measurements:clear");
  },
  connect(portPath) {
    return import_electron.ipcRenderer.invoke("serial:connect", portPath);
  },
  disconnect() {
    return import_electron.ipcRenderer.invoke("serial:disconnect");
  },
  sendCommand(command) {
    return import_electron.ipcRenderer.invoke("serial:sendCommand", command);
  },
  requestStatus() {
    return import_electron.ipcRenderer.invoke("serial:requestStatus");
  },
  ping() {
    return import_electron.ipcRenderer.invoke("serial:ping");
  },
  requestSetLocation(location) {
    return import_electron.ipcRenderer.invoke("serial:requestSetLocation", location);
  },
  exportCsv(csvText) {
    return import_electron.ipcRenderer.invoke("data:exportCsv", csvText);
  },
  backupCsv(csvText) {
    return import_electron.ipcRenderer.invoke("data:backupCsv", csvText);
  },
  notifyPrintCaptureReady() {
    import_electron.ipcRenderer.send("dashboard:print-ready");
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
  onControl(handler) {
    const listener = (_e, payload) => handler(payload);
    import_electron.ipcRenderer.on("serial:control", listener);
    return () => import_electron.ipcRenderer.removeListener("serial:control", listener);
  },
  onTxLine(handler) {
    const listener = (_e, payload) => handler(payload);
    import_electron.ipcRenderer.on("serial:txLine", listener);
    return () => import_electron.ipcRenderer.removeListener("serial:txLine", listener);
  },
  onStatus(handler) {
    const listener = (_e, payload) => handler(payload);
    import_electron.ipcRenderer.on("serial:status", listener);
    return () => import_electron.ipcRenderer.removeListener("serial:status", listener);
  },
  onNotificationRuntimeState(handler) {
    const listener = (_e, payload) => handler(payload);
    import_electron.ipcRenderer.on("notifications:runtimeState", listener);
    return () => import_electron.ipcRenderer.removeListener("notifications:runtimeState", listener);
  },
  onNotificationSettings(handler) {
    const listener = (_e, payload) => handler(payload);
    import_electron.ipcRenderer.on("notifications:settings", listener);
    return () => import_electron.ipcRenderer.removeListener("notifications:settings", listener);
  },
  onPrintCaptureRequest(handler) {
    const listener = (_e, payload) => handler(payload);
    import_electron.ipcRenderer.on("dashboard:prepare-print", listener);
    return () => import_electron.ipcRenderer.removeListener("dashboard:prepare-print", listener);
  },
  onPrintCaptureFinished(handler) {
    const listener = () => handler();
    import_electron.ipcRenderer.on("dashboard:finish-print", listener);
    return () => import_electron.ipcRenderer.removeListener("dashboard:finish-print", listener);
  }
};
import_electron.contextBridge.exposeInMainWorld("eva", api);
//# sourceMappingURL=preload.cjs.map