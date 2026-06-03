import { describe, expect, it } from "vitest";
import { allocation, buildNetWorthSeries, monthlyChange, netWorth, staleAccounts, twoPointComparison } from "../src/calculations";

const base = { userId: 1, currency: "GBP", updateFrequency: "monthly", tagsJson: "[]", notes: null, isArchived: 0, createdAt: "", updatedAt: "" };

describe("wealth calculations", () => {
  it("subtracts positive liability balances from net worth", () => {
    expect(netWorth([
      { ...base, id: 1, name: "ISA", kind: "asset", category: "Investments", latestValue: 1000, latestValueDate: "2026-05-01" },
      { ...base, id: 2, name: "Loan", kind: "liability", category: "Debt", latestValue: 250, latestValueDate: "2026-05-01" }
    ])).toBe(750);
  });

  it("excludes liabilities and archived accounts from allocation", () => {
    const result = allocation([
      { ...base, id: 1, name: "Cash", kind: "asset", category: "Cash", latestValue: 25, latestValueDate: "2026-05-01" },
      { ...base, id: 2, name: "Brokerage", kind: "asset", category: "Investments", latestValue: 75, latestValueDate: "2026-05-01" },
      { ...base, id: 3, name: "Card", kind: "liability", category: "Debt", latestValue: 10, latestValueDate: "2026-05-01" }
    ]);
    expect(result.find((row) => row.category === "Investments")?.percent).toBe(0.75);
  });

  it("flags stale accounts by update frequency", () => {
    const result = staleAccounts([
      { ...base, id: 1, name: "Old", kind: "asset", category: "Cash", latestValue: 1, latestValueDate: "2026-01-01" }
    ], new Date("2026-06-02"));
    expect(result).toHaveLength(1);
  });

  it("returns null percent change for zero start two-point compare", () => {
    const result = twoPointComparison(
      { id: 1, accountId: 1, value: 0, valueDate: "2026-01-01", note: null, source: "manual", createdAt: "", updatedAt: "" },
      { id: 2, accountId: 1, value: 10, valueDate: "2026-02-01", note: null, source: "manual", createdAt: "", updatedAt: "" },
      { kind: "asset" }
    );
    expect(result).toMatchObject({ change: 10, percentChange: null });
  });

  it("calculates monthly change", () => {
    expect(monthlyChange([{ date: "2026-01-01", netWorth: 100 }, { date: "2026-02-01", netWorth: 125 }])).toEqual({ change: 25, percentChange: 0.25 });
  });

  it("uses a liability first value as the baseline for earlier chart dates", () => {
    const series = buildNetWorthSeries([
      { accountId: 1, kind: "asset", value: 300000, valueDate: "2025-09-10" },
      { accountId: 1, kind: "asset", value: 350000, valueDate: "2026-01-11" },
      { accountId: 2, kind: "liability", value: 100000, valueDate: "2026-05-30" },
      { accountId: 1, kind: "asset", value: 425000, valueDate: "2026-06-03" }
    ]);

    expect(series).toEqual([
      { date: "2025-09-10", netWorth: 200000 },
      { date: "2026-01-11", netWorth: 250000 },
      { date: "2026-05-30", netWorth: 250000 },
      { date: "2026-06-03", netWorth: 325000 }
    ]);
  });
});
