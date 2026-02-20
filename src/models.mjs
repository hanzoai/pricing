// Model definitions and pricing constants for Hanzo pricing service.

// 20% markup on all third-party model pricing.
export const MARKUP = 1.20;

// Zen models are priced at 3x the upstream Fireworks cost.
export const ZEN_MULTIPLIER = 3.0;

// Hanzo Zen models — all 14 variants.
// Fireworks costs are from zen/gateway/config.yaml (source of truth).
// Zen price = Fireworks cost * ZEN_MULTIPLIER.
export const hanzoModels = [
  // ── Zen4 Generation (9 models) ──────────────────────────────────────
  {
    name: "zen4",
    fullName: "Zen4 — Flagship",
    description: "Flagship model built on GLM-5. Optimal for complex reasoning and multi-domain tasks.",
    features: ["202k context window", "Flagship intelligence"],
    tier: "pro",
    fireworksCost: { input: 1.00, output: 3.20 },
  },
  {
    name: "zen4-pro",
    fullName: "Zen4 Pro — High Capability",
    description: "High-capability model with efficient MoE architecture for demanding workloads.",
    features: ["131k context window", "MoE architecture"],
    tier: "pro",
    fireworksCost: { input: 0.90, output: 0.90 },
  },
  {
    name: "zen4-max",
    fullName: "Zen4 Max — Extended Context",
    description: "Extended context MoE model for large document processing and analysis.",
    features: ["131k context window", "235B MoE parameters"],
    tier: "pro",
    fireworksCost: { input: 1.20, output: 1.20 },
  },
  {
    name: "zen4-mini",
    fullName: "Zen4 Mini — Fast & Efficient",
    description: "Lightweight model optimized for speed and cost efficiency.",
    features: ["40k context window", "Ultra-fast inference"],
    tier: "free",
    fireworksCost: { input: 0.20, output: 0.20 },
  },
  {
    name: "zen4-ultra",
    fullName: "Zen4 Ultra — Maximum Reasoning",
    description: "Maximum reasoning capability with extended thinking for complex problems.",
    features: ["202k context window", "Deep reasoning"],
    tier: "pro",
    fireworksCost: { input: 1.00, output: 3.20 },
  },
  {
    name: "zen4-thinking",
    fullName: "Zen4 Thinking — Deep Reasoning",
    description: "Dedicated reasoning model with explicit chain-of-thought capabilities.",
    features: ["131k context window", "Chain-of-thought"],
    tier: "standard",
    fireworksCost: { input: 0.90, output: 0.90 },
  },
  {
    name: "zen4-coder",
    fullName: "Zen4 Coder — Code Generation",
    description: "Code-specialized model for generation, review, and debugging.",
    features: ["262k context window", "480B MoE parameters"],
    tier: "pro",
    fireworksCost: { input: 1.20, output: 1.20 },
  },
  {
    name: "zen4-coder-flash",
    fullName: "Zen4 Coder Flash — Fast Code",
    description: "Lightweight code model optimized for speed and inline completions.",
    features: ["262k context window", "Fast inference"],
    tier: "standard",
    fireworksCost: { input: 0.50, output: 0.50 },
  },
  {
    name: "zen4-coder-pro",
    fullName: "Zen4 Coder Pro — Premium Code",
    description: "Full-precision code model for maximum accuracy on complex codebases.",
    features: ["262k context window", "BF16 full precision"],
    tier: "pro",
    fireworksCost: { input: 1.50, output: 1.50 },
  },

  // ── Zen3 Generation (5 models) ──────────────────────────────────────
  {
    name: "zen3-omni",
    fullName: "Zen3 Omni — Hypermodal",
    description: "Multimodal model supporting text, vision, and structured output.",
    features: ["202k context window", "Multimodal"],
    tier: "standard",
    fireworksCost: { input: 0.60, output: 2.20 },
  },
  {
    name: "zen3-vl",
    fullName: "Zen3 VL — Vision-Language",
    description: "Vision-language model for image understanding and visual reasoning.",
    features: ["131k context window", "Vision + language"],
    tier: "standard",
    fireworksCost: { input: 0.15, output: 0.60 },
  },
  {
    name: "zen3-nano",
    fullName: "Zen3 Nano — Edge",
    description: "Ultra-lightweight model for edge deployment and low-latency tasks.",
    features: ["40k context window", "4B parameters"],
    tier: "free",
    fireworksCost: { input: 0.10, output: 0.10 },
  },
  {
    name: "zen3-guard",
    fullName: "Zen3 Guard — Content Safety",
    description: "Content safety classifier for moderation and guardrails.",
    features: ["40k context window", "Safety classifier"],
    tier: "free",
    fireworksCost: { input: 0.10, output: 0.10 },
  },
  {
    name: "zen3-embedding",
    fullName: "Zen3 Embedding — Text Embeddings",
    description: "High-quality text embeddings for search, clustering, and retrieval.",
    features: ["8k context window", "3072 dimensions"],
    tier: "standard",
    // OpenAI text-embedding-3-large cost
    fireworksCost: { input: 0.13, output: 0.13 },
  },
];

// Third-party models served through Hanzo with 20% markup.
export const thirdPartyModels = [
  {
    name: "Claude Opus 4.6",
    openrouterId: "anthropic/claude-opus-4.6",
    features: ["1000k context window", "Most capable model"],
  },
  {
    name: "Claude Sonnet 4.6",
    openrouterId: "anthropic/claude-sonnet-4.6",
    features: ["1000k context window", "Best balance of speed and intelligence"],
  },
  {
    name: "Claude Haiku 4.5",
    openrouterId: "anthropic/claude-haiku-4.5",
    features: ["200k context window", "Fastest and most affordable"],
  },
  {
    name: "GPT-5",
    openrouterId: "openai/gpt-5",
    features: ["400k context window", "OpenAI flagship"],
  },
  {
    name: "GPT-5 Mini",
    openrouterId: "openai/gpt-5-mini",
    features: ["400k context window", "Fast and affordable"],
  },
  {
    name: "Qwen3-235B",
    openrouterId: "qwen/qwen3-235b-a22b",
    features: ["131k context window", "Open-weight MoE"],
  },
  {
    name: "DeepSeek R1",
    openrouterId: "deepseek/deepseek-r1",
    features: ["64k context window", "Reasoning model"],
  },
  {
    name: "DeepSeek V3",
    openrouterId: "deepseek/deepseek-chat",
    features: ["164k context window", "Fast and efficient"],
  },
  {
    name: "Kimi K2.5",
    openrouterId: "moonshotai/kimi-k2.5",
    features: ["262k context window", "Multimodal reasoning"],
  },
  {
    name: "GLM-5",
    openrouterId: "z-ai/glm-5",
    features: ["205k context window", "Multilingual"],
  },
];

// Static tool pricing.
export const toolPricing = [
  { name: "Web Search", unit: "per query", price: 0.005 },
  { name: "Code Interpreter", unit: "per session minute", price: 0.03 },
  { name: "File Storage", unit: "per GB/month", price: 0.20 },
  { name: "Image Generation", unit: "per image", price: 0.04 },
  { name: "Speech-to-Text", unit: "per minute", price: 0.006 },
  { name: "Text-to-Speech", unit: "per 1M characters", price: 15.0 },
];

// Static infrastructure pricing (PaaS compute and GPU tiers).
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
