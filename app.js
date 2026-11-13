(() => {
  'use strict';
  const KEY = 'rapi-finance-v1';
  const defaultCategories = { income: ['Gaji', 'Bonus', 'Freelance', 'Investasi', 'Lainnya'], expense: ['Makanan', 'Transportasi', 'Belanja', 'Tagihan', 'Kesehatan', 'Hiburan', 'Pendidikan', 'Lainnya'] };
  const freshState = () => ({ transactions: [], debts: [], categories: structuredClone(defaultCategories) });
  let state;
  try { state = { ...freshState(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; state.categories ||= structuredClone(defaultCategories); } catch { state = freshState(); }
  let debtFilter = 'all';
  let toastTimer;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const today = () => new Date().toISOString().slice(0, 10);
  const currency = value => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
  const formatDate = value => value ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`)) : '—';
  const monthKey = value => (value || today()).slice(0, 7);
  const monthName = value => new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(`${value}-15T12:00:00`));
  const remaining = debt => Math.max(0, Number(debt.amount) - Number(debt.paid || 0));
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  function save() { localStorage.setItem(KEY, JSON.stringify(state)); renderAll(); }
  function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 2600); }
  function openDialog(id) { const d = document.getElementById(id); if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
  function closeDialog(id) { const d = document.getElementById(id); d.close ? d.close() : d.removeAttribute('open'); }
  function setPage(page) {
    const known = ['dashboard', 'transaksi', 'utang', 'ringkasan'].includes(page) ? page : 'dashboard';
    $$('.page').forEach(el => el.classList.toggle('active', el.id === `${known}Page`));
    $$('.nav-link[data-page]').forEach(el => el.classList.toggle('active', el.dataset.page === known));
    $('#pageCrumb').textContent = ({ dashboard: 'Dashboard', transaksi: 'Transaksi', utang: 'Utang & Piutang', ringkasan: 'Ringkasan' })[known];
    $('#sidebar').classList.remove('open');
    if (known === 'ringkasan') renderSummary();
  }
  function monthOptions(select, selected = monthKey(today()), count = 15) {
    const values = [];
    for (let i = 0; i < count; i++) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); values.push(d.toISOString().slice(0, 7)); }
    select.innerHTML = values.map(m => `<option value="${m}" ${m === selected ? 'selected' : ''}>${escapeHTML(monthName(m))}</option>`).join('');
  }
  function monthlyTransactions(month) { return state.transactions.filter(t => monthKey(t.date) === month); }
  function chartData(count) {
    const out = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7), rows = monthlyTransactions(key);
      out.push({ key, label: new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(d), income: rows.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0), expense: rows.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0) });
    }
    return out;
  }
  function renderDashboard() {
    const rows = monthlyTransactions(monthKey(today()));
    const income = rows.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const expense = rows.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    const overallIncome = state.transactions.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const overallExpense = state.transactions.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    $('#totalBalance').textContent = currency(overallIncome - overallExpense);
    $('#incomeValue').textContent = currency(income); $('#expenseValue').textContent = currency(expense);
    $('#incomeCount').textContent = `${rows.filter(t => t.type === 'income').length} transaksi`; $('#expenseCount').textContent = `${rows.filter(t => t.type === 'expense').length} transaksi`;
    const payable = state.debts.filter(d => d.direction === 'payable').reduce((s, d) => s + remaining(d), 0);
    const receivable = state.debts.filter(d => d.direction === 'receivable').reduce((s, d) => s + remaining(d), 0);
    $('#debtTotal').textContent = currency(payable + receivable); $('#payableTotal').textContent = currency(payable); $('#receivableTotal').textContent = currency(receivable);
    const upcoming = state.debts.filter(d => remaining(d) > 0).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')).slice(0, 3);
    $('#upcomingDebts').innerHTML = upcoming.length ? upcoming.map(d => `<div class="upcoming-item"><div class="upcoming-person"><span class="debt-avatar">${escapeHTML((d.person || '?').charAt(0).toUpperCase())}</span><span class="upcoming-copy"><strong>${escapeHTML(d.person)}</strong><span>${d.direction === 'payable' ? 'Utang' : 'Piutang'} · ${escapeHTML(formatDate(d.dueDate))}</span></span></div><span class="upcoming-amount">${currency(remaining(d))}<small>tersisa</small></span></div>`).join('') : '<div class="panel-subtitle">Belum ada jatuh tempo mendatang.</div>';
    const sorted = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 5);
    $('#recentEmpty').classList.toggle('hidden', sorted.length > 0); $('#recentTransactions').innerHTML = sorted.map(transactionRow).join('');
    renderChart();
  }
  function renderChart() {
    const count = Number($('#chartPeriod').value || 6), data = chartData(count);
    const max = Math.max(1, ...data.flatMap(m => [m.income, m.expense]));
    $('#chartBars').innerHTML = data.map(m => `<div class="chart-month" title="${escapeHTML(monthName(m.key))}"><div class="bar-pair"><i class="bar income" style="height:${Math.max(m.income ? 3 : 0, m.income / max * 100)}%" title="Pemasukan ${currency(m.income)}"></i><i class="bar expense" style="height:${Math.max(m.expense ? 3 : 0, m.expense / max * 100)}%" title="Pengeluaran ${currency(m.expense)}"></i></div><label>${escapeHTML(m.label)}</label></div>`).join('');
  }
  function transactionRow(t, showActions = false) {
    const inc = t.type === 'income';
    return `<tr><td><span class="transaction-name"><span class="transaction-icon ${inc ? 'income' : 'expense'}">${inc ? '↙' : '↗'}</span>${escapeHTML(t.title)}</span></td><td><span class="category-tag">${escapeHTML(t.category)}</span></td><td>${escapeHTML(formatDate(t.date))}</td>${showActions ? `<td><span class="category-tag">${inc ? 'Pemasukan' : 'Pengeluaran'}</span></td>` : ''}<td class="${inc ? 'amount-income' : 'amount-expense'}">${inc ? '+' : '−'}${currency(t.amount)}</td>${showActions ? `<td><span class="row-actions"><button class="row-action" data-edit-transaction="${escapeHTML(t.id)}" aria-label="Edit">✎</button><button class="row-action delete" data-delete-transaction="${escapeHTML(t.id)}" aria-label="Hapus">×</button></span></td>` : ''}</tr>`;
  }
  function renderTransactions() {
    const query = ($('#transactionSearch').value || '').trim().toLowerCase(), type = $('#typeFilter').value, month = $('#monthFilter').value;
    const rows = [...state.transactions].filter(t => (!query || `${t.title} ${t.category} ${t.note || ''}`.toLowerCase().includes(query)) && (type === 'all' || t.type === type) && (month === 'all' || monthKey(t.date) === month)).sort((a, b) => b.date.localeCompare(a.date));
    $('#allTransactions').innerHTML = rows.map(t => transactionRow(t, true)).join(''); $('#transactionsEmpty').classList.toggle('hidden', rows.length > 0);
  }
  function renderDebts() {
    const status = $('#debtStatusFilter').value;
    const payable = state.debts.filter(d => d.direction === 'payable'), receivable = state.debts.filter(d => d.direction === 'receivable');
    $('#debtPagePayable').textContent = currency(payable.reduce((s, d) => s + remaining(d), 0)); $('#debtPageReceivable').textContent = currency(receivable.reduce((s, d) => s + remaining(d), 0));
    $('#debtPagePaid').textContent = currency(state.debts.reduce((s, d) => s + Number(d.paid || 0), 0)); $('#allDebtCount').textContent = state.debts.length;
    const rows = [...state.debts].filter(d => (debtFilter === 'all' || d.direction === debtFilter) && (status === 'all' || (status === 'paid' ? remaining(d) === 0 : remaining(d) > 0))).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    $('#debtList').innerHTML = rows.map(d => {
      const left = remaining(d), pct = d.amount ? Math.min(100, (Number(d.paid || 0) / Number(d.amount)) * 100) : 0;
      const overdue = left > 0 && d.dueDate && d.dueDate < today();
      return `<article class="debt-card"><div class="debt-person"><span class="debt-avatar">${escapeHTML((d.person || '?').charAt(0).toUpperCase())}</span><span class="debt-person-copy"><strong>${escapeHTML(d.person)}</strong><span>${d.direction === 'payable' ? 'Saya berutang' : 'Orang lain berutang'}${d.note ? ` · ${escapeHTML(d.note)}` : ''}</span></span></div><div class="debt-progress"><div class="debt-progress-label"><span>Terbayar ${currency(d.paid || 0)}</span><strong>${Math.round(pct)}%</strong></div><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div></div><div class="debt-due"><span>Jatuh tempo</span><strong class="${overdue ? 'due-soon' : ''}">${escapeHTML(formatDate(d.dueDate))}${overdue ? ' · terlambat' : ''}</strong></div><div class="debt-actions">${left > 0 ? `<button class="small-action pay" data-payment="${escapeHTML(d.id)}">＋ Cicilan</button>` : '<span class="paid-badge">✓ Lunas</span>'}<button class="small-action" data-edit-debt="${escapeHTML(d.id)}" aria-label="Edit">✎</button><button class="row-action delete" data-delete-debt="${escapeHTML(d.id)}" aria-label="Hapus">×</button></div></article>`;
    }).join('');
    $('#debtsEmpty').classList.toggle('hidden', state.debts.length > 0); $('#debtList').classList.toggle('hidden', rows.length === 0 && state.debts.length > 0);
    if (!rows.length && state.debts.length > 0) $('#debtList').innerHTML = '<div class="panel empty-state"><strong>Tidak ada catatan pada filter ini</strong><p>Coba pilih jenis atau status yang lain.</p></div>', $('#debtList').classList.remove('hidden');
  }
  function renderSummary() {
    const month = $('#summaryMonth').value || monthKey(today()), rows = monthlyTransactions(month);
    const income = rows.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0), expense = rows.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    $('#summaryIncome').textContent = currency(income); $('#summaryExpense').textContent = currency(expense); $('#summaryNet').textContent = currency(income - expense);
    const grouped = {};
    rows.filter(t => t.type === 'expense').forEach(t => grouped[t.category] = (grouped[t.category] || 0) + Number(t.amount));
    const categories = Object.entries(grouped).sort((a, b) => b[1] - a[1]), max = Math.max(1, ...categories.map(c => c[1]));
    $('#categoryBreakdown').innerHTML = categories.map(([name, value]) => `<div class="category-row"><div class="category-row-top"><span>${escapeHTML(name)}</span><strong>${currency(value)}</strong></div><div class="category-track"><i style="width:${value / max * 100}%"></i></div></div>`).join('');
    $('#categoryEmpty').classList.toggle('hidden', categories.length > 0);
    $('#summaryFlow').innerHTML = chartData(6).reverse().map(m => `<div class="category-flow"><label>${escapeHTML(m.label)}</label><span>Pemasukan<strong>${currency(m.income)}</strong></span><span>Pengeluaran<strong>${currency(m.expense)}</strong></span></div>`).join('');
  }
  function populateCategorySelect(selected) {
    const type = $('input[name="type"]:checked', $('#transactionForm')).value;
    const select = $('#transactionCategory');
    select.innerHTML = (state.categories[type] || []).map(c => `<option ${c === selected ? 'selected' : ''}>${escapeHTML(c)}</option>`).join('');
  }
  function renderCategories() {
    for (const type of ['income', 'expense']) {
      const host = $(`#${type}CategoryList`);
      host.className = 'category-list';
      host.innerHTML = state.categories[type].map((name, i) => `<span class="category-chip">${escapeHTML(name)}${state.categories[type].length > 1 ? `<button type="button" data-remove-category="${type}" data-category-index="${i}" aria-label="Hapus ${escapeHTML(name)}">×</button>` : ''}</span>`).join('');
    }
    populateCategorySelect();
  }
  function renderAll() { renderDashboard(); renderTransactions(); renderDebts(); renderSummary(); renderCategories(); }
  function resetTransactionForm() {
    const form = $('#transactionForm'); form.reset(); form.elements.id.value = ''; form.elements.date.value = today(); $('#transactionModalTitle').textContent = 'Catat transaksi'; populateCategorySelect();
  }
  function openTransaction(transaction) {
    resetTransactionForm();
    if (transaction) {
      const form = $('#transactionForm'); form.elements.id.value = transaction.id; form.elements.title.value = transaction.title; form.elements.amount.value = transaction.amount; form.elements.date.value = transaction.date; form.elements.note.value = transaction.note || '';
      $(`input[name="type"][value="${transaction.type}"]`, form).checked = true; populateCategorySelect(transaction.category); $('#transactionModalTitle').textContent = 'Edit transaksi';
    }
    openDialog('transactionDialog');
  }
  function resetDebtForm() { const f = $('#debtForm'); f.reset(); f.elements.id.value = ''; f.elements.dueDate.value = today(); $('#debtModalTitle').textContent = 'Tambah utang / piutang'; }
  function openDebt(debt) {
    resetDebtForm();
    if (debt) {
      const f = $('#debtForm'); f.elements.id.value = debt.id; f.elements.person.value = debt.person; f.elements.amount.value = debt.amount; f.elements.paid.value = debt.paid || 0; f.elements.dueDate.value = debt.dueDate || today(); f.elements.note.value = debt.note || '';
      $(`input[name="direction"][value="${debt.direction}"]`, f).checked = true; $('#debtModalTitle').textContent = 'Edit utang / piutang';
    }
    openDialog('debtDialog');
  }
  document.addEventListener('click', event => {
    const pageLink = event.target.closest('[data-page]');
    if (pageLink) { event.preventDefault(); const page = pageLink.dataset.page; history.replaceState(null, '', `#${page}`); setPage(page); }
    const close = event.target.closest('[data-close]'); if (close) closeDialog(close.dataset.close);
    const action = event.target.closest('[data-action]');
    if (action?.dataset.action === 'add-transaction') openTransaction();
    if (action?.dataset.action === 'add-debt') openDebt();
    const editT = event.target.closest('[data-edit-transaction]'); if (editT) openTransaction(state.transactions.find(t => t.id === editT.dataset.editTransaction));
    const deleteT = event.target.closest('[data-delete-transaction]'); if (deleteT && confirm('Hapus transaksi ini?')) { state.transactions = state.transactions.filter(t => t.id !== deleteT.dataset.deleteTransaction); save(); toast('Transaksi dihapus.'); }
    const editD = event.target.closest('[data-edit-debt]'); if (editD) openDebt(state.debts.find(d => d.id === editD.dataset.editDebt));
    const deleteD = event.target.closest('[data-delete-debt]'); if (deleteD && confirm('Hapus catatan utang ini? Riwayat cicilannya juga akan dihapus.')) { state.debts = state.debts.filter(d => d.id !== deleteD.dataset.deleteDebt); save(); toast('Catatan dihapus.'); }
    const pay = event.target.closest('[data-payment]'); if (pay) {
      const d = state.debts.find(item => item.id === pay.dataset.payment), f = $('#paymentForm'); f.reset(); f.elements.id.value = d.id; f.elements.date.value = today(); f.elements.amount.max = remaining(d); $('#paymentDebtName').textContent = `${d.person} · tersisa ${currency(remaining(d))}`; openDialog('paymentDialog');
    }
    const debtTab = event.target.closest('[data-debt-filter]'); if (debtTab) { debtFilter = debtTab.dataset.debtFilter; $$('.filter-tab').forEach(t => t.classList.toggle('active', t === debtTab)); renderDebts(); }
    if (event.target.closest('#categoryBtn')) { renderCategories(); openDialog('categoryDialog'); }
    if (event.target.closest('#settingsBtn') || event.target.closest('#topProfile')) openDialog('settingsDialog');
    const addCategory = event.target.closest('[data-add-category]');
    if (addCategory) { const type = addCategory.dataset.addCategory, name = prompt('Nama kategori baru:')?.trim(); if (name && !state.categories[type].some(c => c.toLowerCase() === name.toLowerCase())) { state.categories[type].push(name); save(); toast('Kategori ditambahkan.'); } }
    const removeCategory = event.target.closest('[data-remove-category]');
    if (removeCategory) { const { categoryIndex, removeCategory: type } = removeCategory.dataset, name = state.categories[type][Number(categoryIndex)]; if (confirm(`Hapus kategori “${name}”?`)) { state.categories[type].splice(Number(categoryIndex), 1); save(); toast('Kategori dihapus.'); } }
  });
  $('#transactionForm').addEventListener('change', event => { if (event.target.name === 'type') populateCategorySelect(); });
  $('#transactionForm').addEventListener('submit', event => {
    event.preventDefault(); const f = event.currentTarget, data = Object.fromEntries(new FormData(f));
    const item = { id: data.id || crypto.randomUUID(), title: data.title.trim(), type: data.type, amount: Number(data.amount), category: data.category, date: data.date, note: data.note.trim(), createdAt: new Date().toISOString() };
    if (!item.title || item.amount <= 0) return;
    if (data.id) state.transactions = state.transactions.map(t => t.id === data.id ? { ...t, ...item } : t); else state.transactions.push(item);
    closeDialog('transactionDialog'); save(); toast(data.id ? 'Transaksi diperbarui.' : 'Transaksi tersimpan.');
  });
  $('#debtForm').addEventListener('submit', event => {
    event.preventDefault(); const f = event.currentTarget, data = Object.fromEntries(new FormData(f));
    const item = { id: data.id || crypto.randomUUID(), person: data.person.trim(), direction: data.direction, amount: Number(data.amount), paid: Math.min(Number(data.paid) || 0, Number(data.amount)), dueDate: data.dueDate, note: data.note.trim(), createdAt: new Date().toISOString() };
    if (!item.person || item.amount <= 0) return;
    if (data.id) state.debts = state.debts.map(d => d.id === data.id ? { ...d, ...item } : d); else state.debts.push(item);
    closeDialog('debtDialog'); save(); toast(data.id ? 'Catatan diperbarui.' : 'Catatan utang tersimpan.');
  });
  $('#paymentForm').addEventListener('submit', event => {
    event.preventDefault(); const f = event.currentTarget, id = f.elements.id.value, d = state.debts.find(item => item.id === id), amount = Number(f.elements.amount.value);
    if (!d || amount <= 0 || amount > remaining(d)) return toast('Jumlah cicilan melebihi sisa tagihan.');
    d.paid = Number(d.paid || 0) + amount; d.payments ||= []; d.payments.push({ amount, date: f.elements.date.value });
    closeDialog('paymentDialog'); save(); toast('Cicilan berhasil dicatat.');
  });
  $('#transactionSearch').addEventListener('input', renderTransactions); $('#typeFilter').addEventListener('change', renderTransactions); $('#monthFilter').addEventListener('change', renderTransactions);
  $('#chartPeriod').addEventListener('change', renderChart); $('#summaryMonth').addEventListener('change', renderSummary); $('#debtStatusFilter').addEventListener('change', renderDebts);
  $('#menuButton').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  document.addEventListener('click', e => { if (innerWidth <= 760 && !e.target.closest('#sidebar') && !e.target.closest('#menuButton')) $('#sidebar').classList.remove('open'); });
  $('#exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `rapi-cadangan-${today()}.json`; a.click(); URL.revokeObjectURL(url); toast('Cadangan berhasil diunduh.');
  });
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try { const data = JSON.parse(await file.text()); if (!Array.isArray(data.transactions) || !Array.isArray(data.debts)) throw new Error('invalid'); state = { ...freshState(), ...data, categories: { ...defaultCategories, ...(data.categories || {}) } }; save(); closeDialog('settingsDialog'); toast('Cadangan berhasil dipulihkan.'); }
    catch { toast('Berkas cadangan tidak valid.'); } finally { event.target.value = ''; }
  });
  $('#clearBtn').addEventListener('click', () => { if (confirm('Semua transaksi, utang, piutang, dan kategori akan dihapus dari perangkat ini. Lanjutkan?')) { state = freshState(); save(); closeDialog('settingsDialog'); toast('Semua data telah dihapus.'); } });
  $('#todayLabel').textContent = new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
  monthOptions($('#monthFilter')); $('#monthFilter').insertAdjacentHTML('afterbegin', '<option value="all">Semua bulan</option>'); $('#monthFilter').value = monthKey(today()); monthOptions($('#summaryMonth'));
  const initialPage = location.hash.slice(1); setPage(initialPage); renderAll();
})();
