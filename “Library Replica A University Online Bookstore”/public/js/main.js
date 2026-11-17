// Shared UI helpers + layout (navbar, footer, theme, modal, toast).
// Every page script starts with: import { initLayout } from './main.js'; await initLayout();
import { CONFIG } from './config.js';
import { isFirebaseConfigured } from './firebase-config.js';
import { onAuthChange, logout } from './auth.js';
import { getCartCount } from './cart.js';
import { getWishlistIds } from './wishlist.js';
import { getAllBooks } from './books.js';
import { getSuggestions } from './search.js';

const THEME_KEY = 'lr_theme';

/* ------------------------------------------------------------------ */
/* Generic helpers                                                     */
/* ------------------------------------------------------------------ */

/** Escape text before inserting it into innerHTML. */
export function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 1299 -> "₹1,299.00" */
export function formatPrice(n) {
  const value = Number(n) || 0;
  return CONFIG.CURRENCY_SYMBOL + value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** ISO date -> "16 Nov 2025, 10:30 am" (extra helper). */
export function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** "Asha Rao" -> "AR" (extra helper). */
export function getInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function debounce(fn, ms = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** Show/clear a field error. Looks for [data-error-for="<field id>"] (extra helper). */
export function setFieldError(input, message = '') {
  const holder = document.querySelector(`[data-error-for="${input.id}"]`);
  if (holder) holder.textContent = message;
  input.classList.toggle('is-invalid', Boolean(message));
  if (message) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
}

/** Clear every field error inside a form (extra helper). */
export function clearFieldErrors(form) {
  form.querySelectorAll('.input').forEach((i) => setFieldError(i, ''));
}

/** Open a printable HTML document in a new window and print it (extra helper). */
export function openPrintWindow(html) {
  const w = window.open('', '_blank');
  if (!w) {
    showToast('Pop-up blocked. Please allow pop-ups to open the invoice.', 'warning');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 500);
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

/** types: success | error | info | warning */
export function showToast(message, type = 'info') {
  let box = document.getElementById('toast-container');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast-container';
    box.className = 'toast-container';
    document.body.appendChild(box);
  }
  const icons = { success: 'fa-circle-check', error: 'fa-circle-exclamation', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}" aria-hidden="true"></i><span>${escapeHTML(message)}</span><button class="toast-close" aria-label="Dismiss notification">&times;</button>`;
  const remove = () => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 300);
  };
  toast.querySelector('.toast-close').addEventListener('click', remove);
  box.appendChild(toast);
  setTimeout(remove, type === 'error' ? 6000 : 4000);
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

let modalState = null;

/**
 * Open a modal with trusted HTML. options: { title, size: 'sm'|'md'|'lg'|'xl', onClose }.
 * Returns the .modal element.
 */
export function openModal(html, options = {}) {
  closeModal();
  const { title = 'Dialog', size = 'md', onClose = null } = options;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal modal-${escapeHTML(size)}" role="dialog" aria-modal="true" aria-label="${escapeHTML(title)}">
    <button class="modal-close" type="button" aria-label="Close dialog" data-modal-close>&times;</button>
    <div class="modal-body">${html}</div></div>`;
  const onKey = (e) => {
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Tab') {
      const f = [...overlay.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,iframe,[tabindex]:not([tabindex="-1"])')];
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeModal(); });
  overlay.addEventListener('click', (e) => { if (e.target.closest('[data-modal-close]')) closeModal(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
  document.body.classList.add('modal-open');
  modalState = { overlay, onKey, onClose, lastFocus: document.activeElement };
  const modal = overlay.querySelector('.modal');
  const firstField = modal.querySelector('input:not([type=hidden]),select,textarea') || modal.querySelector('.btn-primary') || modal.querySelector('[data-modal-close]');
  setTimeout(() => firstField && firstField.focus(), 30);
  return modal;
}

export function closeModal() {
  if (!modalState) return;
  const { overlay, onKey, onClose, lastFocus } = modalState;
  modalState = null;
  document.removeEventListener('keydown', onKey);
  overlay.remove();
  document.body.classList.remove('modal-open');
  if (lastFocus && lastFocus.focus) lastFocus.focus();
  if (typeof onClose === 'function') onClose();
}

/** Promise<boolean> confirmation dialog. */
export function confirmDialog(message) {
  return new Promise((resolve) => {
    let answered = false;
    const modal = openModal(
      `<h3>Please confirm</h3><p>${escapeHTML(message)}</p>
       <div class="modal-actions"><button class="btn btn-outline" data-answer="no" type="button">Cancel</button>
       <button class="btn btn-danger" data-answer="yes" type="button">Confirm</button></div>`,
      { title: 'Confirm', size: 'sm', onClose: () => { if (!answered) resolve(false); } }
    );
    modal.querySelectorAll('[data-answer]').forEach((btn) => btn.addEventListener('click', () => {
      answered = true;
      resolve(btn.dataset.answer === 'yes');
      closeModal();
    }));
  });
}

/* ------------------------------------------------------------------ */
/* Theme                                                               */
/* ------------------------------------------------------------------ */

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.querySelector('#theme-toggle i');
  if (icon) icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
}

function getSavedTheme() {
  try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}

export function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, next); } catch { /* storage unavailable */ }
  applyTheme(next);
}

// Apply the saved theme as early as possible (module evaluation).
document.documentElement.setAttribute('data-theme', getSavedTheme());

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

const NAV_LINKS = [
  { href: 'index.html', label: 'Home' },
  { href: 'departments.html', label: 'Departments' },
  { href: 'books.html', label: 'Books' },
  { href: 'dashboard.html', label: 'Dashboard' }
];

const INFO_PAGES = {
  about: { title: 'About Us', body: '<p>LibraryReplica is an independent academic mini-project: a premium-feeling university online bookstore built to demonstrate full-stack web development with HTML, CSS, vanilla JavaScript and Firebase.</p><p>It is <strong>not</strong> officially affiliated with Jain University or any other institution. All books, authors, publishers and prices are sample data.</p>' },
  contact: { title: 'Contact', body: '<p>This is a student project, so there is no staffed help desk. For project questions, contact the project team through your course instructor or the project repository.</p><p>Demo e-mail (not monitored): <strong>hello@libraryreplica.demo</strong></p>' },
  privacy: { title: 'Privacy Policy', body: '<p>In demo mode, all data stays in your own browser (localStorage) and is never sent anywhere. When Firebase is configured, your profile, cart, wishlist and orders are stored in the project owner\'s Firebase project.</p><p>No real payment details are ever collected. Passwords are handled by Firebase Authentication and are never stored by this app.</p>' },
  terms: { title: 'Terms of Use', body: '<p>This site is a demonstration. Orders are <strong>simulated</strong>: no real money is processed and no physical books are shipped. Catalogue entries are sample data and do not describe real publications.</p><p>Use it for learning and evaluation only.</p>' }
};

function headerHTML() {
  const links = NAV_LINKS.map((l) => `<a href="${l.href}" data-nav="${l.href}">${l.label}</a>`).join('');
  return `<a class="skip-link" href="#main-content">Skip to main content</a>
  <header class="site-header"><div class="container nav-inner">
    <a class="brand" href="index.html" aria-label="LibraryReplica home"><img src="images/logo.svg" alt="" width="38" height="38"><span class="brand-text">Library<span>Replica</span></span></a>
    <nav id="primary-nav" class="nav-links" aria-label="Primary">${links}</nav>
    <form class="nav-search" id="nav-search-form" role="search" autocomplete="off">
      <label class="sr-only" for="nav-search-input">Search books</label>
      <input id="nav-search-input" class="input" type="search" placeholder="Search title, author, subject, ISBN…" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="nav-suggestions">
      <button class="nav-search-btn" type="submit" aria-label="Search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i></button>
      <ul id="nav-suggestions" class="suggestions hidden" role="listbox" aria-label="Search suggestions"></ul>
    </form>
    <div class="nav-actions">
      <span class="badge demo-badge hidden" id="demo-badge" title="Firebase is not configured. Data is stored in this browser only.">Demo Mode</span>
      <button id="theme-toggle" class="icon-btn" type="button" aria-label="Toggle dark mode"><i class="fa-solid fa-moon" aria-hidden="true"></i></button>
      <a class="icon-btn" href="wishlist.html" aria-label="Wishlist"><i class="fa-regular fa-heart" aria-hidden="true"></i><span class="count-badge" id="wishlist-count" data-count="0">0</span></a>
      <a class="icon-btn" href="cart.html" aria-label="Shopping cart"><i class="fa-solid fa-cart-shopping" aria-hidden="true"></i><span class="count-badge" id="cart-count" data-count="0">0</span></a>
      <div class="account" id="account-menu"></div>
      <button class="icon-btn nav-toggle" id="nav-toggle" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="primary-nav"><i class="fa-solid fa-bars" aria-hidden="true"></i></button>
    </div>
  </div></header>`;
}

function footerHTML() {
  return `<footer class="site-footer"><div class="container">
    <div class="footer-grid">
      <div><a class="brand" href="index.html"><img src="images/logo.svg" alt="" width="38" height="38"><span class="brand-text">Library<span>Replica</span></span></a>
        <p class="mt-2">Your Academic World, One Book Away.</p></div>
      <div><h4>Explore</h4><ul><li><a href="departments.html">Departments</a></li><li><a href="books.html">All Books</a></li><li><a href="wishlist.html">Wishlist</a></li><li><a href="cart.html">Cart</a></li></ul></div>
      <div><h4>Account</h4><ul><li><a href="login.html">Login</a></li><li><a href="signup.html">Sign Up</a></li><li><a href="order-history.html">Orders</a></li><li><a href="profile.html">Profile</a></li></ul></div>
      <div><h4>Company</h4><ul>
        <li><button class="link-btn" type="button" data-info="about">About Us</button></li>
        <li><button class="link-btn" type="button" data-info="contact">Contact</button></li>
        <li><button class="link-btn" type="button" data-info="privacy">Privacy Policy</button></li>
        <li><button class="link-btn" type="button" data-info="terms">Terms</button></li></ul></div>
    </div>
    <div class="footer-bottom"><p>© ${new Date().getFullYear()} LibraryReplica. LibraryReplica is an independent academic project.</p>
      <p>Not affiliated with Jain University. Sample catalogue · Simulated payments only.</p></div>
  </div></footer>
  <button class="back-to-top" id="back-to-top" type="button" aria-label="Back to top"><i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button>`;
}

function renderAccount(user) {
  const box = document.getElementById('account-menu');
  if (!box) return;
  const wasOpen = !box.querySelector('.dropdown')?.classList.contains('hidden') && box.querySelector('.dropdown');
  if (!user) {
    box.innerHTML = `<button class="account-btn logged-out" id="account-btn" type="button" aria-label="Account menu: Login or Sign Up" aria-haspopup="menu" aria-expanded="false"><i class="fa-regular fa-user" aria-hidden="true"></i><span class="account-label">Login / Sign Up</span></button>
      <div class="dropdown hidden" id="account-dropdown" role="menu">
        <a role="menuitem" href="login.html"><i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i> Login</a>
        <a role="menuitem" href="signup.html"><i class="fa-solid fa-user-plus" aria-hidden="true"></i> Sign Up</a></div>`;
  } else {
    const first = escapeHTML(String(user.fullName || 'Account').split(' ')[0]);
    box.innerHTML = `<button class="account-btn" id="account-btn" type="button" aria-label="Account menu" aria-haspopup="menu" aria-expanded="false"><i class="fa-regular fa-circle-user" aria-hidden="true"></i><span class="account-label">${first}</span></button>
      <div class="dropdown hidden" id="account-dropdown" role="menu">
        <div class="dd-head"><strong>${escapeHTML(user.fullName)}</strong><span>${escapeHTML(user.email)}</span></div>
        <a role="menuitem" href="dashboard.html"><i class="fa-solid fa-gauge" aria-hidden="true"></i> Dashboard</a>
        <a role="menuitem" href="profile.html"><i class="fa-regular fa-user" aria-hidden="true"></i> Profile</a>
        <a role="menuitem" href="order-history.html"><i class="fa-solid fa-box" aria-hidden="true"></i> Orders</a>
        ${user.role === 'admin' ? '<a role="menuitem" href="admin.html"><i class="fa-solid fa-user-shield" aria-hidden="true"></i> Admin</a>' : ''}
        <button role="menuitem" type="button" id="logout-btn"><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i> Logout</button></div>`;
    box.querySelector('#logout-btn').addEventListener('click', async () => {
      try {
        await logout();
        window.location.href = 'index.html';
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }
  const btn = box.querySelector('#account-btn');
  const dd = box.querySelector('#account-dropdown');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = dd.classList.toggle('hidden') === false;
    btn.setAttribute('aria-expanded', String(open));
  });
  if (wasOpen) { dd.classList.remove('hidden'); btn.setAttribute('aria-expanded', 'true'); }
}

async function updateCounts() {
  try {
    const [cart, wish] = await Promise.all([getCartCount(), getWishlistIds()]);
    for (const [id, n] of [['cart-count', cart], ['wishlist-count', wish.length]]) {
      const el = document.getElementById(id);
      if (el) { el.textContent = String(n); el.dataset.count = String(n); }
    }
  } catch { /* counters are cosmetic; failures are surfaced by the pages themselves */ }
}

function wireSearchBox() {
  const form = document.getElementById('nav-search-form');
  const input = document.getElementById('nav-search-input');
  const list = document.getElementById('nav-suggestions');
  if (!form) return;
  let items = [];
  let active = -1;
  const hide = () => { list.classList.add('hidden'); input.setAttribute('aria-expanded', 'false'); active = -1; };
  const setActive = (i) => {
    const links = list.querySelectorAll('a');
    links.forEach((a, idx) => a.setAttribute('aria-selected', String(idx === i)));
    active = i;
  };
  const render = async () => {
    const q = input.value.trim();
    if (q.length < 2) return hide();
    try {
      const books = await getAllBooks();
      items = getSuggestions(books, q, 6);
    } catch { return hide(); }
    if (!items.length) {
      list.innerHTML = `<li><a href="books.html?q=${encodeURIComponent(q)}"><span><span class="s-title">No quick matches</span><br><span class="s-sub">Search everything for “${escapeHTML(q)}”</span></span></a></li>`;
    } else {
      list.innerHTML = items.map((b) => `<li><a role="option" href="book-details.html?id=${encodeURIComponent(b.bookId)}">
        <img src="${escapeHTML(b.coverImage || 'images/placeholder-cover.svg')}" alt="" loading="lazy"><span><span class="s-title">${escapeHTML(b.title)}</span><br><span class="s-sub">${escapeHTML(b.author)} · ${escapeHTML(b.specializationName || b.departmentName)}</span></span></a></li>`).join('')
        + `<li><a href="books.html?q=${encodeURIComponent(q)}"><span class="s-title"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> See all results for “${escapeHTML(q)}”</span></a></li>`;
    }
    list.classList.remove('hidden');
    input.setAttribute('aria-expanded', 'true');
    active = -1;
  };
  input.addEventListener('input', debounce(render, 180));
  input.addEventListener('keydown', (e) => {
    const links = [...list.querySelectorAll('a')];
    if (e.key === 'ArrowDown' && links.length) { e.preventDefault(); setActive((active + 1) % links.length); }
    else if (e.key === 'ArrowUp' && links.length) { e.preventDefault(); setActive((active - 1 + links.length) % links.length); }
    else if (e.key === 'Enter' && active >= 0 && links[active]) { e.preventDefault(); window.location.href = links[active].href; }
    else if (e.key === 'Escape') hide();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    window.location.href = q ? `books.html?q=${encodeURIComponent(q)}` : 'books.html';
  });
  document.addEventListener('click', (e) => { if (!form.contains(e.target)) hide(); });
  const preset = getQueryParam('q');
  if (preset && /books\.html$/.test(window.location.pathname)) input.value = preset;
}

/** Fade-in elements with .reveal when they enter the viewport. */
export function initReveal() {
  const els = document.querySelectorAll('.reveal:not(.in-view)');
  if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('in-view')); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in-view'); io.unobserve(en.target); } });
  }, { threshold: 0.12 });
  els.forEach((el) => io.observe(el));
}

let layoutDone = false;

export async function initLayout() {
  if (layoutDone) return;
  layoutDone = true;
  applyTheme(getSavedTheme());

  // Global image fallback (replaces inline onerror handlers).
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (t && t.tagName === 'IMG' && !t.dataset.fallbackApplied) {
      t.dataset.fallbackApplied = '1';
      t.src = 'images/placeholder-cover.svg';
    }
  }, true);

  const header = document.getElementById('site-header');
  const footer = document.getElementById('site-footer');
  if (header) header.innerHTML = headerHTML();
  if (footer) footer.innerHTML = footerHTML();

  // Active link highlighting
  const file = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === file || (file === 'book-details.html' && a.dataset.nav === 'books.html')) a.classList.add('active');
  });

  document.getElementById('demo-badge')?.classList.toggle('hidden', isFirebaseConfigured);
  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
  applyTheme(document.documentElement.getAttribute('data-theme'));

  // Mobile menu
  const toggle = document.getElementById('nav-toggle');
  const nav = document.getElementById('primary-nav');
  toggle?.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    document.querySelector('.site-header')?.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });

  // Footer info dialogs + back-to-top
  document.querySelectorAll('[data-info]').forEach((btn) => btn.addEventListener('click', () => {
    const page = INFO_PAGES[btn.dataset.info];
    openModal(`<h2>${page.title}</h2>${page.body}<div class="modal-actions"><button class="btn btn-primary" data-modal-close type="button">Close</button></div>`, { title: page.title });
  }));
  const topBtn = document.getElementById('back-to-top');
  topBtn?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  window.addEventListener('scroll', () => topBtn?.classList.toggle('show', window.scrollY > 500), { passive: true });

  // Close account dropdown on outside click / Escape
  const closeDropdown = () => {
    document.getElementById('account-dropdown')?.classList.add('hidden');
    document.getElementById('account-btn')?.setAttribute('aria-expanded', 'false');
  };
  document.addEventListener('click', (e) => { if (!e.target.closest('#account-menu')) closeDropdown(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDropdown(); });

  wireSearchBox();
  renderAccount(null);
  onAuthChange((user) => { renderAccount(user); updateCounts(); });
  window.addEventListener('lr:cart-changed', updateCounts);
  window.addEventListener('lr:wishlist-changed', updateCounts);
  updateCounts();
  initReveal();

  if (getQueryParam('error') === 'admin_only') {
    showToast('That page is for administrators only.', 'error');
  }
}

/**
 * Render numbered pagination buttons into `container` (extra helper, shared by catalogue + admin).
 * onChange(newPage) is called when a button is pressed.
 */
export function renderPagination(container, page, totalPages, onChange) {
  container.innerHTML = '';
  if (totalPages <= 1) return;
  const add = (label, target, opts = {}) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = label;
    if (opts.label) b.setAttribute('aria-label', opts.label);
    if (opts.disabled) b.disabled = true;
    if (opts.current) b.setAttribute('aria-current', 'page');
    b.addEventListener('click', () => onChange(target));
    container.appendChild(b);
  };
  const dots = () => { const s = document.createElement('span'); s.textContent = '…'; s.className = 'text-muted'; s.style.padding = '0 .3rem'; container.appendChild(s); };
  add('<i class="fa-solid fa-chevron-left" aria-hidden="true"></i>', page - 1, { disabled: page <= 1, label: 'Previous page' });
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  let last = 0;
  [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b).forEach((p) => {
    if (p - last > 1) dots();
    add(String(p), p, { current: p === page, label: `Page ${p}` });
    last = p;
  });
  add('<i class="fa-solid fa-chevron-right" aria-hidden="true"></i>', page + 1, { disabled: page >= totalPages, label: 'Next page' });
}

/** HTML badge for an order status or payment status (extra helper). */
export function statusBadge(status) {
  const cls = { Placed: 'badge-info', Processing: 'badge-warning', Shipped: 'badge-gold', Delivered: 'badge-success', Cancelled: 'badge-danger', Pending: 'badge-warning', 'Simulated-Paid': 'badge-success' }[status] || '';
  return `<span class="badge ${cls}">${escapeHTML(status)}</span>`;
}
