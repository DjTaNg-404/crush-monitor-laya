"""Loopback-only HTTP service. Chat text is never persisted or sent to a cloud model."""
import argparse
import os
import platform
import threading
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator

from runtime import CapacityError, Runtime
from context import predict_context


class Question(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["choice", "score", "noul"]
    instructions: str = Field(min_length=1, max_length=4000)
    criteria: dict[str, str | None] | list[str] | None = None

    @model_validator(mode="after")
    def valid_criteria(self):
        if self.type == "choice" and (not isinstance(self.criteria, dict) or not 2 <= len(self.criteria) <= 64):
            raise ValueError("choice needs 2–64 named options")
        if self.type == "score" and (not isinstance(self.criteria, list) or not 2 <= len(self.criteria) <= 10):
            raise ValueError("score needs 2–10 levels")
        if self.type == "noul" and self.criteria is not None and (not isinstance(self.criteria, dict) or set(self.criteria) != {"false", "true"}):
            raise ValueError("noul criteria must contain false and true")
        if self.criteria and any(len(v or "") > 2000 for v in (self.criteria.values() if isinstance(self.criteria, dict) else self.criteria)):
            raise ValueError("criterion too long")
        return self


class Prediction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    state: str = Field(min_length=1, max_length=40000)
    questions: dict[str, Question] = Field(min_length=1, max_length=32)


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^\d+$", max_length=6)
    sender: Literal["self", "other"]
    text: str = Field(min_length=1, max_length=40000)


class Evidence(BaseModel):
    model_config = ConfigDict(extra="forbid")
    instructions: str = Field(min_length=1, max_length=4000)
    after: int = Field(ge=-1, le=500)


class ContextPrediction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    messages: list[ChatMessage] = Field(min_length=1, max_length=500)
    requiredIds: list[str] = Field(min_length=1, max_length=50)
    questions: dict[str, Question] = Field(min_length=1, max_length=24)
    evidence: dict[str, Evidence] = Field(default_factory=dict, max_length=2)


def create_app(runtime):
    app = FastAPI(title="Crush Monitor local Laya", docs_url=None, redoc_url=None, openapi_url=None)
    lock = threading.Lock()

    @app.middleware("http")
    async def local_only(request: Request, call_next):
        if request.headers.get("origin"):
            return JSONResponse({"error": "请通过本机验证页面访问"}, status_code=403)
        if len(await request.body()) > 512 * 1024:
            return JSONResponse({"error": "请求过大"}, status_code=413)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/health")
    def health():
        return {"ready": True, "engine": runtime.identity}

    def execute(body, predict):
        if not lock.acquire(blocking=False):
            raise HTTPException(429, "本地模型正在处理另一个请求，请稍后重试", headers={"Retry-After": "1"})
        try:
            questions = {k: v.model_dump(exclude_none=True) for k, v in body.questions.items()}
            return runtime.predict(body.state, questions) if predict else runtime.inspect(body.state, questions)
        except CapacityError as e:
            return JSONResponse({"error": str(e), "audit": e.audit}, status_code=422)
        except (ValueError, KeyError, TypeError) as e:
            raise HTTPException(422, str(e)) from e
        finally:
            lock.release()

    @app.post("/v1/systemone")
    def predict(body: Prediction):
        return execute(body, True)

    @app.post("/v1/inspect")
    def inspect(body: Prediction):
        return execute(body, False)

    @app.post("/v1/context")
    def context(body: ContextPrediction):
        if not lock.acquire(blocking=False):
            raise HTTPException(429, "Local model is busy", headers={"Retry-After": "1"})
        try:
            return predict_context(runtime, body.model_dump(exclude_none=True))
        except CapacityError as e:
            return JSONResponse({"error": str(e), "audit": e.audit}, status_code=422)
        except (ValueError, KeyError, TypeError) as e:
            raise HTTPException(422, str(e)) from e
        finally:
            lock.release()

    return app


if __name__ == "__main__":
    import uvicorn
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", default=os.getenv("LAYA_MODEL_PATH") or str(Path(__file__).resolve().parent.parent / ".runtime/models/laya/multilingual"))
    parser.add_argument("--port", type=int, default=int(os.getenv("LAYA_PORT", "3179")))
    parser.add_argument("--backend", choices=["mlx", "torch"], default=os.getenv("LAYA_BACKEND") if os.getenv("LAYA_BACKEND") in ("mlx", "torch") else ("mlx" if platform.system() == "Darwin" and platform.machine() == "arm64" else "torch"))
    parser.add_argument("--dtype", choices=["float16", "float32"], default="float16")
    args = parser.parse_args()
    model = Runtime(args.model_dir, backend=args.backend, dtype=args.dtype)
    print(f"Laya ready: {model.identity}", flush=True)
    uvicorn.run(create_app(model), host="127.0.0.1", port=args.port, access_log=False)
