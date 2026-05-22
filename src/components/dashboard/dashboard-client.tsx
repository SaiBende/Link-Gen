"use client";

import {
  Activity,
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
  WifiOff,
} from "lucide-react";
import { FormEvent, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const POLL_INTERVAL = 30_000;
const TOAST_DURATION = 4000;

let toastId = 0;

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

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-[#eaecf0] ${className ?? ""}`} />;
}

function StatCardSkeleton() {
  return <div className="rounded-lg border border-[#dfe4ed] bg-white p-4"><Skeleton className="mb-2 h-3 w-20" /><Skeleton className="h-6 w-12" /></div>;
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

type Toast = {
  id: number;
  type: "success" | "error" | "info";
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

function formatTimeAgo(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
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

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  const contentType = response.headers.get("content-type") ?? "";
  const json = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    const errMsg = json?.error ?? `Request failed: ${response.status}`;
    throw new ApiRequestError(errMsg, json?.expected);
  }

  return json as T;
}

function apiGet<T>(url: string) { return apiFetch<T>(url); }
function apiPost<T>(url: string, body?: unknown) { return apiFetch<T>(url, { method: "POST", body: body ? JSON.stringify(body) : undefined }); }
function apiPatch<T>(url: string, body: unknown) { return apiFetch<T>(url, { method: "PATCH", body: JSON.stringify(body) }); }
function apiDelete<T>(url: string) { return apiFetch<T>(url, { method: "DELETE" }); }

export function DashboardClient() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [routes, setRoutes] = useState<RedirectRoute[]>([]);
  const [analytics, setAnalytics] = useState<Analytics>(emptyAnalytics);
  const [selectedDomainId, setSelectedDomainId] = useState("");
  const [savingDomain, setSavingDomain] = useState(false);
  const [updatingDomain, setUpdatingDomain] = useState(false);
  const [savingRoute, setSavingRoute] = useState(false);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [updatingRouteId, setUpdatingRouteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function addToast(type: Toast["type"], message: string, details?: string[]) {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, type, message, details }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_DURATION);
  }

  const selectedDomain = useMemo(
    () => domains.find((domain) => domain.id === selectedDomainId) ?? null,
    [domains, selectedDomainId],
  );

  const visibleRoutes = useMemo(() => {
    if (!selectedDomainId) return routes;
    return routes.filter((route) => route.domainId === selectedDomainId);
  }, [routes, selectedDomainId]);

  const visibleEvents = useMemo(() => {
    if (!selectedDomain) return analytics.recentEvents;
    return analytics.recentEvents.filter(
      (event) => event.domain.hostname === selectedDomain.hostname,
    );
  }, [analytics.recentEvents, selectedDomain]);

  const totalRoutes = visibleRoutes.length;
  const verifiedDomains = domains.filter(
    (domain) => domain.status === "VERIFIED",
  ).length;

  const refresh = useCallback(async function () {
    try {
      const [domainPayload, routePayload, analyticsPayload] = await Promise.all([
        apiGet<{ domains: Domain[] }>("/api/domains"),
        apiGet<{ routes: RedirectRoute[] }>("/api/routes"),
        apiGet<Analytics>("/api/analytics"),
      ]);

      setDomains(domainPayload.domains);
      setRoutes(routePayload.routes);
      setAnalytics(analyticsPayload);

      setSelectedDomainId((current) =>
        current && domainPayload.domains.some((domain) => domain.id === current)
          ? current
          : "",
      );

      setIsOnline(true);
    } catch (error) {
      setIsOnline(false);
      if (loading) {
        addToast(
          "error",
          error instanceof Error ? error.message : "Unable to load dashboard data.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    startTransition(() => {
      void refresh();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    pollingRef.current = setInterval(() => void refresh(), POLL_INTERVAL);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isLoading = loading && domains.length === 0;

  async function createDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingDomain(true);

    const form = new FormData(event.currentTarget);
    const hostname = String(form.get("hostname") ?? "");
    const fallbackUrl = String(form.get("fallbackUrl") ?? "");
    const wildcardEnabled = form.get("wildcardEnabled") === "on";

    try {
      const { domain } = await apiPost<{ domain: Domain }>("/api/domains", {
        hostname,
        fallbackUrl,
        wildcardEnabled,
      });

      event.currentTarget.reset();
      setDomains((prev) => [domain, ...prev]);
      setSelectedDomainId(domain.id);
      addToast("success", `Domain ${domain.hostname} created.`);
    } catch (error) {
      addToast(
        "error",
        error instanceof Error ? error.message : "Unable to create domain.",
      );
    } finally {
      setSavingDomain(false);
    }
  }

  async function createRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingRoute(true);

    const form = new FormData(event.currentTarget);

    try {
      const { route } = await apiPost<{ route: RedirectRoute }>("/api/routes", {
        domainId: String(form.get("domainId") ?? ""),
        subdomain: String(form.get("subdomain") ?? ""),
        path: String(form.get("path") ?? ""),
        destinationUrl: String(form.get("destinationUrl") ?? ""),
        matchType: String(form.get("matchType") ?? "EXACT"),
        preservePath: form.get("preservePath") === "on",
        preserveQuery: form.get("preserveQuery") === "on",
        redirectType: form.get("redirectType") === "301" ? 301 : 302,
      });

      event.currentTarget.reset();
      setRoutes((prev) => [route, ...prev]);
      addToast("success", "Route created.");
    } catch (error) {
      addToast(
        "error",
        error instanceof Error ? error.message : "Unable to create route.",
      );
    } finally {
      setSavingRoute(false);
    }
  }

  async function verifyDomain(domainId: string) {
    try {
      const result = await apiPost<{ verified: boolean; domain: Domain }>(
        `/api/domains/${domainId}/verify`,
        {},
      );

      setDomains((prev) =>
        prev.map((d) => (d.id === domainId ? result.domain : d)),
      );
      addToast("success", "Domain verified!");
    } catch (error) {
      const err = error instanceof ApiRequestError ? error : null;
      addToast(
        "error",
        err?.message ?? "DNS verification record was not found.",
        err?.expected
          ? [
              `Type: ${err.expected.type}`,
              `Name: ${err.expected.name}`,
              `Value: ${err.expected.value}`,
            ]
          : undefined,
      );
    }
  }

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
    addToast("info", "Copied to clipboard.");
  }

  async function updateDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDomain) return;

    setUpdatingDomain(true);

    const form = new FormData(event.currentTarget);

    try {
      const { domain } = await apiPatch<{ domain: Domain }>(
        `/api/domains/${selectedDomain.id}`,
        {
          fallbackUrl: String(form.get("fallbackUrl") ?? ""),
          wildcardEnabled: form.get("wildcardEnabled") === "on",
          status: String(form.get("status") ?? selectedDomain.status),
        },
      );

      setDomains((prev) =>
        prev.map((d) => (d.id === selectedDomain.id ? domain : d)),
      );
      addToast("success", "Domain settings saved.");
    } catch (error) {
      addToast(
        "error",
        error instanceof Error ? error.message : "Unable to update domain.",
      );
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

    try {
      const { route } = await apiPatch<{ route: RedirectRoute }>(
        `/api/routes/${routeId}`,
        body,
      );

      setRoutes((prev) => prev.map((r) => (r.id === routeId ? route : r)));
      setEditingRouteId(null);
      addToast("success", successMessage);
    } catch (error) {
      addToast(
        "error",
        error instanceof Error ? error.message : "Unable to update route.",
      );
    } finally {
      setUpdatingRouteId(null);
    }
  }

  async function saveRoute(event: FormEvent<HTMLFormElement>, routeId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

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
        redirectType: form.get("redirectType") === "301" ? 301 : 302,
      },
      "Route updated.",
    );
  }

  async function deleteRoute(route: RedirectRoute) {
    if (!window.confirm(`Delete ${formatSource(route)}?`)) return;

    setUpdatingRouteId(route.id);

    setRoutes((prev) => prev.filter((r) => r.id !== route.id));

    try {
      await apiDelete(`/api/routes/${route.id}`);
      addToast("success", "Route deleted.");
    } catch (error) {
      setRoutes((prev) => [...prev, route]);
      addToast(
        "error",
        error instanceof Error ? error.message : "Unable to delete route.",
      );
    } finally {
      setUpdatingRouteId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-[#12151f]">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`fixed right-5 z-50 flex max-w-sm animate-in items-start justify-between gap-4 rounded-lg border px-4 py-3 text-sm shadow-lg slide-in-from-top-2 fade-in ${
            toast.type === "success"
              ? "border-[#abefc6] bg-white text-[#027a48]"
              : toast.type === "error"
                ? "border-[#fecdca] bg-white text-[#b42318]"
                : "border-[#dfe4ed] bg-white text-[#344054]"
          }`}
          style={{ top: `${20 + toasts.indexOf(toast) * 72}px` }}
        >
          <div className="min-w-0">
            <p>{toast.message}</p>
            {toast.details ? (
              <div className="mt-2 space-y-1 font-mono text-xs text-[#475467]">
                {toast.details.map((detail) => (
                  <p key={detail}>{detail}</p>
                ))}
              </div>
            ) : null}
          </div>
          <button
            className="shrink-0 rounded-md p-1 text-[#667085] hover:bg-[#f2f4f7]"
            type="button"
            onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}

      <div className="border-b border-[#dfe4ed] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#111827] text-white">
              <Network className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-5 truncate">Redirect Platform</p>
              <p className="text-xs text-[#667085]">Domain routing console</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isOnline && (
              <span className="flex items-center gap-1.5 rounded-md bg-[#fef3f2] px-2 py-1 text-xs font-medium text-[#b42318]">
                <WifiOff className="size-3" />
                Offline
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={isLoading}
            >
              <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
              Auto
            </Button>
            <Button variant="outline" size="sm">
              <Server className="size-4" />
              <span className="hidden sm:inline">Edge port 4000</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-5 py-6">
        <section className="space-y-5">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            {isLoading ? (
              <>
                <StatCardSkeleton />
                <StatCardSkeleton />
                <StatCardSkeleton />
                <StatCardSkeleton />
              </>
            ) : (
              <>
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
                      <Icon className="size-4 text-[#667085] shrink-0" />
                    </div>
                    <p className="mt-3 text-2xl font-semibold tracking-normal">
                      {value as string}
                    </p>
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
            <div
              className="rounded-lg border border-[#dfe4ed] bg-white"
              id="domains"
            >
              <div className="flex items-center justify-between border-b border-[#eaecf0] px-4 py-3">
                <h1 className="text-sm font-semibold">Domains</h1>
                {selectedDomainId && (
                  <Button
                    variant="outline"
                    size="xs"
                    type="button"
                    onClick={() => setSelectedDomainId("")}
                  >
                    All domains
                  </Button>
                )}
              </div>
              <div className="divide-y divide-[#eaecf0]">
                {isLoading ? (
                  <>
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="px-4 py-4">
                        <Skeleton className="mb-1 h-4 w-40" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    ))}
                  </>
                ) : domains.length === 0 ? (
                  <div className="flex flex-col items-center justify-center px-4 py-12 text-sm text-[#667085]">
                    <Globe2 className="mb-2 size-8 text-[#d0d5dd]" />
                    <p>No domains yet.</p>
                    <p className="text-xs mt-1">Add your first domain using the form.</p>
                  </div>
                ) : (
                  domains.map((domain) => (
                    <button
                      className={`grid w-full gap-2 px-4 py-4 text-left sm:grid-cols-[1.2fr_120px_100px_110px] ${
                        selectedDomain?.id === domain.id ? "bg-[#f9fafb]" : "hover:bg-[#fafafa]"
                      } transition-colors`}
                      key={domain.hostname}
                      onClick={() => setSelectedDomainId(domain.id)}
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">{domain.hostname}</p>
                        <p className="text-xs text-[#667085]">
                          wildcard {domain.wildcardEnabled ? "enabled" : "disabled"}
                        </p>
                      </div>
                      <div>
                        <span
                          className={`inline-block rounded-md px-2 py-1 text-xs font-medium ${statusClass(
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
                  ))
                )}
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
                    className="mt-1 h-9 w-full rounded-md border border-[#d0d5dd] px-3 text-sm outline-none transition-colors focus:border-[#111827] focus:ring-1 focus:ring-[#111827]/20"
                    name="hostname"
                    placeholder="domain.com"
                    required
                  />
                </label>
                <label className="block text-xs font-medium text-[#344054]">
                  Fallback URL
                  <input
                    className="mt-1 h-9 w-full rounded-md border border-[#d0d5dd] px-3 text-sm outline-none transition-colors focus:border-[#111827] focus:ring-1 focus:ring-[#111827]/20"
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
            <div className="rounded-lg border border-[#dfe4ed] bg-white p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Domain Settings</h2>
                <span className="text-xs text-[#667085]">
                  {selectedDomain ? selectedDomain.hostname : "No domain selected"}
                </span>
              </div>

              {selectedDomain ? (
                <form className="mt-4 space-y-3" onSubmit={updateDomain}>
                  <label className="block text-xs font-medium text-[#344054]">
                    Fallback URL
                    <input
                      className="mt-1 h-9 w-full rounded-md border border-[#d0d5dd] px-3 text-sm outline-none transition-colors focus:border-[#111827] focus:ring-1 focus:ring-[#111827]/20"
                      name="fallbackUrl"
                      defaultValue={selectedDomain.fallbackUrl ?? ""}
                      placeholder="https://example.com"
                      type="url"
                    />
                  </label>
                  <label className="block text-xs font-medium text-[#344054]">
                    Status
                    <select
                      className="mt-1 h-9 w-full rounded-md border border-[#d0d5dd] bg-white px-3 text-sm outline-none transition-colors focus:border-[#111827]"
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
                </form>
              ) : (
                <div className="mt-4 flex flex-col items-center justify-center py-8 text-sm text-[#667085]">
                  <Globe2 className="mb-2 size-8 text-[#d0d5dd]" />
                  Select a domain to edit settings.
                </div>
              )}
            </div>

            <div className="rounded-lg border border-[#dfe4ed] bg-white p-4">
              <h2 className="text-sm font-semibold">Local Test Commands</h2>
              <div className="mt-4 space-y-3">
                <div className="relative group">
                  <pre className="overflow-x-auto rounded-md bg-[#111827] p-3 font-mono text-xs text-white">
                    curl -I -H &quot;Host: example.test&quot; http://localhost:4000/github
                  </pre>
                  <button
                    className="absolute right-2 top-2 rounded p-1 text-[#9ca3af] opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
                    type="button"
                    onClick={() => void copyText('curl -I -H "Host: example.test" http://localhost:4000/github')}
                    aria-label="Copy command"
                  >
                    <Copy className="size-3.5" />
                  </button>
                </div>
                <div className="relative group">
                  <pre className="overflow-x-auto rounded-md bg-[#111827] p-3 font-mono text-xs text-white">
                    curl -I -H &quot;Host: blog.example.test&quot; http://localhost:4000/
                  </pre>
                  <button
                    className="absolute right-2 top-2 rounded p-1 text-[#9ca3af] opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
                    type="button"
                    onClick={() => void copyText('curl -I -H "Host: blog.example.test" http://localhost:4000/')}
                    aria-label="Copy command"
                  >
                    <Copy className="size-3.5" />
                  </button>
                </div>
                <p className="text-xs text-[#667085]">
                  Start the redirect engine with npm run dev:redirect before testing.
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
                    className="mt-1 h-9 w-full rounded-md border border-[#d0d5dd] bg-white px-3 text-sm outline-none transition-colors focus:border-[#111827]"
                    name="domainId"
                    required
                    value={selectedDomain?.id ?? domains[0]?.id ?? ""}
                    onChange={(event) => setSelectedDomainId(event.target.value)}
                  >
                    {domains.length === 0 ? (
                      <option value="">No domains available</option>
                    ) : (
                      domains.map((domain) => (
                        <option key={domain.id} value={domain.id}>
                          {domain.hostname}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <label className="block text-xs font-medium text-[#344054]">
                  Match type
                  <select
                    className="mt-1 h-9 w-full rounded-md border border-[#d0d5dd] bg-white px-3 text-sm outline-none transition-colors focus:border-[#111827]"
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
                    className="mt-1 h-9 w-full rounded-md border border-[#d0d5dd] bg-white px-3 text-sm outline-none transition-colors focus:border-[#111827]"
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
                    className="mt-1 h-9 w-full rounded-md border border-[#d0d5dd] px-3 text-sm outline-none transition-colors focus:border-[#111827] focus:ring-1 focus:ring-[#111827]/20"
                    name="subdomain"
                    placeholder="blog, docs, * for wildcard"
                  />
                </label>
                <label className="block text-xs font-medium text-[#344054]">
                  Path
                  <input
                    className="mt-1 h-9 w-full rounded-md border border-[#d0d5dd] px-3 text-sm outline-none transition-colors focus:border-[#111827] focus:ring-1 focus:ring-[#111827]/20"
                    name="path"
                    placeholder="/github"
                  />
                </label>
                <label className="block text-xs font-medium text-[#344054]">
                  Destination URL
                  <input
                    className="mt-1 h-9 w-full rounded-md border border-[#d0d5dd] px-3 text-sm outline-none transition-colors focus:border-[#111827] focus:ring-1 focus:ring-[#111827]/20"
                    name="destinationUrl"
                    placeholder="https://github.com/acme"
                    required
                    type="url"
                  />
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-[#344054]">
                    <input className="size-4 rounded border-[#d0d5dd]" name="preservePath" type="checkbox" />
                    Preserve path
                  </label>
                  <label className="flex items-center gap-2 text-xs font-medium text-[#344054]">
                    <input
                      className="size-4 rounded border-[#d0d5dd]"
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
                disabled={savingRoute || domains.length === 0}
                type="submit"
              >
                <Plus className="size-4" />
                {savingRoute ? "Creating..." : "Create route"}
              </Button>
            </form>

            <div className="rounded-lg border border-[#dfe4ed] bg-white">
              <div className="flex items-center justify-between border-b border-[#eaecf0] px-4 py-3">
                <h2 className="text-sm font-semibold">Routes</h2>
                <span className="text-xs text-[#667085]">
                  {selectedDomain ? selectedDomain.hostname : `${routes.length} total`}
                </span>
              </div>
              <div className="divide-y divide-[#eaecf0]">
                {isLoading ? (
                  <>
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-4 w-48" />
                          <Skeleton className="h-4 w-32" />
                        </div>
                      </div>
                    ))}
                  </>
                ) : visibleRoutes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center px-4 py-12 text-sm text-[#667085]">
                    <Route className="mb-2 size-8 text-[#d0d5dd]" />
                    <p>No routes yet.</p>
                    <p className="text-xs mt-1">Create a route using the form.</p>
                  </div>
                ) : (
                  visibleRoutes.map((route) =>
                    editingRouteId === route.id ? (
                      <form
                        className="px-4 py-4 space-y-3"
                        key={route.id}
                        onSubmit={(event) => void saveRoute(event, route.id)}
                      >
                        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                          <label className="block text-xs font-medium text-[#344054]">
                            Type
                            <select
                              className="mt-1 h-8 w-full rounded-md border border-[#d0d5dd] bg-white px-2 text-sm"
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
                              className="mt-1 h-8 w-full rounded-md border border-[#d0d5dd] bg-white px-2 text-sm"
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
                              className="mt-1 h-8 w-full rounded-md border border-[#d0d5dd] px-2 text-sm"
                              name="subdomain"
                              defaultValue={route.subdomain ?? ""}
                            />
                          </label>
                          <label className="block text-xs font-medium text-[#344054]">
                            Path
                            <input
                              className="mt-1 h-8 w-full rounded-md border border-[#d0d5dd] px-2 text-sm"
                              name="path"
                              defaultValue={route.path ?? ""}
                            />
                          </label>
                          <label className="block text-xs font-medium text-[#344054]">
                            Destination
                            <input
                              className="mt-1 h-8 w-full rounded-md border border-[#d0d5dd] px-2 text-sm"
                              name="destinationUrl"
                              defaultValue={route.destinationUrl}
                              required
                              type="url"
                            />
                          </label>
                          <label className="block text-xs font-medium text-[#344054]">
                            Status
                            <select
                              className="mt-1 h-8 w-full rounded-md border border-[#d0d5dd] bg-white px-2 text-sm"
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
                                className="size-4 rounded border-[#d0d5dd]"
                                name="preservePath"
                                type="checkbox"
                                defaultChecked={route.preservePath}
                              />
                              Preserve path
                            </label>
                            <label className="flex items-center gap-2 text-xs font-medium text-[#344054]">
                              <input
                                className="size-4 rounded border-[#d0d5dd]"
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
                        className="grid gap-2 px-4 py-4 sm:grid-cols-[1fr_auto_1.2fr_100px_70px_auto] items-center"
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
                        <ArrowRight className="hidden size-4 text-[#98a2b3] sm:block shrink-0" />
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
                  )
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
            <div
              className="rounded-lg border border-[#dfe4ed] bg-white"
              id="analytics"
            >
              <div className="flex items-center justify-between border-b border-[#eaecf0] px-4 py-3">
                <h2 className="text-sm font-semibold">Recent Redirects</h2>
                <span className="text-xs text-[#667085]">
                  {analytics.recentEvents.length} events
                </span>
              </div>
              <div className="divide-y divide-[#eaecf0]">
                {isLoading ? (
                  <>
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="px-4 py-4">
                        <Skeleton className="h-4 w-64" />
                      </div>
                    ))}
                  </>
                ) : visibleEvents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center px-4 py-12 text-sm text-[#667085]">
                    <Activity className="mb-2 size-8 text-[#d0d5dd]" />
                    <p>No redirect events yet.</p>
                    <p className="text-xs mt-1">Events appear after the redirect engine handles a request.</p>
                  </div>
                ) : (
                  visibleEvents.map((event) => (
                    <div
                      className="grid gap-2 px-4 py-4 sm:grid-cols-[1fr_60px_1fr_100px] items-center"
                      key={event.id}
                    >
                      <p className="min-w-0 truncate font-medium text-sm">
                        {event.hostname}{event.path}
                      </p>
                      <span
                        className={`inline-block w-fit rounded px-1.5 py-0.5 text-xs font-medium ${
                          event.statusCode === 404
                            ? "bg-[#fef3f2] text-[#b42318]"
                            : "bg-[#ecfdf3] text-[#027a48]"
                        }`}
                      >
                        {event.statusCode}
                      </span>
                      <p className="min-w-0 truncate text-sm text-[#344054]">
                        {event.destination ?? "not found"}
                      </p>
                      <p className="text-xs text-[#667085] text-right sm:text-left">
                        {formatTimeAgo(event.createdAt)}
                      </p>
                    </div>
                  ))
                )}
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
                    <p className="font-medium truncate">{selectedDomain.hostname}</p>
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
                        <p className="truncate text-sm font-medium break-all">
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
                    {selectedDomain.status === "VERIFIED" ? "Re-verify DNS" : "Check DNS"}
                  </Button>
                </div>
              ) : (
                <div className="mt-4 flex flex-col items-center justify-center py-8 text-sm text-[#667085]">
                  <Globe2 className="mb-2 size-8 text-[#d0d5dd]" />
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
