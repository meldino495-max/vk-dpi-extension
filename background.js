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

/** @type {boolean|null} last known local proxy health while enabled */
let lastProxyUp = null;

function buildPacScript(useProxy) {
  const list = VK_DOMAINS.map((d) => JSON.stringify(d)).join(",");
  if (!useProxy) {
    // Fail-open: extension ON but local software down → do not blackhole VK
    return `function FindProxyForURL(url, host) { return "DIRECT"; }`;
  }
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
  if (!enabled) {
    lastProxyUp = null;
    try {
      await chrome.alarms.clear("proxy-health");
    } catch (_) {
      /* optional */
    }
    await chrome.proxy.settings.clear({ scope: "regular" });
    await updateBadge(false, null);
    return;
  }
  const up = await checkLocalProxy();
  lastProxyUp = up;
  await applyPac(up);
  await updateBadge(true, up);
  try {
    await chrome.alarms.create("proxy-health", { periodInMinutes: 1 });
  } catch (_) {
    /* optional */
  }
}

async function applyPac(useProxy) {
  await chrome.proxy.settings.set({
    value: {
      mode: "pac_script",
      pacScript: {
        data: buildPacScript(!!useProxy),
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
    const t = setTimeout(() => ctrl.abort(), 500);
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
    const up = await checkLocalProxy();
    if (up !== lastProxyUp) {
      lastProxyUp = up;
      await applyPac(up);
    }
    await updateBadge(true, up);
  } catch (_) {
    /* ignore */
  }
}

// Register messaging FIRST so popup never stays stuck on "…"
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "getState") {
        const enabled = await getEnabled();
        let proxyUp = null;
        if (enabled) {
          proxyUp = await checkLocalProxy();
          if (proxyUp !== lastProxyUp) {
            lastProxyUp = proxyUp;
            await applyPac(!!proxyUp);
            await updateBadge(true, proxyUp);
          }
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
  getEnabled().then((enabled) => {
    if (enabled) setEnabled(true);
    else updateBadge(false, null);
  });
});

chrome.runtime.onStartup.addListener(() => {
  getEnabled().then((enabled) => {
    if (enabled) setEnabled(true);
  });
});

try {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "proxy-health") refreshHealth();
  });
} catch (_) {
  /* alarms permission missing */
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
  /* webNavigation permission missing */
}
