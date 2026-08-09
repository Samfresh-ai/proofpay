"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Hash } from "viem";

import {
  loadFundingIntents,
  removeFundingIntent,
  saveFundingIntents,
  upsertFundingIntent,
  type FrozenFundingIntent,
} from "@/lib/funding-intent";

export function useFundingIntent(invoiceId: string, account?: string) {
  const [intent, setIntent] = useState<FrozenFundingIntent | null>(null);
  const intentsRef = useRef<FrozenFundingIntent[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const loaded = loadFundingIntents(window.localStorage);
      const retained = account
        ? loaded.filter((candidate) => (
          candidate.invoiceId === invoiceId
          && candidate.account.toLowerCase() === account.toLowerCase()
        ))
        : loaded;
      if (retained.length !== loaded.length) saveFundingIntents(window.localStorage, retained);
      intentsRef.current = retained;
      setIntent(retained.find((candidate) => (
        candidate.invoiceId === invoiceId
        && (!account || candidate.account.toLowerCase() === account.toLowerCase())
      )) ?? null);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [account, invoiceId]);

  const freeze = useCallback((next: FrozenFundingIntent) => {
    const updated = upsertFundingIntent(intentsRef.current, next);
    intentsRef.current = updated;
    saveFundingIntents(window.localStorage, updated);
    setIntent(next);
  }, []);

  const clear = useCallback((intentHash?: Hash) => {
    const selectedHash = intentHash ?? intent?.intentHash;
    if (!selectedHash) return;
    const updated = removeFundingIntent(intentsRef.current, selectedHash);
    intentsRef.current = updated;
    saveFundingIntents(window.localStorage, updated);
    setIntent(null);
  }, [intent]);

  return { clear, freeze, intent, ready };
}
