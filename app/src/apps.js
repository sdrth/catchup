/** @typedef {{ id: string, name: string, url?: string, color: string, icon: string, kind: 'webview' | 'drawer' | 'page' }} CatchupApp */

/** @type {CatchupApp[]} */
const apps = [
  {
    id: "whatsapp",
    name: "WhatsApp",
    url: "https://web.whatsapp.com",
    color: "#25D366",
    icon: "whatsapp",
    kind: "webview",
  },
  {
    id: "summaries",
    name: "Access",
    color: "#fbbf24",
    icon: "summaries",
    kind: "drawer",
  },
  {
    id: "settings",
    name: "Settings",
    color: "#94a3b8",
    icon: "settings",
    kind: "page",
  },
];

module.exports = { apps };
