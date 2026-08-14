/**
 * UTH 探针 · 共享逻辑
 * 标签白名单与权重来自 xai-org/x-algorithm @ a389166（2026-08-13）
 * 安全检测是启发式对照，不是 X 官方实时标签。
 */
(function (root) {
  const UTH = root.UTHProbe || (root.UTHProbe = {});

  UTH.WEIGHTS = [
    { id: "copy_link", name: "复制链接", weight: 20, source: "none" },
    { id: "reply", name: "回复", weight: 5, source: "replies" },
    { id: "dm_share", name: "私信分享", weight: 5, source: "none" },
    { id: "quote", name: "引用", weight: 5, source: "quotes" },
    { id: "follow", name: "关注作者", weight: 4, source: "none" },
    { id: "share", name: "分享（泛）", weight: 2, source: "none" },
    { id: "retweet", name: "转发", weight: 1, source: "reposts" },
    { id: "favorite", name: "点赞", weight: 0.5, source: "likes" },
    { id: "click", name: "点击帖子", weight: 0.4, source: "none" },
    { id: "open_link", name: "打开链接", weight: 0.2, source: "none" },
    { id: "photo_expand", name: "展开图片", weight: 0.05, source: "none" },
    { id: "video_open", name: "打开视频", weight: 0.05, source: "none" },
    { id: "vqv", name: "视频合格观看", weight: 0.05, source: "none" },
    { id: "quoted_click", name: "点击引用帖", weight: 0.05, source: "none" },
    { id: "unexplored", name: "未探索加成", weight: 0.02, source: "none" },
    { id: "cont_dwell", name: "停留时长", weight: 0.004, source: "none" },
    { id: "dwell", name: "离散停留", weight: 0, source: "none" },
    { id: "profile_click", name: "主页点击", weight: 0, source: "none" },
    { id: "not_dwelled", name: "划走", weight: -0.02, source: "none" },
    { id: "block", name: "拉黑", weight: -31.2, source: "none" },
    { id: "not_interested", name: "不感兴趣", weight: -43.2, source: "none" },
    { id: "mute", name: "静音", weight: -58.8, source: "none" },
    { id: "report", name: "举报", weight: -234, source: "none" },
  ];

  UTH.REPLY_BOOST_MUTUAL = 15;
  UTH.OON_FACTOR = 0.75;
  UTH.MAX_AGE_HOURS = 48;

  UTH.LABELS = {
    NSFW_HIGH_RECALL: {
      about: "自动化系统认为可能含成人内容。",
      effect: "对非粉隐藏推荐；未成年 / 未填年龄 / 登出不可见。",
      kill: "oon",
    },
    NSFW_HIGH_PRECISION: {
      about: "自动化或用户举报，较可能含成人内容。",
      effect: "内容警告 + 对非粉隐藏推荐 + 年龄门控。",
      kill: "oon",
    },
    NSFW_TEXT: {
      about: "文本含成人露骨用语。",
      effect: "对非粉隐藏推荐 + 年龄门控（可无媒体）。",
      kill: "oon",
    },
    NSFW_CARD_IMAGE: {
      about: "卡片/链接预览图可能含成人内容。",
      effect: "警告 + 对非粉隐藏 + 年龄门控。",
      kill: "oon",
    },
    GORE_AND_VIOLENCE_HIGH_PRECISION: {
      about: "较可能含暴力/血腥内容。",
      effect: "警告 + 对非粉隐藏推荐 + 年龄门控。",
      kill: "oon",
    },
    SPAM_HIGH_RECALL: {
      about: "自动化系统认为可能是垃圾内容。",
      effect: "对非粉隐藏推荐。",
      kill: "oon",
    },
    SPAM: {
      about: "较可能违反真实性政策。",
      effect: "整站不展示。",
      kill: "all",
    },
    MALICIOUS_URL: {
      about: "链接可能指向恶意站点。",
      effect: "对非粉隐藏推荐。",
      kill: "oon",
    },
    DO_NOT_AMPLIFY: {
      about: "历史恶意链接标签，正被 MALICIOUS_URL 替换。",
      effect: "对非粉隐藏推荐。",
      kill: "oon",
    },
    PDNA: {
      about: "可能违反服务条款，待审。",
      effect: "待审期间整站不展示。",
      kill: "all",
    },
    BOUNCE: {
      about: "判定违规，待作者删除。",
      effect: "整站不展示，直至删除。",
      kill: "all",
    },
    FOSNR_ABUSE: {
      about: "可能违反欺凌骚扰政策。",
      effect: "可发现性限制在作者主页。",
      kill: "all",
    },
    FOSNR_HATEFUL_CONDUCT: {
      about: "可能违反仇恨行为政策。",
      effect: "可发现性限制在作者主页。",
      kill: "all",
    },
    FOSNR_VIOLENT_SPEECH: {
      about: "可能违反暴力内容政策。",
      effect: "可发现性限制在作者主页。",
      kill: "all",
    },
    FOSNR_CIVIC_INTEGRITY: {
      about: "可能违反公民诚信政策。",
      effect: "可发现性限制在作者主页。",
      kill: "all",
    },
    FOSNR_ABUSE_INSULTS: {
      about: "针对性辱骂/侮辱。",
      effect: "对非粉隐藏推荐。",
      kill: "oon",
    },
  };

  function parseCompactNumber(raw) {
    if (raw == null || raw === "") return 0;
    const s = String(raw).trim().replace(/,/g, "").replace(/\s/g, "").toLowerCase();
    if (!s || s === "undefined") return 0;
    const yi = s.match(/^([\d.]+)亿$/);
    if (yi) return Math.round(parseFloat(yi[1]) * 1e8);
    const wan = s.match(/^([\d.]+)万$/);
    if (wan) return Math.round(parseFloat(wan[1]) * 1e4);
    const m = s.match(/^([\d.]+)m$/);
    if (m) return Math.round(parseFloat(m[1]) * 1e6);
    const k = s.match(/^([\d.]+)k$/);
    if (k) return Math.round(parseFloat(k[1]) * 1e3);
    const n = parseFloat(s.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? Math.round(n) : 0;
  }

  UTH.parseCompactNumber = parseCompactNumber;

  function clamp01(n) {
    if (!Number.isFinite(n) || n < 0) return 0;
    return n > 1 ? 1 : n;
  }

  function rate(count, views) {
    const c = Number(count) || 0;
    const v = Number(views) || 0;
    if (v <= 0) return 0;
    return clamp01(c / v);
  }

  UTH.estimateScore = function estimateScore(metrics, opts) {
    const m = metrics || {};
    const options = opts || {};
    const views = Number(m.views) || 0;
    const likes = Number(m.likes) || 0;
    const replies = Number(m.replies) || 0;
    const reposts = Number(m.reposts) || 0;
    const quotes = Number(m.quotes) || 0;

    const counts = {
      copy_link: 0,
      reply: replies,
      dm_share: 0,
      quote: quotes,
      follow: 0,
      share: 0,
      retweet: reposts,
      favorite: likes,
      click: 0,
      open_link: 0,
      photo_expand: 0,
      video_open: 0,
      vqv: 0,
      quoted_click: 0,
      unexplored: 0,
      cont_dwell: 0,
      dwell: 0,
      profile_click: 0,
      not_dwelled: 0,
      block: 0,
      not_interested: 0,
      mute: 0,
      report: 0,
    };

    const rows = UTH.WEIGHTS.map((item) => {
      let weight = item.weight;
      if (item.id === "reply" && options.mutualOriginal) {
        weight = item.weight + UTH.REPLY_BOOST_MUTUAL;
      }
      const count = counts[item.id] || 0;
      const p = rate(count, views);
      const part = weight * p;
      return {
        id: item.id,
        name: item.name,
        weight,
        count,
        p,
        part,
        missing: item.source === "none",
      };
    });

    let total = rows.reduce((sum, row) => sum + row.part, 0);
    if (options.oon) total *= UTH.OON_FACTOR;

    return {
      total,
      views,
      rows,
      oon: Boolean(options.oon),
      mutualOriginal: Boolean(options.mutualOriginal),
    };
  };

  const NSFW_HARD = [
    /\bonlyfans\b/i,
    /\bporn\b/i,
    /\bnsfw\b/i,
    /\bxxx\b/i,
    /色情片/,
    /约炮/,
    /裸聊/,
    /性爱视频/,
    /成人影片/,
    /\bsex\s*tape\b/i,
    /\bnudes?\b/i,
    /\bcum\b/i,
    /\bfellatio\b/i,
  ];

  const NSFW_SOFT = [
    /\bsexy\b/i,
    /裸照/,
    /内衣照/,
    /擦边/,
    /性感自拍/,
    /漏点/,
    /\bboobs?\b/i,
    /\bthong\b/i,
    /情色/,
  ];

  const NSFW_TEXT_ONLY = [
    /\bfuck\s+me\b/i,
    /鸡巴/,
    /阴茎/,
    /阴道/,
    /口交/,
    /\bcock\b/i,
    /\bpussy\b/i,
    /\bdick pic\b/i,
  ];

  const GORE = [
    /斩首/,
    /肢解/,
    /开膛/,
    /\bgore\b/i,
    /\bbeheading\b/i,
    /血腥视频/,
    /虐杀视频/,
    /\bguts?\s+spilling\b/i,
  ];

  const SPAM_PHRASES = [
    /求互关/,
    /互粉/,
    /加微信/,
    /私信领取/,
    /点击链接/,
    /限时免费/,
    /免费领取/,
    /转赞评/,
    /点赞关注/,
    /like\s*and\s*rt/i,
    /follow\s*me\s*and/i,
    /dm\s+me\s+for/i,
    /airdrop\s+claim/i,
    /connect\s+wallet/i,
    /免费空投/,
    /保证回本/,
    /稳赚不赔/,
  ];

  const HATE = [
    /\bniggers?\b/i,
    /\bkikes?\b/i,
    /\bchinks?\b/i,
    /种族灭绝/,
    /滚回.*国/,
  ];

  const INSULT_TARGET = [
    /你这个?(废物|傻逼|白痴|智障)/,
    /去死吧/,
    /\byou\s+(are|re)\s+(a\s+)?(idiot|moron|retard|loser)\b/i,
    /\bkill\s+yourself\b/i,
  ];

  const VIOLENT_SPEECH = [
    /我要杀/,
    /弄死你/,
    /\bi('?ll| will)\s+kill\s+you\b/i,
    /\bshoot\s+up\b/i,
    /炸弹就在/,
  ];

  const SELF_HARM = [
    /自杀教程/,
    /自杀方法/,
    /怎么自杀/,
    /\bhow\s+to\s+kill\s+yourself\b/i,
    /割腕教程/,
  ];

  const CIVIC = [
    /投票机被黑/,
    /假选票工厂/,
    /\bstolen\s+election\s+machines?\b/i,
    /伪造选民名册/,
  ];

  const SHORTENERS = [
    "bit.ly",
    "tinyurl.com",
    "cutt.ly",
    "rb.gy",
    "ow.ly",
    "t.ly",
    "is.gd",
    "buff.ly",
  ];

  function countMatches(text, patterns) {
    let n = 0;
    const hits = [];
    for (const re of patterns) {
      if (re.test(text)) {
        n += 1;
        hits.push(re.source.replace(/\\b/g, "").replace(/\\s\+/g, " "));
      }
    }
    return { n, hits };
  }

  function unique(arr) {
    return Array.from(new Set(arr));
  }

  UTH.analyzeSafety = function analyzeSafety(tweet) {
    const t = tweet || {};
    const text = String(t.text || "");
    const urls = Array.isArray(t.urls) ? t.urls : [];
    const hasMedia = Boolean(t.hasPhoto || t.hasVideo || t.hasGif);
    const hasCard = Boolean(t.hasCard);
    const mentions = (text.match(/@[A-Za-z0-9_]+/g) || []).length;
    const hashtags = (text.match(/#[^\s#]+/g) || []).length;
    const urlCount = urls.length + (text.match(/https?:\/\//g) || []).length;
    const repeat = /(.)\1{7,}/.test(text);
    const caps = text.length > 20 && (text.replace(/[^A-Z]/g, "").length / text.replace(/[^A-Za-z]/g, "").length) > 0.7;

    const matches = [];

    const nsfwText = countMatches(text, NSFW_TEXT_ONLY);
    if (nsfwText.n) {
      matches.push(hit("NSFW_TEXT", "warn", nsfwText.hits, "文本命中露骨用语"));
    }

    const nsfwHard = countMatches(text, NSFW_HARD);
    const nsfwSoft = countMatches(text, NSFW_SOFT);
    if (nsfwHard.n && hasMedia) {
      matches.push(hit("NSFW_HIGH_PRECISION", "warn", nsfwHard.hits, "成人用语 + 媒体"));
      matches.push(hit("NSFW_HIGH_RECALL", "warn", nsfwHard.hits, "成人内容高召回"));
    } else if (nsfwHard.n || (nsfwSoft.n && hasMedia)) {
      matches.push(hit("NSFW_HIGH_RECALL", "warn", unique(nsfwHard.hits.concat(nsfwSoft.hits)), "可能含成人内容"));
    }

    if ((nsfwHard.n || nsfwSoft.n) && (hasCard || urlCount > 0) && !hasMedia) {
      matches.push(hit("NSFW_CARD_IMAGE", "warn", ["链接卡片 + 成人信号"], "卡片预览可能被打成人标"));
    }

    const gore = countMatches(text, GORE);
    if (gore.n && hasMedia) {
      matches.push(hit("GORE_AND_VIOLENCE_HIGH_PRECISION", "warn", gore.hits, "暴力描写 + 媒体"));
    } else if (gore.n) {
      matches.push(hit("GORE_AND_VIOLENCE_HIGH_PRECISION", "warn", gore.hits, "暴力/血腥用语"));
    }

    let spamScore = 0;
    const spamWhy = [];
    const spamPhrases = countMatches(text, SPAM_PHRASES);
    spamScore += spamPhrases.n * 2;
    if (spamPhrases.n) spamWhy.push("营销/互关话术");
    if (mentions >= 5) {
      spamScore += 2;
      spamWhy.push("@ 过多");
    }
    if (hashtags >= 6) {
      spamScore += 2;
      spamWhy.push("标签堆砌");
    }
    if (urlCount >= 3) {
      spamScore += 2;
      spamWhy.push("链接过多");
    }
    if (repeat) {
      spamScore += 2;
      spamWhy.push("重复字符");
    }
    if (caps) {
      spamScore += 1;
      spamWhy.push("全大写喊话");
    }
    if (text.length < 8 && urlCount >= 1) {
      spamScore += 1;
      spamWhy.push("短文塞链接");
    }
    if (spamScore >= 6) {
      matches.push(hit("SPAM", "alert", spamWhy, "垃圾信号很强，可能整站不可见"));
    } else if (spamScore >= 3) {
      matches.push(hit("SPAM_HIGH_RECALL", "warn", spamWhy, "垃圾信号，可能对非粉隐藏"));
    }

    const urlBlob = urls.join(" ").toLowerCase();
    const shortHit = SHORTENERS.filter((d) => urlBlob.includes(d));
    const phish = /airdrop|connect-wallet|free-mint|claim-now|walletconnect/i.test(urlBlob + text);
    if (phish || (shortHit.length && /钱包|空投|claim|mint/i.test(text))) {
      matches.push(
        hit(
          "MALICIOUS_URL",
          "warn",
          shortHit.concat(phish ? ["钓鱼话术"] : []),
          "链接像恶意站或诈骗页"
        )
      );
      matches.push(hit("DO_NOT_AMPLIFY", "warn", ["恶意链接族"], "历史 DNA 同类效果"));
    }

    const hate = countMatches(text, HATE);
    if (hate.n) {
      matches.push(hit("FOSNR_HATEFUL_CONDUCT", "alert", hate.hits, "仇恨群体攻击"));
    }

    const insult = countMatches(text, INSULT_TARGET);
    if (insult.n) {
      matches.push(hit("FOSNR_ABUSE_INSULTS", "warn", insult.hits, "针对性辱骂"));
      matches.push(hit("FOSNR_ABUSE", "alert", insult.hits, "欺凌骚扰风险"));
    }

    const violent = countMatches(text, VIOLENT_SPEECH);
    if (violent.n) {
      matches.push(hit("FOSNR_VIOLENT_SPEECH", "alert", violent.hits, "暴力威胁言论"));
    }

    const civic = countMatches(text, CIVIC);
    if (civic.n) {
      matches.push(hit("FOSNR_CIVIC_INTEGRITY", "alert", civic.hits, "公民诚信相关指控"));
    }

    const harm = countMatches(text, SELF_HARM);
    if (harm.n) {
      matches.push(hit("BOUNCE", "alert", harm.hits, "自残鼓励类内容可能直接下架"));
    }

    const seen = new Set();
    const deduped = [];
    for (const item of matches) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      deduped.push(item);
    }

    const worst = deduped.some((x) => x.level === "alert")
      ? "alert"
      : deduped.length
        ? "warn"
        : "clear";

    return {
      status: worst,
      matches: deduped,
      signals: {
        hasMedia,
        hasCard,
        mentions,
        hashtags,
        urlCount,
        spamScore,
      },
    };
  };

  function hit(id, level, evidence, reason) {
    const meta = UTH.LABELS[id] || { about: "", effect: "", kill: "oon" };
    return {
      id,
      level,
      reason,
      evidence: (evidence || []).slice(0, 4),
      about: meta.about,
      effect: meta.effect,
      kill: meta.kill,
    };
  }

  UTH.hoursAgo = function hoursAgo(iso) {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return null;
    return (Date.now() - t) / 36e5;
  };

  UTH.BRAND = {
    handle: "misaENFP",
    name: "Misa_OKX",
    url: "https://x.com/misaENFP",
  };

  UTH.stampOf = function stampOf(status) {
    if (status === "clear") return "CLEAR";
    if (status === "alert") return "HOLD";
    return "FLAG";
  };

  UTH.brandAvatarUrl = function brandAvatarUrl() {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
        return chrome.runtime.getURL("brand/misa.png");
      }
    } catch (e) {}
    return "brand/misa.png";
  };

  UTH.advise = function advise(tweet, safety, score, extra) {
    const t = tweet || {};
    const s = safety || { status: "clear", matches: [], signals: {} };
    const sc = score || { total: 0, views: 0, rows: [] };
    const age = UTH.hoursAgo(t.createdAt);
    const tips = [];
    const push = (level, title, body) => tips.push({ level, title, body });

    if (s.status === "alert") {
      push(
        "alert",
        "先处理标签，再谈流量",
        "命中了可能整站不可见或主页可见性受限的规则。分再高也进不了 For You。先改文本、链接和配图，去掉攻击、诈骗、自残鼓励这类信号。"
      );
    } else if (s.status === "warn") {
      const ids = (s.matches || []).map((m) => m.id).join("、");
      push(
        "warn",
        "非粉推荐可能被 Drop",
        "扫到：" +
          ids +
          "。粉丝时间线或许还在，For You 对陌生人通常直接隐藏。成人内容、垃圾话术、短链空投是最常见的原因。"
      );
    } else {
      push(
        "good",
        "公开规则没扫到红灯",
        "不等于 X 后台一定没打标，只说明这套开源白名单没有明显命中。接下来看互动结构，别把点赞当 KPI。"
      );
    }

    for (const m of s.matches || []) {
      if (m.id.indexOf("NSFW") === 0 || m.id.indexOf("GORE") === 0) {
        push(
          "warn",
          "成人/暴力信号会关掉非粉 For You",
          "有媒体时更容易打成高精度标签，还会触发 18 岁和未填年龄门控。擦边图、露骨用语能不用就不用。"
        );
        break;
      }
    }
    if ((s.matches || []).some((m) => m.id === "SPAM" || m.id === "SPAM_HIGH_RECALL")) {
      push(
        "warn",
        "互关、多链接、堆 @ 像垃圾帖",
        "少写求互关/免费领取，一条帖不要塞 3 个以上链接，也不要点名轰炸。互动诱饵（转赞评）小账号更容易被写成 SpamHighRecall。"
      );
    }
    if ((s.matches || []).some((m) => m.id === "MALICIOUS_URL" || m.id === "DO_NOT_AMPLIFY")) {
      push(
        "alert",
        "链接长得像诈骗页",
        "空投、连钱包、短链配「领取」话术，会走恶意链接标签。官方活动用可核对的主域，不要用 shorten。"
      );
    }

    if (age != null && age > UTH.MAX_AGE_HOURS) {
      push(
        "warn",
        "超过 48 小时，For You 已经关门",
        "AgeFilter 硬规则。这条只能吃关注流和主页，估算分没有推荐意义。"
      );
    }
    if (t.isReply || t.isRetweet) {
      push(
        "tip",
        "回复/转发很难进别人的 For You",
        "开源规则会丢掉非粉的转发和回复卡片。出圈发原创。互关加成也只打在原创帖上。"
      );
    }
    if (!t.views) {
      push(
        "tip",
        "没有浏览量，分数只能当 0",
        "P = 次数 / 浏览量。补上浏览量再看赞和回复谁在贡献。点进自己的帖，分析页一般能读到。"
      );
    } else {
      const likes = Number(t.likes) || 0;
      const replies = Number(t.replies) || 0;
      const quotes = Number(t.quotes) || 0;
      const views = Number(t.views) || 0;
      if (likes / views > 0.02 && replies / Math.max(likes, 1) < 0.08) {
        push(
          "tip",
          "赞在涨，但没人开口",
          "点赞权重只有 0.5，回复是 5。结尾留一个具体问题，或抛一个能被引用的判断，比再堆一波赞有用。"
        );
      }
      if (replies + quotes === 0 && likes > 0) {
        push(
          "tip",
          "缺最贵的两种正向",
          "引用和回复各 5 分。引导「你怎么看」比引导「去主页看看」强——主页点击权重是 0。"
        );
      }
    }

    const text = String(t.text || "");
    if (text.length > 0 && text.length < 28 && !(t.hasPhoto || t.hasVideo)) {
      push(
        "tip",
        "太短，停留和回复都难预测",
        "离散停留权重是 0，算法看你停了多久。短句配一张没信息量的图，很容易被划走磨掉。"
      );
    }
    if (t.hasVideo) {
      push(
        "tip",
        "视频至少 10 秒才有完播分",
        "VQV 有 10 秒门槛。开头 1 秒抓住人，否则 not_dwelled 会轻轻扣分。"
      );
    }
    push(
      "tip",
      "最贵的动作页面读不到",
      "复制链接权重 20，私信分享 5，举报 −234。工具里这些按 0。真想抬分：让人把链接发出去，同时别给举报和静音。"
    );

    const seen = new Set();
    return tips.filter((item) => {
      if (seen.has(item.title)) return false;
      seen.add(item.title);
      return true;
    }).slice(0, 6);
  };

  function loadImg(src) {
    return new Promise((resolve, reject) => {
      if (!src || !String(src).startsWith("data:")) {
        reject(new Error("no src"));
        return;
      }
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("img"));
      img.src = src;
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function asDataUrl(src) {
    if (!src) return "";
    if (String(src).startsWith("data:")) return src;
    try {
      const res = await fetch(src);
      if (!res.ok) return "";
      const blob = await res.blob();
      if (!blob || !blob.size) return "";
      return await blobToDataUrl(blob);
    } catch (e) {
      return "";
    }
  }

  async function saveFile(dataUrl, filename) {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        const res = await chrome.runtime.sendMessage({
          type: "UTH_DOWNLOAD",
          url: dataUrl,
          filename: filename,
        });
        if (res && res.ok) return;
      }
    } catch (e) {}
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.rel = "noopener";
    document.documentElement.appendChild(a);
    a.click();
    a.remove();
  }


  function circleImg(ctx, img, x, y, r) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#1a140c";
    ctx.stroke();
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    const chars = String(text || "").split("");
    let line = "";
    let used = 0;
    for (let i = 0; i < chars.length; i++) {
      const test = line + chars[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y);
        y += lineHeight;
        line = chars[i];
        used += 1;
        if (used >= maxLines - 1) {
          const rest = chars.slice(i).join("");
          let clipped = rest;
          while (ctx.measureText(clipped + "…").width > maxWidth && clipped.length) {
            clipped = clipped.slice(0, -1);
          }
          ctx.fillText(clipped + "…", x, y);
          return y + lineHeight;
        }
      } else {
        line = test;
      }
    }
    if (line) {
      ctx.fillText(line, x, y);
      y += lineHeight;
    }
    return y;
  }

  UTH.downloadPngReport = async function downloadPngReport(payload) {
    const tweet = payload.tweet || {};
    const safety = payload.safety || { status: "clear", matches: [] };
    const score = payload.score || { total: 0 };
    const advice = payload.advice || UTH.advise(tweet, safety, score);
    const w = 900;
    const h = 1200;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#f3ead6";
    ctx.fillRect(0, 0, w, h);
    const stripe = ["#1a140c", "#c45c26", "#1a140c", "#2f6b3a"];
    for (let i = 0; i < w / 28; i++) {
      ctx.fillStyle = stripe[i % stripe.length];
      ctx.fillRect(i * 28, 0, 28, 28);
    }
    ctx.strokeStyle = "#1a140c";
    ctx.lineWidth = 4;
    ctx.strokeRect(24, 48, w - 48, h - 72);

    ctx.fillStyle = "#6b5840";
    ctx.font = '16px ui-monospace, Menlo, "PingFang SC", sans-serif';
    ctx.fillText("UTH 探针  ·  FOR YOU 检验单", 56, 92);

    const avatarData = await asDataUrl(tweet.avatar || "");
    const brandData = await asDataUrl(payload.brandUrl || UTH.brandAvatarUrl());
    let avatarImg = null;
    let brandImg = null;
    try {
      avatarImg = await loadImg(avatarData);
    } catch (e) {}
    try {
      brandImg = await loadImg(brandData);
    } catch (e) {}

    const ax = 110;
    const ay = 168;
    if (avatarImg) {
      circleImg(ctx, avatarImg, ax, ay, 52);
    } else {
      ctx.beginPath();
      ctx.arc(ax, ay, 52, 0, Math.PI * 2);
      ctx.fillStyle = "#1a140c";
      ctx.fill();
      ctx.fillStyle = "#f3ead6";
      ctx.font = '36px "PingFang SC", Charter, serif';
      ctx.textAlign = "center";
      ctx.fillText((tweet.handle || "?").slice(0, 1).toUpperCase(), ax, ay + 12);
      ctx.textAlign = "left";
    }

    ctx.fillStyle = "#1a140c";
    ctx.font = '700 34px "PingFang SC", Charter, serif';
    ctx.fillText(String(tweet.display || tweet.handle || "未知作者").slice(0, 18), 180, 158);
    ctx.font = '22px ui-monospace, Menlo, "PingFang SC", sans-serif';
    ctx.fillText("@" + (tweet.handle || "unknown"), 180, 192);
    ctx.fillStyle = "#6b5840";
    ctx.font = '16px ui-monospace, Menlo, "PingFang SC", sans-serif';
    ctx.fillText("NO." + (tweet.id || "MANUAL"), 180, 218);

    const stamp = UTH.stampOf(safety.status);
    const stampColor =
      safety.status === "clear" ? "#1f7a38" : safety.status === "alert" ? "#a31b12" : "#9a5b00";
    ctx.save();
    ctx.translate(760, 168);
    ctx.rotate(0.12);
    ctx.strokeStyle = stampColor;
    ctx.lineWidth = 4;
    ctx.strokeRect(-70, -28, 140, 56);
    ctx.fillStyle = stampColor;
    ctx.font = '700 22px ui-monospace, Menlo, sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(stamp, 0, 8);
    ctx.textAlign = "left";
    ctx.restore();

    ctx.fillStyle = "#1a140c";
    ctx.font = '20px "PingFang SC", Charter, serif';
    wrapText(ctx, tweet.text || "（无文本）", 56, 270, w - 112, 30, 4);

    ctx.font = '16px ui-monospace, Menlo, "PingFang SC", sans-serif';
    ctx.fillStyle = "#6b5840";
    ctx.fillText("估算分  Σ w × P", 56, 420);
    ctx.fillStyle = "#1a140c";
    ctx.font = '700 72px ui-monospace, Menlo, sans-serif';
    const total = score && Number.isFinite(score.total) ? score.total : 0;
    const abs = Math.abs(total);
    const scoreText = (total < 0 ? "−" : "") + (abs >= 1 ? abs.toFixed(2) : abs.toFixed(4));
    ctx.fillText(scoreText, 56, 490);
    ctx.font = '16px ui-monospace, Menlo, "PingFang SC", sans-serif';
    ctx.fillStyle = "#6b5840";
    ctx.fillText(
      "浏览 " +
        tNum(tweet.views) +
        "  ·  赞 " +
        tNum(tweet.likes) +
        "  ·  回复 " +
        tNum(tweet.replies) +
        "  ·  转发 " +
        tNum(tweet.reposts),
      56,
      526
    );

    ctx.fillStyle = "#1a140c";
    ctx.font = '700 22px "PingFang SC", Charter, serif';
    ctx.fillText("建议", 56, 580);
    let y = 616;
    for (const tip of advice.slice(0, 4)) {
      ctx.fillStyle = tip.level === "alert" ? "#a31b12" : tip.level === "good" ? "#1f7a38" : "#1a140c";
      ctx.font = '700 18px "PingFang SC", Charter, serif';
      ctx.fillText("· " + tip.title, 56, y);
      y += 28;
      ctx.fillStyle = "#4d3f2e";
      ctx.font = '16px "PingFang SC", Charter, serif';
      y = wrapText(ctx, tip.body, 76, y, w - 140, 24, 3) + 12;
    }

    if (brandImg) circleImg(ctx, brandImg, 88, h - 88, 26);
    ctx.fillStyle = "#1a140c";
    ctx.font = '700 18px "PingFang SC", Charter, serif';
    ctx.fillText("@" + UTH.BRAND.handle, 128, h - 96);
    ctx.fillStyle = "#6b5840";
    ctx.font = '14px ui-monospace, Menlo, sans-serif';
    ctx.fillText(UTH.BRAND.url.replace("https://", ""), 128, h - 74);

    const blob = await new Promise((resolve, reject) => {
      try {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob empty"))), "image/png");
      } catch (e) {
        reject(e);
      }
    });
    const dataUrl = await blobToDataUrl(blob);
    const filename = "uth-" + (tweet.handle || "report") + "-" + (tweet.id || "draft") + ".png";
    await saveFile(dataUrl, filename);
  };

  function tNum(n) {
    return (Number(n) || 0).toLocaleString("zh-CN");
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
