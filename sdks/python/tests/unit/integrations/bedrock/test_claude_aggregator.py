import json


from opik.integrations.bedrock.invoke_model.chunks_aggregator.claude import (
    ClaudeAggregator,
)


def _make_chunk(data: dict) -> dict:
    return {"chunk": {"bytes": json.dumps(data).encode()}}


def test_claude_aggregator__cache_tokens_in_message_start__included_in_usage():
    aggregator = ClaudeAggregator()

    chunks = [
        _make_chunk(
            {
                "type": "message_start",
                "message": {
                    "role": "assistant",
                    "usage": {
                        "input_tokens": 100,
                        "output_tokens": 0,
                        "cache_creation_input_tokens": 50,
                        "cache_read_input_tokens": 200,
                    },
                },
            }
        ),
        _make_chunk(
            {
                "type": "content_block_delta",
                "delta": {"type": "text_delta", "text": "Hello"},
            }
        ),
        _make_chunk({"type": "content_block_stop"}),
        _make_chunk(
            {
                "type": "message_delta",
                "delta": {"stop_reason": "end_turn"},
                "usage": {"output_tokens": 5},
            }
        ),
        _make_chunk({"type": "message_stop", "amazon-bedrock-invocationMetrics": {}}),
    ]

    result = aggregator.aggregate(chunks)

    assert result["usage"]["cacheWriteInputTokens"] == 50
    assert result["usage"]["cacheReadInputTokens"] == 200
    assert result["usage"]["inputTokens"] == 100
    assert result["usage"]["outputTokens"] == 5


def test_claude_aggregator__no_cache_tokens__defaults_to_zero():
    aggregator = ClaudeAggregator()

    chunks = [
        _make_chunk(
            {
                "type": "message_start",
                "message": {
                    "role": "assistant",
                    "usage": {
                        "input_tokens": 10,
                        "output_tokens": 0,
                    },
                },
            }
        ),
        _make_chunk({"type": "content_block_stop"}),
        _make_chunk(
            {
                "type": "message_delta",
                "delta": {"stop_reason": "end_turn"},
                "usage": {"output_tokens": 3},
            }
        ),
        _make_chunk({"type": "message_stop", "amazon-bedrock-invocationMetrics": {}}),
    ]

    result = aggregator.aggregate(chunks)

    assert result["usage"]["cacheWriteInputTokens"] == 0
    assert result["usage"]["cacheReadInputTokens"] == 0
