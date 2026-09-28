import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout } from "node:timers/promises"

// Exercise the installed executable with a fresh HOME, database and service port.
const parent = join(tmpdir(), "opencode")
mkdirSync(parent, { recursive: true })
const root = mkdtempSync(join(parent, "zenifra-github-e2e-"))
const home = join(root, "home")
const project = join(root, "project")
mkdirSync(home)
mkdirSync(project)
const spec = process.env.OPENCODE_TEST_PLUGIN ?? "github:zenifra/opencode-zenifra"
assert.match(spec, /^github:zenifra\/opencode-zenifra(?:#[\w./-]+)?$/)
const env = {
  PATH: process.env.PATH,
  HOME: home,
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_DATA_HOME: join(home, ".local/share"),
  XDG_STATE_HOME: join(home, ".local/state"),
  XDG_CACHE_HOME: join(home, ".cache"),
  TERM: "xterm-256color",
}
const commands = []
let server
let serverExited
let serverLog = ""
let failure
let summary

async function cli(args, expectedStatus = 0) {
  const child = spawn("opencode", args, { env, cwd: project, stdio: ["ignore", "pipe", "pipe"] })
  let stdout = ""
  let stderr = ""
  const timer = globalThis.setTimeout(() => child.kill("SIGKILL"), 180_000)
  child.stdout.on("data", (chunk) => {
    stdout += chunk
  })
  child.stderr.on("data", (chunk) => {
    stderr += chunk
  })
  let status
  try {
    status = await new Promise((resolve, reject) => {
      child.once("error", reject)
      child.once("close", resolve)
    })
  } finally {
    clearTimeout(timer)
  }
  const result = { args, status, stdout, stderr }
  commands.push(result)
  if (expectedStatus !== null)
    assert.equal(status, expectedStatus, `${args.join(" ")}: ${stderr || stdout}`)
  return result
}

async function eventually(read, predicate) {
  const deadline = Date.now() + 120_000
  let last
  while (Date.now() < deadline) {
    last = await read()
    if (predicate(last)) return last
    await setTimeout(500)
  }
  assert.fail(`OpenCode did not settle: ${JSON.stringify(last)}`)
}

async function api(path) {
  const result = await cli(["api", "get", path], null)
  return result.status === 0 ? JSON.parse(result.stdout).data : null
}

const configPath = join(env.XDG_CONFIG_HOME, "opencode", "opencode.json")
const config = () => JSON.parse(readFileSync(configPath, "utf8"))

try {
  assert.match((await cli(["--version"])).stdout, /v2\./)
  assert.ok((await cli(["debug", "paths", "db"])).stdout.trim().startsWith(root))
  const reservation = createServer()
  await new Promise((resolve, reject) => {
    reservation.once("error", reject)
    reservation.listen(0, "127.0.0.1", resolve)
  })
  const port = reservation.address().port
  await new Promise((resolve) => reservation.close(resolve))
  await cli(["service", "set", "port", String(port)])
  await cli(["plugin", "add", spec])
  assert.deepEqual(config().plugins, [spec])

  // Own and reap the service process, including in containers whose PID 1 does not reap children.
  server = spawn("opencode", ["serve", "--service"], {
    env,
    cwd: home,
    stdio: ["ignore", "pipe", "pipe"],
  })
  server.stdout.on("data", (chunk) => {
    serverLog += chunk
  })
  server.stderr.on("data", (chunk) => {
    serverLog += chunk
  })
  serverExited = new Promise((resolve) => server.once("close", resolve))
  server.on("error", (error) => {
    serverLog += error.message
  })
  await eventually(async () => {
    if (server.exitCode !== null) assert.fail(`Service exited: ${serverLog}`)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/info`, {
        signal: AbortSignal.timeout(3000),
      })
      return response.status === 200 || response.status === 401
    } catch {
      return false
    }
  }, Boolean)
  await eventually(
    async () => (await cli(["plugin", "list"])).stdout,
    (text) => text.includes("zenifra.models"),
  )
  const integration = await eventually(
    () => api("/api/integration/zenifra"),
    (value) => value?.id === "zenifra",
  )
  assert.deepEqual(integration.connections, [])
  assert.ok(integration.methods.some((method) => method.type === "key"))
  assert.ok(
    integration.methods.some(
      (method) => method.type === "env" && method.names.includes("ZENIFRA_API_KEY"),
    ),
  )
  assert.equal(
    (await api("/api/model")).filter((model) => model.providerID === "zenifra").length,
    0,
  )

  // Public discovery needs no real key. This marker must never authorize inference.
  await cli([
    "api",
    "post",
    "/api/integration/zenifra/connect/key",
    "--data",
    JSON.stringify({ key: "zenifra-e2e-intentionally-invalid", label: "isolated-e2e" }),
  ])
  const source = await fetch("https://ai.zenifra.com/v1/models", {
    signal: AbortSignal.timeout(15000),
  })
  assert.equal(source.status, 200)
  const expected = (await source.json()).data.filter(
    (item) =>
      !item.supported_operations || item.supported_operations.includes("/v1/chat/completions"),
  )
  const models = await eventually(
    async () => (await api("/api/model"))?.filter((model) => model.providerID === "zenifra"),
    (value) => value?.length === expected.length,
  )
  assert.deepEqual(
    models.map((model) => model.modelID).sort(),
    expected.map((model) => model.id).sort(),
  )
  for (const item of expected) {
    const model = models.find((entry) => entry.modelID === item.id)
    assert.equal(model.limit.context, item.context_length)
    assert.equal(model.limit.output, item.max_output_tokens)
    assert.equal(model.capabilities.tools, item.capabilities.function_calling === true)
  }

  const configuredPlugin = {
    package: spec,
    options: { refreshIntervalMs: 600000, timeoutMs: 20000 },
  }
  writeFileSync(
    configPath,
    JSON.stringify(
      { ...config(), plugins: [configuredPlugin], model: `zenifra/${models[0].id}` },
      null,
      2,
    ),
  )
  await cli(["reload"])
  await eventually(
    () => api("/api/model/default"),
    (model) => model?.providerID === "zenifra" && model?.id === models[0].id,
  )

  await cli(["plugin", "check"])
  await cli(["plugin", "update", spec])
  assert.deepEqual(config().plugins, [configuredPlugin], "update must preserve plugin options")
  await eventually(
    async () => (await cli(["plugin", "list"])).stdout,
    (text) => text.includes("zenifra.models"),
  )
  await cli(["plugin", "remove", spec])
  assert.equal(
    (config().plugins ?? []).some(
      (entry) => (typeof entry === "string" ? entry : entry.package) === spec,
    ),
    false,
  )
  await eventually(
    async () => (await cli(["plugin", "list"])).stdout,
    (text) => !text.includes("zenifra.models"),
  )
  await cli(["service", "set", "env", "ZENIFRA_API_KEY", "zenifra-e2e-env-marker"])
  assert.equal(
    (await cli(["service", "get", "env", "ZENIFRA_API_KEY"])).stdout.trim(),
    "zenifra-e2e-env-marker",
  )
  await cli(["service", "unset", "env", "ZENIFRA_API_KEY"])
  assert.deepEqual(JSON.parse((await cli(["service", "get", "env"])).stdout), {})
  summary = { status: "passed", spec, models: expected.length, evidence: root }
} catch (error) {
  failure = error
} finally {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM")
    const force = globalThis.setTimeout(() => server.kill("SIGKILL"), 15000)
    await serverExited
    clearTimeout(force)
  }
  writeFileSync(join(root, "commands.json"), JSON.stringify(commands, null, 2))
  writeFileSync(join(root, "server.log"), serverLog)
  console.log(
    JSON.stringify(summary ?? { status: "failed", evidence: root, error: failure?.message }),
  )
}
if (failure) throw failure
