import { Suspense } from "react";
import { TaludesClient } from "./taludes-client";

export default function TaludesPage() {
  return (
    <div className="h-full flex flex-col">
      <Suspense fallback={<div className="p-6 text-sm text-[var(--muted)]">A carregar…</div>}>
        <TaludesClient />
      </Suspense>
    </div>
  );
}
