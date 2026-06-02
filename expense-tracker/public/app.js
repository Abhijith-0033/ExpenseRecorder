// ─── Chart.js global dark theme defaults ─────────────────────────────────────
// This block runs immediately when app.js is parsed (Chart.js is loaded before it in <head>)
if (typeof Chart !== 'undefined') {
  Chart.defaults.color        = '#8888a0';
  Chart.defaults.borderColor  = '#2e2e3e';
  Chart.defaults.font.family  = "'DM Sans', sans-serif";
}

const CATEGORY_COLORS = {
  Food:          '#f7706a',
  Transport:     '#6a9ef7',
  Shopping:      '#f7c56a',
  Bills:         '#a99ef9',
  Entertainment: '#6af7c5',
  Other:         '#8888a0'
};

// Shared dynamic color map — updated whenever categories are fetched from DB
// Falls back to CATEGORY_COLORS for any known built-in, then a default grey
let categoryColorMap = { ...CATEGORY_COLORS };

function getCategoryColor(name) {
  return categoryColorMap[name] || CATEGORY_COLORS[name] || '#8888a0';
}

const state = {
  expenses:  [],
  editingId: null,
  filters: {
    category: '',
    from:     '',
    to:       '',
    search:   ''
  }
};

function formatCurrency(amount) {
  return '₹' + Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d).padStart(2, '0')} ${months[m - 1]} ${y}`;
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function getTodayString() {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = String(now.getMonth() + 1).padStart(2, '0');
  const d   = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function loadExpenses() {
  const params = new URLSearchParams();
  if (state.filters.category) params.set('category', state.filters.category);
  if (state.filters.from)     params.set('from', state.filters.from);
  if (state.filters.to)       params.set('to', state.filters.to);
  if (state.filters.search)   params.set('search', state.filters.search);

  try {
    const res  = await fetch('/api/expenses?' + params.toString());
    const data = await res.json();
    if (!res.ok) {
      console.error('Failed to load expenses:', data.error);
      return;
    }
    state.expenses = data;
    renderExpenseList();
  } catch (err) {
    console.error('Network error loading expenses:', err);
  }
}

async function loadSummary() {
  try {
    const res  = await fetch('/api/summary');
    const data = await res.json();
    if (!res.ok) return;

    document.getElementById('summary-month').textContent = data.month;
    document.getElementById('summary-total').textContent = formatCurrency(data.totalSpent);

    const container = document.getElementById('summary-breakdown');
    container.innerHTML = '';

    data.breakdown.forEach(item => {
      const pct   = data.totalSpent > 0
        ? ((item.total / data.totalSpent) * 100).toFixed(1)
        : 0;
      const color = getCategoryColor(item.category);

      const row = document.createElement('div');
      row.className = 'breakdown-row';

      const label = document.createElement('span');
      label.className = 'breakdown-label';
      label.textContent = item.category;

      const track = document.createElement('div');
      track.className = 'breakdown-bar-track';

      const fill = document.createElement('div');
      fill.className = 'breakdown-bar-fill';
      fill.style.backgroundColor = color;
      fill.style.width = '0%';

      track.appendChild(fill);

      const amountSpan = document.createElement('span');
      amountSpan.className = 'breakdown-amount';
      amountSpan.textContent = formatCurrency(item.total);

      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(amountSpan);
      container.appendChild(row);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fill.style.width = pct + '%';
        });
      });
    });
  } catch (err) {
    console.error('Network error loading summary:', err);
  }
}

function renderExpenseList() {
  const tbody      = document.getElementById('expense-list');
  const emptyState = document.getElementById('empty-state');

  tbody.innerHTML = '';

  if (state.expenses.length === 0) {
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  state.expenses.forEach(expense => {
    const tr = document.createElement('tr');

    const tdDate = document.createElement('td');
    tdDate.className = 'date-cell';
    tdDate.textContent = formatDate(expense.date);
    tr.appendChild(tdDate);

    const tdTitle = document.createElement('td');
    tdTitle.textContent = expense.title;
    tr.appendChild(tdTitle);

    const tdCat = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge badge-${expense.category.toLowerCase()}`;
    badge.textContent = expense.category;
    tdCat.appendChild(badge);
    tr.appendChild(tdCat);

    const tdAmount = document.createElement('td');
    tdAmount.className = 'amount-cell';
    tdAmount.textContent = formatCurrency(expense.amount);
    tr.appendChild(tdAmount);

    const tdNote = document.createElement('td');
    tdNote.className = 'note-cell';
    const noteText = expense.note || '';
    tdNote.textContent = noteText.length > 30 ? noteText.slice(0, 30) + '...' : noteText;
    if (noteText) tdNote.setAttribute('title', noteText);
    tr.appendChild(tdNote);

    const tdActions = document.createElement('td');
    tdActions.className = 'actions-cell';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn-edit';
    editBtn.textContent = 'Edit';
    editBtn.setAttribute('data-id', expense.id);
    editBtn.setAttribute('aria-label', `Edit expense: ${expense.title}`);
    editBtn.addEventListener('click', () => startEdit(expense.id));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.setAttribute('data-id', expense.id);
    deleteBtn.setAttribute('aria-label', `Delete expense: ${expense.title}`);
    deleteBtn.addEventListener('click', () => deleteExpense(expense.id));

    tdActions.appendChild(editBtn);
    tdActions.appendChild(deleteBtn);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });
}

async function handleFormSubmit(e) {
  e.preventDefault();

  const formError = document.getElementById('form-error');

  const title    = document.getElementById('field-title').value.trim();
  const amount   = document.getElementById('field-amount').value;
  const category = document.getElementById('field-category').value;
  const date     = document.getElementById('field-date').value;
  const note     = document.getElementById('field-note').value.trim();

  if (!title) {
    formError.textContent = 'Title is required.';
    return;
  }
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    formError.textContent = 'Please enter a valid positive amount.';
    return;
  }
  if (!category) {
    formError.textContent = 'Please select a category.';
    return;
  }
  if (!date) {
    formError.textContent = 'Please select a date.';
    return;
  }
  if (date > getTodayString()) {
    formError.textContent = 'Expense date cannot be in the future.';
    return;
  }

  formError.textContent = '';

  const payload = { title, amount: Number(amount), category, date, note };

  try {
    let res;
    if (state.editingId !== null) {
      res = await fetch(`/api/expenses/${state.editingId}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload)
      });
    } else {
      res = await fetch('/api/expenses', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload)
      });
    }

    const data = await res.json();

    if (!res.ok) {
      formError.textContent = data.error || 'An error occurred. Please try again.';
      return;
    }

    const wasEditing = state.editingId !== null;
    if (wasEditing) {
      cancelEdit();
    } else {
      document.getElementById('expense-form').reset();
      document.getElementById('field-date').value = getTodayString();
    }

    await loadExpenses();
    await loadSummary();
    showToast(wasEditing ? '✏️ Expense updated successfully!' : '✅ Expense added successfully!');

    // Check budget after saving — warn if over budget (never blocks)
    await checkBudgetAfterExpense(category);

  } catch (err) {
    formError.textContent = 'Network error. Please check the server is running.';
    console.error(err);
  }
}

function startEdit(id) {
  const expense = state.expenses.find(e => e.id === id);
  if (!expense) return;

  document.getElementById('field-title').value    = expense.title;
  document.getElementById('field-amount').value   = expense.amount;
  document.getElementById('field-category').value = expense.category;
  // Remove max constraint so we can set a historical date without being blocked
  const dateField = document.getElementById('field-date');
  dateField.removeAttribute('max');
  dateField.value = expense.date;
  document.getElementById('field-note').value     = expense.note || '';

  state.editingId = id;

  document.getElementById('form-heading').textContent  = 'Edit Expense';
  document.getElementById('btn-submit').textContent    = 'Update Expense';
  document.getElementById('btn-cancel').style.display  = 'inline-flex';
  document.getElementById('form-error').textContent    = '';

  document.getElementById('expense-form').scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() {
  document.getElementById('expense-form').reset();
  const today = getTodayString();
  const dateField = document.getElementById('field-date');
  dateField.value = today;
  dateField.max   = today;   // restore future-date guard

  state.editingId = null;

  document.getElementById('form-heading').textContent  = 'Add Expense';
  document.getElementById('btn-submit').textContent    = 'Add Expense';
  document.getElementById('btn-cancel').style.display  = 'none';
  document.getElementById('form-error').textContent    = '';
}

async function deleteExpense(id) {
  const confirmed = window.confirm('Delete this expense? This cannot be undone.');
  if (!confirmed) return;

  try {
    const res  = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Failed to delete expense.', 'error');
      return;
    }

    await loadExpenses();
    await loadSummary();
    showToast('🗑️ Expense deleted.', 'info');

  } catch (err) {
    showToast('Network error. Please check the server.', 'error');
    console.error(err);
  }
}

function onFilterChange() {
  const from = document.getElementById('filter-from').value;
  const to   = document.getElementById('filter-to').value;

  // Validate date range
  if (from && to && from > to) {
    showToast('"From" date must be on or before the "To" date.', 'error', 4000);
    document.getElementById('filter-to').value = '';
    return;
  }

  state.filters.category = document.getElementById('filter-category').value;
  state.filters.from     = from;
  state.filters.to       = to;
  state.filters.search   = document.getElementById('filter-search').value.trim();
  loadExpenses();
}

function clearFilters() {
  document.getElementById('filter-category').value = '';
  document.getElementById('filter-from').value     = '';
  document.getElementById('filter-to').value       = '';
  document.getElementById('filter-search').value   = '';

  state.filters.category = '';
  state.filters.from     = '';
  state.filters.to       = '';
  state.filters.search   = '';

  loadExpenses();
}

// ─── Toast Notification System ───────────────────────────────────────────────
function showToast(message, type = 'success', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = {
    success: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    error:   '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info:    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || icons.info}</div>
    <div class="toast-message">${message}</div>
    <button class="toast-close" aria-label="Dismiss">&times;</button>
  `;

  const dismiss = () => {
    toast.classList.add('toast-hiding');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  };

  toast.querySelector('.toast-close').addEventListener('click', dismiss);
  container.appendChild(toast);

  setTimeout(dismiss, duration);
}

document.addEventListener('DOMContentLoaded', () => {
  const today = getTodayString();
  // Set today as the default and maximum allowed date (no future expenses/income)
  const expDate = document.getElementById('field-date');
  if (expDate) { expDate.value = today; expDate.max = today; }
  const incDate = document.getElementById('field-income-date');
  if (incDate) { incDate.value = today; incDate.max = today; }

  loadSummary();
  loadExpenses();

  document.getElementById('expense-form')
    .addEventListener('submit', handleFormSubmit);

  document.getElementById('btn-cancel')
    .addEventListener('click', cancelEdit);

  document.getElementById('filter-category')
    .addEventListener('change', onFilterChange);

  document.getElementById('filter-from')
    .addEventListener('change', onFilterChange);

  document.getElementById('filter-to')
    .addEventListener('change', onFilterChange);

  document.getElementById('filter-search')
    .addEventListener('input', debounce(onFilterChange, 300));

  document.getElementById('btn-clear-filters')
    .addEventListener('click', clearFilters);

  // ── New initialisation calls ───────────────────────────────────────
  initTheme();             // initialise dark/light theme switch
  loadCategoryOptions();   // populate form + filter dropdowns from DB
  initPageRouter();        // wire up nav tab clicks
  initDashboard();         // wire up dashboard elements
  initIncome();            // wire up income tab event listeners
  initAccounts();          // wire up accounts tab event listeners
  initAnalysis();          // wire up month prev/next + comparison selector
  initSettings();          // build color swatches + wire up add/delete buttons
  initBudgets();           // load budget settings UI
});

// ══════════════════════════════════════════════════════════════════════════════
// v2 ADDITIONS — Dynamic Categories, Page Router, Dashboard, Analysis, Settings
// ══════════════════════════════════════════════════════════════════════════════

// ─── Shared Category Fetch ────────────────────────────────────────────────────

async function fetchCategories() {
  try {
    const res = await fetch('/api/categories');
    if (!res.ok) return [];
    return res.json();
  } catch (err) {
    console.error('Failed to fetch categories:', err);
    return [];
  }
}

// Populates both the expense form dropdown and the filter dropdown from the DB.
// Preserves the currently selected value if it still exists after reload.
async function loadCategoryOptions() {
  const categories = await fetchCategories();

  // Update the shared dynamic color map
  categories.forEach(cat => { categoryColorMap[cat.name] = cat.color; });

  const selects = [
    document.getElementById('field-category'),
    document.getElementById('filter-category')
  ];

  for (const sel of selects) {
    const currentValue = sel.value;
    // Remove all options except the first placeholder (index 0)
    while (sel.options.length > 1) sel.remove(1);
    // Add one <option> per category
    for (const cat of categories) {
      const opt = document.createElement('option');
      opt.value       = cat.name;
      opt.textContent = cat.name;
      sel.appendChild(opt);
    }
    // Restore selected value if it still exists in the new list
    if ([...sel.options].some(o => o.value === currentValue)) {
      sel.value = currentValue;
    }
  }
}

// ─── Page Router ──────────────────────────────────────────────────────────────

function initPageRouter() {
  const menuItems = document.querySelectorAll('.menu-item');
  const pageTitle = document.getElementById('active-page-title');

  menuItems.forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;

      // Update which menu item looks active
      menuItems.forEach(mi => mi.classList.remove('active'));
      item.classList.add('active');

      // Update the active page title in the top content header
      if (pageTitle) {
        pageTitle.textContent = page.charAt(0).toUpperCase() + page.slice(1);
      }

      // Hide all pages, then show the target
      document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
      const targetPage = document.getElementById('page-' + page);
      if (targetPage) targetPage.classList.remove('hidden');

      // Trigger data loading for data-heavy pages
      if (page === 'dashboard') refreshDashboard();
      if (page === 'income')    refreshIncome();
      if (page === 'analysis')  refreshAnalysis();
      if (page === 'accounts')  refreshAccounts();
      if (page === 'settings')  refreshSettings();
    });
  });
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function initDashboard() {
  // "View All" button switches to the Expenses tab
  document.getElementById('dash-view-all').addEventListener('click', () => {
    const expensesMenuItem = document.querySelector('.menu-item[data-page="expenses"]');
    if (expensesMenuItem) expensesMenuItem.click();
  });
}

async function refreshDashboard() {
  try {
    const res = await fetch('/api/analytics/overview');
    if (!res.ok) throw new Error('Failed to load overview');
    const data = await res.json();

    // ── Update net balance & summary statistics ─────────────────────────────
    document.getElementById('dash-net-balance').textContent =
      formatCurrency(data.accountBalance);
    document.getElementById('dash-month-income').textContent =
      formatCurrency(data.monthly.income);
    document.getElementById('dash-month-expense').textContent =
      formatCurrency(data.monthly.total);

    // ── Update stat widgets ──────────────────────────────────────────────────
    document.getElementById('dash-daily-amount').textContent =
      formatCurrency(data.daily.total);
    document.getElementById('dash-daily-count').textContent =
      `${data.daily.count} expense${data.daily.count !== 1 ? 's' : ''}`;

    document.getElementById('dash-weekly-amount').textContent =
      formatCurrency(data.weekly.total);
    document.getElementById('dash-weekly-count').textContent =
      `${data.weekly.count} expense${data.weekly.count !== 1 ? 's' : ''}`;

    document.getElementById('dash-monthly-amount').textContent =
      formatCurrency(data.monthly.total);
    document.getElementById('dash-monthly-count').textContent =
      `${data.monthly.count} expense${data.monthly.count !== 1 ? 's' : ''}`;

    // ── Update date range context bar ────────────────────────────────────────
    document.getElementById('dash-week-range').textContent =
      `Week: ${formatDate(data.date.weekStart)} – ${formatDate(data.date.weekEnd)}`;
    document.getElementById('dash-month-range').textContent =
      `Month: ${formatDate(data.date.monthStart)} – ${formatDate(data.date.monthEnd)}`;

    // ── Load recent transactions (last 5) ────────────────────────────────────
    const expRes = await fetch('/api/expenses');
    if (!expRes.ok) throw new Error('Failed to load expenses');
    const allExpenses = await expRes.json();
    await renderDashboardRecent(allExpenses.slice(0, 5));

    // ── Load Dashboard Cashflow Chart ───────────────────────────────────────
    await loadDashboardCashflowChart();

  } catch (err) {
    console.error('Dashboard refresh error:', err);
  }
}

async function renderDashboardRecent(expenses) {
  const container = document.getElementById('dash-recent-list');
  const empty     = document.getElementById('dash-empty');

  container.innerHTML = '';

  if (expenses.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  // Fetch category color map
  const categories = await fetchCategories();
  const colorMap   = {};
  categories.forEach(c => { colorMap[c.name] = c.color; });

  for (const exp of expenses) {
    const item = document.createElement('div');
    item.className = 'recent-item';

    const left = document.createElement('div');
    left.className = 'recent-left';

    const dot = document.createElement('div');
    dot.className = 'recent-dot';
    dot.style.background = colorMap[exp.category] || '#8888a0';

    const info = document.createElement('div');

    const title = document.createElement('div');
    title.className  = 'recent-title';
    title.textContent = exp.title;           // XSS-safe: textContent

    const meta = document.createElement('div');
    meta.className  = 'recent-meta';
    meta.textContent = `${formatDate(exp.date)} · ${exp.category}`;  // XSS-safe

    info.appendChild(title);
    info.appendChild(meta);

    const amount = document.createElement('div');
    amount.className  = 'recent-amount';
    amount.textContent = formatCurrency(exp.amount);

    left.appendChild(dot);
    left.appendChild(info);
    item.appendChild(left);
    item.appendChild(amount);
    container.appendChild(item);
  }
}

// ─── Analysis Page ────────────────────────────────────────────────────────────

// State for the analysis page (current year/month being viewed + chart references)
const analysisState = {
  year:  new Date().getFullYear(),
  month: new Date().getMonth() + 1,  // 1-based (1=Jan, 12=Dec)
  charts: {
    daily:      null,
    donut:      null,
    topCat:     null,
    comparison: null
  }
};

function initAnalysis() {
  // Prev month button
  document.getElementById('analysis-prev-month').addEventListener('click', () => {
    analysisState.month--;
    if (analysisState.month < 1) {
      analysisState.month = 12;
      analysisState.year--;
    }
    refreshAnalysis();
  });

  // Next month button
  document.getElementById('analysis-next-month').addEventListener('click', () => {
    analysisState.month++;
    if (analysisState.month > 12) {
      analysisState.month = 1;
      analysisState.year++;
    }
    refreshAnalysis();
  });

  // Comparison months selector
  document.getElementById('comparison-months').addEventListener('change', () => {
    loadComparisonChart();
  });

  // Initialize day detail modal interactions
  initCalendarModal();
}

async function refreshAnalysis() {
  const { year, month } = analysisState;
  const FULL_MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];

  // Update the month label in the selector
  document.getElementById('analysis-month-label').textContent =
    `${FULL_MONTH_NAMES[month - 1]} ${year}`;

  try {
    const res = await fetch(
      `/api/analytics/monthly-detail?year=${year}&month=${month}`
    );
    if (!res.ok) throw new Error('Failed to load monthly detail');
    const data = await res.json();

    // Update total label
    document.getElementById('analysis-daily-total').textContent =
      `Total: ${formatCurrency(data.totalSpent)}`;

    // Render Calendar
    renderCalendar(data);

    // Render the three month-specific charts
    renderDailyChart(data);
    renderDonutChart(data);
    renderTopCatChart(data);

  } catch (err) {
    console.error('Analysis refresh error:', err);
  }

  // Load comparison chart separately (it uses its own n-months parameter)
  loadComparisonChart();

  // Load budget overview progress bars (always current month)
  loadBudgetOverview();
}

function renderCalendar(data) {
  const grid = document.getElementById('analysis-calendar-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const year = data.year;
  const month = data.month;

  // Day of the week for the 1st of the month (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const firstDayIndex = new Date(year, month - 1, 1).getDay();

  // Render empty filler cells for days of the week before the 1st
  for (let i = 0; i < firstDayIndex; i++) {
    const filler = document.createElement('div');
    filler.className = 'cal-day empty';
    grid.appendChild(filler);
  }

  // Find max daily spending to scale the color of the heat dot
  const maxSpend = Math.max(...data.dailyTotals.map(d => d.total), 1);

  // Render each day in the month
  data.dailyTotals.forEach(dayInfo => {
    const cell = document.createElement('div');
    cell.className = 'cal-day';
    if (dayInfo.total > 0) {
      cell.classList.add('has-expense');
    }

    const headerRow = document.createElement('div');
    headerRow.className = 'cal-day-header-row';

    const numSpan = document.createElement('span');
    numSpan.className = 'cal-day-num';
    numSpan.textContent = dayInfo.day;
    headerRow.appendChild(numSpan);

    if (dayInfo.total > 0) {
      const dot = document.createElement('span');
      dot.className = 'cal-day-dot';
      
      // Calculate heat dot opacity/intensity
      const ratio = dayInfo.total / maxSpend;
      const opacity = 0.35 + ratio * 0.65;
      dot.style.backgroundColor = `rgba(247, 112, 106, ${opacity})`;
      dot.title = `₹${dayInfo.total.toFixed(2)}`;
      headerRow.appendChild(dot);
    }
    cell.appendChild(headerRow);

    const amountDiv = document.createElement('div');
    amountDiv.className = 'cal-day-amount';
    amountDiv.textContent = dayInfo.total > 0 ? `₹${Math.round(dayInfo.total).toLocaleString('en-IN')}` : '';
    cell.appendChild(amountDiv);

    cell.addEventListener('click', () => {
      openCalendarModal(year, month, dayInfo.day);
    });

    grid.appendChild(cell);
  });
}

async function openCalendarModal(year, month, day) {
  const modal = document.getElementById('calendar-modal');
  const title = document.getElementById('modal-date-title');
  const totalAmount = document.getElementById('modal-total-amount');
  const expenseCount = document.getElementById('modal-expense-count');
  const categoryBreakdown = document.getElementById('modal-category-breakdown');
  const txList = document.getElementById('modal-tx-list');

  // Format date header
  const monthNames = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];
  title.textContent = `${day} ${monthNames[month - 1]} ${year}`;

  // Reset/Loading state
  totalAmount.textContent = '₹0.00';
  expenseCount.textContent = 'Loading...';
  categoryBreakdown.innerHTML = '';
  txList.innerHTML = '<div class="modal-tx-empty">Loading transactions...</div>';

  modal.classList.remove('hidden');

  try {
    const res = await fetch(`/api/analytics/daily-expenses?year=${year}&month=${month}&day=${day}`);
    if (!res.ok) throw new Error('Failed to fetch day details');
    const data = await res.json();

    // Populate total & count
    totalAmount.textContent = formatCurrency(data.total);
    expenseCount.textContent = `${data.count} expense${data.count === 1 ? '' : 's'}`;

    // Populate category breakdown
    categoryBreakdown.innerHTML = '';
    if (data.categoryBreakdown.length === 0) {
      categoryBreakdown.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">No expenses on this day.</span>';
    } else {
      data.categoryBreakdown.forEach(c => {
        const pill = document.createElement('div');
        pill.className = 'modal-cat-pill';
        
        const dot = document.createElement('span');
        dot.className = 'modal-cat-pill-dot';
        dot.style.backgroundColor = c.color;
        
        const text = document.createElement('span');
        text.textContent = `${c.category}: `;
        
        const val = document.createElement('span');
        val.className = 'modal-cat-pill-amount';
        val.textContent = formatCurrency(c.total);
        
        pill.appendChild(dot);
        pill.appendChild(text);
        pill.appendChild(val);
        categoryBreakdown.appendChild(pill);
      });
    }

    // Populate transaction list
    txList.innerHTML = '';
    if (data.expenses.length === 0) {
      txList.innerHTML = '<div class="modal-tx-empty">No transactions recorded for this day.</div>';
    } else {
      const colorMap = {};
      data.categoryBreakdown.forEach(c => {
        colorMap[c.category] = c.color;
      });

      data.expenses.forEach(e => {
        const item = document.createElement('div');
        item.className = 'modal-tx-item';

        const left = document.createElement('div');
        left.className = 'modal-tx-left';

        const dot = document.createElement('div');
        dot.className = 'modal-tx-dot';
        dot.style.backgroundColor = colorMap[e.category] || '#8888a0';

        const details = document.createElement('div');
        details.className = 'modal-tx-details';

        const t = document.createElement('div');
        t.className = 'modal-tx-title';
        t.textContent = e.title;

        const sub = document.createElement('div');
        sub.className = 'modal-tx-subtitle';
        sub.textContent = `${e.category}${e.account_name ? ' · ' + e.account_name : ''}${e.note ? ' · ' + e.note : ''}`;

        details.appendChild(t);
        details.appendChild(sub);
        left.appendChild(dot);
        left.appendChild(details);

        const amt = document.createElement('div');
        amt.className = 'modal-tx-amount';
        amt.textContent = `-${formatCurrency(e.amount)}`;

        item.appendChild(left);
        item.appendChild(amt);
        txList.appendChild(item);
      });
    }
  } catch (err) {
    console.error('Failed to load daily calendar details:', err);
    expenseCount.textContent = 'Error loading data';
    txList.innerHTML = '<div class="modal-tx-empty" style="color: var(--danger);">Failed to load daily details.</div>';
  }
}

function initCalendarModal() {
  const modal = document.getElementById('calendar-modal');
  if (!modal) return;
  const closeBtn = document.getElementById('modal-close-btn');

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  }

  // Close when clicking overlay backdrop
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
    }
  });

  // Close on Escape key press
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      modal.classList.add('hidden');
    }
  });
}


// Destroys an existing Chart.js instance before redrawing (required by Chart.js)
function destroyChart(key) {
  if (analysisState.charts[key]) {
    analysisState.charts[key].destroy();
    analysisState.charts[key] = null;
  }
}

// ── Chart 1: Daily Spending Bar Chart ─────────────────────────────────────────
function renderDailyChart(data) {
  const emptyEl = document.getElementById('analysis-daily-empty');
  const canvas  = document.getElementById('chart-daily');

  const hasData = data.totalSpent > 0;
  emptyEl.classList.toggle('hidden', hasData);
  canvas.style.display = hasData ? 'block' : 'none';

  if (!hasData) return;

  const labels = data.dailyTotals.map(d => d.day);
  const values = data.dailyTotals.map(d => d.total);

  destroyChart('daily');
  analysisState.charts.daily = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label:           'Spending (₹)',
        data:            values,
        backgroundColor: 'rgba(124, 106, 247, 0.6)',
        borderColor:     '#7c6af7',
        borderWidth:     1,
        borderRadius:    4
      }]
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${formatCurrency(ctx.raw)}`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#8888a0', font: { size: 11 } },
          grid:  { color: '#2e2e3e' }
        },
        y: {
          ticks: {
            color:    '#8888a0',
            font:     { size: 11 },
            callback: val => '₹' + val.toLocaleString('en-IN')
          },
          grid:        { color: '#2e2e3e' },
          beginAtZero: true
        }
      }
    }
  });
}

// ── Chart 2: Category Doughnut Chart ──────────────────────────────────────────
function renderDonutChart(data) {
  const emptyEl = document.getElementById('analysis-donut-empty');
  const canvas  = document.getElementById('chart-category-donut');

  // Only show categories that have spending > 0
  const active  = data.categoryBreakdown.filter(c => c.total > 0);
  const hasData = active.length > 0;
  emptyEl.classList.toggle('hidden', hasData);
  canvas.style.display = hasData ? 'block' : 'none';

  if (!hasData) return;

  destroyChart('donut');
  analysisState.charts.donut = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: active.map(c => c.category),
      datasets: [{
        data:            active.map(c => c.total),
        backgroundColor: active.map(c => c.color),
        borderColor:     '#1a1a24',
        borderWidth:     3,
        hoverOffset:     8
      }]
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color:    '#8888a0',
            font:     { size: 11 },
            boxWidth: 12,
            padding:  12
          }
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const pct = (ctx.parsed / data.totalSpent * 100).toFixed(1);
              return ` ${ctx.label}: ${formatCurrency(ctx.raw)} (${pct}%)`;
            }
          }
        }
      },
      cutout: '60%'
    }
  });
}

// ── Chart 3: Top Categories Horizontal Bar Chart ──────────────────────────────
function renderTopCatChart(data) {
  const emptyEl = document.getElementById('analysis-top-empty');
  const canvas  = document.getElementById('chart-top-categories');

  // Only show categories with spending > 0, sorted by total descending
  const active  = [...data.categoryBreakdown]
    .filter(c => c.total > 0)
    .sort((a, b) => b.total - a.total);
  const hasData = active.length > 0;
  emptyEl.classList.toggle('hidden', hasData);
  canvas.style.display = hasData ? 'block' : 'none';

  if (!hasData) return;

  destroyChart('topCat');
  analysisState.charts.topCat = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: active.map(c => c.category),
      datasets: [{
        data:            active.map(c => c.total),
        backgroundColor: active.map(c => c.color + 'cc'),  // 80% opacity via hex alpha
        borderColor:     active.map(c => c.color),
        borderWidth:     1,
        borderRadius:    4
      }]
    },
    options: {
      indexAxis:           'y',   // makes it a horizontal bar chart
      responsive:          true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => ` ${formatCurrency(ctx.raw)}` }
        }
      },
      scales: {
        x: {
          ticks: {
            color:    '#8888a0',
            font:     { size: 10 },
            callback: val => '₹' + val.toLocaleString('en-IN')
          },
          grid:        { color: '#2e2e3e' },
          beginAtZero: true
        },
        y: {
          ticks: { color: '#e8e8f0', font: { size: 11 } },
          grid:  { display: false }
        }
      }
    }
  });
}

// ── Chart 4: Month-wise Comparison Bar Chart ───────────────────────────────────
async function loadComparisonChart() {
  const n       = parseInt(document.getElementById('comparison-months').value, 10);
  const emptyEl = document.getElementById('analysis-comparison-empty');
  const canvas  = document.getElementById('chart-comparison');

  try {
    const res = await fetch(`/api/analytics/comparison?months=${n}`);
    if (!res.ok) throw new Error('Failed to load comparison data');
    const data = await res.json();

    const hasData = data.months.some(m => m.total > 0);
    emptyEl.classList.toggle('hidden', hasData);
    canvas.style.display = hasData ? 'block' : 'none';

    if (!hasData) return;

    destroyChart('comparison');
    analysisState.charts.comparison = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: data.months.map(m => m.label),
        datasets: [{
          label:  'Total Spent (₹)',
          data:   data.months.map(m => m.total),
          // Last bar (current month) is solid accent; earlier months are faded
          backgroundColor: data.months.map((_, i) =>
            i === data.months.length - 1 ? '#7c6af7' : 'rgba(124,106,247,0.35)'
          ),
          borderColor:  '#7c6af7',
          borderWidth:  1,
          borderRadius: 6
        }]
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label:       ctx => ` ${formatCurrency(ctx.raw)}`,
              afterLabel:  ctx => `  ${data.months[ctx.dataIndex].count} expenses`
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#8888a0', font: { size: 11 } },
            grid:  { color: '#2e2e3e' }
          },
          y: {
            ticks: {
              color:    '#8888a0',
              font:     { size: 11 },
              callback: val => '₹' + val.toLocaleString('en-IN')
            },
            grid:        { color: '#2e2e3e' },
            beginAtZero: true
          }
        }
      }
    });
  } catch (err) {
    console.error('Comparison chart error:', err);
  }
}

// ─── Settings Page ────────────────────────────────────────────────────────────

// The 12 preset color swatches the user can pick when creating a category
const SWATCH_COLORS = [
  '#f7706a', '#6a9ef7', '#f7c56a', '#a99ef9',
  '#6af7c5', '#f77dc4', '#70f7a0', '#f7a06a',
  '#6af0f7', '#c5f76a', '#f76acf', '#6a6af7'
];

function initSettings() {
  const swatchContainer = document.getElementById('color-swatches');
  const hiddenInput     = document.getElementById('new-category-color');

  // Generate swatch circles
  SWATCH_COLORS.forEach((color, i) => {
    const swatch = document.createElement('div');
    swatch.className    = 'color-swatch' + (i === 0 ? ' selected' : '');
    swatch.style.background = color;
    swatch.dataset.color    = color;
    swatch.title            = color;

    swatch.addEventListener('click', () => {
      // Deselect all, select clicked swatch
      document.querySelectorAll('.color-swatch')
        .forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
      hiddenInput.value = color;
    });

    swatchContainer.appendChild(swatch);
  });

  // Wire up add button
  document.getElementById('btn-add-category')
    .addEventListener('click', addCategory);

  // Allow pressing Enter in the name input to add
  document.getElementById('new-category-name')
    .addEventListener('keydown', e => {
      if (e.key === 'Enter') addCategory();
    });

  // Income category swatches
  const incSwatchContainer = document.getElementById('income-color-swatches');
  const incHiddenInput     = document.getElementById('new-income-category-color');
  if (incSwatchContainer && incHiddenInput) {
    SWATCH_COLORS.forEach((color, i) => {
      const swatch = document.createElement('div');
      swatch.className        = 'color-swatch' + (i === 0 ? ' selected' : '');
      swatch.style.background = color;
      swatch.dataset.color    = color;
      swatch.title            = color;
      swatch.addEventListener('click', () => {
        incSwatchContainer.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        swatch.classList.add('selected');
        incHiddenInput.value = color;
      });
      incSwatchContainer.appendChild(swatch);
    });
  }

  const addIncBtn = document.getElementById('btn-add-income-category');
  if (addIncBtn) addIncBtn.addEventListener('click', addIncomeCategory);

  const incNameInput = document.getElementById('new-income-category-name');
  if (incNameInput) incNameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') addIncomeCategory();
  });
}

async function refreshSettings() {
  const categories = await fetchCategories();
  renderCategoriesList(categories);
  await refreshIncomeCategories();
  await loadBudgetSettingsList();
}

function renderCategoriesList(categories) {
  const container = document.getElementById('categories-list');
  container.innerHTML = '';

  for (const cat of categories) {
    const item = document.createElement('div');
    item.className = 'category-item';

    const left = document.createElement('div');
    left.className = 'category-item-left';

    const dot = document.createElement('div');
    dot.className      = 'category-color-dot';
    dot.style.background = cat.color;

    const name = document.createElement('span');
    name.className  = 'category-name';
    name.textContent = cat.name;

    left.appendChild(dot);
    left.appendChild(name);

    if (cat.is_default) {
      const badge = document.createElement('span');
      badge.className  = 'category-badge-default';
      badge.textContent = 'Built-in';
      left.appendChild(badge);
    }

    item.appendChild(left);

    const actions = document.createElement('div');
    actions.className = 'category-item-actions';

    // Edit button (always visible — built-ins can change color)
    const editBtn = document.createElement('button');
    editBtn.className   = 'btn-edit-cat';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => editCategory(cat.id, cat.name, cat.color, cat.is_default));
    actions.appendChild(editBtn);

    // Delete button (custom only)
    if (!cat.is_default) {
      const del = document.createElement('button');
      del.className    = 'btn-delete-cat';
      del.textContent  = 'Delete';
      del.addEventListener('click', () => deleteCategory(cat.id, cat.name));
      actions.appendChild(del);
    }

    item.appendChild(actions);
    container.appendChild(item);
  }
}

async function addCategory() {
  const nameInput  = document.getElementById('new-category-name');
  const colorInput = document.getElementById('new-category-color');
  const errorEl    = document.getElementById('settings-error');
  const successEl  = document.getElementById('settings-success');

  const name  = nameInput.value.trim();
  const color = colorInput.value;

  // Hide previous messages
  errorEl.classList.add('hidden');
  successEl.classList.add('hidden');

  // Client-side validation (server also validates, this is UX)
  if (!name) {
    errorEl.textContent = 'Category name cannot be empty.';
    errorEl.classList.remove('hidden');
    nameInput.focus();
    return;
  }
  if (name.length > 50) {
    errorEl.textContent = 'Name must be 50 characters or fewer.';
    errorEl.classList.remove('hidden');
    return;
  }

  try {
    const res = await fetch('/api/categories', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, color })
    });
    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || 'Failed to add category.';
      errorEl.classList.remove('hidden');
      return;
    }

    // Success feedback
    nameInput.value = '';
    successEl.textContent = `"${data.name}" added successfully!`;
    successEl.classList.remove('hidden');
    // Auto-hide success message after 3 seconds
    setTimeout(() => successEl.classList.add('hidden'), 3000);

    // Refresh the list and the form dropdowns
    await refreshSettings();
    await loadCategoryOptions();

  } catch (err) {
    errorEl.textContent = 'Network error. Please check the server is running.';
    errorEl.classList.remove('hidden');
    console.error(err);
  }
}

// Edit category inline — swap name text with an input
let settingsEditingCatId = null;
function editCategory(id, currentName, currentColor, isDefault) {
  settingsEditingCatId = id;
  const container = document.getElementById('categories-list');
  // Re-render with inline edit for this item
  const items = container.querySelectorAll('.category-item');
  items.forEach(item => {
    const nameEl = item.querySelector('.category-name');
    if (!nameEl) return;
    if (item.querySelector('.btn-edit-cat') &&
        item.querySelector('.btn-edit-cat').onclick === null) return;
    // Find this item by matching current edit id
    const editBtn = item.querySelector('.btn-edit-cat');
    if (!editBtn) return;
  });

  // Re-render settings with inline editor for this id
  fetchCategories().then(cats => {
    const container2 = document.getElementById('categories-list');
    container2.innerHTML = '';
    for (const cat of cats) {
      const item = document.createElement('div');
      item.className = 'category-item';

      if (cat.id === id) {
        // Inline edit row
        const dot = document.createElement('div');
        dot.className = 'category-color-dot';
        dot.style.background = cat.color;

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'cat-edit-input';
        nameInput.value = cat.name;
        nameInput.maxLength = 50;
        if (cat.is_default) nameInput.disabled = true;

        // Color swatches row
        const swatchRow = document.createElement('div');
        swatchRow.className = 'cat-edit-swatch-row';
        let editColorValue = cat.color;
        SWATCH_COLORS.forEach(sc => {
          const sw = document.createElement('div');
          sw.className = 'color-swatch' + (sc === cat.color ? ' selected' : '');
          sw.style.background = sc;
          sw.dataset.color = sc;
          sw.style.width = '18px';
          sw.style.height = '18px';
          sw.addEventListener('click', () => {
            swatchRow.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
            sw.classList.add('selected');
            editColorValue = sc;
            dot.style.background = sc;
          });
          swatchRow.appendChild(sw);
        });

        const saveBtn = document.createElement('button');
        saveBtn.className = 'btn-edit-cat';
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', () => saveCategory(id, nameInput.value, editColorValue));

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn-delete-cat';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => refreshSettings());

        item.appendChild(dot);
        item.appendChild(nameInput);
        item.appendChild(swatchRow);
        item.appendChild(saveBtn);
        item.appendChild(cancelBtn);
        item.style.flexWrap = 'wrap';
        item.style.gap = '8px';
      } else {
        // Normal row
        const left = document.createElement('div');
        left.className = 'category-item-left';
        const dot2 = document.createElement('div');
        dot2.className = 'category-color-dot';
        dot2.style.background = cat.color;
        const nameSpan = document.createElement('span');
        nameSpan.className = 'category-name';
        nameSpan.textContent = cat.name;
        left.appendChild(dot2);
        left.appendChild(nameSpan);
        if (cat.is_default) {
          const badge = document.createElement('span');
          badge.className = 'category-badge-default';
          badge.textContent = 'Built-in';
          left.appendChild(badge);
        }
        item.appendChild(left);
        const actions = document.createElement('div');
        actions.className = 'category-item-actions';
        const eb = document.createElement('button');
        eb.className = 'btn-edit-cat';
        eb.textContent = 'Edit';
        eb.addEventListener('click', () => editCategory(cat.id, cat.name, cat.color, cat.is_default));
        actions.appendChild(eb);
        if (!cat.is_default) {
          const db2 = document.createElement('button');
          db2.className = 'btn-delete-cat';
          db2.textContent = 'Delete';
          db2.addEventListener('click', () => deleteCategory(cat.id, cat.name));
          actions.appendChild(db2);
        }
        item.appendChild(actions);
      }
      container2.appendChild(item);
    }
  });
}

async function saveCategory(id, name, color) {
  const errorEl   = document.getElementById('settings-error');
  const successEl = document.getElementById('settings-success');
  errorEl.classList.add('hidden');
  successEl.classList.add('hidden');

  try {
    const res = await fetch(`/api/categories/${id}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: name.trim(), color })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to update category.', 'error');
      return;
    }
    showToast(`✏️ "${data.name}" updated!`);
    await refreshSettings();
    await loadCategoryOptions();
  } catch (err) {
    showToast('Network error.', 'error');
    console.error(err);
  }
}

async function deleteCategory(id, name) {
  const confirmed = confirm(
    `Delete the category "${name}"?\n\nThis cannot be done if any expenses use it.`
  );
  if (!confirmed) return;

  const errorEl   = document.getElementById('settings-error');
  const successEl = document.getElementById('settings-success');
  errorEl.classList.add('hidden');
  successEl.classList.add('hidden');

  try {
    const res  = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || 'Failed to delete category.';
      errorEl.classList.remove('hidden');
      return;
    }

    successEl.textContent = `"${name}" deleted.`;
    successEl.classList.remove('hidden');
    setTimeout(() => successEl.classList.add('hidden'), 3000);

    // Refresh the list and the form dropdowns
    await refreshSettings();
    await loadCategoryOptions();

  } catch (err) {
    errorEl.textContent = 'Network error. Please check the server is running.';
    errorEl.classList.remove('hidden');
    console.error(err);
  }
}

// ─── Budget Module ────────────────────────────────────────────────────────────

function initBudgets() {
  loadBudgetSettingsList();
}

async function loadBudgetSettingsList() {
  const container = document.getElementById('budgets-list');
  if (!container) return;

  try {
    // Fetch categories + current budgets in parallel
    const [catRes, budRes] = await Promise.all([
      fetch('/api/categories'),
      fetch('/api/budgets/status')
    ]);
    if (!catRes.ok || !budRes.ok) return;
    const categories = await catRes.json();
    const budgets    = await budRes.json();

    // Build a quick lookup: category_name -> budget row
    const budgetMap = {};
    budgets.forEach(b => { budgetMap[b.category_name] = b; });

    container.innerHTML = '';

    categories.forEach(cat => {
      const b    = budgetMap[cat.name];
      const item = document.createElement('div');
      item.className = 'budget-row';

      // Left: colour dot + name
      const left = document.createElement('div');
      left.className = 'budget-row-left';

      const dot = document.createElement('div');
      dot.className = 'category-color-dot';
      dot.style.background = cat.color;

      const nameSpan = document.createElement('span');
      nameSpan.className   = 'budget-cat-name';
      nameSpan.textContent = cat.name;

      left.appendChild(dot);
      left.appendChild(nameSpan);

      // Centre: mini progress bar (only if budget set)
      const mid = document.createElement('div');
      mid.className = 'budget-row-mid';
      if (b) {
        const pctCapped = Math.min(b.pct, 100);
        const barColor  = b.over_budget ? 'var(--danger)' : b.pct >= 80 ? '#f7c56a' : 'var(--success)';

        mid.innerHTML = `
          <div class="budget-mini-track">
            <div class="budget-mini-fill" style="width:${pctCapped}%;background:${barColor};"></div>
          </div>
          <span class="budget-mini-label ${b.over_budget ? 'budget-over' : ''}">
            ${b.pct}% used · ₹${b.spent.toLocaleString('en-IN')} / ₹${b.monthly_amount.toLocaleString('en-IN')}
          </span>`;
      } else {
        mid.innerHTML = '<span class="budget-mini-label" style="color:var(--text-muted);">No budget set</span>';
      }

      // Right: input + save/remove
      const right = document.createElement('div');
      right.className = 'budget-row-right';

      const input = document.createElement('input');
      input.type        = 'number';
      input.className   = 'budget-amount-input';
      input.placeholder = 'Amount (₹)';
      input.min         = '1';
      input.step        = '1';
      if (b) input.value = b.monthly_amount;

      const saveBtn = document.createElement('button');
      saveBtn.className   = 'btn-edit-cat';
      saveBtn.textContent = b ? 'Update' : 'Set';
      saveBtn.addEventListener('click', () => saveBudget(cat.name, input.value));

      right.appendChild(input);
      right.appendChild(saveBtn);

      if (b) {
        const removeBtn = document.createElement('button');
        removeBtn.className   = 'btn-delete-cat';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => removeBudget(b.id, cat.name));
        right.appendChild(removeBtn);
      }

      item.appendChild(left);
      item.appendChild(mid);
      item.appendChild(right);
      container.appendChild(item);
    });
  } catch (err) {
    console.error('Error loading budget settings:', err);
  }
}

async function saveBudget(categoryName, amountStr) {
  const amount = Number(amountStr);
  if (!amountStr || !isFinite(amount) || amount <= 0) {
    showToast('Please enter a valid positive amount.', 'error');
    return;
  }
  try {
    const res = await fetch('/api/budgets', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ category_name: categoryName, monthly_amount: amount })
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Failed to save budget.', 'error'); return; }
    showToast(`💰 Budget for "${categoryName}" set to ${formatCurrency(amount)}/month`);
    await loadBudgetSettingsList();
    await loadBudgetOverview();
  } catch (err) {
    showToast('Network error.', 'error');
    console.error(err);
  }
}

async function removeBudget(id, categoryName) {
  if (!confirm(`Remove the budget for "${categoryName}"?`)) return;
  try {
    const res = await fetch(`/api/budgets/${id}`, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json(); showToast(d.error || 'Failed to remove.', 'error'); return; }
    showToast(`🗑️ Budget for "${categoryName}" removed.`, 'info');
    await loadBudgetSettingsList();
    await loadBudgetOverview();
  } catch (err) {
    showToast('Network error.', 'error');
    console.error(err);
  }
}

// Called after every expense save — shows a warning toast if the category is over budget
async function checkBudgetAfterExpense(category) {
  try {
    const res = await fetch(`/api/budgets/check/${encodeURIComponent(category)}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data.hasBudget) return;
    if (data.over_budget) {
      showToast(
        `⚠️ Budget exceeded for <strong>${category}</strong>!<br>Spent ${formatCurrency(data.spent)} of ${formatCurrency(data.monthly_amount)} (${data.pct}%)`,
        'error',
        6000
      );
    } else if (data.pct >= 80) {
      showToast(
        `⚠️ ${category} budget at ${data.pct}% — ${formatCurrency(data.monthly_amount - data.spent)} remaining`,
        'info',
        5000
      );
    }
    // Also refresh the analysis overview if visible
    loadBudgetOverview();
  } catch (_) { /* silent */ }
}

// ─── Budget Overview (Analysis Page) ─────────────────────────────────────────
async function loadBudgetOverview() {
  const list    = document.getElementById('budget-progress-list');
  const empty   = document.getElementById('budget-overview-empty');
  const monthEl = document.getElementById('budget-overview-month');
  if (!list) return;

  try {
    const res = await fetch('/api/budgets/status');
    if (!res.ok) return;
    const budgets = await res.json();

    // Month label
    const now = new Date();
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    if (monthEl) monthEl.textContent = `${months[now.getMonth()]} ${now.getFullYear()}`;

    if (budgets.length === 0) {
      list.innerHTML = '';
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';
    renderBudgetProgressBars(list, budgets);
  } catch (err) {
    console.error('Error loading budget overview:', err);
  }
}

function renderBudgetProgressBars(container, budgets) {
  container.innerHTML = '';

  budgets.forEach(b => {
    const pctCapped = Math.min(b.pct, 100);
    const isOver    = b.over_budget;
    const isWarning = !isOver && b.pct >= 80;
    const barColor  = isOver ? 'var(--danger)' : isWarning ? '#f7c56a' : 'var(--success)';
    const statusLabel = isOver
      ? `<span class="budget-status-badge budget-status-over">Over Budget</span>`
      : isWarning
        ? `<span class="budget-status-badge budget-status-warn">Near Limit</span>`
        : '';

    const row = document.createElement('div');
    row.className = 'budget-progress-row';
    row.innerHTML = `
      <div class="budget-progress-header">
        <span class="budget-progress-cat">${b.category_name}</span>
        ${statusLabel}
        <span class="budget-progress-pct" style="color:${barColor}">${b.pct}%</span>
      </div>
      <div class="budget-track">
        <div class="budget-fill" style="width:0%;background:${barColor};" data-width="${pctCapped}"></div>
      </div>
      <div class="budget-progress-sub">
        <span>Spent: <strong>${formatCurrency(b.spent)}</strong></span>
        <span>Budget: <strong>${formatCurrency(b.monthly_amount)}</strong></span>
        <span>${isOver ? 'Over by: <strong style="color:var(--danger)">' + formatCurrency(b.spent - b.monthly_amount) + '</strong>' : 'Remaining: <strong>' + formatCurrency(b.remaining) + '</strong>'}</span>
      </div>`;
    container.appendChild(row);
  });

  // Animate bars in after paint
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      container.querySelectorAll('.budget-fill').forEach(el => {
        el.style.width = el.dataset.width + '%';
      });
    });
  });
}

// ─── Income Categories Module ─────────────────────────────────────────────────

async function refreshIncomeCategories() {
  try {
    const res = await fetch('/api/income-categories');
    if (!res.ok) return;
    const cats = await res.json();
    renderIncomeCategoriesList(cats);
    // Also refresh the income form/filter dropdowns
    loadIncomeCategoryOptions(cats);
  } catch (err) {
    console.error('Error loading income categories:', err);
  }
}

function loadIncomeCategoryOptions(cats) {
  const formSelect   = document.getElementById('field-income-category');
  const filterSelect = document.getElementById('filter-income-category');
  if (!formSelect || !filterSelect) return;

  const savedForm   = formSelect.value;
  const savedFilter = filterSelect.value;

  formSelect.innerHTML   = '<option value="">Select category</option>';
  filterSelect.innerHTML = '<option value="">All Categories</option>';

  cats.forEach(cat => {
    const opt1 = document.createElement('option');
    opt1.value = cat.name;
    opt1.textContent = cat.name;
    formSelect.appendChild(opt1);

    const opt2 = document.createElement('option');
    opt2.value = cat.name;
    opt2.textContent = cat.name;
    filterSelect.appendChild(opt2);
  });

  if (savedForm)   formSelect.value   = savedForm;
  if (savedFilter) filterSelect.value = savedFilter;
}

function renderIncomeCategoriesList(categories) {
  const container = document.getElementById('income-categories-list');
  if (!container) return;
  container.innerHTML = '';

  for (const cat of categories) {
    const item = document.createElement('div');
    item.className = 'category-item';

    const left = document.createElement('div');
    left.className = 'category-item-left';

    const dot = document.createElement('div');
    dot.className = 'category-color-dot';
    dot.style.background = cat.color;

    const name = document.createElement('span');
    name.className  = 'category-name';
    name.textContent = cat.name;

    left.appendChild(dot);
    left.appendChild(name);

    if (cat.is_default) {
      const badge = document.createElement('span');
      badge.className  = 'category-badge-default';
      badge.textContent = 'Built-in';
      left.appendChild(badge);
    }

    item.appendChild(left);

    const actions = document.createElement('div');
    actions.className = 'category-item-actions';

    const editBtn = document.createElement('button');
    editBtn.className   = 'btn-edit-cat';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => editIncomeCategory(cat.id, cat.name, cat.color, cat.is_default));
    actions.appendChild(editBtn);

    if (!cat.is_default) {
      const del = document.createElement('button');
      del.className   = 'btn-delete-cat';
      del.textContent = 'Delete';
      del.addEventListener('click', () => deleteIncomeCategory(cat.id, cat.name));
      actions.appendChild(del);
    }

    item.appendChild(actions);
    container.appendChild(item);
  }
}

async function addIncomeCategory() {
  const nameInput  = document.getElementById('new-income-category-name');
  const colorInput = document.getElementById('new-income-category-color');
  const errorEl    = document.getElementById('income-settings-error');
  const successEl  = document.getElementById('income-settings-success');

  const name  = nameInput.value.trim();
  const color = colorInput.value;

  errorEl.classList.add('hidden');
  successEl.classList.add('hidden');

  if (!name) {
    errorEl.textContent = 'Category name cannot be empty.';
    errorEl.classList.remove('hidden');
    nameInput.focus();
    return;
  }

  try {
    const res = await fetch('/api/income-categories', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, color })
    });
    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || 'Failed to add category.';
      errorEl.classList.remove('hidden');
      return;
    }

    nameInput.value = '';
    successEl.textContent = `"${data.name}" added!`;
    successEl.classList.remove('hidden');
    setTimeout(() => successEl.classList.add('hidden'), 3000);
    showToast(`✅ Income category "${data.name}" added!`);
    await refreshIncomeCategories();
  } catch (err) {
    errorEl.textContent = 'Network error.';
    errorEl.classList.remove('hidden');
    console.error(err);
  }
}

function editIncomeCategory(id, currentName, currentColor, isDefault) {
  fetch('/api/income-categories').then(r => r.json()).then(cats => {
    const container = document.getElementById('income-categories-list');
    if (!container) return;
    container.innerHTML = '';

    for (const cat of cats) {
      const item = document.createElement('div');
      item.className = 'category-item';

      if (cat.id === id) {
        const dot = document.createElement('div');
        dot.className = 'category-color-dot';
        dot.style.background = cat.color;

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'cat-edit-input';
        nameInput.value = cat.name;
        nameInput.maxLength = 50;
        if (cat.is_default) nameInput.disabled = true;

        const swatchRow = document.createElement('div');
        swatchRow.className = 'cat-edit-swatch-row';
        let editColorValue = cat.color;
        SWATCH_COLORS.forEach(sc => {
          const sw = document.createElement('div');
          sw.className = 'color-swatch' + (sc === cat.color ? ' selected' : '');
          sw.style.cssText = `background:${sc};width:18px;height:18px;`;
          sw.dataset.color = sc;
          sw.addEventListener('click', () => {
            swatchRow.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
            sw.classList.add('selected');
            editColorValue = sc;
            dot.style.background = sc;
          });
          swatchRow.appendChild(sw);
        });

        const saveBtn = document.createElement('button');
        saveBtn.className = 'btn-edit-cat';
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', () => saveIncomeCategory(id, nameInput.value, editColorValue));

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn-delete-cat';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => refreshIncomeCategories());

        item.appendChild(dot);
        item.appendChild(nameInput);
        item.appendChild(swatchRow);
        item.appendChild(saveBtn);
        item.appendChild(cancelBtn);
        item.style.cssText = 'flex-wrap:wrap;gap:8px;';
      } else {
        const left = document.createElement('div');
        left.className = 'category-item-left';
        const d2 = document.createElement('div');
        d2.className = 'category-color-dot';
        d2.style.background = cat.color;
        const n2 = document.createElement('span');
        n2.className = 'category-name';
        n2.textContent = cat.name;
        left.appendChild(d2);
        left.appendChild(n2);
        if (cat.is_default) {
          const b = document.createElement('span');
          b.className = 'category-badge-default';
          b.textContent = 'Built-in';
          left.appendChild(b);
        }
        item.appendChild(left);
        const acts = document.createElement('div');
        acts.className = 'category-item-actions';
        const eb = document.createElement('button');
        eb.className = 'btn-edit-cat';
        eb.textContent = 'Edit';
        eb.addEventListener('click', () => editIncomeCategory(cat.id, cat.name, cat.color, cat.is_default));
        acts.appendChild(eb);
        if (!cat.is_default) {
          const db3 = document.createElement('button');
          db3.className = 'btn-delete-cat';
          db3.textContent = 'Delete';
          db3.addEventListener('click', () => deleteIncomeCategory(cat.id, cat.name));
          acts.appendChild(db3);
        }
        item.appendChild(acts);
      }
      container.appendChild(item);
    }
  });
}

async function saveIncomeCategory(id, name, color) {
  try {
    const res = await fetch(`/api/income-categories/${id}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: name.trim(), color })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to update income category.', 'error');
      return;
    }
    showToast(`✏️ "${data.name}" updated!`);
    await refreshIncomeCategories();
  } catch (err) {
    showToast('Network error.', 'error');
    console.error(err);
  }
}

async function deleteIncomeCategory(id, name) {
  const confirmed = confirm(`Delete the income category "${name}"?\n\nThis cannot be done if any income records use it.`);
  if (!confirmed) return;

  try {
    const res  = await fetch(`/api/income-categories/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to delete.', 'error');
      return;
    }
    showToast(`🗑️ "${name}" deleted.`, 'info');
    await refreshIncomeCategories();
  } catch (err) {
    showToast('Network error.', 'error');
    console.error(err);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ENTERPRISE SUITE 3.0 ADDITIONS — Theme Toggle, Income & Accounts Management
// ══════════════════════════════════════════════════════════════════════════════

// ─── Theme Management ────────────────────────────────────────────────────────

function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  if (saved === 'light') {
    document.documentElement.classList.add('light-theme');
  } else {
    document.documentElement.classList.remove('light-theme');
  }

  // Update chart variables based on initial theme
  applyChartThemeSettings();

  const toggleBtn = document.getElementById('btn-theme-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      document.documentElement.classList.toggle('light-theme');
      const currentTheme = document.documentElement.classList.contains('light-theme') ? 'light' : 'dark';
      localStorage.setItem('theme', currentTheme);
      
      // Update charts defaults and redraw active charts
      applyChartThemeSettings();
    });
  }
}

function applyChartThemeSettings() {
  if (typeof Chart === 'undefined') return;
  const isLight = document.documentElement.classList.contains('light-theme');
  Chart.defaults.color       = isLight ? '#4b5563' : '#8888a0';
  Chart.defaults.borderColor = isLight ? '#e5e7eb' : '#2e2e3e';

  // Redraw charts if we are on Dashboard or Analysis
  const activeMenu = document.querySelector('.menu-item.active');
  if (activeMenu) {
    const page = activeMenu.dataset.page;
    if (page === 'dashboard') {
      loadDashboardCashflowChart();
    } else if (page === 'analysis') {
      refreshAnalysis();
    }
  }
}

// ─── Dashboard Cashflow Chart ────────────────────────────────────────────────

const dashboardState = {
  charts: {
    cashflow: null
  }
};

async function loadDashboardCashflowChart() {
  const canvas = document.getElementById('chart-dash-cashflow');
  if (!canvas) return;

  try {
    const res = await fetch('/api/analytics/cashflow?months=6');
    if (!res.ok) throw new Error('Failed to load cashflow data');
    const data = await res.json();

    const isLight = document.documentElement.classList.contains('light-theme');

    if (dashboardState.charts.cashflow) {
      dashboardState.charts.cashflow.destroy();
      dashboardState.charts.cashflow = null;
    }

    dashboardState.charts.cashflow = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: data.months.map(m => m.label),
        datasets: [
          {
            label: 'Income (₹)',
            data: data.months.map(m => m.income),
            backgroundColor: isLight ? 'rgba(56, 161, 105, 0.75)' : 'rgba(106, 247, 160, 0.65)',
            borderColor: isLight ? '#38a169' : '#6af7a0',
            borderWidth: 1,
            borderRadius: 4
          },
          {
            label: 'Expenses (₹)',
            data: data.months.map(m => m.expenses),
            backgroundColor: isLight ? 'rgba(95, 90, 247, 0.75)' : 'rgba(124, 106, 247, 0.65)',
            borderColor: '#7c6af7',
            borderWidth: 1,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: isLight ? '#1a1a2e' : '#8888a0',
              font: { size: 11 },
              boxWidth: 12
            }
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`
            }
          }
        },
        scales: {
          x: {
            ticks: { color: isLight ? '#4b5563' : '#8888a0', font: { size: 10 } },
            grid: { color: isLight ? '#e5e7eb' : '#2e2e3e' }
          },
          y: {
            ticks: {
              color: isLight ? '#4b5563' : '#8888a0',
              font: { size: 10 },
              callback: val => '₹' + val.toLocaleString('en-IN')
            },
            grid: { color: isLight ? '#e5e7eb' : '#2e2e3e' },
            beginAtZero: true
          }
        }
      }
    });
  } catch (err) {
    console.error('Dashboard cashflow chart error:', err);
  }
}

// ─── Income Module ───────────────────────────────────────────────────────────

const incomeState = {
  income: [],
  editingId: null,
  filters: {
    category: '',
    from: '',
    to: '',
    search: '',
    account_id: ''
  }
};

const INCOME_CATEGORY_COLORS = {
  Salary:     '#38a169',
  Freelance:  '#3182ce',
  Investment: '#dd6b20',
  Gift:       '#e53e3e',
  Other:      '#718096'
};

function initIncome() {
  const form = document.getElementById('income-form');
  if (form) {
    form.addEventListener('submit', handleIncomeFormSubmit);
  }

  const cancelBtn = document.getElementById('btn-income-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', cancelIncomeEdit);
  }

  const filterCategory = document.getElementById('filter-income-category');
  if (filterCategory) {
    filterCategory.addEventListener('change', onIncomeFilterChange);
  }

  const filterFrom = document.getElementById('filter-income-from');
  if (filterFrom) {
    filterFrom.addEventListener('change', onIncomeFilterChange);
  }

  const filterTo = document.getElementById('filter-income-to');
  if (filterTo) {
    filterTo.addEventListener('change', onIncomeFilterChange);
  }

  const filterSearch = document.getElementById('filter-income-search');
  if (filterSearch) {
    filterSearch.addEventListener('input', debounce(onIncomeFilterChange, 300));
  }

  const clearBtn = document.getElementById('btn-clear-income-filters');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearIncomeFilters);
  }
}

function onIncomeFilterChange() {
  const from = document.getElementById('filter-income-from').value;
  const to   = document.getElementById('filter-income-to').value;

  if (from && to && from > to) {
    showToast('"From" date must be on or before the "To" date.', 'error', 4000);
    document.getElementById('filter-income-to').value = '';
    return;
  }

  incomeState.filters.category = document.getElementById('filter-income-category').value;
  incomeState.filters.from     = from;
  incomeState.filters.to       = to;
  incomeState.filters.search   = document.getElementById('filter-income-search').value.trim();
  loadIncome();
}

function clearIncomeFilters() {
  document.getElementById('filter-income-category').value = '';
  document.getElementById('filter-income-from').value     = '';
  document.getElementById('filter-income-to').value       = '';
  document.getElementById('filter-income-search').value   = '';

  incomeState.filters.category = '';
  incomeState.filters.from     = '';
  incomeState.filters.to       = '';
  incomeState.filters.search   = '';

  loadIncome();
}

async function refreshIncome() {
  const today = getTodayString();
  const incDate = document.getElementById('field-income-date');
  if (incDate) { incDate.value = today; incDate.max = today; }
  await loadAccountSelectOptions();
  await refreshIncomeCategories();  // also updates form/filter dropdowns
  await loadIncome();
  await loadIncomeSummary();
}

async function loadAccountSelectOptions() {
  try {
    const res = await fetch('/api/accounts');
    if (!res.ok) return;
    const accounts = await res.json();

    const select = document.getElementById('field-income-account');
    if (select) {
      select.innerHTML = '';
      accounts.forEach(acc => {
        const opt = document.createElement('option');
        opt.value = acc.id;
        opt.textContent = `${acc.name} (Current: ${formatCurrency(acc.balance)})`;
        select.appendChild(opt);
      });
    }
  } catch (err) {
    console.error('Error loading account select options:', err);
  }
}

async function loadIncome() {
  const params = new URLSearchParams();
  if (incomeState.filters.category) params.set('category', incomeState.filters.category);
  if (incomeState.filters.from)     params.set('from', incomeState.filters.from);
  if (incomeState.filters.to)       params.set('to', incomeState.filters.to);
  if (incomeState.filters.search)   params.set('search', incomeState.filters.search);

  try {
    const res = await fetch('/api/income?' + params.toString());
    const data = await res.json();
    if (!res.ok) {
      console.error('Failed to load income:', data.error);
      return;
    }
    incomeState.income = data;
    renderIncomeList();
  } catch (err) {
    console.error('Network error loading income:', err);
  }
}

function renderIncomeList() {
  const tbody = document.getElementById('income-list');
  const emptyState = document.getElementById('income-empty-state');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (incomeState.income.length === 0) {
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  incomeState.income.forEach(inc => {
    const tr = document.createElement('tr');

    const tdDate = document.createElement('td');
    tdDate.className = 'date-cell';
    tdDate.textContent = formatDate(inc.date);
    tr.appendChild(tdDate);

    const tdTitle = document.createElement('td');
    tdTitle.textContent = inc.title;
    tr.appendChild(tdTitle);

    const tdCat = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.style.backgroundColor = 'rgba(56,161,105,0.12)';
    badge.style.color = INCOME_CATEGORY_COLORS[inc.category] || '#38a169';
    badge.textContent = inc.category;
    tdCat.appendChild(badge);
    tr.appendChild(tdCat);

    const tdAmount = document.createElement('td');
    tdAmount.className = 'amount-cell';
    tdAmount.style.color = 'var(--success)';
    tdAmount.textContent = '+' + formatCurrency(inc.amount);
    tr.appendChild(tdAmount);

    const tdNote = document.createElement('td');
    tdNote.className = 'note-cell';
    const noteText = inc.note || '';
    tdNote.textContent = noteText.length > 30 ? noteText.slice(0, 30) + '...' : noteText;
    if (noteText) tdNote.setAttribute('title', noteText);
    tr.appendChild(tdNote);

    const tdActions = document.createElement('td');
    tdActions.className = 'actions-cell';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn-edit';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => startIncomeEdit(inc.id));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => deleteIncome(inc.id));

    tdActions.appendChild(editBtn);
    tdActions.appendChild(deleteBtn);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });
}

async function loadIncomeSummary() {
  try {
    const res = await fetch('/api/income/summary');
    if (!res.ok) return;
    const data = await res.json();

    const monthLabelEl = document.getElementById('income-summary-month');
    if (monthLabelEl) monthLabelEl.textContent = data.month;

    const totalEl = document.getElementById('income-summary-total');
    if (totalEl) totalEl.textContent = formatCurrency(data.totalIncome);

    const container = document.getElementById('income-summary-breakdown');
    if (!container) return;
    container.innerHTML = '';

    data.breakdown.forEach(item => {
      const pct = data.totalIncome > 0
        ? ((item.total / data.totalIncome) * 100).toFixed(1)
        : 0;
      const color = INCOME_CATEGORY_COLORS[item.category] || '#38a169';

      const row = document.createElement('div');
      row.className = 'breakdown-row';

      const label = document.createElement('span');
      label.className = 'breakdown-label';
      label.textContent = item.category;

      const track = document.createElement('div');
      track.className = 'breakdown-bar-track';

      const fill = document.createElement('div');
      fill.className = 'breakdown-bar-fill';
      fill.style.backgroundColor = color;
      fill.style.width = '0%';

      track.appendChild(fill);

      const amountSpan = document.createElement('span');
      amountSpan.className = 'breakdown-amount';
      amountSpan.textContent = formatCurrency(item.total);

      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(amountSpan);
      container.appendChild(row);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fill.style.width = pct + '%';
        });
      });
    });
  } catch (err) {
    console.error('Error loading income summary:', err);
  }
}

async function handleIncomeFormSubmit(e) {
  e.preventDefault();
  const formError = document.getElementById('income-form-error');

  const title      = document.getElementById('field-income-title').value.trim();
  const amount     = document.getElementById('field-income-amount').value;
  const category   = document.getElementById('field-income-category').value;
  const date       = document.getElementById('field-income-date').value;
  const account_id = document.getElementById('field-income-account').value;
  const note       = document.getElementById('field-income-note').value.trim();

  if (!title) {
    formError.textContent = 'Title is required.';
    return;
  }
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    formError.textContent = 'Please enter a valid positive amount.';
    return;
  }
  if (!category) {
    formError.textContent = 'Please select a category.';
    return;
  }
  if (!date) {
    formError.textContent = 'Please select a date.';
    return;
  }
  if (date > getTodayString()) {
    formError.textContent = 'Income date cannot be in the future.';
    return;
  }
  if (!account_id) {
    formError.textContent = 'Please select an account.';
    return;
  }

  formError.textContent = '';
  const payload = { title, amount: Number(amount), category, date, account_id: Number(account_id), note };

  try {
    let res;
    if (incomeState.editingId !== null) {
      res = await fetch(`/api/income/${incomeState.editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch('/api/income', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    const data = await res.json();
    if (!res.ok) {
      formError.textContent = data.error || 'An error occurred. Please try again.';
      return;
    }

    const wasEditingIncome = incomeState.editingId !== null;
    if (wasEditingIncome) {
      cancelIncomeEdit();
    } else {
      document.getElementById('income-form').reset();
      document.getElementById('field-income-date').value = getTodayString();
    }

    await refreshIncome();
    showToast(wasEditingIncome ? '✏️ Income updated successfully!' : '✅ Income added successfully!');
  } catch (err) {
    formError.textContent = 'Network error. Please check the server.';
    console.error(err);
  }
}

function startIncomeEdit(id) {
  const inc = incomeState.income.find(i => i.id === id);
  if (!inc) return;

  document.getElementById('field-income-title').value    = inc.title;
  document.getElementById('field-income-amount').value   = inc.amount;
  document.getElementById('field-income-category').value = inc.category;
  // Remove max constraint so historical dates can be edited
  const incDateField = document.getElementById('field-income-date');
  incDateField.removeAttribute('max');
  incDateField.value = inc.date;
  document.getElementById('field-income-account').value  = inc.account_id;
  document.getElementById('field-income-note').value     = inc.note || '';

  incomeState.editingId = id;

  document.getElementById('income-form-heading').textContent = 'Edit Income';
  document.getElementById('btn-income-submit').textContent    = 'Update Income';
  document.getElementById('btn-income-cancel').style.display  = 'inline-flex';
  document.getElementById('income-form-error').textContent    = '';

  document.getElementById('income-form').scrollIntoView({ behavior: 'smooth' });
}

function cancelIncomeEdit() {
  document.getElementById('income-form').reset();
  const today = getTodayString();
  const incDateField = document.getElementById('field-income-date');
  incDateField.value = today;
  incDateField.max   = today;   // restore future-date guard

  incomeState.editingId = null;

  document.getElementById('income-form-heading').textContent = 'Add Income';
  document.getElementById('btn-income-submit').textContent    = 'Add Income';
  document.getElementById('btn-income-cancel').style.display  = 'none';
  document.getElementById('income-form-error').textContent    = '';
}

async function deleteIncome(id) {
  const confirmed = window.confirm('Delete this income entry? This will update account balances.');
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/income/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      showToast(data.error || 'Failed to delete income.', 'error');
      return;
    }
    await refreshIncome();
    showToast('🗑️ Income deleted.', 'info');
  } catch (err) {
    showToast('Network error.', 'error');
    console.error(err);
  }
}

// ─── Accounts Module ─────────────────────────────────────────────────────────

const accountsState = {
  accounts: [],
  editingId: null
};

function initAccounts() {
  const form = document.getElementById('account-form');
  if (form) {
    form.addEventListener('submit', handleAccountFormSubmit);
  }
  const cancelBtn = document.getElementById('btn-account-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', cancelAccountEdit);
  }
}

async function refreshAccounts() {
  try {
    const res = await fetch('/api/accounts');
    if (!res.ok) throw new Error('Failed to load accounts');
    const accounts = await res.json();
    accountsState.accounts = accounts;

    renderAccountsGrid(accounts);

    // Prepopulate form with the Main Account for ease of balance configuration
    if (accounts.length > 0) {
      const mainAcc = accounts[0];
      const activeEl = document.activeElement;
      const isFocused = activeEl && (activeEl.id === 'field-account-name' || activeEl.id === 'field-account-initial');
      
      // If we are not actively typing in the inputs, safely populate/sync them
      if (!isFocused) {
        document.getElementById('field-account-name').value = mainAcc.name;
        document.getElementById('field-account-initial').value = mainAcc.initial_balance;
        accountsState.editingId = mainAcc.id;
        document.getElementById('account-form-title').textContent = `Manage Account: ${mainAcc.name}`;
        document.getElementById('btn-account-submit').textContent = 'Save Account Settings';
      }
    }
  } catch (err) {
    console.error('Error refreshing accounts:', err);
  }
}


function renderAccountsGrid(accounts) {
  const grid = document.getElementById('accounts-cards-grid');
  if (!grid) return;
  grid.innerHTML = '';

  accounts.forEach(acc => {
    const card = document.createElement('div');
    card.className = 'account-card';

    const header = document.createElement('div');
    header.className = 'account-card-header';

    const name = document.createElement('span');
    name.className = 'account-card-name';
    name.textContent = acc.name;

    header.appendChild(name);

    const balance = document.createElement('div');
    balance.className = 'account-card-balance';
    balance.textContent = formatCurrency(acc.balance);

    const details = document.createElement('div');
    details.className = 'account-card-details';

    const rowInit = createDetailRow('Initial Balance', formatCurrency(acc.initial_balance));
    const rowInc  = createDetailRow('Total Income (+)', formatCurrency(acc.total_income));
    const rowExp  = createDetailRow('Total Expenses (-)', formatCurrency(acc.total_expenses));

    details.appendChild(rowInit);
    details.appendChild(rowInc);
    details.appendChild(rowExp);

    card.appendChild(header);
    card.appendChild(balance);
    card.appendChild(details);

    // Edit settings option
    const actions = document.createElement('div');
    actions.className = 'account-card-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn-edit';
    editBtn.textContent = 'Edit Balance';
    editBtn.addEventListener('click', () => startAccountEdit(acc));
    actions.appendChild(editBtn);

    card.appendChild(actions);
    grid.appendChild(card);
  });
}

function createDetailRow(label, value) {
  const row = document.createElement('div');
  row.className = 'account-detail-row';

  const lbl = document.createElement('span');
  lbl.textContent = label;

  const val = document.createElement('span');
  val.className = 'account-detail-val';
  val.textContent = value;

  row.appendChild(lbl);
  row.appendChild(val);
  return row;
}

function startAccountEdit(acc) {
  document.getElementById('field-account-name').value = acc.name;
  document.getElementById('field-account-initial').value = acc.initial_balance;
  accountsState.editingId = acc.id;

  document.getElementById('account-form-title').textContent = `Edit Settings: ${acc.name}`;
  document.getElementById('btn-account-submit').textContent = 'Update Account settings';
  document.getElementById('btn-account-cancel').style.display = 'inline-flex';

  document.getElementById('account-editor-card').scrollIntoView({ behavior: 'smooth' });
}

function cancelAccountEdit() {
  document.getElementById('account-form').reset();
  accountsState.editingId = null;

  document.getElementById('account-form-title').textContent = 'Account Settings';
  document.getElementById('btn-account-submit').textContent = 'Save Account';
  document.getElementById('btn-account-cancel').style.display = 'none';

  document.getElementById('account-form-error').textContent = '';
  document.getElementById('account-form-success').textContent = '';
  
  // Re-run refresh to select the default account again
  refreshAccounts();
}

async function handleAccountFormSubmit(e) {
  e.preventDefault();
  const errorEl = document.getElementById('account-form-error');
  const successEl = document.getElementById('account-form-success');

  errorEl.textContent = '';
  successEl.textContent = '';

  const name = document.getElementById('field-account-name').value.trim();
  const initial_balance = Number(document.getElementById('field-account-initial').value);

  if (!name) {
    errorEl.textContent = 'Account name cannot be empty.';
    return;
  }
  if (isNaN(initial_balance) || initial_balance < 0) {
    errorEl.textContent = 'Initial balance must be a non-negative number.';
    return;
  }

  const payload = { name, initial_balance };

  try {
    let res;
    if (accountsState.editingId !== null) {
      res = await fetch(`/api/accounts/${accountsState.editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.error || 'Failed to save account settings.';
      return;
    }

    successEl.textContent = 'Account settings saved successfully!';
    setTimeout(() => { successEl.textContent = ''; }, 3000);

    // Cancel edit state to reload first account defaults
    cancelAccountEdit();
  } catch (err) {
    errorEl.textContent = 'Error saving account settings. Check connection.';
    console.error(err);
  }
}

