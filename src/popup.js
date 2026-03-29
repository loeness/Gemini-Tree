const statusEl = document.getElementById("status");
const LLM_STORAGE_KEY = "gct-llm-settings-v1";

const DEFAULT_LLM_SETTINGS = {
  analysisMode: "local",
  enabled: false,
  provider: "pollinations",
  baseUrl: "https://text.pollinations.ai/openai",
  model: "openai-large",
  temperature: 0.2
};

const PROVIDER_DEFAULTS = {
  pollinations: {
    baseUrl: "https://text.pollinations.ai/openai",
    model: "openai-large"
  },
  ollama: {
    baseUrl: "http://127.0.0.1:11434",
    model: "qwen2.5:7b-instruct"
  }
};

const analysisModeEl = document.getElementById("analysisMode");
const llmProviderEl = document.getElementById("llmProvider");
const llmBaseUrlEl = document.getElementById("llmBaseUrl");
const llmModelEl = document.getElementById("llmModel");
const saveLlmBtn = document.getElementById("saveLlmBtn");

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#9f2d2d" : "#132126";
}

function sendPopupCommand(type) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        scope: "popup",
        type
      },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, reason: chrome.runtime.lastError.message || "RUNTIME_ERROR" });
          return;
        }
        resolve(response || { ok: false, reason: "NO_RESPONSE" });
      }
    );
  });
}

function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      resolve(result || {});
    });
  });
}

function setStorage(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, () => {
      resolve();
    });
  });
}

async function loadLlmSettings() {
  const data = await getStorage([LLM_STORAGE_KEY]);
  const settings = {
    ...DEFAULT_LLM_SETTINGS,
    ...(data[LLM_STORAGE_KEY] || {})
  };

  analysisModeEl.value = settings.analysisMode || (settings.enabled ? "llm" : "local");
  llmProviderEl.value = settings.provider || DEFAULT_LLM_SETTINGS.provider;
  llmBaseUrlEl.value = settings.baseUrl || DEFAULT_LLM_SETTINGS.baseUrl;
  llmModelEl.value = settings.model || DEFAULT_LLM_SETTINGS.model;
  updateModeUiState();
}

function updateModeUiState() {
  const isLlmMode = analysisModeEl.value === "llm";
  llmProviderEl.disabled = !isLlmMode;
  llmBaseUrlEl.disabled = !isLlmMode;
  llmModelEl.disabled = !isLlmMode;
}

function fillProviderDefaultsIfEmpty() {
  const provider = llmProviderEl.value || DEFAULT_LLM_SETTINGS.provider;
  const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.pollinations;

  if (!llmBaseUrlEl.value.trim()) {
    llmBaseUrlEl.value = defaults.baseUrl;
  }

  if (!llmModelEl.value.trim()) {
    llmModelEl.value = defaults.model;
  }
}

async function saveLlmSettings() {
  const analysisMode = analysisModeEl.value || DEFAULT_LLM_SETTINGS.analysisMode;
  if (analysisMode === "llm") {
    fillProviderDefaultsIfEmpty();
  }

  const provider = llmProviderEl.value || DEFAULT_LLM_SETTINGS.provider;
  const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.pollinations;

  const settings = {
    analysisMode,
    enabled: analysisMode === "llm",
    provider,
    baseUrl: (llmBaseUrlEl.value || defaults.baseUrl).trim(),
    model: (llmModelEl.value || defaults.model).trim(),
    temperature: DEFAULT_LLM_SETTINGS.temperature
  };

  await setStorage({
    [LLM_STORAGE_KEY]: settings
  });

  setStatus("LLM 设置已保存");
}

async function run(type, successText) {
  setStatus("执行中...");
  const result = await sendPopupCommand(type);
  if (!result || !result.ok) {
    const reason = result && result.reason ? result.reason : "UNKNOWN";
    if (reason === "NOT_GEMINI_TAB") {
      setStatus("请先切换到 Gemini 对话页面", true);
      return;
    }
    setStatus(`操作失败: ${reason}`, true);
    return;
  }
  setStatus(successText);
}

document.getElementById("toggleBtn").addEventListener("click", async () => {
  await run("GCT_TOGGLE_PANEL", "已切换浮窗显示状态");
});

document.getElementById("refreshBtn").addEventListener("click", async () => {
  await run("GCT_REFRESH", "摘要已刷新");
});

document.getElementById("collectBtn").addEventListener("click", async () => {
  await run("GCT_COLLECT_FULL", "已触发全量收集");
});

saveLlmBtn.addEventListener("click", async () => {
  await saveLlmSettings();
});

analysisModeEl.addEventListener("change", () => {
  updateModeUiState();
});

llmProviderEl.addEventListener("change", () => {
  const provider = llmProviderEl.value || DEFAULT_LLM_SETTINGS.provider;
  const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.pollinations;
  llmBaseUrlEl.value = defaults.baseUrl;
  llmModelEl.value = defaults.model;
});

loadLlmSettings().catch(() => {
  setStatus("LLM 设置读取失败", true);
});
