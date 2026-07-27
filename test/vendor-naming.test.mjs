// The catalog names a model's VENDOR — the company that made it — and nothing else.
// "Meta", never "Meta Llama": the vendor, never the vendor plus a product line.
//
// Our two families (Zen, Enso) are OURS and are grouped as themselves, never folded
// into one "Hanzo" bucket with the open models we merely host.
//
// The fixtures below are REAL org slugs taken from a live catalog fetch, including
// every shape that was rendering wrong in production.

import { test } from "node:test";
import assert from "node:assert/strict";
import { vendorName, hanzoModelView } from "../src/sync.mjs";

test("the vendor is the company, not the product line", () => {
  // The named defect: "Meta Llama" is a vendor plus a product. The vendor is Meta.
  assert.equal(vendorName("meta-llama/llama-4-scout"), "Meta");
  assert.equal(vendorName("meta-llama/llama-guard-4-12b"), "Meta");
  // Same shape, other vendors whose org slug names a product.
  assert.equal(vendorName("ibm-granite/granite-4"), "IBM");
  assert.equal(vendorName("bytedance-seed/seed-oss"), "ByteDance");
});

test("a floating '~vendor' alias groups under its vendor", () => {
  // OpenRouter's always-current aliases. The tilde is routing syntax; without
  // stripping it these split off into a separate "~anthropic" vendor.
  assert.equal(vendorName("~anthropic/claude-opus-latest"), "Anthropic");
  assert.equal(vendorName("~openai/gpt-latest"), "OpenAI");
  assert.equal(vendorName("~google/gemini-pro-latest"), "Google");
  assert.equal(vendorName("~x-ai/grok-latest"), "xAI");
  assert.equal(vendorName("~moonshotai/kimi-latest"), "Moonshot");
});

test("a HuggingFace-hosted model is named for its maker, not its host", () => {
  assert.equal(vendorName("huggingface/CohereLabs/aya-vision-32b"), "Cohere");
  assert.equal(vendorName("huggingface/deepseek-ai/DeepSeek-V3"), "DeepSeek");
  assert.equal(vendorName("huggingface/meta-llama/Llama-3.3-70B"), "Meta");
  assert.equal(vendorName("huggingface/swiss-ai/Apertus-8B-Instruct"), "Swiss AI");
});

test("one vendor has one name, however its slug is cased or suffixed", () => {
  // Meta arrived as both "Meta" and "meta"; ByteDance as two org slugs; Zhipu under
  // two unrelated slugs. Each is ONE vendor and must collapse to one label.
  for (const id of ["meta-llama/x", "Meta-Llama/x", "META-LLAMA/x"]) {
    assert.equal(vendorName(id), "Meta", id);
  }
  assert.equal(vendorName("z-ai/glm-5"), "Zhipu");
  assert.equal(vendorName("zai-org/AutoGLM"), "Zhipu");
  assert.equal(vendorName("bytedance/x"), "ByteDance");
  assert.equal(vendorName("bytedance-seed/x"), "ByteDance");
});

test("a vendor nobody has hand-added still renders as a name, not a slug", () => {
  // This is the anti-rot property. The previous namer fell back to `|| slug`, so
  // every vendor absent from its map leaked a machine identifier to the public
  // catalog until someone edited code. A new vendor must need no edit at all.
  const unseen = {
    "brand-new-labs/some-model": "Brand New Labs",
    "acme_research/m": "Acme Research",
    "future-ai/m": "Future AI",
    "somevendor/m": "Somevendor",
  };
  for (const [id, want] of Object.entries(unseen)) {
    assert.equal(vendorName(id), want, id);
  }
});

test("no vendor name is ever a raw machine slug", () => {
  // Every org slug seen in a live catalog fetch. The invariant is structural: a
  // rendered vendor never contains slug punctuation and is never all-lowercase
  // unless the vendor styles itself that way (xAI is the one such brand).
  const live = [
    "ai21", "aion-labs", "allenai", "anthracite-org", "anthropic", "arcee-ai",
    "baidu", "bytedance", "bytedance-seed", "cognitivecomputations", "cohere",
    "deepcogito", "deepseek", "google", "gryphe", "ibm-granite", "inception",
    "inclusionai", "inflection", "kwaipilot", "liquid", "mancer", "meituan",
    "meta-llama", "microsoft", "minimax", "mistralai", "moonshotai", "morph",
    "nex-agi", "nousresearch", "nvidia", "openai", "openrouter", "perceptron",
    "perplexity", "qwen", "rekaai", "relace", "sakana", "sao10k", "stepfun",
    "tencent", "thedrummer", "thinkingmachines", "undi95", "upstage", "writer",
    "x-ai", "xiaomi", "z-ai", "zai-org",
  ];
  for (const slug of live) {
    const name = vendorName(slug + "/model");
    assert.ok(name, `${slug} produced no vendor`);
    assert.ok(!/[-_~/]/.test(name), `${slug} -> ${name} still looks like a slug`);
    assert.ok(
      name !== name.toLowerCase() || name === "xAI",
      `${slug} -> ${name} was never capitalized`
    );
  }
});

test("Zen and Enso are our own families, each grouped as itself", () => {
  const zen = hanzoModelView({ name: "zen5", family: "zen", owned_by: "zenlm" });
  assert.equal(zen.provider, "Zen");
  assert.equal(zen.category, "zen");

  const enso = hanzoModelView({ name: "enso-ultra", family: "enso", owned_by: "hanzo" });
  assert.equal(enso.provider, "Enso");
  assert.equal(enso.category, "enso");

  // Two families, never one bucket — that is the split the catalog must show.
  assert.notEqual(zen.provider, enso.provider);
});

test("hosting a model does not make it ours", () => {
  // These are open models we serve. Stamping them "Hanzo" claimed another
  // company's work as our own family.
  const sd = hanzoModelView({ name: "stable-diffusion-3.5-large", provider: "Stability AI" });
  assert.equal(sd.provider, "Stability AI");
  assert.equal(sd.family, undefined, "a hosted model must claim no family");
  assert.notEqual(sd.category, "zen");

  const img = hanzoModelView({ name: "openai-gpt-image-2", provider: "OpenAI" });
  assert.equal(img.provider, "OpenAI");
  assert.equal(img.family, undefined);
});
