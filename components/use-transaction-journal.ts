"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Hash } from "viem";

import {
  abandonPreparedIntent,
  applySubmittedReceiptResolutions,
  beginWalletRequest,
  collectSubmittedReceiptResolutions,
  findBlockingJournalEntry,
  loadJournal,
  prepareJournalIntent,
  PROOFPAY_JOURNAL_KEY,
  saveJournal,
  transitionJournalEntry,
  type JournalBlockingInput,
  type JournalEntry,
} from "@/lib/transaction-journal";
import type { TransactionIntent } from "@/lib/transaction-intents";

interface ReceiptClient {
  getTransactionReceipt(parameters: { hash: Hash }): Promise<{ status: "success" | "reverted" }>;
}

export function useTransactionJournal(receiptClient?: ReceiptClient) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const entriesRef = useRef<JournalEntry[]>([]);
  const [ready, setReady] = useState(false);

  const commitEntries = useCallback((next: JournalEntry[]) => {
    entriesRef.current = next;
    setEntries(next);
    saveJournal(window.localStorage, next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const loaded = loadJournal(window.localStorage);
      entriesRef.current = loaded;
      setEntries(loaded);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== PROOFPAY_JOURNAL_KEY || event.storageArea !== window.localStorage) return;
      const loaded = loadJournal(window.localStorage);
      entriesRef.current = loaded;
      setEntries(loaded);
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!ready || !receiptClient) return;
    let cancelled = false;
    const submittedSnapshot = entriesRef.current;
    void collectSubmittedReceiptResolutions(submittedSnapshot, async (hash) => {
      try {
        return await receiptClient.getTransactionReceipt({ hash });
      } catch {
        return null;
      }
    }).then((resolutions) => {
      if (cancelled || resolutions.length === 0) return;
      const current = entriesRef.current;
      const next = applySubmittedReceiptResolutions(current, resolutions);
      if (JSON.stringify(next) === JSON.stringify(current)) return;
      commitEntries(next);
    });
    return () => {
      cancelled = true;
    };
  }, [commitEntries, entries, ready, receiptClient]);

  const prepare = useCallback((intent: TransactionIntent) => {
    const prepared = prepareJournalIntent(entriesRef.current, intent);
    commitEntries(prepared.entries);
    return prepared.entry;
  }, [commitEntries]);

  const beginWallet = useCallback((intentHash: Hash) => {
    commitEntries(beginWalletRequest(entriesRef.current, intentHash));
  }, [commitEntries]);

  const transition = useCallback((intentHash: Hash, status: JournalEntry["status"], transactionHash?: Hash | null) => {
    const next = transitionJournalEntry(entriesRef.current, intentHash, status, {
      ...(transactionHash === undefined ? {} : { transactionHash }),
    });
    commitEntries(next);
  }, [commitEntries]);

  const abandon = useCallback((intentHash: Hash) => {
    commitEntries(abandonPreparedIntent(entriesRef.current, intentHash));
  }, [commitEntries]);

  const blocking = useCallback((input: JournalBlockingInput) => (
    findBlockingJournalEntry(entriesRef.current, input)
  ), []);

  const currentEntry = useCallback((intentHash: Hash) => (
    entriesRef.current.find((entry) => entry.intentHash === intentHash) ?? null
  ), []);

  return { abandon, beginWallet, blocking, currentEntry, entries, prepare, ready, transition };
}
