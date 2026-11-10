/**
 * rentfeed core: a forwarding client for the hosted
 * HousingFeed MCP server.
 *
 * Nothing is stored locally. tools/list is answered
 * from the literal tool definitions below, taken verbatim
 * from a live capture of the upstream server (name, title,
 * description and inputSchema exactly as captured). A
 * tools/call is forwarded over a streamable-HTTP JSON-RPC
 * session: an initialize POST, a notifications/initialized
 * POST, then the tools/call POST, honouring the
 * Mcp-Session-Id response header when the upstream issues
 * one. The session is established lazily on the first
 * forwarded call and reused for the lifetime of the client.
 *
 * The upstream endpoint is pinned to
 * https://housingfeed.com/mcp and can be overridden with
 * the HOUSINGFEED_MCP_URL environment variable (that
 * override is a labelled reconstruction). When
 * HOUSINGFEED_API_KEY is set in the environment, every
 * upstream request carries an
 * `Authorization: Bearer <key>` header (the Authorization
 * header name and Bearer form are pinned by the registry
 * record's own header declaration; forwarding the key from
 * this env var is a labelled reconstruction — the capture
 * itself was taken keyless). When the variable is unset,
 * no key header is sent.
 *
 * Upstream results pass through verbatim, including any
 * isError flag and any extra result fields. Failures — a
 * JSON-RPC error from the upstream, a non-2xx status, an
 * unparseable response, or a fetch that throws or times
 * out — surface as an isError result whose text starts
 * with `rentfeed error:` (that rendering is a labelled
 * reconstruction). Responses may be plain JSON or SSE
 * (data: lines); the JSON-RPC message with the matching
 * id wins.
 */
import type {
  FetchFn,
  FetchResponseLike,
  ForwardDeps,
  ToolArgs,
  ToolDef,
  ToolResult,
} from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_ENDPOINT_URL = "https://housingfeed.com/mcp";

export const DEFAULT_TIMEOUT_MS = 30000;

export const PROTOCOL_VERSION = "2025-03-26";

/* ------------------------------------------------------------------ */
/* Tool definitions (tools/list literals, verbatim from the live       */
/* capture in harness/fixtures/housingfeed-tools-original.json)       */
/* ------------------------------------------------------------------ */

export const TOOL_DEFS: ToolDef[] = [
  {
    "name": "search_rentals_sample",
    "title": "Search US rental listings (free sample)",
    "description": "Live US rental listings for an area and budget, no key needed. Returns at most 10 listings per call (rent, beds, baths, size, address, coordinates, photo, source link, days listed). Use a state code and a city for one market; add rent and bedroom limits to narrow it. For complete results a HousingFeed key is needed.",
    "inputSchema": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "state": {
          "type": "string",
          "description": "Two-letter US state code, e.g. NY."
        },
        "city": {
          "type": "string",
          "description": "City name, partial match, e.g. Brooklyn."
        },
        "min_rent": {
          "type": "number",
          "description": "Minimum monthly rent in USD."
        },
        "max_rent": {
          "type": "number",
          "description": "Maximum monthly rent in USD."
        },
        "min_beds": {
          "type": "number",
          "description": "Minimum bedrooms; 0 = studio."
        },
        "max_beds": {
          "type": "number",
          "description": "Maximum bedrooms. Same as min_beds for exactly N."
        },
        "min_lat": {
          "type": "number",
          "description": "South edge of a map box."
        },
        "max_lat": {
          "type": "number",
          "description": "North edge of a map box."
        },
        "min_lng": {
          "type": "number",
          "description": "West edge of a map box."
        },
        "max_lng": {
          "type": "number",
          "description": "East edge of a map box."
        },
        "new_since_days": {
          "type": "number",
          "description": "Only listings first seen in the last N days (new listings land weekly, Sunday to Tuesday UTC)."
        },
        "sort": {
          "type": "string",
          "enum": [
            "best",
            "newest",
            "cheapest",
            "rent_desc"
          ],
          "description": "best (default): photo and coordinates first, freshest, mixed sources."
        }
      }
    }
  },
  {
    "name": "rent_summary",
    "title": "US rent statistics for a city or ZIP",
    "description": "What rent costs right now in one US city or ZIP, no key needed: number of listings and the median, 25th and 75th percentile monthly asking rent, overall and by bedroom count (studio, 1, 2, 3, 4+). Based on listings verified at the source in the last 30 days. Give a state and a city or a ZIP.",
    "inputSchema": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "state"
      ],
      "properties": {
        "state": {
          "type": "string",
          "description": "Two-letter US state code, e.g. TX."
        },
        "city": {
          "type": "string",
          "description": "Full city name, e.g. Austin or New York (New York includes its five boroughs). Not a partial match."
        },
        "zip": {
          "type": "string",
          "description": "Exact 5-digit ZIP code; use instead of or with city."
        },
        "beds": {
          "type": "integer",
          "minimum": 0,
          "maximum": 4,
          "description": "Only this bedroom count: 0 = studio, 4 = four or more."
        },
        "include_rooms": {
          "type": "boolean",
          "description": "true = include rooms in shared homes (excluded by default)."
        }
      }
    }
  },
  {
    "name": "feed_status",
    "title": "My feed: status",
    "description": "Requires a HousingFeed key. The current version of your licensed feed: listing count, when it was published, when the next weekly update is due, and how many listings were added, changed and removed.",
    "inputSchema": {
      "type": "object",
      "additionalProperties": false,
      "properties": {}
    }
  },
  {
    "name": "search_my_feed",
    "title": "My feed: search listings",
    "description": "Requires a HousingFeed key. Search the listings in your licensed feed by city, ZIP, rent, bedrooms or map box. Returns up to 50 per call with a total; page with offset.",
    "inputSchema": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "state": {
          "type": "string",
          "description": "Two-letter US state code."
        },
        "city": {
          "type": "string",
          "description": "City name, partial match."
        },
        "zip": {
          "type": "string",
          "description": "Exact ZIP code."
        },
        "min_rent": {
          "type": "number",
          "description": "Minimum monthly rent in USD."
        },
        "max_rent": {
          "type": "number",
          "description": "Maximum monthly rent in USD."
        },
        "min_beds": {
          "type": "number",
          "description": "Minimum bedrooms; 0 = studio."
        },
        "max_beds": {
          "type": "number",
          "description": "Maximum bedrooms. Same as min_beds for exactly N."
        },
        "min_lat": {
          "type": "number",
          "description": "South edge of a map box."
        },
        "max_lat": {
          "type": "number",
          "description": "North edge of a map box."
        },
        "min_lng": {
          "type": "number",
          "description": "West edge of a map box."
        },
        "max_lng": {
          "type": "number",
          "description": "East edge of a map box."
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 50,
          "description": "Listings to return (default 10)."
        },
        "offset": {
          "type": "integer",
          "minimum": 0,
          "description": "Skip this many matches (for paging)."
        },
        "full": {
          "type": "boolean",
          "description": "true = every field of each listing, including description and photos."
        }
      }
    }
  },
  {
    "name": "feed_changes",
    "title": "My feed: this week's changes",
    "description": "Requires a HousingFeed key. Listings added, changed or removed in the latest weekly update of your feed.",
    "inputSchema": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "change": {
          "type": "string",
          "enum": [
            "added",
            "changed",
            "removed"
          ],
          "description": "Only this kind of change."
        },
        "since": {
          "type": "string",
          "description": "Changes since this earlier version (one of feed_status's changes_from) instead of since the previous week; for a client that missed a week."
        },
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 50,
          "description": "Changes to return (default 20)."
        },
        "offset": {
          "type": "integer",
          "minimum": 0,
          "description": "Skip this many changes (for paging)."
        }
      }
    }
  }
];

export const TOOL_NAMES = TOOL_DEFS.map((t) => t.name);

/** Whether `name` is one of the captured tools. */
export function isKnownTool(name: string): boolean {
  return TOOL_NAMES.includes(name);
}

/* ------------------------------------------------------------------ */
/* Forwarding client                                                   */
/* ------------------------------------------------------------------ */

function errorResult(detail: string): ToolResult {
  return {
    content: [{ type: "text", text: `rentfeed error: ${detail}` }],
    isError: true,
  };
}

function rpcErrorMessage(error: unknown): string {
  if (error !== null && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message !== "") return message;
    return JSON.stringify(error);
  }
  return String(error);
}

/**
 * Parse a JSON-RPC response body, tolerating SSE framing.
 * Returns the message whose id matches `expectedId` when
 * one is present, else the last parseable message, else
 * null when nothing parses.
 */
export function parseRpcBody(
  text: string,
  expectedId?: number,
): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const candidates: Record<string, unknown>[] = [];
  const tryPush = (payload: string): void => {
    try {
      const parsed: unknown = JSON.parse(payload);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        candidates.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Not JSON; ignore this candidate.
    }
  };
  if (trimmed.includes("data:")) {
    for (const line of trimmed.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice("data:".length).trim();
      if (payload !== "" && payload !== "[DONE]") tryPush(payload);
    }
  } else {
    tryPush(trimmed);
  }
  if (candidates.length === 0) return null;
  if (expectedId !== undefined) {
    const match = candidates.find((c) => c.id === expectedId);
    if (match !== undefined) return match;
  }
  return candidates[candidates.length - 1];
}

async function defaultFetch(
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
): Promise<FetchResponseLike> {
  return fetch(url, init) as unknown as FetchResponseLike;
}

/**
 * A forwarding client holding one upstream session. The
 * session is established lazily on the first forwarded
 * call and reused for the lifetime of the client (the
 * process lifetime when the client is the MCP server's
 * or a one-shot client for the CLI).
 */
export class RentfeedClient {
  private readonly deps: ForwardDeps;
  private sessionId: string | null = null;
  private ready = false;
  private sessionPromise: Promise<void> | null = null;
  private idCounter = 0;

  constructor(deps: ForwardDeps = {}) {
    this.deps = deps;
  }

  private fetchFn(): FetchFn {
    return this.deps.fetchFn ?? defaultFetch;
  }

  private endpointUrl(): string {
    if (this.deps.url && this.deps.url.trim() !== "") return this.deps.url.trim();
    const raw = (this.deps.env ?? process.env).HOUSINGFEED_MCP_URL;
    if (raw && raw.trim() !== "") return raw.trim();
    return DEFAULT_ENDPOINT_URL;
  }

  private apiKey(): string | null {
    const raw = (this.deps.env ?? process.env).HOUSINGFEED_API_KEY;
    if (raw && raw.trim() !== "") return raw.trim();
    return null;
  }

  private timeoutMs(): number {
    if (typeof this.deps.timeoutMs === "number" && this.deps.timeoutMs > 0) {
      return this.deps.timeoutMs;
    }
    return DEFAULT_TIMEOUT_MS;
  }

  private nextId(): number {
    this.idCounter += 1;
    return this.idCounter;
  }

  private async post(
    body: unknown,
    withSession: boolean,
  ): Promise<FetchResponseLike> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    const key = this.apiKey();
    if (key !== null) headers["Authorization"] = `Bearer ${key}`;
    if (withSession && this.sessionId !== null) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      return await this.fetchFn()(this.endpointUrl(), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async ensureSession(): Promise<void> {
    if (this.ready) return;
    if (this.sessionPromise === null) {
      this.sessionPromise = (async () => {
        const initId = this.nextId();
        const initRes = await this.post(
          {
            jsonrpc: "2.0",
            id: initId,
            method: "initialize",
            params: {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: {},
              clientInfo: { name: "rentfeed", version: VERSION },
            },
          },
          false,
        );
        const sessionId = initRes.headers.get("mcp-session-id");
        if (sessionId) this.sessionId = sessionId;
        const initText = await initRes.text();
        const initParsed = parseRpcBody(initText, initId);
        if (initParsed !== null && initParsed.error) {
          throw new Error(rpcErrorMessage(initParsed.error));
        }
        if (initRes.status < 200 || initRes.status >= 300) {
          throw new Error(`HTTP ${initRes.status}`);
        }
        if (initParsed === null && initText.trim() !== "") {
          throw new Error("malformed response");
        }
        const initializedRes = await this.post(
          { jsonrpc: "2.0", method: "notifications/initialized" },
          true,
        );
        try {
          await initializedRes.text();
        } catch {
          // The notification response body carries nothing we need.
        }
        this.ready = true;
      })();
    }
    try {
      await this.sessionPromise;
    } catch (err) {
      this.sessionPromise = null;
      this.sessionId = null;
      throw err;
    }
  }

  /** Forward one tool call; upstream failures come back as isError results. */
  async callTool(name: string, args: ToolArgs): Promise<ToolResult> {
    try {
      await this.ensureSession();
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }

    const callId = this.nextId();
    let callRes: FetchResponseLike;
    try {
      callRes = await this.post(
        {
          jsonrpc: "2.0",
          id: callId,
          method: "tools/call",
          params: { name, arguments: args ?? {} },
        },
        true,
      );
    } catch (err) {
      return errorResult(
        `request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const parsed = parseRpcBody(await callRes.text(), callId);
    if (parsed !== null && parsed.error) {
      return errorResult(rpcErrorMessage(parsed.error));
    }
    if (callRes.status < 200 || callRes.status >= 300) {
      return errorResult(`HTTP ${callRes.status}`);
    }
    if (parsed === null) return errorResult("malformed response");
    const result = parsed.result as ToolResult | undefined;
    if (result === undefined || result === null || typeof result !== "object") {
      return errorResult("malformed response");
    }
    // Pass the upstream result through verbatim.
    return result;
  }
}

/** Create a forwarding client; tests inject a fake fetch and env through deps. */
export function createClient(deps: ForwardDeps = {}): RentfeedClient {
  return new RentfeedClient(deps);
}

/** One-shot helper: a fresh client per call (the CLI path). */
export async function callTool(
  name: string,
  args: ToolArgs,
  deps: ForwardDeps = {},
): Promise<ToolResult> {
  return new RentfeedClient(deps).callTool(name, args);
}
