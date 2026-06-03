import { Archive, BarChart3, Eye, EyeOff, FileDown, FileUp, LineChart, LogOut, Menu, Plus, Save, Settings as SettingsIcon, Target, Trash2, X } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart as RLineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Account, api, Dashboard, money, ValueEntry } from "./lib/api";

type View = "dashboard" | "accounts" | "review" | "goals" | "insights" | "settings";
type ChartRange = "all" | "6m" | "1y" | "2y" | "4y" | "8y";

const chartRanges: Array<{ key: ChartRange; label: string; months: number | null }> = [
  { key: "all", label: "All", months: null },
  { key: "6m", label: "6M", months: 6 },
  { key: "1y", label: "1Y", months: 12 },
  { key: "2y", label: "2Y", months: 24 },
  { key: "4y", label: "4Y", months: 48 },
  { key: "8y", label: "8Y", months: 96 }
];
const chartGrid = "#2c2c2c";
const chartAxis = "#9a9a9a";
const chartGreen = "#56c863";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("wealthtrack_token"));
  const [view, setView] = useState<View>("dashboard");
  const [privacy, setPrivacy] = useState(localStorage.getItem("wealthtrack_privacy") === "true");
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

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
        {view === "dashboard" && <DashboardView hidden={privacy} />}
        {view === "accounts" && (selectedAccount ? <AccountDetail account={selectedAccount} hidden={privacy} onBack={() => setSelectedAccount(null)} /> : <AccountsView hidden={privacy} onOpen={setSelectedAccount} />)}
        {view === "review" && <MonthlyReview hidden={privacy} />}
        {view === "goals" && <Goals hidden={privacy} />}
        {view === "insights" && <Insights />}
        {view === "settings" && <Settings />}
      </main>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await api<{ token: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      onLogin(result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }
  return (
    <main className="login-screen">
      <form className="login-panel" onSubmit={submit}>
        <h1>WealthTrack</h1>
        <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required /></label>
        <label>Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required /></label>
        {error && <p role="alert" className="error">{error}</p>}
        <button type="submit"><LogOut size={18} /> Sign in</button>
      </form>
    </main>
  );
}

function useDashboard() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => { api<Dashboard>("/api/dashboard").then(setDashboard); }, [reloadKey]);
  return { dashboard, reload: () => setReloadKey((key) => key + 1) };
}

function DashboardView({ hidden }: { hidden: boolean }) {
  const { dashboard } = useDashboard();
  const [chartRange, setChartRange] = useState<ChartRange>("all");
  if (!dashboard) return <div className="page">Loading...</div>;
  const chartData = dashboard.series.map((point) => ({
    ...point,
    timestamp: new Date(`${point.date}T00:00:00`).getTime()
  })).filter((point) => Number.isFinite(point.timestamp));
  const latestTimestamp = chartData.length ? Math.max(...chartData.map((point) => point.timestamp)) : Date.now();
  const selectedRange = chartRanges.find((range) => range.key === chartRange) ?? chartRanges[0];
  const rangeStart = selectedRange.months === null ? null : subtractMonths(latestTimestamp, selectedRange.months);
  const filteredChartData = rangeStart === null ? chartData : chartData.filter((point) => point.timestamp >= rangeStart);
  const visibleChartData = filteredChartData.length ? filteredChartData : chartData.slice(-1);
  const dataMin = visibleChartData.length ? Math.min(...visibleChartData.map((point) => point.timestamp)) : latestTimestamp;
  const dataMax = visibleChartData.length ? Math.max(...visibleChartData.map((point) => point.timestamp)) : latestTimestamp;
  const xDomain = paddedDateDomain(dataMin, dataMax);
  return (
    <section className="page">
      <header className="page-header"><h1>Dashboard</h1><span>{dashboard.accounts.filter((account) => !account.isArchived).length} active accounts</span></header>
      <div className="chart-row">
        <section className="panel wide">
          <div className="panel-title-row">
            <h2>Net worth history</h2>
            <div className="range-controls" aria-label="Net worth history range">
              {chartRanges.map((range) => (
                <button key={range.key} className={chartRange === range.key ? "active" : ""} onClick={() => setChartRange(range.key)}>{range.label}</button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <RLineChart data={visibleChartData} margin={{ top: 8, right: 18, bottom: 0, left: 48 }}>
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
              <YAxis stroke={chartAxis} tick={{ fill: chartAxis }} />
              <Tooltip
                labelFormatter={(value) => formatChartDate(Number(value))}
                formatter={(value) => money(Number(value), "GBP", hidden)}
                contentStyle={{ background: "#1f1f1f", border: "1px solid #333", borderRadius: 8, color: "#fff" }}
              />
              <Line type="monotone" dataKey="netWorth" stroke={chartGreen} strokeWidth={3} dot={false} activeDot={{ r: 4, fill: chartGreen }} />
            </RLineChart>
          </ResponsiveContainer>
        </section>
        <section className="panel">
          <h2>Allocation</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={dashboard.allocation} margin={{ top: 8, right: 18, bottom: 0, left: 48 }}><CartesianGrid strokeDasharray="4 6" stroke={chartGrid} /><XAxis dataKey="category" stroke={chartAxis} tick={{ fill: chartAxis }} /><YAxis stroke={chartAxis} tick={{ fill: chartAxis }} /><Tooltip formatter={(value) => money(Number(value), "GBP", hidden)} contentStyle={{ background: "#1f1f1f", border: "1px solid #333", borderRadius: 8, color: "#fff" }} /><Legend /><Bar dataKey="value" fill={chartGreen} /></BarChart>
          </ResponsiveContainer>
        </section>
      </div>
      <div className="metric-grid">
        <Metric label="Net worth" value={money(dashboard.totals.netWorth, "GBP", hidden)} />
        <Metric label="Assets" value={money(dashboard.totals.assets, "GBP", hidden)} />
        <Metric label="Liabilities" value={money(dashboard.totals.liabilities, "GBP", hidden)} />
        <Metric label="Latest change" value={money(dashboard.totals.monthlyChange.change, "GBP", hidden)} />
      </div>
      <div className="card-grid">
        {dashboard.insights.map((insight) => <article className="card" key={insight.title}><h3>{insight.title}</h3><p>{insight.body}</p></article>)}
        {dashboard.staleAccounts.map((account) => <article className="card warning" key={account.id}><h3>{account.name}</h3><p>Last updated {account.latestValueDate}</p></article>)}
      </div>
    </section>
  );
}

function subtractMonths(timestamp: number, months: number) {
  const date = new Date(timestamp);
  date.setMonth(date.getMonth() - months);
  return date.getTime();
}

function paddedDateDomain(min: number, max: number): [number, number] {
  if (min === max) {
    const day = 24 * 60 * 60 * 1000;
    return [min - day, max + day];
  }
  return [min, max];
}

function formatChartDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "short", day: "2-digit" }).format(new Date(timestamp));
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
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
          <thead><tr><th>Name</th><th>Kind</th><th>Category</th><th>Latest value</th><th>Date</th><th></th></tr></thead>
          <tbody>{accounts.map((account) => (
            <tr key={account.id}>
              <td><button className="link-button" onClick={() => onOpen(account)}>{account.name}</button></td>
              <td>{account.kind}</td><td>{account.category}</td><td>{money(Number(account.latestValue || 0), account.currency, hidden)}</td><td>{account.latestValueDate || "-"}</td>
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
  const [values, setValues] = useState<ValueEntry[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [chartRange, setChartRange] = useState<ChartRange>("all");
  const [entry, setEntry] = useState({ value: "", valueDate: new Date().toISOString().slice(0, 10), note: "" });
  const load = () => api<{ values: ValueEntry[] }>(`/api/accounts/${account.id}/values`).then((result) => setValues(result.values));
  useEffect(() => {
    load();
  }, [account.id]);
  const chartData = values.map((value) => ({
    ...value,
    timestamp: new Date(`${value.valueDate}T00:00:00`).getTime()
  })).filter((value) => Number.isFinite(value.timestamp));
  const latestTimestamp = chartData.length ? Math.max(...chartData.map((value) => value.timestamp)) : Date.now();
  const selectedRange = chartRanges.find((range) => range.key === chartRange) ?? chartRanges[0];
  const rangeStart = selectedRange.months === null ? null : subtractMonths(latestTimestamp, selectedRange.months);
  const filteredChartData = rangeStart === null ? chartData : chartData.filter((value) => value.timestamp >= rangeStart);
  const visibleChartData = filteredChartData.length ? filteredChartData : chartData.slice(-1);
  const dataMin = visibleChartData.length ? Math.min(...visibleChartData.map((value) => value.timestamp)) : latestTimestamp;
  const dataMax = visibleChartData.length ? Math.max(...visibleChartData.map((value) => value.timestamp)) : latestTimestamp;
  const xDomain = paddedDateDomain(dataMin, dataMax);
  const compare = useMemo(() => {
    const points = selected.map((id) => values.find((value) => value.id === id)).filter(Boolean) as ValueEntry[];
    if (points.length !== 2) return null;
    return { from: points[0], to: points[1], change: points[1].value - points[0].value, percent: points[0].value === 0 ? null : (points[1].value - points[0].value) / points[0].value };
  }, [selected, values]);
  async function addValue(event: FormEvent) {
    event.preventDefault();
    await api(`/api/accounts/${account.id}/values`, { method: "POST", body: JSON.stringify({ value: Number(entry.value), valueDate: entry.valueDate, note: entry.note }) });
    setEntry({ value: "", valueDate: entry.valueDate, note: "" });
    load();
  }
  return (
    <section className="page">
      <header className="page-header"><h1>{account.name}</h1><button onClick={onBack}>Back</button></header>
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
              <button key={range.key} className={chartRange === range.key ? "active" : ""} onClick={() => setChartRange(range.key)}>{range.label}</button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <RLineChart data={visibleChartData}>
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
            <YAxis stroke={chartAxis} tick={{ fill: chartAxis }} />
            <Tooltip
              labelFormatter={(value) => formatChartDate(Number(value))}
              formatter={(value) => money(Number(value), account.currency, hidden)}
              contentStyle={{ background: "#1f1f1f", border: "1px solid #333", borderRadius: 8, color: "#fff" }}
            />
            <Line type="monotone" dataKey="value" stroke={chartGreen} strokeWidth={3} dot={false} activeDot={{ r: 4, fill: chartGreen }} />
          </RLineChart>
        </ResponsiveContainer>
      </section>
      {compare && <p className="compare-result">Selected: {compare.from.valueDate} to {compare.to.valueDate} = {money(compare.change, account.currency, hidden)} {compare.percent === null ? "(from zero)" : `(${(compare.percent * 100).toFixed(1)}%)`}</p>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Select</th><th>Date</th><th>Value</th><th>Source</th><th>Note</th><th></th></tr></thead>
          <tbody>{values.map((value) => (
            <tr key={value.id} className={selected.includes(value.id) ? "selected" : ""}>
              <td><button aria-label={`Compare ${value.valueDate}`} onClick={() => setSelected((items) => [...items.filter((id) => id !== value.id), value.id].slice(-2))}>{selected.includes(value.id) ? "B" : "A/B"}</button></td>
              <td>{value.valueDate}</td><td>{money(value.value, account.currency, hidden)}</td><td>{value.source}</td><td>{value.note}</td>
              <td><button title="Delete value" onClick={async () => { await api(`/api/values/${value.id}`, { method: "DELETE" }); load(); }}><Trash2 size={16} /></button></td>
            </tr>
          ))}</tbody>
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

function Insights() {
  const { dashboard } = useDashboard();
  return <section className="page"><header className="page-header"><h1>Insights</h1></header><div className="card-grid">{dashboard?.insights.map((insight) => <article className="card" key={insight.title}><h3>{insight.title}</h3><p>{insight.body}</p></article>)}</div></section>;
}

function Settings() {
  const [status, setStatus] = useState("");
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
