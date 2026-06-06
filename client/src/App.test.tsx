import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";

beforeEach(() => {
  localStorage.clear();
  jest.spyOn(global, "fetch").mockImplementation((async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/auth/login")) return new Response(JSON.stringify({ token: "t" }), { status: 200 });
    if (url.includes("/api/auth/me")) return new Response(JSON.stringify({ user: { id: 1, email: "test@example.com" }, profile: { retirementDate: "2035-06-01", targetFinancialGoal: 1000000 } }), { status: 200 });
    if (url.includes("/api/profile")) return new Response(JSON.stringify({ profile: { retirementDate: "2036-07-01", targetFinancialGoal: 1250000 } }), { status: 200 });
    if (url.includes("/api/accounts/1/image")) return new Response(new Blob(["image"], { type: "image/png" }), { status: 200, headers: { "content-type": "image/png" } });
    if (url.includes("/api/dashboard")) return new Response(JSON.stringify({
      totals: {
        netWorth: 100,
        assets: 125,
        liabilities: 25,
        monthlyChange: { change: 10, percentChange: 0.1 },
        movements: {
          netWorth: { change: 10, percentChange: 0.1 },
          assets: { change: 15, percentChange: 0.125 },
          liabilities: { change: -5, percentChange: -0.167 },
          latestChange: { change: 10, percentChange: 0.1 }
        }
      },
      accounts: [
        { id: 1, name: "Cash", kind: "asset", category: "Cash", currency: "GBP", updateFrequency: "monthly", tagsJson: "[]", notes: null, isArchived: 0, latestValue: 100, latestValueDate: "2026-06-01", initialValue: 75, initialValueDate: "2026-01-01", previousValue: 90, previousValueDate: "2026-05-01", lastMonthValue: 90, lastMonthValueDate: "2026-05-01", lastQuarterValue: 75, lastQuarterValueDate: "2026-03-01", yearStartValue: 75, yearStartValueDate: "2026-01-01", lastYearValue: null, lastYearValueDate: null, thumbnailFileName: "1.png", thumbnailMimeType: "image/png", thumbnailUpdatedAt: "2026-06-02T00:00:00.000Z" },
        { id: 2, name: "ISA", kind: "asset", category: "Investments", currency: "GBP", updateFrequency: "monthly", tagsJson: "[]", notes: null, isArchived: 0, latestValue: 50, latestValueDate: "2026-05-01", initialValue: 40, initialValueDate: "2026-01-01", previousValue: 55, previousValueDate: "2026-04-01", lastMonthValue: 55, lastMonthValueDate: "2026-04-01", lastQuarterValue: 40, lastQuarterValueDate: "2026-03-01", yearStartValue: 40, yearStartValueDate: "2026-01-01", lastYearValue: null, lastYearValueDate: null },
        { id: 3, name: "KCC Lump Sum", kind: "asset", category: "Pension", currency: "GBP", updateFrequency: "annually", tagsJson: "[]", notes: null, isArchived: 0, latestValue: 1000, latestValueDate: "2026-05-01", previousValue: 1000, previousValueDate: "2026-04-01" },
        { id: 4, name: "rdp lump sum", kind: "asset", category: "Pension", currency: "GBP", updateFrequency: "annually", tagsJson: "[]", notes: null, isArchived: 0, latestValue: 2000, latestValueDate: "2026-05-01", previousValue: 2000, previousValueDate: "2026-04-01" }
      ],
      allocation: [{ category: "Cash", value: 100, percent: 1 }],
      staleAccounts: [
        { id: 3, name: "KCC Lump Sum", kind: "asset", category: "Pension", currency: "GBP", updateFrequency: "annually", tagsJson: "[]", notes: null, isArchived: 0, latestValue: 1000, latestValueDate: "2017-03-31", previousValue: 1000, previousValueDate: "2016-03-31" },
        { id: 5, name: "RDG Lump Sum", kind: "asset", category: "Pension", currency: "GBP", updateFrequency: "annually", tagsJson: "[]", notes: null, isArchived: 0, latestValue: 1000, latestValueDate: "2017-03-31", previousValue: 1000, previousValueDate: "2016-03-31" },
        { id: 6, name: "Old Cash", kind: "asset", category: "Cash", currency: "GBP", updateFrequency: "monthly", tagsJson: "[]", notes: null, isArchived: 0, latestValue: 10, latestValueDate: "2026-01-01", previousValue: 10, previousValueDate: "2025-12-01" }
      ],
      insights: [{ title: "Ready", body: "Manual values are available." }],
      series: [{ date: "2026-05-01", netWorth: 90 }, { date: "2026-06-01", netWorth: 100 }],
      projection: {
        retirementDate: "2035-06-01",
        targetFinancialGoal: 1000000,
        targetForecast: { targetValue: 1000000, targetDate: "2035-06-01", previousTargetDate: "2035-09-01", monthDelta: -3, dayDelta: -92, status: "projected" },
        series: [{ date: "2026-06-01", predictedNetWorth: 100 }, { date: "2035-06-01", predictedNetWorth: 220 }]
      }
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
  expect(screen.getByRole("button", { name: "1Y" })).toHaveClass("active");
  expect(screen.getAllByText("£100").length).toBeGreaterThan(0);
  expect(screen.getAllByText("+10.0% +£10").length).toBeGreaterThan(0);
  expect(screen.getByText("+12.5% +£15")).toBeInTheDocument();
  expect(screen.getByText("-16.7% -£5")).toBeInTheDocument();
  expect(screen.getByText("£1,000,000 projected for Jun 1, 2035.")).toBeInTheDocument();
  expect(screen.getByText("-92 days earlier than previous reading")).toHaveClass("positive");
  expect(screen.queryByText("Target timing change")).not.toBeInTheDocument();
  expect(screen.getByText("KCC Lump Sum")).toBeInTheDocument();
  expect(screen.getByText("rdp lump sum")).toBeInTheDocument();
  expect(screen.queryByText("RDG Lump Sum")).not.toBeInTheDocument();
  expect(screen.queryByText("Last updated 2017-03-31")).not.toBeInTheDocument();
  expect(screen.getByText("Old Cash")).toBeInTheDocument();
  expect(screen.getByText("Last updated 2026-01-01")).toBeInTheDocument();
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/accounts/1/image"), expect.any(Object)));
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
  expect(await screen.findByText("Account image")).toBeInTheDocument();
  expect(screen.getByText("Replace image")).toBeInTheDocument();
  expect(screen.getByText("Delete image")).toBeInTheDocument();
  expect(await screen.findByText("Jun 1, 2026")).toBeInTheDocument();

  const rows = screen.getAllByRole("row").map((row) => row.textContent ?? "");
  const latestRow = rows.findIndex((row) => row.includes("Jun 1, 2026"));
  const olderRow = rows.findIndex((row) => row.includes("May 1, 2026"));
  expect(latestRow).toBeGreaterThan(0);
  expect(olderRow).toBeGreaterThan(latestRow);
});

test("insights show target forecast and timing delta", async () => {
  localStorage.setItem("wealthtrack_token", "t");
  render(<App />);
  fireEvent.click(await screen.findByText("Insights"));
  expect(await screen.findByText("Target financial goal")).toBeInTheDocument();
  expect(screen.getByText("£1,000,000 projected for Jun 1, 2035.")).toBeInTheDocument();
  expect(screen.queryByText("Target timing change")).not.toBeInTheDocument();
  expect(screen.getByText("-92 days earlier than previous reading")).toHaveClass("positive");
});

test("settings persists the target retirement date and financial goal to the server", async () => {
  localStorage.setItem("wealthtrack_token", "t");
  render(<App />);
  fireEvent.click(await screen.findByText("Data"));
  const input = await screen.findByLabelText("Target retirement date");
  const targetInput = await screen.findByLabelText("Target financial goal");
  expect(input).toHaveValue("2035-06-01");
  expect(targetInput).toHaveValue(1000000);
  fireEvent.change(input, { target: { value: "2036-07-01" } });
  fireEvent.change(targetInput, { target: { value: "1250000" } });
  fireEvent.click(screen.getByRole("button", { name: /Save/ }));
  expect(await screen.findByText("Saved profile")).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/profile"), expect.objectContaining({
    method: "PATCH",
    body: JSON.stringify({ retirementDate: "2036-07-01", targetFinancialGoal: 1250000 })
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
