"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("Application error:", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });

    fetch("/api/error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: error.message,
        digest: error.digest,
        stack: error.stack,
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f8fb]">
      <div className="w-full max-w-md rounded-lg border border-[#fecdca] bg-white p-8 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-[#fef3f2]">
          <AlertTriangle className="size-6 text-[#b42318]" />
        </div>
        <h2 className="text-lg font-semibold text-[#b42318]">Something went wrong</h2>
        <p className="mt-2 text-sm text-[#667085]">
          {error.message || "An unexpected error occurred"}
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-[#98a2b3]">Error ID: {error.digest}</p>
        )}
        <div className="mt-6 flex gap-3 justify-center">
          <Button onClick={reset} variant="outline">
            <RefreshCw className="mr-2 size-4" />
            Try again
          </Button>
          <Button onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      </div>
    </div>
  );
}