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
});
