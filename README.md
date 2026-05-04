# 🔖 LinkVault

> Personal AI-powered bookmark manager. Your data, your keys, your control.

LinkVault is a self-hosted bookmark manager that uses AI to automatically generate summaries and tags. Unix philosophy: everything in plain text files, no database, no SaaS lock-in, no bookmark limits.

## ✨ Features

- 🤖 **AI-generated summaries** — Claude, Gemini, OpenAI, and OpenRouter
- 📁 **Plain text files** — `.md` + `.meta.json`, no database
- ☁️ **Flexible storage** — local disk, Cloudflare R2, S3, MinIO, or WebDAV
- 📱 **Desktop and Android apps** — built with Tauri (Rust + Next.js)
- 🌐 **Read-only web portal** — access from any browser (multi-user)
- 🔌 **Chrome extension** — save while you browse
- 🎬 **Native embeds** — YouTube, Vimeo, Twitter, Spotify
- 🎙️ **Audio summaries** — share a podcast or voice note, AI transcribes and summarizes
- 🆓 **Zero cost** — Gemini free tier + Cloudflare free tier = effectively unlimited for personal use

## 🤔 Why?

I got tired of bookmark managers that don't respect three simple things:

1. **No artificial limits** — Karakeep cloud caps you at 10 bookmarks
2. **No SaaS lock-in** — I want full control of my own data
3. **Simple setup** — Karakeep self-hosted requires Docker with 7+ containers

So I built my own. Self-hosted that your family can install in 5 minutes.

## 🚀 Quick Start

> 🚧 Phase 1 (Desktop MVP) is implemented. Cloud storage / Android / Portal are next.

### Run from source (dev)

Requirements: Node 20+, Rust stable, system deps for Tauri ([guide](https://v2.tauri.app/start/prerequisites/)).

```bash
nvm use 20
npm install
npm run tauri:dev
```

On first launch:
1. Click **Configurações** in the top-right
2. Pick your default AI provider (Gemini has a free tier)
3. Paste the API key (stored in your OS keychain — never on disk)
4. Optional: change the storage folder (defaults to `~/Documents/LinkVault`)
5. Hit **Novo** in the header and paste a URL — articles, YouTube videos, etc.

### Build a desktop binary

```bash
npm run tauri:build
```

Output is in `src-tauri/target/release/bundle/`.

Full documentation: [INSTALLATION.md](docs/INSTALLATION.md) (coming soon)

## 📐 Architecture

Complete design and technical decisions document: [docs/architecture.md](docs/architecture.md) (in Portuguese)

Summary:

```
┌─────────────────────────────────────────────┐
│  Desktop / Android app (Tauri + Next.js)    │
│                ↓ create/edit                 │
├─────────────────────────────────────────────┤
│  Storage (local / R2 / S3 / MinIO / WebDAV) │
│  parallel .md + .meta.json files            │
│                ↓ read                        │
├─────────────────────────────────────────────┤
│  Read-only Web Portal (Cloudflare Pages)    │
│  + Chrome Extension (creates via portal)    │
└─────────────────────────────────────────────┘
```

## 🛠️ Stack

- **Frontend**: Next.js 16 (App Router, static export), React 19, TypeScript, Tailwind CSS 4
- **Desktop/Mobile shell**: Tauri 2 (Rust)
- **AI**: Anthropic Claude, Google Gemini, OpenAI, OpenRouter (called via `@tauri-apps/plugin-http`, no CORS issues)
- **Storage**: local disk (working) — Cloudflare R2, S3, MinIO, WebDAV (planned for Phase 2)
- **Web portal**: Cloudflare Pages + D1 (serverless SQLite) + R2 (planned for Phase 5)

## 🗺️ Roadmap

- [x] **Phase 1**: Desktop MVP (Linux/Mac/Windows) — list, detail with embeds, AI processing, multi-provider, OS-keychain secrets, configurable summary language
- [ ] **Phase 2**: Cloud Storage (R2, S3, WebDAV)
- [ ] **Phase 3**: Android app with Share Intent
- [ ] **Phase 4**: Polish (search, themes, export)
- [ ] **Phase 5**: Read-only Web Portal
- [ ] **Phase 6**: Chrome Extension

Details in [docs/architecture.md](docs/architecture.md#10-roadmap-de-desenvolvimento).

## 🤝 Contributing

Issues and PRs are welcome. If you've also been frustrated by existing bookmark managers, your perspective is valuable.

Before opening a large issue or feature PR, please open a [Discussion](../../discussions) first so we can align.

## 📜 License

[MIT](LICENSE) — do whatever you want, just don't sue me.

## 🙏 Inspiration

- [Karakeep](https://karakeep.app/) — for the general idea, but with overly complex self-hosted setup
- [Hoarder](https://github.com/hoarder-app/hoarder) — predecessor of Karakeep
- [Joplin](https://joplinapp.org/) — for the plain-text-files philosophy

---

*Built by a dev tired of limited SaaS, with Claude's help on the architecture design.*
