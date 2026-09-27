"use client";

import type { StorageInfo } from "@/lib/store";

/**
 * Honest report about where the edits are stored.
 * On Vercel without a KV integration the runtime filesystem is ephemeral, so we
 * say so instead of pretending the data is safe.
 */
export function StorageBanner({ storage }: { storage: StorageInfo }) {
  const tone = storage.durable
    ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
    : "border-amber-400/30 bg-amber-500/10 text-amber-100";

  return (
    <div className={`card mb-5 border p-4 text-xs ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-white/15 bg-black/20 px-2 py-0.5 font-semibold uppercase tracking-wide">
          storage: {storage.mode}
        </span>
        <span className="font-semibold">
          {storage.durable ? "durable" : "temporary"}
        </span>
        <span className="opacity-80">{storage.location}</span>
      </div>
      <p className="mt-2 opacity-90">{storage.note}</p>
      {!storage.durable ? (
        <p className="mt-2 opacity-90">
          Fix: add the Upstash Redis integration to this Vercel project (Storage →
          Marketplace), then redeploy. The app picks up <code>KV_REST_API_URL</code> and{" "}
          <code>KV_REST_API_TOKEN</code> automatically. Meanwhile you can always
          export the current data from the Manage page.
        </p>
      ) : null}
    </div>
  );
}
