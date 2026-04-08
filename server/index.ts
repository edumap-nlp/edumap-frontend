import express from 'express'
import cors from 'cors'
import { config } from 'dotenv'
import { llmRouter } from './routes/llm.js'

config()

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(cors())
app.use(express.json({ limit: '50mb' }))

app.use('/api/llm', llmRouter)

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
