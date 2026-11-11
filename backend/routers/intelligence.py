from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from backend import db
from backend.services import ai, analyst

router = APIRouter(prefix="/api/intelligence", tags=["intelligence"])


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    history: list[ChatTurn] = []
    days: int = Field(default=30, ge=1, le=3650)

    @field_validator("message")
    @classmethod
    def message_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("message must not be blank")
        return v.strip()


class ChatResponse(BaseModel):
    answer: str
    model: str
    generated_at: str


@router.get("/suggestions")
def suggestions() -> dict:
    return {"suggestions": analyst.SUGGESTIONS, "model": ai.MODEL}


@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest) -> dict:
    currency = db.one("SELECT currency FROM settings WHERE id = 1")["currency"]
    history = [t.model_dump() for t in req.history[-10:]]
    try:
        return analyst.answer(req.message, history, currency, req.days)
    except ai.AiUnavailable as exc:
        raise HTTPException(503, f"AI unavailable ({ai.MODEL}): {exc}")