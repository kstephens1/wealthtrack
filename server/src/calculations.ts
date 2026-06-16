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

export function movement(current: number, previous: number, invert = false) {
  const change = invert ? previous - current : current - previous;
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

export function buildProjectedAccountValueSeries(
  rows: Array<{ value: number; valueDate: string }>,
  retirementDate: string | null | undefined
) {
  if (!retirementDate || !/^\d{4}-\d{2}-\d{2}$/.test(retirementDate) || rows.length < 2) return [];
  const sortedRows = [...rows]
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.valueDate) && Number.isFinite(Number(row.value)))
    .sort((a, b) => a.valueDate.localeCompare(b.valueDate));
  if (sortedRows.length < 2) return [];
  const first = sortedRows[0];
  const latest = sortedRows[sortedRows.length - 1];
  if (retirementDate <= latest.valueDate) return [];

  const annualRate = projectedAnnualRate({ accountId: 0, kind: "asset", value: first.value, valueDate: first.valueDate }, { accountId: 0, kind: "asset", value: latest.value, valueDate: latest.valueDate });
  const latestValue = Math.max(0, Number(latest.value));
  return forecastDates(latest.valueDate, retirementDate).map((date) => {
    const years = daysBetween(latest.valueDate, date) / 365;
    const projectedValue = Math.max(0, latestValue * Math.pow(1 + annualRate, years));
    return { date, projectedValue: Math.round(projectedValue) };
  });
}

export function buildProjectedAccountValueComparison(
  rows: Array<{ value: number; valueDate: string }>,
  retirementDate: string | null | undefined
) {
  if (!retirementDate || !/^\d{4}-\d{2}-\d{2}$/.test(retirementDate)) return null;
  const sortedRows = [...rows]
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.valueDate) && Number.isFinite(Number(row.value)))
    .sort((a, b) => a.valueDate.localeCompare(b.valueDate));
  if (sortedRows.length < 2) return null;
  const latest = sortedRows[sortedRows.length - 1];
  const previous = sortedRows[sortedRows.length - 2];
  const currentProjectedValue = projectedAccountValueAtDate(sortedRows, retirementDate);
  const previousProjectedValue = projectedAccountValueAtDate(sortedRows.slice(0, -1), retirementDate);
  if (currentProjectedValue === null || previousProjectedValue === null) return null;
  return {
    currentProjectedValue,
    previousProjectedValue,
    change: currentProjectedValue - previousProjectedValue,
    percentChange: previousProjectedValue === 0 ? null : (currentProjectedValue - previousProjectedValue) / Math.abs(previousProjectedValue),
    latestValueDate: latest.valueDate,
    previousValueDate: previous.valueDate
  };
}

export type TargetForecast = {
  targetValue: number;
  targetDate: string | null;
  previousTargetDate: string | null;
  monthDelta: number | null;
  dayDelta: number | null;
  status: "already_reached" | "projected" | "not_projected" | "insufficient_data";
};

export function buildTargetForecast(
  historicalSeries: Array<{ date: string; netWorth: number }>,
  projectedSeries: Array<{ date: string; predictedNetWorth: number }>,
  targetValue: number
): TargetForecast {
  const sortedHistorical = [...historicalSeries].sort((a, b) => a.date.localeCompare(b.date));
  if (!sortedHistorical.length || !Number.isFinite(targetValue) || targetValue <= 0) {
    return { targetValue, targetDate: null, previousTargetDate: null, monthDelta: null, dayDelta: null, status: "insufficient_data" };
  }

  const latest = sortedHistorical[sortedHistorical.length - 1];
  const previous = sortedHistorical.length > 1 ? sortedHistorical[sortedHistorical.length - 2] : null;
  const sortedProjected = [...projectedSeries].sort((a, b) => a.date.localeCompare(b.date));
  const targetDate = estimateTargetDate(
    [{ date: latest.date, value: latest.netWorth }, ...sortedProjected.map((point) => ({ date: point.date, value: point.predictedNetWorth }))],
    targetValue
  );
  const previousTargetDate = previous ? estimateTargetDate(
    [{ date: previous.date, value: previous.netWorth }, ...sortedProjected.map((point) => ({ date: point.date, value: point.predictedNetWorth }))],
    targetValue
  ) : null;

  return {
    targetValue,
    targetDate,
    previousTargetDate,
    monthDelta: targetDate && previousTargetDate ? monthsBetween(previousTargetDate, targetDate) : null,
    dayDelta: targetDate && previousTargetDate ? Math.round(daysBetween(previousTargetDate, targetDate)) : null,
    status: latest.netWorth >= targetValue ? "already_reached" : targetDate ? "projected" : "not_projected"
  };
}

function estimateTargetDate(points: Array<{ date: string; value: number }>, targetValue: number) {
  const sorted = dedupePoints(points).sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return null;
  if (sorted[0].value >= targetValue) return sorted[0].date;
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (current.value < targetValue || current.value === previous.value) continue;
    const ratio = (targetValue - previous.value) / (current.value - previous.value);
    return addDays(previous.date, Math.max(0, Math.round(daysBetween(previous.date, current.date) * ratio)));
  }
  return null;
}

function dedupePoints(points: Array<{ date: string; value: number }>) {
  const byDate = new Map<string, { date: string; value: number }>();
  for (const point of points) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.value)) byDate.set(point.date, point);
  }
  return Array.from(byDate.values());
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

function projectedAccountValueAtDate(rows: Array<{ value: number; valueDate: string }>, targetDate: string) {
  if (!rows.length) return null;
  const latest = rows[rows.length - 1];
  if (targetDate <= latest.valueDate) return null;
  if (rows.length < 2) return Math.round(Math.max(0, Number(latest.value)));
  const first = rows[0];
  const annualRate = projectedAnnualRate({ accountId: 0, kind: "asset", value: first.value, valueDate: first.valueDate }, { accountId: 0, kind: "asset", value: latest.value, valueDate: latest.valueDate });
  const years = daysBetween(latest.valueDate, targetDate) / 365;
  const projectedValue = Math.max(0, Math.max(0, Number(latest.value)) * Math.pow(1 + annualRate, years));
  return Math.round(projectedValue);
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

function monthsBetween(startDate: string, endDate: string) {
  return Math.round(daysBetween(startDate, endDate) / 30.4375);
}

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toDateString(date);
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}
