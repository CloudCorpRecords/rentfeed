# Changelog

## 0.1.0 (2026-10-28)

- First release: a forwarding client for the hosted HousingFeed MCP server, serving all 5 captured tools locally for tools/list and forwarding every tools/call upstream over a streamable-HTTP JSON-RPC session (initialize, notifications/initialized, tools/call, honouring the Mcp-Session-Id header when issued).
- Tools: `search_rentals_sample`, `rent_summary`, `feed_status`, `search_my_feed`, `feed_changes`. The two keyless tools cover a free sample search of live US rental listings and rent statistics for one city or ZIP; the three feed tools read the caller's own licensed feed and need the caller's HousingFeed key.
- Upstream results pass through verbatim; upstream failures surface as `rentfeed error:` text results.
- One bin serves the CLI (one subcommand per tool, plus `--version`) and the stdio MCP server (`mcp` subcommand). Upstream endpoint overridable via `HOUSINGFEED_MCP_URL`; when `HOUSINGFEED_API_KEY` is set it is sent as an `Authorization: Bearer <value>` header on every upstream request.
