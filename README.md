# OpenClaw Setup

Docker-based setup for running [OpenClaw](https://github.com/openclaw/openclaw) — an open-source AI agent framework. This repo provides everything you need to self-host OpenClaw with a single `docker compose` command.

## What's Included

| File / Folder | Purpose |
|---|---|
| `docker-compose.yml` | Two services: **CLI** (interactive) and **Gateway** (web UI + whisper + browser) |
| `Dockerfile.gateway` | Gateway image: base OpenClaw + whisper-cli (audio) + Playwright Chromium (stealth browser) |
| `scripts/upgrade.sh` | One-command upgrade to the latest OpenClaw version |
| `data/openclaw.json` | Example config (tracked): Codex + Telegram, browser + audio; replace with your own tokens/settings |
| `data/browser/chrome-wrapper.sh` | Stealth Chrome wrapper (anti-detection flags) used when browser tool is enabled |
| `data/browser/stealth-browse.js` | Stealth Playwright script for bot-protected sites (screenshot, content, click, type, scroll) |
| `data/` | Persistent volume mount for all OpenClaw data |

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and **Docker Compose v2**
- A Claude AI session key (configured during onboarding)

## Quick Start

### 1. Clone and configure

```bash
git clone https://github.com/your-org/openclaw_setup.git
cd openclaw_setup
cp .env.example .env
```

Edit `.env` and set at minimum:

- **`OPENCLAW_GATEWAY_TOKEN`** — authentication token for the web UI. Generate one with:
  ```bash
  openssl rand -hex 32
  ```

### 2. Build the image

The image is built directly from the OpenClaw source repo:

```bash
docker compose build
```

### 3. Run onboarding (first time only)

This walks you through linking your Claude AI credentials:

```bash
docker compose run --rm openclaw-cli onboard
```

### 4. Start the gateway

```bash
docker compose up -d openclaw-gateway
```

The web UI will be available at **http://localhost:18789** (or the port you configured).

### 5. Use the CLI (optional)

For interactive CLI sessions:

```bash
docker compose run --rm openclaw-cli
```

## Configuration

All settings live in `.env`. See `.env.example` for the full list with descriptions. Key options:

| Variable | Default | Description |
|---|---|---|
| `OPENCLAW_IMAGE` | `openclaw:local` | Docker image name |
| `OPENCLAW_GATEWAY_PORT` | `18789` | Web UI port |
| `OPENCLAW_BRIDGE_PORT` | `18790` | Bridge connection port |
| `OPENCLAW_GATEWAY_BIND` | `lan` | Network binding: `localhost`, `lan`, or `public` |
| `OPENCLAW_GATEWAY_TOKEN` | *(required)* | Auth token for web UI access |
| `OPENCLAW_DOCKER_APT_PACKAGES` | *(empty)* | Extra system packages to install in the container |

## Configuration (openclaw.json)

The included `data/openclaw.json` is an **example** set up for **Codex** and **Telegram** with the **browser** tool and **audio transcription** (whisper-cli) enabled. You should replace it with your own configuration: set `gateway.auth.token` for web UI access, and if you use Telegram set `channels.telegram.botToken` and `channels.telegram.allowFrom` (array of user IDs). The file is tracked in git. Gateway env vars (`OPENCLAW_GATEWAY_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOW_FROM`) are still passed into the container and can override or supplement the file.

## Data Directory

All persistent data is stored in `./data/`, which maps to `~/.openclaw` inside the container:

```
data/
├── openclaw.json              # Configuration (tracked); gateway token, Telegram, browser, audio
├── browser/
│   ├── chrome-wrapper.sh      # Stealth Chrome wrapper for browser tool
│   └── stealth-browse.js      # Stealth Playwright for bot-protected sites
├── agents/                    # Agent configs and session transcripts (.jsonl)
├── canvas/                    # Canvas files
├── cron/                      # Cron job definitions
├── memory/                    # Vector embeddings (SQLite) for semantic search
└── workspace/                 # Working directory for agent tasks
```

> **Note:** `openclaw.json` is tracked. Other sensitive paths (credentials, identity keys, etc.) remain in `.gitignore`.

## Upgrading

To pull the latest OpenClaw source and rebuild:

```bash
./scripts/upgrade.sh
```

This will rebuild the Docker image from the latest `main` branch, restart the gateway, and clean up old images. Your data in `./data/` is preserved.

## Security Notes

- The gateway binds to `127.0.0.1` by default, so it is **not** exposed to the public internet.
- Change `OPENCLAW_GATEWAY_BIND` to `localhost` for the most restrictive access, or `public` only if you understand the risks.
- Never commit your `.env` file — it contains secrets.

## License

See the [OpenClaw repository](https://github.com/openclaw/openclaw) for license details.
