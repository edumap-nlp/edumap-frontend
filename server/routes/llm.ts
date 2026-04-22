import { Router, type Request, type Response } from 'express'
import { AzureOpenAI, OpenAI } from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'

export const llmRouter = Router()

// Initialize clients lazily
let openaiClient: OpenAI | AzureOpenAI | null = null
let anthropicClient: Anthropic | null = null
let googleClient: GoogleGenerativeAI | null = null

/**
 * Detect whether we're using Azure OpenAI (OPENAI_ENDPOINT set) or standard OpenAI.
 */
function getOpenAI(): OpenAI | AzureOpenAI {
  if (!openaiClient) {
    const endpoint = process.env.OPENAI_ENDPOINT
    if (endpoint) {
      // Azure OpenAI configuration
      openaiClient = new AzureOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        endpoint,
        deployment: process.env.OPENAI_DEPLOYMENT_NAME ?? 'gpt-5',
        apiVersion: process.env.OPENAI_API_VERSION ?? '2025-01-01-preview',
      })
    } else {
      // Standard OpenAI
      openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    }
  }
  return openaiClient
}

function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return anthropicClient
}

function getGoogle(): GoogleGenerativeAI {
  if (!googleClient) {
    googleClient = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY ?? '')
  }
  return googleClient
}

interface ChatRequest {
  provider: 'openai' | 'anthropic' | 'google' | 'openai-codex'
  model: string
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
  temperature?: number
  maxTokens?: number
}

llmRouter.post('/chat', async (req: Request, res: Response) => {
  const { provider, model, messages, temperature = 0.3, maxTokens = 4096 } = req.body as ChatRequest

  try {
    let content: string
    let usage: { promptTokens: number; completionTokens: number } | undefined

    switch (provider) {
      case 'openai':
      case 'openai-codex': {
        if (!process.env.OPENAI_API_KEY) {
          return res.status(400).json({ error: 'OPENAI_API_KEY not configured' })
        }
        const oai = getOpenAI()

        // For Azure OpenAI, use the deployment name instead of the model name.
        // For standard OpenAI, let OPENAI_MODEL (.env) override the frontend's
        // requested model — the frontend ships future model names like
        // `gpt-5.2` / `gpt-codex-5.3` that not every OpenAI account has access
        // to, so this lets Jun pin a known-good model (e.g. `gpt-5`, `gpt-4o`)
        // without touching client code.
        const isAzure = !!process.env.OPENAI_ENDPOINT
        const modelOrDeployment = isAzure
          ? (process.env.OPENAI_DEPLOYMENT_NAME ?? 'gpt-5')
          : (process.env.OPENAI_MODEL ?? model)

        // Azure GPT-5 may restrict temperature — only include it for standard OpenAI
        const chatParams: Record<string, unknown> = {
          model: modelOrDeployment,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          max_completion_tokens: maxTokens,
        }
        if (!isAzure) {
          chatParams.temperature = temperature
        }

        const completion = await oai.chat.completions.create(chatParams as any)
        content = completion.choices[0]?.message?.content ?? ''
        usage = {
          promptTokens: completion.usage?.prompt_tokens ?? 0,
          completionTokens: completion.usage?.completion_tokens ?? 0,
        }
        break
      }

      case 'anthropic': {
        if (!process.env.ANTHROPIC_API_KEY) {
          return res.status(400).json({ error: 'ANTHROPIC_API_KEY not configured' })
        }
        const anthropic = getAnthropic()
        const systemMsg = messages.find((m) => m.role === 'system')?.content ?? ''
        const userMsgs = messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
        const response = await anthropic.messages.create({
          model,
          max_tokens: maxTokens,
          system: systemMsg,
          messages: userMsgs,
        })
        content = response.content
          .filter((c): c is Anthropic.TextBlock => c.type === 'text')
          .map((c) => c.text)
          .join('')
        usage = {
          promptTokens: response.usage?.input_tokens ?? 0,
          completionTokens: response.usage?.output_tokens ?? 0,
        }
        break
      }

      case 'google': {
        if (!process.env.GOOGLE_API_KEY) {
          return res.status(400).json({ error: 'GOOGLE_API_KEY not configured' })
        }
        const genAI = getGoogle()
        const genModel = genAI.getGenerativeModel({ model })
        const systemMsg = messages.find((m) => m.role === 'system')?.content ?? ''
        const userMsg = messages.find((m) => m.role === 'user')?.content ?? ''
        const result = await genModel.generateContent(`${systemMsg}\n\n${userMsg}`)
        const response = result.response
        content = response.text()
        usage = {
          promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
          completionTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
        }
        break
      }

      default:
        return res.status(400).json({ error: `Unknown provider: ${provider}` })
    }

    res.json({ content, model, usage })
  } catch (err: any) {
    console.error(`LLM API error (${provider}/${model}):`, err.message ?? err)
    res.status(500).json({ error: err.message ?? 'LLM API call failed' })
  }
})
