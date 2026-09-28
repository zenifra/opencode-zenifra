import assert from "node:assert/strict"
import { test } from "node:test"
import { parseCatalog, MODELS_URL } from "../src/catalog.js"
import { createPlugin } from "../src/index.js"

function catalog(overrides = {}) {
  return {
    data: [
      {
        id: "zenifra/test-model",
        context_length: 200000,
        max_output_tokens: 32000,
        capabilities: {
          function_calling: true,
          vision: true,
          reasoning: { supported: true, effort_levels: ["high", "max"] },
        },
        pricing: { unit: "per_million_tokens", input: 2, output: 8, cache_read_input: 0.5 },
        ...overrides,
      },
    ],
  }
}

function harness({ cache, failStorage = false, options = {} } = {}) {
  const state = { cache, reloads: 0, methods: [], warnings: [], cancelled: false }
  const ctx = {
    options,
    storage: {
      async get() {
        return state.cache
      },
      async set(key, value) {
        if (failStorage) throw new Error("disk unavailable")
        state.cache = value
      },
    },
    integration: {
      async transform(callback) {
        const integrations = new Map()
        callback({
          method: {
            update(value) {
              state.methods.push(value)
              integrations.set(value.integrationID, {})
            },
          },
          update(id, update) {
            assert.ok(integrations.has(id))
            update(integrations.get(id))
          },
        })
      },
    },
    provider: {
      async transform(callback) {
        state.transform = callback
        state.read = () =>
          callback({
            add(record) {
              state.record = record
            },
          })
        state.read()
      },
      async reload() {
        state.reloads++
        state.read()
      },
    },
  }
  return {
    ctx,
    state,
    deps: {
      schedule(callback, delay) {
        state.refresh = callback
        state.delay = delay
        return 1
      },
      cancel() {
        state.cancelled = true
      },
      logger: {
        warn(...args) {
          state.warnings.push(args)
        },
      },
    },
  }
}

test("preserves API ID, maps tools, vision, limits and reasoning without assuming USD", () => {
  const [model] = parseCatalog(catalog())
  assert.equal(model.id, "test-model")
  assert.equal(model.modelID, "zenifra/test-model")
  assert.deepEqual(model.capabilities, { tools: true, input: ["text", "image"], output: ["text"] })
  assert.deepEqual(model.limit, { context: 200000, output: 32000 })
  assert.deepEqual(model.variants[0], { id: "high", body: { reasoning_effort: "high" } })
  assert.deepEqual(model.cost, [])
})

test("imports explicitly confirmed USD base and context-tier prices", () => {
  const [base] = parseCatalog(catalog(), { pricingCurrency: "USD" })
  assert.deepEqual(base.cost, [{ input: 2, output: 8, cache: { read: 0.5, write: 0 } }])
  const [tiered] = parseCatalog(
    catalog({
      pricing: {
        unit: "per_million_tokens",
        context_tiers: [
          { min_input_tokens: 0, input: 1, output: 2 },
          { min_input_tokens: 256001, input: 3, output: 6 },
        ],
      },
    }),
    { pricingCurrency: "USD" },
  )
  assert.deepEqual(tiered.cost[1].tier, { type: "context", size: 256001 })
})

test("rejects empty, malformed and colliding inventories; excludes embedding-only models", () => {
  for (const input of [
    null,
    {},
    { data: [] },
    catalog({ context_length: -1 }),
    catalog({ id: "zenifra/" }),
    catalog({ input_modalities: "image" }),
  ]) {
    assert.throws(() => parseCatalog(input))
  }
  const data = catalog().data
  assert.throws(() => parseCatalog({ data: [...data, { ...data[0], id: "test-model" }] }))
  assert.equal(
    parseCatalog({ data: [...data, { id: "embedding", supported_operations: ["/v1/embeddings"] }] })
      .length,
    1,
  )
})

test("registers key/env authentication, fetches public endpoint, persists and refreshes", async () => {
  const h = harness()
  let payload = catalog()
  const cleanup = await createPlugin({
    ...h.deps,
    fetch: async (url, init) => {
      assert.equal(url, MODELS_URL)
      assert.equal(init.headers, undefined)
      return Response.json(payload)
    },
  }).setup(h.ctx)
  assert.deepEqual(
    h.state.methods.map((m) => m.method.type),
    ["key", "env"],
  )
  assert.deepEqual(h.state.methods[1].method.names, ["ZENIFRA_API_KEY"])
  assert.equal(h.state.record.info.integrationID, "zenifra")
  assert.equal(h.state.record.info.activation, "auto")
  assert.equal(h.state.record.models.length, 1)
  assert.equal(h.state.delay, 300000)
  await h.state.refresh()
  assert.equal(h.state.reloads, 1, "identical responses do not reload providers")
  payload = catalog({ id: "zenifra/new-model" })
  await h.state.refresh()
  assert.equal(h.state.record.models[0].id, "new-model")
  assert.deepEqual(h.state.cache, payload)
  cleanup()
  assert.equal(h.state.cancelled, true)
})

test("retains cached inventory across HTTP failures and malformed refreshes", async () => {
  const h = harness({ cache: catalog() })
  let response = new Response("unavailable", { status: 503 })
  const cleanup = await createPlugin({ ...h.deps, fetch: async () => response }).setup(h.ctx)
  assert.equal(h.state.record.models[0].id, "test-model")
  response = Response.json({ data: [] })
  await h.state.refresh()
  assert.equal(h.state.record.models[0].id, "test-model")
  assert.equal(h.state.warnings.length, 2)
  cleanup()
})

test("cache corruption and persistence failures do not prevent live discovery", async () => {
  const h = harness({ cache: { data: [] }, failStorage: true })
  const cleanup = await createPlugin({
    ...h.deps,
    fetch: async () => Response.json(catalog()),
  }).setup(h.ctx)
  assert.equal(h.state.record.models.length, 1)
  assert.equal(h.state.warnings.length, 2)
  cleanup()
})

test("does not overlap refreshes and aborts pending discovery on unload", async () => {
  const h = harness()
  let calls = 0
  let signal
  const cleanup = await createPlugin({
    ...h.deps,
    fetch: async (url, init) => {
      calls++
      if (calls === 1) return Response.json(catalog())
      signal = init.signal
      return new Promise((resolve, reject) =>
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }),
      )
    },
  }).setup(h.ctx)
  const pending = h.state.refresh()
  await h.state.refresh()
  assert.equal(calls, 2)
  cleanup()
  await pending
  assert.equal(signal.aborted, true)
  await h.state.refresh()
  assert.equal(calls, 2)
  assert.equal(h.state.warnings.length, 0)
})

test("timeouts recover using cached inventory", async () => {
  const h = harness({ cache: catalog(), options: { timeoutMs: 1000 } })
  const cleanup = await createPlugin({
    ...h.deps,
    fetch: (url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true })
      }),
  }).setup(h.ctx)
  assert.equal(h.state.record.models.length, 1)
  assert.equal(h.state.warnings.length, 1)
  cleanup()
})

test("validates refresh options before registering resources", async () => {
  for (const options of [
    { refreshIntervalMs: 0 },
    { timeoutMs: NaN },
    { pricingCurrency: "BRL" },
  ]) {
    const h = harness({ options })
    await assert.rejects(createPlugin(h.deps).setup(h.ctx))
    assert.equal(h.state.methods.length, 0)
  }
})

test("rejects malformed capabilities, variant IDs, blank modalities and whitespace IDs", () => {
  for (const overrides of [
    { id: " zenifra/model " },
    { capabilities: [] },
    { capabilities: { reasoning: true } },
    { capabilities: { reasoning: { effort_levels: ["high#invalid"] } } },
    { input_modalities: [] },
    { output_modalities: [] },
    { input_modalities: [" "] },
  ]) {
    assert.throws(() => parseCatalog(catalog(overrides)))
  }
})

test("does not mutate source data and normalizes catalog ordering", () => {
  const first = catalog({ id: "zenifra/z" }).data[0]
  const second = catalog({ id: "zenifra/a" }).data[0]
  const payload = { data: [first, second] }
  const original = structuredClone(payload)
  const normalized = parseCatalog(payload)
  assert.deepEqual(
    normalized.map((model) => model.id),
    ["a", "z"],
  )
  assert.deepEqual(payload, original)
  assert.deepEqual(normalized, parseCatalog({ data: [second, first] }))
})

test("rejects malformed or unordered USD pricing without silently showing incorrect costs", () => {
  const tier = { min_input_tokens: 0, input: 1, output: 2 }
  for (const pricing of [
    null,
    { unit: "per_million_tokens", input: -1, output: 1 },
    { unit: "per_million_tokens", input: 1, output: Infinity },
    { unit: "per_million_tokens", context_tiers: [null] },
    { unit: "per_million_tokens", context_tiers: [{ ...tier, min_input_tokens: 100 }] },
    {
      unit: "per_million_tokens",
      context_tiers: [tier, { ...tier, min_input_tokens: 100 }, { ...tier, min_input_tokens: 50 }],
    },
  ]) {
    assert.throws(() => parseCatalog(catalog({ pricing }), { pricingCurrency: "USD" }))
  }
})

test("recovers after startup without cache or network", async () => {
  const h = harness()
  let online = false
  const cleanup = await createPlugin({
    ...h.deps,
    fetch: async () => {
      if (!online) throw new Error("offline")
      return Response.json(catalog())
    },
  }).setup(h.ctx)
  assert.deepEqual(h.state.record.models, [])
  online = true
  await h.state.refresh()
  assert.equal(h.state.record.models[0].id, "test-model")
  cleanup()
})

test("continues discovery when reading cache fails", async () => {
  const h = harness()
  h.ctx.storage.get = async () => {
    throw new Error("cache unavailable")
  }
  const cleanup = await createPlugin({
    ...h.deps,
    fetch: async () => Response.json(catalog()),
  }).setup(h.ctx)
  assert.equal(h.state.record.models.length, 1)
  assert.equal(h.state.warnings.length, 1)
  cleanup()
})

test("retries after provider reload failure without replacing the last cached catalog", async () => {
  const h = harness({ cache: catalog() })
  const reload = h.ctx.provider.reload
  let failing = true
  h.ctx.provider.reload = async () => {
    if (failing) throw new Error("provider reload failed")
    await reload()
  }
  const cleanup = await createPlugin({
    ...h.deps,
    fetch: async () => Response.json(catalog({ id: "zenifra/new" })),
  }).setup(h.ctx)
  assert.equal(h.state.record.models[0].id, "test-model")
  assert.equal(h.state.cache.data[0].id, "zenifra/test-model")
  failing = false
  await h.state.refresh()
  assert.equal(h.state.record.models[0].id, "new")
  cleanup()
})

test("ignores late responses after plugin unload even if fetch ignores cancellation", async () => {
  const h = harness()
  let calls = 0
  let resolveResponse
  const cleanup = await createPlugin({
    ...h.deps,
    fetch: async () => {
      if (++calls === 1) return Response.json(catalog())
      return new Promise((resolve) => {
        resolveResponse = resolve
      })
    },
  }).setup(h.ctx)
  const pending = h.state.refresh()
  cleanup()
  resolveResponse(Response.json(catalog({ id: "zenifra/late" })))
  await pending
  assert.equal(h.state.record.models[0].id, "test-model")
  assert.equal(h.state.reloads, 1)
  assert.equal(h.state.cache.data[0].id, "zenifra/test-model")
})
