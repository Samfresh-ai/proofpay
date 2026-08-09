"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Hash } from "viem";

import {
  abandonPreparedIntent,
  findBlockingJournalEntry,
  journalEntryFromIntent,
  loadJournal,
  reconcileSubmittedEntries,
  saveJournal,
  transitionJournalEntry,
  upsertJournalEntry,
  type JournalEntry,
} from "@/lib/transaction-journal";
import type {
  ProofPayTransactionAction,
  TransactionIntent,
} from "@/lib/transaction-intents";

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
    if (!ready || !receiptClient) return;
    let cancelled = false;
    void reconcileSubmittedEntries(entries, async (hash) => {
      try {
        return await receiptClient.getTransactionReceipt({ hash });
      } catch {
        return null;
      }
    }).then((next) => {
      if (cancelled || JSON.stringify(next) === JSON.stringify(entries)) return;
      commitEntries(next);
    });
    return () => {
      cancelled = true;
    };
  }, [commitEntries, entries, ready, receiptClient]);

  const prepare = useCallback((intent: TransactionIntent) => {
    const entry = journalEntryFromIntent(intent);
    commitEntries(upsertJournalEntry(entriesRef.current, entry));
    return entry;
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

  const blocking = useCallback((input: {
    account: string;
    invoiceId: string;
    action: ProofPayTransactionAction;
  }) => findBlockingJournalEntry(entries, input), [entries]);

  return { abandon, blocking, entries, prepare, ready, transition };
}
