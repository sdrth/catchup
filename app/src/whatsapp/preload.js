const { ipcRenderer } = require("electron");

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const origin = event.origin;
  if (
    origin !== "https://web.whatsapp.com" &&
    origin !== "https://whatsapp.com"
  ) {
    return;
  }

  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.source !== "catchup-whatsapp") return;
  if (
    data.type !== "snapshot" &&
    data.type !== "error" &&
    data.type !== "status" &&
    data.type !== "messages" &&
    data.type !== "activeChat"
  ) {
    return;
  }

  ipcRenderer.send("whatsapp:snapshot", data);
});
