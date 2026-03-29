const SAMPLE_REPORT_PATH = "/public/data/report.json";

const currencyFormatterCache = new Map();
const compactCurrencyFormatterCache = new Map();

const app = document.querySelector("#app");
const metricTemplate = document.querySelector("#metric-template");
const materialTemplate = document.querySelector("#material-template");
const uploadInput = document.querySelector("#report-upload");
const reloadButton = document.querySelector("#reload-sample");
const workspaceName = document.querySelector("#workspace-name");
const workspacePeriod = document.querySelector("#workspace-period");
const heroTitle = document.querySelector("#hero-title");
const heroDescription = document.querySelector("#hero-description");
const heroBadges = document.querySelector("#hero-badges");
const heroTrends = document.querySelector("#hero-trends");
const briefMeta = document.querySelector("#brief-meta");
const briefGrid = document.querySelector("#brief-grid");
const briefCallout = document.querySelector("#brief-callout");

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
  };

  const kpis = Array.isArray(report.kpis) && report.kpis.length
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

  const activeProjects = Array.isArray(report.active_projects) && report.active_projects.length
    ? report.active_projects
    : (report.sites || []).map((site) => ({
        name: site.name,
        discipline: report.project?.discipline || "Project",
        phase: site.phase || report.project?.stage || "Portfolio review",
        readiness: site.readiness || site.coverage || summary.readiness_score || 0,
        shortage_value: site.shortage_value || 0,
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
  }));

  const risks = Array.isArray(report.risks) && report.risks.length
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

  const modelPackages = Array.isArray(report.model_packages) && report.model_packages.length
    ? report.model_packages
    : (report.milestones || []).map((milestone) => ({
        name: milestone.name,
        discipline: "Milestone",
        version: report.project?.ifc_schema || "IFC",
        sync_status: milestone.status || "Queued",
        entities: 0,
        coverage: summary.forecast_confidence || derivedPortfolio.readiness_score || 0,
      }));

  const recommendedActions = Array.isArray(report.recommended_actions) && report.recommended_actions.length
    ? report.recommended_actions
    : (report.procurement_pipeline || []).map((item) => ({
        action: `${item.stage || "Pipeline stage"}: ${item.note || "Advance package decisions"}`,
        priority: Number(item.count || 0) > 1 ? "high" : "medium",
        owner: report.project?.owner || "Operations desk",
        impact: `${item.count || 0} items · ${item.value || "Tracked value"}`,
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
  };
}

function createMetricCard(metric) {
  const fragment = metricTemplate.content.cloneNode(true);
  const delta = fragment.querySelector(".metric-delta");

  fragment.querySelector(".metric-label").textContent = metric.label;
  fragment.querySelector(".metric-value").textContent = metric.value;
  fragment.querySelector(".metric-footnote").textContent = metric.note || "";
  delta.textContent = metric.delta || "Stable";
  delta.classList.add(slugify(metric.trend || "flat"));

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

function createEmptyCard(copy) {
  const card = document.createElement("article");
  card.className = "material-card empty-card";
  card.innerHTML = `
    <p class="material-name">Nothing here</p>
    <p class="empty-copy">${copy}</p>
  `;
  return card;
}

function createSectionHeader(kicker, title, subtitle) {
  const header = document.createElement("div");
  header.className = "status-card";
  header.innerHTML = `
    <p class="section-kicker">${kicker}</p>
    <h2 class="section-title">${title}</h2>
    <p class="section-subtitle">${subtitle}</p>
  `;
  return header;
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
      label: "Available",
      value: formatNumber(summary.available_count),
      delta: "Covered",
      trend: "up",
      note: "Materials fully covered from approved inventory",
    },
    {
      label: "Partial",
      value: formatNumber(summary.partial_count),
      delta: "Needs top-up",
      trend: "down",
      note: "Materials requiring supplemental procurement",
    },
    {
      label: "Unavailable",
      value: formatNumber(summary.unavailable_count),
      delta: "Escalation",
      trend: "down",
      note: "Packages blocked by zero stock or sourcing gaps",
    },
  ];
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
    `${row.mapped_to || "No mapping"} · ${row.vendor || "Unassigned"} · ${row.source_type || "Unknown source"}`;

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
    `${Math.round(Number(vendor.avg_lead_time_days || (status === "Available" ? 2 : status === "Partial" ? 4 : 7)))} day lead`,
    `${vendor.tier || (row.source_type === "warehouse" ? "Gold" : "Silver")} tier`,
    `${formatNumber(row.related_objects || 0)} linked objects`,
    status === "Unavailable"
      ? "Escalate sourcing"
      : status === "Partial"
        ? "Issue top-up"
        : "Execution ready",
  ].forEach((text) => tags.append(createTag(text)));

  if (row.reason) {
    reason.textContent = row.reason;
  } else {
    reason.textContent =
      status === "Available"
        ? "Covered by current stock and approved sourcing."
        : status === "Partial"
          ? "Coverage is present but below release threshold for clean execution."
          : "This package requires immediate procurement attention.";
  }

  return fragment.querySelector(".material-card");
}

function createMaterialSection(title, subtitle, rows, status, currency, vendorMap) {
  const column = document.createElement("section");
  column.className = "materials-column";
  column.append(createSectionHeader(status, title, subtitle));

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

function createSpotlightSection(report, currency) {
  const portfolio = report.portfolio || {};
  const summary = report.summary || {};
  const readiness = portfolio.readiness_score || overallCoverage(summary);
  const section = document.createElement("section");
  section.className = "spotlight-card";

  const exposure =
    report.kpis?.find((item) => slugify(item.label) === "exposure-value")?.value ||
    formatCurrency(summary.total_shortage_cost || 0, currency);
  const vendorRate =
    report.kpis?.find((item) => slugify(item.label) === "vendor-response-rate")?.value ||
    `${Math.round(average(report.vendors || [], "quote_acceptance"))}%`;
  const syncedModels =
    report.kpis?.find((item) => slugify(item.label) === "models-synced")?.value ||
    formatNumber((report.model_packages || []).length);

  section.innerHTML = `
    <div class="spotlight-copy">
      <p class="section-kicker">Portfolio Signal</p>
      <h2 class="spotlight-title">${readiness >= 85 ? "Portfolio release window is strong" : readiness >= 70 ? "Portfolio is stable with targeted gaps" : "Procurement exposure is still elevated"}</h2>
      <p class="section-subtitle">
        ${portfolio.portfolio_health || "This portfolio view combines IFC material coverage, vendor response, and model freshness into one operating signal."}
      </p>
      <div class="mini-chart">
        ${createMiniChartMarkup(report.trends?.weekly_readiness || [], "score")}
      </div>
    </div>
    <div class="spotlight-metrics">
      <div class="spotlight-ring" style="--ring-value: ${Math.round(readiness * 3.6)}deg">
        <span>${readiness}%</span>
      </div>
      <div class="spotlight-list">
        <div class="spotlight-item"><span>Covered cost</span><strong>${formatCurrency(summary.total_available_cost || 0, currency)}</strong></div>
        <div class="spotlight-item"><span>Exposure value</span><strong>${exposure}</strong></div>
        <div class="spotlight-item"><span>Vendor response</span><strong>${vendorRate}</strong></div>
        <div class="spotlight-item"><span>Models synced</span><strong>${syncedModels}</strong></div>
      </div>
    </div>
  `;

  return section;
}

function createMiniChartMarkup(items, key) {
  if (!Array.isArray(items) || !items.length) {
    return "";
  }

  const max = Math.max(...items.map((item) => Number(item[key] || 0)), 1);
  return items
    .map(
      (item) => `
        <div class="mini-row">
          <label>${item.week || item.label || "Current"}</label>
          <div class="mini-bar"><span style="width:${Math.max(10, (Number(item[key] || 0) / max) * 100)}%"></span></div>
          <strong>${key === "score" ? `${item[key]}%` : formatCompactCurrency(item[key], "INR")}</strong>
        </div>
      `,
    )
    .join("");
}

function createProjectsSection(report, currency) {
  const wrapper = document.createElement("section");
  wrapper.id = "projects";
  wrapper.className = "project-strip";

  (report.active_projects || []).forEach((project) => {
    const card = document.createElement("article");
    card.className = "project-card";
    card.innerHTML = `
      <div class="project-top">
        <div>
          <p class="project-kicker">${project.discipline || "Project"}</p>
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
        <span>${project.last_sync || "Recently synced"}</span>
      </div>
    `;
    wrapper.append(card);
  });

  return wrapper;
}

function createMetricsSection(report) {
  const grid = document.createElement("section");
  grid.className = "metrics-grid";
  const metrics = Array.isArray(report.kpis) && report.kpis.length ? report.kpis : buildMetricFallback(report);
  metrics.forEach((metric) => grid.append(createMetricCard(metric)));
  return grid;
}

function createVendorSection(report) {
  const vendors = Array.isArray(report.vendors) ? report.vendors : [];
  const card = document.createElement("section");
  card.className = "surface-card";
  card.id = "vendors";

  const onTimeRate = Math.round(average(vendors, "on_time_rate"));
  const leadTime = average(vendors, "avg_lead_time_days").toFixed(1);

  card.innerHTML = `
    <div class="surface-header">
      <div>
        <p class="section-kicker">Supplier Health</p>
        <h2 class="section-title">Premium sourcing network</h2>
      </div>
      <p class="section-subtitle">${onTimeRate}% average on-time rate across active suppliers</p>
    </div>
    <div class="status-card" style="margin-bottom: 1rem;">
      <div class="status-row">
        <span class="project-label">Average lead time</span>
        <strong>${leadTime} days</strong>
      </div>
      <div class="status-row" style="margin-top: 0.65rem;">
        <span class="project-label">Fallback-ready vendors</span>
        <strong>${vendors.filter((vendor) => vendor.tier).length}</strong>
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
          <h3 class="vendor-name">${vendor.name}</h3>
          <p class="vendor-meta">${vendor.coverage_role || "Strategic supplier"} · ${vendor.available_capacity || "Managed capacity"}</p>
        </div>
        <span class="risk-pill ${slugify(vendor.tier) || "info"}">${vendor.tier || "Managed"}</span>
      </div>
      <div class="status-row" style="margin-top: 0.65rem;">
        <span class="project-label">On-time ${formatNumber(vendor.on_time_rate)}%</span>
        <span class="project-label">Quote acceptance ${formatNumber(vendor.quote_acceptance)}%</span>
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
        <h2 class="section-title">Escalation queue</h2>
      </div>
      <p class="section-subtitle">${risks.length} tracked risks require active ownership</p>
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
          <h3 class="risk-title">${risk.title}</h3>
          <p class="vendor-meta">${risk.owner || "Operations"} · Due in ${risk.due_in || "TBD"}</p>
        </div>
        <span class="risk-pill ${slugify(risk.severity)}">${risk.severity || "Info"}</span>
      </div>
      <div class="status-row" style="margin-top: 0.65rem;">
        <span class="project-label">${risk.status || "Open"}</span>
        <strong>${formatCurrency(risk.impact || 0, currency)}</strong>
      </div>
    `;
    list.append(item);
  });

  card.append(list);
  return card;
}

function createOperationsSection(report) {
  const wrapper = document.createElement("section");
  wrapper.className = "double-grid";
  wrapper.id = "models";

  const activityCard = document.createElement("section");
  activityCard.className = "timeline-card";
  activityCard.innerHTML = `
    <div class="surface-header">
      <div>
        <p class="section-kicker">Activity</p>
        <h2 class="section-title">Live operations feed</h2>
      </div>
      <p class="section-subtitle">Recent portfolio events, approvals, and sourcing moves</p>
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
        <h2 class="section-title">IFC package health</h2>
      </div>
      <p class="section-subtitle">${truncatePath(report.ifc_file)} · ${report.parser_used || "Parser"} · ${truncatePath(report.inventory_file)}</p>
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
          <h3 class="model-name">${model.name}</h3>
          <p class="model-meta">${model.discipline || "Model"} · ${model.version || "IFC"}</p>
        </div>
        <span class="project-status ${slugify(model.sync_status === "Synced" ? "on track" : model.sync_status)}">${model.sync_status || "Queued"}</span>
      </div>
      <div class="status-row" style="margin-top: 0.65rem;">
        <span class="project-label">${formatNumber(model.entities || 0)} entities</span>
        <span class="project-label">${formatNumber(model.coverage || 0)}% coverage</span>
      </div>
    `;
    modelList.append(item);
  });

  modelCard.append(modelList);
  wrapper.append(activityCard, modelCard);
  return wrapper;
}

function createActionsSection(report) {
  const wrapper = document.createElement("section");
  wrapper.id = "actions";
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

function renderShell(report) {
  const portfolio = report.portfolio || {};
  const currency = portfolio.currency || report.currency || "INR";
  const summary = report.summary || {};
  const readiness = portfolio.readiness_score || overallCoverage(summary);
  const metrics = Array.isArray(report.kpis) && report.kpis.length ? report.kpis : buildMetricFallback(report);

  workspaceName.textContent = portfolio.name || "Signature Portfolio";
  workspacePeriod.textContent = report.generated_at ? formatDateTime(report.generated_at) : "Latest sync";
  heroTitle.textContent = `${portfolio.name || "IFC Portfolio"} is ${readiness}% ready for controlled procurement release.`;
  heroDescription.textContent =
    `${portfolio.program_type || "Portfolio-wide IFC material intelligence"} for ${portfolio.client || "stakeholders"} in ${portfolio.region || "active markets"}. ` +
    `${portfolio.portfolio_health || "Coverage and supplier signals are consolidated into one command surface."}`;

  heroBadges.innerHTML = "";
  [
    portfolio.phase || "Active review",
    portfolio.owner || "Operations office",
    `${formatCompactCurrency(portfolio.contract_value || 0, currency)} contract value`,
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
    `Current covered value sits at ${formatCurrency(summary.total_available_cost || 0, currency)}, while shortage exposure is ${formatCurrency(summary.total_shortage_cost || 0, currency)}. ` +
    `Use this view to prioritize approvals, resync delayed model packages, and protect budget before release.`;
}

function renderDashboard(report) {
  const currency = report.currency || report.portfolio?.currency || "INR";
  const vendorMap = new Map((report.vendors || []).map((vendor) => [vendor.name, vendor]));

  renderShell(report);
  app.innerHTML = "";
  app.append(
    createSpotlightSection(report, currency),
    createProjectsSection(report, currency),
    createMetricsSection(report),
  );

  const intelligenceRow = document.createElement("section");
  intelligenceRow.className = "double-grid";
  intelligenceRow.append(createVendorSection(report), createRiskSection(report, currency));

  const materialsLayout = document.createElement("section");
  materialsLayout.className = "materials-layout";
  materialsLayout.append(
    createMaterialSection(
      "Execution ready",
      "Approved stock and supplier coverage already protect these materials.",
      report.available_materials || [],
      "Available",
      currency,
      vendorMap,
    ),
    createMaterialSection(
      "Needs top-up",
      "These packages are close to release, but still need supplemental cover.",
      report.partial_materials || [],
      "Partial",
      currency,
      vendorMap,
    ),
    createMaterialSection(
      "Escalation queue",
      "These items are the fastest path to explain procurement risk and delay exposure.",
      report.unavailable_materials || [],
      "Unavailable",
      currency,
      vendorMap,
    ),
  );

  app.append(intelligenceRow, materialsLayout, createOperationsSection(report), createActionsSection(report));
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

loadSampleReport();
