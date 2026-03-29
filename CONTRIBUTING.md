# Contributing Guide

感谢你为本项目做贡献。

## Development Setup

1. 克隆仓库并进入项目目录。
2. 在 Edge 打开 edge://extensions。
3. 开启 Developer mode。
4. 点击 Load unpacked 并选择仓库根目录。
5. 在 Gemini 页面验证扩展行为。

## Code Changes

- 保持改动聚焦，避免一次 PR 混入无关重构。
- 新增摘要规则时，请同步补充 tests/regression.extract-topic.js 用例。
- 提交前请确保不会破坏现有 MV3 配置与内容脚本注入。

## Pull Request Checklist

- 说明改动动机与影响范围。
- 贴出关键前后对比（必要时附截图）。
- 补充或更新相应测试用例。
- 确认 README/文档是否需要同步更新。

## Commit Message Suggestion

建议使用简洁、可搜索的前缀：

- feat: 新功能
- fix: 缺陷修复
- refactor: 重构
- docs: 文档
- test: 测试
