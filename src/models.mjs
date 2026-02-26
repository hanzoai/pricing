// Model catalog for Hanzo pricing service.
//
// Zen model PRICING is fetched live from zen-gateway at sync time.
// Third-party models are detected DYNAMICALLY from OpenRouter.
// Only Zen catalog metadata (name, description, features, specs) lives here.
//
// BRAND POLICY: Never expose upstream model names. Zen models are our own.

// ── Hanzo Zen model catalog — metadata only, no prices ──────────────
export const zenCatalog = [
  // Zen4 Generation
  {
    name: "zen4",
    fullName: "Zen4 — Flagship",
    description: "Flagship MoE model for complex reasoning and multi-domain tasks.",
    features: ["202K context window", "Flagship intelligence", "100+ languages"],
    tier: "ultra max",
    context: 202000,
    specs: { params: "744B (40B active)", arch: "MoE" },
  },
  {
    name: "zen4-ultra",
    fullName: "Zen4 Ultra — Maximum Reasoning",
    description: "Maximum reasoning capability with extended chain-of-thought on MoE architecture.",
    features: ["262K context window", "Deep reasoning", "Chain-of-thought"],
    tier: "ultra max",
    context: 262000,
    specs: { params: "744B (40B active)", arch: "MoE + CoT" },
  },
  {
    name: "zen4-pro",
    fullName: "Zen4 Pro — High Capability",
    description: "Efficient MoE model for demanding workloads with strong reasoning at production-grade cost.",
    features: ["131K context window", "MoE architecture"],
    tier: "ultra",
    context: 131000,
    specs: { params: "80B (3B active)", arch: "MoE" },
  },
  {
    name: "zen4-max",
    fullName: "Zen4 Max — Maximum Intelligence",
    description: "Most capable model for complex reasoning, analysis, and agentic tasks. 1M token context window.",
    features: ["1M context window", "Maximum intelligence", "Agentic coding"],
    tier: "ultra max",
    context: 1000000,
    specs: { params: "N/A", arch: "Dense" },
  },
  {
    name: "zen4-mini",
    fullName: "Zen4 Mini — Fast & Efficient",
    description: "Ultra-fast lightweight model optimized for speed and cost efficiency. Ideal for free tier.",
    features: ["128K context window", "Ultra-fast inference", "Free tier"],
    tier: "starter",
    context: 128000,
    specs: { params: "N/A", arch: "Dense" },
  },
  {
    name: "zen4-thinking",
    fullName: "Zen4 Thinking — Deep Reasoning",
    description: "Dedicated reasoning model with explicit chain-of-thought capabilities.",
    features: ["131K context window", "Chain-of-thought"],
    tier: "pro max",
    context: 131000,
    specs: { params: "80B (3B active)", arch: "MoE + CoT" },
  },
  // Zen4 Code
  {
    name: "zen4-coder",
    fullName: "Zen4 Coder — Code Generation",
    description: "Code-specialized MoE model for generation, review, debugging, and agentic programming.",
    features: ["163K context window", "All major languages"],
    tier: "ultra",
    context: 163000,
    specs: { params: "480B (35B active)", arch: "MoE" },
  },
  {
    name: "zen4-coder-pro",
    fullName: "Zen4 Coder Pro — Premium Code",
    description: "Full-precision BF16 code model for maximum accuracy on complex codebases.",
    features: ["131K context window", "BF16 full precision"],
    tier: "ultra max",
    context: 131000,
    specs: { params: "480B", arch: "Dense BF16" },
  },
  {
    name: "zen4-coder-flash",
    fullName: "Zen4 Coder Flash — Fast Code",
    description: "Lightweight code model optimized for speed and inline completions.",
    features: ["262K context window", "Fast inference"],
    tier: "pro max",
    context: 262000,
    specs: { params: "30B (3B active)", arch: "MoE" },
  },
  // Zen3 Generation — Chat
  {
    name: "zen3-omni",
    fullName: "Zen3 Omni — Hypermodal",
    description: "Multimodal model supporting text, vision, audio, and structured output.",
    features: ["202K context window", "Text + Vision + Audio"],
    tier: "pro max",
    context: 202000,
    specs: { params: "~200B", arch: "Dense Multimodal" },
  },
  {
    name: "zen3-vl",
    fullName: "Zen3 VL — Vision-Language",
    description: "Vision-language model for image understanding and visual reasoning.",
    features: ["262K context window", "Vision + Language"],
    tier: "pro max",
    context: 262000,
    specs: { params: "30B (3B active)", arch: "MoE Vision-Language" },
  },
  {
    name: "zen3-nano",
    fullName: "Zen3 Nano — Edge",
    description: "Ultra-lightweight model for edge deployment and low-latency tasks. Available on free tier.",
    features: ["128K context window", "8B parameters", "Free tier"],
    tier: "starter",
    context: 128000,
    specs: { params: "8B", arch: "Dense" },
  },
  {
    name: "zen3-guard",
    fullName: "Zen3 Guard — Content Safety",
    description: "Content safety classifier for moderation and guardrails. 9 safety categories, 119 languages.",
    features: ["65K context window", "Safety classifier"],
    tier: "pro",
    context: 65000,
    specs: { params: "4B", arch: "Dense" },
  },
  // Zen3 Embedding — via /v1/embeddings
  {
    name: "zen3-embedding",
    fullName: "Zen3 Embedding",
    description: "High-quality text embeddings for RAG, search, and classification.",
    features: ["8K context window", "3072 dimensions"],
    tier: "pro max",
    context: 8000,
    specs: { params: "N/A", arch: "Embedding" },
    endpoint: "/v1/embeddings",
  },
  {
    name: "zen3-embedding-medium",
    fullName: "Zen3 Embedding Medium",
    description: "Balanced embedding model for cost-effective retrieval workloads.",
    features: ["40K context window", "4B parameters"],
    tier: "pro",
    context: 40000,
    specs: { params: "4B", arch: "Embedding" },
    endpoint: "/v1/embeddings",
  },
  {
    name: "zen3-embedding-small",
    fullName: "Zen3 Embedding Small",
    description: "Lightweight embedding model for high-throughput, low-cost applications.",
    features: ["32K context window", "0.6B parameters"],
    tier: "starter",
    context: 32000,
    specs: { params: "0.6B", arch: "Embedding" },
    endpoint: "/v1/embeddings",
  },
  {
    name: "zen3-embedding-openai",
    fullName: "Zen3 Embedding — OpenAI Compatible",
    description: "OpenAI-compatible embedding endpoint for drop-in migration.",
    features: ["8K context window", "3072 dimensions"],
    tier: "pro max",
    context: 8000,
    specs: { params: "N/A", arch: "Embedding" },
    endpoint: "/v1/embeddings",
  },
  // Zen3 Reranker — via /v1/rerank
  {
    name: "zen3-reranker",
    fullName: "Zen3 Reranker",
    description: "High-quality reranker for improving retrieval accuracy in RAG pipelines.",
    features: ["40K context window", "8B parameters"],
    tier: "pro max",
    context: 40000,
    specs: { params: "8B", arch: "Reranker" },
    endpoint: "/v1/rerank",
  },
  {
    name: "zen3-reranker-medium",
    fullName: "Zen3 Reranker Medium",
    description: "Balanced reranker for cost-effective retrieval quality improvement.",
    features: ["40K context window", "4B parameters"],
    tier: "pro",
    context: 40000,
    specs: { params: "4B", arch: "Reranker" },
    endpoint: "/v1/rerank",
  },
  {
    name: "zen3-reranker-small",
    fullName: "Zen3 Reranker Small",
    description: "Lightweight reranker for high-throughput reranking at minimal cost.",
    features: ["40K context window", "0.6B parameters"],
    tier: "starter",
    context: 40000,
    specs: { params: "0.6B", arch: "Reranker" },
    endpoint: "/v1/rerank",
  },
  // Zen3 Image — via /v1/images/generations
  {
    name: "zen3-image",
    fullName: "Zen3 Image",
    description: "Best general-purpose image generation.",
    features: ["Text-to-image", "Image editing"],
    tier: "pro max",
    specs: { params: "N/A", arch: "Diffusion" },
    endpoint: "/v1/images/generations",
    pricingUnit: "image",
    staticPricing: { perUnit: 0.04 },
  },
  {
    name: "zen3-image-max",
    fullName: "Zen3 Image Max",
    description: "Maximum quality image generation for professional creative work.",
    features: ["Text-to-image", "Maximum quality"],
    tier: "ultra max",
    specs: { params: "N/A", arch: "Diffusion" },
    endpoint: "/v1/images/generations",
    pricingUnit: "image",
    staticPricing: { perUnit: 0.08 },
  },
  {
    name: "zen3-image-dev",
    fullName: "Zen3 Image Dev",
    description: "Development model for experimentation and iteration.",
    features: ["Text-to-image", "Development"],
    tier: "pro",
    specs: { params: "N/A", arch: "Diffusion" },
    endpoint: "/v1/images/generations",
    pricingUnit: "step",
    staticPricing: { perUnit: 0.0005 },
  },
  {
    name: "zen3-image-fast",
    fullName: "Zen3 Image Fast",
    description: "Fastest image model for real-time generation.",
    features: ["Text-to-image", "Ultra-fast"],
    tier: "pro",
    specs: { params: "N/A", arch: "Diffusion" },
    endpoint: "/v1/images/generations",
    pricingUnit: "step",
    staticPricing: { perUnit: 0.00035 },
  },
  {
    name: "zen3-image-sdxl",
    fullName: "Zen3 Image SDXL",
    description: "High-resolution image generation at 1024px.",
    features: ["Text-to-image", "1024px"],
    tier: "pro",
    specs: { params: "N/A", arch: "Diffusion" },
    endpoint: "/v1/images/generations",
    pricingUnit: "step",
    staticPricing: { perUnit: 0.00013 },
  },
  {
    name: "zen3-image-playground",
    fullName: "Zen3 Image Playground",
    description: "Aesthetic model for artistic image generation.",
    features: ["Text-to-image", "Aesthetic"],
    tier: "pro",
    specs: { params: "N/A", arch: "Diffusion" },
    endpoint: "/v1/images/generations",
    pricingUnit: "step",
    staticPricing: { perUnit: 0.00013 },
  },
  {
    name: "zen3-image-ssd",
    fullName: "Zen3 Image SSD",
    description: "Fastest diffusion model for real-time generation.",
    features: ["Text-to-image", "Fastest"],
    tier: "starter",
    specs: { params: "1B", arch: "Diffusion" },
    endpoint: "/v1/images/generations",
    pricingUnit: "step",
    staticPricing: { perUnit: 0.00013 },
  },
  {
    name: "zen3-image-jp",
    fullName: "Zen3 Image JP",
    description: "Japanese-specialized image generation model.",
    features: ["Text-to-image", "Japanese"],
    tier: "pro",
    specs: { params: "N/A", arch: "Diffusion" },
    endpoint: "/v1/images/generations",
    pricingUnit: "step",
    staticPricing: { perUnit: 0.00013 },
  },
  // Zen3 Audio — via /v1/audio/transcriptions
  {
    name: "zen3-audio",
    fullName: "Zen3 Audio",
    description: "Best quality speech-to-text transcription.",
    features: ["Multi-language", "Best accuracy"],
    tier: "pro max",
    specs: { params: "N/A", arch: "ASR" },
    endpoint: "/v1/audio/transcriptions",
    pricingUnit: "minute",
    staticPricing: { perUnit: 0.0015 },
  },
  {
    name: "zen3-audio-fast",
    fullName: "Zen3 Audio Fast",
    description: "Fastest speech-to-text transcription.",
    features: ["Multi-language", "Fastest"],
    tier: "pro",
    specs: { params: "N/A", arch: "ASR" },
    endpoint: "/v1/audio/transcriptions",
    pricingUnit: "minute",
    staticPricing: { perUnit: 0.0009 },
  },
  {
    name: "zen3-asr",
    fullName: "Zen3 ASR",
    description: "Real-time streaming speech recognition for live transcription.",
    features: ["Streaming", "Real-time"],
    tier: "pro max",
    specs: { params: "N/A", arch: "Streaming ASR" },
    endpoint: "/v1/audio/transcriptions",
    pricingUnit: "minute",
    staticPricing: { perUnit: 0.0035 },
  },
  {
    name: "zen3-asr-v1",
    fullName: "Zen3 ASR v1",
    description: "First-generation streaming ASR for legacy compatibility.",
    features: ["Streaming", "Legacy"],
    tier: "pro",
    specs: { params: "N/A", arch: "Streaming ASR" },
    endpoint: "/v1/audio/transcriptions",
    pricingUnit: "minute",
    staticPricing: { perUnit: 0.0032 },
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

// ── Hanzo Cloud — VM Plans ────────────────────────────────────────
// The developer cloud that doesn't nickel-and-dime you.
// Consistent global pricing. No egress fees. No hidden costs.
// All plans include DDoS protection, automated backups, and IPv4/IPv6.
//
// Internal: Provider routing is transparent to customers.
// Margins: 50-80% on dedicated tiers via cost-optimized backend selection.

export const cloudPlans = [
  {
    id: "starter",
    name: "Starter",
    description: "Get started for free. Perfect for side projects, bots, and learning.",
    vcpus: 1, memoryGB: 1, diskGB: 20, cpuType: "shared",
    maxVMs: 1,
    priceMonthly: 5,
    freeTier: true,  // $5 credit for new accounts
    features: ["1 VM", "1 vCPU", "1 GB RAM", "20 GB SSD", "500 GB transfer", "Free $5 credit"],
  },
  {
    id: "builder",
    name: "Builder",
    description: "For developers shipping real products. Run bots, APIs, and automation.",
    vcpus: 2, memoryGB: 2, diskGB: 40, cpuType: "shared",
    maxVMs: 5,
    priceMonthly: 10,
    features: ["Up to 5 VMs", "2 vCPU", "2 GB RAM", "40 GB SSD", "1 TB transfer"],
  },
  {
    id: "dev",
    name: "Dev",
    description: "The sweet spot. Full dev environment with room to grow.",
    vcpus: 2, memoryGB: 8, diskGB: 25, cpuType: "shared",
    maxVMs: 25,
    priceMonthly: 15,
    popular: true,
    features: ["Up to 25 VMs", "2 vCPU", "8 GB RAM", "25 GB SSD", "3 TB transfer"],
  },
  {
    id: "pro",
    name: "Pro",
    description: "Dedicated CPU. Zero noisy neighbors. Consistent performance, always.",
    vcpus: 2, memoryGB: 8, diskGB: 80, cpuType: "dedicated",
    maxVMs: 25,
    priceMonthly: 25,
    features: ["Up to 25 VMs", "2 dedicated vCPU", "8 GB RAM", "80 GB SSD", "2 TB transfer"],
  },
  {
    id: "turbo",
    name: "Turbo",
    description: "4x the power. Browser automation, CI/CD, and heavy workloads.",
    vcpus: 4, memoryGB: 16, diskGB: 160, cpuType: "shared",
    maxVMs: 25,
    priceMonthly: 39,
    features: ["Up to 25 VMs", "4 vCPU", "16 GB RAM", "160 GB SSD", "4 TB transfer"],
  },
  {
    id: "turbo-dedicated",
    name: "Turbo Dedicated",
    description: "All the power of Turbo with dedicated CPU cores. Production-grade.",
    vcpus: 4, memoryGB: 16, diskGB: 160, cpuType: "dedicated",
    maxVMs: 25,
    priceMonthly: 49,
    features: ["Up to 25 VMs", "4 dedicated vCPU", "16 GB RAM", "160 GB SSD", "4 TB transfer"],
  },
  // ── High-performance tiers ─────────────────────────────────────
  {
    id: "business",
    name: "Business",
    description: "Team-scale compute. Run production services, staging environments, and fleets.",
    vcpus: 8, memoryGB: 32, diskGB: 240, cpuType: "dedicated",
    maxVMs: 50,
    priceMonthly: 219,
    features: ["Up to 50 VMs", "8 dedicated vCPU", "32 GB RAM", "240 GB SSD", "20 TB transfer"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Mission-critical infrastructure. Full isolation, maximum throughput.",
    vcpus: 16, memoryGB: 64, diskGB: 360, cpuType: "dedicated",
    maxVMs: 100,
    priceMonthly: 429,
    features: ["Up to 100 VMs", "16 dedicated vCPU", "64 GB RAM", "360 GB SSD", "40 TB transfer"],
  },
  {
    id: "scale",
    name: "Scale",
    description: "Platform-scale compute. Run hundreds of services across global regions.",
    vcpus: 32, memoryGB: 128, diskGB: 600, cpuType: "dedicated",
    maxVMs: 250,
    priceMonthly: 849,
    features: ["Up to 250 VMs", "32 dedicated vCPU", "128 GB RAM", "600 GB SSD", "50 TB transfer"],
  },
  {
    id: "mega",
    name: "Mega",
    description: "Maximum single-node power. ML inference, databases, and HPC workloads.",
    vcpus: 48, memoryGB: 192, diskGB: 960, cpuType: "dedicated",
    maxVMs: 500,
    priceMonthly: 1299,
    features: ["Up to 500 VMs", "48 dedicated vCPU", "192 GB RAM", "960 GB SSD", "60 TB transfer"],
  },
  {
    id: "ultra",
    name: "Ultra",
    description: "Extreme compute. Multi-node clusters for the most demanding workloads on Earth.",
    vcpus: 96, memoryGB: 384, diskGB: 1920, cpuType: "dedicated",
    maxVMs: 1000,
    priceMonthly: 3999,
    features: ["Up to 1000 VMs", "96 dedicated vCPU", "384 GB RAM", "1.9 TB SSD", "120 TB transfer"],
  },
];

// ── Hanzo Cloud — Block Storage ───────────────────────────────────
export const blockStoragePricing = {
  pricePerGBMonthly: 0.08,  // $/GB/month
  minSizeGB: 1,
  maxSizeGB: 16384,
  // Internal cost basis (not exposed to API)
  _internalCosts: {
    tier1: { costPerGBMonthly: 0.048 },  // primary backend
    tier2: { costPerGBMonthly: 0.10 },   // premium backend
  },
};

// ── INTERNAL: Provider cost basis (never exposed via API) ────────
// Used for margin calculation and backend routing decisions.
// Customer-facing price is ALWAYS from cloudPlans above.
// BRAND POLICY: Provider names must NEVER appear in API responses.

export const providerCosts = {
  hetzner: {
    regions: ["eu-central", "us-east", "us-west", "ap-southeast"],
    costs: {
      // EU (Falkenstein/Nuremberg) — best margins
      // Prices from SpareCores / Hetzner Cloud (EUR→USD at ~1.10)
      "eu-central": {
        "cx22":  { vcpus: 2,  memoryMB: 4096,   diskGB: 40,   priceMonthly: 3.60 },
        "cpx11": { vcpus: 2,  memoryMB: 2048,   diskGB: 40,   priceMonthly: 4.20 },
        "cpx21": { vcpus: 3,  memoryMB: 4096,   diskGB: 80,   priceMonthly: 7.10 },
        "cpx31": { vcpus: 4,  memoryMB: 8192,   diskGB: 160,  priceMonthly: 13.70 },
        "cpx41": { vcpus: 8,  memoryMB: 16384,  diskGB: 240,  priceMonthly: 24.60 },
        "ccx13": { vcpus: 2,  memoryMB: 8192,   diskGB: 80,   priceMonthly: 14.80 },
        "ccx23": { vcpus: 4,  memoryMB: 16384,  diskGB: 160,  priceMonthly: 27.90 },
        "ccx33": { vcpus: 8,  memoryMB: 32768,  diskGB: 240,  priceMonthly: 54.20 },
        "ccx43": { vcpus: 16, memoryMB: 65536,  diskGB: 360,  priceMonthly: 123.50 },  // €112.27
        "ccx53": { vcpus: 32, memoryMB: 131072, diskGB: 600,  priceMonthly: 247.00 },  // €224.62
        "ccx63": { vcpus: 48, memoryMB: 196608, diskGB: 960,  priceMonthly: 371.00 },  // €336.90
      },
      // US (Ashburn/Hillsboro)
      "us-east": {
        "cx22":  { vcpus: 2,  memoryMB: 4096,   diskGB: 40,   priceMonthly: 3.99 },
        "cpx11": { vcpus: 2,  memoryMB: 2048,   diskGB: 40,   priceMonthly: 4.49 },
        "cpx21": { vcpus: 3,  memoryMB: 4096,   diskGB: 80,   priceMonthly: 7.49 },
        "cpx31": { vcpus: 4,  memoryMB: 8192,   diskGB: 160,  priceMonthly: 14.49 },
        "cpx41": { vcpus: 8,  memoryMB: 16384,  diskGB: 240,  priceMonthly: 25.99 },
        "ccx13": { vcpus: 2,  memoryMB: 8192,   diskGB: 80,   priceMonthly: 15.49 },
        "ccx23": { vcpus: 4,  memoryMB: 16384,  diskGB: 160,  priceMonthly: 29.49 },
        "ccx33": { vcpus: 8,  memoryMB: 32768,  diskGB: 240,  priceMonthly: 56.99 },
        "ccx43": { vcpus: 16, memoryMB: 65536,  diskGB: 360,  priceMonthly: 128.70 },  // €117.02
        "ccx53": { vcpus: 32, memoryMB: 131072, diskGB: 600,  priceMonthly: 257.40 },  // €233.97
        "ccx63": { vcpus: 48, memoryMB: 196608, diskGB: 960,  priceMonthly: 386.10 },  // €350.98
      },
      "us-west": {
        "cx22":  { vcpus: 2,  memoryMB: 4096,   diskGB: 40,   priceMonthly: 3.99 },
        "cpx11": { vcpus: 2,  memoryMB: 2048,   diskGB: 40,   priceMonthly: 4.49 },
        "cpx21": { vcpus: 3,  memoryMB: 4096,   diskGB: 80,   priceMonthly: 7.49 },
        "cpx31": { vcpus: 4,  memoryMB: 8192,   diskGB: 160,  priceMonthly: 14.49 },
        "cpx41": { vcpus: 8,  memoryMB: 16384,  diskGB: 240,  priceMonthly: 25.99 },
        "ccx13": { vcpus: 2,  memoryMB: 8192,   diskGB: 80,   priceMonthly: 15.49 },
        "ccx23": { vcpus: 4,  memoryMB: 16384,  diskGB: 160,  priceMonthly: 29.49 },
        "ccx33": { vcpus: 8,  memoryMB: 32768,  diskGB: 240,  priceMonthly: 56.99 },
        "ccx43": { vcpus: 16, memoryMB: 65536,  diskGB: 360,  priceMonthly: 128.70 },  // €117.02
        "ccx53": { vcpus: 32, memoryMB: 131072, diskGB: 600,  priceMonthly: 257.40 },  // €233.97
        "ccx63": { vcpus: 48, memoryMB: 196608, diskGB: 960,  priceMonthly: 386.10 },  // €350.98
      },
      // Singapore — premium region
      "ap-southeast": {
        "cpx12": { vcpus: 2,  memoryMB: 2048,   diskGB: 40,   priceMonthly: 5.49 },
        "cpx22": { vcpus: 3,  memoryMB: 4096,   diskGB: 80,   priceMonthly: 8.99 },
        "cpx32": { vcpus: 4,  memoryMB: 8192,   diskGB: 160,  priceMonthly: 17.49 },
        "cpx42": { vcpus: 8,  memoryMB: 16384,  diskGB: 240,  priceMonthly: 30.99 },
        "ccx13": { vcpus: 2,  memoryMB: 8192,   diskGB: 80,   priceMonthly: 17.49 },
        "ccx23": { vcpus: 4,  memoryMB: 16384,  diskGB: 160,  priceMonthly: 33.49 },
        "ccx33": { vcpus: 8,  memoryMB: 32768,  diskGB: 240,  priceMonthly: 63.99 },
        "ccx43": { vcpus: 16, memoryMB: 65536,  diskGB: 360,  priceMonthly: 176.35 },  // €160.32
        "ccx53": { vcpus: 32, memoryMB: 131072, diskGB: 600,  priceMonthly: 378.00 },  // €343.78
        "ccx63": { vcpus: 48, memoryMB: 196608, diskGB: 960,  priceMonthly: 620.00 },  // €563.86
      },
    },
  },
  digitalocean: {
    regions: ["us-east", "us-west", "eu-central", "ap-southeast"],
    premium: true, // higher customer-facing price for DO regions
    costs: {
      // Basic (shared CPU)
      "s-1vcpu-1gb":     { vcpus: 1,  memoryMB: 1024,   diskGB: 25,  priceMonthly: 6 },
      "s-1vcpu-2gb":     { vcpus: 1,  memoryMB: 2048,   diskGB: 50,  priceMonthly: 12 },
      "s-2vcpu-2gb":     { vcpus: 2,  memoryMB: 2048,   diskGB: 60,  priceMonthly: 18 },
      "s-2vcpu-4gb":     { vcpus: 2,  memoryMB: 4096,   diskGB: 80,  priceMonthly: 24 },
      "s-4vcpu-8gb":     { vcpus: 4,  memoryMB: 8192,   diskGB: 160, priceMonthly: 48 },
      "s-8vcpu-16gb":    { vcpus: 8,  memoryMB: 16384,  diskGB: 320, priceMonthly: 96 },
      // General Purpose (dedicated CPU) — premium fallback for high-end plans
      "g-8vcpu-32gb":    { vcpus: 8,  memoryMB: 32768,  diskGB: 100, priceMonthly: 240 },
      "g-16vcpu-64gb":   { vcpus: 16, memoryMB: 65536,  diskGB: 200, priceMonthly: 480 },
      "g-32vcpu-128gb":  { vcpus: 32, memoryMB: 131072, diskGB: 400, priceMonthly: 960 },
      "g-40vcpu-160gb":  { vcpus: 40, memoryMB: 163840, diskGB: 500, priceMonthly: 1200 },
      // CPU-Optimized (dedicated CPU)
      "c-8":             { vcpus: 8,  memoryMB: 16384,  diskGB: 100, priceMonthly: 160 },
      "c-16":            { vcpus: 16, memoryMB: 32768,  diskGB: 200, priceMonthly: 320 },
      "c-32":            { vcpus: 32, memoryMB: 65536,  diskGB: 400, priceMonthly: 640 },
      "c-48":            { vcpus: 48, memoryMB: 98304,  diskGB: 600, priceMonthly: 960 },
    },
  },
  lightsail: {
    regions: ["us-east", "us-west", "eu-central", "ap-southeast"],
    premium: true,
    costs: {
      "nano_3_0":   { vcpus: 1, memoryMB: 512,   diskGB: 20,  priceMonthly: 3.50 },
      "micro_3_0":  { vcpus: 1, memoryMB: 1024,  diskGB: 40,  priceMonthly: 5 },
      "small_3_0":  { vcpus: 1, memoryMB: 2048,  diskGB: 60,  priceMonthly: 10 },
      "medium_3_0": { vcpus: 2, memoryMB: 4096,  diskGB: 80,  priceMonthly: 20 },
      "large_3_0":  { vcpus: 2, memoryMB: 8192,  diskGB: 160, priceMonthly: 40 },
      "xlarge_3_0": { vcpus: 4, memoryMB: 16384, diskGB: 320, priceMonthly: 80 },
    },
  },
};

// ── Plan-to-provider routing ──────────────────────────────────────
// Maps each cloud plan to the cheapest backend provider per region.
// Internal routing — maps plan IDs to backend provider instance types.
// Customers never see provider names. "default" = best margin, "premium" = fallback.
export const planRouting = {
  // Free tier: route to AWS/DO (credit-subsidized) — $3.50 cost on $5 plan
  starter:           { default: { provider: "lightsail", type: "nano_3_0" },  premium: { provider: "digitalocean", type: "s-1vcpu-1gb" } },
  builder:           { default: { provider: "hetzner", type: "cpx11" },       premium: { provider: "digitalocean", type: "s-2vcpu-2gb" } },
  dev:               { default: { provider: "hetzner", type: "cpx31" },       premium: { provider: "lightsail", type: "large_3_0" } },
  pro:               { default: { provider: "hetzner", type: "ccx13" },       premium: { provider: "lightsail", type: "large_3_0" } },
  turbo:             { default: { provider: "hetzner", type: "cpx41" },       premium: { provider: "digitalocean", type: "s-8vcpu-16gb" } },
  "turbo-dedicated": { default: { provider: "hetzner", type: "ccx23" },      premium: { provider: "digitalocean", type: "s-8vcpu-16gb" } },
  business:          { default: { provider: "hetzner", type: "ccx33" },       premium: { provider: "digitalocean", type: "g-8vcpu-32gb" } },
  enterprise:        { default: { provider: "hetzner", type: "ccx43" },       premium: { provider: "digitalocean", type: "g-16vcpu-64gb" } },
  scale:             { default: { provider: "hetzner", type: "ccx53" },       premium: { provider: "digitalocean", type: "g-32vcpu-128gb" } },
  mega:              { default: { provider: "hetzner", type: "ccx63" },       premium: { provider: "digitalocean", type: "g-40vcpu-160gb" } },
  ultra:             { default: { provider: "hetzner", type: "2x-ccx63" },    premium: { provider: "digitalocean", type: "2x-g-40vcpu-160gb" } },
};

// ── Cloud regions ─────────────────────────────────────────────────
export const cloudRegions = [
  { id: "us-east",       name: "US East",        location: "Ashburn, VA",    flag: "us" },
  { id: "us-west",       name: "US West",        location: "Hillsboro, OR",  flag: "us" },
  { id: "eu-central",    name: "Europe",          location: "Frankfurt, DE",  flag: "de" },
  { id: "ap-southeast",  name: "Asia Pacific",    location: "Singapore",      flag: "sg" },
];

// ── Compute presets mapped to real DO droplet slugs ─────────────────
// Base prices fetched from DO API at sync time; markup applied on top.
export const computePresets = [
  { id: "starter", name: "Starter", slug: "s-1vcpu-2gb", description: "Light tasks, chat bots, simple automations" },
  { id: "pro", name: "Pro", slug: "s-2vcpu-4gb", description: "Code generation, research, multi-tool agents" },
  { id: "power", name: "Power", slug: "s-4vcpu-8gb", description: "Heavy workloads, browser automation, large projects" },
  { id: "gpu", name: "GPU", slug: "g-2vcpu-8gb", description: "ML training, image generation, video processing" },
];

// Full DO droplet catalog (all sizes we support).
export const doDropletSlugs = [
  "s-1vcpu-1gb", "s-1vcpu-2gb", "s-2vcpu-2gb", "s-2vcpu-4gb",
  "s-4vcpu-8gb", "s-8vcpu-16gb", "s-16vcpu-32gb",
  "g-2vcpu-8gb", "g-4vcpu-16gb",
  "c-2vcpu-4gb", "c-4vcpu-8gb",
];

// Fallback prices if DO API is unreachable (actual DO prices as of 2026-02).
export const doFallbackPrices = {
  "s-1vcpu-1gb":   { vcpus: 1,  memoryMB: 1024,  diskGB: 25,  priceMonthly: 6,   priceHourly: 0.00893 },
  "s-1vcpu-2gb":   { vcpus: 1,  memoryMB: 2048,  diskGB: 50,  priceMonthly: 12,  priceHourly: 0.01786 },
  "s-2vcpu-2gb":   { vcpus: 2,  memoryMB: 2048,  diskGB: 60,  priceMonthly: 18,  priceHourly: 0.02679 },
  "s-2vcpu-4gb":   { vcpus: 2,  memoryMB: 4096,  diskGB: 80,  priceMonthly: 24,  priceHourly: 0.03571 },
  "s-4vcpu-8gb":   { vcpus: 4,  memoryMB: 8192,  diskGB: 160, priceMonthly: 48,  priceHourly: 0.07143 },
  "s-8vcpu-16gb":  { vcpus: 8,  memoryMB: 16384, diskGB: 320, priceMonthly: 96,  priceHourly: 0.14286 },
  "s-16vcpu-32gb": { vcpus: 16, memoryMB: 32768, diskGB: 640, priceMonthly: 192, priceHourly: 0.28571 },
  "g-2vcpu-8gb":   { vcpus: 2,  memoryMB: 8192,  diskGB: 25,  priceMonthly: 48,  priceHourly: 0.07143 },
  "g-4vcpu-16gb":  { vcpus: 4,  memoryMB: 16384, diskGB: 50,  priceMonthly: 96,  priceHourly: 0.14286 },
  "c-2vcpu-4gb":   { vcpus: 2,  memoryMB: 4096,  diskGB: 25,  priceMonthly: 40,  priceHourly: 0.05952 },
  "c-4vcpu-8gb":   { vcpus: 4,  memoryMB: 8192,  diskGB: 50,  priceMonthly: 80,  priceHourly: 0.11905 },
};

// GPU tiers (H100s not on DO standard API — kept static).
export const gpuTiers = [
  { name: "GPU Standard", gpu: "1x H100", vram: "80 GB", price: 3.48 },
  { name: "GPU Pro", gpu: "2x H100", vram: "160 GB", price: 6.96 },
  { name: "GPU Ultra", gpu: "4x H100", vram: "320 GB", price: 13.92 },
];
