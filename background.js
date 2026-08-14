importScripts("shared.js");

const AI_DEFAULTS = { uthAiEnabled: false, uthAiKey: "", uthAiModel: "deepseek-v4-flash" };

// 2026-07-24 起 deepseek-chat / deepseek-reasoner 已停用，旧配置自动迁移到 V4
const MODEL_MIGRATE = {
  "deepseek-chat": "deepseek-v4-flash",
  "deepseek-reasoner": "deepseek-v4-pro",
};

function getAiConfig() {
  return new Promise((resolve) =>
    chrome.storage.local.get(AI_DEFAULTS, (cfg) => {
      if (MODEL_MIGRATE[cfg.uthAiModel]) {
        cfg.uthAiModel = MODEL_MIGRATE[cfg.uthAiModel];
        chrome.storage.local.set({ uthAiModel: cfg.uthAiModel });
      }
      resolve(cfg);
    })
  );
}

function doDownload(msg, sendResponse) {
  const filename = String(msg.filename || "uth-report.png").replace(/[^\w.\-@]+/g, "_");
  if (!msg.url || typeof msg.url !== "string") {
    sendResponse({ ok: false, error: "missing url" });
    return;
  }
  chrome.downloads.download(
    {
      url: msg.url,
      filename: filename,
      saveAs: false,
      conflictAction: "uniquify",
    },
    (id) => {
      if (chrome.runtime.lastError || !id) {
        sendResponse({
          ok: false,
          error:
            (chrome.runtime.lastError && chrome.runtime.lastError.message) ||
            "download failed",
        });
        return;
      }
      sendResponse({ ok: true, id: id });
    }
  );
}

async function aiAnalyze(tweet) {
  const cfg = await getAiConfig();
  if (!cfg.uthAiEnabled || !cfg.uthAiKey) return { ok: false, off: true };
  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + cfg.uthAiKey,
      },
      body: JSON.stringify({
        model: cfg.uthAiModel || "deepseek-v4-flash",
        messages: globalThis.UTHProbe.buildAiMessages(tweet || {}),
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 800,
      }),
    });
    if (!res.ok) {
      let detail = "";
      try {
        const err = await res.json();
        detail = (err && err.error && err.error.message) || "";
      } catch (e) {}
      if (res.status === 401) detail = detail || "API Key 无效";
      if (res.status === 402) detail = detail || "账户余额不足";
      return { ok: false, error: "HTTP " + res.status + (detail ? "：" + detail : "") };
    }
    const data = await res.json();
    let content =
      (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
    content = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    let raw = null;
    try {
      raw = JSON.parse(content);
    } catch (e) {
      return { ok: false, error: "AI 返回的不是有效 JSON" };
    }
    return {
      ok: true,
      ai: globalThis.UTHProbe.sanitizeAiResult(raw),
      model: cfg.uthAiModel,
    };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

async function aiTest(key, model) {
  const k = String(key || "").trim();
  if (!k) return { ok: false, error: "请先填 API Key" };
  try {
    const res = await fetch("https://api.deepseek.com/models", {
      headers: { Authorization: "Bearer " + k },
    });
    if (!res.ok) {
      return { ok: false, error: "HTTP " + res.status + (res.status === 401 ? "：Key 无效" : "") };
    }
    const data = await res.json();
    const ids = (data.data || []).map((m) => m.id);
    return { ok: true, models: ids, hasModel: ids.indexOf(model) >= 0 };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return undefined;
  if (msg.type === "UTH_DOWNLOAD") {
    doDownload(msg, sendResponse);
    return true;
  }
  if (msg.type === "UTH_AI_ANALYZE") {
    aiAnalyze(msg.tweet).then(sendResponse);
    return true;
  }
  if (msg.type === "UTH_AI_TEST") {
    aiTest(msg.key, msg.model).then(sendResponse);
    return true;
  }
  if (msg.type === "UTH_OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }
  return undefined;
});
