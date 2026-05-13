"use client";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Copy,
  Pencil,
  Globe2,
  Save,
  Trash2,
  X,
  Network,
  Plus,
  RefreshCw,
  Route,
  Server,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

function clientLog(level: "info" | "error" | "warn", message: string, meta?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, level, source: "dashboard-client", message, ...meta };
  console[level](JSON.stringify(logEntry));

  if (level === "error") {
    fetch("/api/error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: message, ...meta }),
    }).catch(() => {});
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    clientLog("error", "uncaught_error", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    clientLog("error", "unhandled_rejection", { reason: String(event.reason) });
  });
}

type DomainStatus = "PENDING" | "VERIFIED" | "DISABLED";
type RouteMatchType = "EXACT" | "FALLBACK";

type Domain = {
  id: string;
  hostname: string;
  status: DomainStatus;
  dnsTxtName: string;
  dnsTxtValue: string;
  wildcardEnabled: boolean;
  fallbackUrl: string | null;
  createdAt: string;
  _count: {
    routes: number;
    events: number;
  };
};

type RedirectRoute = {
  id: string;
  domainId: string;
  subdomain: string | null;
  path: string | null;
  destinationUrl: string;
  status: "ACTIVE" | "DISABLED";
  matchType: RouteMatchType;
  preservePath: boolean;
  preserveQuery: boolean;
  redirectType: number;
  clickCount: number;
  domain: {
    hostname: string;
  };
};

type Analytics = {
  totalRedirects: number;
  topRoutes: RedirectRoute[];
  recentEvents: Array<{
    id: string;
    hostname: string;
    path: string;
    destination: string | null;
    statusCode: number;
    createdAt: string;
    domain: {
      hostname: string;
    };
    route: {
      subdomain: string | null;
      path: string | null;
    } | null;
  }>;
};

type Notice = {
  type: "success" | "error";
  message: string;
  details?: string[];
};

type ApiErrorPayload = {
  error?: string;
  expected?: {
    type: string;
    name: string;
    value: string;
  };
};

class ApiRequestError extends Error {
  expected?: ApiErrorPayload["expected"];

  constructor(message: string, expected?: ApiErrorPayload["expected"]) {
    super(message);
    this.name = "ApiRequestError";
    this.expected = expected;
  }
}

const emptyAnalytics: Analytics = {
  totalRedirects: 0,
  topRoutes: [],
  recentEvents: [],
};

function formatSource(route: RedirectRoute) {
  const host = route.subdomain
    ? `${route.subdomain}.${route.domain.hostname}`
    : route.domain.hostname;

  return `${host}${route.path ?? ""}`;
}

function getRouteHost(route: RedirectRoute) {
  return route.subdomain
    ? `${route.subdomain}.${route.domain.hostname}`
    : route.domain.hostname;
}

function getRoutePath(route: RedirectRoute) {
  return route.path ?? "/";
}

function getLocalTestUrl(route: RedirectRoute) {
  const params = new URLSearchParams({
    host: getRouteHost(route),
    path: getRoutePath(route),
  });

  return `http://localhost:4000/__test?${params.toString()}`;
}

function formatRouteType(route: RedirectRoute) {
  if (route.matchType === "FALLBACK") {
    return "fallback";
  }

  const isWildcard = route.subdomain === "*";

  if (isWildcard && route.path) {
    return "wildcard path";
  }

  if (isWildcard) {
    return "wildcard";
  }

  if (route.subdomain && route.path) {
    return "subdomain path";
  }

  if (route.subdomain) {
    return "subdomain";
  }

  return "root path";
}

function formatRedirectType(route: RedirectRoute) {
  return route.redirectType === 301 ? "301" : "302";
}

function statusClass(status: DomainStatus) {
  if (status === "VERIFIED") {
    return "bg-[#ecfdf3] text-[#027a48]";
  }

  if (status === "DISABLED") {
    return "bg-[#f2f4f7] text-[#667085]";
  }

  return "bg-[#fff7e6] text-[#b54708]";
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function writeJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? ((await response.json()) as T & ApiErrorPayload)
    : ({ error: await response.text() } as T & ApiErrorPayload);

  if (!response.ok) {
    throw new ApiRequestError(
      payload.error ?? `Request failed: ${response.status}`,
      payload.expected,
    );
  }

  return payload;
}

async function updateJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? ((await response.json()) as T & ApiErrorPayload)
    : ({ error: await response.text() } as T & ApiErrorPayload);

  if (!response.ok) {
    throw new ApiRequestError(
      payload.error ?? `Request failed: ${response.status}`,
      payload.expected,
    );
  }

  return payload;
}

async function deleteJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { method: "DELETE" });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? ((await response.json()) as T & ApiErrorPayload)
    : ({ error: await response.text() } as T & ApiErrorPayload);

  if (!response.ok) {
    throw new ApiRequestError(
      payload.error ?? `Request failed: ${response.status}`,
      payload.expected,
    );
  }

  return payload;
}

export function DashboardClient() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [routes, setRoutes] = useState<RedirectRoute[]>([]);
  const [analytics, setAnalytics] = useState<Analytics>(emptyAnalytics);
  const [selectedDomainId, setSelectedDomainId] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingDomain, setSavingDomain] = useState(false);
  const [updatingDomain, setUpdatingDomain] = useState(false);
  const [savingRoute, setSavingRoute] = useState(false);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [updatingRouteId, setUpdatingRouteId] = useState<string | null>(null);
  const [lastChangedRouteId, setLastChangedRouteId] = useState<string | null>(
    null,
  );
  const [notice, setNotice] = useState<Notice | null>(null);

  const selectedDomain = useMemo(
    () => domains.find((domain) => domain.id === selectedDomainId) ?? null,
    [domains, selectedDomainId],
  );

  const visibleRoutes = useMemo(() => {
    if (!selectedDomainId) {
      return routes;
    }

    return routes.filter((route) => route.domainId === selectedDomainId);
  }, [routes, selectedDomainId]);

  const visibleEvents = useMemo(() => {
    if (!selectedDomain) {
      return analytics.recentEvents;
    }

    return analytics.recentEvents.filter(
      (event) => event.domain.hostname === selectedDomain.hostname,
    );
  }, [analytics.recentEvents, selectedDomain]);

  async function refresh() {
    setLoading(true);

    try {
      const [domainPayload, routePayload, analyticsPayload] = await Promise.all([
        readJson<{ domains: Domain[] }>("/api/domains"),
        readJson<{ routes: RedirectRoute[] }>("/api/routes"),
        readJson<Analytics>("/api/analytics"),
      ]);

      setDomains(domainPayload.domains);
      setRoutes(routePayload.routes);
      setAnalytics(analyticsPayload);

      setSelectedDomainId((current) =>
        current && domainPayload.domains.some((domain) => domain.id === current)
          ? current
          : "",
      );
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to load dashboard data.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // This client console fetches its first dashboard snapshot after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, []);

  async function createDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingDomain(true);
    setNotice(null);

    const form = new FormData(event.currentTarget);
    const hostname = String(form.get("hostname") ?? "");
    const fallbackUrl = String(form.get("fallbackUrl") ?? "");
    const wildcardEnabled = form.get("wildcardEnabled") === "on";

    try {
      await writeJson("/api/domains", {
        hostname,
        fallbackUrl,
        wildcardEnabled,
      });

      event.currentTarget.reset();
      setNotice({ type: "success", message: "Domain created." });
      const domainPayload = await readJson<{ domains: Domain[] }>("/api/domains");
      setDomains(domainPayload.domains);
      setSelectedDomainId(domainPayload.domains[0]?.id ?? "");
      await refresh();
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error ? error.message : "Unable to create domain.",
      });
    } finally {
      setSavingDomain(false);
    }
  }

  async function createRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingRoute(true);
    setNotice(null);

    const form = new FormData(event.currentTarget);
    const matchType = String(form.get("matchType") ?? "EXACT") as RouteMatchType;
    const redirectType = form.get("redirectType") === "301" ? 301 : 302;

    try {
      await writeJson("/api/routes", {
        domainId: String(form.get("domainId") ?? ""),
        subdomain: String(form.get("subdomain") ?? ""),
        path: String(form.get("path") ?? ""),
        destinationUrl: String(form.get("destinationUrl") ?? ""),
        matchType,
        preservePath: form.get("preservePath") === "on",
        preserveQuery: form.get("preserveQuery") === "on",
        redirectType,
      });

      event.currentTarget.reset();
      setNotice({ type: "success", message: "Route created." });
      await refresh();
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error ? error.message : "Unable to create route.",
      });
    } finally {
      setSavingRoute(false);
    }
  }

  async function verifyDomain(domainId: string) {
    setNotice(null);

    try {
      await writeJson(`/api/domains/${domainId}/verify`, {});
      setNotice({ type: "success", message: "Domain verified." });
      await refresh();
    } catch (error) {
      const expected =
        error instanceof ApiRequestError && error.expected
          ? [
              `Type: ${error.expected.type}`,
              `Name: ${error.expected.name}`,
              `Value: ${error.expected.value}`,
            ]
          : undefined;

      setNotice({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "DNS verification record was not found.",
        details: expected,
      });
    }
  }

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
    setNotice({ type: "success", message: "Copied to clipboard." });
  }

  async function updateDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedDomain) {
      return;
    }

    setUpdatingDomain(true);
    setNotice(null);

    const form = new FormData(event.currentTarget);

    try {
      await updateJson(`/api/domains/${selectedDomain.id}`, {
        fallbackUrl: String(form.get("fallbackUrl") ?? ""),
        wildcardEnabled: form.get("wildcardEnabled") === "on",
        status: String(form.get("status") ?? selectedDomain.status) as DomainStatus,
      });

      setNotice({ type: "success", message: "Domain settings saved." });
      await refresh();
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error ? error.message : "Unable to update domain.",
      });
    } finally {
      setUpdatingDomain(false);
    }
  }

  async function updateRoute(
    routeId: string,
    body: Partial<{
      subdomain: string;
      path: string;
      destinationUrl: string;
      status: "ACTIVE" | "DISABLED";
      matchType: RouteMatchType;
      preservePath: boolean;
      preserveQuery: boolean;
      redirectType: number;
    }>,
    successMessage: string,
  ) {
    setUpdatingRouteId(routeId);
    setNotice(null);

    try {
      await updateJson(`/api/routes/${routeId}`, body);
      setNotice({ type: "success", message: successMessage });
      setLastChangedRouteId(routeId);
      setEditingRouteId(null);
      await refresh();
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error ? error.message : "Unable to update route.",
      });
    } finally {
      setUpdatingRouteId(null);
    }
  }

  async function saveRoute(event: FormEvent<HTMLFormElement>, routeId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const redirectType = form.get("redirectType") === "301" ? 301 : 302;

    await updateRoute(
      routeId,
      {
        matchType: String(form.get("matchType") ?? "EXACT") as RouteMatchType,
        subdomain: String(form.get("subdomain") ?? ""),
        path: String(form.get("path") ?? ""),
        destinationUrl: String(form.get("destinationUrl") ?? ""),
        status: String(form.get("status") ?? "ACTIVE") as "ACTIVE" | "DISABLED",
        preservePath: form.get("preservePath") === "on",
        preserveQuery: form.get("preserveQuery") === "on",
        redirectType,
      },
      "Route updated.",
    );
  }

  async function deleteRoute(route: RedirectRoute) {
    const confirmed = window.confirm(`Delete ${formatSource(route)}?`);

    if (!confirmed) {
      return;
    }

    setUpdatingRouteId(route.id);
    setNotice(null);

    try {
      await deleteJson(`/api/routes/${route.id}`);
      setNotice({ type: "success", message: "Route deleted." });
      setLastChangedRouteId(null);
      await refresh();
    } catch (error) {
      setNotice({
        type: "error",
        message:
          error instanceof Error ? error.message : "Unable to delete route.",
      });
    } finally {
      setUpdatingRouteId(null);
    }
  }

  const totalRoutes = visibleRoutes.length;
  const verifiedDomains = domains.filter(
    (domain) => domain.status === "VERIFIED",
  ).length;

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-[#12151f]">
      {notice ? (
        <div
          className={`fixed right-5 top-5 z-50 flex max-w-sm items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm shadow-lg ${
            notice.type === "success"
              ? "border-[#abefc6] bg-white text-[#027a48]"
              : "border-[#fecdca] bg-white text-[#b42318]"
          }`}
        >
          <div>
            <p>{notice.message}</p>
            {notice.details ? (
              <div className="mt-2 space-y-1 font-mono text-xs text-[#475467]">
                {notice.details.map((detail) => (
                  <p key={detail}>{detail}</p>
                ))}
              </div>
            ) : null}
          </div>
          <button
            className="rounded-md p-1 text-[#667085] hover:bg-[#f2f4f7]"
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss notification"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}
      <div className="border-b border-[#dfe4ed] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-[#111827] text-white">
              <Network className="size-4" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-5">Redirect Platform</p>
              <p className="text-xs text-[#667085]">Domain routing console</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={loading}
            >
              <RefreshCw className="size-4" />
              Refresh
            </Button>
            <Button variant="outline" size="sm">
              <Server className="size-4" />
              Edge port 4000
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-5 px-5 py-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-3">
          {[
            ["Domains", Globe2],
            ["Routes", Route],
            ["Analytics", Activity],
            ["DNS verification", CheckCircle2],
          ].map(([label, Icon]) => (
            <a
              className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium text-[#344054] hover:bg-white"
              href={`#${String(label).toLowerCase().replace(" ", "-")}`}
              key={label as string}
            >
              <Icon className="size-4 text-[#667085]" />
              {label as string}
            </a>
          ))}
        </aside>

        <section className="space-y-5">
          {notice ? (
            <div
              className={`rounded-md border px-4 py-3 text-sm ${
                notice.type === "success"
                  ? "border-[#abefc6] bg-[#ecfdf3] text-[#027a48]"
                  : "border-[#fecdca] bg-[#fef3f2] text-[#b42318]"
              }`}
            >
              <p>{notice.message}</p>
              {notice.details ? (
                <div className="mt-2 space-y-1 font-mono text-xs">
                  {notice.details.map((detail) => (
                    <p key={detail}>{detail}</p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-4">
            {[
              ["Connected domains", String(domains.length), Globe2],
              ["Verified domains", String(verifiedDomains), CheckCircle2],
              ["Active routes", String(totalRoutes), Route],
              ["Total redirects", String(analytics.totalRedirects), Activity],
            ].map(([label, value, Icon]) => (
              <div
                className="rounded-lg border border-[#dfe4ed] bg-white p-4"
                key={label as string}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-[#667085]">
                    {label as string}
                  </p>
                  <Icon className="size-4 text-[#667085]" />
                </div>
                <p className="mt-3 text-2xl font-semibold tracking-normal">
                  {loading ? "..." : (value as string)}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
            <div
              className="rounded-lg border border-[#dfe4ed] bg-white"
              id="domains"
            >
              <div className="flex items-center justify-between border-b border-[#eaecf0] px-4 py-3">
                <h1 className="text-sm font-semibold">Domains</h1>
                <Button
                  variant={selectedDomainId ? "outline" : "secondary"}
                  size="xs"
                  type="button"
                  onClick={() => setSelectedDomainId("")}
                >
                  All domains
                </Button>
              </div>
              <div className="divide-y divide-[#eaecf0]">
                {domains.map((domain) => (
                  <button
                    className={`grid w-full gap-3 px-4 py-4 text-left md:grid-cols-[1.2fr_120px_100px_110px] ${
                      selectedDomain?.id === domain.id ? "bg-[#f9fafb]" : ""
                    }`}
                    key={domain.hostname}
                    onClick={() => setSelectedDomainId(domain.id)}
                  >
                    <div>
                      <p className="font-medium">{domain.hostname}</p>
                      <p className="text-xs text-[#667085]">
                        wildcard {domain.wildcardEnabled ? "enabled" : "disabled"}
                      </p>
                    </div>
                    <div>
                      <span
                        className={`rounded-md px-2 py-1 text-xs font-medium ${statusClass(
                          domain.status,
                        )}`}
                      >
                        {domain.status.toLowerCase()}
                      </span>
                    </div>
                    <div className="text-sm text-[#344054]">
                      {domain._count.routes} routes
                    </div>
                    <div className="text-sm font-medium">
                      {domain._count.events} hits
                    </div>
                  </button>
                ))}
                {domains.length === 0 ? (
                  <div className="px-4 py-8 text-sm text-[#667085]">
                    No domains yet.
                  </div>
                ) : null}
              </div>
            </div>

            <form
              className="rounded-lg border border-[#dfe4ed] bg-white p-4"
              onSubmit={createDomain}
            >
              <h2 className="text-sm font-semibold">Connect Domain</h2>
              <div className="mt-4 space-y-3">
                <label className="block text-xs font-medium text-[#344054]">
                  Hostname
                  <input
                    className="mt-1 h-9 w-full rounded-md border border-[#d0d5dd] px-3 text-sm outline-none focus:border-[#111827]"
                    name="hostname"
                    placeholder="domain.com"
                    required
                  />
                </label>
                <label className="block text-xs font-medium text-[#344054]">
                  Fallback URL
                  <input
                    className="mt-1 h-9 w-full rounded-md border border-[#d0d5dd] px-3 text-sm outline-none focus:border-[#111827]"
                    name="fallbackUrl"
                    placeholder="https://example.com"
                    type="url"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs font-medium text-[#344054]">
                  <input
                    className="size-4 rounded border-[#d0d5dd]"
                    name="wildcardEnabled"
                    type="checkbox"
                    defaultChecked
                  />
                  Enable wildcard subdomains
                </label>
              </div>
              <Button className="mt-4 w-full" disabled={savingDomain} type="submit">
                <Plus className="size-4" />
                {savingDomain ? "Creating..." : "Create domain"}
              </Button>
            </form>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
            <form
              key={selectedDomain?.id ?? "no-domain"}
              className="rounded-lg border border-[#dfe4ed] bg-white p-4"
              onSubmit={updateDomain}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Domain Settings</h2>
                <span className="text-xs text-[#667085]">
                  {selectedDomain ? selectedDomain.hostname : "All domains"}
                </span>
              </div>

              {selectedDomain ? (
                <div className="mt-4 space-y-3">
                  <label className="block text-xs font-medium text-[#344054]">
                    Fallback URL
                    <input
                      className="mt-1 h-9 w-full rounded-md border border-[#d0d5dd] px-3 text-sm outline-none focus:border-[#111827]"
                      name="fallbackUrl"
                      defaultValue={selectedDomain.fallbackUrl ?? ""}
                      placeholder="https://example.com"
                      type="url"
                    />
                  </label>
                  <label className="block text-xs font-medium text-[#344054]">
                    Status
                    <select
                      className="mt-1 h-9 w-full rounded-md border border-[#d0d5dd] bg-white px-3 text-sm outline-none focus:border-[#111827]"
                      name="status"
                      defaultValue={selectedDomain.status}
                    >
                      <option value="PENDING">Pending</option>
                      <option value="VERIFIED">Verified</option>
                      <option value="DISABLED">Disabled</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-medium text-[#344054]">
                    <input
                      className="size-4 rounded border-[#d0d5dd]"
                      name="wildcardEnabled"
                      type="checkbox"
                      defaultChecked={selectedDomain.wildcardEnabled}
                    />
                    Enable wildcard subdomains
                  </label>
                  <Button className="w-full" disabled={updatingDomain} type="submit">
                    <Save className="size-4" />
                    {updatingDomain ? "Saving..." : "Save domain"}
                  </Button>
                </div>
              ) : (
                <div className="mt-4 text-sm text-[#667085]">
                  Select a domain to edit fallback, wildcard, and status.
                </div>
              )}
            </form>

            <div className="rounded-lg border border-[#dfe4ed] bg-white p-4">
              <h2 className="text-sm font-semibold">Local Test Commands</h2>
              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-md bg-[#111827] p-3 font-mono text-xs text-white">
                  curl -I -H &quot;Host: example.test&quot;
                  http://localhost:4000/github
                </div>
                <div className="rounded-md bg-[#111827] p-3 font-mono text-xs text-white">
                  curl -I -H &quot;Host: blog.example.test&quot;
                  http://localhost:4000/
                </div>
                <p className="text-xs text-[#667085]">
                  Start the redirect engine with npm run dev:redirect before
                  testing redirects.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
            <form
              className="rounded-lg border border-[#dfe4ed] bg-white p-4"
              id="routes"
              onSubmit={createRoute}
            >
              <h2 className="text-sm font-semibold">Create Route</h2>
              <div className="mt-4 space-y-3">
                <label className="block text-xs font-medium text-[#344054]">
                  Domain
                  <select
                    className="mt-1 h-9 w-full rounded-md border border-[#d0d5dd] bg-white px-3 text-sm outline-none focus:border-[#111827]"
                    name="domainId"
                    required
                    value={selectedDomain?.id ?? domains[0]?.id ?? ""}
                    onChange={(event) => setSelectedDomainId(event.target.value)}
                  >
                    {domains.map((domain) => (
                      <option key={domain.id} value={domain.id}>
                        {domain.hostname}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-[#344054]">
                  Match type
                  <select
                    className="mt-1 h-9 w-full rounded-md border border-[#d0d5dd] bg-white px-3 text-sm outline-none focus:border-[#111827]"
                    name="matchType"
                    defaultValue="EXACT"
                  >
                    <option value="EXACT">Exact</option>
                    <option value="FALLBACK">Fallback</option>
                  </select>
                </label>
                <label className="block text-xs font-medium text-[#344054]">
                  Redirect type
                  <select
                    className="mt-1 h-9 w-full rounded-md border border-[#d0d5dd] bg-white px-3 text-sm outline-none focus:border-[#111827]"
                    name="redirectType"
                    defaultValue="302"
                  >
                    <option value="302">302 (Temporary)</option>
                    <option value="301">301 (Permanent)</option>
                  </select>
                </label>
                <label className="block text-xs font-medium text-[#344054]">
                  Subdomain
                  <input
                    className="mt-1 h-9 w-full rounded-md border border-[#d0d5dd] px-3 text-sm outline-none focus:border-[#111827]"
                    name="subdomain"
                    placeholder="blog, docs, * for wildcard"
                  />
                </label>
                <label className="block text-xs font-medium text-[#344054]">
                  Path
                  <input
                    className="mt-1 h-9 w-full rounded-md border border-[#d0d5dd] px-3 text-sm outline-none focus:border-[#111827]"
                    name="path"
                    placeholder="/github"
                  />
                </label>
                <label className="block text-xs font-medium text-[#344054]">
                  Destination URL
                  <input
                    className="mt-1 h-9 w-full rounded-md border border-[#d0d5dd] px-3 text-sm outline-none focus:border-[#111827]"
                    name="destinationUrl"
                    placeholder="https://github.com/acme"
                    required
                    type="url"
                  />
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-[#344054]">
                    <input className="size-4" name="preservePath" type="checkbox" />
                    Preserve path
                  </label>
                  <label className="flex items-center gap-2 text-xs font-medium text-[#344054]">
                    <input
                      className="size-4"
                      name="preserveQuery"
                      type="checkbox"
                      defaultChecked
                    />
                    Preserve query
                  </label>
                </div>
              </div>
              <Button
                className="mt-4 w-full"
                disabled={savingRoute || !domains[0]}
                type="submit"
              >
                <Plus className="size-4" />
                {savingRoute ? "Creating..." : "Create route"}
              </Button>
            </form>

            <div className="rounded-lg border border-[#dfe4ed] bg-white">
              <div className="border-b border-[#eaecf0] px-4 py-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Routes</h2>
                  <span className="text-xs text-[#667085]">
                    {selectedDomain ? selectedDomain.hostname : "All domains"}
                  </span>
                </div>
              </div>
              <div className="divide-y divide-[#eaecf0]">
                {visibleRoutes.map((route) =>
                  editingRouteId === route.id ? (
                    <form
                      className="grid gap-3 px-4 py-4"
                      key={route.id}
                      onSubmit={(event) => void saveRoute(event, route.id)}
                    >
                      <div className="grid gap-3 md:grid-cols-[90px_80px_1fr_1fr_1.5fr_90px]">
                        <label className="block text-xs font-medium text-[#344054]">
                          Type
                          <select
                            className="mt-1 h-9 w-full rounded-md border border-[#d0d5dd] bg-white px-2 text-sm"
                            name="matchType"
                            defaultValue={route.matchType}
                          >
                            <option value="EXACT">Exact</option>
                            <option value="FALLBACK">Fallback</option>
                          </select>
                        </label>
                        <label className="block text-xs font-medium text-[#344054]">
                          Redirect
                          <select
                            className="mt-1 h-9 w-full rounded-md border border-[#d0d5dd] bg-white px-2 text-sm"
                            name="redirectType"
                            defaultValue={String(route.redirectType)}
                          >
                            <option value="302">302</option>
                            <option value="301">301</option>
                          </select>
                        </label>
                        <label className="block text-xs font-medium text-[#344054]">
                          Subdomain
                          <input
                            className="mt-1 h-9 w-full rounded-md border border-[#d0d5dd] px-2 text-sm"
                            name="subdomain"
                            defaultValue={route.subdomain ?? ""}
                            placeholder="blog"
                          />
                        </label>
                        <label className="block text-xs font-medium text-[#344054]">
                          Path
                          <input
                            className="mt-1 h-9 w-full rounded-md border border-[#d0d5dd] px-2 text-sm"
                            name="path"
                            defaultValue={route.path ?? ""}
                            placeholder="/github"
                          />
                        </label>
                        <label className="block text-xs font-medium text-[#344054]">
                          Destination
                          <input
                            className="mt-1 h-9 w-full rounded-md border border-[#d0d5dd] px-2 text-sm"
                            name="destinationUrl"
                            defaultValue={route.destinationUrl}
                            required
                            type="url"
                          />
                        </label>
                        <label className="block text-xs font-medium text-[#344054]">
                          Status
                          <select
                            className="mt-1 h-9 w-full rounded-md border border-[#d0d5dd] bg-white px-2 text-sm"
                            name="status"
                            defaultValue={route.status}
                          >
                            <option value="ACTIVE">Active</option>
                            <option value="DISABLED">Disabled</option>
                          </select>
                        </label>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-4">
                          <label className="flex items-center gap-2 text-xs font-medium text-[#344054]">
                            <input
                              className="size-4"
                              name="preservePath"
                              type="checkbox"
                              defaultChecked={route.preservePath}
                            />
                            Preserve path
                          </label>
                          <label className="flex items-center gap-2 text-xs font-medium text-[#344054]">
                            <input
                              className="size-4"
                              name="preserveQuery"
                              type="checkbox"
                              defaultChecked={route.preserveQuery}
                            />
                            Preserve query
                          </label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={() => setEditingRouteId(null)}
                          >
                            <X className="size-4" />
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            disabled={updatingRouteId === route.id}
                            type="submit"
                          >
                            <Save className="size-4" />
                            Save
                          </Button>
                        </div>
                      </div>
                    </form>
                  ) : (
                    <div
                      className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_auto_1.2fr_130px_90px_150px]"
                      key={route.id}
                    >
                      <a
                        className="min-w-0 truncate font-medium text-[#175cd3] hover:underline"
                        href={getLocalTestUrl(route)}
                        target="_blank"
                        rel="noreferrer"
                        title="Open through local redirect engine"
                      >
                        {formatSource(route)}
                      </a>
                      <ArrowRight className="hidden size-4 text-[#98a2b3] md:block" />
                      <p className="min-w-0 truncate text-sm text-[#344054]">
                        {route.destinationUrl}
                      </p>
                      <p className="text-xs font-medium uppercase tracking-normal text-[#667085]">
                        {formatRouteType(route)}
                      </p>
                      <p className="text-sm font-medium">
                        {route.clickCount} hits
                      </p>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant={route.status === "ACTIVE" ? "outline" : "secondary"}
                          size="xs"
                          type="button"
                          disabled={updatingRouteId === route.id}
                          onClick={() =>
                            void updateRoute(
                              route.id,
                              {
                                status:
                                  route.status === "ACTIVE"
                                    ? "DISABLED"
                                    : "ACTIVE",
                              },
                              route.status === "ACTIVE"
                                ? "Route disabled."
                                : "Route enabled.",
                            )
                          }
                        >
                          {route.status === "ACTIVE" ? "Disable" : "Enable"}
                        </Button>
                        {lastChangedRouteId === route.id ? (
                          <span className="hidden text-xs font-medium text-[#027a48] xl:inline">
                            Saved
                          </span>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          type="button"
                          onClick={() => setEditingRouteId(route.id)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon-sm"
                          type="button"
                          disabled={updatingRouteId === route.id}
                          onClick={() => void deleteRoute(route)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ),
                )}
                {visibleRoutes.length === 0 ? (
                  <div className="px-4 py-8 text-sm text-[#667085]">
                    No routes yet.
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
            <div
              className="rounded-lg border border-[#dfe4ed] bg-white"
              id="analytics"
            >
              <div className="border-b border-[#eaecf0] px-4 py-3">
                <h2 className="text-sm font-semibold">Recent Redirects</h2>
              </div>
              <div className="divide-y divide-[#eaecf0]">
                {visibleEvents.map((event) => (
                  <div
                    className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_80px_1fr_150px]"
                    key={event.id}
                  >
                    <p className="min-w-0 truncate font-medium">
                      {event.hostname}
                      {event.path}
                    </p>
                    <p className="text-sm font-medium">{event.statusCode}</p>
                    <p className="min-w-0 truncate text-sm text-[#344054]">
                      {event.destination ?? "not found"}
                    </p>
                    <p className="text-xs text-[#667085]">
                      {new Date(event.createdAt).toLocaleString()}
                    </p>
                  </div>
                ))}
                {visibleEvents.length === 0 ? (
                  <div className="px-4 py-8 text-sm text-[#667085]">
                    No redirect events yet.
                  </div>
                ) : null}
              </div>
            </div>

            <div
              className="rounded-lg border border-[#dfe4ed] bg-white p-4"
              id="dns-verification"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">DNS Verification</h2>
                <Clock3 className="size-4 text-[#667085]" />
              </div>

              {selectedDomain ? (
                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-xs text-[#667085]">Selected domain</p>
                    <p className="font-medium">{selectedDomain.hostname}</p>
                  </div>
                  <div className="rounded-md bg-[#f2f4f7] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-[#667085]">TXT name</p>
                        <p className="truncate text-sm font-medium">
                          {selectedDomain.dnsTxtName}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        type="button"
                        onClick={() => void copyText(selectedDomain.dnsTxtName)}
                      >
                        <Copy className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-md bg-[#f2f4f7] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-[#667085]">TXT value</p>
                        <p className="truncate text-sm font-medium">
                          {selectedDomain.dnsTxtValue}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        type="button"
                        onClick={() => void copyText(selectedDomain.dnsTxtValue)}
                      >
                        <Copy className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    type="button"
                    variant={
                      selectedDomain.status === "VERIFIED" ? "outline" : "default"
                    }
                    onClick={() => void verifyDomain(selectedDomain.id)}
                  >
                    <CheckCircle2 className="size-4" />
                    Check DNS
                  </Button>
                </div>
              ) : (
                <div className="mt-4 text-sm text-[#667085]">
                  Select or create a domain.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
