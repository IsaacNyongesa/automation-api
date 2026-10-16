# Automation API

Personal automation API with two endpoints:

- **`POST /inbox/triage`** — reads unread Gmail, classifies each email with AI, applies a label, and saves a draft reply when one is needed.
- **`POST /research`** — searches the web, scrapes the top N results, and returns one clean AI summary with sources.

Everything runs locally in Docker. Nothing is sent to third parties except:

- OpenAI (the prompt + email body / scraped text)
- Google (Gmail API)
- DuckDuckGo (the search query)

---

## Requirements

- Node.js ≥ 20
- Docker Desktop (with WSL2 backend on Windows)
- Google Cloud project with **Gmail API** enabled
- OpenAI API key

---

## One-time setup

### 1. Clone / enter project

```powershell
cd C:\dev\automation-api
```
