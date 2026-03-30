const SAMPLE_REPORT_PATH = "/public/data/report.json";
const THEME_STORAGE_KEY = "revit-ifc-cloud-theme";

const currencyFormatterCache = new Map();
const compactCurrencyFormatterCache = new Map();

const app = document.querySelector("#app");
const body = document.body;
const metricTemplate = document.querySelector("#metric-template");
const materialTemplate = document.querySelector("#material-template");
const uploadInput = document.querySelector("#report-upload");
const reloadButton = document.querySelector("#reload-sample");
const themeToggle = document.querySelector("#theme-toggle");
const themeToggleLabel = document.querySelector("#theme-toggle-label");
const workspaceName = document.querySelector("#workspace-name");
const workspacePeriod = document.querySelector("#workspace-period");
const heroTitle = document.querySelector("#hero-title");
const heroBadges = document.querySelector("#hero-badges");
const heroTrends = document.querySelector("#hero-trends");
const briefMeta = document.querySelector("#brief-meta");
const briefGrid = document.querySelector("#brief-grid");
const briefCallout = document.querySelector("#brief-callout");
const sidebarStats = document.querySelector("#sidebar-stats");
const footerWorkspace = document.querySelector("#footer-workspace");
const footerTheme = document.querySelector("#footer-theme");
const footerTitle = document.querySelector("#footer-title");

function getCurrencyFormatter(currency) {
  if (!currencyFormatterCache.has(currency)) {
    currencyFormatterCache.set(
      currency,
      new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }),
    );
  }
  return currencyFormatterCache.get(currency);
}

function getCompactCurrencyFormatter(currency) {
  if (!compactCurrencyFormatterCache.has(currency)) {
    compactCurrencyFormatterCache.set(
      currency,
      new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
        notation: "compact",
        maximumFractionDigits: 2,
      }),
    );
  }
  return compactCurrencyFormatterCache.get(currency);
}

function formatCurrency(value, currency) {
  return getCurrencyFormatter(currency).format(Number(value || 0));
}

function formatCompactCurrency(value, currency) {
  return getCompactCurrencyFormatter(currency).format(Number(value || 0));
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) {
    return "Latest sync";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDate(value) {
  if (!value) {
    return "TBD";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
  }).format(date);
}

function truncatePath(value) {
  const parts = String(value || "").split("/");
  return parts[parts.length - 1] || value;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function coverageRatio(row) {
  const required = Number(row.required_quantity || 0);
  const covered = Number(row.covered_quantity || 0);
  if (required <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (covered / required) * 100));
}

function overallCoverage(summary) {
  const available = Number(summary.available_count || 0);
  const partial = Number(summary.partial_count || 0);
  const unavailable = Number(summary.unavailable_count || 0);
  const total = available + partial + unavailable;
  if (!total) {
    return 0;
  }
  return Math.round(((available + partial * 0.5) / total) * 100);
}

function average(values, key) {
  if (!values.length) {
    return 0;
  }

  const total = values.reduce((sum, item) => sum + Number(item[key] || 0), 0);
  return total / values.length;
}

function initializeTheme() {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  const preferredTheme = storedTheme || "night";
  applyTheme(preferredTheme);
}

function applyTheme(theme) {
  const normalizedTheme = theme === "day" ? "day" : "night";
  body.dataset.theme = normalizedTheme;
  localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme);

  const nextLabel = normalizedTheme === "night" ? "Day mode" : "Night mode";
  themeToggle.setAttribute("aria-pressed", normalizedTheme === "day" ? "true" : "false");
  themeToggleLabel.textContent = nextLabel;
  footerTheme.textContent = normalizedTheme === "night" ? "Night theme" : "Day theme";
}

function toggleTheme() {
  applyTheme(body.dataset.theme === "night" ? "day" : "night");
}

function updateNavbarState() {
  body.classList.toggle("nav-compact", window.scrollY > 32);
}

function initializeNavbarState() {
  updateNavbarState();
  window.addEventListener("scroll", updateNavbarState, { passive: true });
}

function normalizeReport(report) {
  const summary = report.summary || {};
  const derivedPortfolio = {
    name: report.portfolio?.name || report.account?.portfolio_name || report.project?.name || "IFC Portfolio",
    client: report.portfolio?.client || report.project?.client || report.account?.company || "Project stakeholders",
    program_type:
      report.portfolio?.program_type ||
      (report.project?.discipline ? `${report.project.discipline} delivery workspace` : "IFC operations workspace"),
    region: report.portfolio?.region || report.project?.location || "Active region",
    phase: report.portfolio?.phase || report.project?.stage || "Portfolio review",
    owner: report.portfolio?.owner || report.project?.owner || "Operations desk",
    currency: report.portfolio?.currency || report.currency || "INR",
    contract_value: report.portfolio?.contract_value || report.account?.managed_spend || 0,
    budget_protected: report.portfolio?.budget_protected || summary.projected_margin_saved || 0,
    readiness_score: report.portfolio?.readiness_score || summary.readiness_score || overallCoverage(summary),
    model_sync_status:
      report.portfolio?.model_sync_status ||
      (report.account?.active_projects ? `${report.account.active_projects} active projects live` : "Portfolio synced"),
    portfolio_health:
      report.portfolio?.portfolio_health ||
      `Model health score ${report.account?.model_health_score || 0} with forecast confidence ${summary.forecast_confidence || 0}%.`,
    tier: report.portfolio?.tier || report.account?.workspace_tier || "Signature",
    connected_warehouses: report.portfolio?.connected_warehouses || report.account?.connected_warehouses || 0,
    active_projects: report.portfolio?.active_projects || report.account?.active_projects || 0,
  };

  const kpis =
    Array.isArray(report.kpis) && report.kpis.length
      ? report.kpis
      : Array.isArray(report.portfolio_metrics) && report.portfolio_metrics.length
        ? report.portfolio_metrics.map((metric) => ({
            label: metric.label,
            value: metric.value,
            delta: metric.delta,
            trend: metric.trend || (metric.tone === "positive" ? "up" : metric.tone === "negative" ? "down" : "flat"),
            note: metric.note,
          }))
        : buildMetricFallback({ ...report, portfolio: derivedPortfolio });

  const activeProjects =
    Array.isArray(report.active_projects) && report.active_projects.length
      ? report.active_projects
      : (report.sites || []).map((site) => ({
          name: site.name,
          discipline: report.project?.discipline || "Project",
          location: site.location || report.project?.location || "Active market",
          phase: site.phase || report.project?.stage || "Portfolio review",
          readiness: site.readiness || site.coverage || summary.readiness_score || 0,
          shortage_value: site.shortage_value || 0,
          packages_at_risk: site.packages_at_risk || 0,
          last_sync: site.last_sync || "Latest review",
          status: site.status || "watch",
        }));

  const vendors = (report.vendors || []).map((vendor) => ({
    name: vendor.name,
    tier: vendor.tier || vendor.category || vendor.status || "Managed",
    on_time_rate: vendor.on_time_rate || vendor.fulfillment_rate || 0,
    avg_lead_time_days: vendor.avg_lead_time_days || vendor.lead_time_days || 0,
    quote_acceptance: vendor.quote_acceptance || vendor.fulfillment_rate || 0,
    available_capacity: vendor.available_capacity || vendor.status || "Managed",
    coverage_role: vendor.coverage_role || vendor.category || "Strategic supplier",
    exposure: vendor.exposure || 0,
  }));

  const risks =
    Array.isArray(report.risks) && report.risks.length
      ? report.risks
      : (report.alerts || []).map((alert) => ({
          severity: alert.severity || "medium",
          title: alert.title,
          impact: alert.impact || 0,
          owner: alert.owner || "Operations desk",
          due_in: alert.eta || "TBD",
          status: alert.detail || "Open",
        }));

  const activity = (report.activity || []).map((entry) => ({
    time: entry.time || "Now",
    event: entry.event || `${entry.user || "System"} ${String(entry.action || "updated").toLowerCase()}. ${entry.detail || ""}`.trim(),
    severity: entry.severity || "info",
  }));

  const modelPackages =
    Array.isArray(report.model_packages) && report.model_packages.length
      ? report.model_packages
      : (report.milestones || []).map((milestone) => ({
          name: milestone.name,
          discipline: "Milestone",
          version: report.project?.ifc_schema || "IFC",
          sync_status: milestone.status || "Queued",
          entities: 0,
          coverage: summary.forecast_confidence || derivedPortfolio.readiness_score || 0,
          detail: milestone.detail || "",
          date: milestone.date || "",
        }));

  const recommendedActions =
    Array.isArray(report.recommended_actions) && report.recommended_actions.length
      ? report.recommended_actions
      : (report.procurement_pipeline || []).map((item) => ({
          action: `${item.stage || "Pipeline stage"}: ${item.note || "Advance package decisions"}`,
          priority: Number(item.count || 0) > 4 ? "high" : "medium",
          owner: report.project?.owner || "Operations desk",
          impact: `${item.count || 0} items · ${formatCompactCurrency(item.value || 0, report.currency || "INR")}`,
        }));

  const procurementPipeline = (report.procurement_pipeline || []).map((item) => ({
    stage: item.stage,
    count: item.count || 0,
    value: item.value || 0,
    note: item.note || "Commercial action required.",
  }));

  const milestones = (report.milestones || []).map((milestone) => ({
    name: milestone.name,
    date: milestone.date,
    status: milestone.status || "Upcoming",
    detail: milestone.detail || "",
  }));

  return {
    ...report,
    portfolio: derivedPortfolio,
    kpis,
    active_projects: activeProjects,
    vendors,
    risks,
    activity,
    model_packages: modelPackages,
    recommended_actions: recommendedActions,
    procurement_pipeline: procurementPipeline,
    milestones,
  };
}

function buildMetricFallback(report) {
  const summary = report.summary || {};
  const currency = report.currency || report.portfolio?.currency || "INR";
  return [
    {
      label: "Portfolio readiness",
      value: `${report.portfolio?.readiness_score || overallCoverage(summary)}%`,
      delta: "Live",
      trend: "up",
      note: "Calculated from available, partial, and unavailable material coverage",
    },
    {
      label: "Exposure value",
      value: formatCompactCurrency(summary.total_shortage_cost || 0, currency),
      delta: "Tracked",
      trend: "down",
      note: "Current shortage exposure across active materials",
    },
    {
      label: "Available coverage",
      value: formatNumber(summary.available_count),
      delta: "Covered",
      trend: "up",
      note: "Materials fully covered from approved inventory",
    },
    {
      label: "Needs top-up",
      value: formatNumber(summary.partial_count),
      delta: "Pending",
      trend: "down",
      note: "Packages requiring supplemental procurement",
    },
    {
      label: "Escalations",
      value: formatNumber(summary.unavailable_count),
      delta: "Open",
      trend: "down",
      note: "Packages blocked by zero stock or sourcing gaps",
    },
  ];
}

function createMetricCard(metric) {
  const fragment = metricTemplate.content.cloneNode(true);
  const delta = fragment.querySelector(".metric-delta");

  fragment.querySelector(".metric-label").textContent = metric.label;
  fragment.querySelector(".metric-value").textContent = metric.value;
  fragment.querySelector(".metric-footnote").textContent = metric.note || "";
  delta.textContent = metric.delta || "Stable";
  delta.className = `metric-delta ${slugify(metric.trend || "flat")}`;

  return fragment;
}

function createStatRow(label, value) {
  const wrapper = document.createElement("div");
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");
  dt.textContent = label;
  dd.textContent = value;
  wrapper.append(dt, dd);
  return wrapper;
}

function createTag(text) {
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = text;
  return tag;
}

function createSectionGroup(id, kicker, title, ...content) {
  const section = document.createElement("section");
  section.id = id;
  section.className = "section-group";

  const header = document.createElement("div");
  header.className = "section-shell";
  header.innerHTML = `
    <div class="section-header">
      <div>
        <p class="section-kicker">${kicker}</p>
        <h2 class="section-heading">${title}</h2>
      </div>
    </div>
  `;

  const body = document.createElement("div");
  body.className = "section-body";
  content.forEach((node) => body.append(node));

  section.append(header, body);
  return section;
}

function createEmptyCard(copy) {
  const card = document.createElement("article");
  card.className = "material-card empty-card";
  card.innerHTML = `
    <p class="material-name">Nothing here</p>
    <p class="empty-copy">${copy}</p>
  `;
  return card;
}

function createSectionHeader(kicker, title) {
  const header = document.createElement("div");
  header.className = "status-card";
  header.innerHTML = `
    <p class="section-kicker">${kicker}</p>
    <h3 class="section-title">${title}</h3>
  `;
  return header;
}

function buildBriefItems(report) {
  const portfolio = report.portfolio || {};
  const risks = Array.isArray(report.risks) ? report.risks : [];
  const highPriorityAction = Array.isArray(report.recommended_actions)
    ? report.recommended_actions.find((action) => slugify(action.priority) === "high")
    : null;

  return [
    {
      label: "Budget protected",
      value: formatCompactCurrency(portfolio.budget_protected || 0, portfolio.currency || report.currency || "INR"),
    },
    {
      label: "Model sync",
      value: portfolio.model_sync_status || "Portfolio aligned",
    },
    {
      label: "Next decision",
      value: highPriorityAction?.action || risks[0]?.title || "No escalations pending",
    },
  ];
}

function createMiniChartMarkup(items, key, currency) {
  if (!Array.isArray(items) || !items.length) {
    return `<div class="empty-inline">Trendline will appear once a multi-period sample is available.</div>`;
  }

  const max = Math.max(...items.map((item) => Number(item[key] || 0)), 1);
  return items
    .map(
      (item) => `
        <div class="mini-row">
          <label>${item.week || item.label || "Current"}</label>
          <div class="mini-bar"><span style="width:${Math.max(12, (Number(item[key] || 0) / max) * 100)}%"></span></div>
          <strong>${key === "score" ? `${item[key]}%` : formatCompactCurrency(item[key], currency)}</strong>
        </div>
      `,
    )
    .join("");
}

function createOverviewSection(report, currency) {
  const wrapper = document.createElement("div");
  wrapper.className = "overview-stack";
  wrapper.append(createSpotlightSection(report, currency), createMetricsSection(report));
  return wrapper;
}

function createSpotlightSection(report, currency) {
  const portfolio = report.portfolio || {};
  const summary = report.summary || {};
  const readiness = portfolio.readiness_score || overallCoverage(summary);
  const section = document.createElement("section");
  section.className = "spotlight-card";

  const exposure =
    report.kpis?.find((item) => slugify(item.label) === "exposure-value")?.value ||
    formatCurrency(summary.total_shortage_cost || 0, currency);
  const vendorRate = `${Math.round(average(report.vendors || [], "quote_acceptance"))}%`;
  const activeProjects = report.active_projects?.length || portfolio.active_projects || 0;

  section.innerHTML = `
    <div class="spotlight-copy">
      <p class="section-kicker">Portfolio Signal</p>
      <h2 class="spotlight-title">${readiness >= 85 ? "Release confidence is strong" : readiness >= 70 ? "Program is stable with targeted gaps" : "Commercial exposure still needs attention"}</h2>
      <div class="mini-chart">
        ${createMiniChartMarkup(report.trends?.weekly_readiness || [], "score", currency)}
      </div>
    </div>
    <div class="spotlight-metrics">
      <div class="spotlight-ring" style="--ring-value: ${Math.round(readiness * 3.6)}deg">
        <span>${readiness}%</span>
      </div>
      <div class="spotlight-list">
        <div class="spotlight-item"><span>Covered cost</span><strong>${formatCurrency(summary.total_available_cost || 0, currency)}</strong></div>
        <div class="spotlight-item"><span>Exposure value</span><strong>${exposure}</strong></div>
        <div class="spotlight-item"><span>Vendor posture</span><strong>${vendorRate}</strong></div>
        <div class="spotlight-item"><span>Active projects</span><strong>${activeProjects}</strong></div>
      </div>
    </div>
  `;

  return section;
}

function createMetricsSection(report) {
  const grid = document.createElement("section");
  grid.className = "metrics-grid";
  const metrics = Array.isArray(report.kpis) && report.kpis.length ? report.kpis : buildMetricFallback(report);
  metrics.forEach((metric) => grid.append(createMetricCard(metric)));
  return grid;
}

function createProjectsSection(report, currency) {
  const wrapper = document.createElement("section");
  wrapper.className = "project-strip";

  (report.active_projects || []).forEach((project) => {
    const card = document.createElement("article");
    card.className = "project-card";
    card.innerHTML = `
      <div class="project-top">
        <div>
          <p class="project-kicker">${project.discipline || "Project"}${project.location ? ` · ${project.location}` : ""}</p>
          <h3 class="project-name">${project.name}</h3>
          <p class="project-label">${project.phase || "In progress"}</p>
        </div>
        <span class="project-status ${slugify(project.status)}">${project.status || "active"}</span>
      </div>
      <p class="project-value">${project.readiness || 0}%</p>
      <div class="progress-track">
        <span class="progress-fill" style="width:${Math.max(0, Math.min(100, Number(project.readiness || 0)))}%"></span>
      </div>
      <div class="project-footer">
        <span>Shortage ${formatCurrency(project.shortage_value || 0, currency)}</span>
        <span>${project.packages_at_risk || 0} packages at risk</span>
      </div>
    `;
    wrapper.append(card);
  });

  return wrapper;
}

function createPipelineSection(report, currency) {
  const card = document.createElement("section");
  card.className = "surface-card";
  const rows = report.procurement_pipeline || [];

  card.innerHTML = `
    <div class="surface-header">
      <div>
        <p class="section-kicker">Procurement Program</p>
        <h3 class="section-title">Release pipeline</h3>
      </div>
    </div>
  `;

  const list = document.createElement("div");
  list.className = "pipeline-list";

  rows.forEach((item) => {
    const row = document.createElement("article");
    row.className = "pipeline-card";
    row.innerHTML = `
      <div class="status-row">
        <div>
          <h4 class="pipeline-title">${item.stage}</h4>
          <p class="vendor-meta">${item.note}</p>
        </div>
        <span class="risk-pill ${slugify(item.stage)}">${item.count} items</span>
      </div>
      <div class="status-row pipeline-meta">
        <span class="project-label">Program value</span>
        <strong>${formatCompactCurrency(item.value || 0, currency)}</strong>
      </div>
    `;
    list.append(row);
  });

  card.append(list);
  return card;
}

function createActionsSection(report) {
  const wrapper = document.createElement("section");
  wrapper.className = "actions-grid";

  (report.recommended_actions || []).forEach((action) => {
    const card = document.createElement("article");
    card.className = "action-card";
    card.innerHTML = `
      <p class="action-priority">${action.priority || "normal"} priority</p>
      <h3>${action.action}</h3>
      <p class="action-owner">${action.owner || "Operations desk"}</p>
      <p class="action-impact">${action.impact || "Maintains portfolio momentum and reduces sourcing friction."}</p>
    `;
    wrapper.append(card);
  });

  return wrapper;
}

function createVendorSection(report, currency) {
  const vendors = Array.isArray(report.vendors) ? report.vendors : [];
  const card = document.createElement("section");
  card.className = "surface-card";

  const onTimeRate = Math.round(average(vendors, "on_time_rate"));
  const leadTime = average(vendors, "avg_lead_time_days").toFixed(1);

  card.innerHTML = `
    <div class="surface-header">
      <div>
        <p class="section-kicker">Supplier Health</p>
        <h3 class="section-title">Managed sourcing network</h3>
      </div>
      <p class="section-subtitle">${onTimeRate}%</p>
    </div>
    <div class="status-card inline-summary">
      <div class="status-row">
        <span class="project-label">Average lead time</span>
        <strong>${leadTime} days</strong>
      </div>
      <div class="status-row">
        <span class="project-label">Tracked exposure</span>
        <strong>${formatCompactCurrency(vendors.reduce((sum, vendor) => sum + Number(vendor.exposure || 0), 0), currency)}</strong>
      </div>
    </div>
  `;

  const list = document.createElement("div");
  list.className = "vendor-list";

  vendors.forEach((vendor) => {
    const item = document.createElement("article");
    item.className = "vendor-item";
    item.innerHTML = `
      <div class="status-row">
        <div>
          <h4 class="vendor-name">${vendor.name}</h4>
          <p class="vendor-meta">${vendor.coverage_role || "Strategic supplier"} · ${vendor.available_capacity || "Managed capacity"}</p>
        </div>
        <span class="risk-pill ${slugify(vendor.tier) || "info"}">${vendor.tier || "Managed"}</span>
      </div>
      <div class="status-row pipeline-meta">
        <span class="project-label">Fulfillment ${formatNumber(vendor.on_time_rate)}%</span>
        <span class="project-label">${Math.round(vendor.avg_lead_time_days || 0)} day lead</span>
      </div>
    `;
    list.append(item);
  });

  card.append(list);
  return card;
}

function createRiskSection(report, currency) {
  const risks = Array.isArray(report.risks) ? report.risks : [];
  const card = document.createElement("section");
  card.className = "surface-card";

  card.innerHTML = `
    <div class="surface-header">
      <div>
        <p class="section-kicker">Risk Register</p>
        <h3 class="section-title">Escalations and blockers</h3>
      </div>
      <p class="section-subtitle">${risks.length} open</p>
    </div>
  `;

  const list = document.createElement("div");
  list.className = "risk-list";

  risks.forEach((risk) => {
    const item = document.createElement("article");
    item.className = "risk-item";
    item.innerHTML = `
      <div class="status-row">
        <div>
          <h4 class="risk-title">${risk.title}</h4>
          <p class="vendor-meta">${risk.owner || "Operations"} · Due ${risk.due_in || "TBD"}</p>
        </div>
        <span class="risk-pill ${slugify(risk.severity)}">${risk.severity || "Info"}</span>
      </div>
      <div class="status-row pipeline-meta">
        <span class="project-label">${risk.status || "Open"}</span>
        <strong>${formatCurrency(risk.impact || 0, currency)}</strong>
      </div>
    `;
    list.append(item);
  });

  card.append(list);
  return card;
}

function createMilestonesSection(report) {
  const card = document.createElement("section");
  card.className = "surface-card milestones-card";

  card.innerHTML = `
    <div class="surface-header">
      <div>
        <p class="section-kicker">Milestones</p>
        <h3 class="section-title">Upcoming release moments</h3>
      </div>
    </div>
  `;

  const list = document.createElement("div");
  list.className = "milestone-list";

  (report.milestones || []).forEach((milestone) => {
    const item = document.createElement("article");
    item.className = "milestone-item";
    item.innerHTML = `
      <div class="status-row">
        <div>
          <h4 class="risk-title">${milestone.name}</h4>
          <p class="vendor-meta">${milestone.detail || "Scheduled portfolio milestone"}</p>
        </div>
        <span class="risk-pill ${slugify(milestone.status)}">${milestone.status || "Upcoming"}</span>
      </div>
      <p class="milestone-date">${formatDate(milestone.date)}</p>
    `;
    list.append(item);
  });

  card.append(list);
  return card;
}

function createMaterialCard(row, status, currency, vendorMap) {
  const fragment = materialTemplate.content.cloneNode(true);
  const fill = fragment.querySelector(".coverage-fill");
  const stats = fragment.querySelector(".material-stats");
  const reason = fragment.querySelector(".material-reason");
  const tags = fragment.querySelector(".material-tags");
  const pill = fragment.querySelector(".status-pill");
  const vendor = vendorMap.get(row.vendor) || {};

  fragment.querySelector(".material-name").textContent = row.ifc_name;
  fragment.querySelector(".material-meta").textContent =
    `${row.package || row.mapped_to || "No mapping"} · ${row.zone || row.vendor || "Unassigned"} · ${row.source_type || "Unknown source"}`;

  pill.textContent = status;
  pill.classList.add(status.toLowerCase());
  fill.style.width = `${coverageRatio(row)}%`;

  stats.append(
    createStatRow("Required", `${formatNumber(row.required_quantity)} ${row.unit}`),
    createStatRow("Covered", `${formatNumber(row.covered_quantity || 0)} ${row.unit}`),
    createStatRow("Shortage", `${formatNumber(row.shortage_quantity || 0)} ${row.unit}`),
    createStatRow("Impact", formatCurrency(row.shortage_cost || row.available_cost || 0, currency)),
  );

  [
    `${Math.round(Number(row.lead_time_days || vendor.avg_lead_time_days || (status === "Available" ? 2 : status === "Partial" ? 4 : 7)))} day lead`,
    `${vendor.tier || (row.source_type === "warehouse" ? "Gold" : "Silver")} tier`,
    `${formatNumber(row.related_objects || 0)} linked objects`,
    status === "Unavailable"
      ? "Escalate sourcing"
      : status === "Partial"
        ? "Issue top-up"
        : "Execution ready",
  ].forEach((text) => tags.append(createTag(text)));

  reason.textContent =
    row.reason ||
    (status === "Available"
      ? "Covered by current stock and approved sourcing."
      : status === "Partial"
        ? "Coverage is present but below release threshold for clean execution."
        : "This package requires immediate procurement attention.");

  return fragment.querySelector(".material-card");
}

function createMaterialSection(title, rows, status, currency, vendorMap) {
  const column = document.createElement("section");
  column.className = "materials-column";
  column.append(createSectionHeader(status, title));

  const grid = document.createElement("div");
  grid.className = "materials-grid";

  if (!rows.length) {
    grid.append(createEmptyCard("This queue is clear for the current report."));
  } else {
    rows.forEach((row) => {
      grid.append(createMaterialCard(row, status, currency, vendorMap));
    });
  }

  column.append(grid);
  return column;
}

function createOperationsSection(report) {
  const wrapper = document.createElement("div");
  wrapper.className = "double-grid";

  const activityCard = document.createElement("section");
  activityCard.className = "timeline-card";
  activityCard.innerHTML = `
    <div class="surface-header">
      <div>
        <p class="section-kicker">Activity</p>
        <h3 class="section-title">Live operations feed</h3>
      </div>
    </div>
  `;

  const timelineList = document.createElement("div");
  timelineList.className = "timeline-list";

  (report.activity || []).forEach((entry) => {
    const row = document.createElement("article");
    row.className = "timeline-row";
    row.innerHTML = `
      <span class="timeline-dot ${slugify(entry.severity)}"></span>
      <div>
        <p class="timeline-time">${entry.time || "Now"}</p>
        <p class="timeline-copy">${entry.event || "Portfolio update received"}</p>
      </div>
    `;
    timelineList.append(row);
  });

  activityCard.append(timelineList);

  const modelCard = document.createElement("section");
  modelCard.className = "surface-card";
  modelCard.innerHTML = `
    <div class="surface-header">
      <div>
        <p class="section-kicker">Model Intelligence</p>
        <h3 class="section-title">IFC package health</h3>
      </div>
      <p class="section-subtitle">${truncatePath(report.ifc_file)}</p>
    </div>
  `;

  const modelList = document.createElement("div");
  modelList.className = "model-list";

  (report.model_packages || []).forEach((model) => {
    const item = document.createElement("article");
    item.className = "model-item";
    item.innerHTML = `
      <div class="status-row">
        <div>
          <h4 class="model-name">${model.name}</h4>
          <p class="model-meta">${model.discipline || "Model"} · ${model.version || "IFC"}</p>
        </div>
        <span class="project-status ${slugify(model.sync_status === "Synced" ? "on track" : model.sync_status)}">${model.sync_status || "Queued"}</span>
      </div>
      <div class="status-row pipeline-meta">
        <span class="project-label">${formatNumber(model.entities || 0)} entities</span>
        <span class="project-label">${formatNumber(model.coverage || 0)}% confidence</span>
      </div>
      ${model.detail ? `<p class="vendor-meta model-detail">${model.detail}</p>` : ""}
    `;
    modelList.append(item);
  });

  modelCard.append(modelList);
  wrapper.append(activityCard, modelCard);
  return wrapper;
}

function renderShell(report) {
  const portfolio = report.portfolio || {};
  const currency = portfolio.currency || report.currency || "INR";
  const summary = report.summary || {};
  const readiness = portfolio.readiness_score || overallCoverage(summary);
  const metrics = Array.isArray(report.kpis) && report.kpis.length ? report.kpis : buildMetricFallback(report);

  workspaceName.textContent = `${portfolio.name || "Signature Portfolio"} · ${portfolio.tier || "Signature"}`;
  workspacePeriod.textContent = report.generated_at ? formatDateTime(report.generated_at) : "Latest sync";
  footerWorkspace.textContent = portfolio.name || "Signature Portfolio";
  if (report.dashboard_copy?.headline) {
    footerTitle.textContent = report.dashboard_copy.headline;
  }

  heroTitle.textContent = `${portfolio.name || "IFC Portfolio"} is ${readiness}% ready for controlled procurement release.`;

  heroBadges.innerHTML = "";
  [
    portfolio.phase || "Active review",
    portfolio.owner || "Operations office",
    `${formatCompactCurrency(portfolio.contract_value || 0, currency)} managed spend`,
    portfolio.model_sync_status || "Fresh model sync",
  ]
    .filter(Boolean)
    .forEach((item) => heroBadges.append(createTag(item)));

  heroTrends.innerHTML = "";
  metrics.slice(0, 3).forEach((metric) => {
    const chip = document.createElement("div");
    chip.className = "trend-chip";
    chip.innerHTML = `
      <span>${metric.label}</span>
      <strong>${metric.value}</strong>
    `;
    heroTrends.append(chip);
  });

  briefMeta.textContent = `Updated ${formatDateTime(report.generated_at)}`;
  briefGrid.innerHTML = "";
  buildBriefItems(report).forEach((item) => {
    const card = document.createElement("article");
    card.className = "brief-item";
    card.innerHTML = `
      <p>${item.label}</p>
      <div class="brief-value">${item.value}</div>
    `;
    briefGrid.append(card);
  });

  briefCallout.textContent =
    "";

  sidebarStats.innerHTML = `
    <div class="sidebar-stat">
      <span class="sidebar-stat-label">Readiness</span>
      <strong>${readiness}%</strong>
    </div>
    <div class="sidebar-stat">
      <span class="sidebar-stat-label">Active projects</span>
      <strong>${report.active_projects?.length || portfolio.active_projects || 0}</strong>
    </div>
    <div class="sidebar-stat">
      <span class="sidebar-stat-label">Warehouses</span>
      <strong>${portfolio.connected_warehouses || 0}</strong>
    </div>
  `;
}

function renderDashboard(report) {
  const currency = report.currency || report.portfolio?.currency || "INR";
  const vendorMap = new Map((report.vendors || []).map((vendor) => [vendor.name, vendor]));

  renderShell(report);
  app.innerHTML = "";

  const materialsLayout = document.createElement("section");
  materialsLayout.className = "materials-layout";
  materialsLayout.append(
    createMaterialSection(
      "Execution ready",
      report.available_materials || [],
      "Available",
      currency,
      vendorMap,
    ),
    createMaterialSection(
      "Needs top-up",
      report.partial_materials || [],
      "Partial",
      currency,
      vendorMap,
    ),
    createMaterialSection(
      "Escalation queue",
      report.unavailable_materials || [],
      "Unavailable",
      currency,
      vendorMap,
    ),
  );

  const supplyGrid = document.createElement("div");
  supplyGrid.className = "triple-grid";
  supplyGrid.append(createVendorSection(report, currency), createRiskSection(report, currency), createMilestonesSection(report));

  const procurementGrid = document.createElement("div");
  procurementGrid.className = "double-grid procurement-grid";
  procurementGrid.append(createPipelineSection(report, currency), createActionsSection(report));

  app.append(
    createSectionGroup(
      "portfolio",
      "Portfolio Health",
      "Executive readiness and delivery posture",
      createOverviewSection(report, currency),
      createProjectsSection(report, currency),
    ),
    createSectionGroup(
      "procurement",
      "Procurement Program",
      "Pipeline, approvals, and action center",
      procurementGrid,
    ),
    createSectionGroup(
      "supply",
      "Supply & Risk",
      "Supplier posture, escalations, and release milestones",
      supplyGrid,
    ),
    createSectionGroup(
      "materials",
      "Material Board",
      "Operational queues by execution state",
      materialsLayout,
    ),
    createSectionGroup(
      "intelligence",
      "Intelligence",
      "Activity feed and model health",
      createOperationsSection(report),
    ),
  );

  setupScrollSpy();
}

function setupScrollSpy() {
  const links = Array.from(document.querySelectorAll(".topnav-link, .sidebar-link"));
  if (!links.length) {
    return;
  }

  const targets = links
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  const setActive = (id) => {
    links.forEach((link) => {
      const isActive = link.getAttribute("href") === `#${id}`;
      link.classList.toggle("active", isActive);
    });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

      if (visible?.target?.id) {
        setActive(visible.target.id);
      }
    },
    {
      rootMargin: "-20% 0px -55% 0px",
      threshold: [0.2, 0.4, 0.7],
    },
  );

  targets.forEach((target) => observer.observe(target));
}

function renderError(message) {
  app.innerHTML = `
    <section class="status-card">
      <p class="section-kicker">Unable to load report</p>
      <h2 class="section-title">Something blocked the workspace.</h2>
      <p class="section-subtitle">${message}</p>
    </section>
  `;
}

async function loadSampleReport() {
  try {
    const response = await fetch(SAMPLE_REPORT_PATH);
    if (!response.ok) {
      throw new Error(`Sample report returned ${response.status}`);
    }
    renderDashboard(normalizeReport(await response.json()));
  } catch (error) {
    renderError(error.message);
  }
}

themeToggle.addEventListener("click", () => {
  toggleTheme();
});

reloadButton.addEventListener("click", () => {
  loadSampleReport();
});

uploadInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const contents = await file.text();
    renderDashboard(normalizeReport(JSON.parse(contents)));
  } catch (error) {
    renderError(`The uploaded file could not be parsed: ${error.message}`);
  } finally {
    uploadInput.value = "";
  }
});

initializeTheme();
initializeNavbarState();
loadSampleReport();
