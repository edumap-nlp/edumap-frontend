import json
from openai import OpenAI

CRITERIA = {
    "conceptual_accuracy": (
        "Whether the mind map correctly reflects the key concepts and findings "
        "of the source paper without introducing errors or hallucinations"
    ),
    "coverage_of_key_ideas": (
        "How comprehensively the mind map captures the essential components "
        "of the original document, including main text, tables, figures, "
        "and methodology details, without major omissions"
    ),
    "hierarchical_organization": (
        "The clarity and logical structure of the hierarchy, and whether it "
        "organizes content by conceptual relationships rather than mirroring "
        "the paper's section headings"
    ),
    "usefulness_for_studying": (
        "How useful the mind map is for learning, reviewing, or quick "
        "comprehension of the source paper, without being overwhelming"
    ),
}

SYSTEM_PROMPT = (
    "You are an expert evaluator of academic mind maps. "
    "Score the following mind map on ONE criterion only. "
    "Use a 0-5 scale where 0 means completely fails the criterion "
    "and 5 means fully satisfies it. "
    'Respond with JSON only: {"score": <0-5>, "rationale": "<1-2 sentences>"}'
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
    client = OpenAI(api_key=api_key)

    source_excerpt = source_text[:3000]
    results = {}

    for criterion, definition in CRITERIA.items():
        prompt = _build_user_prompt(criterion, definition, source_excerpt, mindmap_md)
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
        )
        results[criterion] = json.loads(response.choices[0].message.content)

    return results