async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

const DEFAULT_PROVIDER = "pollinations";

const DEFAULT_POLLINATIONS_SETTINGS = {
  baseUrl: "https://text.pollinations.ai/openai",
  model: "openai-large",
  temperature: 0.2
};

const DEFAULT_OLLAMA_SETTINGS = {
  baseUrl: "http://127.0.0.1:11434",
  model: "qwen2.5:7b-instruct",
  temperature: 0.2
};

function normalizeBaseUrl(baseUrl) {
  const raw = (baseUrl || "http://127.0.0.1:11434").trim();
  return raw.replace(/\/+$/, "");
}

function clipText(text, maxChars) {
  if (!text) {
    return "";
  }
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)} ...`;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function extractJsonObject(text) {
  if (!text) {
    throw new Error("EMPTY_LLM_RESPONSE");
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text.trim();

  try {
    return JSON.parse(candidate);
  } catch (_error) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error("INVALID_JSON_FROM_LLM");
  }
}

function sanitizeLlmResponse(parsed) {
  const pairSummaries = Array.isArray(parsed.pair_summaries) ? parsed.pair_summaries : [];
  const chunkThemes = Array.isArray(parsed.chunk_themes) ? parsed.chunk_themes : [];

  const cleanSummaries = pairSummaries
    .map((item) => {
      const id = Number(item && item.id);
      const keywords = Array.isArray(item && item.keywords)
        ? item.keywords.map((x) => String(x).trim()).filter(Boolean).slice(0, 4)
        : [];
      const summary = String(item && item.summary ? item.summary : keywords.join(" ")).trim();
      const reason = String(item && item.reason ? item.reason : "").trim();

      if (!Number.isFinite(id) || id <= 0) {
        return null;
      }

      return {
        id,
        keywords,
        summary: summary || keywords.join(" "),
        reason
      };
    })
    .filter(Boolean);

  const cleanThemes = chunkThemes.map((x) => String(x).trim()).filter(Boolean).slice(0, 8);

  return {
    pair_summaries: cleanSummaries,
    chunk_themes: cleanThemes
  };
}

async function fetchWithTimeout(url, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API_HTTP_${response.status}: ${clipText(errText, 260)}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function buildAnalysisPrompts(pairs) {
  const systemPrompt = [
    "You are a precise conversation analyst.",
    "Task: analyze all provided Q/A pairs and summarize EACH pair in 2-4 highly distinctive keywords.",
    "Rules:",
    "1) Keep keywords concise, concrete, and differentiating.",
    "2) Do not use vague words like: 方案, 问题, 内容, said, ppl, people, thing.",
    "3) Prefer answer-specific terms over repeated question template words.",
    "4) Output JSON only.",
    "JSON schema:",
    "{\"pair_summaries\":[{\"id\":1,\"keywords\":[\"k1\",\"k2\",\"k3\"],\"summary\":\"k1 k2 k3\",\"reason\":\"short reason\"}],\"chunk_themes\":[\"theme1\",\"theme2\"]}"
  ].join("\n");

  const userPrompt = JSON.stringify(
    {
      instruction: "Summarize each pair with distinct keywords.",
      pairs
    },
    null,
    2
  );

  return {
    systemPrompt,
    userPrompt
  };
}

async function analyzePairsWithOllama(payload) {
  const pairs = Array.isArray(payload && payload.pairs) ? payload.pairs : [];
  const settings = payload && payload.settings ? payload.settings : {};

  if (pairs.length === 0) {
    return {
      pair_summaries: [],
      chunk_themes: []
    };
  }

  const baseUrl = normalizeBaseUrl(settings.baseUrl || DEFAULT_OLLAMA_SETTINGS.baseUrl);
  const model = settings.model || DEFAULT_OLLAMA_SETTINGS.model;
  const temperature = Number.isFinite(Number(settings.temperature))
    ? Number(settings.temperature)
    : DEFAULT_OLLAMA_SETTINGS.temperature;
  const prompts = buildAnalysisPrompts(pairs);

  const body = {
    model,
    stream: false,
    format: "json",
    options: {
      temperature,
      num_predict: 2200
    },
    messages: [
      { role: "system", content: prompts.systemPrompt },
      { role: "user", content: prompts.userPrompt }
    ]
  };

  const data = await fetchWithTimeout(`${baseUrl}/api/chat`, body, 85000);
  const messageText = data && data.message && data.message.content ? String(data.message.content) : "";
  const parsed = extractJsonObject(messageText);
  return sanitizeLlmResponse(parsed);
}

async function analyzePairsWithPollinations(payload) {
  const pairs = Array.isArray(payload && payload.pairs) ? payload.pairs : [];
  const settings = payload && payload.settings ? payload.settings : {};

  if (pairs.length === 0) {
    return {
      pair_summaries: [],
      chunk_themes: []
    };
  }

  const baseUrl = settings.baseUrl || DEFAULT_POLLINATIONS_SETTINGS.baseUrl;
  const model = settings.model || DEFAULT_POLLINATIONS_SETTINGS.model;
  const temperature = Number.isFinite(Number(settings.temperature))
    ? Number(settings.temperature)
    : DEFAULT_POLLINATIONS_SETTINGS.temperature;
  const prompts = buildAnalysisPrompts(pairs);

  const body = {
    model,
    temperature,
    messages: [
      { role: "system", content: prompts.systemPrompt },
      { role: "user", content: prompts.userPrompt }
    ]
  };

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const data = await fetchWithTimeout(baseUrl, body, 90000);
      const messageText = data && data.choices && data.choices[0] && data.choices[0].message
        ? String(data.choices[0].message.content || "")
        : "";
      const parsed = extractJsonObject(messageText);
      return sanitizeLlmResponse(parsed);
    } catch (error) {
      lastError = error;
      const message = error && error.message ? error.message : "";
      const isRetriable = message.includes("API_HTTP_429") || message.includes("API_HTTP_503") || message.includes("aborted");
      if (!isRetriable || attempt >= 3) {
        break;
      }
      await sleep(900 * attempt + Math.floor(Math.random() * 350));
    }
  }

  throw lastError || new Error("POLLINATIONS_FAILED");
}

async function analyzePairsWithLlm(payload) {
  const settings = payload && payload.settings ? payload.settings : {};
  const provider = String(settings.provider || DEFAULT_PROVIDER).toLowerCase();

  if (provider === "ollama") {
    return analyzePairsWithOllama(payload);
  }

  return analyzePairsWithPollinations(payload);
}

async function sendToContent(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (_error) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["src/content.js"]
    });
    await chrome.tabs.sendMessage(tabId, message);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.scope === "llm" && message.type === "GCT_LLM_ANALYZE") {
    analyzePairsWithLlm(message.payload)
      .then((result) => {
        sendResponse({ ok: true, result });
      })
      .catch((error) => {
        sendResponse({ ok: false, reason: error && error.message ? error.message : "LLM_ANALYZE_FAILED" });
      });
    return true;
  }

  if (!message || message.scope !== "popup") {
    return;
  }

  (async () => {
    const tab = await getActiveTab();
    if (!tab || !tab.id || !tab.url || !tab.url.startsWith("https://gemini.google.com/")) {
      sendResponse({ ok: false, reason: "NOT_GEMINI_TAB" });
      return;
    }

    await sendToContent(tab.id, { type: message.type });
    sendResponse({ ok: true });
  })().catch((error) => {
    sendResponse({ ok: false, reason: error && error.message ? error.message : "UNKNOWN_ERROR" });
  });

  return true;
});
