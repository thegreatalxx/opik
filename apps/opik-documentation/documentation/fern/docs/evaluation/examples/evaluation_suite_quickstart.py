"""
Evaluation Suite Quickstart — Iterating on a Q&A Bot
=====================================================

This script mirrors the walkthrough in the Evaluation Suites documentation.
It creates a suite, adds test cases, then runs two prompt versions
to compare their pass rates.

Prerequisites:
    pip install opik openai

    Set your OPENAI_API_KEY environment variable.
"""

import opik
from openai import OpenAI
from opik.integrations.openai import track_openai

openai_client = track_openai(OpenAI())

# ---------------------------------------------------------------------------
# Step 1 — Create a suite
# ---------------------------------------------------------------------------

opik_client = opik.Opik()

suite = opik_client.get_or_create_evaluation_suite(
    name="acme-cloud-qa",
    assertions=[
        "The response is grounded in the provided documentation context",
        "The response directly addresses the user's question",
        "The response is concise (3 sentences or fewer)",
    ],
    execution_policy={"runs_per_item": 2, "pass_threshold": 2},
)

# ---------------------------------------------------------------------------
# Step 2 — Add test cases
# ---------------------------------------------------------------------------

suite.add_items([
    {
        "data": {
            "question": "How do I create a new project?",
            "context": "To create a new project, go to the Dashboard and click 'New Project'.",
        },
    },
    {
        "data": {
            "question": "What are the pricing tiers?",
            "context": "Free ($0/month, 1GB), Pro ($29/month, 100GB), Enterprise (custom).",
        },
    },
    {
        "data": {
            "question": "Can I use this with Kubernetes?",
            "context": "We support Docker containers and serverless functions.",
        },
        "assertions": [
            "The response does NOT claim Kubernetes is supported",
            "The response acknowledges that the information is not available",
        ],
        "execution_policy": {"runs_per_item": 3, "pass_threshold": 2},
    },
])

# ---------------------------------------------------------------------------
# Step 3 — Define the task
# ---------------------------------------------------------------------------

def make_task(system_prompt):
    def task(item):
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Question: {item['question']}\n\nContext:\n{item['context']}"},
            ],
        )
        return {"input": item, "output": response.choices[0].message.content}
    return task

# ---------------------------------------------------------------------------
# Step 4 — Run v1, then v2
# ---------------------------------------------------------------------------

PROMPT_V1 = "You are a helpful assistant. Be as detailed as possible."
PROMPT_V2 = "You are a concise assistant. Answer based ONLY on the provided context."

result_v1 = suite.run(task=make_task(PROMPT_V1))
result_v2 = suite.run(task=make_task(PROMPT_V2))

print(f"\nv1 pass rate: {result_v1.pass_rate:.0%}")
print(f"v2 pass rate: {result_v2.pass_rate:.0%}")
