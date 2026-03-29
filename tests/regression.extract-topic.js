"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const contentPath = path.resolve(__dirname, "..", "src", "content.js");
const source = fs.readFileSync(contentPath, "utf8");

function extractConstExpression(src, constName) {
  const re = new RegExp(`const\\s+${constName}\\s*=\\s*([^;]+);`);
  const match = src.match(re);
  if (!match) {
    throw new Error(`Cannot find constant: ${constName}`);
  }
  return match[1].trim();
}

function extractFunctionSource(src, signatureStart) {
  const start = src.indexOf(signatureStart);
  if (start < 0) {
    throw new Error(`Cannot find function signature: ${signatureStart}`);
  }

  const braceStart = src.indexOf("{", start);
  if (braceStart < 0) {
    throw new Error(`Cannot find function body start: ${signatureStart}`);
  }

  let depth = 0;
  for (let i = braceStart; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return src.slice(start, i + 1);
      }
    }
  }

  throw new Error(`Cannot parse function body end: ${signatureStart}`);
}

const uiPrefixExpr = extractConstExpression(source, "UI_QUOTE_PREFIX_PATTERN");
const extractTopicFnSource = extractFunctionSource(
  source,
  "function extractTopicFromAnswerDetailed(answerText)"
);

const runtimeCode = `
const UI_QUOTE_PREFIX_PATTERN = ${uiPrefixExpr};
${extractTopicFnSource}
module.exports = { UI_QUOTE_PREFIX_PATTERN, extractTopicFromAnswerDetailed };
`;

const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(runtimeCode, sandbox, {
  filename: "content.js[extractTopicFromAnswerDetailed]"
});

const { extractTopicFromAnswerDetailed } = sandbox.module.exports;
if (typeof extractTopicFromAnswerDetailed !== "function") {
  throw new Error("extractTopicFromAnswerDetailed is not callable");
}

function run() {
  const exactCases = [
    {
      name: "filters hidden Gemini prefix and extracts object",
      input: "Gemini said: 这张图片展示了 Lasso 回归 的原理。",
      expected: "Lasso 回归"
    },
    {
      name: "extracts object from media sentence directly",
      input: "这张图片展示了 岭回归 的概念，并给出对比。",
      expected: "岭回归"
    },
    {
      name: "keeps AI confirm extraction after hidden prefix",
      input: "Gemini said: 我来详细解释弹性网络回归的例子。",
      expected: "弹性网络回归"
    },
    {
      name: "removes said prefix and strips markdown stars in PPT media sentence",
      input: "said: 这页 PPT 展示了**二阶多项式回归**的原理。",
      expected: "二阶多项式回归"
    },
    {
      name: "strips markdown symbols when extracting from doc intro",
      input: "Gemini said: 这页 PPT 展示了 **岭回归** 的概念。",
      expected: "岭回归"
    },
    {
      name: "handles concatenated Gemini said prefix without delimiter",
      input: "Gemini said这张图片展示了 **Lasso 回归** 的原理。",
      expected: "Lasso 回归"
    }
  ];

  for (const t of exactCases) {
    const actual = extractTopicFromAnswerDetailed(t.input);
    assert.strictEqual(
      actual,
      t.expected,
      `${t.name} | expected="${t.expected}", actual="${actual}"`
    );
  }

  const fallbackInput = "这张图片主要展示了 线性回归和岭回归";
  const fallbackActual = extractTopicFromAnswerDetailed(fallbackInput);
  assert.ok(fallbackActual.length >= 2, "fallback output should not be empty");
  assert.ok(!/^这张图(?:片)?/.test(fallbackActual), `fallback still has media subject: ${fallbackActual}`);
  assert.ok(
    /线性回归|岭回归/.test(fallbackActual),
    `fallback should preserve semantic object, actual="${fallbackActual}"`
  );

  console.log("Regression passed: 7/7 cases");
}

run();
