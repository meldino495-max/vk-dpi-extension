const PROXY_HOST = "127.0.0.1";
const PROXY_PORT = 8888;

const VK_DOMAINS = [
  "vk.com",
  "vk.ru",
  "vk.me",
  "userapi.com",
  "vk-cdn.net",
  "vk-cdn.me",
  "vkuservideo.net",
  "vkuseraudio.net",
  "vkuserlive.net",
  "vk-portal.net",
  "mvk.com",
  "vkontakte.ru",
  "vkontakte.com",
  "vkcc.com",
  "vk.link",
];

function buildPacScript() {
  const list = VK_DOMAINS.map((d) => JSON.stringify(d)).join(",");
  return `
function hostMatches(host, domain) {
  host = (host || "").toLowerCase();
  domain = domain.toLowerCase();
  return host === domain || dnsDomainIs(host, "." + domain);
}
function FindProxyForURL(url, host) {
  if (!host || isPlainHostName(host)) return "DIRECT";
  var domains = [${list}];
  for (var i = 0; i < domains.length; i++) {
    if (hostMatches(host, domains[i])) {
      return "PROXY ${PROXY_HOST}:${PROXY_PORT}";
    }
  }
  return "DIRECT";
}
`;
}

async function getEnabled() {
  const { enabled } = await chrome.storage.local.get({ enabled: false });
  return !!enabled;
}

async function setEnabled(enabled) {
  await chrome.storage.local.set({ enabled: !!enabled });
  await applyProxy(!!enabled);
  await updateBadge(!!enabled);
}

async function applyProxy(enabled) {
  if (!enabled) {
    await chrome.proxy.settings.clear({ scope: "regular" });
    return;
  }
  await chrome.proxy.settings.set({
    value: {
      mode: "pac_script",
      pacScript: {
        data: buildPacScript(),
        mandatory: true,
      },
    },
    scope: "regular",
  });
}

async function updateBadge(enabled) {
  await chrome.action.setBadgeText({ text: enabled ? "ON" : "" });
  await chrome.action.setBadgeBackgroundColor({
    color: enabled ? "#1a7f37" : "#666666",
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  const enabled = await getEnabled();
  await applyProxy(enabled);
  await updateBadge(enabled);
});

chrome.runtime.onStartup.addListener(async () => {
  const enabled = await getEnabled();
  await applyProxy(enabled);
  await updateBadge(enabled);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === "getState") {
      sendResponse({
        enabled: await getEnabled(),
        proxy: `${PROXY_HOST}:${PROXY_PORT}`,
        domains: VK_DOMAINS,
      });
      return;
    }
    if (msg?.type === "setEnabled") {
      await setEnabled(!!msg.enabled);
      sendResponse({ ok: true, enabled: !!msg.enabled });
      return;
    }
  })();
  return true;
});
