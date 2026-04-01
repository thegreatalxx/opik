/**
 * Evaluation Suite Quickstart — Iterating on a Q&A Bot (TypeScript)
 * ==================================================================
 *
 * This script mirrors the walkthrough in the Evaluation Suites documentation.
 * It creates a suite, adds test cases, then runs two prompt versions
 * to compare their pass rates.
 *
 * Prerequisites:
 *     npm install opik openai
 *
 *     Set your OPENAI_API_KEY environment variable.
 *
 * Run:
 *     npx tsx evaluation_suite_quickstart.ts
 */
import { Opik, EvaluationSuite } from "opik";
import OpenAI from "openai";

const client = new Opik({ projectName: "qa-bot-eval" });
const openai = new OpenAI();

// Step 1 — Create a suite
const suite = await EvaluationSuite.getOrCreate(client, {
  name: "acme-cloud-qa",
  assertions: [
    "The response is grounded in the provided documentation context",
    "The response directly addresses the user's question",
    "The response is concise (3 sentences or fewer)",
  ],
  executionPolicy: { runsPerItem: 2, passThreshold: 2 },
});

// Step 2 — Add test cases
await suite.addItems([
  {
    data: {
      question: "How do I create a new project?",
      context:
        "To create a new project, go to the Dashboard and click 'New Project'.",
    },
  },
  {
    data: {
      question: "What are the pricing tiers?",
      context:
        "Free ($0/month, 1GB), Pro ($29/month, 100GB), Enterprise (custom).",
    },
  },
  {
    data: {
      question: "Can I use this with Kubernetes?",
      context: "We support Docker containers and serverless functions.",
    },
    assertions: [
      "The response does NOT claim Kubernetes is supported",
      "The response acknowledges that the information is not available",
    ],
    executionPolicy: { runsPerItem: 3, passThreshold: 2 },
  },
]);

// Step 3 — Define the task
function makeTask(systemPrompt: string) {
  return async (item: Record<string, unknown>) => {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Question: ${item.question}\n\nContext:\n${item.context}`,
        },
      ],
    });
    return {
      input: item,
      output: response.choices[0].message.content,
    };
  };
}

// Step 4 — Run v1, then v2
const PROMPT_V1 = "You are a helpful assistant. Be as detailed as possible.";
const PROMPT_V2 =
  "You are a concise assistant. Answer based ONLY on the provided context.";

const resultV1 = await suite.run(makeTask(PROMPT_V1));
const resultV2 = await suite.run(makeTask(PROMPT_V2));

console.log(`\nv1 pass rate: ${((resultV1.passRate ?? 0) * 100).toFixed(0)}%`);
console.log(`v2 pass rate: ${((resultV2.passRate ?? 0) * 100).toFixed(0)}%`);

await client.flush();
