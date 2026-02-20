// Model definitions and pricing constants for Hanzo pricing service.

// 20% markup on all third-party model pricing.
export const MARKUP = 1.20;

// Zen models are priced at 3x the underlying base model (after markup).
export const ZEN_MULTIPLIER = 3.0;

// Hanzo proprietary models. Pricing is derived from a base third-party model.
export const hanzoModels = [
  {
    name: "Zen",
    fullName: "Zen - Flagship 1T+ Parameter MoDE LLM",
    description:
      "Our flagship model with 1T+ parameters using Mixture of Diverse Experts (MoDE) architecture.",
    features: [
      "200k context window",
      "MoDE architecture",
      "50% discount with batch processing*",
    ],
    // Zen pricing = 3x what we charge for GLM-5 (which already has 20% markup)
    baseOpenrouterId: "z-ai/glm-5",
    multiplier: ZEN_MULTIPLIER,
  },
];

// Third-party models served through Hanzo with markup.
export const thirdPartyModels = [
  {
    name: "Claude Opus 4.6",
    openrouterId: "anthropic/claude-opus-4.6",
    features: ["1000k context window", "Most capable model"],
  },
  {
    name: "Claude Sonnet 4.6",
    openrouterId: "anthropic/claude-sonnet-4.6",
    features: [
      "1000k context window",
      "Best balance of speed and intelligence",
    ],
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
  {
    name: "Basic",
    vcpus: 2,
    memory: "4 GB",
    storage: "80 GB",
    price: 21.6,
  },
  {
    name: "Standard",
    vcpus: 4,
    memory: "8 GB",
    storage: "160 GB",
    price: 57.6,
  },
  {
    name: "Professional",
    vcpus: 8,
    memory: "16 GB",
    storage: "320 GB",
    price: 115.2,
  },
  {
    name: "Enterprise",
    vcpus: 16,
    memory: "32 GB",
    storage: "640 GB",
    price: 230.4,
  },
];

export const gpuTiers = [
  { name: "GPU Standard", gpu: "1x H100", vram: "80 GB", price: 3.48 },
  { name: "GPU Pro", gpu: "2x H100", vram: "160 GB", price: 6.96 },
  { name: "GPU Ultra", gpu: "4x H100", vram: "320 GB", price: 13.92 },
];
