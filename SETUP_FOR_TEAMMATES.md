# EduMap Setup Guide (for Teammates)

This project supports **4 different** LLM backends:

| Backend | Required env vars | Notes |
|---|---|---|
| Azure OpenAI | `OPENAI_API_KEY` + `OPENAI_ENDPOINT` + `OPENAI_DEPLOYMENT_NAME` | Common for school/company subscriptions |
| Standard OpenAI | `OPENAI_API_KEY` (optional `OPENAI_MODEL`) | Personal account on platform.openai.com |
| Google AI (Gemini) | `GOOGLE_API_KEY` | Free tier available at aistudio.google.com |
| Anthropic (Claude) | `ANTHROPIC_API_KEY` | console.anthropic.com |

As long as **any one** of these is configured, `/api/health` will report that provider as `true` and the frontend will automatically pick a working one. **You only need to configure the one you have** — you don't need to fill in all of them.

---

## Step 1 — Common setup

```bash
git clone <repo-url>
cd edumap-frontend
npm install
cp .env.example .env
```

Then edit `.env` according to whichever option below matches your account.

---

## Option A: Azure OpenAI

Go to the Azure Portal, find your OpenAI resource, and grab three things:
1. **Key** — from the "Keys and Endpoint" page (KEY 1 or KEY 2)
2. **Endpoint** — same page, looks like `https://<your-resource-name>.openai.azure.com/`
3. **Deployment name** — from the "Model deployments" page, whatever name *you* gave your deployment (e.g. `gpt-5`, `gpt-4o-mine`, etc.)

Edit `.env`:

```env
OPENAI_API_KEY=<paste your Azure key>
OPENAI_ENDPOINT=https://<your-resource-name>.openai.azure.com/
OPENAI_DEPLOYMENT_NAME=<your deployment name>
OPENAI_API_VERSION=2025-01-01-preview
```

> ⚠️ **Important**: `OPENAI_DEPLOYMENT_NAME` is your **deployment name** on Azure, not the underlying model name. They don't have to match — if you deployed `gpt-4o` under the name `my-gpt`, put `my-gpt` here.

---

## Option B: Google AI (Gemini)

1. Go to [aistudio.google.com](https://aistudio.google.com/) and sign in
2. Left sidebar → "Get API key" → "Create API key"
3. Copy the key (starts with `AIza...`)

Edit `.env` (**delete or comment out the OpenAI lines** — keep only this one):

```env
GOOGLE_API_KEY=<paste your Gemini key>
```

The default model is `gemini-2.5-flash` (defined on line 6 of `src/services/agentOrchestrator.ts`). If your account can only access older models like `gemini-1.5-flash`, change that line to:

```ts
const GOOGLE_MODEL = 'gemini-1.5-flash'
```

---

## Option C: Standard OpenAI (platform.openai.com)

1. Create a key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Make sure your account has credits or an active subscription

Edit `.env`:

```env
OPENAI_API_KEY=sk-<paste your key>
# Optional: if your account doesn't have access to gpt-5 / gpt-4o,
# pin a model you know works.
# OPENAI_MODEL=gpt-4o-mini
```

**Do NOT** set `OPENAI_ENDPOINT` — as long as that one is unset, the backend routes to standard OpenAI instead of Azure.

> 💡 Why does `OPENAI_MODEL` exist? The frontend requests `gpt-4o` by default, but different accounts have access to different models. This env var lets you swap the model **without touching code**.

---

## Option D: Anthropic (Claude)

1. Create a key at [console.anthropic.com](https://console.anthropic.com/)
2. Edit `.env`:

```env
ANTHROPIC_API_KEY=sk-ant-<paste your key>
```

The default model is `claude-sonnet-4.6` (defined in `src/services/agentOrchestrator.ts`). If your account only has access to other Claude models, find-and-replace `claude-sonnet-4.6` globally with whatever model you can use.

---

## Start & verify

```bash
npm run dev:full
```

This spawns two processes:
- Vite frontend → http://localhost:5174
- Express backend → http://localhost:3001

### Confirm the backend recognizes your key

Open http://localhost:3001/api/health in the browser — you should see something like:

```json
{
  "status": "ok",
  "backend": "azure-openai",           // or "openai"
  "models": {
    "openai": true,                     // whichever one(s) you set = true
    "anthropic": false,
    "google": false
  }
}
```

On startup the terminal also prints:

```
[server] Loaded OPENAI_API_KEY from .../OPENAI_API_KEY
[server]   ↳ sanitized key: sk-proj...abcd (len=164)
  ✓ OpenAI/Azure OpenAI key configured
```

Cross-check the first 7 characters and last 4 characters against your Azure / OpenAI dashboard to confirm the right key is loaded.

### Confirm the frontend can build a mind map

1. Open http://localhost:5174
2. Click "Upload PDF" in the top right and pick an academic PDF
3. Wait 10–30 seconds (longer for long documents) — a 3-level mind map should appear

---

## Common pitfalls

### 1. Opening `localhost:3001` shows "Cannot GET /"

**The frontend URL is `localhost:5174`**. Port `3001` is the API server — it only answers `/api/*` requests, so hitting the root gives 404. Easy mistake to make.

### 2. `401 Incorrect API key`

The backend logs a masked key at startup (`sk-proj...abcd (len=164)`). Compare the first 7 chars, last 4 chars, and length against what you see in your provider dashboard:
- Mismatch → you copied the key wrong in `.env` (extra quotes / trailing newline / pasted the wrong field)
- Exact match → the key was likely revoked; generate a new one

### 3. `400 Unsupported value: 'temperature' does not support 0.3`

This is a limitation of the GPT-5 / o1 / o3 model families (they only accept the default temperature). The backend in `server/routes/llm.ts` already detects these prefixes and strips `temperature` automatically — **you don't need to do anything** in the normal case. If you still hit this error, it means you're using a model name whose prefix we don't recognize — add your prefix to the `restrictsTemperature` check around line 90 of `server/routes/llm.ts`.

### 4. The first PDF works, the next one fails

Almost always a variant of #3. Check the actual error in the terminal:
```
LLM API error (openai/gpt-5): 400 Unsupported value: 'temperature' ...
```
If it looks like that, it's the same category. Different PDFs route through different branches in `agentOrchestrator.ts`'s `selectModelForDocument` (code-heavy → Google; long text → Anthropic; default → OpenAI), so "one works, the next doesn't" usually means one branch uses a model your account can't access.

### 5. You have a Google / Anthropic account but the backend only mentions OpenAI

Check `.env`: you need to explicitly set `GOOGLE_API_KEY` / `ANTHROPIC_API_KEY`. The backend decides which providers are available based on whether the env var is **set** — it won't guess.

---

## Where the default models live in code

If the default model doesn't work for your account, these are the two places to change:

- **`src/services/agentOrchestrator.ts`**
  - Line 6: `const GOOGLE_MODEL = 'gemini-2.5-flash'`
  - `pickFallbackProvider`: default model for each provider
  - `selectModelForDocument`: heuristic that picks a different model based on document characteristics
- **`server/routes/llm.ts`**
  - Azure uses `OPENAI_DEPLOYMENT_NAME` (changed via env, no code change needed)
  - Standard OpenAI honors the `OPENAI_MODEL` env override (no code change needed)

---

## Files that must NOT be committed

Your `.gitignore` should include at least:

```
.env
OPENAI_API_KEY
node_modules/
```

**Never** commit API keys. If you accidentally push one, revoke it in the provider dashboard immediately and generate a new one.
