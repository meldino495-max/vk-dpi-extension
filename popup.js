function paint(state) {
  const status = document.getElementById("status");
  const btn = document.getElementById("toggle");
  const health = document.getElementById("health");

  if (!state || state.error) {
    status.textContent = "插件异常，请重新加载";
    status.className = "status off";
    btn.textContent = "关闭";
    btn.className = "off";
    health.textContent =
      "请打开 chrome://extensions → 本插件点「重新加载」，再点右侧关闭。";
    health.className = "warn bad";
    return;
  }

  if (state.enabled) {
    status.textContent = "已开启（仅 VK）";
    status.className = "status on";
    btn.textContent = "关闭";
    btn.className = "off";
    if (state.proxyUp === false) {
      health.textContent =
        "本地软件未启动。已临时直连防转圈。要用代理请先开软件，角标应变 ON。";
      health.className = "warn bad";
    } else if (state.proxyUp === true) {
      health.textContent = "已检测到本地代理在运行。";
      health.className = "warn ok";
    } else {
      health.textContent = "";
      health.className = "warn";
    }
  } else {
    status.textContent = "已关闭（全部直连）";
    status.className = "status off";
    btn.textContent = "开启";
    btn.className = "";
    health.textContent = "已关闭，VK 不再走本地代理。";
    health.className = "warn";
  }
}

async function refresh() {
  try {
    const state = await chrome.runtime.sendMessage({ type: "getState" });
    paint(state);
  } catch (err) {
    paint({ error: String(err) });
  }
}

document.getElementById("toggle").addEventListener("click", async () => {
  const btn = document.getElementById("toggle");
  btn.disabled = true;
  try {
    let enabled = true;
    try {
      const state = await chrome.runtime.sendMessage({ type: "getState" });
      enabled = !!(state && state.enabled);
    } catch (_) {
      enabled = btn.textContent !== "开启";
    }
    await chrome.runtime.sendMessage({
      type: "setEnabled",
      enabled: !enabled,
    });
  } catch (_) {
    // still refresh to show error state
  }
  await refresh();
  btn.disabled = false;
});

refresh();
