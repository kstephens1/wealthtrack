import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";

beforeEach(() => {
  localStorage.clear();
  jest.spyOn(global, "fetch").mockImplementation((async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/auth/login")) return new Response(JSON.stringify({ token: "t" }), { status: 200 });
    if (url.includes("/api/auth/me")) return new Response(JSON.stringify({ user: { id: 1, email: "test@example.com" }, profile: { retirementDate: "2035-06-01" } }), { status: 200 });
    if (url.includes("/api/profile")) return new Response(JSON.stringify({ profile: { retirementDate: "2036-07-01" } }), { status: 200 });
    if (url.includes("/api/dashboard")) return new Response(JSON.stringify({
      totals: { netWorth: 100, assets: 125, liabilities: 25, monthlyChange: { change: 10, percentChange: 0.1 } },
      accounts: [
        { id: 1, name: "Cash", kind: "asset", category: "Cash", currency: "GBP", updateFrequency: "monthly", tagsJson: "[]", notes: null, isArchived: 0, latestValue: 100, latestValueDate: "2026-06-01", initialValue: 75, initialValueDate: "2026-01-01", previousValue: 90, previousValueDate: "2026-05-01", lastMonthValue: 90, lastMonthValueDate: "2026-05-01", lastQuarterValue: 75, lastQuarterValueDate: "2026-03-01", yearStartValue: 75, yearStartValueDate: "2026-01-01", lastYearValue: null, lastYearValueDate: null },
        { id: 2, name: "ISA", kind: "asset", category: "Investments", currency: "GBP", updateFrequency: "monthly", tagsJson: "[]", notes: null, isArchived: 0, latestValue: 50, latestValueDate: "2026-05-01", initialValue: 40, initialValueDate: "2026-01-01", previousValue: 55, previousValueDate: "2026-04-01", lastMonthValue: 55, lastMonthValueDate: "2026-04-01", lastQuarterValue: 40, lastQuarterValueDate: "2026-03-01", yearStartValue: 40, yearStartValueDate: "2026-01-01", lastYearValue: null, lastYearValueDate: null }
      ],
      allocation: [{ category: "Cash", value: 100, percent: 1 }],
      staleAccounts: [],
      insights: [{ title: "Ready", body: "Manual values are available." }],
      series: [{ date: "2026-05-01", netWorth: 90 }, { date: "2026-06-01", netWorth: 100 }],
      projection: { retirementDate: "2035-06-01", series: [{ date: "2026-06-01", predictedNetWorth: 100 }, { date: "2035-06-01", predictedNetWorth: 220 }] }
    }), { status: 200 });
    if (url.includes("/api/accounts/1/values")) return new Response(JSON.stringify({
      values: [
        { id: 1, accountId: 1, value: 90, valueDate: "2026-05-01", source: "manual", note: "" },
        { id: 2, accountId: 1, value: 100, valueDate: "2026-06-01", source: "manual", note: "" }
      ]
    }), { status: 200 });
    return new Response(JSON.stringify({ accounts: [], goals: [], values: [] }), { status: 200 });
  }) as jest.Mock);
});

afterEach(() => jest.restoreAllMocks());

test("dashboard renders masked and unmasked balances", async () => {
  localStorage.setItem("wealthtrack_token", "t");
  render(<App />);
  expect(await screen.findByText("Assets & Liabilities")).toBeInTheDocument();
  expect(screen.getAllByText("£100").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByTitle("Toggle privacy mode"));
  expect(screen.getAllByText("••••••").length).toBeGreaterThan(0);
});

test("dashboard account list has comparison and sort pickers", async () => {
  localStorage.setItem("wealthtrack_token", "t");
  render(<App />);
  expect(await screen.findByText("Assets & Liabilities")).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText("Comparison Options"));
  expect(screen.getByText("Initial Value")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Initial Value"));
  expect(screen.getAllByText(/vs 01 Jan 2026/)).toHaveLength(2);
  expect(localStorage.getItem("wealthtrack_dashboard_comparison")).toBe("initial");

  fireEvent.click(screen.getByLabelText("Sort By"));
  expect(screen.getByText("Value (High to Low)")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Name"));
  expect(localStorage.getItem("wealthtrack_dashboard_sort")).toBe("name");
  const cards = screen.getAllByRole("button", { name: /Cash|ISA/ });
  expect(cards[0]).toHaveTextContent("Cash");
});

test("dashboard account list restores persisted comparison and sort selections", async () => {
  localStorage.setItem("wealthtrack_token", "t");
  localStorage.setItem("wealthtrack_dashboard_comparison", "initial");
  localStorage.setItem("wealthtrack_dashboard_sort", "name");
  render(<App />);
  expect(await screen.findByText("Assets & Liabilities")).toBeInTheDocument();
  expect(screen.getAllByText(/vs 01 Jan 2026/)).toHaveLength(2);

  fireEvent.click(screen.getByLabelText("Comparison Options"));
  expect(screen.getByRole("menuitemradio", { name: /Initial Value/ })).toHaveAttribute("aria-checked", "true");

  fireEvent.click(screen.getByLabelText("Sort By"));
  expect(screen.getByRole("menuitemradio", { name: /Name/ })).toHaveAttribute("aria-checked", "true");
});

test("account form validates required fields and decimal values", async () => {
  localStorage.setItem("wealthtrack_token", "t");
  render(<App />);
  fireEvent.click(await screen.findByText("Accounts"));
  expect(await screen.findByLabelText("Account name")).toBeRequired();
  expect(screen.getByLabelText("Initial value")).toHaveAttribute("step", "0.01");
});

test("account value history listing shows latest dated values first", async () => {
  localStorage.setItem("wealthtrack_token", "t");
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: /Cash/ }));
  expect(await screen.findByText("Value history")).toBeInTheDocument();
  expect(await screen.findByText("2026-06-01")).toBeInTheDocument();

  const rows = screen.getAllByRole("row").map((row) => row.textContent ?? "");
  const latestRow = rows.findIndex((row) => row.includes("2026-06-01"));
  const olderRow = rows.findIndex((row) => row.includes("2026-05-01"));
  expect(latestRow).toBeGreaterThan(0);
  expect(olderRow).toBeGreaterThan(latestRow);
});

test("settings persists the target retirement date to the server", async () => {
  localStorage.setItem("wealthtrack_token", "t");
  render(<App />);
  fireEvent.click(await screen.findByText("Data"));
  const input = await screen.findByLabelText("Target retirement date");
  expect(input).toHaveValue("2035-06-01");
  fireEvent.change(input, { target: { value: "2036-07-01" } });
  fireEvent.click(screen.getByRole("button", { name: /Save/ }));
  expect(await screen.findByText("Saved retirement date")).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/profile"), expect.objectContaining({
    method: "PATCH",
    body: JSON.stringify({ retirementDate: "2036-07-01" })
  }));
});

test("invalid session clears the stored token and returns to login", async () => {
  (global.fetch as jest.Mock).mockImplementation((async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/dashboard")) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401 });
    return new Response(JSON.stringify({ token: "t" }), { status: 200 });
  }) as jest.Mock);
  localStorage.setItem("wealthtrack_token", "stale");
  render(<App />);
  expect(await screen.findByLabelText("Email")).toBeInTheDocument();
  expect(localStorage.getItem("wealthtrack_token")).toBeNull();
});
