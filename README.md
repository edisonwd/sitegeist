<p align="center">
  <img src="media/hero.png" alt="Sitegeist" width="400">
</p>

An AI assistant that lives in your browser sidebar. Built for collaboration, not autonomy theater. You guide, it executes.

Sitegeist can automate repetitive web tasks, extract data from any website, navigate across pages, fill out forms, compare products, compile research, and transform what it finds into documents, spreadsheets, or whatever you need. It works on any website through a Chrome/Edge side panel, using the AI provider of your choice.

Bring your own API key or log in with an existing subscription (Anthropic Claude, OpenAI/ChatGPT, GitHub Copilot, Google Gemini). Your data stays on your machine. Nothing is collected or tracked.

## Download & Install

Visit [sitegeist.ai](https://sitegeist.ai) for download links and step-by-step installation instructions.

Requires Chrome 141+ or Edge equivalent.

## Development

Clone this repository and install dependencies:

```bash
git clone <this-repo>
cd sitegeist
npm install
```

`npm install` sets up the Husky pre-commit hook automatically.

Start all dev watchers (extension and marketing site):

```bash
./dev.sh
```

The dev watcher automatically rebuilds the extension on file changes. No manual rebuilding of dependencies needed - all dependencies are now npm packages.

To run only the extension watcher without the marketing site:

```bash
npm run dev
```

### Loading the extension in Chrome

1. Build the extension:

   ```bash
   npm run build
   ```

   The build output is written to `dist-chrome/`.

2. Open Chrome, navigate to `chrome://extensions/`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked**
5. Select the `sitegeist/dist-chrome/` directory
6. Click **Details** on the Sitegeist extension card and enable:
   - **Allow user scripts**
   - **Allow access to file URLs**

### Reloading after code changes

If `./dev.sh` is running, the dev watcher rebuilds automatically on file save. After the rebuild completes, go to `chrome://extensions/` and click the refresh icon on the Sitegeist extension card. No need to remove and re-add it.

For a one-off build without the dev watcher:

```bash
npm run build
```

Then click the refresh icon on the extension card as above.

### First run

On first launch, Sitegeist prompts you to connect at least one AI provider. You can log in with a subscription or enter an API key.

Some subscription logins require the CORS proxy (configurable in Settings > Proxy). The default proxy is `https://proxy.mariozechner.at/proxy`.

### Custom model providers

Sitegeist supports custom OpenAI-compatible providers (Ollama, llama.cpp, vLLM, LM Studio, or any OpenAI-compatible endpoint):

1. Go to Settings > Custom Model Providers
2. Click "Add Provider" and select your provider type
3. Configure the base URL and API key (if required)
4. For manual providers, add your models individually

Custom providers don't require API keys for local endpoints (e.g., Ollama at `http://localhost:11434`). The extension automatically handles compatibility with different OpenAI-compatible APIs.

## Checks

```bash
./check.sh
```

Runs formatting, linting, and type checking for the extension and the `site/` subproject.

The Husky pre-commit hook runs the same checks before each commit.

## Building

```bash
npm run build
```

The unpacked extension is written to `dist-chrome/`.

## Updating the website

```bash
cd site && ./run.sh deploy
```

Builds the static site and uploads it to `sitegeist.ai`. Requires SSH access to `slayer.marioslab.io`.

## Releasing

```bash
./release.sh patch   # 1.0.0 -> 1.0.1
./release.sh minor   # 1.0.0 -> 1.1.0
./release.sh major   # 1.0.0 -> 2.0.0
```

Bumps the version in `static/manifest.chrome.json`, commits, tags, and pushes. GitHub Actions builds the extension and creates a release at [github.com/badlogic/sitegeist/releases](https://github.com/badlogic/sitegeist/releases).

## License

AGPL-3.0. See [LICENSE](LICENSE).
