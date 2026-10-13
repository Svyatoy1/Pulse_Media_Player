const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pulseAPI", {
  openMediaFiles: () => ipcRenderer.invoke("dialog:open-media"),
  getVersion: () => ipcRenderer.invoke("app:get-version")
});
