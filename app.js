/* =========================================================
   1. Load and clean the data
   DATA comes from data/data.js  ->  const DATA = [ {...}, ... ];
   ========================================================= */
const raw = Array.isArray(DATA) ? DATA : Object.values(DATA).find(Array.isArray);

const toBool = v => ["1", "true", "yes", "y"].includes(String(v).trim().toLowerCase());
const toNum = v => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || isNaN(n) ? null : n;
};

const ALL = (raw || []).map(r => ({
  ...r,
  churned: toBool(r.churned),
  monthly_fee: toNum(r.monthly_fee) ?? 0,
  days_since_last_login: toNum(r.days_since_last_login),
  account_age_months: toNum(r.account_age_months),
}));

/* =========================================================
   2. Helpers
   ========================================================= */
const $ = id => document.getElementById(id);
const pct = x => (x * 100).toFixed(1) + "%";
const avg = arr => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);

const COLORS = { churn: "#f0766b", keep: "#5ec4b6", text: "#ece6f2", muted: "#9a90a8", line: "#2e2639" };

// Put a value into a labelled group: bucket(12, [3,6,12,24], labels)
function bucket(v, edges, labels) {
  if (v === null) return null;
  for (let i = 0; i < edges.length; i++) if (v <= edges[i]) return labels[i];
  return labels[labels.length - 1];
}

// Churn rate and size for each group
function groupRate(rows, keyFn, order) {
  const m = {};
  rows.forEach(r => {
    const k = keyFn(r);
    if (k === null || k === undefined || k === "") return;
    m[k] = m[k] || { n: 0, c: 0 };
    m[k].n++;
    if (r.churned) m[k].c++;
  });
  const keys = order || Object.keys(m).sort();
  return keys.filter(k => m[k]).map(k => ({ key: k, n: m[k].n, rate: m[k].c / m[k].n }));
}

const LOGIN_LABELS = ["0–7", "8–14", "15–30", "31–60", "61+"];
const AGE_LABELS = ["0–3", "4–6", "7–12", "13–24", "25+"];

/* =========================================================
   3. Filters
   ========================================================= */
function fillSelect(id, column, allLabel) {
  const el = $(id);
  const values = [...new Set(ALL.map(r => r[column]).filter(v => v !== undefined && v !== null && v !== ""))].sort();
  el.innerHTML = "";
  [["", allLabel], ...values.map(v => [v, v])].forEach(([value, text]) => {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = text;
    el.appendChild(o);
  });
  el.disabled = values.length === 0;
}

function filteredRows() {
  const country = $("fCountry").value;
  const plan = $("fSub").value;
  return ALL.filter(r =>
    (!country || String(r.country) === country) &&
    (!plan || String(r.subscription_type) === plan)
  );
}

/* =========================================================
   4. KPIs and hero
   ========================================================= */
function renderKpis(rows) {
  const total = rows.length;
  const churned = rows.filter(r => r.churned);
  const kept = total - churned.length;

  $("rate").textContent = pct(churned.length / total);
  $("rateSub").textContent =
    churned.length.toLocaleString() + " of " + total.toLocaleString() + " subscribers have left";

  // Set widths after paint so the CSS transition plays
  requestAnimationFrame(() => {
    $("barChurn").style.width = (churned.length / total) * 100 + "%";
    $("barKeep").style.width = (kept / total) * 100 + "%";
  });
  $("legChurn").textContent = "Churned " + churned.length.toLocaleString();
  $("legKeep").textContent = "Retained " + kept.toLocaleString();

  $("kpiTotal").textContent = total.toLocaleString();
  $("kpiFee").textContent = "$" + avg(rows.map(r => r.monthly_fee)).toFixed(2);
  $("kpiLost").textContent = "$" + churned.reduce((s, r) => s + r.monthly_fee, 0).toLocaleString();

  const logins = rows.map(r => r.days_since_last_login).filter(v => v !== null);
  $("kpiLogin").textContent = logins.length ? avg(logins).toFixed(1) : "–";
}

/* =========================================================
   5. Plotly charts
   ========================================================= */
const baseLayout = {
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(0,0,0,0)",
  font: { family: "Manrope, system-ui, sans-serif", color: COLORS.muted, size: 12 },
  margin: { t: 10, r: 10, b: 40, l: 48 },
  xaxis: { gridcolor: COLORS.line, zeroline: false, fixedrange: true },
  yaxis: { gridcolor: COLORS.line, zeroline: false, fixedrange: true },
  hoverlabel: { bgcolor: "#2e2639", font: { color: COLORS.text } },
};
const plotConfig = { displayModeBar: false, responsive: true };

function barChart(divId, groups, horizontal = false, mode = "rate") {
  const div = $(divId);

  // Column missing from the data: show a short message instead of an empty chart
  if (!groups.length) {
    Plotly.purge(div);
    div.textContent = "This column was not found in your data.";
    div.classList.add("empty");
    return;
  }
  if (div.classList.contains("empty")) {
    div.textContent = "";
    div.classList.remove("empty");
  }

  const money = mode === "money";
  const values = groups.map(g => (money ? Math.round(g.lost) : +(g.rate * 100).toFixed(1)));
  const labels = groups.map(g => String(g.key));
  const val = horizontal ? "x" : "y";
  const lab = horizontal ? "y" : "x";

  const trace = {
    type: "bar",
    x: horizontal ? values : labels,
    y: horizontal ? labels : values,
    orientation: horizontal ? "h" : "v",
    marker: { color: money ? COLORS.keep : COLORS.churn },
    customdata: groups.map(g => g.n),
    hovertemplate:
      "%{" + lab + "}<br>" +
      (money ? "$%{" + val + ":,.0f} lost per month" : "%{" + val + "}% churned") +
      "<br>%{customdata:,} subscribers<extra></extra>",
  };

  const layout = JSON.parse(JSON.stringify(baseLayout));
  const valueAxis = horizontal ? "xaxis" : "yaxis";
  const labelAxis = horizontal ? "yaxis" : "xaxis";
  if (money) layout[valueAxis].tickprefix = "$";
  else layout[valueAxis].ticksuffix = "%";
  layout[valueAxis].rangemode = "tozero";
  layout[labelAxis].showgrid = false;
  layout[labelAxis].type = "category";
  if (horizontal) {
    layout.yaxis.autorange = "reversed";
    layout.margin.l = 100;
  }

  Plotly.react(div, [trace], layout, plotConfig);
}

// Revenue lost (sum of monthly fees of churned subscribers) for each group
function groupRevenue(rows, keyFn) {
  const m = {};
  rows.forEach(r => {
    const k = keyFn(r);
    if (k === null || k === undefined || k === "") return;
    m[k] = m[k] || { n: 0, lost: 0 };
    m[k].n++;
    if (r.churned) m[k].lost += r.monthly_fee;
  });
  return Object.keys(m).map(k => ({ key: k, n: m[k].n, lost: m[k].lost }));
}

function renderCharts(rows) {
  barChart("chLogin", groupRate(rows, r => bucket(r.days_since_last_login, [7, 14, 30, 60], LOGIN_LABELS), LOGIN_LABELS));
  barChart("chAge", groupRate(rows, r => bucket(r.account_age_months, [3, 6, 12, 24], AGE_LABELS), AGE_LABELS));
  barChart("chPlan", groupRate(rows, r => r.subscription_type));

  const topCountries = groupRate(rows, r => r.country)
    .sort((a, b) => b.n - a.n)
    .slice(0, 10)
    .sort((a, b) => b.rate - a.rate);
  barChart("chCountry", topCountries, true);
}

/* =========================================================
   6. Churned vs retained table
   ========================================================= */
const METRICS = [
  ["days_since_last_login", "Days since last login"],
  ["watch_sessions_per_week", "Watch sessions per week"],
  ["avg_watch_time_minutes", "Average watch time (min)"],
  ["completion_rate", "Completion rate"],
  ["recommendation_click_rate", "Recommendation click rate"],
  ["binge_watch_sessions", "Binge sessions"],
  ["content_interactions", "Content interactions"],
  ["devices_used", "Devices used"],
  ["account_age_months", "Account age (months)"],
  ["monthly_fee", "Monthly fee"],
];

function renderDrivers(rows) {
  const churned = rows.filter(r => r.churned);
  const kept = rows.filter(r => !r.churned);
  const body = $("drivers");
  body.innerHTML = "";

  METRICS.forEach(([col, label]) => {
    const a = avg(churned.map(r => toNum(r[col])).filter(v => v !== null));
    const b = avg(kept.map(r => toNum(r[col])).filter(v => v !== null));
    if (a === null || b === null) return; // column missing, skip it

    const diff = b ? ((a - b) / b) * 100 : 0;
    const cells = [label, a.toFixed(1), b.toFixed(1), (diff > 0 ? "+" : "") + diff.toFixed(0) + "%"];

    const tr = document.createElement("tr");
    cells.forEach((text, i) => {
      const td = document.createElement("td");
      td.textContent = text;
      if (i > 0) td.className = "n";
      if (i === 3 && Math.abs(diff) >= 15) td.style.color = diff > 0 ? COLORS.churn : COLORS.keep;
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}

/* =========================================================
   7. Extra views (Engagement, Revenue, Customers, Data quality)
   ========================================================= */
const SESS_LABELS = ["0–1", "2–3", "4–6", "7+"];
const COMP_LABELS = ["0–25", "26–50", "51–75", "76–100"];
const AGE_GROUPS = ["≤24", "25–34", "35–44", "45–54", "55+"];

// completion_rate can be stored as 0–1 or 0–100; detect which one
function scaleTo100(col) {
  let max = -Infinity;
  ALL.forEach(r => { const v = toNum(r[col]); if (v !== null && v > max) max = v; });
  return max !== -Infinity && max <= 1 ? 100 : 1;
}

function renderDataQuality() {
  const cols = Object.keys(ALL[0]);
  const body = $("quality");
  body.innerHTML = "";
  $("dataSummary").textContent =
    ALL.length.toLocaleString() + " rows and " + cols.length + " columns (filters do not apply here)";

  cols.forEach(col => {
    const filled = ALL.map(r => r[col]).filter(v => v !== null && v !== undefined && v !== "");
    const nums = filled.filter(v => typeof v === "number");
    const isNum = filled.length > 0 && nums.length / filled.length > 0.9;

    let type, info;
    if (col === "churned") {
      type = "True / false"; info = "true or false";
    } else if (isNum) {
      let lo = Infinity, hi = -Infinity;
      nums.forEach(v => { if (v < lo) lo = v; if (v > hi) hi = v; });
      type = "Number"; info = lo + " to " + hi;
    } else {
      type = "Text"; info = new Set(filled).size + " distinct values";
    }

    const cells = [col, type, ((filled.length / ALL.length) * 100).toFixed(1) + "%", info];
    const tr = document.createElement("tr");
    cells.forEach((text, i) => {
      const td = document.createElement("td");
      td.textContent = text;
      if (i === 2) td.className = "n";
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}

const VIEWS = {
  overview(rows) {
    renderKpis(rows);
    renderCharts(rows);
    renderDrivers(rows);
  },
  engagement(rows) {
    const s = scaleTo100("completion_rate");
    barChart("chSessions", groupRate(rows, r => bucket(toNum(r.watch_sessions_per_week), [1, 3, 6], SESS_LABELS), SESS_LABELS));
    barChart("chCompletion", groupRate(rows, r => {
      const v = toNum(r.completion_rate);
      return bucket(v === null ? null : v * s, [25, 50, 75], COMP_LABELS);
    }, COMP_LABELS));
    barChart("chGenre", groupRate(rows, r => r.favorite_genre).sort((a, b) => b.rate - a.rate), true);
    barChart("chDevice", groupRate(rows, r => r.primary_device));
  },
  revenue(rows) {
    barChart("chRevPlan", groupRevenue(rows, r => r.subscription_type), false, "money");
    barChart("chPayment", groupRate(rows, r => r.payment_method));
    barChart("chRevCountry", groupRevenue(rows, r => r.country).sort((a, b) => b.lost - a.lost).slice(0, 10), true, "money");
  },
  customers(rows) {
    barChart("chAgeGroup", groupRate(rows, r => bucket(toNum(r.age), [24, 34, 44, 54], AGE_GROUPS), AGE_GROUPS));
    barChart("chGender", groupRate(rows, r => r.gender));
    barChart("chDevices", groupRate(rows, r => toNum(r.devices_used)));
    barChart("chRating", groupRate(rows, r => toNum(r.rating_given)));
  },
  data() {
    renderDataQuality();
  },
};

const TITLES = {
  overview: ["Overview", "Who leaves, when, and what it costs in revenue."],
  engagement: ["Engagement", "How watching habits relate to leaving."],
  revenue: ["Revenue", "Where the lost monthly revenue comes from."],
  customers: ["Customers", "Who the subscribers are and who churns."],
  data: ["Data quality", "What is in your file and how complete it is."],
};

/* =========================================================
   8. Navigation and startup
   ========================================================= */
let currentView = "overview";

function render() {
  const rows = filteredRows();
  $("sideCount").textContent =
    "Showing " + rows.length.toLocaleString() + " of " + ALL.length.toLocaleString() + " subscribers";

  if (rows.length === 0 && currentView !== "data") {
    showError("No subscribers match these filters.");
    return;
  }
  $("error").hidden = true;
  VIEWS[currentView](rows);
}

function showView(name) {
  currentView = name;
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + name));
  document.querySelectorAll(".nav button").forEach(b => {
    const on = b.dataset.view === name;
    b.classList.toggle("active", on);
    if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  $("title").textContent = TITLES[name][0];
  $("subtitle").textContent = TITLES[name][1];
  $("filters").hidden = name === "data"; // filters do not apply to the data quality table
  render();                              // draw after the view is visible so Plotly sizes correctly
  window.scrollTo(0, 0);
}

function showError(text) {
  const el = $("error");
  el.textContent = text;
  el.hidden = false;
}

function init() {
  if (ALL.length === 0) {
    showError("No rows found. Check that data/data.js starts with: const DATA = [ ... ];");
    return;
  }
  if (!("churned" in ALL[0])) {
    showError('The data needs a "churned" column. Columns found: ' + Object.keys(ALL[0]).join(", "));
    return;
  }
  fillSelect("fCountry", "country", "All countries");
  fillSelect("fSub", "subscription_type", "All plans");

  $("fCountry").addEventListener("change", render);
  $("fSub").addEventListener("change", render);
  $("reset").addEventListener("click", () => {
    $("fCountry").value = "";
    $("fSub").value = "";
    render();
  });
  document.querySelectorAll(".nav button").forEach(b =>
    b.addEventListener("click", () => showView(b.dataset.view))
  );

  showView("overview");
}

init();
