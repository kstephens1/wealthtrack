import { Archive, ArrowDownAZ, ArrowDownWideNarrow, BarChart3, Calendar, Check, Clock, Eye, EyeOff, FileDown, FileUp, Gauge, LineChart, LogOut, Menu, Percent, Plus, Save, Settings as SettingsIcon, Tag, Target, Trash2, TrendingUp, X } from "lucide-react";
import { ChangeEvent, FormEvent, TouchEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart as RLineChart, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Account, AccountValueProjection, AccountValuesResponse, api, API_BASE, AUTH_INVALID_EVENT, Dashboard, money, ValueEntry } from "./lib/api";

type View = "dashboard" | "accounts" | "review" | "goals" | "insights" | "settings";
type ChartRange = "1w" | "3m" | "all" | "6m" | "1y" | "2y" | "4y" | "8y";
type DashboardChartTab = "netWorth" | "allocation";
type ComparisonOption = "initial" | "lastUpdate" | "lastMonth" | "lastQuarter" | "yearStart" | "lastYear";
type SortOption = "name" | "lastUpdate" | "valueDesc" | "type" | "changePercent" | "changeValue";
type ChartComparisonPoint = { date: string; timestamp: number; value: number };
type ChartComparisonSelection = { a?: ChartComparisonPoint; b?: ChartComparisonPoint };

const chartRanges: Array<{ key: ChartRange; label: string; days?: number; months?: number; all?: boolean }> = [
  { key: "1w", label: "1W", days: 7 },
  { key: "3m", label: "3M", months: 3 },
  { key: "6m", label: "6M", months: 6 },
  { key: "1y", label: "1Y", months: 12 },
  { key: "2y", label: "2Y", months: 24 },
  { key: "4y", label: "4Y", months: 48 },
  { key: "8y", label: "8Y", months: 96 },
  { key: "all", label: "All", all: true }
];
const chartGrid = "#2c2c2c";
const chartAxis = "#9a9a9a";
const chartGreen = "#56c863";
const chartPrediction = "#52b7d8";
const chartNegative = "#ff4040";
const lineChartMargin = { top: 8, right: 18, bottom: 0, left: 48 };
const comparisonOptions: Array<{ key: ComparisonOption; label: string; icon: typeof Gauge }> = [
  { key: "initial", label: "Initial Value", icon: Gauge },
  { key: "lastUpdate", label: "Last Update Value", icon: Clock },
  { key: "lastMonth", label: "Last Month", icon: Calendar },
  { key: "lastQuarter", label: "Last Quarter", icon: BarChart3 },
  { key: "yearStart", label: `January 1, ${new Date().getFullYear()}`, icon: Calendar },
  { key: "lastYear", label: "Last Year", icon: Calendar }
];
const sortOptions: Array<{ key: SortOption; label: string; icon: typeof Gauge }> = [
  { key: "name", label: "Name", icon: ArrowDownAZ },
  { key: "lastUpdate", label: "Last Update", icon: Clock },
  { key: "valueDesc", label: "Value (High to Low)", icon: ArrowDownWideNarrow },
  { key: "type", label: "Type", icon: Tag },
  { key: "changePercent", label: "Change Percentage", icon: Percent },
  { key: "changeValue", label: "Change Value", icon: TrendingUp }
];
const dashboardComparisonStorageKey = "wealthtrack_dashboard_comparison";
const dashboardSortStorageKey = "wealthtrack_dashboard_sort";
const hiddenDashboardStaleAccountNames = new Set(["kcc lump sum", "rdg lump sum"]);
const comparisonOptionKeys = new Set(comparisonOptions.map((option) => option.key));
const sortOptionKeys = new Set(sortOptions.map((option) => option.key));

function storedComparisonOption(): ComparisonOption {
  const stored = localStorage.getItem(dashboardComparisonStorageKey);
  return stored && comparisonOptionKeys.has(stored as ComparisonOption) ? stored as ComparisonOption : "lastUpdate";
}

function storedSortOption(): SortOption {
  const stored = localStorage.getItem(dashboardSortStorageKey);
  return stored && sortOptionKeys.has(stored as SortOption) ? stored as SortOption : "valueDesc";
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("wealthtrack_token"));
  const [view, setView] = useState<View>("dashboard");
  const [privacy, setPrivacy] = useState(localStorage.getItem("wealthtrack_privacy") === "true");
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const clearSession = () => {
      setSelectedAccount(null);
      setMenuOpen(false);
      setToken(null);
    };
    window.addEventListener(AUTH_INVALID_EVENT, clearSession);
    return () => window.removeEventListener(AUTH_INVALID_EVENT, clearSession);
  }, []);

  function onLogin(nextToken: string) {
    localStorage.setItem("wealthtrack_token", nextToken);
    setToken(nextToken);
  }

  function togglePrivacy() {
    const next = !privacy;
    localStorage.setItem("wealthtrack_privacy", String(next));
    setPrivacy(next);
  }

  if (!token) return <Login onLogin={onLogin} />;

  function navigate(nextView: View) {
    setView(nextView);
    setSelectedAccount(null);
    setMenuOpen(false);
  }

  return (
    <div className="app-shell">
      <header className="mobile-topbar">
        <button title="Open menu" onClick={() => setMenuOpen(true)}><Menu size={22} /></button>
        <span>WealthTrack</span>
      </header>
      {menuOpen && <button className="sidebar-backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <button className="mobile-close" title="Close menu" onClick={() => setMenuOpen(false)}><X size={20} /></button>
        <div className="brand">WealthTrack</div>
        <button className={view === "dashboard" ? "active" : ""} onClick={() => navigate("dashboard")}><BarChart3 size={18} /> Dashboard</button>
        <button className={view === "accounts" ? "active" : ""} onClick={() => navigate("accounts")}><LineChart size={18} /> Accounts</button>
        <button className={view === "review" ? "active" : ""} onClick={() => navigate("review")}><Save size={18} /> Review</button>
        <button className={view === "goals" ? "active" : ""} onClick={() => navigate("goals")}><Target size={18} /> Goals</button>
        <button className={view === "insights" ? "active" : ""} onClick={() => navigate("insights")}><BarChart3 size={18} /> Insights</button>
        <button className={view === "settings" ? "active" : ""} onClick={() => navigate("settings")}><SettingsIcon size={18} /> Data</button>
        <div className="sidebar-footer">
          <button title="Toggle privacy mode" onClick={togglePrivacy}>{privacy ? <EyeOff size={18} /> : <Eye size={18} />} Privacy</button>
          <button onClick={() => { localStorage.removeItem("wealthtrack_token"); setToken(null); api("/api/auth/logout", { method: "POST" }).catch(() => undefined); }}><LogOut size={18} /> Logout</button>
        </div>
      </aside>
      <main>
        {view === "dashboard" && <DashboardView hidden={privacy} onOpenAccount={(account) => { setSelectedAccount(account); setView("accounts"); }} />}
        {view === "accounts" && (selectedAccount ? <AccountDetail account={selectedAccount} hidden={privacy} onBack={() => setSelectedAccount(null)} /> : <AccountsView hidden={privacy} onOpen={setSelectedAccount} />)}
        {view === "review" && <MonthlyReview hidden={privacy} />}
        {view === "goals" && <Goals hidden={privacy} />}
        {view === "insights" && <Insights hidden={privacy} />}
        {view === "settings" && <Settings />}
      </main>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await api<{ token: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email: username, password }) });
      onLogin(result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }
  return (
    <main className="login-screen">
      <form className="login-panel" onSubmit={submit}>
        <h1>WealthTrack</h1>
        <label>Username or email<input value={username} onChange={(e) => setUsername(e.target.value)} type="text" autoComplete="username" required /></label>
        <label>Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" required /></label>
        {error && <p role="alert" className="error">{error}</p>}
        <button type="submit"><LogOut size={18} /> Sign in</button>
      </form>
    </main>
  );
}

function useDashboard() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let active = true;
    api<Dashboard>("/api/dashboard")
      .then((result) => { if (active) setDashboard(result); })
      .catch(() => { if (active) setDashboard(null); });
    return () => { active = false; };
  }, [reloadKey]);
  return { dashboard, reload: () => setReloadKey((key) => key + 1) };
}

function DashboardView({ hidden, onOpenAccount }: { hidden: boolean; onOpenAccount: (account: Account) => void }) {
  const { dashboard } = useDashboard();
  const [chartRange, setChartRange] = useState<ChartRange>("1y");
  const [chartTab, setChartTab] = useState<DashboardChartTab>("netWorth");
  const [netWorthComparison, setNetWorthComparison] = useState<ChartComparisonSelection>({});
  const netWorthChartRef = useRef<HTMLDivElement | null>(null);
  if (!dashboard) return <div className="page">Loading...</div>;
  const historicalChartData = dashboard.series.map((point) => ({
    date: point.date,
    netWorth: point.netWorth,
    predictedNetWorth: null as number | null,
    timestamp: new Date(`${point.date}T00:00:00`).getTime()
  })).filter((point) => Number.isFinite(point.timestamp));
  const rawProjectedChartData = dashboard.projection.series.map((point) => ({
    date: point.date,
    netWorth: null as number | null,
    predictedNetWorth: point.predictedNetWorth,
    timestamp: new Date(`${point.date}T00:00:00`).getTime()
  })).filter((point) => Number.isFinite(point.timestamp));
  const latestTimestamp = historicalChartData.length ? Math.max(...historicalChartData.map((point) => point.timestamp)) : Date.now();
  const selectedRange = chartRanges.find((range) => range.key === chartRange) ?? chartRanges[0];
  const rangeStart = rangeStartForRange(latestTimestamp, selectedRange);
  const rangeEnd = rangeEndForRange(latestTimestamp, selectedRange);
  const filteredHistoricalData = rangeStart === null ? historicalChartData : historicalChartData.filter((point) => point.timestamp >= rangeStart);
  const filteredProjectedData = rangeEnd === null ? rawProjectedChartData : rawProjectedChartData.filter((point) => point.timestamp <= rangeEnd);
  const projectedChartData = filteredProjectedData.length ? filteredProjectedData : rawProjectedChartData.slice(0, 1);
  const visibleChartData = mergeChartSeries(filteredHistoricalData.length ? filteredHistoricalData : historicalChartData.slice(-1), projectedChartData);
  const netWorthComparisonPoints = visibleChartData.map((point) => comparisonPointFromValues(point.date, point.timestamp, point.netWorth, point.predictedNetWorth)).filter(Boolean) as ChartComparisonPoint[];
  const yDomain = lineYAxisDomain(visibleChartData, ["netWorth", "predictedNetWorth"]);
  const predictionLabel = formatPredictionLabel(rawProjectedChartData);
  const dataMin = visibleChartData.length ? Math.min(...visibleChartData.map((point) => point.timestamp)) : latestTimestamp;
  const dataMax = visibleChartData.length ? Math.max(...visibleChartData.map((point) => point.timestamp)) : latestTimestamp;
  const xDomain = paddedDateDomain(dataMin, dataMax);
  const forecast = dashboard.projection.targetForecast;
  const homeAccounts = dashboard.accounts.filter((account) => !account.isArchived);
  const retirementNetWorth = retirementNetWorthPoint(dashboard);
  const dashboardInsights = dashboard.insights.filter((insight) => insight.title !== "Updates due");
  const visibleStaleAccounts = dashboard.staleAccounts.filter((account) => !isHiddenDashboardStaleAccount(account));
  return (
    <section className="page">
      <header className="page-header"><h1>Dashboard</h1><span>{homeAccounts.length} active accounts</span></header>
      <section className="panel wide">
        <div className="chart-tabs" role="tablist" aria-label="Dashboard charts">
          <button type="button" role="tab" aria-selected={chartTab === "netWorth"} className={chartTab === "netWorth" ? "active" : ""} onClick={() => setChartTab("netWorth")}>Net worth history</button>
          <button type="button" role="tab" aria-selected={chartTab === "allocation"} className={chartTab === "allocation" ? "active" : ""} onClick={() => { setNetWorthComparison({}); setChartTab("allocation"); }}>Allocation</button>
        </div>
        {chartTab === "netWorth" ? (
          <>
          <div className="panel-title-row">
            <h2>Net worth history</h2>
            <div className="range-controls" aria-label="Net worth history range">
              {chartRanges.map((range) => (
                <button key={range.key} className={chartRange === range.key ? "active" : ""} onClick={() => { setNetWorthComparison({}); setChartRange(range.key); }}>{range.label}</button>
              ))}
            </div>
          </div>
          <ChartComparisonSummary selection={netWorthComparison} currency="GBP" hidden={hidden} onClear={() => setNetWorthComparison({})} />
          <div
            className="chart-touch-target"
            ref={netWorthChartRef}
            onTouchStart={(event) => handleComparisonTouch(event, netWorthChartRef, netWorthComparisonPoints, xDomain, setNetWorthComparison)}
            onTouchMove={(event) => handleComparisonTouch(event, netWorthChartRef, netWorthComparisonPoints, xDomain, setNetWorthComparison)}
          >
          <ResponsiveContainer width="100%" height={280}>
            <RLineChart
              data={visibleChartData}
              margin={lineChartMargin}
              onClick={(state: unknown) => handleComparisonChartClick(state, netWorthComparisonPoints, setNetWorthComparison)}
            >
              <CartesianGrid strokeDasharray="4 6" stroke={chartGrid} />
              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={xDomain}
                tickFormatter={formatChartDate}
                stroke={chartAxis}
                tick={{ fill: chartAxis }}
              />
              <YAxis domain={yDomain} stroke={chartAxis} tick={{ fill: chartAxis }} />
              <Tooltip
                labelFormatter={(value) => formatChartDate(Number(value))}
                formatter={(value) => money(Number(value), "GBP", hidden)}
                contentStyle={{ background: "#1f1f1f", border: "1px solid #333", borderRadius: 8, color: "#fff" }}
              />
              <Legend />
              {renderChartComparisonOverlay(netWorthComparison)}
              <Line name="Net worth" type="monotone" dataKey="netWorth" stroke={chartGreen} strokeWidth={3} dot={false} activeDot={{ r: 4, fill: chartGreen }} connectNulls={false} />
              <Line name={predictionLabel} type="monotone" dataKey="predictedNetWorth" stroke={chartPrediction} strokeWidth={3} strokeDasharray="7 5" dot={false} activeDot={{ r: 4, fill: chartPrediction }} connectNulls={false} />
            </RLineChart>
          </ResponsiveContainer>
          </div>
          </>
        ) : (
          <>
          <h2>Allocation</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={dashboard.allocation} margin={{ top: 8, right: 18, bottom: 0, left: 48 }}><CartesianGrid strokeDasharray="4 6" stroke={chartGrid} /><XAxis dataKey="category" stroke={chartAxis} tick={{ fill: chartAxis }} /><YAxis stroke={chartAxis} tick={{ fill: chartAxis }} /><Tooltip formatter={(value) => money(Number(value), "GBP", hidden)} contentStyle={{ background: "#1f1f1f", border: "1px solid #333", borderRadius: 8, color: "#fff" }} /><Legend /><Bar dataKey="value" fill={chartGreen} /></BarChart>
          </ResponsiveContainer>
          </>
        )}
      </section>
      <div className="metric-grid">
        <Metric label="Net worth" value={money(dashboard.totals.netWorth, "GBP", hidden)} detail={formatMovement(dashboard.totals.movements?.netWorth ?? dashboard.totals.monthlyChange, "GBP", hidden)} />
        <Metric label="Assets" value={money(dashboard.totals.assets, "GBP", hidden)} detail={formatMovement(dashboard.totals.movements?.assets ?? { change: 0, percentChange: null }, "GBP", hidden)} />
        <Metric label="Liabilities" value={money(dashboard.totals.liabilities, "GBP", hidden)} detail={formatMovement(dashboard.totals.movements?.liabilities ?? { change: 0, percentChange: null }, "GBP", hidden)} />
        <Metric label="Latest change" value={signedMoney(dashboard.totals.monthlyChange.change, "GBP", hidden)} detail={formatMovement(dashboard.totals.movements?.latestChange ?? dashboard.totals.monthlyChange, "GBP", hidden)} />
      </div>
      <AccountSummaryList accounts={homeAccounts} hidden={hidden} onOpen={onOpenAccount} />
      <div className="card-grid">
        {forecast && <TargetForecastCard forecast={forecast} hidden={hidden} />}
        {retirementNetWorth && <RetirementNetWorthCard point={retirementNetWorth} currentNetWorth={dashboard.totals.netWorth} hidden={hidden} />}
        {dashboardInsights.map((insight) => <article className="card" key={insight.title}><h3>{insight.title}</h3><p>{insight.body}</p></article>)}
        {visibleStaleAccounts.map((account) => <article className="card warning" key={account.id}><h3>{account.name}</h3><p>Last updated {account.latestValueDate}</p></article>)}
      </div>
    </section>
  );
}

function isHiddenDashboardStaleAccount(account: Account) {
  return hiddenDashboardStaleAccountNames.has(account.name.trim().toLowerCase());
}

function mergeChartSeries(
  historical: Array<{ date: string; timestamp: number; netWorth: number | null; predictedNetWorth: number | null }>,
  projected: Array<{ date: string; timestamp: number; netWorth: number | null; predictedNetWorth: number | null }>
) {
  const byDate = new Map<string, { date: string; timestamp: number; netWorth: number | null; predictedNetWorth: number | null }>();
  for (const point of historical) byDate.set(point.date, point);
  for (const point of projected) {
    const existing = byDate.get(point.date);
    byDate.set(point.date, existing ? { ...existing, predictedNetWorth: point.predictedNetWorth } : point);
  }
  return Array.from(byDate.values()).sort((a, b) => a.timestamp - b.timestamp);
}

function mergeValueChartSeries(
  historical: Array<{ valueDate: string; timestamp: number; value: number; projectedValue: number | null }>,
  projected: Array<{ date: string; timestamp: number; value: number | null; projectedValue: number }>
) {
  const byDate = new Map<string, { date: string; timestamp: number; value: number | null; projectedValue: number | null }>();
  for (const point of historical) byDate.set(point.valueDate, { date: point.valueDate, timestamp: point.timestamp, value: point.value, projectedValue: point.projectedValue });
  for (const point of projected) {
    const existing = byDate.get(point.date);
    byDate.set(point.date, existing ? { ...existing, projectedValue: point.projectedValue } : point);
  }
  return Array.from(byDate.values()).sort((a, b) => a.timestamp - b.timestamp);
}

function formatPredictionLabel(projected: Array<{ timestamp: number; predictedNetWorth: number | null }>) {
  const points = projected.filter((point): point is { timestamp: number; predictedNetWorth: number } => point.predictedNetWorth !== null && point.predictedNetWorth > 0).sort((a, b) => a.timestamp - b.timestamp);
  if (points.length < 2) return "Prediction";
  const first = points[0];
  const last = points[points.length - 1];
  const years = (last.timestamp - first.timestamp) / (365 * 24 * 60 * 60 * 1000);
  if (years <= 0 || first.predictedNetWorth <= 0) return "Prediction";
  const annualGrowth = Math.pow(last.predictedNetWorth / first.predictedNetWorth, 1 / years) - 1;
  if (!Number.isFinite(annualGrowth)) return "Prediction";
  return `Prediction (${Math.round(annualGrowth * 100)}%)`;
}

function formatValueProjectionLabel(projected: Array<{ timestamp: number; projectedValue: number | null }>) {
  const points = projected.filter((point): point is { timestamp: number; projectedValue: number } => point.projectedValue !== null && point.projectedValue > 0).sort((a, b) => a.timestamp - b.timestamp);
  if (points.length < 2) return "Projection";
  const first = points[0];
  const last = points[points.length - 1];
  const years = (last.timestamp - first.timestamp) / (365 * 24 * 60 * 60 * 1000);
  if (years <= 0 || first.projectedValue <= 0) return "Projection";
  const annualGrowth = Math.pow(last.projectedValue / first.projectedValue, 1 / years) - 1;
  if (!Number.isFinite(annualGrowth)) return "Projection";
  return `Projection (${Math.round(annualGrowth * 100)}%)`;
}

function rangeStartForRange(timestamp: number, range: { days?: number; months?: number; all?: boolean }) {
  if (range.all) return null;
  if (range.days !== undefined) return addDays(timestamp, -range.days);
  if (range.months !== undefined) return subtractMonths(timestamp, range.months);
  return null;
}

function rangeEndForRange(timestamp: number, range: { days?: number; months?: number; all?: boolean }) {
  if (range.all) return null;
  if (range.days !== undefined) return addDays(timestamp, range.days);
  if (range.months !== undefined) return addMonths(timestamp, range.months);
  return null;
}

function subtractMonths(timestamp: number, months: number) {
  const date = new Date(timestamp);
  date.setMonth(date.getMonth() - months);
  return date.getTime();
}

function addMonths(timestamp: number, months: number) {
  const date = new Date(timestamp);
  date.setMonth(date.getMonth() + months);
  return date.getTime();
}

function addDays(timestamp: number, days: number) {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

function paddedDateDomain(min: number, max: number): [number, number] {
  if (min === max) {
    const day = 24 * 60 * 60 * 1000;
    return [min - day, max + day];
  }
  return [min, max];
}

function lineYAxisDomain<T extends Record<string, unknown>>(data: T[], keys: string[]): [number | "auto", "auto"] {
  const values = data.flatMap((point) => keys
    .map((key) => point[key])
    .filter((value) => value !== null && value !== undefined)
    .map(Number)
    .filter(Number.isFinite));
  if (!values.length) return ["auto", "auto"];
  return [Math.min(...values), "auto"];
}

type ComparisonSetter = (value: ChartComparisonSelection | ((current: ChartComparisonSelection) => ChartComparisonSelection)) => void;

function comparisonPointFromValues(date: string, timestamp: number, primary: number | null | undefined, secondary: number | null | undefined): ChartComparisonPoint | null {
  const value = primary ?? secondary;
  if (!Number.isFinite(timestamp) || value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  return { date, timestamp, value: Number(value) };
}

function handleComparisonChartClick(state: unknown, points: ChartComparisonPoint[], setComparison: ComparisonSetter) {
  const eventState = state as { activeTooltipIndex?: number; activeLabel?: number | string } | undefined;
  const index = Number(eventState?.activeTooltipIndex);
  const point = Number.isInteger(index) && index >= 0 ? points[index] : nearestComparisonPoint(Number(eventState?.activeLabel), points);
  if (!point) return;
  setComparison((current) => nextComparisonSelection(current, point));
}

function handleComparisonTouch(
  event: TouchEvent<HTMLDivElement>,
  chartRef: { current: HTMLDivElement | null },
  points: ChartComparisonPoint[],
  xDomain: [number, number],
  setComparison: ComparisonSetter
) {
  if (event.touches.length < 2 || !chartRef.current || points.length === 0) return;
  event.preventDefault();
  const touches = Array.from(event.touches).slice(0, 2).sort((a, b) => a.clientX - b.clientX);
  const selected = touches.map((touch) => nearestComparisonPoint(timestampFromTouch(touch.clientX, chartRef.current!, xDomain), points)).filter(Boolean) as ChartComparisonPoint[];
  if (selected.length === 2) setComparison({ a: selected[0], b: selected[1] });
}

function timestampFromTouch(clientX: number, container: HTMLDivElement, xDomain: [number, number]) {
  const bounds = container.getBoundingClientRect();
  const plotLeft = bounds.left + lineChartMargin.left;
  const plotRight = bounds.right - lineChartMargin.right;
  const ratio = Math.max(0, Math.min(1, (clientX - plotLeft) / Math.max(1, plotRight - plotLeft)));
  return xDomain[0] + ratio * (xDomain[1] - xDomain[0]);
}

function nearestComparisonPoint(timestamp: number, points: ChartComparisonPoint[]) {
  if (!Number.isFinite(timestamp) || points.length === 0) return null;
  return points.reduce((nearest, point) => Math.abs(point.timestamp - timestamp) < Math.abs(nearest.timestamp - timestamp) ? point : nearest, points[0]);
}

function nextComparisonSelection(current: ChartComparisonSelection, point: ChartComparisonPoint): ChartComparisonSelection {
  if (!current.a || current.b) return { a: point };
  if (current.a.timestamp === point.timestamp) return { a: point };
  return { a: current.a, b: point };
}

function chartComparisonChange(selection: ChartComparisonSelection) {
  if (!selection.a || !selection.b) return null;
  const change = selection.b.value - selection.a.value;
  return {
    change,
    percentChange: selection.a.value === 0 ? null : change / Math.abs(selection.a.value),
    positive: change >= 0
  };
}

function ChartComparisonSummary({ selection, currency, hidden, onClear }: { selection: ChartComparisonSelection; currency: string; hidden: boolean; onClear: () => void }) {
  const comparison = chartComparisonChange(selection);
  if (!selection.a || !selection.b || !comparison) return null;
  const trendClass = comparison.positive ? "positive" : "negative";
  return (
    <div className={`chart-comparison-summary ${trendClass}`}>
      <strong>{formatDisplayDate(selection.a.date)} - {formatDisplayDate(selection.b.date)}</strong>
      <span>{signedMoney(comparison.change, currency, hidden)}</span>
      <span>{formatComparisonPercent(comparison.percentChange)}</span>
      <button type="button" className="link-button" onClick={onClear}>Clear comparison</button>
    </div>
  );
}

function renderChartComparisonOverlay(selection: ChartComparisonSelection) {
  const comparison = chartComparisonChange(selection);
  if (!selection.a) return null;
  const stroke = comparison ? (comparison.positive ? chartGreen : chartNegative) : chartGreen;
  const a = selection.a;
  const b = selection.b;
  const areaX1 = b ? Math.min(a.timestamp, b.timestamp) : null;
  const areaX2 = b ? Math.max(a.timestamp, b.timestamp) : null;
  return [
    b && areaX1 !== null && areaX2 !== null ? <ReferenceArea key="comparison-area" x1={areaX1} x2={areaX2} strokeOpacity={0} fill={stroke} fillOpacity={0.16} /> : null,
    <ReferenceLine key="comparison-a-line" x={a.timestamp} stroke={stroke} strokeWidth={2} />,
    <ReferenceDot key="comparison-a-dot" x={a.timestamp} y={a.value} r={7} fill={stroke} stroke="#050505" strokeWidth={3} />,
    b ? <ReferenceLine key="comparison-b-line" x={b.timestamp} stroke={stroke} strokeWidth={2} /> : null,
    b ? <ReferenceDot key="comparison-b-dot" x={b.timestamp} y={b.value} r={7} fill={stroke} stroke="#050505" strokeWidth={3} /> : null
  ];
}

function formatComparisonPercent(percent: number | null) {
  if (percent === null) return "from zero";
  const sign = percent >= 0 ? "+" : "-";
  return `${sign}${Math.abs(percent * 100).toFixed(1)}%`;
}

function formatChartDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "short", day: "2-digit" }).format(new Date(timestamp));
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  const trendClass = detail?.startsWith("-") ? "negative" : "positive";
  return <div className="metric"><span>{label}</span><strong>{value}</strong>{detail && <small className={trendClass}>{detail}</small>}</div>;
}

function AccountSummaryList({ accounts, hidden, onOpen }: { accounts: Account[]; hidden: boolean; onOpen: (account: Account) => void }) {
  const [comparison, setComparison] = useState<ComparisonOption>(storedComparisonOption);
  const [sortBy, setSortBy] = useState<SortOption>(storedSortOption);
  const [openPicker, setOpenPicker] = useState<"comparison" | "sort" | null>(null);
  const sorted = [...accounts].sort((a, b) => compareAccounts(a, b, sortBy, comparison));
  function selectComparison(value: ComparisonOption) {
    localStorage.setItem(dashboardComparisonStorageKey, value);
    setComparison(value);
    setOpenPicker(null);
  }
  function selectSort(value: SortOption) {
    localStorage.setItem(dashboardSortStorageKey, value);
    setSortBy(value);
    setOpenPicker(null);
  }
  return (
    <section className="account-summary">
      <div className="section-title-row">
        <h2>Assets & Liabilities</h2>
        <div className="section-actions">
          <span>{sorted.length} accounts</span>
          <div className="picker-wrap">
            <button className="icon-button" title="Comparison Options" aria-label="Comparison Options" aria-expanded={openPicker === "comparison"} onClick={() => setOpenPicker(openPicker === "comparison" ? null : "comparison")}><Gauge size={18} /></button>
            {openPicker === "comparison" && (
              <OptionPicker
                title="Comparison Options"
                options={comparisonOptions.map((option) => ({ ...option, disabled: !accountHasComparison(sorted, option.key) }))}
                selected={comparison}
                onSelect={(value) => selectComparison(value as ComparisonOption)}
              />
            )}
          </div>
          <div className="picker-wrap">
            <button className="icon-button" title="Sort By" aria-label="Sort By" aria-expanded={openPicker === "sort"} onClick={() => setOpenPicker(openPicker === "sort" ? null : "sort")}><ArrowDownWideNarrow size={18} /></button>
            {openPicker === "sort" && (
              <OptionPicker
                title="Sort By"
                options={sortOptions}
                selected={sortBy}
                onSelect={(value) => selectSort(value as SortOption)}
              />
            )}
          </div>
        </div>
      </div>
      <div className="account-summary-list">
        {sorted.map((account) => <AccountSummaryCard key={account.id} account={account} comparison={comparison} hidden={hidden} onOpen={onOpen} />)}
      </div>
    </section>
  );
}

function OptionPicker({ title, options, selected, onSelect }: { title: string; options: Array<{ key: string; label: string; icon: typeof Gauge; disabled?: boolean }>; selected: string; onSelect: (value: string) => void }) {
  return (
    <div className="option-picker" role="menu" aria-label={title}>
      <div className="option-picker-title">{title}</div>
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <button key={option.key} role="menuitemradio" aria-checked={selected === option.key} disabled={option.disabled} className={selected === option.key ? "active" : ""} onClick={() => onSelect(option.key)}>
            <Icon size={16} />
            <span>{option.label}</span>
            {selected === option.key && <Check size={16} className="option-check" />}
          </button>
        );
      })}
    </div>
  );
}

function accountHasComparison(accounts: Account[], comparison: ComparisonOption) {
  return accounts.some((account) => getComparisonPoint(account, comparison).value !== null);
}

function compareAccounts(a: Account, b: Account, sortBy: SortOption, comparison: ComparisonOption) {
  if (sortBy === "name") return a.name.localeCompare(b.name);
  if (sortBy === "lastUpdate") return String(b.latestValueDate ?? "").localeCompare(String(a.latestValueDate ?? ""));
  if (sortBy === "type") {
    const kind = a.kind.localeCompare(b.kind);
    if (kind !== 0) return kind;
    return Number(b.latestValue ?? 0) - Number(a.latestValue ?? 0);
  }
  if (sortBy === "changePercent") return sortNullable(getAccountChange(b, comparison).percent) - sortNullable(getAccountChange(a, comparison).percent);
  if (sortBy === "changeValue") return sortNullable(getAccountChange(b, comparison).signedChange) - sortNullable(getAccountChange(a, comparison).signedChange);
  return Number(b.latestValue ?? 0) - Number(a.latestValue ?? 0);
}

function sortNullable(value: number | null) {
  return value === null || Number.isNaN(value) ? Number.NEGATIVE_INFINITY : value;
}

function getComparisonPoint(account: Account, comparison: ComparisonOption): { value: number | null; date: string | null } {
  if (comparison === "initial") return { value: account.initialValue ?? null, date: account.initialValueDate ?? null };
  if (comparison === "lastMonth") return { value: account.lastMonthValue ?? null, date: account.lastMonthValueDate ?? null };
  if (comparison === "lastQuarter") return { value: account.lastQuarterValue ?? null, date: account.lastQuarterValueDate ?? null };
  if (comparison === "yearStart") return { value: account.yearStartValue ?? null, date: account.yearStartValueDate ?? null };
  if (comparison === "lastYear") return { value: account.lastYearValue ?? null, date: account.lastYearValueDate ?? null };
  return { value: account.previousValue ?? null, date: account.previousValueDate ?? null };
}

function getAccountChange(account: Account, comparison: ComparisonOption) {
  const latest = Number(account.latestValue ?? 0);
  const point = getComparisonPoint(account, comparison);
  const baseline = point.value === null ? null : Number(point.value);
  const rawChange = baseline === null ? null : latest - baseline;
  const signedChange = rawChange === null ? null : account.kind === "liability" ? -rawChange : rawChange;
  const percent = baseline === null || baseline === 0 || signedChange === null ? null : signedChange / Math.abs(baseline);
  return { latest, baseline, signedChange, percent };
}

function AccountSummaryCard({ account, comparison, hidden, onOpen }: { account: Account; comparison: ComparisonOption; hidden: boolean; onOpen: (account: Account) => void }) {
  const latest = Number(account.latestValue ?? 0);
  const comparisonPoint = getComparisonPoint(account, comparison);
  const { baseline, signedChange, percent } = getAccountChange(account, comparison);
  const isPositive = signedChange === null ? true : signedChange >= 0;
  const trendClass = isPositive ? "positive" : "negative";
  const updatedLabel = account.latestValueDate ? `Updated ${formatShortDate(account.latestValueDate)}` : "No values yet";
  return (
    <button className="account-summary-card" onClick={() => onOpen(account)}>
      <AccountSparkline values={account.recentValues?.length ? account.recentValues : baseline === null ? [latest] : [baseline, latest]} positive={isPositive} />
      <AccountThumbnail account={account} size="summary" />
      <span className="account-summary-main">
        <strong>{account.name}</strong>
        <span>{updatedLabel}{comparisonPoint.date && comparison !== "lastUpdate" ? ` • vs ${formatShortDate(comparisonPoint.date)}` : ""}</span>
      </span>
      <span className="account-summary-value">
        <strong>{money(latest, account.currency, hidden)}</strong>
        <span className={trendClass}>{formatAccountChange(signedChange, percent, account.currency, hidden)}</span>
      </span>
    </button>
  );
}

function AccountThumbnail({ account, size }: { account: Account; size: "summary" | "table" | "detail" }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    if (!account.thumbnailFileName) {
      setSrc(null);
      return () => undefined;
    }
    const token = localStorage.getItem("wealthtrack_token");
    fetch(`${API_BASE}/api/accounts/${account.id}/image?ts=${encodeURIComponent(account.thumbnailUpdatedAt ?? "")}`, {
      credentials: "include",
      headers: token ? { authorization: `Bearer ${token}` } : {}
    })
      .then((response) => response.ok ? response.blob() : null)
      .then((blob) => {
        if (!active || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => { if (active) setSrc(null); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [account.id, account.thumbnailFileName, account.thumbnailUpdatedAt]);
  if (!src) return <span className={`account-thumbnail ${size} placeholder`} aria-hidden="true" />;
  return <img className={`account-thumbnail ${size}`} src={src} alt={`${account.name} thumbnail`} />;
}

function AccountSparkline({ values, positive }: { values: number[]; positive: boolean }) {
  const points = values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0];
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = points.length > 1 ? 40 / (points.length - 1) : 0;
  const path = points.map((value, index) => {
    const x = 6 + index * step;
    const y = 46 - ((value - min) / range) * 34;
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg className="account-sparkline" viewBox="0 0 68 54" aria-hidden="true">
      <path d={`${path} L50 52 L6 52 Z`} className={positive ? "spark-fill positive" : "spark-fill negative"} />
      <path d={path} className={positive ? "spark-line positive" : "spark-line negative"} />
    </svg>
  );
}

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${date}T00:00:00`));
}

function formatDisplayDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  const month = new Intl.DateTimeFormat("en-GB", { month: "short" }).format(parsed);
  const day = parsed.getDate();
  const year = parsed.getFullYear();
  return `${month} ${day}, ${year}`;
}

function formatAccountChange(change: number | null, percent: number | null, currency: string, hidden: boolean) {
  if (change === null) return "No previous value";
  const direction = change >= 0 ? "+" : "-";
  const amount = money(Math.abs(change), currency, hidden);
  const percentLabel = percent === null ? "from zero" : `${direction}${(Math.abs(percent) * 100).toFixed(1)}%`;
  return `${percentLabel} ${direction}${amount}`;
}

function signedMoney(value: number, currency: string, hidden: boolean) {
  if (hidden) return "••••••";
  const direction = value >= 0 ? "+" : "-";
  return `${direction}${money(Math.abs(value), currency, hidden)}`;
}

function formatMovement(change: { change: number; percentChange: number | null }, currency: string, hidden: boolean) {
  const direction = change.change >= 0 ? "+" : "-";
  const percentLabel = change.percentChange === null ? "from zero" : `${direction}${(Math.abs(change.percentChange) * 100).toFixed(1)}%`;
  return `${percentLabel} ${signedMoney(change.change, currency, hidden)}`;
}

async function resizeImageFile(file: File, width: number, height: number) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Use a PNG, JPEG, or WebP image");
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read image"));
      img.src = sourceUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare image");
    const sourceRatio = image.width / image.height;
    const targetRatio = width / height;
    const sourceWidth = sourceRatio > targetRatio ? image.height * targetRatio : image.width;
    const sourceHeight = sourceRatio > targetRatio ? image.height : image.width / targetRatio;
    const sourceX = (image.width - sourceWidth) / 2;
    const sourceY = (image.height - sourceHeight) / 2;
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
    return canvas.toDataURL(file.type === "image/png" ? "image/png" : file.type === "image/webp" ? "image/webp" : "image/jpeg", 0.86);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function AccountsView({ hidden, onOpen }: { hidden: boolean; onOpen: (account: Account) => void }) {
  const { dashboard, reload } = useDashboard();
  const [filter, setFilter] = useState("active");
  if (!dashboard) return <div className="page">Loading...</div>;
  const accounts = dashboard.accounts.filter((account) => filter === "all" || (filter === "archived" ? account.isArchived : !account.isArchived));
  return (
    <section className="page">
      <header className="page-header"><h1>Accounts</h1><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All</option></select></header>
      <AccountForm onSaved={reload} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Image</th><th>Name</th><th>Kind</th><th>Category</th><th>Latest value</th><th>Date</th><th></th></tr></thead>
          <tbody>{accounts.map((account) => (
            <tr key={account.id}>
              <td><AccountThumbnail account={account} size="table" /></td>
              <td><button className="link-button" onClick={() => onOpen(account)}>{account.name}</button></td>
              <td>{account.kind}</td><td>{account.category}</td><td>{money(Number(account.latestValue || 0), account.currency, hidden)}</td><td>{account.latestValueDate ? formatDisplayDate(account.latestValueDate) : "-"}</td>
              <td>{!account.isArchived && <button title="Archive account" onClick={async () => { await api(`/api/accounts/${account.id}/archive`, { method: "POST" }); reload(); }}><Archive size={16} /></button>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}

function AccountForm({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", kind: "asset", category: "", currency: "GBP", updateFrequency: "monthly", initialValue: "", valueDate: new Date().toISOString().slice(0, 10) });
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (Number(form.initialValue) < 0) return setError("Value must be zero or greater");
    await api("/api/accounts", { method: "POST", body: JSON.stringify({ ...form, kind: form.kind, initialValue: form.initialValue === "" ? undefined : Number(form.initialValue), tags: [] }) });
    setForm({ ...form, name: "", category: "", initialValue: "" });
    onSaved();
  }
  return (
    <form className="inline-form" onSubmit={submit}>
      <input aria-label="Account name" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      <select aria-label="Kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="asset">Asset</option><option value="liability">Liability</option></select>
      <input aria-label="Category" placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required />
      <input aria-label="Initial value" placeholder="Initial value" type="number" step="0.01" min="0" value={form.initialValue} onChange={(e) => setForm({ ...form, initialValue: e.target.value })} />
      <input aria-label="Value date" type="date" value={form.valueDate} onChange={(e) => setForm({ ...form, valueDate: e.target.value })} />
      <button type="submit"><Plus size={16} /> Add</button>
      {error && <span role="alert" className="error">{error}</span>}
    </form>
  );
}

function AccountDetail({ account, hidden, onBack }: { account: Account; hidden: boolean; onBack: () => void }) {
  const [detailAccount, setDetailAccount] = useState(account);
  const [values, setValues] = useState<ValueEntry[]>([]);
  const [projection, setProjection] = useState<AccountValueProjection>({ retirementDate: null, series: [] });
  const [selected, setSelected] = useState<number[]>([]);
  const [valueChartComparison, setValueChartComparison] = useState<ChartComparisonSelection>({});
  const [chartRange, setChartRange] = useState<ChartRange>("all");
  const [entry, setEntry] = useState({ value: "", valueDate: new Date().toISOString().slice(0, 10), note: "" });
  const [imageStatus, setImageStatus] = useState("");
  const valueChartRef = useRef<HTMLDivElement | null>(null);
  const load = () => api<AccountValuesResponse>(`/api/accounts/${account.id}/values`).then((result) => {
    setValues(result.values);
    setProjection(result.projection ?? { retirementDate: null, series: [] });
  });
  useEffect(() => {
    setDetailAccount(account);
    setImageStatus("");
    setValueChartComparison({});
    load();
  }, [account.id]);
  const chartData = values.map((value) => ({
    ...value,
    projectedValue: null as number | null,
    timestamp: new Date(`${value.valueDate}T00:00:00`).getTime()
  })).filter((value) => Number.isFinite(value.timestamp));
  const rawProjectedChartData = projection.series.map((point) => ({
    date: point.date,
    value: null as number | null,
    projectedValue: point.projectedValue,
    timestamp: new Date(`${point.date}T00:00:00`).getTime()
  })).filter((point) => Number.isFinite(point.timestamp));
  const latestTimestamp = chartData.length ? Math.max(...chartData.map((value) => value.timestamp)) : Date.now();
  const selectedRange = chartRanges.find((range) => range.key === chartRange) ?? chartRanges[0];
  const rangeStart = rangeStartForRange(latestTimestamp, selectedRange);
  const rangeEnd = rangeEndForRange(latestTimestamp, selectedRange);
  const filteredChartData = rangeStart === null ? chartData : chartData.filter((value) => value.timestamp >= rangeStart);
  const filteredProjectedData = rangeEnd === null ? rawProjectedChartData : rawProjectedChartData.filter((point) => point.timestamp <= rangeEnd);
  const projectedChartData = filteredProjectedData.length ? filteredProjectedData : rawProjectedChartData.slice(0, 1);
  const visibleChartData = mergeValueChartSeries(filteredChartData.length ? filteredChartData : chartData.slice(-1), projectedChartData);
  const valueComparisonPoints = visibleChartData.map((point) => comparisonPointFromValues(point.date, point.timestamp, point.value, point.projectedValue)).filter(Boolean) as ChartComparisonPoint[];
  const accountProjectionLabel = formatValueProjectionLabel(rawProjectedChartData);
  const retirementValue = accountRetirementValuePoint(projection);
  const yDomain = lineYAxisDomain(visibleChartData, ["value", "projectedValue"]);
  const dataMin = visibleChartData.length ? Math.min(...visibleChartData.map((value) => value.timestamp)) : latestTimestamp;
  const dataMax = visibleChartData.length ? Math.max(...visibleChartData.map((value) => value.timestamp)) : latestTimestamp;
  const xDomain = paddedDateDomain(dataMin, dataMax);
  const compare = useMemo(() => {
    const points = selected.map((id) => values.find((value) => value.id === id)).filter(Boolean) as ValueEntry[];
    if (points.length !== 2) return null;
    return { from: points[0], to: points[1], change: points[1].value - points[0].value, percent: points[0].value === 0 ? null : (points[1].value - points[0].value) / points[0].value };
  }, [selected, values]);
  const listedValues = [...values].sort((a, b) => {
    const dateSort = b.valueDate.localeCompare(a.valueDate);
    return dateSort !== 0 ? dateSort : b.id - a.id;
  });
  async function addValue(event: FormEvent) {
    event.preventDefault();
    await api(`/api/accounts/${account.id}/values`, { method: "POST", body: JSON.stringify({ value: Number(entry.value), valueDate: entry.valueDate, note: entry.note }) });
    setEntry({ value: "", valueDate: entry.valueDate, note: "" });
    load();
  }
  async function uploadAccountImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImageStatus("");
    try {
      const imageDataUrl = await resizeImageFile(file, 256, 192);
      const result = await api<{ account: Account }>(`/api/accounts/${account.id}/image`, { method: "PUT", body: JSON.stringify({ imageDataUrl }) });
      setDetailAccount(result.account);
      setImageStatus("Saved account image");
    } catch (error) {
      setImageStatus(error instanceof Error ? error.message : "Image upload failed");
    } finally {
      event.target.value = "";
    }
  }
  async function deleteAccountImage() {
    setImageStatus("");
    const result = await api<{ account: Account }>(`/api/accounts/${account.id}/image`, { method: "DELETE" });
    setDetailAccount(result.account);
    setImageStatus("Deleted account image");
  }
  return (
    <section className="page">
      <header className="page-header"><h1>{account.name}</h1><button onClick={onBack}>Back</button></header>
      <section className="panel account-image-panel">
        <AccountThumbnail account={detailAccount} size="detail" />
        <div>
          <h2>Account image</h2>
          <div className="data-actions">
            <label className="file-button">
              <FileUp size={16} /> {detailAccount.thumbnailFileName ? "Replace image" : "Add image"}
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadAccountImage} />
            </label>
            {detailAccount.thumbnailFileName && <button onClick={deleteAccountImage}><Trash2 size={16} /> Delete image</button>}
          </div>
          {imageStatus && <p>{imageStatus}</p>}
        </div>
      </section>
      <form className="inline-form" onSubmit={addValue}>
        <input aria-label="Value" type="number" min="0" step="0.01" value={entry.value} onChange={(e) => setEntry({ ...entry, value: e.target.value })} required />
        <input aria-label="Date" type="date" value={entry.valueDate} onChange={(e) => setEntry({ ...entry, valueDate: e.target.value })} required />
        <input aria-label="Note" placeholder="Note" value={entry.note} onChange={(e) => setEntry({ ...entry, note: e.target.value })} />
        <button type="submit"><Plus size={16} /> Add value</button>
      </form>
      <section className="panel wide">
        <div className="panel-title-row">
          <h2>Value history</h2>
          <div className="range-controls" aria-label={`${account.name} value history range`}>
            {chartRanges.map((range) => (
              <button key={range.key} className={chartRange === range.key ? "active" : ""} onClick={() => { setValueChartComparison({}); setChartRange(range.key); }}>{range.label}</button>
            ))}
          </div>
        </div>
        <ChartComparisonSummary selection={valueChartComparison} currency={account.currency} hidden={hidden} onClear={() => setValueChartComparison({})} />
        <div
          className="chart-touch-target"
          ref={valueChartRef}
          onTouchStart={(event) => handleComparisonTouch(event, valueChartRef, valueComparisonPoints, xDomain, setValueChartComparison)}
          onTouchMove={(event) => handleComparisonTouch(event, valueChartRef, valueComparisonPoints, xDomain, setValueChartComparison)}
        >
        <ResponsiveContainer width="100%" height={260}>
          <RLineChart
            data={visibleChartData}
            margin={lineChartMargin}
            onClick={(state: unknown) => handleComparisonChartClick(state, valueComparisonPoints, setValueChartComparison)}
          >
            <CartesianGrid strokeDasharray="4 6" stroke={chartGrid} />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={xDomain}
              tickFormatter={formatChartDate}
              stroke={chartAxis}
              tick={{ fill: chartAxis }}
            />
            <YAxis domain={yDomain} stroke={chartAxis} tick={{ fill: chartAxis }} />
            <Tooltip
              labelFormatter={(value) => formatChartDate(Number(value))}
              formatter={(value) => money(Number(value), account.currency, hidden)}
              contentStyle={{ background: "#1f1f1f", border: "1px solid #333", borderRadius: 8, color: "#fff" }}
            />
            <Legend />
            {renderChartComparisonOverlay(valueChartComparison)}
            <Line name="Value" type="monotone" dataKey="value" stroke={chartGreen} strokeWidth={3} dot={false} activeDot={{ r: 4, fill: chartGreen }} connectNulls={false} />
            <Line name={accountProjectionLabel} type="monotone" dataKey="projectedValue" stroke={chartPrediction} strokeWidth={3} strokeDasharray="7 5" dot={false} activeDot={{ r: 4, fill: chartPrediction }} connectNulls={false} />
          </RLineChart>
        </ResponsiveContainer>
        </div>
      </section>
      {retirementValue && <AccountRetirementValueCard point={retirementValue} comparison={projection.comparison ?? null} currentValue={Number(detailAccount.latestValue ?? 0)} currency={detailAccount.currency} hidden={hidden} />}
      {compare && <p className="compare-result">Selected: {compare.from.valueDate} to {compare.to.valueDate} = {money(compare.change, account.currency, hidden)} {compare.percent === null ? "(from zero)" : `(${(compare.percent * 100).toFixed(1)}%)`}</p>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Select</th><th>Date</th><th>Value</th><th>Source</th><th>Note</th><th></th></tr></thead>
          <tbody>{listedValues.map((value) => {
            const selectedIndex = selected.indexOf(value.id);
            return (
            <tr key={value.id} className={selectedIndex >= 0 ? "selected" : ""}>
              <td><button aria-label={`Compare ${value.valueDate}`} onClick={() => setSelected((items) => [...items.filter((id) => id !== value.id), value.id].slice(-2))}>{selectedIndex === 0 ? "A" : selectedIndex === 1 ? "B" : "A/B"}</button></td>
              <td>{formatDisplayDate(value.valueDate)}</td><td>{money(value.value, account.currency, hidden)}</td><td>{value.source}</td><td>{value.note}</td>
              <td><button title="Delete value" onClick={async () => { await api(`/api/values/${value.id}`, { method: "DELETE" }); load(); }}><Trash2 size={16} /></button></td>
            </tr>
            );
          })}</tbody>
        </table>
        <button onClick={() => setSelected([])}>Clear comparison</button>
      </div>
    </section>
  );
}

function MonthlyReview({ hidden }: { hidden: boolean }) {
  const { dashboard, reload } = useDashboard();
  const [values, setValues] = useState<Record<number, string>>({});
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  if (!dashboard) return <div className="page">Loading...</div>;
  async function submit(event: FormEvent) {
    event.preventDefault();
    await api("/api/monthly-reviews", { method: "POST", body: JSON.stringify({ reviewMonth: month, values: dashboard!.accounts.filter((account) => !account.isArchived).map((account) => ({ accountId: account.id, value: Number(values[account.id] ?? account.latestValue ?? 0) })) }) });
    reload();
  }
  return (
    <section className="page">
      <header className="page-header"><h1>Monthly Review</h1><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></header>
      <form onSubmit={submit} className="review-list">
        {dashboard.accounts.filter((account) => !account.isArchived).map((account) => <label key={account.id}>{account.name}<span>{money(Number(account.latestValue || 0), account.currency, hidden)}</span><input type="number" min="0" step="0.01" value={values[account.id] ?? ""} placeholder={String(account.latestValue ?? 0)} onChange={(e) => setValues({ ...values, [account.id]: e.target.value })} /></label>)}
        <button type="submit"><Save size={16} /> Complete review</button>
      </form>
    </section>
  );
}

function Goals({ hidden }: { hidden: boolean }) {
  const { dashboard } = useDashboard();
  const [goals, setGoals] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", goalType: "target", targetValue: "", targetDate: "" });
  const load = () => api<{ goals: any[] }>("/api/goals").then((result) => setGoals(result.goals));
  useEffect(() => {
    load();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    await api("/api/goals", { method: "POST", body: JSON.stringify({ ...form, targetValue: Number(form.targetValue) }) });
    setForm({ ...form, name: "", targetValue: "" });
    load();
  }
  const netWorth = dashboard?.totals.netWorth ?? 0;
  return (
    <section className="page">
      <header className="page-header"><h1>Goals</h1></header>
      <form className="inline-form" onSubmit={submit}><input placeholder="Goal" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /><input type="number" min="1" step="0.01" placeholder="Target" value={form.targetValue} onChange={(e) => setForm({ ...form, targetValue: e.target.value })} required /><input type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} /><button><Plus size={16} /> Add</button></form>
      <div className="card-grid">{goals.map((goal) => <article className="card" key={goal.id}><h3>{goal.name}</h3><progress max={goal.targetValue} value={Math.max(0, netWorth)} /><p>{money(netWorth, "GBP", hidden)} of {money(goal.targetValue, "GBP", hidden)}</p><button onClick={async () => { await api(`/api/goals/${goal.id}`, { method: "PATCH", body: JSON.stringify({ ...goal, isArchived: 1 }) }); load(); }}><Archive size={16} /> Archive</button></article>)}</div>
    </section>
  );
}

function TargetForecastCards({ forecast, hidden }: { forecast: NonNullable<Dashboard["projection"]["targetForecast"]>; hidden: boolean }) {
  return (
    <div className="insight-stack">
      <TargetForecastCard forecast={forecast} hidden={hidden} />
    </div>
  );
}

function TargetForecastCard({ forecast, hidden }: { forecast: NonNullable<Dashboard["projection"]["targetForecast"]>; hidden: boolean }) {
  return <article className="card target-goal-card"><h3>Target financial goal</h3><p>{formatTargetForecast(forecast, hidden)}</p>{formatTargetDayDelta(forecast)}</article>;
}

function RetirementNetWorthCard({ point, currentNetWorth, hidden }: { point: { date: string; predictedNetWorth: number }; currentNetWorth: number; hidden: boolean }) {
  const change = point.predictedNetWorth - currentNetWorth;
  const percent = currentNetWorth === 0 ? null : change / Math.abs(currentNetWorth);
  return (
    <article className="card target-goal-card">
      <h3>Net worth at retirement</h3>
      <p>{money(point.predictedNetWorth, "GBP", hidden)} projected for {formatDisplayDate(point.date)}.</p>
      <small className={`target-day-delta ${change < 0 ? "negative" : "positive"}`}>{formatAccountChange(change, percent, "GBP", hidden)}</small>
    </article>
  );
}

function AccountRetirementValueCard({
  point,
  comparison,
  currentValue,
  currency,
  hidden
}: {
  point: { date: string; projectedValue: number };
  comparison: AccountValueProjection["comparison"] | null;
  currentValue: number;
  currency: string;
  hidden: boolean;
}) {
  const fallbackChange = point.projectedValue - currentValue;
  const change = comparison?.change ?? fallbackChange;
  const percent = comparison?.percentChange ?? (currentValue === 0 ? null : fallbackChange / Math.abs(currentValue));
  return (
    <article className="card target-goal-card">
      <h3>Projected value at retirement</h3>
      <p>{money(point.projectedValue, currency, hidden)} projected for {formatDisplayDate(point.date)}.</p>
      <small className={`target-day-delta ${change < 0 ? "negative" : "positive"}`}>{formatAccountChange(change, percent, currency, hidden)}</small>
    </article>
  );
}

function Insights({ hidden }: { hidden: boolean }) {
  const { dashboard } = useDashboard();
  const forecast = dashboard?.projection.targetForecast;
  return (
    <section className="page">
      <header className="page-header"><h1>Insights</h1></header>
      {forecast && <TargetForecastCards forecast={forecast} hidden={hidden} />}
      <div className="card-grid">
        {dashboard?.insights.map((insight) => <article className="card" key={insight.title}><h3>{insight.title}</h3><p>{insight.body}</p></article>)}
      </div>
    </section>
  );
}

function formatTargetForecast(forecast: NonNullable<Dashboard["projection"]["targetForecast"]>, hidden: boolean) {
  const target = money(forecast.targetValue, "GBP", hidden);
  if (forecast.status === "already_reached" && forecast.targetDate) return `${target} reached on ${formatDisplayDate(forecast.targetDate)}.`;
  if (forecast.status === "projected" && forecast.targetDate) return `${target} projected for ${formatDisplayDate(forecast.targetDate)}.`;
  if (forecast.status === "insufficient_data") return `Add more net worth history to forecast ${target}.`;
  return `${target} is not projected within the current prediction horizon.`;
}

function retirementNetWorthPoint(dashboard: Dashboard) {
  const retirementDate = dashboard.projection.retirementDate;
  if (!retirementDate) return null;
  const projected = [...dashboard.projection.series]
    .filter((point) => Number.isFinite(point.predictedNetWorth))
    .sort((a, b) => a.date.localeCompare(b.date));
  return projected.find((point) => point.date === retirementDate) ?? projected[projected.length - 1] ?? null;
}

function accountRetirementValuePoint(projection: AccountValueProjection) {
  const retirementDate = projection.retirementDate;
  if (!retirementDate) return null;
  const projected = [...projection.series]
    .filter((point) => Number.isFinite(point.projectedValue))
    .sort((a, b) => a.date.localeCompare(b.date));
  return projected.find((point) => point.date === retirementDate) ?? projected[projected.length - 1] ?? null;
}

function formatTargetDayDelta(forecast: NonNullable<Dashboard["projection"]["targetForecast"]>) {
  const dayDelta = forecast.dayDelta ?? null;
  if (dayDelta === null || !forecast.previousTargetDate || !forecast.targetDate) return <small className="target-day-delta neutral">Add another reading to compare timing</small>;
  if (dayDelta === 0) return <small className="target-day-delta neutral">0 days from previous reading</small>;
  const direction = dayDelta > 0 ? "+" : "-";
  const timing = dayDelta > 0 ? "later" : "earlier";
  const trendClass = dayDelta > 0 ? "negative" : "positive";
  return <small className={`target-day-delta ${trendClass}`}>{direction}{Math.abs(dayDelta)} day{Math.abs(dayDelta) === 1 ? "" : "s"} {timing} than previous reading</small>;
}

function Settings() {
  const [status, setStatus] = useState("");
  const [retirementDate, setRetirementDate] = useState("");
  const [targetFinancialGoal, setTargetFinancialGoal] = useState("1000000");
  useEffect(() => {
    let active = true;
    api<{ profile: { retirementDate: string | null; targetFinancialGoal?: number | null } }>("/api/auth/me")
      .then((result) => {
        if (!active) return;
        setRetirementDate(result.profile?.retirementDate ?? "");
        setTargetFinancialGoal(String(result.profile?.targetFinancialGoal ?? 1000000));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    const result = await api<{ profile: { retirementDate: string | null; targetFinancialGoal: number } }>("/api/profile", {
      method: "PATCH",
      body: JSON.stringify({ retirementDate: retirementDate || null, targetFinancialGoal: Number(targetFinancialGoal) })
    });
    setRetirementDate(result.profile.retirementDate ?? "");
    setTargetFinancialGoal(String(result.profile.targetFinancialGoal ?? 1000000));
    setStatus("Saved profile");
  }

  async function downloadExport() {
    const data = await api("/api/export");
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `WealthTrackerExport-${date}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus(`Downloaded WealthTrackerExport-${date}.json`);
  }

  async function uploadImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const result = await api<any>("/api/import", { method: "POST", body: JSON.stringify({ ...parsed, fileName: file.name }) });
      setStatus(`Imported ${result.rowsImported} rows from ${file.name}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <section className="page">
      <header className="page-header"><h1>Settings & Data</h1></header>
      <div className="settings-grid">
        <form className="settings-form" onSubmit={saveProfile}>
          <label>Target retirement date<input type="date" value={retirementDate} onChange={(event) => setRetirementDate(event.target.value)} /></label>
          <label>Target financial goal<input type="number" min="1" step="0.01" value={targetFinancialGoal} onChange={(event) => setTargetFinancialGoal(event.target.value)} required /></label>
          <button type="submit"><Save size={16} /> Save</button>
        </form>
        <label>Default currency<select defaultValue="GBP"><option>GBP</option><option>USD</option><option>EUR</option></select></label>
        <label>Date format<select defaultValue="yyyy-MM-dd"><option>yyyy-MM-dd</option><option>dd/MM/yyyy</option></select></label>
        <div className="data-actions">
          <button onClick={downloadExport}><FileDown size={16} /> Export JSON</button>
          <label className="file-button">
            <FileUp size={16} /> Import JSON
            <input type="file" accept="application/json,.json" onChange={uploadImport} />
          </label>
        </div>
        {status && <p>{status}</p>}
      </div>
    </section>
  );
}
