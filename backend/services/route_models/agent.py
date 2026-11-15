
import os
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from fastapi import HTTPException
from pydantic import BaseModel, Field, field_validator

from backend.services.analyst_agent.analyst_agent import ask_business_analyst


class AgentQuestion(BaseModel):
    question: str = Field(min_length=1, max_length=600)
    timezone: str | None = None
    top_n: int = Field(10, ge=1, le=50)

    @field_validator("question")
    @classmethod
    def question_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("question must not be blank")
        return v.strip()

    @field_validator("timezone")
    @classmethod
    def known_timezone(cls, v: str | None) -> str | None:
        if v is None:
            return None
        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError(f"unknown timezone {v!r}") from None
        return v


def ask(req: AgentQuestion) -> dict:
    """Run the pipeline and translate its failures into HTTP statuses.

    A bad question, an unresolvable period and a plan the classifier mangles all
    arrive as ValueError, so they report as 422 rather than a server fault.
    """
    try:
        return ask_business_analyst(
            question=req.question,
            brand_id=os.getenv("BRAND_ID") or "local",
            timezone=req.timezone,
            top_n=req.top_n,
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    except Exception as exc:  # provider unreachable, auth rejected, model down
        raise HTTPException(503, f"AI unavailable: {exc}")
