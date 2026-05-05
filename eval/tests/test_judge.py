import json
import pytest
from unittest.mock import patch, MagicMock
from judge import score_judge, CRITERIA, _build_user_prompt


def test_criteria_has_four_keys():
    assert len(CRITERIA) == 4
    expected = {
        "conceptual_accuracy",
        "coverage",
        "hierarchical_organization",
        "study_usefulness",
    }
    assert set(CRITERIA.keys()) == expected


def test_build_user_prompt_includes_criterion():
    prompt = _build_user_prompt(
        criterion="coverage",
        definition="The map captures the paper's key ideas without major omissions",
        source_excerpt="transformer architecture paper",
        mindmap_md="# Transformers\n## Attention",
    )
    assert "coverage" in prompt.lower()
    assert "transformer architecture paper" in prompt
    assert "# Transformers" in prompt


def test_build_user_prompt_truncates_source_to_3000():
    long_source = "x" * 5000
    prompt = _build_user_prompt(
        criterion="coverage",
        definition="some definition",
        source_excerpt=long_source[:3000],
        mindmap_md="# Root",
    )
    assert "x" * 3001 not in prompt
    assert "x" * 3000 in prompt


def test_score_judge_returns_all_criteria():
    mock_response = MagicMock()
    mock_response.text = json.dumps({"score": 4, "rationale": "Good coverage."})

    mock_models = MagicMock()
    mock_models.generate_content.return_value = mock_response

    mock_client = MagicMock()
    mock_client.models = mock_models

    with patch("judge.genai.Client", return_value=mock_client):
        result = score_judge("source text", "# Mind Map\n## Node", "fake-key")

    assert set(result.keys()) == set(CRITERIA.keys())
    for v in result.values():
        assert "score" in v
        assert "rationale" in v


def test_score_judge_calls_api_once_per_criterion():
    mock_response = MagicMock()
    mock_response.text = json.dumps({"score": 3, "rationale": "Decent."})

    mock_models = MagicMock()
    mock_models.generate_content.return_value = mock_response

    mock_client = MagicMock()
    mock_client.models = mock_models

    with patch("judge.genai.Client", return_value=mock_client):
        score_judge("source", "# Map", "key")

    assert mock_models.generate_content.call_count == len(CRITERIA)


def test_score_judge_passes_api_key():
    mock_response = MagicMock()
    mock_response.text = json.dumps({"score": 5, "rationale": "Excellent."})

    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = mock_response

    with patch("judge.genai.Client", return_value=mock_client) as mock_client_cls:
        score_judge("source", "# Map", "my-secret-key")

    mock_client_cls.assert_called_once_with(api_key="my-secret-key")
