"""
Tokonomics Python SDK — track LLM usage per customer without capturing prompt content.
"""

from __future__ import annotations

import asyncio
import time
import threading
import queue
from typing import Any, Callable, Coroutine, Optional, TypeVar

import requests

__version__ = "0.1.0"
__all__ = ["Tokonomics"]

T = TypeVar("T")

_DEFAULT_BASE_URL = "https://ingest.tokonomics.dev"
_MAX_RETRIES = 5
_QUEUE_MAX = 1000


def _extract_usage(result: Any) -> tuple[Optional[int], Optional[int], Optional[str], Optional[str]]:
    """Return (input_tokens, output_tokens, model, provider) from an LLM response.
    Never reads prompt content — only token counts and model name.
    """
    if result is None:
        return None, None, None, None

    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    model: Optional[str] = None
    provider: Optional[str] = None

    # OpenAI / openai-python: response.usage.prompt_tokens + completion_tokens
    usage = getattr(result, "usage", None)
    if usage is not None:
        pt = getattr(usage, "prompt_tokens", None)
        ct = getattr(usage, "completion_tokens", None)
        it = getattr(usage, "input_tokens", None)   # Anthropic
        ot = getattr(usage, "output_tokens", None)  # Anthropic

        if pt is not None:
            input_tokens, output_tokens, provider = int(pt), int(ct or 0), "OPENAI"
        elif it is not None:
            input_tokens, output_tokens, provider = int(it), int(ot or 0), "ANTHROPIC"

    # Google GenerativeAI: response.usage_metadata
    um = getattr(result, "usage_metadata", None)
    if um is not None and input_tokens is None:
        pt2 = getattr(um, "prompt_token_count", None)
        ct2 = getattr(um, "candidates_token_count", None)
        if pt2 is not None:
            input_tokens, output_tokens, provider = int(pt2), int(ct2 or 0), "GOOGLE"

    # Dict-style (LangChain, raw API responses)
    if isinstance(result, dict) and input_tokens is None:
        u: dict = result.get("usage") or result.get("usage_metadata") or {}
        if isinstance(u, dict):
            if "prompt_tokens" in u:
                input_tokens = int(u["prompt_tokens"])
                output_tokens = int(u.get("completion_tokens", 0))
                provider = "OPENAI"
            elif "input_tokens" in u:
                input_tokens = int(u["input_tokens"])
                output_tokens = int(u.get("output_tokens", 0))
                provider = "ANTHROPIC"
            elif "prompt_token_count" in u:
                input_tokens = int(u["prompt_token_count"])
                output_tokens = int(u.get("candidates_token_count", 0))
                provider = "GOOGLE"

    # Model name (never contains prompt content)
    model = getattr(result, "model", None)
    if model is None and isinstance(result, dict):
        model = result.get("model")

    return input_tokens, output_tokens, model, provider


def _send_with_retry(url: str, api_key: str, payload: dict, attempt: int = 0) -> None:
    try:
        resp = requests.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            timeout=5,
        )
        resp.raise_for_status()
    except Exception:
        if attempt < _MAX_RETRIES:
            time.sleep(min(2 ** attempt, 30))
            _send_with_retry(url, api_key, payload, attempt + 1)
        # Silently drop after max retries — never raise, never block


class Tokonomics:
    """
    Non-blocking Tokonomics client.

    Usage (sync)::

        tok = Tokonomics(api_key="tok_live_...")
        result = tok.track(
            {"customer_id": "user_123", "feature": "summarize"},
            client.chat.completions.create,
            model="gpt-4o-mini",
            messages=[...],
        )

    Usage (async)::

        result = await tok.track_async(
            {"customer_id": "user_123"},
            client.messages.create,
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=[...],
        )
    """

    def __init__(self, api_key: str, base_url: str = _DEFAULT_BASE_URL) -> None:
        self._api_key = api_key
        self._ingest_url = base_url.rstrip("/") + "/ingest/v1/events"
        self._queue: queue.Queue[dict] = queue.Queue(maxsize=_QUEUE_MAX)
        self._thread = threading.Thread(target=self._worker, daemon=True, name="tok-sender")
        self._thread.start()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def track(self, context: dict, fn: Callable[..., T], *args: Any, **kwargs: Any) -> T:
        """Wrap a synchronous LLM call and fire-and-forget usage tracking."""
        start = time.monotonic()
        result: T = fn(*args, **kwargs)
        latency_ms = int((time.monotonic() - start) * 1000)
        self._enqueue(context, result, latency_ms)
        return result

    async def track_async(
        self,
        context: dict,
        fn: Callable[..., Coroutine[Any, Any, T]],
        *args: Any,
        **kwargs: Any,
    ) -> T:
        """Wrap an async LLM call and fire-and-forget usage tracking."""
        start = time.monotonic()
        result: T = await fn(*args, **kwargs)
        latency_ms = int((time.monotonic() - start) * 1000)
        self._enqueue(context, result, latency_ms)
        return result

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _enqueue(self, context: dict, result: Any, latency_ms: int) -> None:
        input_tokens, output_tokens, model, provider = _extract_usage(result)
        if input_tokens is None:
            return  # Could not extract token counts — skip silently

        payload: dict = {
            "customerId": str(context["customer_id"]),
            "model": model or context.get("model", "unknown"),
            "provider": provider or context.get("provider", "OPENAI"),
            "inputTokens": input_tokens,
            "outputTokens": output_tokens or 0,
            "latencyMs": latency_ms,
        }
        if context.get("feature"):
            payload["feature"] = str(context["feature"])
        if context.get("workflow"):
            payload["workflow"] = str(context["workflow"])

        try:
            self._queue.put_nowait(payload)
        except queue.Full:
            pass  # Drop silently — never block the caller

    def _worker(self) -> None:
        while True:
            try:
                payload = self._queue.get(timeout=1)
            except queue.Empty:
                continue
            # Send in background thread — retries with backoff
            _send_with_retry(self._ingest_url, self._api_key, payload)
