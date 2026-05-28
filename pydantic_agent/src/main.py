from __future__ import annotations
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .run_handler import handle_run
from . import config as cfg

app = FastAPI(title="Pydantic AI Agent Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)
app.post("/run")(handle_run)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "pydantic_ai", "port": cfg.AGENT_HTTP_PORT}


if __name__ == "__main__":
    uvicorn.run("src.main:app", host=cfg.AGENT_HTTP_HOST, port=cfg.AGENT_HTTP_PORT, reload=False)
