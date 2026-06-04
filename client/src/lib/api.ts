export const API_BASE = process.env.REACT_APP_API_BASE_URL || "http://127.0.0.1:4001";
export const AUTH_INVALID_EVENT = "wealthtrack:auth-invalid";

export type Account = {
  id: number;
  name: string;
  kind: "asset" | "liability";
  category: string;
  currency: string;
  updateFrequency: string;
  tagsJson: string;
  notes: string | null;
  isArchived: number;
  latestValue: number | null;
  latestValueDate: string | null;
  initialValue?: number | null;
  initialValueDate?: string | null;
  previousValue?: number | null;
  previousValueDate?: string | null;
  lastMonthValue?: number | null;
  lastMonthValueDate?: string | null;
  lastQuarterValue?: number | null;
  lastQuarterValueDate?: string | null;
  yearStartValue?: number | null;
  yearStartValueDate?: string | null;
  lastYearValue?: number | null;
  lastYearValueDate?: string | null;
  recentValues?: number[];
};

export type ValueEntry = { id: number; accountId: number; value: number; valueDate: string; note: string | null; source: string };
export type Dashboard = {
  totals: { netWorth: number; assets: number; liabilities: number; monthlyChange: { change: number; percentChange: number | null } };
  accounts: Account[];
  allocation: Array<{ category: string; value: number; percent: number }>;
  staleAccounts: Account[];
  insights: Array<{ title: string; body: string }>;
  series: Array<{ date: string; netWorth: number }>;
  projection: {
    retirementDate: string | null;
    series: Array<{ date: string; predictedNetWorth: number }>;
  };
};

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("wealthtrack_token");
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) {
      localStorage.removeItem("wealthtrack_token");
      window.dispatchEvent(new Event(AUTH_INVALID_EVENT));
    }
    throw new Error(body.error || `Request failed: ${response.status}`);
  }
  return response.json();
}

export const money = (value: number, currency = "GBP", hidden = false) =>
  hidden ? "••••••" : new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
