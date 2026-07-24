// Model catalog for Hanzo pricing service.
//
// Zen model PRICING is fetched live from zen-gateway at sync time.
// Third-party models are detected DYNAMICALLY from OpenRouter.
// Only Zen catalog metadata (name, description, features, specs) lives here.
//
// Subscription and blockchain plans are imported from @hanzo/plans
// (the canonical single source of truth).
//
// BRAND POLICY: Never expose upstream model names. Zen models are our own.

// All plan + pricing data lives in @hanzo/plans on npm — single source
// of truth. No vendored copies, no git clones, no submodules. Bump
// the @hanzo/plans dep in package.json to roll forward the catalog;
// nothing else moves.
//
// IAM / Base / PaaS plans are NOT (yet) in @hanzo/plans — they
// remain commerce-local fragments hosted in this repo's plans-extra/
// dir until they migrate into the SOT.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

export {
  subscriptionPlans,
  blockchainPlans,
  pricingPolicy,
  cloudPlans as canonicalCloudPlans,
  gpuTiers as canonicalGpuTiers,
  regions as canonicalRegions,
  storage as canonicalStorage,
  tools as canonicalTools,
  dnsPlans,
} from '@hanzo/plans'

// Plan fragments not yet in @hanzo/plans — keep local until migrated.
export const iamPlans = require('../plans-extra/iam.json')
export const basePlans = require('../plans-extra/base.json')
export const paasPlans = require('../plans-extra/paas.json')

// ── Hanzo Zen model catalog — metadata only, no prices ──────────────
// NOTE: Zen4 generation (zen4, zen4-pro, zen4-max, zen4.1, zen4-mini,
// zen4-ultra, zen4-thinking, zen4-coder, zen4-coder-pro, zen4-coder-flash)
// was sunset on 2026-05-30 along with the zenlm/zen4* HF mirrors. Clients
// should migrate to the zen5 ladder for chat/coder/reasoning, and the
// zen3-* specialty SKUs (omni, vl, nano, guard) remain unchanged.
export const zenCatalog = [
  // ── Served SKUs (CLEAN names) ────────────────────────────────────────────
  // These names match EXACTLY what the zen relay serves today
  // (hanzoai/zen catalog.yaml → GET zen.zen.svc:8080/v1/models). buildZenModels
  // grafts this description/features/tier onto the served SKU by name match, so
  // the name MUST be the clean served id (zen-image, not zen3-image) or the
  // model renders with an auto-title and empty description. The zen3-* entries
  // further below are retired-generation metadata kept for reference; they no
  // longer match anything the relay serves.
  {
    name: "zen-vl",
    fullName: "Zen VL — Vision-Language",
    description: "Reads images and reasons over them — visual Q&A, document and chart understanding, grounded captioning.",
    features: ["128K context", "Vision + Language"],
    tier: "pro",
    context: 128000,
  },
  {
    name: "zen-embedding",
    fullName: "Zen Embedding",
    description: "Dense text embeddings for semantic search, retrieval, and clustering.",
    features: ["8K context", "Embeddings"],
    tier: "starter",
    context: 8192,
  },
  {
    name: "zen-rerank",
    fullName: "Zen Rerank",
    description: "Cross-encoder reranker — scores (query, document) pairs to reorder retrieval results.",
    features: ["Reranking", "Retrieval"],
    tier: "starter",
  },
  {
    name: "zen-guard",
    fullName: "Zen Guard — Content Safety",
    description: "Safety classifier for moderation and guardrails across a broad category and language set.",
    features: ["128K context", "Safety classifier"],
    tier: "starter",
    context: 128000,
  },
  {
    name: "zen-image",
    fullName: "Zen Image",
    description: "Text-to-image generation.",
    features: ["Text → Image"],
    tier: "pro",
  },
  {
    name: "zen-video",
    fullName: "Zen Video",
    description: "Text-to-video — generates short clips from a prompt (async).",
    features: ["Text → Video", "Async"],
    tier: "pro max",
  },
  {
    name: "zen-voice",
    fullName: "Zen Voice",
    description: "Text-to-speech — natural voice synthesis.",
    features: ["Text → Speech"],
    tier: "pro",
  },
  {
    name: "zen-music",
    fullName: "Zen Music",
    description: "Text-to-music generation.",
    features: ["Text → Music"],
    tier: "pro",
  },
  {
    name: "zen-foley",
    fullName: "Zen Foley",
    description: "Text-to-sound-effects — generates Foley and ambient audio from a prompt.",
    features: ["Text → Sound FX"],
    tier: "pro",
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
    description: "Vision-language model for image understanding and visual reasoning. Default 30B-A3B MoE; size variants available as zen3-vl-2B / 8B / 32B / 235B-A22B.",
    features: ["262K context window", "Vision + Language"],
    tier: "pro max",
    context: 262000,
    specs: { params: "30B (3B active)", arch: "Zen VL MoE" },
  },
  {
    name: "zen3-vl-2B",
    fullName: "Zen3 VL 2B",
    description: "Tiniest vision-language dense for edge / on-device image understanding.",
    features: ["32K context", "2B parameters (dense)", "Vision + Language"],
    tier: "starter",
    context: 32768,
    specs: { params: "2B", arch: "Zen VL dense" },
  },
  {
    name: "zen3-vl-8B",
    fullName: "Zen3 VL 8B",
    description: "Small vision-language dense — laptop / mobile NPU class.",
    features: ["32K context", "9B parameters (dense)", "Vision + Language"],
    tier: "pro",
    context: 32768,
    specs: { params: "9B", arch: "Zen VL dense" },
  },
  {
    name: "zen3-vl-32B",
    fullName: "Zen3 VL 32B",
    description: "Mid vision-language dense for serious visual reasoning on a single GPU.",
    features: ["128K context", "33B parameters (dense)", "Vision + Language"],
    tier: "pro max",
    context: 131072,
    specs: { params: "33B", arch: "Zen VL dense" },
  },
  {
    name: "zen3-vl-235B-A22B",
    fullName: "Zen3 VL 235B-A22B",
    description: "Top-tier vision-language MoE — frontier visual reasoning, 235B total / 22B active per token.",
    features: ["256K context", "235B total / 22B active (MoE)", "Vision + Language", "Frontier visual reasoning"],
    tier: "ultra max",
    context: 262144,
    specs: { params: "235B (22B active)", arch: "Zen VL MoE" },
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
  // NOTE: zen3-embedding (and -small/-medium/-openai aliases) sunset
  // 2026-05-30 as DUPLICATE-zen3. Use zen5-embedding-{0.6B,4B,8B} below
  // or the zen-embedding-{0.6B,8B}-GGUF HF repos directly.
  // ── Zen5 Embedding — DigitalOcean self-hosted, two-SKU lineup ─────
  {
    name: "zen5-embedding-0.6B",
    fullName: "Zen5 Embedding 0.6B",
    description: "Lightweight embedding model for high-throughput RAG and search. 1024 dimensions.",
    features: ["32K context window", "0.6B parameters", "1024 dimensions", "Zen Embedding"],
    tier: "starter",
    context: 32000,
    specs: { params: "0.6B", arch: "Zen Embedding" },
    endpoint: "/v1/embeddings",
  },
  {
    name: "zen5-embedding-4B",
    fullName: "Zen5 Embedding 4B",
    description: "Balanced embedding model. 2560 dimensions, 32K context.",
    features: ["32K context window", "4B parameters", "2560 dimensions", "Zen Embedding"],
    tier: "pro",
    context: 32000,
    specs: { params: "4B", arch: "Zen Embedding" },
    endpoint: "/v1/embeddings",
  },
  {
    name: "zen5-embedding-8B",
    fullName: "Zen5 Embedding 8B",
    description: "High-quality embedding model for production RAG, semantic search, and classification. 4096 dimensions.",
    features: ["32K context window", "8B parameters", "4096 dimensions", "Zen Embedding"],
    tier: "pro",
    context: 32000,
    specs: { params: "8B", arch: "Zen Embedding" },
    endpoint: "/v1/embeddings",
  },
  // NOTE: zen3-reranker family (small/medium/8B) sunset 2026-05-30 as
  // DUPLICATE-zen3. Use zen-reranker-{0.6B,4B,8B}-GGUF HF repos directly.
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
  // NOTE: zen3-audio / zen3-audio-fast aliases sunset 2026-05-30 as
  // DUPLICATE-zen3. Use the canonical zen3-asr / zen3-asr-0.6B entries below.
  // Zen3 ASR — Speech-to-Text via /v1/audio/transcriptions
  {
    name: "zen3-asr",
    fullName: "Zen3 ASR",
    description: "Real-time streaming speech recognition for live transcription and voice agents.",
    features: ["Streaming", "Real-time", "Sub-500ms latency"],
    tier: "pro max",
    specs: { params: "N/A", arch: "Streaming ASR" },
    endpoint: "/v1/audio/transcriptions",
    pricingUnit: "minute",
    staticPricing: { perUnit: 0.004 },
  },
  {
    name: "zen3-asr-0.6B",
    fullName: "Zen3 ASR 0.6B",
    description: "Tiny ASR for edge / on-device transcription. Sub-200ms latency, mobile NPU class.",
    features: ["Streaming", "Edge / on-device", "Sub-200ms latency"],
    tier: "starter",
    specs: { params: "0.9B", arch: "Streaming ASR" },
    endpoint: "/v1/audio/transcriptions",
    pricingUnit: "minute",
    staticPricing: { perUnit: 0.002 },
  },
  {
    name: "zen3-asr-aligner",
    fullName: "Zen3 ASR Aligner",
    description: "Forced-alignment specialist for timestamp-precise transcripts (word-level timestamps, dubbing pipelines, accessibility captioning).",
    features: ["Forced alignment", "Word-level timestamps", "Sub-200ms latency"],
    tier: "starter",
    specs: { params: "0.9B", arch: "Forced Aligner" },
    endpoint: "/v1/audio/transcriptions",
    pricingUnit: "minute",
    staticPricing: { perUnit: 0.002 },
  },
  // NOTE: zen3-asr-v1 alias sunset 2026-05-30 as DUPLICATE-zen3. Use
  // zen3-asr (1.7B) or zen3-asr-0.6B above.
  // Zen3 TTS — Text-to-Speech via /v1/audio/speech
  {
    name: "zen3-tts",
    fullName: "Zen3 TTS",
    description: "High-quality text-to-speech with natural prosody. 40+ voices, 8 languages.",
    features: ["40+ voices", "8 languages", "Natural prosody"],
    tier: "pro max",
    specs: { params: "82M", arch: "TTS" },
    endpoint: "/v1/audio/speech",
    pricingUnit: "1M characters",
    staticPricing: { perUnit: 5.0 },
  },
  // NOTE: zen3-tts-hd / zen3-tts-fast were virtual aliases never backed by
  // weights; removed 2026-05-30. The real Zen3 TTS family is the four
  // entries below: zen3-tts (1.7B), zen3-tts-0.6B, zen3-tts-voice-design,
  // zen3-tts-custom-voice.
  {
    name: "zen3-tts-0.6B",
    fullName: "Zen3 TTS 0.6B",
    description: "Tiny TTS for edge / on-device speech synthesis. Sub-100ms time-to-first-audio.",
    features: ["Edge / on-device", "Sub-100ms TTFA", "12 Hz acoustic tokens"],
    tier: "starter",
    specs: { params: "0.9B", arch: "TTS" },
    endpoint: "/v1/audio/speech",
    pricingUnit: "1M characters",
    staticPricing: { perUnit: 2.0 },
  },
  {
    name: "zen3-tts-voice-design",
    fullName: "Zen3 TTS Voice Design",
    description: "Premium TTS with prompt-driven voice design — describe the voice you want in natural language.",
    features: ["Voice design from prompt", "40+ voices", "Premium quality"],
    tier: "pro max",
    specs: { params: "2B", arch: "TTS Voice Design" },
    endpoint: "/v1/audio/speech",
    pricingUnit: "1M characters",
    staticPricing: { perUnit: 8.0 },
  },
  {
    name: "zen3-tts-custom-voice",
    fullName: "Zen3 TTS Custom Voice",
    description: "Few-shot voice cloning — generate speech in a target speaker's voice from a short audio sample.",
    features: ["Few-shot voice cloning", "Speaker similarity", "Premium quality"],
    tier: "ultra max",
    specs: { params: "2B", arch: "TTS Custom Voice" },
    endpoint: "/v1/audio/speech",
    pricingUnit: "1M characters",
    staticPricing: { perUnit: 10.0 },
  },
  // ── Zen5 Generation — DigitalOcean self-hosted ────────────────────
  // Two canonical SKUs (zen5-flash + zen5-pro) are live in zen-gateway
  // and routed to DigitalOcean GenAI inference. The remaining entries
  // (zen5, zen5-max, zen5-ultra, zen5-mini) are kept as deprecation
  // aliases until 2026-08; clients should migrate to flash or pro.
  // All zen5 models are eventually trained on the Zen Agentic Dataset
  // (10B+ tokens of real-world tool use and multi-step reasoning).
  {
    name: "zen5-nano-0.8B",
    fullName: "Zen5 Nano 0.8B",
    description: "Edge / on-device tier. Multimodal dense at 0.9B parameters — Raspberry Pi / phone / browser WASM class.",
    features: ["32K context", "0.9B parameters (dense)", "Multimodal", "Edge / on-device"],
    tier: "starter",
    context: 32768,
    specs: { params: "0.9B", arch: "Zen VL dense" },
  },
  {
    name: "zen5-nano-2B",
    fullName: "Zen5 Nano 2B",
    description: "Low-end multimodal dense at 2B parameters — low iGPU / 8 GB RAM laptop class.",
    features: ["32K context", "2B parameters (dense)", "Multimodal", "Low-end laptop"],
    tier: "starter",
    context: 32768,
    specs: { params: "2B", arch: "Zen VL dense" },
  },
  {
    name: "zen5-nano-4B",
    fullName: "Zen5 Nano 4B",
    description: "Mid multimodal dense at 5B parameters — 16 GB RAM laptop / mobile NPU class.",
    features: ["32K context", "5B parameters (dense)", "Multimodal", "Mid laptop / mobile NPU"],
    tier: "starter",
    context: 32768,
    specs: { params: "5B", arch: "Zen VL dense" },
  },
  {
    name: "zen5-nano-9B",
    fullName: "Zen5 Nano 9B",
    description: "Upper-nano multimodal dense at 10B parameters — 24 GB+ unified RAM / consumer GPU class.",
    features: ["32K context", "10B parameters (dense)", "Multimodal", "Consumer GPU class"],
    tier: "pro",
    context: 32768,
    specs: { params: "10B", arch: "Zen VL dense" },
  },
  {
    name: "zen5-flash",
    fullName: "Zen5 Flash",
    description: "Smallest and cheapest text-only Zen5 chat tier. 4B-class dense, sub-100ms TTFT, 32K context. For high-volume routing and simple agent loops.",
    features: ["32K context window", "4B parameters (dense)", "Sub-100ms TTFT", "Highest throughput"],
    tier: "starter",
    context: 32768,
    specs: { params: "4B", arch: "Zen dense" },
  },
  {
    name: "zen5-coder",
    fullName: "Zen5 Coder",
    description: "Code-specialized Zen5 tier. 80B sparse MoE tuned for repo-scale code understanding, agentic refactoring, and tool-use coding loops.",
    features: ["256K context", "80B sparse MoE", "Code-specialized", "Agentic / tool-use"],
    tier: "pro",
    context: 262144,
    specs: { params: "80B (MoE)", arch: "Zen Coder MoE" },
  },
  {
    name: "zen5",
    fullName: "Zen5 (Default)",
    description: "Canonical Zen5 default. a 35B frontier MoE (3B active) (35B total / 3B active per token, released Apr 2026, Apache-2.0). 256K context, agentic-trained, OpenAI + Anthropic API. The everyday Zen5 chat model.",
    features: ["256K context window", "35B total / 3B active (MoE)", "Zen base", "Apr 2026 release", "OpenAI + Anthropic API"],
    tier: "pro",
    context: 262144,
    specs: { params: "35B (3B active)", arch: "Zen frontier MoE" },
  },
  {
    name: "zen5-pro",
    fullName: "Zen5 Pro",
    description: "Zen Flash IQ2_XXS-imatrix weights (81 GB GGUF on zenlm/zen-5-pro-gguf). 284B total / 37B active per token, 1M context, asymmetric routed-MoE quant. Fits a single 128 GB Apple Silicon / DGX Spark / H100 80 GB.",
    features: ["1M context window", "284B total / 37B active (MoE)", "Zen Flash base", "IQ2_XXS-imatrix quant (81 GB)", "Runs on 128 GB hardware"],
    tier: "ultra",
    context: 1048576,
    specs: { params: "284B (37B active)", arch: "Zen Flash MoE" },
  },
  {
    name: "zen5-max",
    fullName: "Zen5 Max",
    description: "Zen Pro full weights (432 GB). Top quality tier in the family. Requires 512+ GB unified RAM (Mac Studio M3 Ultra 512 GB) or 8x H100/H200 class GPU pool.",
    features: ["1M+ context window", "Top tier quality", "Zen Pro full weights (432 GB)", "Multi-GPU / Mac Studio Ultra class"],
    tier: "ultra max",
    context: 1048576,
    specs: { params: "TBA (full DS4 Pro)", arch: "Zen Pro MoE" },
  },
  {
    name: "zen5-mini",
    fullName: "Zen5 Mini",
    description: "Frontier agentic at the lowest cost in the family. Built on a 230B agentic MoE (10B active) (230B MoE / 10B active, released Feb 2026). 80.2% SWE-Bench Verified, 76.3% BrowseComp; trained on 200K+ real-world environments via large-scale RL.",
    features: ["192K context window", "230B total / 10B active (MoE)", "Zen agentic base", "Frontier agentic / coding", "Lowest $/token in family"],
    tier: "pro",
    context: 196608,
    specs: { params: "230B (10B active)", arch: "Zen MoE" },
  },
];

// ── Model families — groupings for catalog UI ──────────────────────────
// Every frontend renders from this canonical list. No hardcoding elsewhere.
// ── Enso — Hanzo's proprietary frontier family ──────────────────────
// Enso is Hanzo's closed frontier family (unlike the open Zen family). It is
// GENERALLY AVAILABLE (no waitlist). Full entries (metadata + retail pricing +
// owned_by) since there is no live Enso pricing gateway wired here; prices mirror
// the authoritative source (~/work/hanzo/enso/catalog.yaml). Upstreams are never
// revealed — a caller only ever sees "Enso".
export const ensoCatalog = [
  {
    name: "enso",
    fullName: "Enso",
    description: "Hanzo's proprietary frontier model — Opus-class reasoning by default with 1M-context overflow.",
    features: ["1M context window", "Frontier reasoning"],
    tier: "ultra max",
    context: 1000000,
    owned_by: "hanzo",
    pricing: { input: 20, output: 60, cacheRead: null, cacheWrite: null },
  },
  {
    name: "enso-flash",
    fullName: "Enso Flash",
    description: "Fast, economical Enso tier for high-volume, low-latency everyday work, with 1M-context overflow.",
    features: ["1M context window", "Low latency"],
    tier: "pro",
    context: 1000000,
    owned_by: "hanzo",
    pricing: { input: 2, output: 6, cacheRead: null, cacheWrite: null },
  },
  {
    name: "enso-ultra",
    fullName: "Enso Ultra",
    description: "Adaptive fan-out — probes a task-appropriate model, escalates to a top-K panel only when needed, then verifies-then-selects the best answer.",
    features: ["200K context window", "Adaptive fan-out"],
    tier: "ultra max",
    context: 200000,
    owned_by: "hanzo",
    pricing: { input: 40, output: 120, cacheRead: null, cacheWrite: null },
  },
];

export const zenFamilies = [
  {
    id: 'enso',
    name: 'Enso',
    description: "Hanzo's proprietary frontier family — flagship reasoning, a fast tier, and adaptive fan-out.",
    icon: 'Sparkles',
    models: ['enso', 'enso-flash', 'enso-ultra'],
  },
  {
    id: 'zen5',
    name: 'Zen 5',
    description: 'Next-generation agentic models with native chain-of-thought.',
    icon: 'Rocket',
    models: ['zen5-nano-0.8B', 'zen5-nano-2B', 'zen5-nano-4B', 'zen5-nano-9B', 'zen5-flash', 'zen5-mini', 'zen5', 'zen5-coder', 'zen5-pro', 'zen5-max'],
  },
  {
    id: 'zen3',
    name: 'Zen 3 Multimodal',
    description: 'Vision, safety, and multimodal chat models.',
    icon: 'Eye',
    models: ['zen3-omni', 'zen3-vl', 'zen3-vl-2B', 'zen3-vl-8B', 'zen3-vl-32B', 'zen3-vl-235B-A22B', 'zen3-nano', 'zen3-guard'],
  },
  {
    id: 'embedding',
    name: 'Embedding & Retrieval',
    description: 'Text embeddings and search reranking via API.',
    icon: 'Search',
    models: [
      'zen5-embedding-0.6B', 'zen5-embedding-4B', 'zen5-embedding-8B',
    ],
  },
  {
    id: 'image',
    name: 'Image Generation',
    description: 'Text-to-image generation via API.',
    icon: 'Image',
    models: [
      'zen3-image', 'zen3-image-max', 'zen3-image-dev', 'zen3-image-fast',
      'zen3-image-sdxl', 'zen3-image-playground', 'zen3-image-ssd', 'zen3-image-jp',
    ],
  },
  {
    id: 'audio',
    name: 'Audio & Speech',
    description: 'Speech-to-text, text-to-speech, and streaming ASR.',
    icon: 'Mic',
    models: [
      'zen3-asr', 'zen3-asr-0.6B', 'zen3-asr-aligner',
      'zen3-tts', 'zen3-tts-0.6B', 'zen3-tts-voice-design', 'zen3-tts-custom-voice',
    ],
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
