import { getReceiptView, normalizeProofPayDataMode, ProofPayDataError } from "../lib/proofpay.js";

async function main(): Promise<void> {
  if (normalizeProofPayDataMode(process.env.PROOFPAY_DATA_MODE) !== "live") {
    throw new Error("Live reconciliation requires live data mode.");
  }

  try {
    const receipt = await getReceiptView(1);

    if (receipt === null) {
      throw new Error("Invoice 1 is not a reconciled released settlement.");
    }
    const invoice = receipt.invoice;
    if (invoice.usdTarget?.atomic !== "5000000") throw new Error("Invoice target changed.");
    if (receipt.confirmed.locked.atomic !== "5299945") throw new Error("Confirmed lock changed.");
    if (receipt.confirmed.payout.atomic !== "4818748") throw new Error("Confirmed payout changed.");
    if (receipt.confirmed.refund.atomic !== "481197") throw new Error("Confirmed refund changed.");
    if (invoice.activeLiabilities.atomic !== "0") throw new Error("Active liabilities are no longer zero.");
    if (invoice.contractFxrpBalance.atomic !== "0") throw new Error("Contract FXRP balance is no longer zero.");
    if (!receipt.reconciliation.partyBalancesReadAtPinnedBlock) {
      throw new Error("Party balances were not read at the pinned block.");
    }

    process.stdout.write(`${JSON.stringify({
      status: "PASS",
      invoiceId: invoice.id,
      pinnedBlock: invoice.network.pinnedBlockNumber,
      invoiceStatus: invoice.status,
      lifecycleTransactions: receipt.lifecycle.map((entry) => entry.transactionHash),
      lockAtomic: receipt.confirmed.locked.atomic,
      payoutAtomic: receipt.confirmed.payout.atomic,
      refundAtomic: receipt.confirmed.refund.atomic,
      activeLiabilitiesAtomic: invoice.activeLiabilities.atomic,
      contractFxrpBalanceAtomic: invoice.contractFxrpBalance.atomic,
      currentPartyBalances: {
        clientFxrpAtomic: receipt.currentPartyBalances.client.atomic,
        freelancerFxrpAtomic: receipt.currentPartyBalances.freelancer.atomic,
      },
      partyBalancesReadAtPinnedBlock: receipt.reconciliation.partyBalancesReadAtPinnedBlock,
      receiptReconciliation: receipt.reconciliation,
    }, null, 2)}\n`);
  } catch (error) {
    if (error instanceof ProofPayDataError && error.code === "RPC_FAILURE") {
      process.stdout.write(`${JSON.stringify({ status: "WAITING_FOR_RPC" }, null, 2)}\n`);
      process.exitCode = 2;
      return;
    }
    throw error;
  }
}

await main();
