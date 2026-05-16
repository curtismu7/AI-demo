// banking_agent_service/src/reasonContract.ts
// BFF ↔ :3006 reasoning protocol (no user token crosses this boundary).

export interface ReasonToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ReasonMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
}

export interface ReasonRequest {
  messages: ReasonMessage[];
  tools: ReasonToolSchema[];
  provider: 'helix' | 'ollama'; // already resolved by the BFF
  model?: string;
  // Helix connection config (BFF-owned; passed through, never a token)
  helixConfig?: Record<string, string | undefined>;
  ollamaBaseUrl?: string;
}

export type ReasonResponse =
  | { type: 'tool_calls'; calls: Array<{ id: string; name: string; args: Record<string, unknown> }>; messages: ReasonMessage[] }
  | { type: 'final'; answer: string; messages: ReasonMessage[] };
