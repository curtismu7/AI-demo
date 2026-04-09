import React from 'react';
import EducationDrawer from '../shared/EducationDrawer';

// ── Helpers ────────────────────────────────────────────────────────────────

const Code = ({ children }) => (
  <code style={{
    display: 'block', background: 'var(--code-bg, #f1f5f9)', borderRadius: 6,
    padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.78rem',
    whiteSpace: 'pre', overflowX: 'auto', margin: '0.5rem 0',
  }}>{children}</code>
);

function ModelCard({ name, maker, context, params, color, strengths, note, children }) {
  return (
    <div style={{
      borderLeft: `4px solid ${color}`, background: 'var(--edu-card-bg, #f8fafc)',
      borderRadius: '0 8px 8px 0', padding: '0.85rem 1rem', marginBottom: '0.85rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
        <strong style={{ fontSize: '0.92rem' }}>{name}</strong>
        {maker && <span style={{ fontSize: '0.73rem', background: color, color: '#fff', borderRadius: 4, padding: '1px 6px' }}>{maker}</span>}
        {params && <span style={{ fontSize: '0.73rem', background: '#e2e8f0', color: '#475569', borderRadius: 4, padding: '1px 6px' }}>{params}</span>}
        {context && <span style={{ fontSize: '0.73rem', background: '#dbeafe', color: 'var(--chase-navy)', borderRadius: 4, padding: '1px 6px' }}>{context}</span>}
      </div>
      {strengths && <p style={{ margin: '0.2rem 0 0.1rem', fontSize: '0.83rem', color: '#334155' }}>{strengths}</p>}
      {note && <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#64748b', fontStyle: 'italic' }}>{note}</p>}
      {children}
    </div>
  );
}

// ── Tab content components ─────────────────────────────────────────────────

function CommercialContent() {
  return (
    <div>
      <p style={{ color: '#475569', marginBottom: '1rem', fontSize: '0.9rem' }}>
        Commercial LLMs are closed-source models provided as a paid API. You don't see the weights — you call an
        endpoint and pay per token. They tend to lead on benchmark performance and safety investment, but require
        trusting the vendor with your data.
      </p>

      <ModelCard
        name="GPT-4o / GPT-4o mini"
        maker="OpenAI"
        context="128K tokens"
        color="#059669"
        strengths="Multimodal (text, image, audio natively), fast, strong coding, function calling, best Assistants API integration."
        note="GPT-4o mini: 2-3× cheaper with ~80% of quality — ideal for high-volume pipelines. Available via OpenAI API, Azure OpenAI Service, GitHub Models."
      />

      <ModelCard
        name="o1 / o3 / o4-mini"
        maker="OpenAI"
        context="128K–200K"
        color="#059669"
        strengths='Extended chain-of-thought reasoning ("thinking" models) — excel at math, science, coding, multi-step logic. o4-mini is the cost-efficient reasoning option.'
        note="Higher latency (thinking tokens) — match the model to the task. Best for complex analysis, agentic planning, multi-step reasoning."
      />

      <ModelCard
        name="Claude 3.5 Sonnet / Haiku / Opus 3"
        maker="Anthropic"
        context="200K tokens"
        color="#7c3aed"
        strengths="Exceptional instruction-following, excellent long-context quality (200K window), Constitutional AI safety, minimal hallucination on factual tasks."
        note="Sonnet 3.5: best price/performance, strong agentic tool use. Haiku 3.5: fastest/cheapest for classification/summarisation/RAG. Available via API, AWS Bedrock, Vertex AI."
      />

      <ModelCard
        name="Gemini 1.5 Pro / 2.0 Flash / 2.5 Pro"
        maker="Google DeepMind"
        context="1M+ tokens"
        color="var(--chase-navy)"
        strengths="Industry-leading context length, native multimodal (text/image/audio/video), Google Search grounding."
        note="2.5 Pro: state-of-the-art reasoning (2025), leading benchmarks for coding and math. Available via Google AI Studio, Vertex AI, Gemini API."
      />

      <ModelCard
        name="Phi-4"
        maker="Microsoft"
        params="14B params"
        context="16K tokens"
        color="#0ea5e9"
        strengths="Exceptional reasoning and coding relative to model size. Runs on-device or edge hardware. Open-weight (MIT license)."
        note="Best for cost-sensitive deployments, edge inference, or strong coding without GPT-4o costs."
      />

      <ModelCard
        name="Mistral Large 2 / Small 3"
        maker="Mistral AI"
        context="128K tokens"
        color="#dc2626"
        strengths="Competitive with GPT-4o on coding benchmarks. Strong multilingual (French HQ). European data residency option."
        note="Mistral Small 3 (24B): fastest Mistral model. Available via Mistral API, Azure AI Foundry, AWS Bedrock, Google Vertex AI."
      />

      <ModelCard
        name="Command R+"
        maker="Cohere"
        context="128K tokens"
        color="#0a7ea4"
        strengths="Enterprise-focused. Best-in-class for RAG (grounded generation, citation support, tool use). Strong multilingual."
        note="Connectors for Google Drive, Sharepoint, web search. Available via Cohere API, Azure AI Foundry, AWS Bedrock."
      />
    </div>
  );
}

function OpenSourceContent() {
  return (
    <div>
      <p style={{ color: '#475569', marginBottom: '1rem', fontSize: '0.9rem' }}>
        Open-source (or "open-weight") LLMs publish their model weights — you can download, fine-tune, and run them
        on your own hardware. Licenses vary: some are fully permissive (Apache 2.0), others have commercial
        restrictions (Llama 3 Community License). "Open-weight" ≠ "open training data."
      </p>

      <ModelCard
        name="Meta Llama 3.x"
        maker="Meta"
        params="8B / 70B / 405B"
        context="128K tokens"
        color="#f97316"
        strengths="Best open-weight general-purpose model family. 70B rivals GPT-4 class on many benchmarks. 405B is state-of-the-art open-weight. Llama 3.2: multimodal vision + 1B/3B edge models."
        note="License: Llama 3 Community (free for commercial use under 700M MAU). Available via HuggingFace, Ollama, AWS Bedrock, Azure AI Foundry."
      />

      <ModelCard
        name="Mistral 7B / Mixtral 8×7B / 8×22B"
        maker="Mistral AI"
        context="32K–64K tokens"
        color="#dc2626"
        strengths="Sparse Mixture-of-Experts — GPT-3.5 quality at lower inference cost. Strong multilingual. Fast inference relative to quality."
        note="Apache 2.0 for base models. Mixtral 8×22B: 141B total / 39B active, GPT-4 class quality."
      />

      <ModelCard
        name="Alibaba Qwen 2.5"
        maker="Alibaba Cloud"
        params="0.5B – 72B"
        context="128K tokens"
        color="#d97706"
        strengths="Extremely strong multilingual (Chinese + English). Qwen2.5-Coder 72B: state-of-the-art open-source code model. Qwen2.5-Math for specialised math reasoning."
        note="Apache 2.0. 72B-Instruct achieves near-Claude-3.5-Sonnet quality on many benchmarks."
      />

      <ModelCard
        name="DeepSeek V3 / R1"
        maker="DeepSeek"
        params="671B MoE / 37B active"
        context="128K tokens"
        color="#4f46e5"
        strengths="Frontier-class quality at open-source pricing. DeepSeek R1 matches OpenAI o1 on math/coding benchmarks. MIT license enables distillation into smaller models."
        note="Data residency note: DeepSeek is a Chinese company — evaluate per your enterprise policy. R1 distillations (1.5B–70B) bring reasoning to consumer hardware."
      />

      <ModelCard
        name="Google Gemma 2"
        maker="Google DeepMind"
        params="2B / 9B / 27B"
        context="8K tokens"
        color="#0d9488"
        strengths="27B achieves Llama 3 70B-class quality. Lightweight 2B/9B for edge. ShieldGemma for safety classification; CodeGemma for code."
        note="Gemma Terms of Use (permissive commercial). Available via HuggingFace, Google AI Studio, Vertex AI, Ollama."
      />

      <ModelCard
        name="TII Falcon 2"
        maker="Technology Innovation Institute"
        params="11B"
        context="8K tokens"
        color="#64748b"
        strengths="Apache 2.0 license. Falcon 2 11B includes vision (VLM) capabilities."
        note="Somewhat superseded by Llama 3 and Qwen 2.5 in 2024 benchmarks; still used in enterprise for Apache 2.0 compliance."
      />

      <div style={{
        background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
        padding: '0.85rem 1rem', marginTop: '1rem', fontSize: '0.84rem', color: '#166534',
      }}>
        <strong>Local inference:</strong> <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" style={{ color: '#166534' }}>Ollama</a> lets you run Llama, Mistral, Qwen, Gemma, and DeepSeek locally with one command (<code>ollama run llama3</code>). <strong>LM Studio</strong> provides a desktop GUI. Quantised models (GGUF via llama.cpp) reduce memory significantly — a 7B Q4 model runs on 8 GB RAM.
      </div>
    </div>
  );
}

function HowLlmsWorkContent() {
  return (
    <div>
      <p style={{ color: '#475569', marginBottom: '1rem', fontSize: '0.9rem' }}>
        LLMs are neural networks trained to predict the next token in a sequence. Understanding how they work helps
        you use them better — and explain them to colleagues, customers, and auditors.
      </p>

      <h4 style={{ margin: '1.2rem 0 0.4rem', color: '#1e293b' }}>Transformers — the architecture</h4>
      <p style={{ fontSize: '0.85rem', color: '#334155', margin: '0 0 0.5rem' }}>
        All modern LLMs are based on the <strong>Transformer architecture</strong> (Vaswani et al., 2017 — "Attention Is All You Need").
        The key innovation is <strong>self-attention</strong>: each token can attend to every other token in the context window,
        capturing long-range dependencies that RNNs couldn't. Decoder-only transformers (GPT architecture) generate text
        autoregressively — each new token is predicted from all previous tokens.
      </p>
      <p style={{ fontSize: '0.83rem', color: '#64748b', fontStyle: 'italic', margin: '0 0 0.75rem' }}>
        Simple analogy: think of self-attention as "every word in the sentence votes on how much it should
        influence every other word's meaning."
      </p>

      <h4 style={{ margin: '1.2rem 0 0.4rem', color: '#1e293b' }}>Training pipeline</h4>
      <Code>{`1. Pre-training           2. Supervised Fine-tuning   3. RLHF / RLAIF
──────────────            ─────────────────────────   ────────────────
Raw web text              Curated Q&A pairs            Human raters score
(trillions of tokens)     Instruction following        model outputs
      │                         │                             │
Predict next token         Learn to follow prompts     Train reward model
Cross-entropy loss         (SFT on demonstrations)     PPO / DPO to score
      │                         │                             │
General knowledge          More helpful                Less harmful,
learned from data          responses                   more aligned`}</Code>
      <ul style={{ fontSize: '0.84rem', color: '#334155', paddingLeft: '1.2rem', marginTop: '0.5rem' }}>
        <li><strong>Pre-training:</strong> The model sees enormous amounts of text and learns to predict the next word — this is where factual knowledge and language patterns are absorbed (weeks/months, millions of $ compute).</li>
        <li><strong>SFT (Supervised Fine-Tuning):</strong> The pre-trained model is fine-tuned on curated prompt/response pairs to follow instructions.</li>
        <li><strong>RLHF:</strong> Human raters compare pairs of responses. A reward model is trained on their preferences; the LLM is then updated via PPO or DPO to maximise the reward signal.</li>
        <li><strong>Constitutional AI (Anthropic):</strong> A set of principles ("the constitution") guides AI-generated feedback — more scalable than human rating for every preference.</li>
      </ul>

      <h4 style={{ margin: '1.2rem 0 0.4rem', color: '#1e293b' }}>Key concepts</h4>
      <ul style={{ fontSize: '0.84rem', color: '#334155', paddingLeft: '1.2rem' }}>
        <li><strong>Context window:</strong> The maximum tokens the model can "see" at once. GPT-4o: 128K. Gemini 1.5 Pro: 1M. Everything outside the window is forgotten.</li>
        <li><strong>Temperature:</strong> Controls randomness. 0 = deterministic. 1 = more creative. Above 1 = often incoherent.</li>
        <li><strong>Top-p (nucleus sampling):</strong> Picks from the smallest set of tokens whose cumulative probability ≥ p. top_p=0.9 means "pick from the 90% probability mass."</li>
        <li><strong>Tokens vs words:</strong> ~1 token ≈ ¾ of a word in English. "ChatGPT is great!" ≈ 6 tokens. Pricing is per input + output token.</li>
        <li><strong>Hallucination:</strong> The model generates confident-sounding text that is factually wrong. Root cause: predicting plausible sequences, not retrieving ground truth. Mitigations: RAG, temperature 0, instruction to say "I don't know."</li>
        <li><strong>System prompt:</strong> The instruction defining the model's persona, constraints, and context — processed before the user's message.</li>
      </ul>

      <h4 style={{ margin: '1.2rem 0 0.4rem', color: '#1e293b' }}>Inference concepts</h4>
      <ul style={{ fontSize: '0.84rem', color: '#334155', paddingLeft: '1.2rem' }}>
        <li><strong>KV cache:</strong> Cached key-value attention pairs avoid recomputing attention for already-processed tokens — critical for fast generation.</li>
        <li><strong>Quantisation:</strong> Reducing weights from 32-bit to 8-bit or 4-bit floats. Cuts memory 4-8×; small quality loss. GGUF (llama.cpp) is the dominant format for quantised local inference.</li>
        <li><strong>Speculative decoding:</strong> A small "draft" model generates candidate tokens; the large model verifies them in parallel — 2-3× throughput gain.</li>
        <li><strong>Batch size:</strong> Process multiple requests simultaneously on the same GPU. High batch size = better hardware utilisation, larger latency per individual request.</li>
      </ul>
    </div>
  );
}

function ComparisonContent() {
  const thStyle = { padding: '0.5rem 0.65rem', background: '#1e293b', color: '#f1f5f9', fontSize: '0.78rem', textAlign: 'left', whiteSpace: 'nowrap' };
  const tdStyle = { padding: '0.45rem 0.65rem', fontSize: '0.78rem', color: '#334155', borderBottom: '1px solid #e2e8f0', verticalAlign: 'top' };
  const trAlt = { background: '#f8fafc' };

  return (
    <div>
      <h4 style={{ margin: '0 0 0.6rem', color: '#1e293b' }}>Commercial Models</h4>
      <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
        <table className="edu-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
          <thead>
            <tr>
              {['Model', 'Maker', 'Context', 'Multimodal', 'Best at', 'Access'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ['GPT-4o', 'OpenAI', '128K', 'Text/Image/Audio', 'General purpose, function calling', 'API, Azure'],
              ['o1 / o3', 'OpenAI', '128K–200K', 'Text/Image', 'Reasoning, math, coding', 'API, Azure'],
              ['Claude 3.5 Sonnet', 'Anthropic', '200K', 'Text/Image', 'Instructions, agentic, long doc', 'API, Bedrock, Vertex'],
              ['Claude 3.5 Haiku', 'Anthropic', '200K', 'Text/Image', 'Fast, cheap, classification', 'API, Bedrock, Vertex'],
              ['Gemini 1.5 Pro', 'Google', '1M', 'Text/Image/Video/Audio', 'Ultra-long context', 'AI Studio, Vertex'],
              ['Gemini 2.5 Pro', 'Google', '1M+', 'Text/Image/Audio', 'Reasoning, coding', 'AI Studio, Vertex'],
              ['Phi-4', 'Microsoft', '16K', 'Text', 'Small model reasoning', 'Azure, HuggingFace'],
              ['Mistral Large 2', 'Mistral AI', '128K', 'Text', 'Multilingual, EU data', 'Mistral API, Azure, AWS'],
              ['Command R+', 'Cohere', '128K', 'Text', 'RAG, enterprise, citations', 'Cohere API, Azure, AWS'],
            ].map((row, i) => (
              <tr key={i} style={i % 2 === 1 ? trAlt : {}}>
                {row.map((cell, j) => <td key={j} style={tdStyle}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4 style={{ margin: '0 0 0.6rem', color: '#1e293b' }}>Open-Source Models</h4>
      <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
        <table className="edu-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
          <thead>
            <tr>
              {['Model', 'Maker', 'Params', 'Context', 'License', 'Strengths', 'Local'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ['Llama 3.1 70B', 'Meta', '70B', '128K', 'Llama 3 Community', 'Best open general purpose', '✅ (GPU)'],
              ['Llama 3.1 405B', 'Meta', '405B', '128K', 'Llama 3 Community', 'Frontier open-weight', '✅ (multi-GPU)'],
              ['Llama 3.2 11B', 'Meta', '11B', '128K', 'Llama 3 Community', 'Vision + text multimodal', '✅'],
              ['Mixtral 8×7B', 'Mistral AI', '47B/13B active', '32K', 'Apache 2.0', 'Fast MoE, multilingual', '✅ (GPU)'],
              ['Qwen 2.5 72B', 'Alibaba', '72B', '128K', 'Apache 2.0', 'Chinese/English, coding', '✅ (GPU)'],
              ['DeepSeek V3', 'DeepSeek', '671B/37B active', '128K', 'MIT', 'Frontier quality, cheap API', '✅ (multi-GPU)'],
              ['DeepSeek R1', 'DeepSeek', '671B/37B active', '128K', 'MIT', 'Reasoning rival to o1', '✅ (multi-GPU)'],
              ['DeepSeek R1 7B', 'DeepSeek (distil)', '7B', '128K', 'MIT', 'Reasoning on small model', '✅ (consumer GPU)'],
              ['Gemma 2 27B', 'Google', '27B', '8K', 'Gemma Terms', 'Quality per param', '✅'],
              ['Falcon 2 11B', 'TII', '11B', '8K', 'Apache 2.0', 'Vision, Apache 2.0', '✅'],
            ].map((row, i) => (
              <tr key={i} style={i % 2 === 1 ? trAlt : {}}>
                {row.map((cell, j) => <td key={j} style={tdStyle}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4 style={{ margin: '0 0 0.5rem', color: '#1e293b' }}>How to choose</h4>
      <ul style={{ fontSize: '0.84rem', color: '#334155', paddingLeft: '1.2rem' }}>
        <li><strong>Best overall quality (commercial):</strong> GPT-4o / Claude 3.5 Sonnet — Claude wins on instruction-following and long docs; GPT-4o wins on multimodal and speed.</li>
        <li><strong>Reasoning tasks:</strong> o1/o3 (OpenAI) or DeepSeek R1 (MIT) — extended chain-of-thought; higher latency, worth it for complex analysis.</li>
        <li><strong>Largest context window:</strong> Gemini 1.5 Pro (1M tokens) — process entire codebases or multi-hour transcripts.</li>
        <li><strong>Best open-source general purpose:</strong> Llama 3.1 70B — community, quality, and 128K context.</li>
        <li><strong>Best open-source coding:</strong> Qwen2.5-Coder 72B or DeepSeek V3 — state-of-the-art open-source code models.</li>
        <li><strong>Cheapest capable model:</strong> GPT-4o mini, Claude 3.5 Haiku, or Mistral Small 3 — all strong for high-volume pipelines.</li>
        <li><strong>Local inference / privacy:</strong> Ollama + Llama 3.1 8B or Mistral 7B — runs on 8-16 GB RAM with quantisation.</li>
        <li><strong>European data residency:</strong> Mistral Large 2 (Le Chat / Azure EU regions) or open-source Mistral on EU infra.</li>
        <li><strong>This demo:</strong> The Super Banking LangChain agent is model-agnostic — configurable via <code>OPENAI_MODEL</code> env var in <code>langchain_agent/</code>.</li>
      </ul>

      <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '1rem', fontStyle: 'italic' }}>
        Benchmarks and pricing change frequently. Verify current performance at{' '}
        <a href="https://lmsys.org/chat" target="_blank" rel="noopener noreferrer" style={{ color: '#94a3b8' }}>lmsys.org/chat</a> (Chatbot Arena) and{' '}
        <a href="https://artificialanalysis.ai" target="_blank" rel="noopener noreferrer" style={{ color: '#94a3b8' }}>artificialanalysis.ai</a>.
      </p>
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────

export default function LlmLandscapePanel({ isOpen, onClose, initialTabId }) {
  const tabs = [
    { id: 'commercial',   label: 'Commercial',    content: <CommercialContent /> },
    { id: 'opensource',   label: 'Open-Source',   content: <OpenSourceContent /> },
    { id: 'howllmswork',  label: 'How LLMs Work', content: <HowLlmsWorkContent /> },
    { id: 'comparison',   label: 'Comparison',    content: <ComparisonContent /> },
  ];
  return (
    <EducationDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="LLM Landscape"
      tabs={tabs}
      initialTabId={initialTabId}
    />
  );
}
