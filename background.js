const PROXY_HOST = "127.0.0.1";
const PROXY_PORT = 8888;
const HEALTH_URLS = [
  "http://127.0.0.1:8888/health",
  "http://127.0.0.1:8889/proxy.pac",
  "http://localhost:8888/health",
];

const VK_DOMAINS = [
  "vk.com",
  "vk.ru",
  "vk.me",
  "userapi.com",
  "vk-cdn.net",
  "vk-cdn.me",
  "vkuservideo.net",
  "vkuservideo.com",
  "vkuseraudio.net",
  "vkuserlive.net",
  "vk-portal.net",
  "mvk.com",
  "vkontakte.ru",
  "vkontakte.com",
  "vkcc.com",
  "vk.link",
  "mycdn.me",
  "okcdn.ru",
  "vkuser.net",
];

/** Clear any leftover sun→ps/pp rules from older broken builds. */
const LEGACY_REDIRECT_RULE_IDS = [1001, 1002, 1003, 1004, 1005, 1006];

let lastProxyUp = null;

function buildPacScript() {
  const list = VK_DOMAINS.map((d) => JSON.stringify(d)).join(",");
  // Always PROXY when extension is on — never fall back to DIRECT on a
  // flaky health check (that skipped CDN rewrite and made every image blurry).
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

async function clearLegacyRedirects() {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: LEGACY_REDIRECT_RULE_IDS,
      addRules: [],
    });
  } catch (_) {
    /* optional */
  }
}

async function getEnabled() {
  const { enabled } = await chrome.storage.local.get({ enabled: false });
  return !!enabled;
}

async function setEnabled(enabled) {
  await chrome.storage.local.set({ enabled: !!enabled });
  if (!enabled) {
    lastProxyUp = null;
    try {
      await chrome.alarms.clear("proxy-health");
    } catch (_) {
      /* optional */
    }
    await chrome.proxy.settings.clear({ scope: "regular" });
    await clearLegacyRedirects();
    await updateBadge(false, null);
    return;
  }
  await applyPac();
  await clearLegacyRedirects();
  const up = await checkLocalProxy();
  lastProxyUp = up;
  await updateBadge(true, up);
  try {
    await chrome.alarms.create("proxy-health", { periodInMinutes: 1 });
  } catch (_) {
    /* optional */
  }
}

async function applyPac() {
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

async function updateBadge(enabled, proxyUp) {
  if (!enabled) {
    await chrome.action.setBadgeText({ text: "" });
    return;
  }
  if (proxyUp) {
    await chrome.action.setBadgeText({ text: "ON" });
    await chrome.action.setBadgeBackgroundColor({ color: "#1a7f37" });
  } else {
    await chrome.action.setBadgeText({ text: "!" });
    await chrome.action.setBadgeBackgroundColor({ color: "#b45309" });
  }
}

async function checkLocalProxy() {
  for (const url of HEALTH_URLS) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 800);
    try {
      const res = await fetch(url, {
        cache: "no-store",
        signal: ctrl.signal,
        mode: "cors",
      });
      if (res.ok) return true;
    } catch (_) {
      /* try next */
    } finally {
      clearTimeout(t);
    }
  }
  return false;
}

async function refreshHealth() {
  try {
    const enabled = await getEnabled();
    if (!enabled) return;
    // Keep PAC on PROXY; only refresh badge
    const up = await checkLocalProxy();
    lastProxyUp = up;
    await updateBadge(true, up);
  } catch (_) {
    /* ignore */
  }
}

function fromExtensionPage(sender) {
  const id = chrome.runtime.id;
  if (!sender || sender.id !== id) return false;
  const url = sender.url || "";
  return url.startsWith(`chrome-extension://${id}/`);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!fromExtensionPage(sender)) {
    sendResponse({ ok: false });
    return;
  }
  (async () => {
    try {
      if (msg?.type === "getState") {
        const enabled = await getEnabled();
        let proxyUp = null;
        if (enabled) {
          proxyUp = await checkLocalProxy();
          lastProxyUp = proxyUp;
          await updateBadge(true, proxyUp);
        }
        sendResponse({
          enabled,
          proxyUp,
          proxy: `${PROXY_HOST}:${PROXY_PORT}`,
          domains: VK_DOMAINS,
        });
        return;
      }
      if (msg?.type === "setEnabled") {
        await setEnabled(!!msg.enabled);
        sendResponse({
          ok: true,
          enabled: !!msg.enabled,
          proxyUp: msg.enabled ? lastProxyUp : null,
        });
        return;
      }
      sendResponse({ ok: false });
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
  })();
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  clearLegacyRedirects();
  getEnabled().then((enabled) => {
    if (enabled) setEnabled(true);
    else updateBadge(false, null);
  });
});

chrome.runtime.onStartup.addListener(() => {
  clearLegacyRedirects();
  getEnabled().then((enabled) => {
    if (enabled) setEnabled(true);
  });
});

try {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "proxy-health") refreshHealth();
  });
} catch (_) {
  /* optional */
}

try {
  chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0) return;
    try {
      const h = new URL(details.url).hostname.toLowerCase();
      if (
        h === "vk.ru" ||
        h.endsWith(".vk.ru") ||
        h === "vk.com" ||
        h.endsWith(".vk.com") ||
        h.endsWith(".userapi.com")
      ) {
        refreshHealth();
      }
    } catch (_) {
      /* ignore */
    }
  });
} catch (_) {
  /* optional */
}
