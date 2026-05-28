import * as dotenv from 'dotenv';
dotenv.config();

export interface Config {
  openaiApiKey: string;
  model: string;
  bffInternalSecret: string;
  bffToolUrl: string;
  host: string;
  port: number;
}

export function getConfig(): Config {
  return {
    openaiApiKey: process.env.OPENAI_API_KEY ?? '',
    model: process.env.OPENAI_MODEL ?? 'gpt-4o',
    bffInternalSecret: process.env.BFF_INTERNAL_SECRET ?? 'dev-shared-secret-change-me',
    bffToolUrl: process.env.BFF_INTERNAL_TOOL_URL ?? 'http://127.0.0.1:3001/internal/agent-tool',
    host: process.env.AGENT_HTTP_HOST ?? '127.0.0.1',
    port: parseInt(process.env.AGENT_HTTP_PORT ?? '8892', 10),
  };
}
