// Bundle suite for @hanzo/pricing goja/bundle.js — the engine-runnable port of
// the server.mjs read handlers + the sync.mjs markup transforms (Express is
// dropped; it cannot run in goja).
//
// Zero-dependency: Node's built-in assert + vm. The bundle is run in a vm
// context with the same globals the Go host (cloud/clients/pricingsvc) injects,
// then we assert: (1) the read handlers shape data correctly and strip
// _internal, (2) the markup math (toMTok / processOpenRouterModel) is exact.
// Run: node test/bundle.test.mjs

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

let passed = 0
const ok = (name) => { passed++; console.log('  ok -', name) }

// --- load bundle into a vm context with host-injected globals ---------------
const pricingData = require('../data/pricing.json')
const plansExtra = {
  iam: require('../plans-extra/iam.json'),
  base: require('../plans-extra/base.json'),
  paas: require('../plans-extra/paas.json'),
}
// The pricing bundle reads the @hanzo/plans catalog too (subscriptions etc).
// Prefer the installed dependency; fall back to the sibling repo checkout so
// this test runs zero-install in CI. The plans catalog is only needed for the
// subscriptions/blockchain/policy routes; the markup-math assertions below do
// not depend on it.
const plansData = {}
for (const f of ['subscription.json', 'blockchain.json', 'pricing-policy.json', 'tools.json', 'gpu.json']) {
  let loaded = false
  for (const base of ['@hanzo/plans/', '../../plans/']) {
    try { plansData[f] = require(base + f); loaded = true; break } catch { /* try next */ }
  }
  if (!loaded) { /* optional — leave unset */ }
}

const ctx = vm.createContext({})
vm.runInContext('this.__PRICING_DATA__=' + JSON.stringify(pricingData), ctx)
vm.runInContext('this.__PLANS_EXTRA__=' + JSON.stringify(plansExtra), ctx)
vm.runInContext('this.__PLANS_DATA__=' + JSON.stringify(plansData), ctx)
vm.runInContext('this.__MARKUP__={thirdParty:1.0,computeMonthly:1.0}', ctx)
vm.runInContext('this.console={log(){},warn(){},error(){},info(){},debug(){}}', ctx)
vm.runInContext(readFileSync(join(__dirname, '..', 'goja', 'bundle.js'), 'utf-8'), ctx, { filename: 'goja/bundle.js' })

const handle = vm.runInContext('this.handle', ctx)
const applyMarkup = vm.runInContext('this.applyMarkup', ctx)

assert.equal(typeof handle, 'function')
assert.equal(typeof applyMarkup, 'function')
ok('bundle exposes globalThis.handle + globalThis.applyMarkup')

// --- read handlers ----------------------------------------------------------
const summary = handle({ route: 'summary' })
assert.equal(summary.status, 200)
assert.ok(summary.body.totalModels > 0, 'summary has totalModels')
ok('summary route returns model counts')

const pub = handle({ route: 'pricing' })
assert.equal(pub.status, 200)
assert.ok(pub.body.cloud, 'has cloud section')
assert.equal(pub.body.cloud._internal, undefined, '_internal stripped from public /v1/pricing')
ok('public /v1/pricing strips cloud._internal (provider costs / routing)')

for (const route of ['pricing', 'compute', 'cloud']) {
  const r = handle({ route })
  assert.equal(r.status, 200, route)
  assert.ok(!JSON.stringify(r.body).includes('"_internal"'), `${route}: _internal never leaves the bundle`)
}
{
  // Stripped at the exit, whatever a route returns: a section added later is covered.
  const seeded = { ...pricingData, infrastructure: { ...pricingData.infrastructure, compute: { ...pricingData.infrastructure.compute, _internal: { cost: 1 } } } }
  vm.runInContext('this.__PRICING_DATA__=' + JSON.stringify(seeded), ctx)
  assert.ok(!JSON.stringify(handle({ route: 'compute' }).body).includes('"_internal"'), 'compute strips a nested _internal')
  vm.runInContext('this.__PRICING_DATA__=' + JSON.stringify(pricingData), ctx)
}
ok('every route strips _internal at any depth')

// Jev is listed at the price we bill it at, and it is TypeSafe's: its row keeps its
// own provider and category. Every other row in the Hanzo catalog reads Hanzo and
// zen, exactly as before Jev was listed — a row that names a provider of its own is
// still Hanzo's here unless it is a decision model served by someone else.
const listed = handle({ route: 'models' }).body.models
for (const name of ['typesafe/jev-1.13', '~typesafe/jev-latest']) {
  const jev = listed.find((m) => m.name === name)
  assert.equal(jev.provider, 'TypeSafe')
  assert.equal(jev.category, 'specialty')
  assert.equal(jev.pricing.input, 0.042)
}
for (const m of pricingData.hanzoModels) {
  if (m.specs && m.specs.arch === 'decision' && m.provider) continue
  const row = listed.find((x) => x.name === m.name)
  assert.equal(row.provider, 'Hanzo', `${m.name} reads Hanzo`)
  assert.equal(row.category, 'zen', `${m.name} keeps the category it had`)
}
ok('models keeps Jev as TypeSafe\'s and every Hanzo row as it was')

const m404 = handle({ route: 'model', params: { name: 'definitely-not-a-model' } })
assert.equal(m404.status, 404, 'unknown model -> 404')
ok('model lookup unknown -> 404')

const subs = handle({ route: 'subscriptions' })
assert.equal(subs.status, 200)
assert.ok(Array.isArray(subs.body.plans), 'subscriptions plans array')
ok('subscriptions route serves @hanzo/plans catalog')

const iam = handle({ route: 'iam' })
assert.ok(Array.isArray(iam.body.plans) && iam.body.plans.length > 0, 'iam plans from plans-extra')
ok('iam route serves plans-extra fragment')

// --- markup math is EXACT (this is the sync.mjs logic running in the bundle) -
const shaped = applyMarkup({
  openrouter: [
    { id: 'openai/gpt-4o', name: 'GPT-4o', context_length: 128000, pricing: { prompt: '0.0000025', completion: '0.00001' } },
    { id: 'meta/free-model', name: 'Free', context_length: 8192, pricing: { prompt: '0', completion: '0' } },
  ],
  huggingface: [{ id: 'meta-llama/Llama-3.1-8B' }],
})
const gpt4o = shaped.thirdPartyModels.find((m) => m.id === 'openai/gpt-4o')
// toMTok: 0.0000025 * 1e6 * 1.0 = 2.5 ; 0.00001 * 1e6 = 10
assert.equal(gpt4o.pricing.input, 2.5, 'toMTok input markup')
assert.equal(gpt4o.pricing.output, 10, 'toMTok output markup')
assert.equal(gpt4o.provider, 'Openai', 'providerFromId')
const free = shaped.thirdPartyModels.find((m) => m.id === 'meta/free-model')
assert.equal(free.isFree, true, 'zero-priced model flagged free')
assert.equal(free.pricing.input, 0, 'free input 0')
const hf = shaped.thirdPartyModels.find((m) => m.id === 'huggingface/meta-llama/Llama-3.1-8B')
assert.ok(hf && hf.isFree, 'HF model present + free')
assert.equal(shaped.providers.HuggingFace.free, 1, 'HF provider count')
ok('applyMarkup: toMTok / processOpenRouterModel / processHuggingFaceModel math exact')

console.log(`\n${passed} pricing bundle checks passed.`)
