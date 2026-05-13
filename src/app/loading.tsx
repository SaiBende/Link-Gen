import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f8fb]">
      <div className="flex items-center gap-3">
        <Loader2 className="size-6 animate-spin text-[#667085]" />
        <span className="text-[#667085]">Loading...</span>
      </div>
    </div>
  );
}