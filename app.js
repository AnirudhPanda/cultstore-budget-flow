const defaultBudgets = {
  Apparel: 1200000,
  Footwear: 1000000,
  Massagers: 500000,
  Accessories: 650000,
  "Indoor Equipment": 900000,
  Cycles: 1400000
};
const defaultFootwearBrandBudgets = {
  Cult: 500000,
  Avant: 500000
};

const state = {
  budgets: { ...defaultBudgets },
  footwearBrandBudgets: { ...defaultFootwearBrandBudgets },
  entries: []
};

const refs = {
  owner: document.getElementById("owner"),
  budgetList: document.getElementById("budgetList"),
  spendBars: document.getElementById("spendBars"),
  categorySelect: document.getElementById("category"),
  brandField: document.getElementById("brandField"),
  brandSelect: document.getElementById("brand"),
  filterCategory: document.getElementById("filterCategory"),
  poForm: document.getElementById("poForm"),
  poTableBody: document.getElementById("poTableBody"),
  searchInput: document.getElementById("searchInput"),
  filterStatus: document.getElementById("filterStatus"),
  budgetPulse: document.getElementById("budgetPulse"),
  heroUtilisation: document.getElementById("heroUtilisation"),
  heroCommitted: document.getElementById("heroCommitted"),
  heroInvoiced: document.getElementById("heroInvoiced"),
  totalBudget: document.getElementById("totalBudget"),
  poValue: document.getElementById("poValue"),
  invoiceValue: document.getElementById("invoiceValue"),
  remainingBudget: document.getElementById("remainingBudget"),
  topCategory: document.getElementById("topCategory"),
  topVendor: document.getElementById("topVendor"),
  topOwner: document.getElementById("topOwner"),
  quarterGrid: document.getElementById("quarterGrid"),
  quarterTableBody: document.getElementById("quarterTableBody"),
  budgetItemTemplate: document.getElementById("budgetItemTemplate"),
  clearForm: document.getElementById("clearForm"),
  resetBudgets: document.getElementById("resetBudgets"),
  jumpToForm: document.getElementById("jumpToForm"),
  resetApp: document.getElementById("resetApp"),
  syncStatus: document.getElementById("syncStatus"),
  formMessage: document.getElementById("formMessage"),
  downloadSheet: document.getElementById("downloadSheet"),
  recordType: document.getElementById("recordType"),
  amountLabel: document.getElementById("amountLabel")
};

init();

async function init() {
  bindEvents();
  setDefaultDate();
  updateAmountLabel();
  populateCategoryOptions();
  updateBrandField();
  await refreshState();
}

function bindEvents() {
  refs.poForm.addEventListener("submit", handleSubmit);
  refs.searchInput.addEventListener("input", renderTable);
  refs.filterCategory.addEventListener("change", renderTable);
  refs.filterStatus.addEventListener("change", renderTable);
  refs.clearForm.addEventListener("click", () => {
    refs.poForm.reset();
    setDefaultDate();
    updateAmountLabel();
    updateBrandField();
    setFormMessage("");
  });
  refs.resetBudgets.addEventListener("click", async () => {
    await apiFetch("/api/budgets", {
      method: "PUT",
      body: JSON.stringify({
        budgets: defaultBudgets,
        footwearBrandBudgets: defaultFootwearBrandBudgets
      })
    });
    await refreshState("Budgets reset");
  });
  refs.jumpToForm.addEventListener("click", () => {
    document.getElementById("poFormPanel").scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("poNumber").focus();
  });
  refs.resetApp.addEventListener("click", async () => {
    const confirmed = window.confirm("Reset all budgets and purchase orders for this shared app?");
    if (!confirmed) return;
    await apiFetch("/api/reset", { method: "POST" });
    await refreshState("Shared data reset");
    refs.poForm.reset();
    setDefaultDate();
    updateAmountLabel();
    updateBrandField();
  });
  refs.downloadSheet.addEventListener("click", downloadSheet);
  refs.recordType.addEventListener("change", updateAmountLabel);
  refs.categorySelect.addEventListener("change", updateBrandField);
}

function setDefaultDate() {
  document.getElementById("poDate").value = new Date().toISOString().slice(0, 10);
}

async function refreshState(message = "Connected") {
  try {
    setSyncStatus("Syncing...", "pending");
    const nextState = await apiFetch("/api/state");
    state.budgets = Object.fromEntries(
      Object.entries(defaultBudgets).map(([category, defaultAmount]) => [
        category,
        Number(nextState?.budgets?.[category]) || defaultAmount
      ])
    );
    state.footwearBrandBudgets = Object.fromEntries(
      Object.entries(defaultFootwearBrandBudgets).map(([brand, defaultAmount]) => [
        brand,
        Number(nextState?.footwearBrandBudgets?.[brand]) || defaultAmount
      ])
    );
    state.entries = Array.isArray(nextState.entries)
      ? nextState.entries.map((entry) => ({
          ...entry,
          category: entry.category === "Massage Oils" ? "Massagers" : entry.category,
          brand: normalizeBrand(entry),
          ownerName: normalizeOwnerName(entry),
          recordType: normalizeRecordType(entry.recordType),
          amount: normalizeAmount(entry)
        }))
      : [];
    render();
    setSyncStatus(message, "online");
  } catch (error) {
    setSyncStatus("Server unavailable", "error");
    console.error(error);
  }
}

function populateCategoryOptions() {
  const currentCategory = refs.categorySelect.value;
  const currentFilter = refs.filterCategory.value;
  const categories = Object.keys(state.budgets);

  refs.categorySelect.innerHTML = categories
    .map((category) => `<option value="${category}">${category}</option>`)
    .join("");

  refs.filterCategory.innerHTML = [
    `<option value="all">All categories</option>`,
    ...categories.map((category) => `<option value="${category}">${category}</option>`)
  ].join("");

  refs.categorySelect.value = categories.includes(currentCategory) ? currentCategory : categories[0];
  refs.filterCategory.value = ["all", ...categories].includes(currentFilter) ? currentFilter : "all";
  updateBrandField();
}

async function handleSubmit(event) {
  event.preventDefault();
  const form = refs.poForm;
  const formData = new FormData(form);
  const submitButton = form.querySelector('button[type="submit"]');

  const entry = {
    ownerName: String(formData.get("owner")).trim(),
    poNumber: String(formData.get("poNumber")).trim(),
    poDate: String(formData.get("poDate")),
    category: String(formData.get("category")),
    brand: String(formData.get("brand") || ""),
    spendType: String(formData.get("spendType")),
    vendor: String(formData.get("vendor")).trim(),
    recordType: String(formData.get("recordType")),
    purpose: String(formData.get("purpose")).trim(),
    amount: Number(formData.get("amount")) || 0,
    status: "Raised",
    notes: String(formData.get("notes")).trim()
  };

  submitButton.disabled = true;
  submitButton.textContent = "Saving...";

  try {
    setFormMessage("Saving entry...", "success");
    await apiFetch("/api/entries", {
      method: "POST",
      body: JSON.stringify(entry)
    });
  } catch (error) {
    console.error(error);
    setFormMessage("Could not save the entry. Please try again.", "error");
    setSyncStatus("Save failed", "error");
    submitButton.disabled = false;
    submitButton.textContent = "Save PO";
    return;
  }

  form.reset();
  setDefaultDate();
  updateAmountLabel();
  updateBrandField();
  setFormMessage(`Saved ${entry.poNumber || "entry"} successfully.`, "success");
  await refreshState("Entry saved");
  submitButton.disabled = false;
  submitButton.textContent = "Save PO";
}

function render() {
  populateCategoryOptions();
  renderSummary();
  renderBudgetList();
  renderSpendBars();
  renderQuarterSection();
  renderTable();
}

function renderSummary() {
  const categories = Object.keys(state.budgets);
  const activeEntries = state.entries.filter((entry) => entry.status !== "Cancelled");
  const totalBudget = categories.reduce((sum, category) => sum + state.budgets[category], 0);
  const poValue = activeEntries
    .filter((entry) => entry.recordType === "PO")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const invoiceValue = activeEntries
    .filter((entry) => entry.recordType === "Invoice")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const totalSpend = activeEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const remaining = totalBudget - totalSpend;
  const utilisation = totalBudget > 0 ? totalSpend / totalBudget : 0;

  refs.totalBudget.textContent = formatCurrency(totalBudget);
  refs.poValue.textContent = formatCurrency(poValue);
  refs.invoiceValue.textContent = formatCurrency(invoiceValue);
  refs.remainingBudget.textContent = formatCurrency(remaining);
  refs.heroCommitted.textContent = formatCurrency(totalSpend);
  refs.heroInvoiced.textContent = formatCurrency(invoiceValue);
  refs.heroUtilisation.textContent = `${Math.round(utilisation * 100)}%`;

  const ringDegrees = Math.min(utilisation, 1) * 360;
  document.querySelector(".hero-ring").style.background =
    `radial-gradient(circle closest-side, rgba(255, 250, 242, 0.95) 62%, transparent 63% 100%), conic-gradient(var(--mint) ${ringDegrees}deg, rgba(23, 33, 38, 0.08) 0deg)`;

  refs.budgetPulse.textContent =
    utilisation > 0.9 ? "Critical" : utilisation > 0.72 ? "Watch closely" : "Healthy";

  refs.topCategory.textContent = getTopLabel(activeEntries, "category");
  refs.topVendor.textContent = getTopLabel(activeEntries, "vendor");
  refs.topOwner.textContent = getTopLabel(activeEntries, "ownerName");
}

function renderBudgetList() {
  refs.budgetList.innerHTML = "";
  const entriesByCategory = getSpendByCategory();
  const footwearSpendByBrand = getSpendByFootwearBrand();

  Object.entries(state.budgets).forEach(([category, budget]) => {
    const amount = entriesByCategory[category] || 0;
    const utilisation = budget > 0 ? Math.min(amount / budget, 1) : 0;
    const node = refs.budgetItemTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".budget-name").textContent = category;
    node.querySelector(".budget-stats").textContent =
      `${formatCurrency(amount)} used of ${formatCurrency(budget)}`;
    node.querySelector(".budget-fill").style.width = `${utilisation * 100}%`;

    const input = node.querySelector(".budget-input");
    input.value = budget;
    input.addEventListener("change", async (event) => {
      state.budgets[category] = Number(event.target.value) || 0;
      await apiFetch("/api/budgets", {
        method: "PUT",
        body: JSON.stringify({
          budgets: state.budgets,
          footwearBrandBudgets: state.footwearBrandBudgets
        })
      });
      await refreshState("Budgets updated");
    });

    if (category === "Footwear") {
      const sublist = document.createElement("div");
      sublist.className = "budget-sublist";

      Object.entries(state.footwearBrandBudgets).forEach(([brand, brandBudget]) => {
        const brandAmount = footwearSpendByBrand[brand] || 0;
        const subitem = document.createElement("div");
        subitem.className = "budget-subitem";
        subitem.innerHTML = `
          <div>
            <strong>${escapeHtml(brand)}</strong>
            <span>${formatCurrency(brandAmount)} used of ${formatCurrency(brandBudget)}</span>
          </div>
        `;

        const label = document.createElement("label");
        label.textContent = "Brand budget";
        const brandInput = document.createElement("input");
        brandInput.className = "budget-input brand-budget-input";
        brandInput.type = "number";
        brandInput.min = "0";
        brandInput.step = "0.01";
        brandInput.value = brandBudget;
        brandInput.addEventListener("change", async (event) => {
          state.footwearBrandBudgets[brand] = Number(event.target.value) || 0;
          await apiFetch("/api/budgets", {
            method: "PUT",
            body: JSON.stringify({
              budgets: state.budgets,
              footwearBrandBudgets: state.footwearBrandBudgets
            })
          });
          await refreshState("Budgets updated");
        });
        label.appendChild(brandInput);
        subitem.appendChild(label);
        sublist.appendChild(subitem);
      });

      node.appendChild(sublist);
    }

    refs.budgetList.appendChild(node);
  });
}

function renderSpendBars() {
  refs.spendBars.innerHTML = "";
  const spendByCategory = getSpendByCategory();
  const maxSpend = Math.max(...Object.values(spendByCategory), 0);

  if (maxSpend === 0) {
    refs.spendBars.innerHTML = `<div class="empty-state">Log your first transaction to see category spending patterns.</div>`;
    return;
  }

  Object.keys(state.budgets).forEach((category) => {
    const amount = spendByCategory[category] || 0;
    const bar = document.createElement("div");
    bar.className = "spend-bar";
    bar.innerHTML = `
      <div class="spend-bar-head">
        <strong>${escapeHtml(category)}</strong>
        <span>${formatCurrency(amount)}</span>
      </div>
      <div class="spend-bar-track">
        <div class="spend-bar-fill" style="width:${maxSpend ? (amount / maxSpend) * 100 : 0}%"></div>
      </div>
    `;
    refs.spendBars.appendChild(bar);
  });
}

function renderQuarterSection() {
  const quarterTotals = getQuarterTotals();
  const quarterCategories = getQuarterCategoryTotals();
  const quarterOrder = ["AMJ", "JAS", "OND", "JFM"];

  refs.quarterGrid.innerHTML = quarterOrder
    .map((quarter) => {
      const amount = quarterTotals[quarter] || 0;
      const leader = getTopQuarterCategoryLabel(quarterCategories[quarter] || {});
      return `
        <article class="quarter-card">
          <span class="quarter-label">${quarter}</span>
          <strong>${formatCurrency(amount)}</strong>
          <small>${leader}</small>
        </article>
      `;
    })
    .join("");

  const categories = Object.keys(state.budgets);
  refs.quarterTableBody.innerHTML = categories
    .map((category) => {
      const amj = quarterCategories.AMJ?.[category] || 0;
      const jas = quarterCategories.JAS?.[category] || 0;
      const ond = quarterCategories.OND?.[category] || 0;
      const jfm = quarterCategories.JFM?.[category] || 0;
      const total = amj + jas + ond + jfm;
      return `
        <tr>
          <td><strong>${escapeHtml(category)}</strong></td>
          <td>${formatCurrency(amj)}</td>
          <td>${formatCurrency(jas)}</td>
          <td>${formatCurrency(ond)}</td>
          <td>${formatCurrency(jfm)}</td>
          <td><strong>${formatCurrency(total)}</strong></td>
        </tr>
      `;
    })
    .join("");
}

function renderTable() {
  const query = refs.searchInput.value.trim().toLowerCase();
  const categoryFilter = refs.filterCategory.value;
  const statusFilter = refs.filterStatus.value;

  const filtered = state.entries.filter((entry) => {
    const matchesQuery =
      !query ||
      [
        entry.ownerName,
        entry.poNumber,
        entry.category,
        entry.brand,
        entry.spendType,
        entry.vendor,
        entry.purpose,
        entry.notes
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);

    const matchesCategory = categoryFilter === "all" || entry.category === categoryFilter;
    const matchesStatus = statusFilter === "all" || entry.status === statusFilter;

    return matchesQuery && matchesCategory && matchesStatus;
  });

  if (filtered.length === 0) {
    refs.poTableBody.innerHTML = `
      <tr>
        <td colspan="12" class="empty-state">No purchase orders match the current filters.</td>
      </tr>
    `;
    return;
  }

  refs.poTableBody.innerHTML = filtered
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(entry.ownerName || "Unknown")}</td>
          <td>${escapeHtml(entry.poNumber)}</td>
          <td>${formatDate(entry.poDate)}</td>
          <td>${escapeHtml(entry.category)}</td>
          <td>${entry.brand ? `<span class="brand-pill">${escapeHtml(entry.brand)}</span>` : "—"}</td>
          <td>${escapeHtml(entry.spendType)}</td>
          <td>${escapeHtml(entry.vendor)}</td>
          <td><span class="basis-pill" data-basis="${escapeHtml(entry.recordType)}">${escapeHtml(entry.recordType)}</span></td>
          <td>
            <strong>${escapeHtml(entry.purpose)}</strong>
            ${entry.notes ? `<div class="notes">${escapeHtml(entry.notes)}</div>` : ""}
          </td>
          <td>${formatCurrency(entry.amount)}</td>
          <td>
            <select class="table-status-select" data-id="${escapeHtml(entry.id)}" data-status="${escapeHtml(entry.status)}">
              ${renderStatusOptions(entry.status)}
            </select>
          </td>
          <td><button class="delete-btn" data-id="${escapeHtml(entry.id)}">Delete</button></td>
        </tr>
      `
    )
    .join("");

  refs.poTableBody.querySelectorAll(".table-status-select").forEach((select) => {
    select.addEventListener("change", async () => {
      const nextStatus = select.value;
      select.dataset.status = nextStatus;
      await apiFetch(`/api/entries/${encodeURIComponent(select.dataset.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus })
      });
      await refreshState(`Status updated to ${nextStatus}`);
    });
  });

  refs.poTableBody.querySelectorAll(".delete-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      await apiFetch(`/api/entries/${encodeURIComponent(button.dataset.id)}`, { method: "DELETE" });
      await refreshState("Entry deleted");
    });
  });
}

function getSpendByCategory() {
  return state.entries.reduce((acc, entry) => {
    if (entry.status === "Cancelled") return acc;
    acc[entry.category] = (acc[entry.category] || 0) + entry.amount;
    return acc;
  }, {});
}

function getSpendByFootwearBrand() {
  return state.entries.reduce((acc, entry) => {
    if (entry.status === "Cancelled" || entry.category !== "Footwear" || !entry.brand) return acc;
    acc[entry.brand] = (acc[entry.brand] || 0) + entry.amount;
    return acc;
  }, {});
}

function getQuarterTotals() {
  return state.entries.reduce((acc, entry) => {
    if (entry.status === "Cancelled") return acc;
    const quarter = getQuarterFromDate(entry.poDate);
    acc[quarter] = (acc[quarter] || 0) + entry.amount;
    return acc;
  }, { AMJ: 0, JAS: 0, OND: 0, JFM: 0 });
}

function getQuarterCategoryTotals() {
  const base = {
    AMJ: {},
    JAS: {},
    OND: {},
    JFM: {}
  };

  return state.entries.reduce((acc, entry) => {
    if (entry.status === "Cancelled") return acc;
    const quarter = getQuarterFromDate(entry.poDate);
    acc[quarter][entry.category] = (acc[quarter][entry.category] || 0) + entry.amount;
    return acc;
  }, base);
}

function getTopLabel(entries, key) {
  if (entries.length === 0) return "No entries yet";

  const grouped = entries.reduce((acc, entry) => {
    const label = entry[key] || "Unknown";
    acc[label] = (acc[label] || 0) + entry.amount;
    return acc;
  }, {});

  return Object.entries(grouped).sort((a, b) => b[1] - a[1])[0][0];
}

function getTopQuarterCategoryLabel(categoryTotals) {
  const items = Object.entries(categoryTotals);
  if (items.length === 0) return "No spend yet";
  const [category, amount] = items.sort((a, b) => b[1] - a[1])[0];
  return `${category} leads with ${formatCurrency(amount)}`;
}

function renderStatusOptions(selectedStatus) {
  return ["Raised", "Invoiced", "Paid", "Delayed", "Cancelled"]
    .map((status) => `<option value="${status}" ${status === selectedStatus ? "selected" : ""}>${status}</option>`)
    .join("");
}

function downloadSheet() {
  if (state.entries.length === 0) {
    setSyncStatus("No transaction data to download", "error");
    return;
  }

  const headers = [
    "Team Member",
    "Reference Number",
    "Date",
    "Category",
    "Brand",
    "Spend Type",
    "Agency or Vendor",
    "Transaction Basis",
    "Purpose",
    "Amount",
    "Status",
    "Notes",
    "Created At"
  ];

  const rows = state.entries.map((entry) => [
    entry.ownerName,
    entry.poNumber,
    entry.poDate,
    entry.category,
    entry.brand,
    entry.spendType,
    entry.vendor,
    entry.recordType,
    entry.purpose,
    entry.amount,
    entry.status,
    entry.notes,
    entry.createdAt || ""
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `cultstore-purchase-orders-${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setSyncStatus("Sheet downloaded", "online");
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const error = new Error(payload.error || payload.detail || `Request failed with status ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return payload;
}

function setSyncStatus(text, tone) {
  refs.syncStatus.textContent = text;
  refs.syncStatus.dataset.tone = tone;
}

function setFormMessage(text, tone = "") {
  refs.formMessage.textContent = text;
  if (tone) {
    refs.formMessage.dataset.tone = tone;
  } else {
    delete refs.formMessage.dataset.tone;
  }
}

function updateAmountLabel() {
  refs.amountLabel.textContent = refs.recordType.value === "Invoice" ? "Invoice amount" : "PO amount";
}

function updateBrandField() {
  const isFootwear = refs.categorySelect.value === "Footwear";
  refs.brandField.classList.toggle("hidden", !isFootwear);
  refs.brandSelect.disabled = !isFootwear;
  if (isFootwear) {
    refs.brandSelect.value = Object.hasOwn(defaultFootwearBrandBudgets, refs.brandSelect.value)
      ? refs.brandSelect.value
      : "Cult";
  } else {
    refs.brandSelect.value = "Cult";
  }
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function getQuarterFromDate(value) {
  const date = new Date(value);
  const month = date.getMonth() + 1;
  if ([4, 5, 6].includes(month)) return "AMJ";
  if ([7, 8, 9].includes(month)) return "JAS";
  if ([10, 11, 12].includes(month)) return "OND";
  return "JFM";
}

function normalizeRecordType(value) {
  return value === "Invoice" ? "Invoice" : "PO";
}

function normalizeAmount(entry) {
  if (typeof entry.amount !== "undefined") return Number(entry.amount) || 0;
  if ((entry.invoiceAmount || 0) > 0 && (entry.poAmount || 0) === 0) return Number(entry.invoiceAmount) || 0;
  return Number(entry.poAmount) || Number(entry.invoiceAmount) || 0;
}

function normalizeOwnerName(entry) {
  return String(entry.ownerName || entry.owner || "").trim() || "Unknown";
}

function normalizeBrand(entry) {
  if (entry.category !== "Footwear") return "";
  return Object.hasOwn(defaultFootwearBrandBudgets, entry.brand) ? entry.brand : "Cult";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}
