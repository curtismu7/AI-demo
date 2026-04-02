# Phase 26 — Plan 01 Summary

**Status:** Complete  
**Commit:** 31a6043

## What was built

- Added `AI_PLATFORM_LANDSCAPE: 'ai-platform-landscape'` to `educationIds.js`
- Created `AiPlatformLandscapePanel.js` (21.5KB) — education drawer with 7 tabs

## Files modified

- `banking_api_ui/src/components/education/educationIds.js` — added `AI_PLATFORM_LANDSCAPE`
- `banking_api_ui/src/components/education/AiPlatformLandscapePanel.js` — NEW

## Panel architecture

Follows identical pattern to `LlmLandscapePanel.js` and `AgentBuilderLandscapePanel.js`:
- `import EducationDrawer from '../shared/EducationDrawer'`
- Props: `{ isOpen, onClose, initialTabId }`
- Inline styles only
- Helper components: `VendorHeader`, `ToolCard` (defined at top of file)

## Tab content

| Tab | Vendor | Key tools covered |
|-----|--------|-------------------|
| `aws` | Amazon Web Services | Bedrock, SageMaker, Q, Rekognition, Comprehend, Lex, Kendra, Polly/Transcribe |
| `microsoft` | Microsoft Azure AI | Azure OpenAI, AI Foundry, Copilot Studio, AI Search, Semantic Kernel, Phi-3/4 |
| `google` | Google Cloud | Vertex AI, Gemini API, Agent Builder, Workspace AI, Vision/Document AI, BigQuery ML |
| `ibm` | IBM watsonx | watsonx.ai, Granite models, watsonx.data, watsonx.governance, Watson Assistant |
| `anthropic` | Anthropic | Claude family, direct API, Bedrock hosted, Vertex hosted, Constitutional AI |
| `openai` | OpenAI | GPT-4o/o1/o3, Chat Completions API, Assistants API, Realtime API, DALL-E 3, fine-tuning |
| `comparison` | All vendors | Feature matrix (10 dimensions × 6 vendors) + "how to choose" guide with vendor-coloured badges |
