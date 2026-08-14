const UTH = globalThis.UTHProbe;
const state = {
  tab: "safety",
  tweet: blankTweet(),
  opts: { mutualOriginal: false, oon: false },
};

function blankTweet() {
  return {
    id: "",
    url: "",
    handle: "",
    display: "",
    avatar: "",
    avatarUrl: "",
    text: "",
    createdAt: "",
    likes: 0,
    replies: 0,
    reposts: 0,
    quotes: 0,
    views: 0,
    hasPhoto: false,
    hasVideo: false,
    hasGif: false,
    hasCard: false,
    isReply: false,
    isRetweet: false,
    urls: [],
  };
}

const $ = (id) => document.getElementById(id);

$("text").addEventListener("input", () => {
  state.tweet.text = $("text").value;
});

document.querySelectorAll("[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.tab = btn.getAttribute("data-tab");
    document.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("on", b === btn));
    render();
  });
});

$("run").addEventListener("click", () => {
  state.tweet.text = $("text").value;
  state.tweet.urls = Array.from(String(state.tweet.text).matchAll(/https?:\/\/[^\s]+/g)).map((m) => m[0]);
  render();
});

$("read").addEventListener("click", async () => {
  $("source").textContent = "正在读取…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error("没有活动标签页");
    if (!/https:\/\/(x|twitter)\.com\//.test(tab.url || "")) {
      throw new Error("请先打开 x.com 上的一条帖子");
    }
    const res = await chrome.tabs.sendMessage(tab.id, { type: "UTH_GET_FOCUSED" });
    if (!res || !res.tweet) throw new Error("这一页没抓到帖子，点时间线里的「探针」更准");
    state.tweet = Object.assign(blankTweet(), res.tweet);
    $("text").value = state.tweet.text;
    $("source").textContent = state.tweet.handle
      ? `已读取 @${state.tweet.handle} · ${state.tweet.id || "无 ID"}`
      : "已读取当前帖";
    render();
  } catch (err) {
    $("source").textContent = err.message || String(err);
  }
});

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmtInt(n) {
  return (Number(n) || 0).toLocaleString("zh-CN");
}
function fmtPart(n) {
  if (!n) return "0";
  const abs = Math.abs(n);
  const s = abs >= 1 ? abs.toFixed(2) : abs.toFixed(4);
  return n < 0 ? "−" + s : s;
}
function fmtP(p) {
  if (!p) return "0";
  return p >= 0.01 ? p.toFixed(3) : p.toExponential(1);
}

function identityBlock(tweet) {
  const handle = tweet.handle || "";
  const avatar = tweet.avatar || tweet.avatarUrl || "";
  if (!handle && !avatar) return "";
  return `<div class="who">
    ${
      avatar
        ? `<img class="avatar" src="${esc(avatar)}" alt="@${esc(handle)}"/>`
        : `<div class="avatar fallback">${esc((handle || "?").slice(0, 1).toUpperCase())}</div>`
    }
    <div>
      <div><strong>${esc(tweet.display || handle)}</strong></div>
      <div class="handle">@${esc(handle || "unknown")}</div>
    </div>
  </div>`;
}

function downloadBtn() {
  return `<div class="download-row"><button type="button" id="download">下载报告 PNG</button></div>`;
}

function bindDownload(tweet, safety, score, advice) {
  const btn = $("download");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    btn.textContent = "生成中…";
    try {
      await UTH.downloadPngReport({
        tweet,
        safety,
        score,
        advice,
        brandUrl: UTH.brandAvatarUrl(),
      });
      btn.textContent = "已下载";
    } catch (e) {
      btn.textContent = "失败，重试";
    }
  });
}

function render() {
  const tweet = state.tweet;
  const out = $("out");
  const safety = UTH.analyzeSafety(tweet);
  const score = UTH.estimateScore(tweet, state.opts);
  const advice = UTH.advise(tweet, safety, score);

  if (state.tab === "safety") {
    if (!tweet.text.trim() && !tweet.urls.length) {
      out.innerHTML = `<p class="empty">先粘贴正文，或读取当前页帖子。</p>`;
      return;
    }
    if (safety.status === "clear") {
      out.innerHTML =
        identityBlock(tweet) +
        `<div class="stamp stamp-clear">CLEAR</div>
        <div class="clear-block">
          <h2>未命中公开标签规则</h2>
          <p class="muted">启发式对照 UTH 白名单。绿色不等于 X 没打标，只表示这套公开规则没扫到明显信号。</p>
        </div>` +
        downloadBtn();
      bindDownload(tweet, safety, score, advice);
      return;
    }
    const stamp = safety.status === "alert" ? "HOLD" : "FLAG";
    const cls = safety.status === "alert" ? "alert" : "warn";
    out.innerHTML =
      identityBlock(tweet) +
      `<div class="stamp stamp-${cls}">${stamp}</div>` +
      safety.matches
        .map(
          (m) => `<article class="label-card ${m.level}">
            <header>
              <span class="pill">${m.kill === "all" ? "整站" : "非粉 For You"}</span>
              <code>${esc(m.id)}</code>
            </header>
            <p class="reason">${esc(m.reason)}</p>
            <p class="effect">${esc(m.effect)}</p>
          </article>`
        )
        .join("") +
      downloadBtn();
    bindDownload(tweet, safety, score, advice);
    return;
  }

  if (state.tab === "advice") {
    if (!tweet.text.trim() && !tweet.urls.length && !tweet.handle) {
      out.innerHTML = `<p class="empty">先分析一条帖子，再看建议。</p>`;
      return;
    }
    out.innerHTML =
      identityBlock(tweet) +
      advice
        .map(
          (tip) => `<article class="tip ${esc(tip.level)}">
            <p class="tip-title">${esc(tip.title)}</p>
            <p>${esc(tip.body)}</p>
          </article>`
        )
        .join("") +
      downloadBtn();
    bindDownload(tweet, safety, score, advice);
    return;
  }

  const age = UTH.hoursAgo(tweet.createdAt);
  const agedOut = age != null && age > UTH.MAX_AGE_HOURS;
  const rows = score.rows
    .filter((r) => r.weight !== 0 || r.count > 0)
    .map((r) => {
      const dim = r.missing && r.count === 0 ? "dim" : "";
      return `<tr class="${dim}"><td>${esc(r.name)}</td><td class="num">${r.weight}</td>
        <td class="num">${r.missing && r.count === 0 ? "—" : fmtInt(r.count)}</td>
        <td class="num">${fmtP(r.p)}</td>
        <td class="num ${r.part < 0 ? "neg" : r.part > 0 ? "pos" : ""}">${fmtPart(r.part)}</td></tr>`;
    })
    .join("");

  out.innerHTML = `
    ${identityBlock(tweet)}
    <p class="muted">Σ 权重 × P，P = 次数 / 浏览量，缺项为 0</p>
    <div class="score-num">${fmtPart(score.total)}</div>
    ${agedOut ? `<p class="note">帖龄超过 48 小时，For You 会直接滤掉。</p>` : ""}
    ${tweet.views ? "" : `<p class="note">没有浏览量时 P 全为 0。补上浏览量再看贡献。</p>`}
    <div class="toggles">
      <label><input id="opt-mutual" type="checkbox" ${state.opts.mutualOriginal ? "checked" : ""}/> 互关原创（回复 +15）</label>
      <label><input id="opt-oon" type="checkbox" ${state.opts.oon ? "checked" : ""}/> 非粉路径 ×0.75</label>
    </div>
    <div class="manual">
      <label>浏览量 <input id="f-views" type="number" min="0" value="${tweet.views || ""}"/></label>
      <label>赞 <input id="f-likes" type="number" min="0" value="${tweet.likes || ""}"/></label>
      <label>回复 <input id="f-replies" type="number" min="0" value="${tweet.replies || ""}"/></label>
      <label>转发 <input id="f-reposts" type="number" min="0" value="${tweet.reposts || ""}"/></label>
      <label>引用 <input id="f-quotes" type="number" min="0" value="${tweet.quotes || ""}"/></label>
    </div>
    <table>
      <thead><tr><th>信号</th><th>权重</th><th>次数</th><th>P</th><th>贡献</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="muted">复制链接 / 私信 / 举报等页面读不到，按 0。不是 Phoenix 真实分。</p>
    ${downloadBtn()}
  `;

  const bindNum = (id, key) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", () => {
      state.tweet[key] = UTH.parseCompactNumber(el.value);
      render();
    });
  };
  bindNum("f-views", "views");
  bindNum("f-likes", "likes");
  bindNum("f-replies", "replies");
  bindNum("f-reposts", "reposts");
  bindNum("f-quotes", "quotes");
  const mutual = document.getElementById("opt-mutual");
  const oon = document.getElementById("opt-oon");
  if (mutual) {
    mutual.addEventListener("change", () => {
      state.opts.mutualOriginal = mutual.checked;
      render();
    });
  }
  if (oon) {
    oon.addEventListener("change", () => {
      state.opts.oon = oon.checked;
      render();
    });
  }
  bindDownload(tweet, safety, score, advice);
}

render();
