import json
from google import genai
from google.genai import types

CRITERIA = {
    "conceptual_accuracy": (
        "Node labels and descriptions correctly represent the paper's concepts "
        "without distortion or hallucination"
    ),
    "coverage": (
        "The map captures the paper's key ideas without major omissions"
    ),
    "hierarchical_organization": (
        "Parent-child relationships reflect genuine conceptual dependencies, "
        "not document reading order"
    ),
    "study_usefulness": (
        "The map would help a student understand and review the paper"
    ),
}

SYSTEM_PROMPT = (
    "You are an expert evaluator of academic mind maps. "
    "Score the following mind map on ONE criterion only. "
    'Respond with JSON only: {"score": <1-5>, "rationale": "<1-2 sentences>"}'
)


def _build_user_prompt(
    criterion: str,
    definition: str,
    source_excerpt: str,
    mindmap_md: str,
) -> str:
    return (
        f"CRITERION: {criterion.replace('_', ' ').title()}\n"
        f"DEFINITION: {definition}\n\n"
        f"SOURCE PAPER (excerpt):\n{source_excerpt}\n\n"
        f"MIND MAP:\n{mindmap_md}"
    )


def score_judge(source_text: str, mindmap_md: str, api_key: str) -> dict:
    """Call the LLM judge once per criterion. Returns {criterion: {score, rationale}}."""
    client = genai.Client(api_key=api_key)

    source_excerpt = source_text[:3000]
    results = {}

    for criterion, definition in CRITERIA.items():
        prompt = _build_user_prompt(criterion, definition, source_excerpt, mindmap_md)
        response = client.models.generate_content(
            model="gemini-1.5-pro",
            contents=prompt,
            config=types.GenerateContentConfig(system_instruction=SYSTEM_PROMPT),
        )
        results[criterion] = json.loads(response.text)

    return results
