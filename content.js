/**
 * 在 x.com / twitter.com 时间线注入「探针」按钮，并打开检验面板。
 */
(function () {
  const UTH = globalThis.UTHProbe;
  if (!UTH) return;

  let panelHost = null;
  let currentTweet = null;
  let activeTab = "safety";
  let opts = { mutualOriginal: false, oon: false };

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $all(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function parseAriaCounts(label) {
    const out = { replies: 0, reposts: 0, likes: 0, bookmarks: 0, quotes: 0, views: 0 };
    if (!label) return out;
    const s = label.replace(/[,，、]/g, " ");

    const grab = (patterns) => {
      for (const re of patterns) {
        const m = s.match(re);
        if (m) return UTH.parseCompactNumber(m[1]);
      }
      return 0;
    };

    out.replies = grab([
      /([\d.]+[KMB万亿]?)\s*(?:replies|reply|回复)/i,
      /(?:replies|reply|回复)[^\d]*([\d.]+[KMB万亿]?)/i,
    ]);
    out.reposts = grab([
      /([\d.]+[KMB万亿]?)\s*(?:reposts?|reposts|转帖|转发|转推)/i,
    ]);
    out.likes = grab([
      /([\d.]+[KMB万亿]?)\s*(?:likes?|喜欢|赞)/i,
    ]);
    out.bookmarks = grab([
      /([\d.]+[KMB万亿]?)\s*(?:bookmarks?|书签)/i,
    ]);
    out.quotes = grab([
      /([\d.]+[KMB万亿]?)\s*(?:quotes?|引用)/i,
    ]);
    out.views = grab([
      /([\d.]+[KMB万亿]?)\s*(?:views?|次查看|浏览)/i,
    ]);
    return out;
  }

  function countFromButton(article, testId) {
    const btn = article.querySelector(`[data-testid="${testId}"]`);
    if (!btn) return 0;
    const aria = btn.getAttribute("aria-label") || "";
    const m = aria.match(/([\d.,]+)\s*([KMB万亿])?/i);
    if (m) return UTH.parseCompactNumber((m[1] + (m[2] || "")).replace(/,/g, ""));
    const span = btn.querySelector("[data-testid='app-text-transition-container']") || btn.querySelector("span span");
    if (span && /\d/.test(span.textContent || "")) {
      return UTH.parseCompactNumber(span.textContent);
    }
    return 0;
  }

  function extractUrls(article, text) {
    const hrefs = $all("a[href]", article)
      .map((a) => a.href)
      .filter((h) => h && !/x\.com\/(i\/|search)/.test(h) && !/\/status\/\d+\/(photo|video|analytics)/.test(h));
    const inText = Array.from(String(text).matchAll(/https?:\/\/[^\s]+/g)).map((m) => m[0]);
    return Array.from(new Set(hrefs.concat(inText))).slice(0, 12);
  }

  function scrapeArticle(article) {
    const textEl = article.querySelector('[data-testid="tweetText"]');
    const text = (textEl && textEl.innerText) || "";
    const time = article.querySelector("time");
    const createdAt = time ? time.getAttribute("datetime") : "";
    const statusLink = $all('a[href*="/status/"]', article).find((a) => /\/status\/\d+/.test(a.getAttribute("href") || ""));
    const href = statusLink ? statusLink.href : location.href;
    const idMatch = href.match(/status\/(\d+)/);
    const userName = article.querySelector('[data-testid="User-Name"]');
    const handleA = userName ? $all("a[href^='/']", userName).find((a) => /^\/[A-Za-z0-9_]+$/.test(a.getAttribute("href") || "")) : null;
    const handle = handleA ? handleA.getAttribute("href").slice(1) : "";
    const display = userName ? (userName.querySelector("span")?.textContent || handle) : handle;
    const avatarUrl = upgradeAvatar(
      (
        article.querySelector('[data-testid="Tweet-User-Avatar"] img') ||
        article.querySelector('img[src*="profile_images"]')
      )?.src || ""
    );

    const group = article.querySelector('div[role="group"][aria-label]');
    const fromAria = parseAriaCounts(group ? group.getAttribute("aria-label") : "");
    const likes = fromAria.likes || countFromButton(article, "like");
    const replies = fromAria.replies || countFromButton(article, "reply");
    const reposts = fromAria.reposts || countFromButton(article, "retweet");
    const bookmarks = fromAria.bookmarks || countFromButton(article, "bookmark");
    let views = fromAria.views;
    if (!views) {
      const analytics = article.querySelector('a[href*="/analytics"]');
      if (analytics) {
        views =
          UTH.parseCompactNumber(analytics.getAttribute("aria-label") || "") ||
          UTH.parseCompactNumber(analytics.textContent);
      }
    }
    if (!views) {
      const viewEl = $all("a, span", article).find((el) =>
        /([\d.,]+[KMB万亿]?)\s*(views?|次查看|浏览)/i.test(el.getAttribute("aria-label") || el.textContent || "")
      );
      if (viewEl) {
        const blob = viewEl.getAttribute("aria-label") || viewEl.textContent;
        const vm = String(blob).match(/([\d.,]+[KMB万亿]?)\s*(?:views?|次查看|浏览)/i);
        if (vm) views = UTH.parseCompactNumber(vm[1]);
      }
    }

    const hasPhoto = Boolean(article.querySelector('[data-testid="tweetPhoto"]'));
    const hasVideo = Boolean(article.querySelector('video, [data-testid="videoComponent"], [data-testid="videoPlayer"]'));
    const hasGif = Boolean(article.querySelector('[data-testid="tweetGif"]'));
    const hasCard = Boolean(article.querySelector('[data-testid="card.wrapper"], [data-testid="card.layoutLarge.media"]'));
    const isReply = Boolean(
      article.querySelector('[data-testid="socialContext"]') &&
        /回复|replying/i.test(article.innerText.slice(0, 80))
    );
    const isRetweet =
      Boolean(article.querySelector('[data-testid="socialContext"]')) &&
      /转帖|repost|retweeted/i.test((article.querySelector('[data-testid="socialContext"]') || {}).textContent || "");

    return {
      id: idMatch ? idMatch[1] : "",
      url: href,
      handle,
      display,
      avatarUrl,
      avatar: "",
      text: text.trim(),
      createdAt,
      likes,
      replies,
      reposts,
      quotes: fromAria.quotes || 0,
      bookmarks,
      views,
      hasPhoto,
      hasVideo,
      hasGif,
      hasCard,
      isReply,
      isRetweet,
      urls: extractUrls(article, text),
    };
  }

  function ensurePanel() {
    if (panelHost && document.documentElement.contains(panelHost)) return panelHost;
    panelHost = document.createElement("div");
    panelHost.id = "uth-probe-host";
    document.documentElement.appendChild(panelHost);
    const shadow = panelHost.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = PANEL_CSS;
    const wrap = document.createElement("div");
    wrap.className = "root";
    wrap.innerHTML = `<div class="backdrop" hidden></div><aside class="sheet" hidden></aside>`;
    shadow.appendChild(style);
    shadow.appendChild(wrap);
    wrap.querySelector(".backdrop").addEventListener("click", closePanel);
    return panelHost;
  }

  function upgradeAvatar(src) {
    if (!src) return "";
    return src
      .replace(/_normal(\.(jpg|jpeg|png|webp))/i, "_400x400$1")
      .replace(/_x96(\.(jpg|jpeg|png|webp))/i, "_400x400$1")
      .replace(/_bigger(\.(jpg|jpeg|png|webp))/i, "_400x400$1");
  }

  async function fetchDataUrl(src) {
    if (!src) return "";
    if (src.startsWith("data:")) return src;
    try {
      const res = await fetch(src, { credentials: "omit" });
      if (!res.ok) return "";
      const blob = await res.blob();
      if (!blob || !blob.size) return "";
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      return "";
    }
  }

  function closePanel() {
    const shadow = panelHost && panelHost.shadowRoot;
    if (!shadow) return;
    shadow.querySelector(".backdrop").hidden = true;
    shadow.querySelector(".sheet").hidden = true;
  }

  function openPanel(tweet) {
    currentTweet = tweet;
    const host = ensurePanel();
    const shadow = host.shadowRoot;
    shadow.querySelector(".backdrop").hidden = false;
    const sheet = shadow.querySelector(".sheet");
    sheet.hidden = false;
    renderPanel();
    if (tweet.avatarUrl && !tweet.avatar) {
      fetchDataUrl(tweet.avatarUrl).then((data) => {
        if (data && String(data).startsWith("data:") && currentTweet && currentTweet.id === tweet.id) {
          currentTweet.avatar = data;
          renderPanel();
        }
      });
    }
  }

  function renderPanel() {
    const tweet = currentTweet;
    if (!tweet || !panelHost) return;
    const sheet = panelHost.shadowRoot.querySelector(".sheet");
    const safety = UTH.analyzeSafety(tweet);
    const score = UTH.estimateScore(tweet, opts);
    const age = UTH.hoursAgo(tweet.createdAt);
    const agedOut = age != null && age > UTH.MAX_AGE_HOURS;

    const advice = UTH.advise(tweet, safety, score);
    const avatarSrc = tweet.avatar || tweet.avatarUrl || "";
    const brandSrc = UTH.brandAvatarUrl();
    const handle = tweet.handle || "unknown";
    const profileUrl = "https://x.com/" + handle;

    const stamp =
      safety.status === "clear"
        ? `<div class="stamp stamp-clear">CLEAR</div>`
        : safety.status === "alert"
          ? `<div class="stamp stamp-alert">HOLD</div>`
          : `<div class="stamp stamp-warn">FLAG</div>`;

    const safetyBody =
      safety.status === "clear"
        ? `<div class="clear-block">
             <p class="clear-kicker">未命中 UTH 公开标签规则</p>
             <p class="muted">按帖子文本、链接、媒体做启发式对照。这不是 X 后台的真实标签，绿色只表示「公开规则没扫到明显信号」。</p>
           </div>`
        : safety.matches
            .map(
              (m) => `<article class="label-card ${m.level}">
                <header>
                  <span class="pill">${m.kill === "all" ? "整站" : "非粉 For You"}</span>
                  <code>${esc(m.id)}</code>
                </header>
                <p class="reason">${esc(m.reason)}</p>
                <p class="effect">${esc(m.effect)}</p>
                ${m.evidence.length ? `<p class="evidence">依据：${m.evidence.map(esc).join(" · ")}</p>` : ""}
              </article>`
            )
            .join("");

    const rows = score.rows
      .filter((r) => r.weight !== 0 || r.count > 0)
      .map((r) => {
        const dim = r.missing && r.count === 0 ? "dim" : "";
        return `<tr class="${dim}">
          <td>${esc(r.name)}</td>
          <td class="num">${fmtWeight(r.weight)}</td>
          <td class="num">${r.missing && r.count === 0 ? "—" : fmtInt(r.count)}</td>
          <td class="num">${fmtP(r.p)}</td>
          <td class="num ${r.part < 0 ? "neg" : r.part > 0 ? "pos" : ""}">${fmtPart(r.part)}</td>
        </tr>`;
      })
      .join("");

    const adviceBody = advice
      .map(
        (tip) => `<article class="tip ${esc(tip.level)}">
          <p class="tip-title">${esc(tip.title)}</p>
          <p>${esc(tip.body)}</p>
        </article>`
      )
      .join("");

    sheet.innerHTML = `
      <button class="close" type="button" aria-label="关闭">×</button>
      <div class="ticket-head">
        <div class="who">
          ${
            avatarSrc
              ? `<img class="avatar" src="${esc(avatarSrc)}" alt="@${esc(handle)}"/>`
              : `<div class="avatar fallback">${esc((handle || "?").slice(0, 1).toUpperCase())}</div>`
          }
          <div class="who-meta">
            <p class="kicker">UTH 探针 · 检验单</p>
            <a class="display" href="${esc(profileUrl)}" target="_blank" rel="noreferrer">${esc(tweet.display || handle)}</a>
            <a class="handle" href="${esc(profileUrl)}" target="_blank" rel="noreferrer">@${esc(handle)}</a>
            <p class="serial">NO.${esc(tweet.id || "MANUAL")} · ${esc(shortTime(tweet.createdAt))}</p>
          </div>
        </div>
        ${stamp}
      </div>
      <p class="excerpt">${esc(clip(tweet.text, 180)) || "<span class='muted'>无文本</span>"}</p>
      <div class="tabs">
        <button type="button" data-tab="safety" class="${activeTab === "safety" ? "on" : ""}">安全</button>
        <button type="button" data-tab="score" class="${activeTab === "score" ? "on" : ""}">分数</button>
        <button type="button" data-tab="advice" class="${activeTab === "advice" ? "on" : ""}">建议</button>
      </div>
      <div class="tab-body">
        ${
          activeTab === "safety"
            ? `<div class="stats-mini">${miniStat("媒体", tweet.hasPhoto || tweet.hasVideo ? "有" : "无")}
               ${miniStat("链接", String(tweet.urls.length))}
               ${miniStat("@", String(safety.signals.mentions))}
               ${miniStat("垃圾分", String(safety.signals.spamScore))}</div>
               ${safetyBody}`
            : activeTab === "advice"
              ? adviceBody
              : `<div class="score-hero">
                 <p class="kicker">Σ 权重 × 估算 P · 缺项按 0</p>
                 <p class="score-num">${fmtPart(score.total)}</p>
                 <p class="muted">P ≈ 次数 / 浏览量。浏览 ${fmtInt(tweet.views)} · 赞 ${fmtInt(tweet.likes)} · 回复 ${fmtInt(tweet.replies)} · 转发 ${fmtInt(tweet.reposts)} · 引用 ${fmtInt(tweet.quotes)}</p>
               </div>
               ${agedOut ? `<p class="note">帖龄约 ${Math.round(age)} 小时，超过 48h 硬过滤，估算分再高也进不了 For You。</p>` : ""}
               ${tweet.views ? "" : `<p class="note">没读到浏览量，所有 P 记 0。可在下方补浏览量后重算。</p>`}
               <div class="toggles">
                 <label><input type="checkbox" data-opt="mutualOriginal" ${opts.mutualOriginal ? "checked" : ""}/> 互关原创（回复权重 +15）</label>
                 <label><input type="checkbox" data-opt="oon" ${opts.oon ? "checked" : ""}/> 非粉路径 ×0.75</label>
               </div>
               <div class="manual">
                 <label>浏览量 <input data-field="views" type="number" min="0" value="${tweet.views || ""}" placeholder="0"/></label>
                 <label>赞 <input data-field="likes" type="number" min="0" value="${tweet.likes || ""}"/></label>
                 <label>回复 <input data-field="replies" type="number" min="0" value="${tweet.replies || ""}"/></label>
                 <label>转发 <input data-field="reposts" type="number" min="0" value="${tweet.reposts || ""}"/></label>
                 <label>引用 <input data-field="quotes" type="number" min="0" value="${tweet.quotes || ""}"/></label>
               </div>
               <table class="grid">
                 <thead><tr><th>信号</th><th>权重</th><th>次数</th><th>P</th><th>贡献</th></tr></thead>
                 <tbody>${rows}</tbody>
               </table>
               <p class="muted tiny">复制链接 / 私信 / 关注 / 举报道等页面读不到，按 0。这不是 Phoenix 真实打分，只是公开互动对权重表的投影。</p>`
        }
      </div>
      <footer class="brand">
        <img class="brand-avatar" src="${esc(brandSrc)}" alt="@${esc(UTH.BRAND.handle)}"/>
        <div>
          <a href="${esc(UTH.BRAND.url)}" target="_blank" rel="noreferrer">@${esc(UTH.BRAND.handle)}</a>
          <p>vibe coded · 启发式对照开源规则</p>
        </div>
        <button type="button" class="download">下载报告</button>
      </footer>
    `;

    sheet.querySelector(".close").addEventListener("click", closePanel);
    sheet.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeTab = btn.getAttribute("data-tab");
        renderPanel();
      });
    });
    sheet.querySelectorAll("[data-opt]").forEach((el) => {
      el.addEventListener("change", () => {
        opts[el.getAttribute("data-opt")] = el.checked;
        renderPanel();
      });
    });
    sheet.querySelectorAll("[data-field]").forEach((el) => {
      el.addEventListener("change", () => {
        const key = el.getAttribute("data-field");
        currentTweet[key] = UTH.parseCompactNumber(el.value);
        renderPanel();
      });
    });
    const dl = sheet.querySelector(".download");
    if (dl) {
      dl.addEventListener("click", async () => {
        dl.textContent = "生成中…";
        try {
          await UTH.downloadPngReport({
            tweet: Object.assign({}, tweet, {
              avatarUrl: "",
              avatar: String(tweet.avatar || "").startsWith("data:") ? tweet.avatar : "",
            }),
            safety,
            score,
            advice,
            brandUrl: brandSrc,
          });
          dl.textContent = "已下载";
        } catch (e) {
          console.error("[UTH] download failed", e);
          dl.textContent = "失败，重试";
        }
      });
    }
  }

  function miniStat(k, v) {
    return `<div class="mini"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
  }

  function injectButton(article) {
    const group = article.querySelector("div[role='group']");
    if (!group) return;
    if (group.querySelector(".uth-probe-btn")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "uth-probe-btn";
    btn.setAttribute("aria-label", "UTH 探针");
    btn.innerHTML = `<span>探针</span>`;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      openPanel(scrapeArticle(article));
    });
    group.appendChild(btn);
  }

  function scan() {
    $all('article[data-testid="tweet"]').forEach(injectButton);
  }

  let scheduled = false;
  function scanSoon() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scan();
    });
  }

  const observer = new MutationObserver(scanSoon);
  observer.observe(document.body, { childList: true, subtree: true });
  scan();

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "UTH_GET_FOCUSED") {
      const articles = $all('article[data-testid="tweet"]');
      let article = articles[0];
      const href = location.href;
      if (/\/status\/\d+/.test(href)) {
        article = articles[0] || article;
      }
      sendResponse({ tweet: article ? scrapeArticle(article) : null });
      return true;
    }
    return false;
  });

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function clip(s, n) {
    const t = String(s || "");
    return t.length > n ? t.slice(0, n) + "…" : t;
  }
  function fmtInt(n) {
    const x = Number(n) || 0;
    return x.toLocaleString("zh-CN");
  }
  function fmtWeight(n) {
    return n > 0 ? "+" + n : String(n);
  }
  function fmtP(p) {
    if (!p) return "0";
    return p >= 0.01 ? p.toFixed(3) : p.toExponential(1);
  }
  function fmtPart(n) {
    if (!n) return "0";
    const abs = Math.abs(n);
    const s = abs >= 1 ? abs.toFixed(2) : abs.toFixed(4);
    return n < 0 ? "−" + s : s;
  }
  function shortTime(iso) {
    if (!iso) return "时间未知";
    try {
      return new Date(iso).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return "时间未知";
    }
  }

  const PANEL_CSS = `
    :host { all: initial; }
    .root { font-family: Charter, "Iowan Old Style", "Palatino Linotype", "Songti SC", serif; }
    .backdrop {
      position: fixed; inset: 0; background: rgba(8,7,5,.55); z-index: 2147483000;
    }
    .sheet {
      position: fixed; top: 12px; right: 12px; bottom: 12px; width: min(420px, calc(100vw - 24px));
      z-index: 2147483001; overflow: auto;
      background: #f3ead6;
      color: #1a140c;
      border: 1px solid #2a2116;
      box-shadow: 8px 8px 0 #0c0a07;
      padding: 22px 20px 28px;
    }
    .sheet:before {
      content: ""; position: absolute; left: 0; right: 0; top: 0; height: 8px;
      background: repeating-linear-gradient(90deg, #1a140c 0 10px, #c45c26 10px 20px, #1a140c 20px 30px, #2f6b3a 30px 40px);
    }
    .close {
      position: absolute; top: 16px; right: 12px; width: 32px; height: 32px;
      border: 1px solid #1a140c; background: transparent; cursor: pointer; font-size: 20px;
    }
    .kicker { margin: 0; font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: #6b5840; }
    h1 { margin: 4px 0 0; font-size: 22px; font-weight: 700; }
    .serial { margin: 4px 0 0; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11px; color: #6b5840; }
    .ticket-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-top: 10px; }
    .who { display: flex; gap: 12px; align-items: center; min-width: 0; }
    .avatar {
      width: 56px; height: 56px; border-radius: 50%; object-fit: cover;
      border: 2px solid #1a140c; background: #fff8ea; flex: none;
    }
    .avatar.fallback {
      display: grid; place-items: center; font-weight: 700; font-size: 20px; background: #1a140c; color: #f3ead6;
    }
    .who-meta { min-width: 0; }
    a.display {
      display: block; margin: 2px 0 0; font-size: 18px; font-weight: 700; color: inherit;
      text-decoration: none; line-height: 1.2; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    a.handle {
      display: inline-block; margin-top: 2px; font-family: ui-monospace, Menlo, monospace;
      font-size: 13px; color: #1a140c; text-decoration: none; border-bottom: 1px dashed #1a140c;
    }
    .excerpt { margin: 14px 0; font-size: 14px; line-height: 1.45; }
    .tip { border: 1px solid #1a140c; padding: 10px 12px; margin-bottom: 8px; background: #fff8ea; }
    .tip.alert { background: #fbe8e6; }
    .tip.good { background: #e7f4ea; }
    .tip.warn { background: #f8eedc; }
    .tip-title { margin: 0 0 4px; font-weight: 700; }
    .tip p { margin: 0; font-size: 12px; color: #4d3f2e; line-height: 1.45; }
    .brand {
      display: flex; align-items: center; gap: 10px; margin-top: 16px; padding-top: 12px;
      border-top: 1px dashed #1a140c;
    }
    .brand-avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 2px solid #1a140c; }
    .brand a { color: inherit; font-weight: 700; text-decoration: none; }
    .brand p { margin: 0; font-size: 11px; color: #6b5840; }
    .download {
      margin-left: auto; border: 1px solid #1a140c; background: #1a140c; color: #f3ead6;
      padding: 7px 10px; cursor: pointer; font: inherit; font-size: 12px;
    }
    .stamp {
      font-family: ui-monospace, Menlo, monospace; font-weight: 700; letter-spacing: .12em;
      border: 3px solid; padding: 8px 10px; transform: rotate(8deg); font-size: 13px;
    }
    .stamp-clear { color: #1f7a38; border-color: #1f7a38; background: rgba(46, 160, 67, .12); }
    .stamp-warn { color: #9a5b00; border-color: #c47b12; background: rgba(196, 123, 18, .12); }
    .stamp-alert { color: #a31b12; border-color: #a31b12; background: rgba(163, 27, 18, .1); }
    .tabs { display: flex; border-bottom: 1px solid #1a140c; gap: 0; margin: 8px 0 14px; }
    .tabs button {
      flex: 1; border: 0; background: transparent; padding: 8px; cursor: pointer;
      font: inherit; font-size: 14px; color: #6b5840;
    }
    .tabs button.on { color: #1a140c; box-shadow: inset 0 -2px 0 #1a140c; font-weight: 700; }
    .clear-block { padding: 18px; border: 2px solid #1f7a38; background: #e7f4ea; }
    .clear-kicker { margin: 0 0 8px; font-size: 18px; color: #1f7a38; font-weight: 700; }
    .muted { color: #6b5840; font-size: 12px; line-height: 1.5; }
    .tiny { font-size: 11px; margin-top: 10px; }
    .label-card { border: 1px solid #1a140c; padding: 12px; margin-bottom: 10px; background: #fff8ea; }
    .label-card.alert { background: #fbe8e6; }
    .label-card.warning, .label-card.warn { background: #f8eedc; }
    .label-card header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .label-card code { font-family: ui-monospace, Menlo, monospace; font-size: 11px; }
    .pill { font-size: 10px; letter-spacing: .08em; border: 1px solid currentColor; padding: 2px 6px; }
    .reason { margin: 8px 0 4px; font-weight: 700; font-size: 14px; }
    .effect, .evidence { margin: 0; font-size: 12px; color: #4d3f2e; }
    .stats-mini { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 12px; }
    .mini { border: 1px solid #1a140c; padding: 6px; text-align: center; }
    .mini span { display: block; font-size: 10px; color: #6b5840; }
    .mini b { font-size: 14px; }
    .score-hero { border: 2px solid #1a140c; padding: 14px; margin-bottom: 10px; background: #fff8ea; }
    .score-num { margin: 4px 0; font-size: 42px; font-family: ui-monospace, Menlo, monospace; line-height: 1; }
    .note { background: #efe0c4; border: 1px dashed #1a140c; padding: 8px 10px; font-size: 12px; }
    .toggles { display: flex; flex-direction: column; gap: 6px; margin: 10px 0; font-size: 13px; }
    .manual { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin: 8px 0 12px; }
    .manual label { font-size: 11px; color: #6b5840; display: flex; flex-direction: column; gap: 4px; }
    .manual input {
      border: 1px solid #1a140c; background: #fff8ea; padding: 6px; font: inherit; color: inherit;
    }
    table.grid { width: 100%; border-collapse: collapse; font-size: 11px; font-family: ui-monospace, Menlo, monospace; }
    table.grid th, table.grid td { border-bottom: 1px solid #d9c9a8; padding: 5px 4px; text-align: left; }
    table.grid .num { text-align: right; }
    table.grid .dim td { color: #9a8a72; }
    .pos { color: #1f7a38; }
    .neg { color: #a31b12; }
  `;

  const btnStyle = document.createElement("style");
  btnStyle.textContent = `
    button.uth-probe-btn {
      margin-left: 4px; height: 34px; padding: 0 10px; cursor: pointer;
      border: 1px solid rgba(231, 233, 234, .35); background: transparent; color: inherit;
      border-radius: 999px; font-size: 12px; font-weight: 700; letter-spacing: .04em;
    }
    button.uth-probe-btn:hover { background: rgba(255,255,255,.08); }
  `;
  document.documentElement.appendChild(btnStyle);
})();
