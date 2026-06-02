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
      const pct = data.totalSpent > 0
        ? ((item.total / data.totalSpent) * 100).toFixed(1)
        : 0;
      const color = CATEGORY_COLORS[item.category] || '#888';

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

    if (state.editingId !== null) {
      cancelEdit();
    } else {
      document.getElementById('expense-form').reset();
      document.getElementById('field-date').value = getTodayString();
    }

    await loadExpenses();
    await loadSummary();

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
  document.getElementById('field-date').value     = expense.date;
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
  document.getElementById('field-date').value = getTodayString();

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
      alert(data.error || 'Failed to delete expense.');
      return;
    }

    await loadExpenses();
    await loadSummary();

  } catch (err) {
    alert('Network error. Please check the server is running.');
    console.error(err);
  }
}

function onFilterChange() {
  state.filters.category = document.getElementById('filter-category').value;
  state.filters.from     = document.getElementById('filter-from').value;
  state.filters.to       = document.getElementById('filter-to').value;
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

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('field-date').value = getTodayString();

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

  // ── New v2 initialisation calls ──────────────────────────────────────────
  loadCategoryOptions();   // populate form + filter dropdowns from DB
  initPageRouter();        // wire up nav tab clicks
  initDashboard();         // wire up dashboard "View All" button
  initAnalysis();          // wire up month prev/next + comparison selector
  initSettings();          // build color swatches + wire up add/delete buttons
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
      if (page === 'analysis')  refreshAnalysis();
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

    // Render the three month-specific charts
    renderDailyChart(data);
    renderDonutChart(data);
    renderTopCatChart(data);

  } catch (err) {
    console.error('Analysis refresh error:', err);
  }

  // Load comparison chart separately (it uses its own n-months parameter)
  loadComparisonChart();
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
}

async function refreshSettings() {
  const categories = await fetchCategories();
  renderCategoriesList(categories);
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
    name.textContent = cat.name;         // XSS-safe

    left.appendChild(dot);
    left.appendChild(name);

    if (cat.is_default) {
      const badge = document.createElement('span');
      badge.className  = 'category-badge-default';
      badge.textContent = 'Built-in';
      left.appendChild(badge);
    }

    item.appendChild(left);

    // Only custom (non-default) categories get a delete button
    if (!cat.is_default) {
      const del = document.createElement('button');
      del.className    = 'btn-delete-cat';
      del.textContent  = 'Delete';
      del.dataset.id   = cat.id;
      del.dataset.name = cat.name;
      del.addEventListener('click', () => deleteCategory(cat.id, cat.name));
      item.appendChild(del);
    }

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
