// @hanzo/pricing — goja bundle.
//
// SELF-CONTAINED, NO ESM, NO Express, NO node: imports. This is the
// engine-runnable companion to src/server.mjs (Express) + src/sync.mjs.
//
// WHY a bundle and not server.mjs verbatim: server.mjs is an EXPRESS app.
// Express needs Node's http/net stack, which dop251/goja does not provide —
// Express cannot run in goja. So the Express *transport* is dropped and the
// pricing *handlers* (pure transforms over the pricing.json catalog + the
// @hanzo/plans data) are ported here to run in goja, dispatched by the Go
// host (cloud/clients/pricingsvc) which owns the zip routes + the listener.
//
// The MARKUP / TRANSFORM logic from sync.mjs (toMTok, roundPrice,
// processOpenRouterModel, processHuggingFaceModel, compute-tier markup) is
// ALSO ported here so the *shaping* of upstream data stays in JS. The live
// network fetch (OpenRouter/HF/DO/zen-gateway) is the only piece that cannot
// run in goja (no fetch/AbortController); the Go host performs the HTTP GETs
// and feeds the raw JSON into the JS markup functions via globalThis.applyMarkup().
//
// Host contract:
//   globalThis.__PRICING_DATA__ = <pricing.json object>   (the served catalog)
//   globalThis.__PLANS_EXTRA__  = { iam:<obj>, base:<obj>, paas:<obj> }
//   globalThis.__DATASTORE__    = <obj>  (datastore.json rate card)
//   globalThis.__PLANS_DATA__   = same shape as the plans bundle (subscription.json, ...)
//   globalThis.__MARKUP__       = { thirdParty, computeMonthly }  (env-driven knobs)
//   globalThis.handle({ route, params, query }) -> { status, body }
//   globalThis.applyMarkup({ openrouter:[...], huggingface:[...], do:{...} }) -> shaped pricing.json

(function () {
  'use strict';

  function pricing() {
    var d = globalThis.__PRICING_DATA__;
    return d || null;
  }
  function plansExtra() { return globalThis.__PLANS_EXTRA__ || {}; }
  function datastoreCard() { return globalThis.__DATASTORE__ || null; }
  function plansData() { return globalThis.__PLANS_DATA__ || {}; }
  function markupKnobs() {
    var m = globalThis.__MARKUP__ || {};
    return {
      thirdParty: typeof m.thirdParty === 'number' ? m.thirdParty : 1.0,
      computeMonthly: typeof m.computeMonthly === 'number' ? m.computeMonthly : 1.0,
    };
  }

  // subscription / blockchain / policy from the @hanzo/plans catalog.
  function planArray(obj, keys) {
    if (Array.isArray(obj)) return obj;
    if (obj && typeof obj === 'object') {
      for (var i = 0; i < keys.length; i++) {
        if (Array.isArray(obj[keys[i]])) return obj[keys[i]];
      }
    }
    return [];
  }
  function subscriptionPlans() { return planArray(plansData()['subscription.json'], ['plans','subscriptions']); }
  function blockchainPlans() { return planArray(plansData()['blockchain.json'], ['plans']); }
  function pricingPolicy() { return plansData()['pricing-policy.json'] || {}; }
  function canonicalTools() { var t = plansData()['tools.json']; return planArray(t, ['tools']) .length ? planArray(t,['tools']) : t; }
  function canonicalGpuTiers() { var g = plansData()['gpu.json']; return planArray(g, ['tiers']).length ? planArray(g,['tiers']) : g; }
  function iamPlans() { return plansExtra().iam || []; }
  function basePlans() { return plansExtra().base || []; }
  function paasPlans() { return plansExtra().paas || []; }

  // === markup helpers (verbatim port of sync.mjs) ============================

  function roundPrice(n) {
    if (n == null) return null;
    if (n >= 1) return Math.round(n * 100) / 100;
    if (n >= 0.01) return Math.round(n * 1000) / 1000;
    return Math.round(n * 10000) / 10000;
  }
  function toMTok(perTokenStr, markup) {
    if (perTokenStr == null || perTokenStr === '') return null;
    var perToken = parseFloat(perTokenStr);
    if (isNaN(perToken)) return null;
    return roundPrice(perToken * 1000000 * markup);
  }
  function formatContext(ctxLength) {
    if (!ctxLength) return null;
    if (ctxLength >= 1000000) return Math.round(ctxLength / 1000000) + 'M context window';
    if (ctxLength >= 1000) return Math.round(ctxLength / 1000) + 'k context window';
    return ctxLength + ' context window';
  }
  function providerFromId(id) {
    if (!id) return 'Unknown';
    var parts = String(id).split('/');
    if (parts.length < 2) return 'Unknown';
    var slug = parts[0];
    return slug.charAt(0).toUpperCase() + slug.slice(1);
  }
  function processOpenRouterModel(orModel, markup) {
    var p = orModel.pricing || {};
    var promptPrice = parseFloat(p.prompt || '0');
    var completionPrice = parseFloat(p.completion || '0');
    var isFree = promptPrice === 0 && completionPrice === 0;
    var features = [];
    var ctxStr = formatContext(orModel.context_length);
    if (ctxStr) features.push(ctxStr);
    if (isFree) features.push('Free tier');
    else if (orModel.architecture && orModel.architecture.modality) features.push(orModel.architecture.modality);
    return {
      id: orModel.id,
      name: orModel.name || orModel.id,
      provider: providerFromId(orModel.id),
      contextWindow: orModel.context_length || null,
      features: features,
      isFree: isFree,
      pricing: {
        input: isFree ? 0 : toMTok(p.prompt, markup),
        output: isFree ? 0 : toMTok(p.completion, markup),
        cacheRead: toMTok(p.input_cache_read, markup),
        cacheWrite: toMTok(p.input_cache_write, markup),
      },
    };
  }
  function hfDisplayName(modelId) {
    var parts = String(modelId).split('/');
    return parts[parts.length - 1];
  }
  function processHuggingFaceModel(hfModel) {
    return {
      id: 'huggingface/' + hfModel.id,
      name: hfDisplayName(hfModel.id),
      provider: 'HuggingFace',
      contextWindow: null,
      features: ['HuggingFace Serverless Inference', 'Free tier'],
      isFree: true,
      pricing: { input: 0, output: 0, cacheRead: null, cacheWrite: null },
    };
  }

  // applyMarkup: shape raw upstream listings into the third-party section.
  // The Go host fetches the raw lists (network), this does the markup (logic).
  // Returns just the recomputed thirdPartyModels + providers + summary delta,
  // so the host can merge into the served pricing.json.
  globalThis.applyMarkup = function (raw) {
    raw = raw || {};
    var knobs = markupKnobs();
    var third = [];
    (raw.openrouter || []).forEach(function (m) {
      third.push(processOpenRouterModel(m, knobs.thirdParty));
    });
    (raw.huggingface || []).forEach(function (m) {
      third.push(processHuggingFaceModel(m));
    });
    var providerCounts = {};
    third.forEach(function (m) {
      if (!providerCounts[m.provider]) providerCounts[m.provider] = { total: 0, free: 0, paid: 0 };
      providerCounts[m.provider].total++;
      if (m.isFree) providerCounts[m.provider].free++; else providerCounts[m.provider].paid++;
    });
    return {
      thirdPartyModels: third,
      providers: providerCounts,
      freeModels: third.filter(function (m) { return m.isFree; }).map(function (m) { return m.id; }),
    };
  };

  // === read handlers (port of the /v1/pricing/* surface of server.mjs) =======
  // Each returns either a plain body (=> 200) or { __status, ... }.

  function pubCloud(data) {
    if (!data || !data.cloud) return null;
    var c = data.cloud;
    var out = {};
    Object.keys(c).forEach(function (k) { if (k !== '_internal') out[k] = c[k]; });
    return out;
  }

  var routes = {
    'root': function () { return { status: 'ok', service: 'pricing.hanzo.ai', version: '1.0.0' }; },

    'pricing': function () {
      var data = pricing();
      if (!data) return { __status: 503, error: 'Pricing data not yet available' };
      if (data.cloud) {
        var copy = Object.assign({}, data);
        copy.cloud = pubCloud(data);
        return copy;
      }
      return data;
    },

    'models': function () {
      var data = pricing();
      if (!data) return { __status: 503, error: 'Pricing data not yet available' };
      var models = (data.hanzoModels || []).map(function (m) {
        return Object.assign({}, m, { provider: 'Hanzo', category: 'zen' });
      }).concat((data.thirdPartyModels || []).map(function (m) {
        return Object.assign({}, m, { category: m.featured ? 'featured' : 'third-party' });
      }));
      return { updated: data.updated, total: models.length, models: models };
    },

    'model': function (ctx) {
      var data = pricing();
      if (!data) return { __status: 503, error: 'Pricing data not yet available' };
      var q = String(ctx.params.name || '').toLowerCase();
      var model = (data.hanzoModels || []).find(function (m) { return m.name.toLowerCase() === q; }) ||
        (data.thirdPartyModels || []).find(function (m) {
          return m.name.toLowerCase() === q || (m.id && m.id.toLowerCase() === q);
        });
      if (!model) return { __status: 404, error: 'Model not found: ' + ctx.params.name };
      return model;
    },

    'summary': function () {
      var data = pricing();
      if (!data) return { __status: 503, error: 'Pricing data not yet available' };
      return Object.assign({ updated: data.updated }, data.summary, { providers: data.providers });
    },

    'free': function () {
      var data = pricing();
      if (!data) return { __status: 503, error: 'Pricing data not yet available' };
      var free = (data.thirdPartyModels || []).filter(function (m) { return m.isFree; });
      return { updated: data.updated, total: free.length, models: free };
    },

    'featured': function () {
      var data = pricing();
      if (!data) return { __status: 503, error: 'Pricing data not yet available' };
      var featured = (data.thirdPartyModels || []).filter(function (m) { return m.featured; });
      return { updated: data.updated, total: featured.length, models: featured };
    },

    'compute': function () {
      var data = pricing();
      if (!data || !data.infrastructure || !data.infrastructure.compute)
        return { __status: 503, error: 'Compute pricing not yet available' };
      return data.infrastructure.compute;
    },

    'compute/presets': function () {
      var data = pricing();
      if (!data || !data.infrastructure || !data.infrastructure.compute || !data.infrastructure.compute.presets)
        return { __status: 503, error: 'Compute presets not yet available' };
      return { presets: data.infrastructure.compute.presets };
    },

    'cloud': function () {
      var c = pubCloud(pricing());
      if (!c) return { __status: 503, error: 'Cloud pricing not yet available' };
      return c;
    },

    'cloud/plans': function () {
      var data = pricing();
      if (!data || !data.cloud || !data.cloud.plans) return { __status: 503, error: 'Cloud plans not yet available' };
      return { plans: data.cloud.plans };
    },

    'cloud/regions': function () {
      var data = pricing();
      if (!data || !data.cloud || !data.cloud.regions) return { __status: 503, error: 'Cloud regions not yet available' };
      return { regions: data.cloud.regions };
    },

    'cloud/storage': function () {
      var data = pricing();
      if (!data || !data.cloud || !data.cloud.blockStorage) return { __status: 503, error: 'Storage pricing not yet available' };
      return data.cloud.blockStorage;
    },

    'providers': function () {
      var data = pricing();
      if (!data) return { __status: 503, error: 'Pricing data not yet available' };
      return { updated: data.updated, providers: data.providers };
    },

    'subscriptions': function () { return { plans: subscriptionPlans() }; },
    'blockchain':    function () { return { plans: blockchainPlans() }; },
    'iam':           function () { return { plans: iamPlans() }; },
    'base':          function () { return { plans: basePlans() }; },
    'paas':          function () { return { plans: paasPlans() }; },

    // The Datastore rate card, served whole. Unlike iam/base/paas this is not a
    // plans list — the consumer reads tiers, usage rates, discounts and trial off
    // the top level — so it is returned as authored rather than wrapped.
    'datastore':     function () {
      var d = datastoreCard();
      if (!d) return { __status: 503, error: 'Datastore pricing not yet available' };
      return d;
    },
    'policy':        function () { return pricingPolicy(); },
    'tools':         function () { return { tools: canonicalTools() }; },
    'gpu':           function () { return { tiers: canonicalGpuTiers() }; },
  };

  // /v1/models — the unified OpenAI-style model listing alias.
  routes['__models_alias'] = function () {
    var data = pricing();
    if (!data) return { __status: 503, error: 'Model data not yet available' };
    var zenModels = (data.hanzoModels || []).map(function (m) {
      return Object.assign({ id: m.id || m.name, object: 'model', owned_by: 'hanzo' }, m, { provider: 'Hanzo' });
    });
    var thirdParty = (data.thirdPartyModels || []).map(function (m) {
      return Object.assign({ id: m.id || m.name, object: 'model', owned_by: m.provider || 'third-party' }, m);
    });
    return {
      object: 'list', updated: data.updated, summary: data.summary,
      families: data.families || [], data: zenModels.concat(thirdParty),
    };
  };

  globalThis.handle = function (req) {
    req = req || {};
    var route = req.route;
    var ctx = { params: req.params || {}, query: req.query || {}, tenant: req.tenant || 'hanzo' };
    var fn = routes[route];
    if (!fn) return { status: 404, body: { error: 'unknown pricing route: ' + route } };
    try {
      var out = fn(ctx);
      if (out && out.__status) {
        var status = out.__status; delete out.__status;
        return { status: status, body: out };
      }
      return { status: 200, body: out };
    } catch (err) {
      return { status: 500, body: { error: String(err && err.message || err) } };
    }
  };
})();
