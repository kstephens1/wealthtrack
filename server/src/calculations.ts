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

export function buildProjectedNetWorthSeries(rows: NetWorthSeriesRow[], retirementDate: string | null | undefined) {
  if (!retirementDate || !/^\d{4}-\d{2}-\d{2}$/.test(retirementDate) || rows.length === 0) return [];
  const sortedRows = [...rows].sort((a, b) => a.valueDate.localeCompare(b.valueDate));
  const latestDate = sortedRows[sortedRows.length - 1].valueDate;
  if (retirementDate <= latestDate) return [];

  const rowsByAccount = new Map<number, NetWorthSeriesRow[]>();
  for (const row of sortedRows) {
    const accountRows = rowsByAccount.get(row.accountId) ?? [];
    accountRows.push(row);
    rowsByAccount.set(row.accountId, accountRows);
  }

  const accounts = Array.from(rowsByAccount.values()).map((accountRows) => {
    accountRows.sort((a, b) => a.valueDate.localeCompare(b.valueDate));
    const first = accountRows[0];
    const latest = accountRows[accountRows.length - 1];
    return {
      kind: latest.kind,
      latestValue: Math.max(0, Number(latest.value)),
      latestDate: latest.valueDate,
      annualRate: projectedAnnualRate(first, latest)
    };
  });

  return forecastDates(latestDate, retirementDate).map((date) => {
    const netWorth = accounts.reduce((sum, account) => {
      const years = daysBetween(account.latestDate, date) / 365;
      const projectedValue = Math.max(0, account.latestValue * Math.pow(1 + account.annualRate, years));
      return sum + signedValue({ kind: account.kind }, projectedValue);
    }, 0);
    return { date, predictedNetWorth: Math.round(netWorth) };
  });
}

function projectedAnnualRate(first: NetWorthSeriesRow, latest: NetWorthSeriesRow) {
  const start = Math.max(0, Number(first.value));
  const end = Math.max(0, Number(latest.value));
  const days = daysBetween(first.valueDate, latest.valueDate);
  if (start === 0 || end === 0 || days < 30) return 0;
  const annualized = Math.pow(end / start, 365 / days) - 1;
  if (!Number.isFinite(annualized)) return 0;
  return Math.max(-0.15, Math.min(0.15, annualized));
}

function forecastDates(startDate: string, retirementDate: string) {
  const dates = [startDate];
  const cursor = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${retirementDate}T00:00:00`);
  cursor.setMonth(cursor.getMonth() + 1);
  while (cursor < end) {
    dates.push(toDateString(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  if (dates[dates.length - 1] !== retirementDate) dates.push(retirementDate);
  return dates;
}

function daysBetween(startDate: string, endDate: string) {
  return (new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) / 86400000;
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}
