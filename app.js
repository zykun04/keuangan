(() => {
  'use strict';
  const KEY = 'rapi-finance-v1';
  const defaultCategories = {
    personal: { income: ['Gaji', 'Bonus', 'Freelance', 'Investasi', 'Lainnya'], expense: ['Makanan', 'Transportasi', 'Belanja', 'Tagihan', 'Kesehatan', 'Hiburan', 'Pendidikan', 'Lainnya'] },
    business: { income: ['Penjualan', 'Jasa', 'Pendapatan lainnya'], expense: ['Stok barang', 'Operasional', 'Gaji karyawan', 'Sewa', 'Pemasaran', 'Transportasi', 'Utilitas', 'Pajak', 'Lainnya'] }
  };
  const freshState = () => ({ transactions: [], debts: [], categoriesByScope: structuredClone(defaultCategories), scope: 'personal' });
  function normalizeState(stored = {}) {
    const normalized = { ...freshState(), ...stored };
    normalized.scope = stored.scope === 'business' ? 'business' : 'personal';
    normalized.transactions = (stored.transactions || []).map(t => ({ ...t, scope: t.scope || 'personal' }));
    normalized.debts = (stored.debts || []).map(d => ({ ...d, scope: d.scope || 'personal' }));
    normalized.categoriesByScope = { ...structuredClone(defaultCategories), ...(stored.categoriesByScope || {}) };
    if (stored.categories && !stored.categoriesByScope) normalized.categoriesByScope.personal = stored.categories;
    for (const scope of ['personal', 'business']) normalized.categoriesByScope[scope] = { ...defaultCategories[scope], ...(normalized.categoriesByScope[scope] || {}) };
    return normalized;
  }
  let state;
  try { state = normalizeState(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { state = freshState(); }
  let debtFilter = 'all';
  let toastTimer;
  let firebaseSync = null, cloudUser = null, cloudWritable = false, pendingDeviceState = null, cloudSaveTimer = null, stopCloudWatch = null;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const today = () => new Date().toISOString().slice(0, 10);
  const currency = value => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
  const formatDate = value => value ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`)) : '—';
  const monthKey = value => (value || today()).slice(0, 7);
  const monthName = value => new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date(`${value}-15T12:00:00`));
  const remaining = debt => Math.max(0, Number(debt.amount) - Number(debt.paid || 0));
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  function save() {
    localStorage.setItem(KEY, JSON.stringify(state)); renderAll();
    if (firebaseSync && cloudUser && cloudWritable) {
      clearTimeout(cloudSaveTimer);
      cloudSaveTimer = setTimeout(async () => {
        try { await firebaseSync.saveState(cloudUser, state); $('#storageDescription').textContent = 'Tersinkron ke cloud dan tersimpan di perangkat ini.'; $('#storageHint').innerHTML = 'Tersinkron di akun dan perangkatmu <span class="privacy-dot">●</span>'; }
        catch (error) { $('#storageDescription').textContent = 'Belum tersinkron. Catatan tetap tersimpan di perangkat ini.'; toast(error.message || 'Sinkronisasi gagal.'); }
      }, 350);
    }
  }
  function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 2600); }
  function hasRecords(value) { return Boolean((value.transactions || []).length || (value.debts || []).length); }
  function showCloudNotice(title, message, actions = []) {
    $('#cloudNoticeTitle').textContent = title; $('#cloudNoticeText').textContent = message;
    $('#uploadLocalBtn').classList.toggle('hidden', !actions.includes('upload'));
    $('#mergeLocalBtn').classList.toggle('hidden', !actions.includes('merge'));
    $('#cloudNotice').classList.remove('hidden');
  }
  function hideCloudNotice() { $('#cloudNotice').classList.add('hidden'); }
  function mergeItems(cloudItems, deviceItems) {
    const byId = new Map(cloudItems.map(item => [item.id, item]));
    for (const item of deviceItems) {
      const current = byId.get(item.id);
      const currentDate = current?.updatedAt || current?.createdAt || '';
      const itemDate = item.updatedAt || item.createdAt || '';
      if (!current || itemDate > currentDate) byId.set(item.id, item);
    }
    return [...byId.values()];
  }
  function mergeStates(cloudState, deviceState) {
    const merged = normalizeState(cloudState);
    merged.transactions = mergeItems(merged.transactions, deviceState.transactions);
    merged.debts = mergeItems(merged.debts, deviceState.debts);
    for (const scope of ['personal', 'business']) for (const type of ['income', 'expense']) {
      merged.categoriesByScope[scope][type] = [...new Set([...merged.categoriesByScope[scope][type], ...deviceState.categoriesByScope[scope][type]])];
    }
    return merged;
  }
  function showAuthError(error) {
    const messages = {
      'auth/invalid-credential': 'Email atau kata sandi tidak cocok.',
      'auth/email-already-in-use': 'Email ini sudah punya akun. Coba masuk.',
      'auth/weak-password': 'Kata sandi terlalu pendek (minimal 6 karakter).',
      'auth/invalid-email': 'Format email belum benar.',
      'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi nanti.',
      'auth/network-request-failed': 'Koneksi internet bermasalah. Coba lagi.',
      'auth/operation-not-allowed': 'Aktifkan metode Email/Password di Firebase Authentication.',
      'auth/unauthorized-domain': 'Tambahkan domain situs ini ke daftar domain resmi Firebase Authentication.'
    };
    $('#authError').textContent = messages[error.code] || error.message || 'Terjadi kendala. Coba lagi.';
  }
  async function initializeCloud() {
    const config = window.ZYKUN_FIREBASE_CONFIG;
    if (!config?.apiKey || !config?.authDomain || !config?.projectId || !config?.appId) {
      $('#storageDescription').textContent = 'Data tersimpan hanya di browser ini; Firebase belum dikonfigurasi.';
      $('#storageHint').innerHTML = 'Data tersimpan di perangkatmu <span class="privacy-dot">●</span>';
      return;
    }
    $('#cloudAuthGate').classList.remove('hidden');
    try {
      firebaseSync = await import('./firebase-sync.js');
      let loadedUid = null;
      firebaseSync.watchUser(async user => {
        if (!user) {
          if (stopCloudWatch) { stopCloudWatch(); stopCloudWatch = null; }
          cloudUser = null; cloudWritable = false; loadedUid = null;
          $('#signOutBtn').hidden = true; $('#cloudAuthGate').classList.remove('hidden'); hideCloudNotice();
          return;
        }
        if (loadedUid === user.uid) return;
        loadedUid = user.uid; cloudUser = user;
        $('#signOutBtn').hidden = false; $('#authError').textContent = '';
        try {
          const previousOwner = localStorage.getItem(`${KEY}-cloud-owner`);
          const cachedState = localStorage.getItem(KEY) || '{}';
          const otherAccountCache = Boolean(previousOwner && previousOwner !== user.uid);
          if (otherAccountCache) localStorage.setItem(`${KEY}-backup-${previousOwner}`, cachedState);
          const deviceState = otherAccountCache ? freshState() : normalizeState(JSON.parse(cachedState));
          const remoteState = await firebaseSync.loadState(user);
          if (stopCloudWatch) stopCloudWatch();
          stopCloudWatch = firebaseSync.watchState(user, remoteUpdate => {
            if (!remoteUpdate || !cloudWritable) return;
            const currentScope = state.scope;
            state = normalizeState(remoteUpdate); state.scope = currentScope;
            localStorage.setItem(KEY, JSON.stringify(state)); renderAll();
            $('#storageHint').innerHTML = 'Tersinkron di akun dan perangkatmu <span class="privacy-dot">●</span>';
          }, error => { $('#storageDescription').textContent = 'Koneksi cloud terputus; perubahan baru tersimpan di perangkat.'; toast(error.message || 'Koneksi cloud terputus.'); });
          $('#cloudAuthGate').classList.add('hidden');
          if (remoteState) {
            state = normalizeState(remoteState); localStorage.setItem(KEY, JSON.stringify(state)); localStorage.setItem(`${KEY}-cloud-owner`, user.uid); renderAll(); cloudWritable = true;
            $('#storageDescription').textContent = `Akun sinkron: ${user.email || 'aktif'}.`; $('#storageHint').innerHTML = 'Tersimpan di akun dan perangkatmu <span class="privacy-dot">●</span>';
            const localOnly = deviceState.transactions.some(t => { const remote = state.transactions.find(r => r.id === t.id); return !remote || JSON.stringify(t) !== JSON.stringify(remote); }) || deviceState.debts.some(d => { const remote = state.debts.find(r => r.id === d.id); return !remote || JSON.stringify(d) !== JSON.stringify(remote); });
            const localCategoriesOnly = ['personal', 'business'].some(scope => ['income', 'expense'].some(type => deviceState.categoriesByScope[scope][type].some(name => !state.categoriesByScope[scope][type].includes(name))));
            if ((hasRecords(deviceState) && localOnly) || localCategoriesOnly) { pendingDeviceState = deviceState; showCloudNotice('Ada catatan lokal di perangkat ini', 'Gabungkan catatan lokal ini ke akun agar bisa terlihat di perangkat lain.', ['merge']); }
            else { pendingDeviceState = null; hideCloudNotice(); }
          } else if (hasRecords(deviceState)) {
            state = deviceState; localStorage.setItem(KEY, JSON.stringify(state)); localStorage.setItem(`${KEY}-cloud-owner`, user.uid); renderAll(); cloudWritable = false;
            $('#storageDescription').textContent = 'Catatan di perangkat ini belum diunggah.'; $('#storageHint').innerHTML = 'Catatan lokal menunggu dipindahkan <span class="privacy-dot">●</span>';
            showCloudNotice('Pindahkan catatan perangkat ke Firebase', 'Catatan yang sudah tersimpan di perangkat ini belum masuk cloud. Unggah sekali agar dapat dibuka di HP dan laptop.', ['upload']);
          } else {
            state = deviceState; localStorage.setItem(`${KEY}-cloud-owner`, user.uid); cloudWritable = true; $('#storageDescription').textContent = `Akun sinkron: ${user.email || 'aktif'}.`; $('#storageHint').innerHTML = 'Tersimpan di akun dan perangkatmu <span class="privacy-dot">●</span>'; hideCloudNotice(); save();
          }
        } catch (error) {
          cloudWritable = false; $('#storageDescription').textContent = 'Tidak dapat memuat data cloud.';
          showCloudNotice('Sinkronisasi belum tersedia', error.message || 'Periksa koneksi internet dan aturan Firestore.');
        }
      });
    } catch (error) {
      $('#cloudAuthGate').classList.add('hidden');
      showCloudNotice('Firebase belum siap', 'Periksa konfigurasi firebase-config.js dan koneksi internet.');
    }
  }
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
  function scopedTransactions() { return state.transactions.filter(t => (t.scope || 'personal') === state.scope); }
  function scopedDebts() { return state.debts.filter(d => (d.scope || 'personal') === state.scope); }
  function monthlyTransactions(month) { return scopedTransactions().filter(t => monthKey(t.date) === month); }
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
    const currentTransactions = scopedTransactions();
    const currentDebts = scopedDebts();
    const overallIncome = currentTransactions.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const overallExpense = currentTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    $('#totalBalance').textContent = currency(overallIncome - overallExpense);
    $('#incomeValue').textContent = currency(income); $('#expenseValue').textContent = currency(expense);
    $('#incomeCount').textContent = `${rows.filter(t => t.type === 'income').length} transaksi`; $('#expenseCount').textContent = `${rows.filter(t => t.type === 'expense').length} transaksi`;
    const payable = currentDebts.filter(d => d.direction === 'payable').reduce((s, d) => s + remaining(d), 0);
    const receivable = currentDebts.filter(d => d.direction === 'receivable').reduce((s, d) => s + remaining(d), 0);
    $('#debtTotal').textContent = currency(payable + receivable); $('#payableTotal').textContent = currency(payable); $('#receivableTotal').textContent = currency(receivable);
    const upcoming = currentDebts.filter(d => remaining(d) > 0).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')).slice(0, 3);
    $('#upcomingDebts').innerHTML = upcoming.length ? upcoming.map(d => `<div class="upcoming-item"><div class="upcoming-person"><span class="debt-avatar">${escapeHTML((d.person || '?').charAt(0).toUpperCase())}</span><span class="upcoming-copy"><strong>${escapeHTML(d.person)}</strong><span>${d.direction === 'payable' ? 'Utang' : 'Piutang'} · ${escapeHTML(formatDate(d.dueDate))}</span></span></div><span class="upcoming-amount">${currency(remaining(d))}<small>tersisa</small></span></div>`).join('') : '<div class="panel-subtitle">Belum ada jatuh tempo mendatang.</div>';
    const sorted = [...currentTransactions].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 5);
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
    const rows = [...scopedTransactions()].filter(t => (!query || `${t.title} ${t.category} ${t.note || ''}`.toLowerCase().includes(query)) && (type === 'all' || t.type === type) && (month === 'all' || monthKey(t.date) === month)).sort((a, b) => b.date.localeCompare(a.date));
    $('#allTransactions').innerHTML = rows.map(t => transactionRow(t, true)).join(''); $('#transactionsEmpty').classList.toggle('hidden', rows.length > 0);
  }
  function renderDebts() {
    const status = $('#debtStatusFilter').value;
    const currentDebts = scopedDebts();
    const payable = currentDebts.filter(d => d.direction === 'payable'), receivable = currentDebts.filter(d => d.direction === 'receivable');
    $('#debtPagePayable').textContent = currency(payable.reduce((s, d) => s + remaining(d), 0)); $('#debtPageReceivable').textContent = currency(receivable.reduce((s, d) => s + remaining(d), 0));
    $('#debtPagePaid').textContent = currency(currentDebts.reduce((s, d) => s + Number(d.paid || 0), 0)); $('#allDebtCount').textContent = currentDebts.length;
    const rows = [...currentDebts].filter(d => (debtFilter === 'all' || d.direction === debtFilter) && (status === 'all' || (status === 'paid' ? remaining(d) === 0 : remaining(d) > 0))).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    $('#debtList').innerHTML = rows.map(d => {
      const left = remaining(d), pct = d.amount ? Math.min(100, (Number(d.paid || 0) / Number(d.amount)) * 100) : 0;
      const overdue = left > 0 && d.dueDate && d.dueDate < today();
      return `<article class="debt-card"><div class="debt-person"><span class="debt-avatar">${escapeHTML((d.person || '?').charAt(0).toUpperCase())}</span><span class="debt-person-copy"><strong>${escapeHTML(d.person)}</strong><span>${d.direction === 'payable' ? 'Saya berutang' : 'Orang lain berutang'}${d.note ? ` · ${escapeHTML(d.note)}` : ''}</span></span></div><div class="debt-progress"><div class="debt-progress-label"><span>Terbayar ${currency(d.paid || 0)}</span><strong>${Math.round(pct)}%</strong></div><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div></div><div class="debt-due"><span>Jatuh tempo</span><strong class="${overdue ? 'due-soon' : ''}">${escapeHTML(formatDate(d.dueDate))}${overdue ? ' · terlambat' : ''}</strong></div><div class="debt-actions">${left > 0 ? `<button class="small-action pay" data-payment="${escapeHTML(d.id)}">＋ Cicilan</button>` : '<span class="paid-badge">✓ Lunas</span>'}<button class="small-action" data-edit-debt="${escapeHTML(d.id)}" aria-label="Edit">✎</button><button class="row-action delete" data-delete-debt="${escapeHTML(d.id)}" aria-label="Hapus">×</button></div></article>`;
    }).join('');
    $('#debtsEmpty').classList.toggle('hidden', currentDebts.length > 0); $('#debtList').classList.toggle('hidden', rows.length === 0 && currentDebts.length > 0);
    if (!rows.length && currentDebts.length > 0) $('#debtList').innerHTML = '<div class="panel empty-state"><strong>Tidak ada catatan pada filter ini</strong><p>Coba pilih jenis atau status yang lain.</p></div>', $('#debtList').classList.remove('hidden');
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
    select.innerHTML = (state.categoriesByScope[state.scope][type] || []).map(c => `<option ${c === selected ? 'selected' : ''}>${escapeHTML(c)}</option>`).join('');
  }
  function renderCategories() {
    $('#categoryScopeLabel').textContent = state.scope === 'business' ? '· Usaha' : '· Pribadi';
    for (const type of ['income', 'expense']) {
      const host = $(`#${type}CategoryList`);
      host.className = 'category-list';
      const categories = state.categoriesByScope[state.scope][type];
      host.innerHTML = categories.map((name, i) => `<span class="category-chip">${escapeHTML(name)}${categories.length > 1 ? `<button type="button" data-remove-category="${type}" data-category-index="${i}" aria-label="Hapus ${escapeHTML(name)}">×</button>` : ''}</span>`).join('');
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
    if (addCategory) { const type = addCategory.dataset.addCategory, name = prompt('Nama kategori baru:')?.trim(), categories = state.categoriesByScope[state.scope][type]; if (name && !categories.some(c => c.toLowerCase() === name.toLowerCase())) { categories.push(name); save(); toast('Kategori ditambahkan.'); } }
    const removeCategory = event.target.closest('[data-remove-category]');
    if (removeCategory) { const { categoryIndex, removeCategory: type } = removeCategory.dataset, categories = state.categoriesByScope[state.scope][type], name = categories[Number(categoryIndex)]; if (confirm(`Hapus kategori “${name}”?`)) { categories.splice(Number(categoryIndex), 1); save(); toast('Kategori dihapus.'); } }
  });
  $('#transactionForm').addEventListener('change', event => { if (event.target.name === 'type') populateCategorySelect(); });
  $('#transactionForm').addEventListener('submit', event => {
    event.preventDefault(); const f = event.currentTarget, data = Object.fromEntries(new FormData(f));
    const timestamp = new Date().toISOString(), existing = data.id ? state.transactions.find(t => t.id === data.id) : null;
    const item = { id: data.id || crypto.randomUUID(), title: data.title.trim(), type: data.type, amount: Number(data.amount), category: data.category, date: data.date, note: data.note.trim(), scope: state.scope, createdAt: existing?.createdAt || timestamp, updatedAt: timestamp };
    if (!item.title || item.amount <= 0) return;
    if (data.id) state.transactions = state.transactions.map(t => t.id === data.id ? { ...t, ...item } : t); else state.transactions.push(item);
    closeDialog('transactionDialog'); save(); toast(data.id ? 'Transaksi diperbarui.' : 'Transaksi tersimpan.');
  });
  $('#debtForm').addEventListener('submit', event => {
    event.preventDefault(); const f = event.currentTarget, data = Object.fromEntries(new FormData(f));
    const timestamp = new Date().toISOString(), existing = data.id ? state.debts.find(d => d.id === data.id) : null;
    const item = { id: data.id || crypto.randomUUID(), person: data.person.trim(), direction: data.direction, amount: Number(data.amount), paid: Math.min(Number(data.paid) || 0, Number(data.amount)), dueDate: data.dueDate, note: data.note.trim(), scope: state.scope, createdAt: existing?.createdAt || timestamp, updatedAt: timestamp };
    if (!item.person || item.amount <= 0) return;
    if (data.id) state.debts = state.debts.map(d => d.id === data.id ? { ...d, ...item } : d); else state.debts.push(item);
    closeDialog('debtDialog'); save(); toast(data.id ? 'Catatan diperbarui.' : 'Catatan utang tersimpan.');
  });
  $('#paymentForm').addEventListener('submit', event => {
    event.preventDefault(); const f = event.currentTarget, id = f.elements.id.value, d = state.debts.find(item => item.id === id), amount = Number(f.elements.amount.value);
    if (!d || amount <= 0 || amount > remaining(d)) return toast('Jumlah cicilan melebihi sisa tagihan.');
    d.paid = Number(d.paid || 0) + amount; d.updatedAt = new Date().toISOString(); d.payments ||= []; d.payments.push({ amount, date: f.elements.date.value });
    closeDialog('paymentDialog'); save(); toast('Cicilan berhasil dicatat.');
  });
  $('#transactionSearch').addEventListener('input', renderTransactions); $('#typeFilter').addEventListener('change', renderTransactions); $('#monthFilter').addEventListener('change', renderTransactions);
  $('#chartPeriod').addEventListener('change', renderChart); $('#summaryMonth').addEventListener('change', renderSummary); $('#debtStatusFilter').addEventListener('change', renderDebts);
  $('#scopeSelect').value = state.scope;
  $('#scopeSelect').addEventListener('change', event => { state.scope = event.target.value === 'business' ? 'business' : 'personal'; save(); toast(state.scope === 'business' ? 'Ruang Usaha dibuka.' : 'Ruang Pribadi dibuka.'); });
  $('#authForm').addEventListener('submit', async event => {
    event.preventDefault(); if (!firebaseSync) return;
    const form = event.currentTarget; $('#authError').textContent = '';
    try { await firebaseSync.login(form.elements.email.value.trim(), form.elements.password.value); }
    catch (error) { showAuthError(error); }
  });
  $('#registerBtn').addEventListener('click', async () => {
    const form = $('#authForm'); if (!form.reportValidity() || !firebaseSync) return;
    $('#authError').textContent = '';
    try { await firebaseSync.register(form.elements.email.value.trim(), form.elements.password.value); }
    catch (error) { showAuthError(error); }
  });
  $('#resetPasswordBtn').addEventListener('click', async () => {
    const email = $('#authForm').elements.email.value.trim();
    if (!email) { $('#authError').textContent = 'Masukkan email terlebih dahulu.'; return; }
    try { await firebaseSync.resetPassword(email); $('#authError').textContent = 'Tautan pemulihan dikirim ke email.'; }
    catch (error) { showAuthError(error); }
  });
  $('#signOutBtn').addEventListener('click', async () => { if (firebaseSync) { closeDialog('settingsDialog'); await firebaseSync.logout(); } });
  $('#uploadLocalBtn').addEventListener('click', async () => {
    if (!firebaseSync || !cloudUser || !confirm('Unggah semua catatan yang tersimpan di perangkat ini ke akun Firebase?')) return;
    try { await firebaseSync.saveState(cloudUser, state); localStorage.setItem(`${KEY}-cloud-owner`, cloudUser.uid); cloudWritable = true; pendingDeviceState = null; hideCloudNotice(); $('#storageDescription').textContent = 'Tersinkron ke cloud dan tersimpan di perangkat ini.'; $('#storageHint').innerHTML = 'Tersinkron di akun dan perangkatmu <span class="privacy-dot">●</span>'; toast('Catatan perangkat berhasil disinkronkan.'); }
    catch (error) { toast(error.message || 'Catatan gagal diunggah.'); }
  });
  $('#mergeLocalBtn').addEventListener('click', async () => {
    if (!firebaseSync || !cloudUser || !pendingDeviceState) return;
    state = mergeStates(state, pendingDeviceState); cloudWritable = true;
    try { await firebaseSync.saveState(cloudUser, state); pendingDeviceState = null; localStorage.setItem(KEY, JSON.stringify(state)); localStorage.setItem(`${KEY}-cloud-owner`, cloudUser.uid); renderAll(); hideCloudNotice(); $('#storageHint').innerHTML = 'Tersinkron di akun dan perangkatmu <span class="privacy-dot">●</span>'; toast('Catatan perangkat berhasil digabungkan.'); }
    catch (error) { toast(error.message || 'Penggabungan gagal.'); }
  });
  $('#menuButton').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  document.addEventListener('click', e => { if (innerWidth <= 760 && !e.target.closest('#sidebar') && !e.target.closest('#menuButton')) $('#sidebar').classList.remove('open'); });
  $('#exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `zykun-cadangan-${today()}.json`; a.click(); URL.revokeObjectURL(url); toast('Cadangan berhasil diunduh.');
  });
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text()); if (!Array.isArray(data.transactions) || !Array.isArray(data.debts)) throw new Error('invalid');
      state = { ...freshState(), ...data, scope: data.scope === 'business' ? 'business' : 'personal' };
      state.categoriesByScope = { ...structuredClone(defaultCategories), ...(data.categoriesByScope || {}) };
      if (data.categories && !data.categoriesByScope) state.categoriesByScope.personal = { ...defaultCategories.personal, ...data.categories };
      for (const scope of ['personal', 'business']) state.categoriesByScope[scope] = { ...defaultCategories[scope], ...(state.categoriesByScope[scope] || {}) };
      state.transactions = data.transactions.map(t => ({ ...t, scope: t.scope || 'personal' }));
      state.debts = data.debts.map(d => ({ ...d, scope: d.scope || 'personal' }));
      save(); closeDialog('settingsDialog'); toast('Cadangan berhasil dipulihkan.');
    }
    catch { toast('Berkas cadangan tidak valid.'); } finally { event.target.value = ''; }
  });
  $('#clearBtn').addEventListener('click', () => { if (confirm('Semua transaksi, utang, piutang, dan kategori akan dihapus dari perangkat ini. Lanjutkan?')) { state = freshState(); save(); closeDialog('settingsDialog'); toast('Semua data telah dihapus.'); } });
  $('#todayLabel').textContent = new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
  monthOptions($('#monthFilter')); $('#monthFilter').insertAdjacentHTML('afterbegin', '<option value="all">Semua bulan</option>'); $('#monthFilter').value = monthKey(today()); monthOptions($('#summaryMonth'));
  const initialPage = location.hash.slice(1); setPage(initialPage); renderAll(); initializeCloud();
})();
