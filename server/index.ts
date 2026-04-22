import express from 'express'
import cors from 'cors'
import { config } from 'dotenv'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { llmRouter } from './routes/llm.js'
// [EduMap multimodal] Added 2026-04-21: Yana multimodal pipeline bridge.
// See server/routes/multimodal.ts and INTEGRATION_CHANGES.md for details.
import { multimodalRouter } from './routes/multimodal.js'

config()

// [EduMap multimodal] 2026-04-21: Auto-load OPENAI_API_KEY from a file called
// `OPENAI_API_KEY` sitting next to the frontend project (or in the sibling
// Yana folder). This matches how Jun and his teammate actually keep the key —
// as a plain file, not an env export — so `npm run dev:full` just works on a
// clean machine. Search order prefers the frontend folder, then the Yana
// folder; the env var always wins if already set.
//
// [EduMap multimodal] 2026-04-21 (rev2): Stricter sanitization.
// Jun hit a 401 "Incorrect API key" even though the file looked fine,
// because .trim() only strips outer whitespace — it doesn't handle
// `OPENAI_API_KEY=` env-file-style prefixes, wrapping quotes, a UTF-8 BOM,
// Windows `\r\n` embedded inside the value, or stray spaces. We sanitize
// all of these and print a masked prefix/suffix/length at startup so the
// real key can be visually compared with the OpenAI dashboard.
function sanitizeKey(raw: string): string {
  let s = raw
  // Strip UTF-8 BOM if present.
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1)
  // If the file is a KEY=VALUE line, keep just the VALUE.
  const eq = s.indexOf('=')
  if (eq !== -1 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(s.slice(0, eq).trim())) {
    s = s.slice(eq + 1)
  }
  // Strip all whitespace (spaces, tabs, CR, LF) — OpenAI keys never contain any.
  s = s.replace(/\s+/g, '')
  // Strip wrapping quotes.
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1)
  }
  return s
}

function maskKey(k: string): string {
  if (k.length <= 10) return '***'
  return `${k.slice(0, 7)}...${k.slice(-4)} (len=${k.length})`
}

;(function autoloadOpenAIKeyFile() {
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()) {
    process.env.OPENAI_API_KEY = sanitizeKey(process.env.OPENAI_API_KEY)
    return
  }

  const here = dirname(fileURLToPath(import.meta.url)) // server/
  const frontendRoot = resolve(here, '..')             // edumap-frontend/
  const parentRoot = resolve(frontendRoot, '..')       // shared parent folder
  const candidates = [
    resolve(frontendRoot, 'OPENAI_API_KEY'),
    resolve(parentRoot, 'edumap-frontend', 'OPENAI_API_KEY'),
    resolve(parentRoot, 'edumap_yana_model', 'OPENAI_API_KEY'),
    resolve(parentRoot, 'OPENAI_API_KEY'),
  ]
  for (const p of candidates) {
    try {
      if (existsSync(p)) {
        const key = sanitizeKey(readFileSync(p, 'utf8'))
        if (key) {
          process.env.OPENAI_API_KEY = key
          console.log(`[server] Loaded OPENAI_API_KEY from ${p}`)
          console.log(`[server]   ↳ sanitized key: ${maskKey(key)}`)
          if (!key.startsWith('sk-')) {
            console.warn(
              `[server]   ⚠ Key does not start with "sk-"; OpenAI will reject it. ` +
              `Check the file content — did you accidentally paste something else?`
            )
          }
          return
        }
      }
    } catch {
      /* ignore and try next candidate */
    }
  }
})()

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(cors())
app.use(express.json({ limit: '50mb' }))

app.use('/api/llm', llmRouter)
// [EduMap multimodal] Added 2026-04-21: POST /api/pdf/extract-multimodal
app.use('/api/pdf', multimodalRouter)

app.get('/api/health', async (_req, res) => {
  const isAzure = !!process.env.OPENAI_ENDPOINT;

  const checks: Record<string, { configured: boolean; reachable: boolean | null; error?: string }> = {
    openai: { configured: !!process.env.OPENAI_API_KEY, reachable: null },
    anthropic: { configured: !!process.env.ANTHROPIC_API_KEY, reachable: null },
    google: { configured: !!process.env.GOOGLE_API_KEY, reachable: null },
  };

  // Only probe providers that have keys configured
  const probes: Promise<void>[] = [];

  if (checks.google.configured) {
    probes.push(
      fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash?key=${process.env.GOOGLE_API_KEY}`,
        { method: 'GET', signal: AbortSignal.timeout(5000) }
      )
        .then((r) => {
          checks.google.reachable = r.ok;
          if (!r.ok) checks.google.error = `${r.status} ${r.statusText}`;
        })
        .catch((e) => {
          checks.google.reachable = false;
          checks.google.error = e.message;
        })
    );
  }

  if (checks.openai.configured) {
    const url = isAzure
      ? `${process.env.OPENAI_ENDPOINT}/openai/models?api-version=2024-02-01`
      : 'https://api.openai.com/v1/models';
    const headers: Record<string, string> = isAzure
      ? { 'api-key': process.env.OPENAI_API_KEY! }
      : { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` };

    probes.push(
      fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(5000) })
        .then((r) => {
          checks.openai.reachable = r.ok;
          if (!r.ok) checks.openai.error = `${r.status} ${r.statusText}`;
        })
        .catch((e) => {
          checks.openai.reachable = false;
          checks.openai.error = e.message;
        })
    );
  }

  if (checks.anthropic.configured) {
    probes.push(
      fetch('https://api.anthropic.com/v1/models', {
        method: 'GET',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        signal: AbortSignal.timeout(5000),
      })
        .then((r) => {
          checks.anthropic.reachable = r.ok;
          if (!r.ok) checks.anthropic.error = `${r.status} ${r.statusText}`;
        })
        .catch((e) => {
          checks.anthropic.reachable = false;
          checks.anthropic.error = e.message;
        })
    );
  }

  await Promise.allSettled(probes);

  const allReachable = Object.values(checks).every(
    (c) => !c.configured || c.reachable === true
  );

  res.status(allReachable ? 200 : 207).json({
    status: allReachable ? 'ok' : 'degraded',
    backend: isAzure ? 'azure-openai' : 'openai',
    endpoint: isAzure ? process.env.OPENAI_ENDPOINT : 'api.openai.com',
    deployment: process.env.OPENAI_DEPLOYMENT_NAME ?? 'n/a',
    models: checks,
  });
});

app.listen(PORT, () => {
  const isAzure = !!process.env.OPENAI_ENDPOINT
  console.log(`EduMap API server running on http://localhost:${PORT}`)
  console.log(`Backend: ${isAzure ? 'Azure OpenAI' : 'Standard OpenAI'}`)
  if (isAzure) {
    console.log(`  Endpoint: ${process.env.OPENAI_ENDPOINT}`)
    console.log(`  Deployment: ${process.env.OPENAI_DEPLOYMENT_NAME}`)
  }
  if (process.env.OPENAI_API_KEY) console.log('  ✓ OpenAI/Azure OpenAI key configured')
  if (process.env.ANTHROPIC_API_KEY) console.log('  ✓ Anthropic key configured')
  if (process.env.GOOGLE_API_KEY) console.log('  ✓ Google key configured')
})
