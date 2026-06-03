import { AccountWithLatest, ValueEntry } from "./types";

export function signedValue(account: { kind: string }, value: number | null | undefined): number {
  const amount = Number(value ?? 0);
  return account.kind === "liability" ? -Math.abs(amount) : amount;
}

export function netWorth(accounts: AccountWithLatest[]): number {
  return accounts.filter((account) => !account.isArchived).reduce((sum, account) => sum + signedValue(account, account.latestValue), 0);
}

export function allocation(accounts: AccountWithLatest[]) {
  const buckets = new Map<string, number>();
  for (const account of accounts) {
    if (account.isArchived || account.kind === "liability") continue;
    buckets.set(account.category, (buckets.get(account.category) ?? 0) + Number(account.latestValue ?? 0));
  }
  const total = Array.from(buckets.values()).reduce((sum, value) => sum + value, 0);
  return Array.from(buckets.entries()).map(([category, value]) => ({
    category,
    value,
    percent: total > 0 ? value / total : 0
  }));
}

export function staleAccounts(accounts: AccountWithLatest[], today = new Date()): AccountWithLatest[] {
  const maxAge: Record<string, number> = { weekly: 10, monthly: 40, quarterly: 110, annually: 400 };
  return accounts.filter((account) => {
    if (account.isArchived || !account.latestValueDate) return false;
    const ageDays = (today.getTime() - new Date(account.latestValueDate).getTime()) / 86400000;
    return ageDays > (maxAge[account.updateFrequency] ?? 40);
  });
}

export function twoPointComparison(a: ValueEntry, b: ValueEntry, account: { kind: string }) {
  const start = signedValue(account, a.value);
  const end = signedValue(account, b.value);
  const change = end - start;
  return {
    start,
    end,
    change,
    percentChange: start === 0 ? null : change / Math.abs(start)
  };
}

export function monthlyChange(points: Array<{ date: string; netWorth: number }>) {
  if (points.length < 2) return { change: 0, percentChange: null as number | null };
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const previous = sorted[sorted.length - 2].netWorth;
  const current = sorted[sorted.length - 1].netWorth;
  const change = current - previous;
  return { change, percentChange: previous === 0 ? null : change / Math.abs(previous) };
}

export type NetWorthSeriesRow = {
  accountId: number;
  kind: string;
  value: number;
  valueDate: string;
};

export function buildNetWorthSeries(rows: NetWorthSeriesRow[]) {
  const dates = Array.from(new Set(rows.map((row) => row.valueDate))).sort();
  const rowsByAccount = new Map<number, NetWorthSeriesRow[]>();
  for (const row of rows) {
    const accountRows = rowsByAccount.get(row.accountId) ?? [];
    accountRows.push(row);
    rowsByAccount.set(row.accountId, accountRows);
  }
  rowsByAccount.forEach((accountRows) => accountRows.sort((a, b) => a.valueDate.localeCompare(b.valueDate)));

  return dates.map((date) => {
    let total = 0;
    rowsByAccount.forEach((accountRows) => {
      const latestOnOrBeforeDate = [...accountRows].reverse().find((row) => row.valueDate <= date);
      const baseline = accountRows[0];
      const entry = latestOnOrBeforeDate ?? (baseline.kind === "liability" ? baseline : null);
      if (entry) total += signedValue({ kind: entry.kind }, entry.value);
    });
    return { date, netWorth: total };
  });
}
