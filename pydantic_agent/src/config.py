import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY: str = os.environ["OPENAI_API_KEY"]
OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o")
BFF_INTERNAL_SECRET: str = os.environ["BFF_INTERNAL_SECRET"]
BFF_INTERNAL_TOOL_URL: str = os.getenv("BFF_INTERNAL_TOOL_URL", "http://127.0.0.1:3001/internal/agent-tool")
AGENT_HTTP_HOST: str = os.getenv("AGENT_HTTP_HOST", "127.0.0.1")
AGENT_HTTP_PORT: int = int(os.getenv("AGENT_HTTP_PORT", "8893"))
