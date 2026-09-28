import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import plugin from "../src/index.js"

test("Git consumers can load the entrypoint without lifecycle preparation", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
  for (const lifecycle of ["prepare", "prepack", "install", "postinstall"]) {
    assert.equal(
      manifest.scripts?.[lifecycle],
      undefined,
      `${lifecycle} triggers Git dependency preparation`,
    )
  }
  assert.equal(manifest.exports, "./src/index.js")
  assert.equal(plugin.id, "zenifra.models")
  assert.equal(typeof plugin.setup, "function")
  assert.deepEqual(manifest.dependencies ?? {}, {})
})
