const SAMPLE_REPORT_PATH = "public/data/report.json";

const currencyFormatterCache = new Map();
const app = document.querySelector("#app");
const metricTemplate = document.querySelector("#metric-template");
const materialTemplate = document.querySelector("#material-template");
const uploadInput = document.querySelector("#report-upload");
const reloadButton = document.querySelector("#reload-sample");

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

function formatCurrency(value, currency) {
  return getCurrencyFormatter(currency).format(Number(value || 0));
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 3,
  }).format(Number(value || 0));
}

function truncatePath(value) {
  const parts = String(value || "").split("/");
  return parts[parts.length - 1] || value;
}

function coverageRatio(row) {
  const required = Number(row.required_quantity || 0);
  const covered = Number(row.covered_quantity || 0);
  if (required <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (covered / required) * 100));
}

function createMetricCard(label, value, footnote) {
  const fragment = metricTemplate.content.cloneNode(true);
  fragment.querySelector(".metric-label").textContent = label;
  fragment.querySelector(".metric-value").textContent = value;
  fragment.querySelector(".metric-footnote").textContent = footnote;
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

function createMaterialCard(row, status, currency) {
  const fragment = materialTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".material-card");
  const fill = fragment.querySelector(".coverage-fill");
  const stats = fragment.querySelector(".material-stats");
  const reason = fragment.querySelector(".material-reason");
  const pill = fragment.querySelector(".status-pill");

  fragment.querySelector(".material-name").textContent = row.ifc_name;
  fragment.querySelector(".material-meta").textContent =
    `${row.mapped_to || "No mapping"} · ${row.source_type || "unmapped"} · ${row.vendor || "unassigned"}`;
  pill.textContent = status;
  pill.classList.add(status.toLowerCase());

  fill.style.width = `${coverageRatio(row)}%`;

  stats.append(
    createStatRow("Required", `${formatNumber(row.required_quantity)} ${row.unit}`),
    createStatRow("Covered", `${formatNumber(row.covered_quantity || 0)} ${row.unit}`),
    createStatRow("Shortage", `${formatNumber(row.shortage_quantity || 0)} ${row.unit}`),
    createStatRow("Covered Cost", formatCurrency(row.available_cost || 0, currency)),
  );

  if (row.reason) {
    reason.textContent = row.reason;
  } else {
    reason.remove();
  }

  return card;
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

function createMaterialSection(title, subtitle, rows, status, currency) {
  const column = document.createElement("section");
  column.className = "materials-column";
  const header = document.createElement("div");
  header.className = "status-card";
  header.innerHTML = `
    <p class="section-kicker">${status}</p>
    <h2 class="section-title">${title}</h2>
    <p class="section-subtitle">${subtitle}</p>
  `;

  const grid = document.createElement("div");
  grid.className = "materials-grid";

  if (!rows.length) {
    grid.append(createEmptyCard("This bucket is empty for the current report."));
  } else {
    rows.forEach((row) => {
      grid.append(createMaterialCard(row, status, currency));
    });
  }

  column.append(header, grid);
  return column;
}

function renderReport(report) {
  const summary = report.summary || {};
  const currency = report.currency || "INR";

  app.innerHTML = "";

  const projectStrip = document.createElement("section");
  projectStrip.className = "project-strip";
  projectStrip.innerHTML = `
    <article class="status-card">
      <p class="section-kicker">Current IFC</p>
      <h2>${truncatePath(report.ifc_file)}</h2>
      <div class="project-meta">
        <div class="project-meta-row"><span>Parser</span><strong>${report.parser_used}</strong></div>
        <div class="project-meta-row"><span>Inventory</span><strong>${truncatePath(report.inventory_file)}</strong></div>
      </div>
    </article>
    <article class="status-card">
      <p class="section-kicker">Cost Coverage</p>
      <h2>${formatCurrency(summary.total_available_cost, currency)}</h2>
      <div class="project-meta">
        <div class="project-meta-row"><span>Shortage value</span><strong>${formatCurrency(summary.total_shortage_cost, currency)}</strong></div>
        <div class="project-meta-row"><span>Materials found</span><strong>${formatNumber(summary.materials_found)}</strong></div>
      </div>
    </article>
    <article class="status-card">
      <p class="section-kicker">Decision Signal</p>
      <h2>${summary.unavailable_count > 0 ? "Procurement needed" : "Ready to execute"}</h2>
      <div class="project-meta">
        <div class="project-meta-row"><span>Unavailable</span><strong>${formatNumber(summary.unavailable_count)}</strong></div>
        <div class="project-meta-row"><span>Partial</span><strong>${formatNumber(summary.partial_count)}</strong></div>
      </div>
    </article>
  `;

  const metrics = document.createElement("section");
  metrics.className = "metrics-grid";
  metrics.append(
    createMetricCard("Materials Found", formatNumber(summary.materials_found), "Distinct mapped IFC materials"),
    createMetricCard("Available", formatNumber(summary.available_count), "Fully covered from current stock"),
    createMetricCard("Partial", formatNumber(summary.partial_count), "Some stock exists but not enough"),
    createMetricCard("Unavailable", formatNumber(summary.unavailable_count), "Needs procurement or alternate sourcing"),
    createMetricCard("Shortage Value", formatCurrency(summary.total_shortage_cost, currency), "Estimated value of the uncovered quantity"),
  );

  const materialsLayout = document.createElement("section");
  materialsLayout.className = "materials-layout";
  materialsLayout.append(
    createMaterialSection(
      "Available materials",
      "These items are already covered by warehouse stock or approved supply.",
      report.available_materials || [],
      "Available",
      currency,
    ),
    createMaterialSection(
      "Partial coverage",
      "These materials are present, but the project quantity is higher than the current stock.",
      report.partial_materials || [],
      "Partial",
      currency,
    ),
    createMaterialSection(
      "Unavailable or zero stock",
      "These items are the fastest way to explain procurement risk to a stakeholder.",
      report.unavailable_materials || [],
      "Unavailable",
      currency,
    ),
  );

  app.append(projectStrip, metrics, materialsLayout);
}

function renderError(message) {
  app.innerHTML = `
    <section class="status-card">
      <p class="section-kicker">Unable to load report</p>
      <h2>Something blocked the demo data.</h2>
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
    renderReport(await response.json());
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
    renderReport(JSON.parse(contents));
  } catch (error) {
    renderError(`The uploaded file could not be parsed: ${error.message}`);
  } finally {
    uploadInput.value = "";
  }
});

loadSampleReport();
