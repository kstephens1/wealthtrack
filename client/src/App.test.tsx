import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";

beforeEach(() => {
  localStorage.clear();
  jest.spyOn(global, "fetch").mockImplementation((async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/auth/login")) return new Response(JSON.stringify({ token: "t" }), { status: 200 });
    if (url.includes("/api/dashboard")) return new Response(JSON.stringify({
      totals: { netWorth: 100, assets: 125, liabilities: 25, monthlyChange: { change: 10, percentChange: 0.1 } },
      accounts: [{ id: 1, name: "Cash", kind: "asset", category: "Cash", currency: "GBP", updateFrequency: "monthly", tagsJson: "[]", notes: null, isArchived: 0, latestValue: 100, latestValueDate: "2026-06-01" }],
      allocation: [{ category: "Cash", value: 100, percent: 1 }],
      staleAccounts: [],
      insights: [{ title: "Ready", body: "Manual values are available." }],
      series: [{ date: "2026-05-01", netWorth: 90 }, { date: "2026-06-01", netWorth: 100 }]
    }), { status: 200 });
    return new Response(JSON.stringify({ accounts: [], goals: [], values: [] }), { status: 200 });
  }) as jest.Mock);
});

afterEach(() => jest.restoreAllMocks());

test("dashboard renders masked and unmasked balances", async () => {
  localStorage.setItem("wealthtrack_token", "t");
  render(<App />);
  expect(await screen.findByText("£100")).toBeInTheDocument();
  fireEvent.click(screen.getByTitle("Toggle privacy mode"));
  expect(screen.getAllByText("••••••").length).toBeGreaterThan(0);
});

test("account form validates required fields and decimal values", async () => {
  localStorage.setItem("wealthtrack_token", "t");
  render(<App />);
  fireEvent.click(await screen.findByText("Accounts"));
  expect(await screen.findByLabelText("Account name")).toBeRequired();
  expect(screen.getByLabelText("Initial value")).toHaveAttribute("step", "0.01");
});
