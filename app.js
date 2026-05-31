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
const partnerTypeOptions = [
  "Agency",
  "In House",
  "Production House",
  "Influencer / Talent",
  "Media Vendor",
  "Event Agency",
  "Sponsorship Partner",
  "Research Vendor",
  "Misc Vendor"
];
const spendHeadOptions = [
  "Media",
  "Brand Campaign Production",
  "Influencer",
  "Social Media Production",
  "Social Media Boosting",
  "Event",
  "Event Video Production",
  "Brand Campaign Agency",
  "Research",
  "CRM",
  "Product Orders",
  "Misc"
];
const partnerTypeToSpendHead = {
  Agency: "Brand Campaign Agency",
  "In House": "Misc",
  "Production House": "Brand Campaign Production",
  "Influencer / Talent": "Influencer",
  "Media Vendor": "Media",
  "Event Agency": "Event",
  "Sponsorship Partner": "Event",
  "Research Vendor": "Research",
  "Misc Vendor": "Misc"
};

const state = {
  budgets: { ...defaultBudgets },
  footwearBrandBudgets: { ...defaultFootwearBrandBudgets },
  entries: []
};
const STATE_CACHE_KEY = "cultstore-budget-flow-cache-v1";

const refs = {
  owner: document.getElementById("owner"),
  attachment: document.getElementById("attachment"),
  budgetList: document.getElementById("budgetList"),
  spendBars: document.getElementById("spendBars"),
  spendHeadBars: document.getElementById("spendHeadBars"),
  categorySelect: document.getElementById("category"),
  brandField: document.getElementById("brandField"),
  brandSelect: document.getElementById("brand"),
  partnerType: document.getElementById("partnerType"),
  spendHead: document.getElementById("spendHead"),
  filterMonth: document.getElementById("filterMonth"),
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
  topSpendHead: document.getElementById("topSpendHead"),
  quarterGrid: document.getElementById("quarterGrid"),
  quarterTableBody: document.getElementById("quarterTableBody"),
  spendHeadMatrixBody: document.getElementById("spendHeadMatrixBody"),
  budgetItemTemplate: document.getElementById("budgetItemTemplate"),
  clearForm: document.getElementById("clearForm"),
  jumpToForm: document.getElementById("jumpToForm"),
  resetApp: document.getElementById("resetApp"),
  syncStatus: document.getElementById("syncStatus"),
  formMessage: document.getElementById("formMessage"),
  editModal: document.getElementById("editModal"),
  editEntryForm: document.getElementById("editEntryForm"),
  editEntryId: document.getElementById("editEntryId"),
  editOwner: document.getElementById("editOwner"),
  editPoNumber: document.getElementById("editPoNumber"),
  editPoDate: document.getElementById("editPoDate"),
  editCategory: document.getElementById("editCategory"),
  editBrandField: document.getElementById("editBrandField"),
  editBrand: document.getElementById("editBrand"),
  editPartnerType: document.getElementById("editPartnerType"),
  editVendor: document.getElementById("editVendor"),
  editSpendHead: document.getElementById("editSpendHead"),
  editRecordType: document.getElementById("editRecordType"),
  editStatus: document.getElementById("editStatus"),
  editPurpose: document.getElementById("editPurpose"),
  editAmount: document.getElementById("editAmount"),
  editNotes: document.getElementById("editNotes"),
  editEntrySave: document.getElementById("editEntrySave"),
  editEntryCancel: document.getElementById("editEntryCancel"),
  editModalClose: document.getElementById("editModalClose"),
  editFormMessage: document.getElementById("editFormMessage"),
  downloadSheet: document.getElementById("downloadSheet"),
  recordType: document.getElementById("recordType"),
  amountLabel: document.getElementById("amountLabel"),
  rowPdfInput: document.getElementById("rowPdfInput")
};
let pendingRowPdfEntryId = null;

init();

async function init() {
  bindEvents();
  setDefaultDate();
  updateAmountLabel();
  populatePartnerTypeOptions();
  populateSpendHeadOptions();
  syncSpendHeadFromPartnerType();
  populateCategoryOptions();
  updateBrandField();
  updateEditBrandField();
  hydrateStateFromCache();
  await refreshState();
}

function bindEvents() {
  refs.poForm.addEventListener("submit", handleSubmit);
  refs.searchInput.addEventListener("input", renderTable);
  refs.filterMonth.addEventListener("change", renderTable);
  refs.filterCategory.addEventListener("change", renderTable);
  refs.filterStatus.addEventListener("change", renderTable);
  refs.clearForm.addEventListener("click", () => {
    refs.poForm.reset();
    setDefaultDate();
    updateAmountLabel();
    updateBrandField();
    syncSpendHeadFromPartnerType();
    setFormMessage("");
  });
  refs.jumpToForm.addEventListener("click", () => {
    document.getElementById("poFormPanel").scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("owner").focus();
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
    syncSpendHeadFromPartnerType();
  });
  refs.downloadSheet.addEventListener("click", downloadSheet);
  refs.recordType.addEventListener("change", updateAmountLabel);
  refs.categorySelect.addEventListener("change", updateBrandField);
  refs.partnerType.addEventListener("change", syncSpendHeadFromPartnerType);
  refs.editEntryForm.addEventListener("submit", handleEditSubmit);
  refs.editCategory.addEventListener("change", updateEditBrandField);
  refs.editPartnerType.addEventListener("change", syncEditSpendHeadFromPartnerType);
  refs.editEntryCancel.addEventListener("click", closeEditModal);
  refs.editModalClose.addEventListener("click", closeEditModal);
  refs.editModal.addEventListener("click", (event) => {
    if (event.target === refs.editModal) closeEditModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !refs.editModal.classList.contains("hidden")) {
      closeEditModal();
    }
  });
  refs.rowPdfInput.addEventListener("change", handleRowPdfSelection);
}

function setDefaultDate() {
  document.getElementById("poDate").value = new Date().toISOString().slice(0, 10);
}

async function refreshState(message = "Connected") {
  try {
    setSyncStatus("Syncing...", "pending");
    const nextState = await apiFetch("/api/state", {}, { retries: 2, retryDelayMs: 1200, timeoutMs: 15000 });
    applyIncomingState(nextState);
    persistStateCache(nextState);
    render();
    setSyncStatus(message, "online");
  } catch (error) {
    const cachedState = readStateCache();
    if (cachedState) {
      applyIncomingState(cachedState);
      render();
      setSyncStatus("Weak network: showing last synced data", "pending");
    } else {
      setSyncStatus("Server unavailable", "error");
    }
    console.error(error);
  }
}

function applyIncomingState(nextState) {
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
        partnerType: normalizePartnerType(entry),
        spendHead: normalizeSpendHead(entry),
        ownerName: normalizeOwnerName(entry),
        recordType: normalizeRecordType(entry.recordType),
        amount: normalizeAmount(entry)
      }))
    : [];
}

function hydrateStateFromCache() {
  const cachedState = readStateCache();
  if (!cachedState) return;
  applyIncomingState(cachedState);
  render();
  setSyncStatus("Loading latest data...", "pending");
}

function populateCategoryOptions() {
  const currentCategory = refs.categorySelect.value;
  const currentEditCategory = refs.editCategory.value;
  const currentFilter = refs.filterCategory.value;
  const categories = Object.keys(state.budgets);

  refs.categorySelect.innerHTML = categories
    .map((category) => `<option value="${category}">${category}</option>`)
    .join("");

  refs.editCategory.innerHTML = categories
    .map((category) => `<option value="${category}">${category}</option>`)
    .join("");

  refs.filterCategory.innerHTML = [
    `<option value="all">All categories</option>`,
    ...categories.map((category) => `<option value="${category}">${category}</option>`)
  ].join("");

  refs.categorySelect.value = categories.includes(currentCategory) ? currentCategory : categories[0];
  refs.editCategory.value = categories.includes(currentEditCategory) ? currentEditCategory : categories[0];
  refs.filterCategory.value = ["all", ...categories].includes(currentFilter) ? currentFilter : "all";
  updateBrandField();
  updateEditBrandField();
}

function populatePartnerTypeOptions() {
  const options = partnerTypeOptions
    .map((partnerType) => `<option value="${partnerType}">${partnerType}</option>`)
    .join("");
  refs.partnerType.innerHTML = options;
  refs.editPartnerType.innerHTML = options;
}

function populateSpendHeadOptions() {
  const options = spendHeadOptions
    .map((spendHead) => `<option value="${spendHead}">${spendHead}</option>`)
    .join("");
  refs.spendHead.innerHTML = options;
  refs.editSpendHead.innerHTML = options;
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
    partnerType: String(formData.get("partnerType")),
    spendHead: String(formData.get("spendHead")),
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
    const attachmentFile = refs.attachment.files?.[0] || null;
    setFormMessage(attachmentFile ? "Saving entry and uploading PDF..." : "Saving entry...", "success");
    const createdEntry = await apiFetch("/api/entries", {
      method: "POST",
      body: JSON.stringify(entry)
    });

    if (attachmentFile) {
      await uploadPdfForEntry(createdEntry.id, attachmentFile);
    }
  } catch (error) {
    console.error(error);
    setFormMessage(error.message || "Could not save the entry. Please try again.", "error");
    setSyncStatus("Save failed", "error");
    submitButton.disabled = false;
    submitButton.textContent = "SAVE";
    return;
  }

  form.reset();
  setDefaultDate();
  updateAmountLabel();
  updateBrandField();
  syncSpendHeadFromPartnerType();
  setFormMessage(`Saved ${entry.poNumber || "transaction"} successfully.`, "success");
  await refreshState("Entry saved");
  submitButton.disabled = false;
  submitButton.textContent = "SAVE";
}

function render() {
  populateCategoryOptions();
  populateMonthFilterOptions();
  renderSummary();
  renderBudgetList();
  renderSpendBars();
  renderQuarterSection();
  renderSpendHeadSection();
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
  refs.topSpendHead.textContent = getTopLabel(activeEntries, "spendHead");
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

function renderSpendHeadSection() {
  refs.spendHeadBars.innerHTML = "";
  const spendBySpendHead = getSpendBySpendHead();
  const maxSpend = Math.max(...Object.values(spendBySpendHead), 0);

  if (maxSpend === 0) {
    refs.spendHeadBars.innerHTML = `<div class="empty-state">Log your first transaction to see how the budget splits across spend heads.</div>`;
  } else {
    spendHeadOptions.forEach((spendHead) => {
      const amount = spendBySpendHead[spendHead] || 0;
      const bar = document.createElement("div");
      bar.className = "spend-bar";
      bar.innerHTML = `
        <div class="spend-bar-head">
          <strong>${escapeHtml(spendHead)}</strong>
          <span>${formatCurrency(amount)}</span>
        </div>
        <div class="spend-bar-track">
          <div class="spend-bar-fill" style="width:${maxSpend ? (amount / maxSpend) * 100 : 0}%"></div>
        </div>
      `;
      refs.spendHeadBars.appendChild(bar);
    });
  }

  const matrix = getCategorySpendHeadMatrix();
  refs.spendHeadMatrixBody.innerHTML = Object.keys(state.budgets)
    .map((category) => {
      const row = matrix[category] || {};
      const total = spendHeadOptions.reduce((sum, spendHead) => sum + (row[spendHead] || 0), 0);
      return `
        <tr>
          <td><strong>${escapeHtml(category)}</strong></td>
          ${spendHeadOptions.map((spendHead) => `<td>${formatCurrency(row[spendHead] || 0)}</td>`).join("")}
          <td><strong>${formatCurrency(total)}</strong></td>
        </tr>
      `;
    })
    .join("");
}

function renderTable() {
  const query = refs.searchInput.value.trim().toLowerCase();
  const monthFilter = refs.filterMonth.value;
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
        entry.partnerType,
        entry.spendHead,
        entry.vendor,
        entry.purpose,
        entry.notes,
        entry.attachmentName
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);

    const matchesCategory = categoryFilter === "all" || entry.category === categoryFilter;
    const matchesStatus = statusFilter === "all" || entry.status === statusFilter;
    const matchesMonth = monthFilter === "all" || getMonthKey(entry.poDate) === monthFilter;

    return matchesQuery && matchesCategory && matchesStatus && matchesMonth;
  });

  if (filtered.length === 0) {
    refs.poTableBody.innerHTML = `
      <tr>
        <td colspan="14" class="empty-state">No purchase orders match the current filters.</td>
      </tr>
    `;
    return;
  }

  refs.poTableBody.innerHTML = filtered
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(entry.ownerName || "Unknown")}</td>
          <td>
            <input
              class="table-po-input"
              data-id="${escapeHtml(entry.id)}"
              type="text"
              value="${escapeHtml(entry.poNumber)}"
              placeholder="Add later"
            />
          </td>
          <td>
            <input
              class="table-date-input"
              data-id="${escapeHtml(entry.id)}"
              type="date"
              value="${escapeHtml(entry.poDate)}"
            />
          </td>
          <td>${escapeHtml(entry.category)}</td>
          <td>${entry.brand ? `<span class="brand-pill">${escapeHtml(entry.brand)}</span>` : "—"}</td>
          <td>${escapeHtml(entry.partnerType)}</td>
          <td>${escapeHtml(entry.vendor)}</td>
          <td><span class="brand-pill spend-head-pill">${escapeHtml(entry.spendHead)}</span></td>
          <td><span class="basis-pill" data-basis="${escapeHtml(entry.recordType)}">${escapeHtml(entry.recordType)}</span></td>
          <td>
            <strong>${escapeHtml(entry.purpose)}</strong>
            ${entry.notes ? `<div class="notes">${escapeHtml(entry.notes)}</div>` : ""}
          </td>
          <td>${formatCurrency(entry.amount)}</td>
          <td>${renderAttachmentCell(entry)}</td>
          <td>
            <select class="table-status-select" data-id="${escapeHtml(entry.id)}" data-status="${escapeHtml(entry.status)}">
              ${renderStatusOptions(entry.status)}
            </select>
          </td>
          <td class="table-row-actions">
            <button class="inline-action edit-btn" type="button" data-id="${escapeHtml(entry.id)}">Edit</button>
            <button class="delete-btn" data-id="${escapeHtml(entry.id)}">Delete</button>
          </td>
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

  refs.poTableBody.querySelectorAll(".table-po-input").forEach((input) => {
    let initialValue = input.value;
    const savePoNumber = async () => {
      const nextValue = input.value.trim();
      if (nextValue === initialValue) return;
      input.disabled = true;
      try {
        await apiFetch(`/api/entries/${encodeURIComponent(input.dataset.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ poNumber: nextValue })
        });
        initialValue = nextValue;
        await refreshState(nextValue ? "PO number updated" : "PO number cleared");
      } catch (error) {
        console.error(error);
        setSyncStatus("PO update failed", "error");
        input.value = initialValue;
      } finally {
        input.disabled = false;
      }
    };

    input.addEventListener("blur", savePoNumber);
    input.addEventListener("keydown", async (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      }
    });
  });

  refs.poTableBody.querySelectorAll(".table-date-input").forEach((input) => {
    let initialValue = input.value;
    const savePoDate = async () => {
      const nextValue = input.value;
      if (nextValue === initialValue || !nextValue) return;
      input.disabled = true;
      try {
        await apiFetch(`/api/entries/${encodeURIComponent(input.dataset.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ poDate: nextValue })
        });
        initialValue = nextValue;
        await refreshState("Date updated");
      } catch (error) {
        console.error(error);
        setSyncStatus("Date update failed", "error");
        input.value = initialValue;
      } finally {
        input.disabled = false;
      }
    };

    input.addEventListener("change", savePoDate);
    input.addEventListener("blur", savePoDate);
  });

  refs.poTableBody.querySelectorAll(".delete-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      await apiFetch(`/api/entries/${encodeURIComponent(button.dataset.id)}`, { method: "DELETE" });
      await refreshState("Entry deleted");
    });
  });

  refs.poTableBody.querySelectorAll(".edit-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const entry = state.entries.find((item) => item.id === button.dataset.id);
      if (entry) openEditModal(entry);
    });
  });

  refs.poTableBody.querySelectorAll(".attachment-trigger").forEach((button) => {
    button.addEventListener("click", () => {
      pendingRowPdfEntryId = button.dataset.id;
      refs.rowPdfInput.value = "";
      refs.rowPdfInput.click();
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

function populateMonthFilterOptions() {
  const currentValue = refs.filterMonth.value;
  const monthKeys = [...new Set(state.entries.map((entry) => getMonthKey(entry.poDate)).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a));

  refs.filterMonth.innerHTML = [
    `<option value="all">All months</option>`,
    ...monthKeys.map((monthKey) => `<option value="${monthKey}">${formatMonthLabel(monthKey)}</option>`)
  ].join("");

  refs.filterMonth.value = ["all", ...monthKeys].includes(currentValue) ? currentValue : "all";
}

function getSpendByFootwearBrand() {
  return state.entries.reduce((acc, entry) => {
    if (entry.status === "Cancelled" || entry.category !== "Footwear" || !entry.brand) return acc;
    acc[entry.brand] = (acc[entry.brand] || 0) + entry.amount;
    return acc;
  }, {});
}

function getSpendBySpendHead() {
  return state.entries.reduce((acc, entry) => {
    if (entry.status === "Cancelled") return acc;
    acc[entry.spendHead] = (acc[entry.spendHead] || 0) + entry.amount;
    return acc;
  }, Object.fromEntries(spendHeadOptions.map((spendHead) => [spendHead, 0])));
}

function getCategorySpendHeadMatrix() {
  const base = Object.fromEntries(
    Object.keys(state.budgets).map((category) => [
      category,
      Object.fromEntries(spendHeadOptions.map((spendHead) => [spendHead, 0]))
    ])
  );

  return state.entries.reduce((acc, entry) => {
    if (entry.status === "Cancelled") return acc;
    acc[entry.category][entry.spendHead] = (acc[entry.category][entry.spendHead] || 0) + entry.amount;
    return acc;
  }, base);
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
  return ["PO In Process", "Raised", "Invoiced", "Paid", "Delayed", "Cancelled"]
    .map((status) => `<option value="${status}" ${status === selectedStatus ? "selected" : ""}>${status}</option>`)
    .join("");
}

function renderAttachmentCell(entry) {
  if (entry.attachmentName) {
    return `
      <div class="attachment-cell">
        <a class="attachment-link" href="/api/entries/${encodeURIComponent(entry.id)}/attachment" target="_blank" rel="noreferrer">View PDF</a>
        <button class="inline-action attachment-trigger" type="button" data-id="${escapeHtml(entry.id)}">Replace</button>
      </div>
    `;
  }

  return `<button class="inline-action attachment-trigger" type="button" data-id="${escapeHtml(entry.id)}">Upload PDF</button>`;
}

function openEditModal(entry) {
  refs.editEntryId.value = entry.id;
  refs.editOwner.value = entry.ownerName;
  refs.editPoNumber.value = entry.poNumber;
  refs.editPoDate.value = entry.poDate;
  refs.editCategory.value = entry.category;
  refs.editPartnerType.value = entry.partnerType;
  refs.editVendor.value = entry.vendor;
  refs.editRecordType.value = entry.recordType;
  refs.editPurpose.value = entry.purpose;
  refs.editAmount.value = entry.amount;
  refs.editNotes.value = entry.notes;
  refs.editStatus.value = entry.status;
  updateEditBrandField();
  refs.editBrand.value = entry.brand || "Cult";
  refs.editSpendHead.value = spendHeadOptions.includes(entry.spendHead)
    ? entry.spendHead
    : getSpendHeadForPartnerType(entry.partnerType);
  refs.editModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  setEditFormMessage("");
  refs.editOwner.focus();
}

function closeEditModal() {
  refs.editModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  refs.editEntryForm.reset();
  setEditFormMessage("");
}

async function handleEditSubmit(event) {
  event.preventDefault();
  const formData = new FormData(refs.editEntryForm);
  const payload = {
    ownerName: String(formData.get("ownerName")).trim(),
    poNumber: String(formData.get("poNumber")).trim(),
    poDate: String(formData.get("poDate")),
    category: String(formData.get("category")),
    brand: String(formData.get("brand") || ""),
    partnerType: String(formData.get("partnerType")),
    spendHead: String(formData.get("spendHead")),
    vendor: String(formData.get("vendor")).trim(),
    recordType: String(formData.get("recordType")),
    purpose: String(formData.get("purpose")).trim(),
    amount: Number(formData.get("amount")) || 0,
    status: String(formData.get("status")),
    notes: String(formData.get("notes")).trim()
  };

  refs.editEntrySave.disabled = true;
  refs.editEntrySave.textContent = "Saving...";

  try {
    await apiFetch(`/api/entries/${encodeURIComponent(refs.editEntryId.value)}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    await refreshState("Entry updated");
    closeEditModal();
  } catch (error) {
    console.error(error);
    setEditFormMessage(error.message || "Could not update the entry.", "error");
  } finally {
    refs.editEntrySave.disabled = false;
    refs.editEntrySave.textContent = "Save changes";
  }
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
    "Partner Type",
    "Agency or Vendor",
    "Spend Head",
    "Transaction Basis",
    "Purpose",
    "Amount",
    "Attachment Name",
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
    entry.partnerType,
    entry.vendor,
    entry.spendHead,
    entry.recordType,
    entry.purpose,
    entry.amount,
    entry.attachmentName,
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

async function apiFetch(url, options = {}, config = {}) {
  const retries = config.retries ?? 0;
  const retryDelayMs = config.retryDelayMs ?? 800;
  const timeoutMs = config.timeoutMs ?? 12000;
  let attempt = 0;
  let lastError = null;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        ...options,
        signal: controller.signal
      });

      const text = await response.text();
      const payload = text ? JSON.parse(text) : {};

      if (!response.ok) {
        const error = new Error(payload.error || payload.detail || `Request failed with status ${response.status}`);
        error.status = response.status;
        throw error;
      }

      return payload;
    } catch (error) {
      lastError = error?.name === "AbortError"
        ? new Error("Connection timed out. Please check your network and try again.")
        : error;

      if (attempt >= retries) {
        throw lastError;
      }

      await delay(retryDelayMs * (attempt + 1));
    } finally {
      window.clearTimeout(timeout);
    }

    attempt += 1;
  }

  throw lastError || new Error("Request failed");
}

async function uploadPdfForEntry(entryId, file) {
  validatePdfFile(file);
  const buffer = await file.arrayBuffer();
  const base64Data = arrayBufferToBase64(buffer);

  await apiFetch(`/api/entries/${encodeURIComponent(entryId)}/attachment`, {
    method: "POST",
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type || "application/pdf",
      base64Data
    })
  });
}

async function handleRowPdfSelection(event) {
  const file = event.target.files?.[0];
  const entryId = pendingRowPdfEntryId;
  pendingRowPdfEntryId = null;
  event.target.value = "";

  if (!file || !entryId) return;

  try {
    setSyncStatus("Uploading PDF...", "pending");
    await uploadPdfForEntry(entryId, file);
    await refreshState("PDF uploaded");
  } catch (error) {
    console.error(error);
    setSyncStatus("PDF upload failed", "error");
    setFormMessage(error.message || "Could not upload the PDF.", "error");
  }
}

function setSyncStatus(text, tone) {
  refs.syncStatus.textContent = text;
  refs.syncStatus.dataset.tone = tone;
}

function persistStateCache(payload) {
  try {
    window.localStorage.setItem(STATE_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures so the app still works in restrictive browsers.
  }
}

function readStateCache() {
  try {
    const raw = window.localStorage.getItem(STATE_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function setFormMessage(text, tone = "") {
  refs.formMessage.textContent = text;
  if (tone) {
    refs.formMessage.dataset.tone = tone;
  } else {
    delete refs.formMessage.dataset.tone;
  }
}

function setEditFormMessage(text, tone = "") {
  refs.editFormMessage.textContent = text;
  if (tone) {
    refs.editFormMessage.dataset.tone = tone;
  } else {
    delete refs.editFormMessage.dataset.tone;
  }
}

function updateAmountLabel() {
  refs.amountLabel.textContent = "Amount";
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

function updateEditBrandField() {
  const isFootwear = refs.editCategory.value === "Footwear";
  refs.editBrandField.classList.toggle("hidden", !isFootwear);
  refs.editBrand.disabled = !isFootwear;
  if (isFootwear) {
    refs.editBrand.value = Object.hasOwn(defaultFootwearBrandBudgets, refs.editBrand.value)
      ? refs.editBrand.value
      : "Cult";
  } else {
    refs.editBrand.value = "Cult";
  }
}

function syncSpendHeadFromPartnerType() {
  refs.spendHead.value = getSpendHeadForPartnerType(refs.partnerType.value);
}

function syncEditSpendHeadFromPartnerType() {
  refs.editSpendHead.value = getSpendHeadForPartnerType(refs.editPartnerType.value);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function validatePdfFile(file) {
  if (!file) return;
  const normalizedName = String(file.name || "").toLowerCase();
  const isPdf = file.type === "application/pdf" || normalizedName.endsWith(".pdf");
  if (!isPdf) {
    throw new Error("Please upload a PDF file only.");
  }
  const maxBytes = 10 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error("Please keep the PDF under 10 MB.");
  }
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
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

function getMonthKey(value) {
  if (!value) return "";
  return String(value).slice(0, 7);
}

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-");
  if (!year || !month) return monthKey;
  const date = new Date(Number(year), Number(month) - 1, 1);
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric"
  }).format(date);
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

function normalizePartnerType(entry) {
  const rawValue = String(entry.partnerType || entry.spendType || "").trim();
  if (partnerTypeOptions.includes(rawValue)) return rawValue;
  return legacySpendTypeToPartnerType(rawValue);
}

function normalizeSpendHead(entry) {
  const rawValue = String(entry.spendHead || "").trim();
  if (spendHeadOptions.includes(rawValue)) return rawValue;
  const mappedLegacyValue = legacySpendHeadToCurrent(rawValue);
  if (spendHeadOptions.includes(mappedLegacyValue)) return mappedLegacyValue;
  return getSpendHeadForPartnerType(normalizePartnerType(entry));
}

function legacySpendTypeToPartnerType(value) {
  const mapping = {
    Influencer: "Influencer / Talent",
    Event: "Event Agency",
    Partnership: "Sponsorship Partner",
    "Social Media": "Media Vendor",
    Production: "Production House",
    "Agency Retainer": "Agency",
    Travel: "Misc Vendor",
    Other: "Misc Vendor"
  };
  return mapping[value] || "Misc Vendor";
}

function legacySpendHeadToCurrent(value) {
  const mapping = {
    Media: "Media",
    Production: "Brand Campaign Production",
    Influencers: "Influencer",
    Events: "Event",
    Sponsorships: "Event",
    Research: "Research",
    Misc: "Misc"
  };

  return mapping[value] || "";
}

function getSpendHeadForPartnerType(partnerType) {
  return partnerTypeToSpendHead[partnerType] || "Misc";
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
