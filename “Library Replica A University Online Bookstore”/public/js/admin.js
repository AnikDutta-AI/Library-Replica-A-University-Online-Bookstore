import { initLayout, showToast, escapeHTML, formatPrice, formatDate, openModal, closeModal, confirmDialog, debounce, renderPagination, statusBadge, openPrintWindow } from './main.js';
import { requireAdmin } from './auth.js';
import { getAllBooks, getDepartments, getCategories, getDepartmentCounts, saveBook, deleteBook, importBooksFromJson } from './books.js';
import { getAdminStats, listUsers } from './admin-api.js';
import { getAllOrders, updateOrderStatus, ORDER_STATUSES, generateInvoiceHTML, paymentLabel } from './orders.js';
import { uploadBookCover, uploadBookPdf, validateImageFile, validatePdfFile } from './storage.js';
import { isFirebaseConfigured } from './firebase-config.js';

await initLayout();
await requireAdmin(); // UI convenience: the real protection is in firestore.rules / storage.rules

const $ = (id) => document.getElementById(id);
const PAGE = 12;
const loaded = { departments: false, users: false, orders: false, uploads: false };
let allBooks = [];
let bookPage = 1;
let bookQuery = '';
let orders = [];

/* ------------------------------- Stats ---------------------------------- */
async function refreshStats() {
  try {
    const s = await getAdminStats();
    const card = (icon, value, label, extra = '') => `<div class="card stat-card"><div class="dept-icon"><i class="fa-solid ${icon}" aria-hidden="true"></i></div><div><strong>${value}</strong><span>${label}</span>${extra}</div></div>`;
    $('stats').innerHTML = card('fa-book', s.totalBooks.toLocaleString('en-IN'), 'Total books')
      + card('fa-layer-group', `${s.totalCategories} categories`, `${s.totalDepartments} departments`, '<small>5 CSE specializations + 11 departments</small>')
      + card('fa-user-graduate', s.totalStudents.toLocaleString('en-IN'), 'Registered students')
      + card('fa-box', s.totalOrders.toLocaleString('en-IN'), 'Total orders')
      + card('fa-indian-rupee-sign', formatPrice(s.totalSales), 'Total simulated sales', '<small>Excludes cancelled orders</small>');
  } catch (err) {
    showToast(err.message, 'error');
    $('stats').innerHTML = '<div class="empty-state" style="grid-column:1/-1"><p style="margin:0">Could not load statistics.</p></div>';
  }
}

/* ------------------------------- Tabs ----------------------------------- */
const tabs = [...document.querySelectorAll('.tab-btn')];
function selectTab(name, focus = false) {
  tabs.forEach((t) => {
    const on = t.dataset.tab === name;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    if (on && focus) t.focus();
    $(`panel-${t.dataset.tab}`).classList.toggle('hidden', !on);
  });
  if (name === 'departments' && !loaded.departments) loadDepartments();
  if (name === 'users' && !loaded.users) loadUsers();
  if (name === 'orders' && !loaded.orders) loadOrders();
  if (name === 'uploads' && !loaded.uploads) initUploads();
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(t.dataset.tab));
  t.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') selectTab(tabs[(i + 1) % tabs.length].dataset.tab, true);
    if (e.key === 'ArrowLeft') selectTab(tabs[(i - 1 + tabs.length) % tabs.length].dataset.tab, true);
  });
});

/* ------------------------------- Books ---------------------------------- */
function renderBooks() {
  const q = bookQuery.toLowerCase();
  const list = q ? allBooks.filter((b) => `${b.title} ${b.author} ${b.bookId}`.toLowerCase().includes(q)) : allBooks;
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  bookPage = Math.min(bookPage, pages);
  const slice = list.slice((bookPage - 1) * PAGE, bookPage * PAGE);
  $('books-body').innerHTML = slice.length ? slice.map((b) => `<tr data-id="${escapeHTML(b.bookId)}">
      <td><code>${escapeHTML(b.bookId)}</code></td><td class="title-cell">${escapeHTML(b.title)}</td>
      <td>${escapeHTML(b.specializationName || b.departmentName)}</td><td>${formatPrice(b.price)}</td>
      <td>${b.stock === 0 ? '<span class="badge badge-danger">0</span>' : b.stock}</td>
      <td class="actions"><button class="btn btn-outline btn-sm" type="button" data-act="edit">Edit</button><button class="btn btn-danger btn-sm" type="button" data-act="delete">Delete</button></td></tr>`).join('')
    : '<tr><td colspan="6" class="text-center text-muted">No books found. If the catalogue is empty, use the Import tab.</td></tr>';
  renderPagination($('books-pagination'), bookPage, pages, (p) => { bookPage = p; renderBooks(); });
}

async function loadBooks() {
  try {
    allBooks = await getAllBooks();
  } catch (err) {
    showToast(err.message, 'error');
    allBooks = [];
  }
  renderBooks();
}

function openBookForm(book) {
  const cats = getCategories();
  const current = book ? `${book.department}|${book.specialization || ''}` : '';
  const val = (v) => escapeHTML(v ?? '');
  const modal = openModal(`<h2>${book ? 'Edit book' : 'Add book'}</h2>
    <div id="bf-alert" class="form-alert error" role="alert"></div>
    <form id="book-form" class="book-form" novalidate>
      <div class="form-group full"><label for="bf-title">Title *</label><input class="input" id="bf-title" value="${val(book?.title)}"></div>
      <div class="form-group"><label for="bf-author">Author *</label><input class="input" id="bf-author" value="${val(book?.author)}"></div>
      <div class="form-group"><label for="bf-publisher">Publisher</label><input class="input" id="bf-publisher" value="${val(book?.publisher)}"></div>
      <div class="form-group"><label for="bf-edition">Edition</label><input class="input" id="bf-edition" value="${val(book?.edition)}"></div>
      <div class="form-group"><label for="bf-isbn">ISBN (optional)</label><input class="input" id="bf-isbn" value="${val(book?.isbn)}"></div>
      <div class="form-group full"><label for="bf-cat">Category *</label><select class="input" id="bf-cat"><option value="">Select…</option>
        ${cats.map((c) => `<option value="${c.slug}|${c.specSlug || ''}" ${current === `${c.slug}|${c.specSlug || ''}` ? 'selected' : ''}>${escapeHTML(c.label)}</option>`).join('')}</select></div>
      <div class="form-group full"><label for="bf-subject">Subject</label><input class="input" id="bf-subject" value="${val(book?.subject)}"></div>
      <div class="form-group full"><label for="bf-desc">Description</label><textarea class="input" id="bf-desc" rows="3">${val(book?.description)}</textarea></div>
      <div class="form-group"><label for="bf-price">Price (₹) *</label><input class="input" id="bf-price" type="number" min="0" step="1" value="${book ? book.price : ''}"></div>
      <div class="form-group"><label for="bf-orig">Original price (₹)</label><input class="input" id="bf-orig" type="number" min="0" step="1" value="${book ? book.originalPrice : ''}"></div>
      <div class="form-group"><label for="bf-stock">Stock *</label><input class="input" id="bf-stock" type="number" min="0" step="1" value="${book ? book.stock : ''}"></div>
      <div class="form-group"><label for="bf-cover">Cover image URL</label><input class="input" id="bf-cover" value="${val(book?.coverImage)}" placeholder="https://… or images/…"></div>
      <div class="form-group full"><label for="bf-pdf">Preview PDF URL</label><input class="input" id="bf-pdf" value="${val(book?.previewPdf)}" placeholder="pdf-previews/sample.pdf"></div>
      <div class="modal-actions full" style="grid-column:1/-1"><button class="btn btn-outline" type="button" data-modal-close>Cancel</button><button class="btn btn-primary" type="submit">${book ? 'Save changes' : 'Add book'}</button></div>
    </form>`, { title: book ? 'Edit book' : 'Add book', size: 'lg' });

  modal.querySelector('#book-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const m = (id) => modal.querySelector(`#${id}`).value.trim();
    const alertBox = modal.querySelector('#bf-alert');
    const urlOk = (u) => !u || /^(https?:\/\/|images\/|pdf-previews\/|\/)/i.test(u);
    alertBox.textContent = '';
    if (m('bf-price') === '' || m('bf-stock') === '') { alertBox.textContent = 'Price and stock are required.'; return; }
    if (!urlOk(m('bf-cover')) || !urlOk(m('bf-pdf'))) { alertBox.textContent = 'URLs must start with https://, images/, pdf-previews/ or /.'; return; }
    const [department, specialization] = m('bf-cat').split('|');
    try {
      await saveBook({
        ...(book || {}), title: m('bf-title'), author: m('bf-author'), publisher: m('bf-publisher'), edition: m('bf-edition'),
        isbn: m('bf-isbn') || null, department, specialization: specialization || null, subject: m('bf-subject'),
        description: m('bf-desc'), price: Number(m('bf-price')), originalPrice: m('bf-orig') === '' ? Number(m('bf-price')) : Number(m('bf-orig')),
        stock: Number(m('bf-stock')), coverImage: m('bf-cover') || null, previewPdf: m('bf-pdf') || null, isSample: book ? book.isSample : false
      });
      closeModal();
      showToast(book ? 'Book updated.' : 'Book added.', 'success');
      await loadBooks();
      refreshStats();
    } catch (err) {
      alertBox.textContent = err.message;
    }
  });
}

$('add-book').addEventListener('click', () => openBookForm(null));
$('book-search').addEventListener('input', debounce((e) => { bookQuery = e.target.value.trim(); bookPage = 1; renderBooks(); }, 250));
$('books-body').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.closest('tr').dataset.id;
  const book = allBooks.find((b) => b.bookId === id);
  if (!book) return;
  if (btn.dataset.act === 'edit') openBookForm(book);
  if (btn.dataset.act === 'delete') {
    if (!(await confirmDialog(`Delete “${book.title}”? This cannot be undone.`))) return;
    try {
      await deleteBook(id);
      showToast('Book deleted.', 'success');
      await loadBooks();
      refreshStats();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
});

/* ------------------------------- Uploads -------------------------------- */
function initUploads() {
  loaded.uploads = true;
  $('upload-notice').classList.toggle('hidden', isFirebaseConfigured);
  $('book-ids').innerHTML = allBooks.map((b) => `<option value="${escapeHTML(b.bookId)}">${escapeHTML(b.title)}</option>`).join('');
  const check = (input, validator) => input.addEventListener('change', () => {
    if (!input.files[0]) return;
    try { validator(input.files[0]); } catch (err) { showToast(err.message, 'error'); input.value = ''; }
  });
  check($('cover-file'), validateImageFile);
  check($('pdf-file'), validatePdfFile);

  const handle = (formId, bookInput, fileInput, uploader, field, okMessage) => $(formId).addEventListener('submit', async (e) => {
    e.preventDefault();
    const book = allBooks.find((b) => b.bookId === $(bookInput).value.trim());
    const file = $(fileInput).files[0];
    if (!book) { showToast('Enter a valid Book ID from the catalogue.', 'error'); return; }
    if (!file) { showToast('Please choose a file first.', 'error'); return; }
    try {
      const url = await uploader(book.bookId, file);
      await saveBook({ ...book, [field]: url });
      showToast(okMessage, 'success');
      $(fileInput).value = '';
      await loadBooks();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
  handle('cover-form', 'cover-book', 'cover-file', uploadBookCover, 'coverImage', 'Cover uploaded and linked to the book.');
  handle('pdf-form', 'pdf-book', 'pdf-file', uploadBookPdf, 'previewPdf', 'PDF uploaded and linked to the book.');
}

/* ----------------------------- Departments ------------------------------ */
async function loadDepartments() {
  loaded.departments = true;
  let counts = {};
  try { counts = await getDepartmentCounts(); } catch (err) { showToast(err.message, 'error'); }
  $('tax-grid').innerHTML = getDepartments().map((d) => `<article class="card"><strong>${escapeHTML(d.name)}</strong>
    <div class="text-muted" style="font-size:.85rem">slug: <code>${d.slug}</code> · ${counts[d.slug] || 0} books</div>
    ${d.specializations.length ? `<ul>${d.specializations.map((s) => `<li>${escapeHTML(s.name)} <code>${s.slug}</code> · ${counts[`${d.slug}/${s.slug}`] || 0}</li>`).join('')}</ul>` : ''}</article>`).join('');
}

/* -------------------------------- Users --------------------------------- */
async function loadUsers() {
  loaded.users = true;
  try {
    const users = await listUsers();
    $('users-body').innerHTML = users.length ? users.map((u) => `<tr><td>${escapeHTML(u.fullName)}</td><td>${escapeHTML(u.studentId)}</td><td>${escapeHTML(u.email)}</td>
      <td>${escapeHTML(u.department)}</td><td><span class="badge ${u.role === 'admin' ? 'badge-gold' : ''}">${escapeHTML(u.role)}</span></td></tr>`).join('')
      : '<tr><td colspan="5" class="text-center text-muted">No users yet.</td></tr>';
  } catch (err) {
    loaded.users = false;
    showToast(err.message, 'error');
    $('users-body').innerHTML = '<tr><td colspan="5" class="text-center text-muted">Could not load users.</td></tr>';
  }
}

/* -------------------------------- Orders -------------------------------- */
function renderOrders() {
  $('orders-body').innerHTML = orders.length ? orders.map((o) => `<tr data-id="${escapeHTML(o.orderId)}">
    <td><code>${escapeHTML(o.orderId)}</code></td><td>${escapeHTML(o.customer.fullName)}<br><small class="text-muted">${escapeHTML(o.customer.email)}</small></td>
    <td>${escapeHTML(formatDate(o.createdAt))}</td><td>${formatPrice(o.totalAmount)}</td><td>${escapeHTML(paymentLabel(o.paymentMethod))}</td>
    <td><label class="sr-only" for="st-${escapeHTML(o.orderId)}">Status for ${escapeHTML(o.orderId)}</label>
      <select class="input" id="st-${escapeHTML(o.orderId)}" data-act="status">${ORDER_STATUSES.map((s) => `<option ${s === o.orderStatus ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
    <td><button class="btn btn-outline btn-sm" type="button" data-act="view">Details</button></td></tr>`).join('')
    : '<tr><td colspan="7" class="text-center text-muted">No orders yet.</td></tr>';
}

async function loadOrders() {
  loaded.orders = true;
  try {
    orders = await getAllOrders();
    renderOrders();
  } catch (err) {
    loaded.orders = false;
    showToast(err.message, 'error');
    $('orders-body').innerHTML = '<tr><td colspan="7" class="text-center text-muted">Could not load orders.</td></tr>';
  }
}

$('orders-body').addEventListener('change', async (e) => {
  if (e.target.dataset.act !== 'status') return;
  const id = e.target.closest('tr').dataset.id;
  const order = orders.find((o) => o.orderId === id);
  try {
    await updateOrderStatus(id, e.target.value);
    order.orderStatus = e.target.value;
    showToast(`Order ${id} is now ${e.target.value}.`, 'success');
  } catch (err) {
    e.target.value = order.orderStatus; // revert the dropdown
    showToast(err.message, 'error');
  }
});

$('orders-body').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act="view"]');
  if (!btn) return;
  const o = orders.find((x) => x.orderId === btn.closest('tr').dataset.id);
  if (!o) return;
  const modal = openModal(`<h2>Order ${escapeHTML(o.orderId)}</h2>
    <p>${statusBadge(o.orderStatus)} ${statusBadge(o.paymentStatus)} <span class="text-muted">· ${escapeHTML(paymentLabel(o.paymentMethod))} · ${escapeHTML(formatDate(o.createdAt))}</span></p>
    <p><strong>${escapeHTML(o.customer.fullName)}</strong> (ID ${escapeHTML(o.customer.studentId)})<br>${escapeHTML(o.customer.email)} · ${escapeHTML(o.customer.phone)}<br><span style="white-space:pre-line">${escapeHTML(o.customer.address)}</span></p>
    <div style="overflow-x:auto"><table class="order-table"><thead><tr><th>Book</th><th class="r">Qty</th><th class="r">Amount</th></tr></thead><tbody>
      ${o.items.map((it) => `<tr><td>${escapeHTML(it.title)}</td><td class="r">${it.quantity}</td><td class="r">${formatPrice(it.price * it.quantity)}</td></tr>`).join('')}</tbody></table></div>
    <div class="totals-box"><div class="summary-row"><span>Subtotal</span><span>${formatPrice(o.subtotal)}</span></div>
      <div class="summary-row"><span>Tax</span><span>${formatPrice(o.tax)}</span></div><div class="summary-row"><span>Delivery</span><span>${formatPrice(o.deliveryCharge)}</span></div>
      <div class="summary-row total"><span>Total</span><span>${formatPrice(o.totalAmount)}</span></div></div>
    <div class="modal-actions"><button class="btn btn-outline" type="button" id="adm-invoice">Invoice</button><button class="btn btn-primary" type="button" data-modal-close>Close</button></div>`, { title: 'Order details', size: 'lg' });
  modal.querySelector('#adm-invoice').addEventListener('click', () => openPrintWindow(generateInvoiceHTML(o)));
});

/* -------------------------------- Import -------------------------------- */
$('import-notice').classList.toggle('hidden', isFirebaseConfigured);
$('import-btn').addEventListener('click', async () => {
  const btn = $('import-btn');
  if (isFirebaseConfigured && !(await confirmDialog('Import the sample catalogue into Firestore? Books with the same ID will be overwritten.'))) return;
  btn.disabled = true;
  $('import-text').textContent = 'Starting…';
  try {
    const { total } = await importBooksFromJson(({ done, total: t }) => {
      const pct = Math.round((done / t) * 100);
      $('import-bar').style.width = `${pct}%`;
      document.querySelector('#panel-import .progress').setAttribute('aria-valuenow', String(pct));
      $('import-text').textContent = `Imported ${done} of ${t} books (${pct}%)`;
    });
    showToast(`Imported ${total} books.`, 'success');
    await loadBooks();
    refreshStats();
  } catch (err) {
    $('import-text').textContent = 'Import did not run.';
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

await loadBooks();
refreshStats();
