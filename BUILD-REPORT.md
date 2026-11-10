# BUILD REPORT — rentfeed

Rebuild of `com.housingfeed/rental-listings` v1.0.0 (remote-only)
as `@reneturcios/rentfeed` 0.1.0 / `io.github.CloudCorpRecords/rentfeed`.

## Fixture conflicts

**None.** The brief, the spec prose, and the fixture agree on all 5 tool
names and every required field. Required fields as served, taken from
the fixture (`harness/fixtures/housingfeed-tools-original.json`):

- `search_rentals_sample` — required: (none)
- `rent_summary` — required: `state`
- `feed_status` — required: (none)
- `search_my_feed` — required: (none)
- `feed_changes` — required: (none)

The fixture's tool literals (name, title, description, inputSchema —
including every property description, the `search_rentals_sample`
`sort` enum and the `feed_changes` `change` enum) are served verbatim
from `src/forward.ts`; this was verified by the registration-integrity
test (served tools/list deep-equals the fixture's 5 tool objects, in
order) and again by the parity harness. The capture carries a `title`
key on every tool — all five titles are served; a test asserts each
served tool carries exactly the keys `name`, `title`, `description`,
`inputSchema`. The `TOOL_DEFS` literals in `src/forward.ts` were
generated programmatically from the fixture JSON (parsed and
re-serialised) so nothing was retyped by hand.

## What was built

All 19 factory files under `builds/rentfeed/`:

- `package.json` (`@reneturcios/rentfeed` 0.1.0, bin
  `rentfeed` → `dist/cli.js`, deps exactly `@modelcontextprotocol/sdk ^1`
  + `zod ^3`; devDeps `@types/node ^20`, `tsx ^4`, `typescript ^5`)
- `server.json` (description exactly the prescribed 92-char string
  "US rental listings as JSON: free sample search and rent statistics, plus your licensed feed.";
  npm entry carries `"version": "0.1.0"`; OCI entry
  `ghcr.io/cloudcorprecords/rentfeed:0.1.0` carries **no** version field)
- `Dockerfile` (node:20-alpine both stages; server-name label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/rentfeed"`
  matches `server.json`)
- `tsconfig.json` (fleet-identical, 318 bytes), `.gitignore`,
  `package-lock.json`, `README.md` (fresh prose), `LICENSE` (MIT,
  Copyright (c) 2026 Rene Turcios), `CHANGELOG.md` (single 0.1.0 entry,
  2026-10-28)
- `src/index.ts`, `src/cli.ts`, `src/mcp.ts`, `src/types.ts`,
  `src/forward.ts` (core; exports `VERSION = "0.1.0"`)
- `test/forward.test.ts`
- `.github/workflows/{ci.yml, publish.yml, publish-container.yml,
  registry-publish.yml}` (container workflow: IMAGE
  `ghcr.io/cloudcorprecords/rentfeed`, smoke assertion on server name
  `rentfeed`)

Plus `BUILD-REPORT.md` (this file) and the `parity-out/` harness output.

## Design

- Forwarding client to `https://housingfeed.com/mcp` (pinned),
  overridable via `HOUSINGFEED_MCP_URL` (labelled reconstruction).
  tools/call is forwarded as a streamable-HTTP JSON-RPC client:
  initialize (protocolVersion `2025-03-26`, clientInfo `rentfeed`) →
  notifications/initialized → tools/call, honouring `Mcp-Session-Id`
  when issued; session established lazily and reused per client.
  Plain-JSON and SSE replies both parsed; the matching-id message
  wins; upstream results pass through verbatim (including `isError`
  and extra fields such as `structuredContent`).
- When `HOUSINGFEED_API_KEY` is set, an `Authorization: Bearer <value>`
  header is sent on every upstream request (header name and Bearer
  form pinned by the registry record's own header declaration;
  forwarding the key from this env var is a labelled reconstruction —
  the captures were keyless). When unset, no key header is sent. Both
  branches are covered by tests. The two keyless tools
  (`search_rentals_sample`, `rent_summary`) need no key; the three feed
  tools are gated upstream behind the caller's own key.
- Upstream failures (JSON-RPC error, non-2xx status, malformed body,
  throwing/timing-out fetch) surface as `rentfeed error:` text
  results (labelled reconstruction).
- Registration via the MCP SDK **low-level** `Server` API
  (`ListToolsRequestSchema` / `CallToolRequestSchema` handlers) serving
  the fixture literals exactly; no `McpServer` + zod registration.
  `src/mcp.ts` also exports `createServer` / `startMcpServer` /
  `handleCallTool` so the MCP layer is testable without a transport;
  the CLI's `mcp` subcommand starts it over stdio.
- Core takes an injectable fetch (`ForwardDeps.fetchFn`), so all tests
  run against a stubbed JSON-RPC upstream. No live network calls in
  tests; no live call claimed anywhere. The surface is US rental
  listing data only — no booking, application, messaging or payment
  tool exists in it; none was added.

## Lockfile (Route 3, clean from birth)

Generated in a temp dir (`/tmp/rentfeed-lock`) containing only the
new `package.json`: `npm install --package-lock-only --ignore-scripts
--offline`. Verified: parses, `name == @reneturcios/rentfeed`,
**128 package entries**; placed into the build dir with matching
sha256 (`e7babbbd…f9f3` on both sides: full value
`e7babbbdbcc6fdb710660b7d43a36d4f1acaea85d165451dfbb1b0990ddaf9f3`).
Then `npm install --ignore-scripts --offline` in the build dir for
`node_modules`. No write-guard failure occurred; `dist/` was built
in-tree normally.

## Verification (all in the build dir unless noted)

- `npx tsc --noEmit` → exit 0
- `npm run build` → real `dist/` (cli.js 2293 B, forward.js 17517 B,
  mcp.js 2668 B, all non-empty, with `.d.ts` + source maps)
- `node dist/cli.js --version` → `0.1.0`; unknown subcommand → usage on
  stderr, exit 2
- `npm test` → **45 tests, 45 pass, 0 fail** (8 suites: registration
  integrity — served tools deep-equal the fixture's full 5 tool
  objects in order, exact key sets per tool, titles, descriptions,
  required fields and every property key in order per tool; session
  establishment/reuse/session-id handling; env URL override and
  explicit url override; Authorization Bearer header present on every
  request when the key is set / absent when unset; verbatim argument
  forwarding for all 5 tools; verbatim result pass-through incl.
  upstream isError and SSE; JSON-RPC/init/malformed/HTTP/throw/timeout
  failures → `rentfeed error:`; parseRpcBody JSON + SSE + matching-id;
  MCP-layer validation with MethodNotFound / InvalidParams codes;
  CLI --version / -v / unknown exit 2 / bad-JSON exit 2)
- Parity: `python3 harness/parity.py --original
  harness/fixtures/housingfeed-tools-original.json --rebuild
  "stdio:node builds/rentfeed/dist/cli.js mcp" --out
  builds/rentfeed/parity-out` (run from `~/workspace/mcp-rebuild-100`)
  → **PASS, parity 100.0, 5/5 identical, no missing/extra/schema
  diffs** (see `parity-out/parity.json`)
- Consistency sweep: package.json version = server.json top-level =
  npm-entry version = OCI tag = core `VERSION` = CHANGELOG heading
  (0.1.0); package.json `mcpName` = server.json `name` = Dockerfile
  label; server.json description measured at 92 chars; OCI entry
  confirmed to have no `version` field.

Clean-room: all prose and code written fresh for rentfeed; only the
mechanics were patterned on the sibling jpverify build, and only the
fixture's tool literals are served verbatim.
