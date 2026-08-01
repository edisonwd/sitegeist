# Changelog

## [Unreleased]

### Changed

- **自定义 Providers & Models**: 支持自定义模型提供商和模型系统，允许用户添加和管理自己的 AI 提供商和模型
- **多语言切换**: 支持多语言切换功能，用户可以在界面中切换不同语言
- **Release Script**: Optimized `release.sh` with colored output, dry-run mode (`--dry-run`), tag existence check, branch validation, and interactive confirmation. Updated GitHub URL to current repository (edisonwd/sitegeist).
- **依赖管理**: 将所有本地文件依赖迁移到 npm 包：`@earendil-works/pi-ai` (^0.83.0)、`@earendil-works/pi-agent-core`、`@mariozechner/mini-lit` (^0.2.1)，简化依赖管理和部署流程
- **Code Quality**: Fixed Biome lint warnings - removed unused import in CustomModelDialog.ts and unused suppression comments in app.css and test-sessions.ts
### Fixed

- Custom provider models not appearing in the model selector when the provider name drifts from the stored model provider field (e.g. after renaming a provider). Manual models now always use the current provider name, matching auto-discovery behavior.
- Model switching not working in the chat interface: replaced non-existent `agent.setModel()` calls with direct `agent.state.model` assignment, matching the Agent class API.
- Messages not appearing in chat after streaming completes: changed messages array binding to use spread operator for proper Lit change detection when messages are pushed to the array.
- Send button and Enter key not working after a conversation finishes: `finishRun()` sets `isStreaming = false` after the `agent_end` event but doesn't notify subscribers. Now explicitly sets `isStreaming = false` in the `agent_end` handler so MessageEditor renders the Send button.
- "developer is not one of [system, assistant, user, tool, function]" error when using custom provider models: the newer `@earendil-works/pi-ai` sends "developer" role for reasoning models by default. Custom provider models now set `compat.supportsDeveloperRole: false` to use "system" instead, which is compatible with all OpenAI-compatible endpoints.
- Custom provider models not responding: `getApiKey` returned `undefined` for custom providers without an API key, causing the OpenAI client to throw "No API key for provider". Now returns a dummy key for custom providers that don't require authentication (e.g. Ollama, llama.cpp).

## [1.0.0] - 2026-03-15

### Added

- Browser-based OAuth login for Anthropic (Claude Pro/Max), OpenAI Codex (ChatGPT Plus/Pro), GitHub Copilot, and Google Gemini CLI
- Combined "API Keys & OAuth" settings tab with subscription login and API key entry
- Welcome setup dialog on first launch when no providers are configured
- Auto-select default model for the first provider with a key
- Provider and auth type indicator in the header bar
- Image extraction tool (`extract_image`) with selector and screenshot modes
- Subsequence-based fuzzy search in the model selector
- CORS proxy warning in OAuth sections (orange when enabled, red when disabled)
- GitHub Actions workflow for tagged releases
- `release.sh` script for version bumping and tagged releases

### Changed

- Default model changed to `claude-sonnet-4-6` with `medium` thinking level
- CORS proxy enabled by default
- Model selector only shows models from providers with configured keys
- API key prompt dialog now shows both OAuth login and API key entry for supported providers
- Tool execution set to sequential mode (parallel caused rendering issues in sidebar)
- Site converted to static (removed backend, admin, waitlist signups)
- Download links point to GitHub Releases
- License changed from MIT to AGPL-3.0

### Fixed

- Settings dialog tabs not responding to clicks (upstream `pi-web-ui` built with `tsgo` broke Lit decorator reactivity)
- CORS proxy toggle not updating (same root cause)
- Proxy not applied to API requests (esbuild bundled duplicate `streamSimple` references, breaking identity check)
- Model selector button not updating after picking a model (added `state_change` event to Agent)
- Duplicate tool component rendering during streaming (cleared streaming container on `message_end`)
- Screenshot tool capturing sidepanel instead of the webpage
