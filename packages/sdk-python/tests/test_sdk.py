"""Unit tests for the Tokonomics Python SDK."""

import pytest
import asyncio
from unittest.mock import MagicMock, patch
from tokonomics import Tokonomics, _extract_usage


# --------------------------------------------------------------------------- #
# _extract_usage
# --------------------------------------------------------------------------- #

def test_extract_openai_style():
    usage = MagicMock()
    usage.prompt_tokens = 100
    usage.completion_tokens = 50
    result = MagicMock()
    result.usage = usage
    result.model = "gpt-4o-mini"

    it, ot, model, provider = _extract_usage(result)
    assert it == 100
    assert ot == 50
    assert model == "gpt-4o-mini"
    assert provider == "OPENAI"


def test_extract_anthropic_style():
    usage = MagicMock()
    usage.prompt_tokens = None
    usage.completion_tokens = None
    usage.input_tokens = 200
    usage.output_tokens = 80
    result = MagicMock()
    result.usage = usage
    result.model = "claude-haiku-4-5-20251001"

    it, ot, model, provider = _extract_usage(result)
    assert it == 200
    assert ot == 80
    assert provider == "ANTHROPIC"


def test_extract_google_style():
    um = MagicMock()
    um.prompt_token_count = 150
    um.candidates_token_count = 60
    result = MagicMock(spec=[])  # no .usage attribute
    result.usage_metadata = um
    result.model = "gemini-1.5-flash"

    it, ot, model, provider = _extract_usage(result)
    assert it == 150
    assert ot == 60
    assert provider == "GOOGLE"


def test_extract_dict_openai():
    result = {
        "model": "gpt-4o",
        "usage": {"prompt_tokens": 300, "completion_tokens": 120},
    }
    it, ot, model, provider = _extract_usage(result)
    assert it == 300
    assert ot == 120
    assert provider == "OPENAI"
    assert model == "gpt-4o"


def test_extract_none():
    it, ot, model, provider = _extract_usage(None)
    assert it is None
    assert ot is None


# --------------------------------------------------------------------------- #
# Tokonomics.track — sync
# --------------------------------------------------------------------------- #

def test_track_returns_result():
    tok = Tokonomics(api_key="tok_live_test", base_url="http://localhost:9999")

    mock_result = MagicMock()
    mock_result.usage.prompt_tokens = 10
    mock_result.usage.completion_tokens = 5
    mock_result.usage.input_tokens = None
    mock_result.model = "gpt-4o-mini"

    def fake_llm_call(**kwargs):
        return mock_result

    returned = tok.track({"customer_id": "user_1"}, fake_llm_call, model="gpt-4o-mini")
    assert returned is mock_result


def test_track_does_not_raise_on_send_failure():
    """The LLM call must succeed even when the ingest endpoint is unreachable."""
    tok = Tokonomics(api_key="tok_live_test", base_url="http://127.0.0.1:1")

    mock_result = MagicMock()
    mock_result.usage.prompt_tokens = 10
    mock_result.usage.completion_tokens = 5
    mock_result.usage.input_tokens = None
    mock_result.model = "gpt-4o-mini"

    result = tok.track({"customer_id": "user_1"}, lambda: mock_result)
    assert result is mock_result  # LLM result still returned


# --------------------------------------------------------------------------- #
# Tokonomics.track_async
# --------------------------------------------------------------------------- #

@pytest.mark.asyncio
async def test_track_async_returns_result():
    tok = Tokonomics(api_key="tok_live_test", base_url="http://localhost:9999")

    mock_result = MagicMock()
    mock_result.usage.input_tokens = 50
    mock_result.usage.output_tokens = 20
    mock_result.usage.prompt_tokens = None
    mock_result.model = "claude-haiku-4-5-20251001"

    async def fake_async_llm(**kwargs):
        return mock_result

    returned = await tok.track_async({"customer_id": "user_2"}, fake_async_llm)
    assert returned is mock_result
