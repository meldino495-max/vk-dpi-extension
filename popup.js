async function refresh() {
  const state = await chrome.runtime.sendMessage({ type: "getState" });
  const status = document.getElementById("status");
  const btn = document.getElementById("toggle");
  if (state.enabled) {
    status.textContent = "已开启（仅 VK）";
    status.className = "status on";
    btn.textContent = "关闭";
    btn.className = "off";
  } else {
    status.textContent = "已关闭（全部直连）";
    status.className = "status off";
    btn.textContent = "开启";
    btn.className = "";
  }
}

document.getElementById("toggle").addEventListener("click", async () => {
  const state = await chrome.runtime.sendMessage({ type: "getState" });
  await chrome.runtime.sendMessage({
    type: "setEnabled",
    enabled: !state.enabled,
  });
  await refresh();
});

refresh();
