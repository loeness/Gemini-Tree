(() => {
  if (window.__GCT_OVERLAY__) {
    return;
  }
  window.__GCT_OVERLAY__ = true;

  const PANEL_ID = "gct-panel";
  const LAUNCHER_ID = "gct-launcher";
  const STORAGE_KEY = "gct-panel-state-v1";
  const LLM_STORAGE_KEY = "gct-llm-settings-v1";
  const MIN_WIDTH = 320;
  const MIN_HEIGHT = 320;

  const DEFAULT_STATE = {
    x: 24,
    y: 84,
    width: 420,
    height: 620,
    minimized: false,
    visible: true
  };

  const DEFAULT_LLM_SETTINGS = {
    analysisMode: "local",
    enabled: false,
    provider: "pollinations",
    baseUrl: "https://text.pollinations.ai/openai",
    model: "openai-large",
    temperature: 0.2,
    chunkSize: 26
  };

  const STOP_WORDS = new Set([
    "please", "could", "would", "should", "what", "when", "where", "which", "this", "that", "then", "with", "from",
    "about", "have", "has", "were", "been", "into", "your", "them", "they", "their", "there", "here", "than",
    "the", "and", "for", "are", "you", "can", "not", "use", "how", "why", "let", "const", "function",
    "said", "says", "saying", "ppl", "people", "thing", "things", "stuff", "okay", "ok", "yeah", "yep",
    "just", "really", "maybe", "also", "like", "need", "needs", "want", "wants", "make", "makes", "made",
    "一个", "这个", "那个", "可以", "需要", "然后", "我们", "你们", "他们", "但是", "因为", "如果", "以及", "或者", "就是", "进行",
    "要求", "总结", "内容", "对话", "插件", "浮空", "浏览器", "edge", "gemini"
  ]);

  const TOKEN_NORMALIZATION = {
    ppl: "people",
    ppls: "people",
    devs: "developer",
    dev: "developer",
    uxui: "ui",
    frontend: "front-end",
    backend: "back-end"
  };

  const NOISY_TOKENS = new Set([
    "people", "person", "someone", "somebody", "anything", "something", "thing", "things", "stuff",
    "said", "says", "saying", "tell", "tells", "told", "ask", "asks", "asked",
    "good", "great", "nice", "fine", "okay", "ok", "yeah", "yep",
    "really", "maybe", "simply", "basically", "actually", "just",
    "problem", "issue", "question", "answer"
  ]);

  const CODE_STOP_WORDS = new Set([
    "true", "false", "null", "undefined", "length", "node", "string", "number",
    "boolean", "let", "const", "var", "function", "return", "import", "export",
    "class", "this", "that", "error", "index", "value", "key", "data", "type"
  ]);

  const SHORT_TOKEN_ALLOWLIST = new Set(["ui", "ux", "api", "sdk", "css", "html", "json", "http", "sql"]);

  const CHINESE_GENERIC_TOKENS = new Set([
    "哪些", "什么", "如何", "怎么", "部分", "分别", "方面", "类型", "情况", "东西",
    "方案", "问题", "内容", "总结", "概括", "回答", "方式", "方法", "建议", "需要", "可以", "应该",
    "详细", "完整", "解释", "例子", "举例", "说明", "分析", "探讨", "相关", "一段", "这段", "这个", "那个", "举个"
  ]);

  const FOLLOWUP_REFERENTIAL_PATTERNS = [
    /^(那|这个|那个|它|他|她|其|再|然后|继续|顺便|另外|同样)/,
    /^第\s*\d+\s*行/,
    /第\s*\d+\s*行/,
    /(改成|改为|换成|第二个|第三个|上一个|上面那个|前面的)/
  ];

  const NOISE_LINE_PATTERNS = [
    /^(好的|当然|没问题|可以的|我来|以下是|下面是|首先|接下来|希望这能|如有需要|还有其他问题|请告诉我)/i,
    /^(sure|okay|alright|great|no problem|i can help|here is|here's|let me|hope this helps)/i,
    /(如有疑问|希望对你有帮助|欢迎继续提问|还有问题吗|if you need|let me know)/i
  ];

  const STACK_TRACE_KEYWORD_PATTERN = /(exception|error|traceback|syntaxerror|typeerror|valueerror|nameerror|indexerror|keyerror|referenceerror|module not found|segmentation fault|fatal)/i;

  const ACTION_REGEX = /(?:帮我|请你|请|尝试|麻烦)?(?:给我)?(写|解释|分析|总结|翻译|优化|生成|实现|讲解|排查|修复|对比|评估)(.{2,25}?)(?:的代码|的方法|的原理|的内容|方案|实现|问题)?(?:[。！!？?]|\n|$)/;
  const QUESTION_WORD_PATTERN = /(什么|怎么|如何|为什么|哪|吗|么|是否|能否|可否|who|what|how|why|where|which)/i;
  const LEADING_CONNECTOR_PATTERN = /^(那么|所以|然后|那|请问|另外|顺便|最后|此外|并且|而且|因此)\s*/;
  // 将末尾的 + 改为 *，兼容无空格/标点的文本强行粘连
  const UI_QUOTE_PREFIX_PATTERN = /^(?:Gemini\s+said|You\s+said|You\s+asked|You|User|Gemini|Model|Assistant|你说(?:过)?|你问|你刚才说)[\s:：,，"“']*/i;
  const PURE_CONTINUATION_PATTERN = /^(继续|然后|再来|报错了|不对|没用|不行|换成|改为|那|这个|那个|它|再试试|还是不行)/;
  const TRAILING_MOOD_PATTERN = /(吗|呢|吧|啊|呀|么)[?？]*$/;
  const SUMMARY_TRIM_STOP_WORDS = /(相关(的)?(内容|代码|问题|方案)|这个问题|这个内容|的方法|的原理|的实现)$/;
  const LIFECYCLE_LABELS = {
    concept: "概念与探讨",
    implementation: "方案与代码",
    debug: "报错与Debug",
    followups: "追问与细节"
  };
  const LIFECYCLE_ORDER = [
    LIFECYCLE_LABELS.concept,
    LIFECYCLE_LABELS.implementation,
    LIFECYCLE_LABELS.debug,
    LIFECYCLE_LABELS.followups
  ];

  let panelState = { ...DEFAULT_STATE };
  let panel;
  let launcher;
  let treeContainer;
  let metaContainer;
  let subtitle;
  let analysisRunning = false;
  let queuedAnalyzeArgs = null;
  let lastRenderedFingerprint = "";
  let autoRefreshSuspendedUntil = 0;

  function sleep(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function debounce(fn, delay) {
    let timer = null;
    return (...args) => {
      if (timer) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(() => {
        fn(...args);
      }, delay);
    };
  }

  function normalizeText(input) {
    return (input || "")
      .replace(/\u00A0/g, " ")
      .replace(/\r/g, "")
      .replace(/[\t\f\v ]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function stripNoiseSentences(text) {
    const raw = normalizeText(text || "");
    if (!raw) {
      return "";
    }

    const lines = raw
      .split(/\n+/g)
      .map((x) => x.trim())
      .filter(Boolean)
      .filter((line) => !NOISE_LINE_PATTERNS.some((pattern) => pattern.test(line)));

    if (lines.length === 0) {
      return raw;
    }

    return normalizeText(lines.join("\n"));
  }

  function extractFirstEffectiveSentence(text) {
    const cleaned = stripNoiseSentences(text || "");
    const parts = cleaned
      .split(/[。！？!?\n]/g)
      .map((x) => x.trim())
      .filter(Boolean)
      .filter((x) => x.length >= 4);

    return parts[0] || cleaned.slice(0, 26) || "未命名问题";
  }

  function clipBySemanticBoundary(text, maxLen = 20, suffix = "...") {
    const input = normalizeText(text || "");
    if (!input) {
      return "";
    }

    if (input.length <= maxLen) {
      return input;
    }

    const boundaryRegex = /[\s,，;；:：/()（）]/g;
    let best = -1;
    let match = null;
    while ((match = boundaryRegex.exec(input)) !== null) {
      if (match.index <= maxLen && match.index >= Math.floor(maxLen * 0.55)) {
        best = match.index;
      }
      if (match.index > maxLen) {
        break;
      }
    }

    if (best > 0) {
      return `${input.slice(0, best).trim()}${suffix}`;
    }

    return `${input.slice(0, maxLen).trim()}${suffix}`;
  }

  function extractPriorityMarkdownSegments(text) {
    const input = String(text || "");
    const headingMatches = input.match(/^\s{0,3}#{1,3}\s+.+$/gm) || [];
    const listMatches = input.match(/^\s*(?:[-*]|\d+\.)\s+.+$/gm) || [];
    const boldMatches = Array.from(input.matchAll(/\*\*([^*\n]{2,120})\*\*/g)).map((m) => m[1]);

    const headings = headingMatches.map((x) => x.replace(/^\s{0,3}#{1,3}\s+/, "").trim()).filter(Boolean);
    const lists = listMatches.map((x) => x.replace(/^\s*(?:[-*]|\d+\.)\s+/, "").trim()).filter(Boolean);
    const bolds = boldMatches.map((x) => x.trim()).filter(Boolean);

    return {
      headings,
      lists,
      bolds
    };
  }

  function extractStackTraceTailSignals(text) {
    const input = String(text || "");
    const blocks = Array.from(input.matchAll(/```([\s\S]*?)```/g)).map((m) => m[1]);
    const hits = [];

    for (const block of blocks) {
      const lines = String(block)
        .split(/\n/g)
        .map((x) => x.trim())
        .filter(Boolean);

      if (lines.length === 0) {
        continue;
      }

      const tail = lines.slice(Math.max(0, lines.length - 14));
      for (let i = tail.length - 1; i >= 0; i -= 1) {
        const line = tail[i];
        if (STACK_TRACE_KEYWORD_PATTERN.test(line)) {
          hits.push(line);
          if (hits.length >= 4) {
            break;
          }
        }
      }
      if (hits.length >= 4) {
        break;
      }
    }

    return hits;
  }

  function buildFeatureTextFromPair(pair) {
    const question = stripNoiseSentences(pair && pair.question ? pair.question : "");
    const answer = stripNoiseSentences(pair && pair.answer ? pair.answer : "");

    const qSeg = extractPriorityMarkdownSegments(question);
    const aSeg = extractPriorityMarkdownSegments(answer);
    const traceSignals = extractStackTraceTailSignals(answer);

    const weighted = [question, answer];

    for (const heading of [...qSeg.headings, ...aSeg.headings]) {
      weighted.push(heading, heading, heading);
    }

    for (const item of [...qSeg.lists, ...aSeg.lists].slice(0, 16)) {
      weighted.push(item, item);
    }

    for (const item of [...qSeg.bolds, ...aSeg.bolds].slice(0, 14)) {
      weighted.push(item, item, item);
    }

    for (const tail of traceSignals) {
      weighted.push(tail, tail, tail, tail);
    }

    return normalizeText(weighted.filter(Boolean).join("\n"));
  }

  function detectAskIntent(question) {
    const q = normalizeText(question || "");
    const tokenCount = tokenizeForKeywords(q).length;
    const compact = q.replace(/[\s\n]+/g, "");
    const isShort = compact.length <= 22 || tokenCount <= 2;
    const hasReference = FOLLOWUP_REFERENTIAL_PATTERNS.some((pattern) => pattern.test(q));
    const hasStrongEntity = tokenCount >= 3;

    return {
      isFollowUpCandidate: isShort && (hasReference || !hasStrongEntity),
      isShort,
      hasReference,
      hasStrongEntity
    };
  }

  function extractTextFromNode(node) {
    if (!node) {
      return "";
    }
    const clone = node.cloneNode(true);
    clone
      .querySelectorAll(`#${PANEL_ID}, #${LAUNCHER_ID}, button, svg, style, script, noscript, [aria-hidden='true']`)
      .forEach((el) => el.remove());
    return normalizeText(clone.innerText || clone.textContent || "");
  }

  function detectRole(node) {
    if (!node) {
      return "unknown";
    }

    if (
      node.matches("user-query") ||
      node.matches("[data-message-author-role='user']") ||
      node.matches("[data-role='user']")
    ) {
      return "user";
    }

    if (
      node.matches("model-response") ||
      node.matches("[data-message-author-role='model']") ||
      node.matches("[data-role='assistant']")
    ) {
      return "gemini";
    }

    const tagName = (node.tagName || "").toLowerCase();
    const className = (node.className || "").toString().toLowerCase();
    const roleAttrs = [
      node.getAttribute("data-message-author-role"),
      node.getAttribute("data-author-role"),
      node.getAttribute("data-role"),
      node.getAttribute("data-author"),
      node.getAttribute("aria-label")
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const combined = `${tagName} ${className} ${roleAttrs}`;

    if (
      combined.includes("user-query") ||
      combined.includes("author-role=user") ||
      combined.includes("role=user") ||
      combined.includes("prompt")
    ) {
      return "user";
    }

    if (
      combined.includes("model-response") ||
      combined.includes("gemini") ||
      combined.includes("assistant") ||
      combined.includes("author-role=model") ||
      combined.includes("role=assistant") ||
      combined.includes("response")
    ) {
      return "gemini";
    }

    if (node.closest("user-query")) {
      return "user";
    }

    if (node.closest("model-response")) {
      return "gemini";
    }

    return "unknown";
  }

  function collectCandidates(primarySelector) {
    return Array.from(document.querySelectorAll(primarySelector)).filter((el) => {
      if (!el || !el.isConnected) {
        return false;
      }
      if (el.id === PANEL_ID || el.closest(`#${PANEL_ID}`)) {
        return false;
      }
      const text = extractTextFromNode(el);
      return text.length >= 8;
    });
  }

  function getNodeDepth(node) {
    let depth = 0;
    let current = node;
    while (current && current.parentElement) {
      depth += 1;
      current = current.parentElement;
    }
    return depth;
  }

  function compareNodeOrder(a, b) {
    if (a === b) {
      return 0;
    }
    const pos = a.compareDocumentPosition(b);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) {
      return -1;
    }
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) {
      return 1;
    }
    return 0;
  }

  function extractConversationTurns() {
    const directSelector = [
      "user-query",
      "model-response",
      "[data-message-author-role='user']",
      "[data-message-author-role='model']",
      "[data-message-author-role]",
      "[data-author-role]",
      "[data-role='user']",
      "[data-role='assistant']",
      "[class*='user-query']",
      "[class*='model-response']",
      "[class*='conversation-turn']",
      "[class*='message']"
    ].join(",");

    const nodes = collectCandidates(directSelector);

    const records = nodes
      .map((el, index) => ({
        el,
        index,
        role: detectRole(el),
        text: extractTextFromNode(el),
        depth: getNodeDepth(el)
      }))
      .filter((x) => (x.role === "user" || x.role === "gemini") && x.text.length >= 4)
      .sort((a, b) => a.depth - b.depth || a.index - b.index);

    const filtered = [];

    for (const item of records) {
      const duplicatedByParent = filtered.some((kept) => {
        if (kept.role !== item.role) {
          return false;
        }
        if (!kept.el.contains(item.el)) {
          return false;
        }
        return kept.text === item.text || kept.text.includes(item.text);
      });

      if (duplicatedByParent) {
        continue;
      }

      for (let i = filtered.length - 1; i >= 0; i -= 1) {
        const kept = filtered[i];
        if (kept.role !== item.role) {
          continue;
        }
        if (!item.el.contains(kept.el)) {
          continue;
        }
        if (item.text === kept.text || item.text.includes(kept.text)) {
          filtered.splice(i, 1);
        }
      }

      filtered.push(item);
    }

    filtered.sort((a, b) => compareNodeOrder(a.el, b.el) || a.index - b.index);

    const merged = [];

    for (const item of filtered) {
      const last = merged[merged.length - 1];
      if (last && last.role === item.role) {
        last.text = normalizeText(`${last.text}\n${item.text}`);
      } else {
        merged.push({
          role: item.role,
          text: item.text
        });
      }
    }

    const compact = [];
    for (const turn of merged) {
      const prev = compact[compact.length - 1];
      if (prev && prev.role === turn.role && prev.text === turn.text) {
        continue;
      }
      compact.push(turn);
    }

    return compact.map((turn, index) => ({
      ...turn,
      id: index + 1
    }));
  }

  function buildQaPairs(turns) {
    const usable = turns.filter((x) => x && x.text && x.text.length >= 2);
    if (usable.length === 0) {
      return [];
    }

    const knownRoles = usable.filter((x) => x.role === "user" || x.role === "gemini").length;
    const normalizedTurns = knownRoles >= Math.max(2, Math.floor(usable.length / 2))
      ? usable
      : usable.map((x, idx) => ({
          ...x,
          role: idx % 2 === 0 ? "user" : "gemini"
        }));

    const pairs = [];
    let startedFromFirstQuestion = false;
    let questionParts = [];
    let answerParts = [];
    let pairId = 1;

    function finalizePair() {
      if (questionParts.length === 0) {
        return;
      }
      pairs.push({
        id: pairId,
        question: normalizeText(questionParts.join("\n")),
        answer: normalizeText(answerParts.join("\n")),
        parentPairId: null,
        isFollowUp: false
      });
      pairId += 1;
      questionParts = [];
      answerParts = [];
    }

    for (const turn of normalizedTurns) {
      if (turn.role === "user") {
        if (!startedFromFirstQuestion) {
          startedFromFirstQuestion = true;
        }

        if (answerParts.length > 0) {
          finalizePair();
        }

        questionParts.push(turn.text);
        continue;
      }

      if (turn.role === "gemini") {
        // Ignore any assistant turns before the first user question to avoid Q/A offset.
        if (!startedFromFirstQuestion || questionParts.length === 0) {
          continue;
        }
        answerParts.push(turn.text);
      }
    }

    finalizePair();

    for (const pair of pairs) {
      pair.askIntent = detectAskIntent(pair.question || "");
      pair.parentPairId = null;
      pair.isFollowUp = false;
    }

    const primaryIndices = pairs
      .map((pair, index) => ({ pair, index }))
      .filter((item) => !item.pair.askIntent.isFollowUpCandidate)
      .map((item) => item.index);

    if (primaryIndices.length > 0 && pairs.length > 1) {
      const { vectors, norms } = buildGlobalVectorContext(pairs);
      const maxPrimaryBacktrack = 8;
      const followupMinSim = 0.06;

      for (let i = 0; i < pairs.length; i += 1) {
        const current = pairs[i];
        if (!current.askIntent.isFollowUpCandidate) {
          continue;
        }

        const normalizedQuestion = normalizeText(current.question || "");
        const isPureContinuation = PURE_CONTINUATION_PATTERN.test(normalizedQuestion);
        if (isPureContinuation && i > 0) {
          current.parentPairId = pairs[i - 1].id;
          current.isFollowUp = true;
          continue;
        }

        const candidates = [];
        for (let j = i - 1; j >= 0; j -= 1) {
          const candidate = pairs[j];
          if (candidate.askIntent && !candidate.askIntent.isFollowUpCandidate) {
            candidates.push(j);
            if (candidates.length >= maxPrimaryBacktrack) {
              break;
            }
          }
        }

        if (candidates.length === 0) {
          continue;
        }

        let bestIndex = candidates[0];
        let bestSim = -1;

        for (const idx of candidates) {
          const sim = cosineSimilarity(vectors[i], norms[i], vectors[idx], norms[idx]);
          if (sim > bestSim) {
            bestSim = sim;
            bestIndex = idx;
          }
        }

        if (bestSim >= followupMinSim) {
          current.parentPairId = pairs[bestIndex].id;
          current.isFollowUp = true;
          continue;
        }

        if (current.askIntent.hasReference && candidates.length > 0) {
          current.parentPairId = pairs[candidates[0]].id;
          current.isFollowUp = true;
        }
      }
    }

    return pairs;
  }

  function normalizeToken(token) {
    if (!token) {
      return "";
    }

    let normalized = (TOKEN_NORMALIZATION[token] || token).toLowerCase().trim();

    if (/^[a-z][a-z0-9_-]*$/.test(normalized)) {
      if (normalized.endsWith("ies") && normalized.length > 4) {
        normalized = `${normalized.slice(0, -3)}y`;
      } else if (normalized.endsWith("ing") && normalized.length > 6) {
        normalized = normalized.slice(0, -3);
      } else if (normalized.endsWith("ed") && normalized.length > 5) {
        normalized = normalized.slice(0, -2);
      } else if (normalized.endsWith("s") && normalized.length > 4 && !normalized.endsWith("ss")) {
        normalized = normalized.slice(0, -1);
      }
    }

    return normalized;
  }

  function isLowSignalToken(token) {
    if (!token) {
      return true;
    }

    if (CODE_STOP_WORDS.has(token)) {
      return true;
    }

    if (STOP_WORDS.has(token) || NOISY_TOKENS.has(token)) {
      return true;
    }

    if (/^[\u4e00-\u9fa5]+$/.test(token)) {
      if (token.length >= 7) {
        return true;
      }
      if (CHINESE_GENERIC_TOKENS.has(token)) {
        return true;
      }
    }

    if (/^[a-z][a-z0-9_-]*$/.test(token)) {
      if (token.length <= 3 && !SHORT_TOKEN_ALLOWLIST.has(token)) {
        return true;
      }
      if (/^(do|did|done|does|have|had|get|got|go|went|come|came|work|works|working|think|thinks|thought)$/.test(token)) {
        return true;
      }
    }

    return false;
  }

  function tokenizeChineseSpan(span) {
    if (!span || span.length < 2) {
      return [];
    }

    const result = [];
    const seen = new Set();
    const pieces = span
      .split(/[的一是在了和及并与对把将让给从到为这那个种类着地得吗呢吧啊呀嘛]/g)
      .map((x) => x.trim())
      .filter((x) => x.length >= 2);

    function pushToken(token) {
      if (!token || seen.has(token)) {
        return;
      }
      seen.add(token);
      result.push(token);
    }

    for (const piece of pieces) {
      if (piece.length <= 5) {
        pushToken(piece);
        continue;
      }

      pushToken(piece.slice(0, 4));
      pushToken(piece.slice(-4));

      for (let size = 2; size <= 4; size += 1) {
        const step = size === 2 ? 2 : 1;
        for (let i = 0; i + size <= piece.length; i += step) {
          pushToken(piece.slice(i, i + size));
          if (result.length >= 14) {
            break;
          }
        }
        if (result.length >= 14) {
          break;
        }
      }
    }

    if (result.length === 0 && span.length >= 2) {
      for (let i = 0; i + 2 <= span.length; i += 1) {
        pushToken(span.slice(i, i + 2));
        if (result.length >= 10) {
          break;
        }
      }
    }

    return result;
  }

  function tokenizeForKeywords(text) {
    const raw = (text || "").toLowerCase().match(/[a-z][a-z0-9_+\-]{1,}|[\u4e00-\u9fa5]{2,}/g) || [];
    const tokens = [];

    for (const token of raw) {
      if (/^[\u4e00-\u9fa5]+$/.test(token)) {
        const chineseTokens = tokenizeChineseSpan(token);
        for (const part of chineseTokens) {
          const normalized = normalizeToken(part);
          if (!isLowSignalToken(normalized) && normalized.length >= 2 && normalized.length <= 24) {
            tokens.push(normalized);
          }
        }
      } else {
        const normalized = normalizeToken(token);
        if (!isLowSignalToken(normalized) && normalized.length >= 2 && normalized.length <= 24) {
          tokens.push(normalized);
        }
      }
    }

    return tokens;
  }

  function getDomainIdfBoost(token) {
    if (!token) {
      return 1;
    }

    let boost = 1;
    if (/^[a-zA-Z0-9_+\-]+$/.test(token)) {
      boost *= 2.5;
    } else if (/^[\u4e00-\u9fa5]+$/.test(token) && token.length >= 3 && !CHINESE_GENERIC_TOKENS.has(token)) {
      boost *= 1.5;
    }

    if (/^(python|c\+\+|docker|mysql|malloc|redis|nginx|k8s|sql|http|typescript|javascript|node|react|vue)$/i.test(token)) {
      boost *= 1.15;
    }

    return boost;
  }

  function collectTokenKeywords(question, answer, taken) {
    const tokenScores = new Map();
    const questionTokens = tokenizeForKeywords(question);
    const answerTokens = tokenizeForKeywords(answer);

    const qSet = new Set();
    const aSet = new Set();

    for (const token of questionTokens) {
      qSet.add(token);
      const prev = tokenScores.get(token) || 0;
      tokenScores.set(token, prev + 1.5 + Math.min(0.4, token.length * 0.03));
    }

    for (const token of answerTokens) {
      aSet.add(token);
      const prev = tokenScores.get(token) || 0;
      tokenScores.set(token, prev + 1.1 + Math.min(0.3, token.length * 0.02));
    }

    for (const token of qSet) {
      if (aSet.has(token)) {
        tokenScores.set(token, (tokenScores.get(token) || 0) + 0.9);
      }
    }

    return Array.from(tokenScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([token]) => token)
      .filter((token) => !taken.has(token) && !isLowSignalToken(token))
      .slice(0, 5);
  }

  function smartTruncate(text, maxLength = 22) {
    if (!text || text.length <= maxLength) {
      return text;
    }

    const boundaryRegex = /[\s,，。！？!?；;：:（）\(\)\[\]【】]/g;
    let bestCut = maxLength;
    let match;

    while ((match = boundaryRegex.exec(text)) !== null) {
      if (match.index <= maxLength && match.index > maxLength * 0.6) {
        bestCut = match.index;
      }
      if (match.index > maxLength) {
        break;
      }
    }

    if (bestCut === maxLength) {
      const start = Math.floor(maxLength * 0.6);
      const end = Math.floor(maxLength);
      const structuralWindow = text.substring(start, end);
      const structuralMatch = structuralWindow.match(/[的与和及或等]/);
      if (structuralMatch) {
        bestCut = start + structuralMatch.index;
      }
    }

    return `${text.substring(0, bestCut).trim()}...`;
  }

  function extractIntentFromAnswer(answerText) {
    if (!answerText) {
      return "";
    }

    const firstSentence = answerText.split(/\n/)[0].split(/[。！？!?]/)[0].trim();
    const AI_CONFIRM_REGEX = /^(?:好的|没问题|当然|了解|明白)?[，,]*(?:我来|下面|为您|帮你|为你)?(?:详细)?(解释|分析|总结|翻译|优化|生成|实现|讲解|排查|对比|梳理|评估)(?:一下|关于|针对|这段|这个)?(.{2,20}?)(?:的代码|的原理|的内容|问题|方案)?$/i;

    const match = firstSentence.match(AI_CONFIRM_REGEX);
    if (match && match[2].length >= 2) {
      return `${match[1]}${match[2].trim()}`;
    }

    return "";
  }

  function extractTopicFromAnswerDetailed(answerText) {
    if (!answerText) return "";

    const paragraphs = answerText.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
    if (paragraphs.length === 0) return "";

    // 1. 暴力清洗前缀：将匹配符从 + 改为 *，解决 "Gemini said这张图片" 的文本无缝粘连问题
    let firstPara = paragraphs[0];
    firstPara = firstPara.replace(/^(?:gemini|user|you|assistant|model)?\s*(?:said|says|asked|responded)[\s:：,，"“']*/i, "").trim();
    firstPara = firstPara.replace(/^said[\s:：,，"“']*/i, "").trim();
    firstPara = firstPara.replace(/^(好的|没问题|当然|了解|明白|在这个例子中|这里|首先|其实|实际上)[，。！,\.!]/, "").trim();

    const lastPara = paragraphs.length > 1 ? paragraphs[paragraphs.length - 1] : "";

    const cleanMd = (str) => str.replace(/[*#`_]/g, "").trim();

    // 策略 A：专属应对图片/文件/代码段的媒介陈述句
    const docIntroRegex = /(?:这(?:张图|张图片|页\s*[a-zA-Z]*|个图表|份文档|段代码|里))(?:中|里)?(?:主要)?(?:展示了|介绍了|是关于|是对|解释了)(?:整个)?(.{2,30}?)(?:的(?:一个)?(?:大?总结|原理|对比|情况|概念)|进行|。|，|：)/;
    const docMatch = firstPara.match(docIntroRegex);
    if (docMatch) return cleanMd(docMatch[1].replace(/^[“"‘']|[”"’']$/g, ""));

    // 策略 B：典型的主题陈述句
    const topicRegex = /(?:以|关于|针对|为您解释|详细解释|说明一下|解释)\s*([a-zA-Z0-9_\-\u4e00-\u9fa5\s]{2,15})\s*(?:为例|的例子|的概念|的原理|的具体表现)/;
    const sentenceMatch = firstPara.match(topicRegex);
    if (sentenceMatch) return cleanMd(sentenceMatch[1]);

    // 策略 C：AI 任务确认句式
    const AI_CONFIRM_REGEX = /^(?:我来|下面)?(?:为您|帮你)?(?:详细|完整)?(?:解释|分析|总结|举例|说明)(?:一下)?(.{2,20}?)(?:的例子|的代码|的具体过程|。|，|：|:)/;
    const confirmMatch = firstPara.match(AI_CONFIRM_REGEX);
    if (confirmMatch) return cleanMd(confirmMatch[1].replace(/^(关于|针对|这个|那个)/, ""));

    // 策略 D：扫描最后一段的总结句
    if (lastPara) {
      const summaryRegex = /(?:总之|总而言之|综上所述|可以看到)[，,]*(?:这个例子|这)(?:展示了|说明了|体现了|是关于)\s*([a-zA-Z0-9_\-\u4e00-\u9fa5\s]{2,15})/;
      const lastMatch = lastPara.match(summaryRegex);
      if (lastMatch) return cleanMd(lastMatch[1]);
    }

    // 策略 E：绝对兜底 (Ruthless Fallback)
    let fallbackChunk = firstPara.split(/[。，：；,;:]/)[0].trim();
    // 终极截断：即便开头仍残存少量未知污染词，只要命中媒介陈述，将其前方全部内容连根拔起
    fallbackChunk = fallbackChunk.replace(/^(?:.*?)(?:在这个例子中|这段代码(?:是)?|这个例子(?:是)?|这(?:张图|张图片|页\s*[a-zA-Z]*|个图表|份文档|段代码|里)(?:中|里)?(?:主要)?(?:展示了|介绍了|是关于|是对|解释了)?|这是一个)/i, "").trim();

    if (fallbackChunk.length >= 2) {
      let finalStr = cleanMd(fallbackChunk);
      return finalStr.length > 18 ? `${finalStr.substring(0, 18)}...` : finalStr;
    }

    return "";
  }

  function buildRuleBasedSummary(pair) {
    let question = normalizeText(pair.question || "").replace(UI_QUOTE_PREFIX_PATTERN, "").trim();
    if (!question) {
      return "空节点";
    }

    const textWithoutCode = question
      .replace(/```[\s\S]*?```/g, " [代码块] ")
      .replace(/https?:\/\/[^\s]+/g, " [链接] ");

    const sentences = textWithoutCode.split(/[。！？!?\n]+/g).map((s) => s.trim()).filter(Boolean);
    if (sentences.length === 0) {
      return "空节点";
    }

    if (sentences.length === 1 && /^(继续|要求同上|接着上文|优化不够|报错了|不对|不行|没用|换一个|换一个方案)$/.test(sentences[0])) {
      const reverseSummary = extractTopicFromAnswerDetailed(pair.answer) || extractIntentFromAnswer(pair.answer);
      return reverseSummary ? `[续] ${smartTruncate(reverseSummary, 26)}` : sentences[0];
    }

    let bestSentence = "";
    let highestScore = -1;

    const ACTION_REGEX_LOCAL = /(写|解释|分析|总结|翻译|优化|生成|实现|讲解|排查|修复|对比|计算)/;
    const QUESTION_REGEX = /(什么|怎么|如何|为什么|哪|吗|么|是否|who|what|how|why)/i;

    for (let i = 0; i < sentences.length; i += 1) {
      const s = sentences[i].replace(/^(那么|所以|然后|那|请问|你看|目前|基于这个|以下是)\s*/, "").trim();
      if (s.length < 3) {
        continue;
      }

      let score = 0;
      score += (i / Math.max(1, sentences.length)) * 2;

      if (QUESTION_REGEX.test(s) || question.includes(`${s}?`) || question.includes(`${s}？`)) {
        score += 5;
      }

      if (ACTION_REGEX_LOCAL.test(s)) {
        score += 4;
      }

      const englishWords = s.match(/[a-zA-Z_]+/g);
      if (englishWords) {
        score += englishWords.length * 1.5;
      }

      if (/^(你看|帮我看看|分析就好|合理吗|这是代码)/.test(s)) {
        score -= 3;
      }

      if (score > highestScore) {
        highestScore = score;
        bestSentence = s;
      }
    }

    if (bestSentence) {
      const pureActionMatch = bestSentence.match(/(?:帮我|请你|尝试|麻烦)?(?:给我)?(写|解释|分析|总结|翻译|优化|生成|实现|讲解|排查|修复|对比|计算)(.{2,40})/);

      let action = "";
      let object = "";
      let finalSummary = "";

      if (pureActionMatch) {
        action = pureActionMatch[1];
        object = pureActionMatch[2]
          .replace(/^(一下|一个|关于|针对|这个|这份|这段|详细完整)/, "")
          .replace(/[，,。！？!?]+$/g, "")
          .trim();
        finalSummary = `${action}${object}`;
      } else {
        finalSummary = bestSentence.replace(/(吗|呢|吧|啊|呀|么)$/, "").trim();
      }

      const informativeTokens = tokenizeForKeywords(finalSummary).filter((t) => !isLowSignalToken(t));
      const pureText = finalSummary.replace(/[\s，。]/g, "");
      const isReferential = /(这个|那个|上文|上述|例子|方案|内容|问题|一下)$/.test(finalSummary);
      const isPureAction = /^(详细)?(完整)?(解释|分析|说明|总结|举例|介绍|优化)(这个|那个|例子|代码|内容|问题|一下)?$/.test(pureText);

      const isInformationPoor = informativeTokens.length < 2 || finalSummary.length < 5 || isReferential || isPureAction;

      if (isInformationPoor) {
        const reverseTopic = extractTopicFromAnswerDetailed(pair.answer) || extractIntentFromAnswer(pair.answer);
        if (reverseTopic) {
          const actionLabel = action || (ACTION_REGEX_LOCAL.exec(question)?.[1] || "解释");
          const objectLabel = object || (/(例子|方案|问题|内容)/.exec(finalSummary)?.[1] || "内容");
          return smartTruncate(`${actionLabel}${objectLabel}: ${reverseTopic}`, 34);
        }
      }

      return smartTruncate(finalSummary, 24);
    }

    const fallback = sentences[0] || "未命名提问";
    return smartTruncate(fallback, 20);
  }

  function buildDetailContentSummary(questionText) {
    let text = normalizeText(questionText || "").replace(UI_QUOTE_PREFIX_PATTERN, "").trim();

    if (text.length <= 30) {
      return text;
    }

    const sentences = text.match(/[^。！？!?\n]+[。！？!?]?/g) || [text];
    if (sentences.length === 1) {
      return `${text.substring(0, 50)}...`;
    }

    let demandSentence = "";
    const ACTION_REGEX_STRICT = /(?:帮我|请你|尝试|麻烦)?(?:给我)?(写|解释|分析|总结|翻译|优化|生成|实现|讲解|排查|修复|对比|计算)/;

    for (let i = sentences.length - 1; i >= 0; i -= 1) {
      const s = sentences[i].replace(/^(那么|所以|然后|那|请问)\s*/, "").trim();
      if (s.length < 3) {
        continue;
      }

      if (/(什么|怎么|如何|为什么|哪|吗|么|是否|who|what|how|why)/i.test(s) || /[?？]/.test(s) || ACTION_REGEX_STRICT.test(s)) {
        demandSentence = s;
        break;
      }
    }

    const firstSentence = sentences[0].trim();
    if (!demandSentence || demandSentence === firstSentence) {
      const lastSentence = sentences[sentences.length - 1].trim();
      if (firstSentence === lastSentence) {
        return firstSentence.length > 60 ? `${firstSentence.substring(0, 60)}...` : firstSentence;
      }
      return `${firstSentence.substring(0, 30)} ... ${lastSentence.substring(0, 30)}`;
    }

    const cleanFirst = firstSentence.length > 35 ? `${firstSentence.substring(0, 35)}...` : firstSentence;
    const cleanDemand = demandSentence.length > 45 ? `${demandSentence.substring(0, 45)}...` : demandSentence;

    return `[背景] ${cleanFirst}\n[诉求] ${cleanDemand}`;
  }

  function resolveLifecycleLabel(pair) {
    const question = normalizeText(pair.question || "");
    const answer = normalizeText(pair.answer || "");
    const merged = `${question}\n${answer}`.toLowerCase();

    if (pair.isFollowUp || (pair.askIntent && pair.askIntent.isFollowUpCandidate)) {
      return LIFECYCLE_LABELS.followups;
    }

    if (/(traceback|syntaxerror|typeerror|referenceerror|报错了|运行失败|抛出异常|segmentation fault)/i.test(merged)) {
      return LIFECYCLE_LABELS.debug;
    }

    if (/```/.test(answer) || /(写一段|实现|生成|代码|脚本|重构|优化算法|修改代码)/i.test(question)) {
      return LIFECYCLE_LABELS.implementation;
    }

    return LIFECYCLE_LABELS.concept;
  }

  function createTermFrequency(tokens) {
    const freq = new Map();
    for (const token of tokens) {
      freq.set(token, (freq.get(token) || 0) + 1);
    }
    return freq;
  }

  function cosineSimilarity(vecA, normA, vecB, normB) {
    if (!vecA || !vecB || !normA || !normB) {
      return 0;
    }

    const small = vecA.size <= vecB.size ? vecA : vecB;
    const large = vecA.size <= vecB.size ? vecB : vecA;

    let dot = 0;
    for (const [token, weight] of small.entries()) {
      const other = large.get(token);
      if (other) {
        dot += weight * other;
      }
    }

    if (dot <= 0) {
      return 0;
    }
    return dot / (normA * normB);
  }

  function buildGlobalVectorContext(pairs) {
    const featureTexts = pairs.map((pair) => buildFeatureTextFromPair(pair));
    const docs = featureTexts.map((text) => tokenizeForKeywords(text));
    const docCount = Math.max(1, docs.length);

    const df = new Map();
    for (const tokens of docs) {
      const unique = new Set(tokens);
      for (const token of unique) {
        df.set(token, (df.get(token) || 0) + 1);
      }
    }

    const idf = new Map();
    for (const [token, count] of df.entries()) {
      idf.set(token, Math.log((docCount + 1) / (count + 1)) + 1);
    }

    const vectors = [];
    const norms = [];

    for (const tokens of docs) {
      const tf = createTermFrequency(tokens);
      const vector = new Map();
      const total = Math.max(1, tokens.length);

      let sq = 0;
      for (const [token, count] of tf.entries()) {
        const baseIdf = (idf.get(token) || 1) * getDomainIdfBoost(token);
        const weight = (count / total) * baseIdf;
        vector.set(token, weight);
        sq += weight * weight;
      }

      vectors.push(vector);
      norms.push(Math.sqrt(sq) || 1);
    }

    return { docs, featureTexts, df, idf, vectors, norms };
  }

  function computeNearestNeighbors(index, vectors, norms, k) {
    const neighbors = [];
    const baseVec = vectors[index];
    const baseNorm = norms[index];

    for (let i = 0; i < vectors.length; i += 1) {
      if (i === index) {
        continue;
      }
      const sim = cosineSimilarity(baseVec, baseNorm, vectors[i], norms[i]);
      if (sim > 0.05) {
        neighbors.push({ index: i, sim });
      }
    }

    neighbors.sort((a, b) => b.sim - a.sim);
    return neighbors.slice(0, k);
  }

  function buildNeighborScoreMaps(neighbors) {
    return neighbors.map((list) => {
      const map = new Map();
      for (const item of list) {
        map.set(item.index, item.sim);
      }
      return map;
    });
  }

  function buildSimilarityClusters(neighbors, totalCount) {
    const parent = Array.from({ length: totalCount }, (_, i) => i);
    const rank = new Array(totalCount).fill(0);

    function find(x) {
      if (parent[x] !== x) {
        parent[x] = find(parent[x]);
      }
      return parent[x];
    }

    function union(a, b) {
      const ra = find(a);
      const rb = find(b);
      if (ra === rb) {
        return;
      }
      if (rank[ra] < rank[rb]) {
        parent[ra] = rb;
      } else if (rank[ra] > rank[rb]) {
        parent[rb] = ra;
      } else {
        parent[rb] = ra;
        rank[ra] += 1;
      }
    }

    const sims = [];
    for (const list of neighbors) {
      for (const item of list) {
        sims.push(item.sim);
      }
    }

    const avgSim = sims.length > 0 ? sims.reduce((sum, s) => sum + s, 0) / sims.length : 0.18;
    const threshold = Math.max(0.12, Math.min(0.34, avgSim * 0.88 + 0.04));
    const neighborMaps = buildNeighborScoreMaps(neighbors);

    for (let i = 0; i < neighbors.length; i += 1) {
      for (const n of neighbors[i]) {
        let finalSim = n.sim;

        const distance = Math.abs(i - n.index);
        if (distance === 1) {
          finalSim += 0.15;
        } else if (distance === 2) {
          finalSim += 0.08;
        }

        const reverseSim = neighborMaps[n.index].get(i) || 0;
        const isMutualStrong = reverseSim > 0 && Math.min(reverseSim, finalSim) >= Math.max(0.09, threshold * 0.72);
        if (finalSim >= threshold || isMutualStrong) {
          union(i, n.index);
        }
      }
    }

    const rootToCluster = new Map();
    const clusterIds = new Array(totalCount).fill(0);
    const clusterMembers = new Map();
    let nextCluster = 0;

    for (let i = 0; i < totalCount; i += 1) {
      const root = find(i);
      if (!rootToCluster.has(root)) {
        rootToCluster.set(root, nextCluster);
        nextCluster += 1;
      }

      const cid = rootToCluster.get(root);
      clusterIds[i] = cid;

      if (!clusterMembers.has(cid)) {
        clusterMembers.set(cid, []);
      }
      clusterMembers.get(cid).push(i);
    }

    return {
      clusterIds,
      clusterMembers,
      threshold
    };
  }

  function buildClusterTokenStats(docs, clusterIds, clusterMembers) {
    const clusterTokenCounts = new Map();

    for (const clusterId of clusterMembers.keys()) {
      clusterTokenCounts.set(clusterId, new Map());
    }

    for (let i = 0; i < docs.length; i += 1) {
      const clusterId = clusterIds[i];
      const counter = clusterTokenCounts.get(clusterId);
      if (!counter) {
        continue;
      }

      const unique = new Set(docs[i]);
      for (const token of unique) {
        counter.set(token, (counter.get(token) || 0) + 1);
      }
    }

    return clusterTokenCounts;
  }

  function buildGlobalPairAnalysis(pairs) {
    if (!pairs || pairs.length === 0) {
      return {
        pairs: [],
        topics: [],
        stats: {
          k: 0,
          clusterCount: 0,
          clusterThreshold: 0,
          topicCount: 0,
          topicThreshold: 0,
          classificationConsistencyScore: 0,
          summaryDuplicateRate: 0,
          summaryDuplicateRateScore: 0
        }
      };
    }

    const vectorCtx = buildGlobalVectorContext(pairs);
    const { docs, df, idf, vectors, norms } = vectorCtx;
    const k = Math.min(6, Math.max(2, Math.floor(Math.sqrt(pairs.length))));
    const neighbors = vectors.map((_, idx) => computeNearestNeighbors(idx, vectors, norms, k));
    const clusterInfo = buildSimilarityClusters(neighbors, pairs.length);
    const { clusterIds, clusterMembers, threshold: clusterThreshold } = clusterInfo;
    const clusterTokenCounts = buildClusterTokenStats(docs, clusterIds, clusterMembers);

    const clusterMeta = new Map();
    for (const [clusterId, members] of clusterMembers.entries()) {
      const sum = new Map();
      for (const idx of members) {
        for (const [token, weight] of vectors[idx].entries()) {
          sum.set(token, (sum.get(token) || 0) + weight);
        }
      }

      const centroid = new Map();
      for (const [token, value] of sum.entries()) {
        centroid.set(token, value / Math.max(1, members.length));
      }

      const topKeywords = Array.from(centroid.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([token]) => token)
        .filter((token) => !isLowSignalToken(token))
        .slice(0, 2);

      const normalizedKeywords = topKeywords.length >= 2
        ? topKeywords
        : topKeywords.length === 1
          ? [topKeywords[0], "讨论"]
          : ["主题", "讨论"];

      const firstPairIndex = Math.min(...members);
      const firstPair = pairs[firstPairIndex] || null;
      const rootSummary = firstPair ? buildRuleBasedSummary(firstPair) : "";

      let folderName;
      if (rootSummary && normalizedKeywords.length > 0) {
        folderName = `${rootSummary} (${normalizedKeywords[0]})`;
      } else if (rootSummary) {
        folderName = rootSummary;
      } else {
        folderName = `${normalizedKeywords[0]} / ${normalizedKeywords[1]} 相关探讨`;
      }

      clusterMeta.set(clusterId, {
        clusterId,
        members,
        centroid,
        topKeywords: normalizedKeywords,
        folderName
      });
    }

    const neighborAvgVectors = vectors.map((_, idx) => {
      const acc = new Map();
      let wsum = 0;

      for (const n of neighbors[idx]) {
        wsum += n.sim;
        for (const [token, weight] of vectors[n.index].entries()) {
          acc.set(token, (acc.get(token) || 0) + weight * n.sim);
        }
      }

      if (wsum > 0) {
        for (const [token, value] of acc.entries()) {
          acc.set(token, value / wsum);
        }
      }

      return acc;
    });

    const enrichedPairs = pairs.map((pair, idx) => {
      const clusterId = clusterIds[idx];
      const cluster = clusterMeta.get(clusterId);
      const clusterName = cluster ? cluster.folderName : `[Topic] C${String(clusterId + 1).padStart(2, "0")} 相关讨论`;
      const lifecycle = resolveLifecycleLabel(pair);
      const summary = buildRuleBasedSummary(pair);

      const similarIds = neighbors[idx].slice(0, 3).map((n) => pairs[n.index].id);
      const detailAsk = buildDetailContentSummary(pair.question);
      const content = `${detailAsk}\n\n主题簇: ${clusterName}\n生命周期: ${lifecycle}\n簇编号: C${String(clusterId + 1).padStart(2, "0")}\n相似问答: ${similarIds.length > 0 ? similarIds.map((id) => `Q${String(id).padStart(3, "0")}`).join(", ") : "无"}`;

      return {
        ...pair,
        folderName: clusterName,
        summary,
        content,
        similarIds,
        clusterId,
        clusterName,
        lifecycle
      };
    });

    const summarySignatures = new Map();
    for (const pair of enrichedPairs) {
      const key = `${pair.clusterId}::${normalizeText(pair.summary || "")}`;
      const duplicateCount = summarySignatures.get(key) || 0;

      if (duplicateCount > 0) {
        pair.summary = `${pair.summary}（补充${duplicateCount + 1}）`.trim().slice(0, 30);
      }

      const detailAskFinal = buildDetailContentSummary(pair.question);
      pair.content = `${detailAskFinal}\n\n主题簇: ${pair.clusterName}\n生命周期: ${pair.lifecycle}\n簇编号: C${String((pair.clusterId || 0) + 1).padStart(2, "0")}\n相似问答: ${pair.similarIds.length > 0 ? pair.similarIds.map((id) => `Q${String(id).padStart(3, "0")}`).join(", ") : "无"}`;

      summarySignatures.set(key, duplicateCount + 1);
    }

    let neighborAgreementSum = 0;
    for (let i = 0; i < neighbors.length; i += 1) {
      const ns = neighbors[i];
      if (!ns || ns.length === 0) {
        neighborAgreementSum += 1;
        continue;
      }

      let sameWeight = 0;
      let totalWeight = 0;
      for (const n of ns) {
        totalWeight += n.sim;
        if (clusterIds[n.index] === clusterIds[i]) {
          sameWeight += n.sim;
        }
      }

      const agreement = totalWeight > 0 ? sameWeight / totalWeight : 1;
      neighborAgreementSum += agreement;
    }

    const neighborAgreement = neighborAgreementSum / Math.max(1, neighbors.length);
    const classificationConsistencyScore = Math.max(0, Math.min(100, neighborAgreement * 100));

    const summaryCounter = new Map();
    for (const pair of enrichedPairs) {
      const key = normalizeText((pair.summary || "").toLowerCase());
      if (!key) {
        continue;
      }
      summaryCounter.set(key, (summaryCounter.get(key) || 0) + 1);
    }

    let duplicateItemCount = 0;
    for (const count of summaryCounter.values()) {
      if (count > 1) {
        duplicateItemCount += count - 1;
      }
    }

    const summaryDuplicateRate = duplicateItemCount / Math.max(1, enrichedPairs.length);
    const summaryDuplicateRateScore = Math.max(0, Math.min(100, (1 - summaryDuplicateRate) * 100));

    const clusterCount = clusterMembers.size;
    const topics = Array.from(clusterMeta.values())
      .map((x) => ({
        folderName: x.folderName,
        topicId: x.clusterId + 1,
        topicName: x.folderName,
        memberCount: x.members.length,
        topKeywords: x.topKeywords
      }))
      .sort((a, b) => a.topicId - b.topicId);

    return {
      pairs: enrichedPairs,
      topics,
      stats: {
        k,
        clusterCount,
        clusterThreshold,
        topicCount: topics.length,
        topicThreshold: clusterThreshold,
        analyzedPairs: pairs.length,
        vocabSize: idf.size,
        avgNeighbors: neighbors.reduce((sum, n) => sum + n.length, 0) / Math.max(1, neighbors.length),
        classificationConsistencyScore,
        summaryDuplicateRate,
        summaryDuplicateRateScore
      }
    };
  }

  function slug(input) {
    return input
      .replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s_-]/g, " ")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 34) || "entry";
  }

  function buildTree(pairs) {
    const globalAnalysis = buildGlobalPairAnalysis(pairs);
    const analyzedPairs = globalAnalysis.pairs;

    const grouped = new Map();
    for (const pair of analyzedPairs) {
      const key = Number.isFinite(pair.clusterId) ? pair.clusterId : 0;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(pair);
    }

    const root = {
      type: "folder",
      name: "Gemini_Conversation_Tree",
      children: []
    };

    let fileCounter = 1;

    const orderedClusters = Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);

    for (const [, clusterPairsRaw] of orderedClusters) {
      const clusterPairs = [...clusterPairsRaw].sort((a, b) => a.id - b.id);
      if (clusterPairs.length === 0) {
        continue;
      }

      const clusterName = clusterPairs[0].clusterName || `[Topic] C${String((clusterPairs[0].clusterId || 0) + 1).padStart(2, "0")} 相关讨论`;
      const clusterFolder = {
        type: "folder",
        name: clusterName,
        children: []
      };

      const lifecycleFolders = new Map();
      for (const label of LIFECYCLE_ORDER) {
        lifecycleFolders.set(label, {
          type: "folder",
          name: label,
          children: []
        });
      }

      const nodesById = new Map();
      const pairById = new Map();

      for (const pair of clusterPairs) {
        pairById.set(pair.id, pair);
        const summarySlug = slug(pair.summary);
        const fileName = `${String(fileCounter).padStart(3, "0")}_Q${String(pair.id).padStart(3, "0")}_${summarySlug}.md`;
        nodesById.set(pair.id, {
          type: "file",
          name: fileName,
          pairId: pair.id,
          summary: pair.summary,
          content: pair.content,
          children: []
        });
        fileCounter += 1;
      }

      const anchoredFollowups = new Set();
      for (const pair of clusterPairs) {
        if (!pair.isFollowUp || !pair.parentPairId) {
          continue;
        }

        if (!nodesById.has(pair.id)) {
          continue;
        }

        const parentPair = pairById.get(pair.parentPairId);
        let parentNode = null;

        if (parentPair && parentPair.clusterId === pair.clusterId) {
          parentNode = nodesById.get(pair.parentPairId);
        }

        if (!parentNode) {
          const prevInCluster = clusterPairs
            .filter((x) => x.id < pair.id)
            .sort((a, b) => b.id - a.id)[0];
          if (prevInCluster) {
            parentNode = nodesById.get(prevInCluster.id) || null;
          }
        }

        if (!parentNode) {
          continue;
        }

        const childNode = nodesById.get(pair.id);
        parentNode.children.push(childNode);
        anchoredFollowups.add(pair.id);
      }

      for (const pair of clusterPairs) {
        if (anchoredFollowups.has(pair.id)) {
          continue;
        }

        const lifecycle = LIFECYCLE_ORDER.includes(pair.lifecycle) ? pair.lifecycle : LIFECYCLE_LABELS.concept;
        const folder = lifecycleFolders.get(lifecycle) || lifecycleFolders.get(LIFECYCLE_LABELS.concept);
        folder.children.push(nodesById.get(pair.id));
      }

      for (const label of LIFECYCLE_ORDER) {
        const folder = lifecycleFolders.get(label);
        if (folder && folder.children.length > 0) {
          clusterFolder.children.push(folder);
        }
      }

      root.children.push(clusterFolder);
    }

    return {
      root,
      stats: {
        pairCount: analyzedPairs.length,
        answeredCount: analyzedPairs.filter((x) => Boolean(x.answer)).length,
        pendingCount: analyzedPairs.filter((x) => !x.answer).length,
        folders: root.children.length,
        knnK: globalAnalysis.stats.k,
        clusters: globalAnalysis.stats.clusterCount,
        clusterThreshold: globalAnalysis.stats.clusterThreshold,
        topics: globalAnalysis.stats.topicCount,
        topicThreshold: globalAnalysis.stats.topicThreshold,
        vocabSize: globalAnalysis.stats.vocabSize,
        avgNeighbors: globalAnalysis.stats.avgNeighbors,
        classificationConsistencyScore: globalAnalysis.stats.classificationConsistencyScore,
        summaryDuplicateRate: globalAnalysis.stats.summaryDuplicateRate,
        summaryDuplicateRateScore: globalAnalysis.stats.summaryDuplicateRateScore
      }
    };
  }

  function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) {
      el.className = className;
    }
    if (typeof text === "string") {
      el.textContent = text;
    }
    return el;
  }

  function buildTurnsFingerprint(turns) {
    const list = Array.isArray(turns) ? turns : [];
    if (list.length === 0) {
      return "empty";
    }

    const sample = list.slice(Math.max(0, list.length - 8));
    const compact = sample.map((x) => {
      const role = x && x.role ? x.role : "unknown";
      const text = normalizeText(x && x.text ? x.text : "");
      return `${role}:${text.length}:${text.slice(0, 36)}`;
    });

    return `${list.length}|${compact.join("|")}`;
  }

  function suspendAutoRefresh(ms = 90000) {
    autoRefreshSuspendedUntil = Date.now() + ms;
  }

  function isAutoRefreshSuspended() {
    return Date.now() < autoRefreshSuspendedUntil;
  }

  function getMutationHostElement(node) {
    if (!node) {
      return null;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      return node;
    }
    return node.parentElement || null;
  }

  function isMutationRelevantForConversation(records) {
    for (const record of records) {
      const host = getMutationHostElement(record.target);
      if (!host) {
        continue;
      }

      if (host.closest(`#${PANEL_ID}`) || host.closest(`#${LAUNCHER_ID}`)) {
        continue;
      }

      return true;
    }
    return false;
  }

  function renderTreeNode(node, depth = 0) {
    const li = createEl("li", `gct-node gct-${node.type}`);

    if (node.type === "folder") {
      li.dataset.collapsed = "false";
      const row = createEl("div", "gct-row");
      const indent = createEl("span", "gct-indent");
      indent.style.width = `${depth * 12}px`;
      const caret = createEl("span", "gct-caret", "▾");
      const typeIcon = createEl("span", "gct-type");
      const label = createEl("span", "gct-label", node.name);
      const badge = createEl("span", "gct-badge", String(node.children.length));

      row.append(indent, caret, typeIcon, label, badge);

      const ul = createEl("ul", "gct-children");
      for (const child of node.children) {
        ul.appendChild(renderTreeNode(child, depth + 1));
      }

      row.addEventListener("click", () => {
        suspendAutoRefresh();
        li.dataset.collapsed = li.dataset.collapsed === "true" ? "false" : "true";
      });

      li.append(row, ul);
      return li;
    }

    li.dataset.open = "false";
    const row = createEl("div", "gct-row");
    const indent = createEl("span", "gct-indent");
    indent.style.width = `${depth * 12}px`;
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    const caret = createEl("span", "gct-caret", hasChildren ? "▸" : "•");
    const typeIcon = createEl("span", "gct-type");
    const label = createEl("span", "gct-label", node.summary || node.name);
    const badge = createEl("span", "gct-badge", `Q${String(node.pairId || "").padStart(3, "0")}`);

    row.append(indent, caret, typeIcon, label, badge);

    const detail = createEl("div", "gct-file-detail");
    const pre = document.createElement("pre");
    pre.textContent = node.content;
    detail.appendChild(pre);

    let childList = null;
    if (hasChildren) {
      childList = createEl("ul", "gct-children");
      for (const child of node.children) {
        childList.appendChild(renderTreeNode(child, depth + 1));
      }
      childList.style.display = "none";
    }

    row.addEventListener("click", () => {
      suspendAutoRefresh();
      li.dataset.open = li.dataset.open === "true" ? "false" : "true";
      const open = li.dataset.open === "true";
      if (hasChildren && childList) {
        childList.style.display = open ? "block" : "none";
        caret.textContent = open ? "▾" : "▸";
      }
    });

    li.append(row, detail);
    if (childList) {
      li.appendChild(childList);
    }
    return li;
  }

  function renderTreeView(tree) {
    treeContainer.innerHTML = "";
    const ul = createEl("ul", "gct-tree");
    ul.appendChild(renderTreeNode(tree.root, 0));
    treeContainer.appendChild(ul);
  }

  function findScrollableContainer() {
    const candidates = [
      document.scrollingElement,
      ...Array.from(document.querySelectorAll("main *"))
    ].filter(Boolean);

    let winner = null;
    let maxDelta = 0;

    for (const el of candidates) {
      const delta = el.scrollHeight - el.clientHeight;
      if (delta > maxDelta + 100) {
        maxDelta = delta;
        winner = el;
      }
    }

    return winner || document.scrollingElement || document.documentElement;
  }

  function scoreTurnSnapshot(turns) {
    if (!Array.isArray(turns) || turns.length === 0) {
      return -1;
    }
    const firstUser = turns.findIndex((x) => x.role === "user");
    let score = turns.length * 10;
    if (firstUser === 0) {
      score += 16;
    } else if (firstUser > 0) {
      score -= firstUser * 2;
    } else {
      score -= 20;
    }
    return score;
  }

  async function collectFullHistory() {
    const scroller = findScrollableContainer();
    if (!scroller) {
      return extractConversationTurns();
    }

    const original = scroller.scrollTop;
    let previousTop = -1;
    let stableRound = 0;
    let bestTurns = extractConversationTurns();
    let bestScore = scoreTurnSnapshot(bestTurns);

    function captureSnapshot() {
      const turns = extractConversationTurns();
      const score = scoreTurnSnapshot(turns);
      if (score > bestScore) {
        bestScore = score;
        bestTurns = turns;
      }
    }

    for (let i = 0; i < 22; i += 1) {
      scroller.scrollTop = 0;
      await sleep(300);
      captureSnapshot();

      if (Math.abs(scroller.scrollTop - previousTop) < 2) {
        stableRound += 1;
      } else {
        stableRound = 0;
        previousTop = scroller.scrollTop;
      }

      if (stableRound >= 3) {
        break;
      }
    }

    const bottom = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const sweepSteps = 18;

    for (let step = 0; step <= sweepSteps; step += 1) {
      const progress = step / sweepSteps;
      const target = Math.floor(bottom * progress);
      scroller.scrollTop = target;
      await sleep(220);
      captureSnapshot();
    }

    await sleep(180);
    scroller.scrollTop = original;
    return bestTurns;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return { ...DEFAULT_STATE };
      }
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_STATE,
        ...parsed
      };
    } catch (_error) {
      return { ...DEFAULT_STATE };
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(panelState));
  }

  function getStorage(keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(keys, (data) => {
          resolve(data || {});
        });
      } catch (_error) {
        resolve({});
      }
    });
  }

  async function loadLlmSettings() {
    const data = await getStorage([LLM_STORAGE_KEY]);
    const merged = {
      ...DEFAULT_LLM_SETTINGS,
      ...(data[LLM_STORAGE_KEY] || {})
    };

    if (!merged.analysisMode) {
      merged.analysisMode = merged.enabled ? "llm" : "local";
    }

    return merged;
  }

  function clipForLlm(text, maxChars) {
    const normalized = normalizeText(text || "");
    if (normalized.length <= maxChars) {
      return normalized;
    }
    return `${normalized.slice(0, maxChars)} ...`;
  }

  function splitPairsForLlm(pairs, chunkSize) {
    const size = Math.max(8, Math.min(40, chunkSize || DEFAULT_LLM_SETTINGS.chunkSize));
    const chunks = [];

    for (let i = 0; i < pairs.length; i += size) {
      chunks.push(pairs.slice(i, i + size));
    }

    return chunks;
  }

  function sendLlmAnalyzeRequest(chunkPairs, settings) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          scope: "llm",
          type: "GCT_LLM_ANALYZE",
          payload: {
            settings,
            pairs: chunkPairs.map((pair) => ({
              id: pair.id,
              question: clipForLlm(pair.question, 520),
              answer: clipForLlm(pair.answer, 820)
            }))
          }
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message || "LLM_RUNTIME_ERROR"));
            return;
          }

          if (!response || !response.ok) {
            reject(new Error((response && response.reason) || "LLM_ANALYZE_FAILED"));
            return;
          }

          resolve(response.result || { pair_summaries: [], chunk_themes: [] });
        }
      );
    });
  }

  async function analyzePairsByLlm(pairs, settings) {
    if (!settings.enabled || pairs.length === 0) {
      return null;
    }

    const chunks = splitPairsForLlm(pairs, settings.chunkSize);
    const summaryMap = new Map();
    const themesCounter = new Map();

    for (let i = 0; i < chunks.length; i += 1) {
      if (metaContainer) {
        metaContainer.textContent = `LLM global analyzing... chunk ${i + 1}/${chunks.length}`;
      }

      const result = await sendLlmAnalyzeRequest(chunks[i], settings);
      const rows = Array.isArray(result.pair_summaries) ? result.pair_summaries : [];

      for (const row of rows) {
        const id = Number(row.id);
        if (!Number.isFinite(id) || id <= 0) {
          continue;
        }

        const summary = normalizeText(row.summary || (Array.isArray(row.keywords) ? row.keywords.join(" ") : ""));
        const keywords = Array.isArray(row.keywords)
          ? row.keywords.map((x) => normalizeText(String(x))).filter(Boolean).slice(0, 4)
          : summary.split(/\s+/g).filter(Boolean).slice(0, 4);

        if (!summary) {
          continue;
        }

        summaryMap.set(id, {
          summary,
          keywords,
          reason: normalizeText(row.reason || "")
        });
      }

      const themes = Array.isArray(result.chunk_themes) ? result.chunk_themes : [];
      for (const theme of themes) {
        const key = normalizeText(String(theme));
        if (!key) {
          continue;
        }
        themesCounter.set(key, (themesCounter.get(key) || 0) + 1);
      }
    }

    const themes = Array.from(themesCounter.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
      .slice(0, 5);

    return {
      summaryMap,
      themes
    };
  }

  function applyLlmSummaryToTree(tree, llmResult) {
    if (!tree || !tree.root || !llmResult || !llmResult.summaryMap) {
      return;
    }

    const themesText = llmResult.themes && llmResult.themes.length > 0
      ? llmResult.themes.join(" | ")
      : "none";

    function walk(node) {
      if (!node) {
        return;
      }

      if (node.type === "file") {
        const hit = llmResult.summaryMap.get(node.pairId);
        if (!hit) {
          return;
        }

        const summary = normalizeText(hit.summary).split(/\s+/g).filter(Boolean).slice(0, 5).join(" ");
        if (!summary) {
          return;
        }

        node.summary = summary;
        node.content = `${summary}\n\nLLM关键词: ${(hit.keywords || []).join(" | ")}\nLLM全局主题: ${themesText}${hit.reason ? `\nLLM说明: ${hit.reason}` : ""}`;
      }

      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          walk(child);
        }
      }
    }

    walk(tree.root);
  }

  function applyPanelState() {
    if (!panel) {
      return;
    }

    panel.style.left = `${Math.max(4, panelState.x)}px`;
    panel.style.top = `${Math.max(4, panelState.y)}px`;
    panel.style.width = `${Math.max(MIN_WIDTH, panelState.width)}px`;
    panel.style.height = `${Math.max(MIN_HEIGHT, panelState.height)}px`;

    panel.classList.toggle("gct-hidden", !panelState.visible);
    panel.classList.toggle("gct-minimized", panelState.minimized);

    if (launcher) {
      launcher.classList.toggle("gct-hidden", panelState.visible);
    }
  }

  function setPanelVisible(visible) {
    panelState.visible = visible;
    applyPanelState();
    saveState();
  }

  async function analyzeAndRender(turnOverrides = null, mode = "live") {
    if (analysisRunning) {
      queuedAnalyzeArgs = { turnOverrides, mode };
      return;
    }

    analysisRunning = true;

    if (metaContainer) {
      metaContainer.textContent = "Global KNN analyzing...";
    }

    try {
      const llmSettings = await loadLlmSettings();
      const analysisMode = (llmSettings.analysisMode || (llmSettings.enabled ? "llm" : "local")).toLowerCase();
      const turns = Array.isArray(turnOverrides) && turnOverrides.length > 0 ? turnOverrides : extractConversationTurns();
      const turnsFingerprint = buildTurnsFingerprint(turns);
      if (mode === "live" && turnsFingerprint === lastRenderedFingerprint) {
        return;
      }

      const pairs = buildQaPairs(turns);
      const result = buildTree(pairs);
      let llmThemesText = "none";
      let llmStatus = analysisMode === "llm" ? "deferred" : "local";
      const llmEnabledForMode = analysisMode === "llm" && (mode === "full" || mode === "manual");

      if (llmEnabledForMode) {
        llmStatus = "on";
        try {
          const llmResult = await analyzePairsByLlm(pairs, llmSettings);
          if (llmResult) {
            applyLlmSummaryToTree(result, llmResult);
            llmThemesText = llmResult.themes.length > 0 ? llmResult.themes.join("/") : "none";
          }
        } catch (_llmError) {
          // Keep local KNN results available when external LLM is rate-limited.
          llmStatus = "fallback-local";
          llmThemesText = "none";
        }
      } else if (llmSettings.enabled) {
        llmStatus = "deferred";
      }

      const firstQuestionIndex = turns.findIndex((x) => x.role === "user");
      const firstQuestionTag = firstQuestionIndex >= 0 ? `start:Q${String(firstQuestionIndex + 1).padStart(3, "0")}` : "start:unknown";

      subtitle.textContent = `${location.pathname}  |  ${new Date().toLocaleTimeString()}`;

      metaContainer.textContent =
        `Pairs: ${result.stats.pairCount}  |  Answered: ${result.stats.answeredCount}  |  Pending: ${result.stats.pendingCount}  |  Folders: ${result.stats.folders}  |  Topics:${result.stats.topics || 0}(thr=${(result.stats.topicThreshold || 0).toFixed(2)})  |  KNN(k=${result.stats.knnK}, clusters=${result.stats.clusters}, thr=${(result.stats.clusterThreshold || 0).toFixed(2)})  |  Consistency:${(result.stats.classificationConsistencyScore || 0).toFixed(1)}  |  DupScore:${(result.stats.summaryDuplicateRateScore || 0).toFixed(1)}  |  DupRate:${((result.stats.summaryDuplicateRate || 0) * 100).toFixed(1)}%  |  vocab:${result.stats.vocabSize}  |  neighbors:${result.stats.avgNeighbors.toFixed(2)}  |  LLM:${llmStatus}  |  themes:${llmThemesText}  |  ${firstQuestionTag}  |  mode:${mode}-global`;

      renderTreeView(result);
      lastRenderedFingerprint = turnsFingerprint;
    } finally {
      analysisRunning = false;
      if (queuedAnalyzeArgs) {
        const next = queuedAnalyzeArgs;
        queuedAnalyzeArgs = null;
        triggerAnalyze(next.turnOverrides, next.mode);
      }
    }
  }

  function triggerAnalyze(turnOverrides = null, mode = "live") {
    analyzeAndRender(turnOverrides, mode).catch((error) => {
      if (metaContainer) {
        metaContainer.textContent = `Analyze failed: ${error && error.message ? error.message : "unknown"}`;
      }
    });
  }

  function setAllFoldersCollapsed(collapsed) {
    panel.querySelectorAll(".gct-folder").forEach((folder) => {
      folder.dataset.collapsed = collapsed ? "true" : "false";
    });
  }

  function bindDrag(header) {
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    header.addEventListener("mousedown", (event) => {
      if (event.target.closest("button")) {
        return;
      }
      event.preventDefault();
      dragging = true;
      offsetX = event.clientX - panel.offsetLeft;
      offsetY = event.clientY - panel.offsetTop;
      document.body.style.userSelect = "none";
    });

    window.addEventListener("mousemove", (event) => {
      if (!dragging) {
        return;
      }
      panelState.x = event.clientX - offsetX;
      panelState.y = event.clientY - offsetY;
      applyPanelState();
    });

    window.addEventListener("mouseup", () => {
      if (!dragging) {
        return;
      }
      dragging = false;
      document.body.style.userSelect = "";
      saveState();
    });
  }

  function bindResize(resizer) {
    let resizing = false;
    let startX = 0;
    let startY = 0;
    let startW = 0;
    let startH = 0;

    resizer.addEventListener("mousedown", (event) => {
      resizing = true;
      startX = event.clientX;
      startY = event.clientY;
      startW = panel.offsetWidth;
      startH = panel.offsetHeight;
      document.body.style.userSelect = "none";
      event.preventDefault();
    });

    window.addEventListener("mousemove", (event) => {
      if (!resizing) {
        return;
      }
      panelState.width = Math.max(MIN_WIDTH, startW + (event.clientX - startX));
      panelState.height = Math.max(MIN_HEIGHT, startH + (event.clientY - startY));
      applyPanelState();
    });

    window.addEventListener("mouseup", () => {
      if (!resizing) {
        return;
      }
      resizing = false;
      document.body.style.userSelect = "";
      saveState();
    });
  }

  function createLauncher() {
    launcher = createEl("button", "gct-launcher", "TREE");
    launcher.id = LAUNCHER_ID;
    launcher.type = "button";
    launcher.title = "Show Gemini Tree";
    launcher.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setPanelVisible(true);
      triggerAnalyze();
    });
    document.body.appendChild(launcher);
  }

  function bindIconButton(button, onClick) {
    button.type = "button";
    button.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
  }

  function createPanel() {
    panel = createEl("section");
    panel.id = PANEL_ID;

    const header = createEl("div", "gct-header");
    const titleWrap = createEl("div", "gct-title-wrap");
    const title = createEl("div", "gct-title", "Gemini Conversation Tree");
    subtitle = createEl("div", "gct-subtitle", location.pathname);
    titleWrap.append(title, subtitle);

    const actions = createEl("div", "gct-actions");
    const minimizeBtn = createEl("button", "gct-icon-btn", "▁");
    minimizeBtn.title = "Minimize / Expand";
    const closeBtn = createEl("button", "gct-icon-btn", "×");
    closeBtn.title = "Hide";

    actions.append(minimizeBtn, closeBtn);
    header.append(titleWrap, actions);

    const toolbar = createEl("div", "gct-toolbar");
    const refreshBtn = createEl("button", "gct-btn", "Refresh");
    const fullBtn = createEl("button", "gct-btn", "Collect Full");
    const collapseBtn = createEl("button", "gct-btn", "Collapse All");
    const expandBtn = createEl("button", "gct-btn", "Expand All");
    toolbar.append(refreshBtn, fullBtn, collapseBtn, expandBtn);

    const body = createEl("div", "gct-body");
    metaContainer = createEl("div", "gct-meta", "Waiting for conversation...");
    treeContainer = createEl("div", "gct-tree");
    body.append(metaContainer, treeContainer);

    const resizer = createEl("div", "gct-resizer");

    panel.append(header, toolbar, body, resizer);
    document.body.appendChild(panel);

    bindIconButton(minimizeBtn, () => {
      panelState.minimized = !panelState.minimized;
      applyPanelState();
      saveState();
    });

    bindIconButton(closeBtn, () => {
      setPanelVisible(false);
    });

    refreshBtn.addEventListener("click", () => {
      suspendAutoRefresh(15000);
      triggerAnalyze(null, "manual");
    });

    fullBtn.addEventListener("click", async () => {
      fullBtn.disabled = true;
      fullBtn.textContent = "Collecting...";
      suspendAutoRefresh(20000);
      try {
        const fullTurns = await collectFullHistory();
        triggerAnalyze(fullTurns, "full");
      } finally {
        fullBtn.textContent = "Collect Full";
        fullBtn.disabled = false;
      }
    });

    collapseBtn.addEventListener("click", () => {
      setAllFoldersCollapsed(true);
    });

    expandBtn.addEventListener("click", () => {
      setAllFoldersCollapsed(false);
    });

    bindDrag(header);
    bindResize(resizer);
  }

  function togglePanelVisibility() {
    setPanelVisible(!panelState.visible);
    if (panelState.visible) {
      suspendAutoRefresh(4000);
      triggerAnalyze();
    }
  }

  async function handleRuntimeMessage(message) {
    if (!message || !message.type) {
      return;
    }

    if (message.type === "GCT_TOGGLE_PANEL") {
      togglePanelVisibility();
      return;
    }

    if (message.type === "GCT_REFRESH") {
      setPanelVisible(true);
      suspendAutoRefresh(15000);
      triggerAnalyze(null, "manual");
      return;
    }

    if (message.type === "GCT_COLLECT_FULL") {
      setPanelVisible(true);
      suspendAutoRefresh(20000);
      const fullTurns = await collectFullHistory();
      triggerAnalyze(fullTurns, "full");
    }
  }

  function boot() {
    panelState = loadState();
    createPanel();
    createLauncher();
    applyPanelState();
    triggerAnalyze();

    const scheduleRefresh = debounce(() => {
      if (panelState.visible && !panelState.minimized && !isAutoRefreshSuspended()) {
        triggerAnalyze();
      }
    }, 2600);

    const observer = new MutationObserver((records) => {
      if (!isMutationRelevantForConversation(records)) {
        return;
      }
      scheduleRefresh();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    chrome.runtime.onMessage.addListener((message) => {
      handleRuntimeMessage(message).catch(() => {
        // Ignore runtime command failures to avoid affecting page behavior.
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
