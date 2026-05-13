import "dotenv/config";
import cors from "cors";
import express from "express";
import { normalizeHostname, normalizePath } from "../src/lib/routing/hostname";
import { resolveRedirect } from "../src/lib/routing/resolver";
import { recordRedirectEvent } from "../src/lib/analytics/record";
import { countdownHtml } from "./countdown-template";
import { getCustomComponents } from "./custom-components";

function log(level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console[level](JSON.stringify({ timestamp, level, service: "redirect-engine", message, ...meta }));
}

function errorResponse(response: express.Response, status: number, error: string, details?: string) {
  log("warn", "request_error", { status, error, details });
  response.status(status).json({ error, details });
}

const app = express();
const port = Number(process.env.REDIRECT_ENGINE_PORT ?? 4000);
const REDIRECT_DELAY_SECONDS = Number(process.env.REDIRECT_DELAY_SECONDS ?? 5);
const DEFAULT_HOME_URL = process.env.DEFAULT_HOME_URL ?? "http://localhost:3000";

function renderCountdownPage(
  destinationUrl: string,
  homeUrl: string,
  title: string = "You are being redirected",
  message: string = "Please wait while we take you to your destination.",
): string {
  const customComponents = getCustomComponents();
  return countdownHtml
    .replace(/\{\{destinationUrl\}\}/g, destinationUrl)
    .replace(/\{\{homeUrl\}\}/g, homeUrl)
    .replace(/\{\{title\}\}/g, title)
    .replace(/\{\{message\}\}/g, message)
    .replace(/\{\{countdown\}\}/g, String(REDIRECT_DELAY_SECONDS))
    .replace(/<div class="custom-components" id="custom-components">/, `<div class="custom-components" id="custom-components">${customComponents}`);
}

app.disable("x-powered-by");
app.use(cors());

process.on("uncaughtException", (error) => {
  log("error", "uncaught_exception", { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  log("error", "unhandled_rejection", { reason: String(reason) });
});

app.get("/health", (_request, response) => {
  response.json({ ok: true, service: "redirect-engine" });
});

app.get("/logs", (_request, response) => {
  response.json({ message: "Check console for structured JSON logs" });
});

async function handleRedirect(
  input: {
    host: string;
    path: string;
    originalUrl: string;
    referer: string | null;
    userAgent: string | null;
    ip: string | null;
  },
  response: express.Response,
) {
  const startedAt = performance.now();
  const host = input.host;

  if (!host) {
    return errorResponse(response, 400, "Host header is required", "Missing Host header in request");
  }

  const hostname = normalizeHostname(host);
  const pathname = normalizePath(input.path);
  const queryString = input.originalUrl.includes("?")
    ? input.originalUrl.slice(input.originalUrl.indexOf("?") + 1)
    : "";

  log("info", "incoming_request", {
    hostname,
    path: pathname,
    query: queryString,
    referer: input.referer,
    userAgent: input.userAgent?.slice(0, 100),
    ip: input.ip,
  });

  try {
    const resolved = await resolveRedirect({
      host,
      pathname,
      queryString,
    });

    if (!resolved) {
      return errorResponse(response, 404, "Domain is not connected", `No domain found for ${hostname}`);
    }

    void recordRedirectEvent({
      resolved,
      hostname,
      path: pathname,
      referer: input.referer,
      userAgent: input.userAgent,
      ip: input.ip,
    }).catch((error) => {
      log("error", "analytics_write_failed", { error: String(error) });
    });

    const resolveDuration = (performance.now() - startedAt).toFixed(1);
    response.setHeader("Server-Timing", `resolve;dur=${resolveDuration}`);

    if (!resolved.destinationUrl) {
      log("warn", "no_route_matched", {
        hostname,
        path: pathname,
        matchReason: resolved.matchReason,
      });
      return errorResponse(response, 404, "No redirect route matched", `Matched: ${resolved.matchReason}`);
    }

    log("info", "redirect_sent", {
      from: `${hostname}${pathname}`,
      to: resolved.destinationUrl,
      statusCode: 200,
      duration: resolveDuration,
    });

    const homeUrl = DEFAULT_HOME_URL;
    const pageTitle = process.env.REDIRECT_PAGE_TITLE || "You are being redirected";
    const pageMessage = process.env.REDIRECT_PAGE_MESSAGE || "Please wait while we take you to your destination.";

    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("X-Redirect-Destination", resolved.destinationUrl);
    response.setHeader("X-Redirect-Delay-Seconds", String(REDIRECT_DELAY_SECONDS));
    response.status(200).send(
      renderCountdownPage(resolved.destinationUrl, homeUrl, pageTitle, pageMessage)
    );
  } catch (error) {
    log("error", "redirect_resolution_failed", {
      hostname,
      path: pathname,
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return errorResponse(response, 500, "Redirect resolution failed", "Internal server error");
  }
}

app.get("/__test", async (request, response) => {
  const host = String(request.query.host ?? "");
  const path = String(request.query.path ?? "/");

  log("info", "test_request", { host, path });

  await handleRedirect(
    {
      host,
      path,
      originalUrl: path,
      referer: request.get("referer") ?? null,
      userAgent: request.get("user-agent") ?? null,
      ip: request.ip ?? null,
    },
    response,
  );
});

app.use(async (request, response) => {
  await handleRedirect(
    {
      host: request.headers.host ?? "",
      path: request.path,
      originalUrl: request.url,
      referer: request.get("referer") ?? null,
      userAgent: request.get("user-agent") ?? null,
      ip: request.ip ?? null,
    },
    response,
  );
});

app.listen(port, () => {
  log("info", "server_started", { port, message: `Redirect engine listening on http://localhost:${port}` });
});
