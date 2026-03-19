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

app.get('/api/health', (_req, res) => {
  const isAzure = !!process.env.OPENAI_ENDPOINT
  res.json({
    status: 'ok',
    backend: isAzure ? 'azure-openai' : 'openai',
    endpoint: isAzure ? process.env.OPENAI_ENDPOINT : 'api.openai.com',
    deployment: process.env.OPENAI_DEPLOYMENT_NAME ?? 'n/a',
    models: {
      'openai': !!process.env.OPENAI_API_KEY,
      'anthropic': !!process.env.ANTHROPIC_API_KEY,
      'google': !!process.env.GOOGLE_API_KEY,
    },
  })
})

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
