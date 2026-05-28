from __future__ import annotations
import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


@dataclass
class Config:
    openai_api_key: str
    model: str
    bff_internal_secret: str
    bff_tool_url: str
    host: str
    port: int


def get_config() -> Config:
    return Config(
        openai_api_key=os.environ.get("OPENAI_API_KEY", ""),
        model=os.environ.get("OPENAI_MODEL", "gpt-4o"),
        bff_internal_secret=os.environ.get("BFF_INTERNAL_SECRET", "dev-shared-secret-change-me"),
        bff_tool_url=os.environ.get("BFF_INTERNAL_TOOL_URL", "http://127.0.0.1:3001/internal/agent-tool"),
        host=os.environ.get("AGENT_HTTP_HOST", "127.0.0.1"),
        port=int(os.environ.get("AGENT_HTTP_PORT", "8891")),
    )
