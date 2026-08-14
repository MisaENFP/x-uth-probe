const $ = (id) => document.getElementById(id);
const DEFAULTS = { uthAiEnabled: false, uthAiKey: "", uthAiModel: "deepseek-v4-flash" };
const MODEL_MIGRATE = {
  "deepseek-chat": "deepseek-v4-flash",
  "deepseek-reasoner": "deepseek-v4-pro",
};

function setStatus(text, cls) {
  const el = $("status");
  el.textContent = text || "";
  el.className = "hint" + (cls ? " " + cls : "");
}

chrome.storage.local.get(DEFAULTS, (cfg) => {
  $("enabled").checked = Boolean(cfg.uthAiEnabled);
  $("key").value = cfg.uthAiKey || "";
  $("model").value = MODEL_MIGRATE[cfg.uthAiModel] || cfg.uthAiModel || "deepseek-v4-flash";
});

$("show").addEventListener("click", () => {
  const input = $("key");
  const hidden = input.type === "password";
  input.type = hidden ? "text" : "password";
  $("show").textContent = hidden ? "隐藏" : "显示";
});

$("save").addEventListener("click", () => {
  const cfg = {
    uthAiEnabled: $("enabled").checked,
    uthAiKey: $("key").value.trim(),
    uthAiModel: $("model").value,
  };
  if (cfg.uthAiEnabled && !cfg.uthAiKey) {
    setStatus("已勾选启用，但还没填 API Key。", "err");
    return;
  }
  chrome.storage.local.set(cfg, () => {
    setStatus(
      cfg.uthAiEnabled ? "已保存，AI 复核已启用。" : "已保存，AI 复核处于关闭状态。",
      "ok"
    );
  });
});

$("test").addEventListener("click", () => {
  setStatus("测试中…");
  chrome.runtime.sendMessage(
    { type: "UTH_AI_TEST", key: $("key").value.trim(), model: $("model").value },
    (res) => {
      if (chrome.runtime.lastError) {
        setStatus("测试失败：" + chrome.runtime.lastError.message, "err");
        return;
      }
      if (res && res.ok) {
        setStatus(
          "连接成功。" +
            (res.hasModel
              ? "所选模型可用。"
              : "注意：账号模型列表里没看到所选模型（" + $("model").value + "）。"),
          "ok"
        );
      } else {
        setStatus("连接失败：" + ((res && res.error) || "未知错误"), "err");
      }
    }
  );
});
