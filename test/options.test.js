import assert from "node:assert/strict"
import { test } from "node:test"
import { parseOptions } from "../src/options.js"

test("options use documented defaults and cannot be mutated", () => {
  const options = parseOptions()
  assert.deepEqual(options, {
    refreshIntervalMs: 300000,
    timeoutMs: 15000,
    pricingCurrency: undefined,
  })
  assert.equal(Object.isFrozen(options), true)
})

test("accepts timer boundaries and USD opt-in", () => {
  assert.deepEqual(
    parseOptions({ refreshIntervalMs: 1000, timeoutMs: 2147483647, pricingCurrency: "USD" }),
    {
      refreshIntervalMs: 1000,
      timeoutMs: 2147483647,
      pricingCurrency: "USD",
    },
  )
})

test("rejects invalid options containers and unknown keys", () => {
  for (const input of [null, [], "options", 42, { refreshInterval: 1000 }]) {
    assert.throws(() => parseOptions(input), TypeError)
  }
})

test("rejects out-of-range, fractional and non-numeric durations", () => {
  for (const value of [null, 0, 999, 1000.5, 2147483648, Infinity, NaN, "15000"]) {
    assert.throws(() => parseOptions({ timeoutMs: value }), TypeError)
    assert.throws(() => parseOptions({ refreshIntervalMs: value }), TypeError)
  }
})
