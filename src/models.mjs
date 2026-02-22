// Model catalog for Hanzo pricing service.
//
// Zen model PRICING is fetched live from zen-gateway at sync time.
// Third-party models are detected DYNAMICALLY from OpenRouter.
// Only Zen catalog metadata (name, description, features, specs) lives here.

// ── Hanzo Zen model catalog — metadata only, no prices ──────────────
export const zenCatalog = [
  // Zen4 Generation
  {
    name: "zen4",
    fullName: "Zen4 — Flagship",
    description: "Flagship model for complex reasoning and multi-domain tasks.",
    features: ["202k context window", "Flagship intelligence"],
    tier: "ultra max",
    specs: { params: "~400B", arch: "Dense Transformer" },
  },
  {
    name: "zen4-pro",
    fullName: "Zen4 Pro — High Capability",
    description: "High-capability model with efficient MoE architecture for demanding workloads.",
    features: ["131k context window", "MoE architecture"],
    tier: "ultra",
    specs: { params: "80B (3B active)", arch: "MoE" },
  },
  {
    name: "zen4-max",
    fullName: "Zen4 Max — Extended Context",
    description: "Extended context MoE model for large document processing and analysis.",
    features: ["131k context window", "235B MoE parameters"],
    tier: "ultra",
    specs: { params: "235B (22B active)", arch: "MoE" },
  },
  {
    name: "zen4-mini",
    fullName: "Zen4 Mini — Fast & Efficient",
    description: "Lightweight model optimized for speed and cost efficiency.",
    features: ["40k context window", "Ultra-fast inference"],
    tier: "pro",
    specs: { params: "8B", arch: "Dense Transformer" },
  },
  {
    name: "zen4-ultra",
    fullName: "Zen4 Ultra — Maximum Reasoning",
    description: "Maximum reasoning capability with extended thinking for complex problems.",
    features: ["202k context window", "Deep reasoning"],
    tier: "ultra max",
    specs: { params: "~400B", arch: "Dense Transformer + CoT" },
  },
  {
    name: "zen4-thinking",
    fullName: "Zen4 Thinking — Deep Reasoning",
    description: "Dedicated reasoning model with explicit chain-of-thought capabilities.",
    features: ["131k context window", "Chain-of-thought"],
    tier: "pro max",
    specs: { params: "80B (3B active)", arch: "MoE + CoT" },
  },
  {
    name: "zen4-coder",
    fullName: "Zen4 Coder — Code Generation",
    description: "Code-specialized model for generation, review, and debugging.",
    features: ["262k context window", "480B MoE parameters"],
    tier: "ultra",
    specs: { params: "480B (35B active)", arch: "MoE" },
  },
  {
    name: "zen4-coder-flash",
    fullName: "Zen4 Coder Flash — Fast Code",
    description: "Lightweight code model optimized for speed and inline completions.",
    features: ["262k context window", "Fast inference"],
    tier: "pro max",
    specs: { params: "30B (3B active)", arch: "MoE" },
  },
  {
    name: "zen4-coder-pro",
    fullName: "Zen4 Coder Pro — Premium Code",
    description: "Full-precision code model for maximum accuracy on complex codebases.",
    features: ["262k context window", "BF16 full precision"],
    tier: "ultra max",
    specs: { params: "480B", arch: "Dense BF16" },
  },
  // Zen3 Generation
  {
    name: "zen3-omni",
    fullName: "Zen3 Omni — Hypermodal",
    description: "Multimodal model supporting text, vision, and structured output.",
    features: ["202k context window", "Multimodal"],
    tier: "pro max",
    specs: { params: "~200B", arch: "Dense Multimodal" },
  },
  {
    name: "zen3-vl",
    fullName: "Zen3 VL — Vision-Language",
    description: "Vision-language model for image understanding and visual reasoning.",
    features: ["131k context window", "Vision + language"],
    tier: "pro max",
    specs: { params: "30B (3B active)", arch: "MoE Vision-Language" },
  },
  {
    name: "zen3-nano",
    fullName: "Zen3 Nano — Edge",
    description: "Ultra-lightweight model for edge deployment and low-latency tasks.",
    features: ["40k context window", "4B parameters"],
    tier: "pro",
    specs: { params: "4B", arch: "Dense Transformer" },
  },
  {
    name: "zen3-guard",
    fullName: "Zen3 Guard — Content Safety",
    description: "Content safety classifier for moderation and guardrails.",
    features: ["40k context window", "Safety classifier"],
    tier: "pro",
    specs: { params: "4B", arch: "Dense Transformer" },
  },
  {
    name: "zen3-embedding",
    fullName: "Zen3 Embedding — Text Embeddings",
    description: "High-quality text embeddings for search, clustering, and retrieval.",
    features: ["8k context window", "3072 dimensions"],
    tier: "pro max",
    specs: { params: "N/A", arch: "Embedding" },
  },
];

// ── Featured third-party model IDs (pinned to top of third-party list) ──
// These are detected from OpenRouter — IDs must match OpenRouter model IDs.
export const featuredModelIds = [
  "anthropic/claude-opus-4.6",
  "anthropic/claude-sonnet-4.6",
  "anthropic/claude-haiku-4.5",
  "openai/gpt-5",
  "openai/gpt-5-mini",
  "google/gemini-2.5-pro",
  "deepseek/deepseek-r1",
  "deepseek/deepseek-chat",
  "meta-llama/llama-4-maverick",
  "mistralai/mistral-large-2512",
  "cohere/command-a",
  "x-ai/grok-3",
];

// ── Static tool pricing ─────────────────────────────────────────────
export const toolPricing = [
  { name: "Web Search", unit: "per query", price: 0.005 },
  { name: "Code Interpreter", unit: "per session minute", price: 0.03 },
  { name: "File Storage", unit: "per GB/month", price: 0.20 },
  { name: "Image Generation", unit: "per image", price: 0.04 },
  { name: "Speech-to-Text", unit: "per minute", price: 0.006 },
  { name: "Text-to-Speech", unit: "per 1M characters", price: 15.0 },
];

// ── Static infrastructure pricing ───────────────────────────────────
export const computeTiers = [
  { name: "Starter", vcpus: 1, memory: "2 GB", storage: "50 GB", price: 8.4 },
  { name: "Basic", vcpus: 2, memory: "4 GB", storage: "80 GB", price: 21.6 },
  { name: "Standard", vcpus: 4, memory: "8 GB", storage: "160 GB", price: 57.6 },
  { name: "Professional", vcpus: 8, memory: "16 GB", storage: "320 GB", price: 115.2 },
  { name: "Enterprise", vcpus: 16, memory: "32 GB", storage: "640 GB", price: 230.4 },
];

export const gpuTiers = [
  { name: "GPU Standard", gpu: "1x H100", vram: "80 GB", price: 3.48 },
  { name: "GPU Pro", gpu: "2x H100", vram: "160 GB", price: 6.96 },
  { name: "GPU Ultra", gpu: "4x H100", vram: "320 GB", price: 13.92 },
];
