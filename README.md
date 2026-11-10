# rentfeed

rentfeed is a small local bridge to the hosted
HousingFeed MCP server, which publishes US rental
listings as structured data. Two of its tools need no
key at all: a sample search returns up to ten live
listings for an area and budget, and a summary tool
reports listing counts with median and percentile
asking rents for one city or ZIP. The remaining three
tools work over the feed you license from HousingFeed:
its current status, a searchable view of its listings,
and the changes in its latest weekly update.

The bridge stores no listings of its own. It serves
the upstream server's tool list locally, exactly as
captured from the live endpoint, and forwards each
tool call upstream, returning the result untouched.
There is no booking, application, messaging or
payment tool in the surface; it is listing data only.

## Tools

- `search_rentals_sample` — free sample search of live
  US rental listings for an area and budget, at most
  10 per call. Optional: `state`, `city`, `min_rent`,
  `max_rent`, `min_beds`, `max_beds`, a map box
  (`min_lat`, `max_lat`, `min_lng`, `max_lng`),
  `new_since_days` and `sort` (`best`, `newest`,
  `cheapest`, `rent_desc`).
- `rent_summary` — rent statistics for one US city or
  ZIP: listing count and the median, 25th and 75th
  percentile asking rent, overall and by bedroom
  count. Required: `state`. Optional: `city`, `zip`,
  `beds` (0 = studio, 4 = four or more) and
  `include_rooms`.
- `feed_status` — status of your licensed feed:
  listing count, when it was published, when the next
  weekly update is due, and how many listings were
  added, changed and removed. Needs a HousingFeed key.
- `search_my_feed` — search the listings in your
  licensed feed by city, ZIP, rent, bedrooms or map
  box, up to 50 per call with paging via `offset`.
  Optional: `state`, `city`, `zip`, `min_rent`,
  `max_rent`, `min_beds`, `max_beds`, map box,
  `limit`, `offset` and `full`. Needs a key.
- `feed_changes` — listings added, changed or removed
  in the latest weekly update of your feed. Optional:
  `change` (`added`, `changed`, `removed`), `since`,
  `limit` (default 20) and `offset`. Needs a key.

## Configuration

- `HOUSINGFEED_MCP_URL` (optional) — override the
  upstream endpoint. Defaults to
  `https://housingfeed.com/mcp`. (The override hook is
  this rebuild's own labelled reconstruction.)
- `HOUSINGFEED_API_KEY` (optional) — when set, every
  upstream request carries an
  `Authorization: Bearer <key>` header with your own
  HousingFeed key, which unlocks the three feed tools
  for your licensed market. When it is not set, no key
  header is sent and only the keyless tools can
  succeed. (The header name and Bearer form are pinned
  by the original's registry record; forwarding the
  key from this env var is a labelled reconstruction —
  the original surface was captured keyless.)

### Forwarding mechanics

On the first tool call the client opens a streamable
HTTP session with the upstream: a JSON-RPC
`initialize` request (protocolVersion `2025-03-26`,
clientInfo name `rentfeed`), then a
`notifications/initialized` notification, then the
`tools/call` request carrying the caller's arguments
unchanged. When the upstream answers `initialize`
with an `Mcp-Session-Id` header, that value rides on
every later request of the session, which is reused
for the life of the process. Replies may arrive as
plain JSON or as server-sent events; both are read.

Successful upstream results pass through verbatim,
including any `isError` flag the upstream sets.
Failures — a JSON-RPC error, a non-2xx status, an
unreadable response, or a request that cannot be
completed — come back as an `isError` result whose
text starts with `rentfeed error:` (this rendering is
this rebuild's own labelled reconstruction).

## CLI

Each tool is also a subcommand taking one JSON
argument string:

```bash
npx @reneturcios/rentfeed search_rentals_sample '{"state":"NY","city":"Brooklyn","max_rent":3000}'
npx @reneturcios/rentfeed rent_summary '{"state":"TX","city":"Austin"}'
npx @reneturcios/rentfeed feed_status '{}'
npx @reneturcios/rentfeed --version
```

Exit codes: `0` on success, `1` on an `isError`
result, `2` on a usage error.

## MCP server

```bash
npx -y @reneturcios/rentfeed mcp
```

MCP client config:

```json
{
  "mcpServers": {
    "rentfeed": {
      "command": "npx",
      "args": ["-y", "@reneturcios/rentfeed", "mcp"]
    }
  }
}
```

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/rentfeed
docker run --rm ghcr.io/cloudcorprecords/rentfeed --version
```

The container's default command is `mcp`, so the first
form is a stdio MCP server; any other arguments reach
the CLI normally.

## Development

```bash
npm install
npm run build
npm test
npm run dev
```

The test suite runs entirely against a stubbed
JSON-RPC upstream — no live network calls.

## License

MIT — see `LICENSE`.
