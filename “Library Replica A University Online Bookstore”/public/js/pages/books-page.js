import { initLayout, showToast, escapeHTML, debounce, renderPagination } from '../main.js';
import { getAllBooks, getDepartments } from '../books.js';
import { filterBooks, sortBooks, paginate, getFacets, SORT_KEYS } from '../search.js';
import { createBookCardElement, renderSkeletonCards } from '../bookcard.js';
import { getWishlistIds } from '../wishlist.js';
import { CONFIG } from '../config.js';

await initLayout();

const $ = (id) => document.getElementById(id);
const grid = $('books-grid');
const departments = getDepartments();
renderSkeletonCards(grid, 8);

/* ---------------------------- URL <-> state ----------------------------- */
const toNum = (v) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

function readState() {
  const p = new URLSearchParams(window.location.search);
  const sort = p.get('sort');
  return {
    dept: p.get('dept') || '', spec: p.get('spec') || '', q: p.get('q') || '',
    sort: SORT_KEYS.includes(sort) ? sort : 'relevance', page: Math.max(1, parseInt(p.get('page'), 10) || 1),
    min: toNum(p.get('min')), max: toNum(p.get('max')), authors: p.getAll('author'), pubs: p.getAll('pub'),
    rating: toNum(p.get('rating')) || 0, avail: ['in', 'out'].includes(p.get('avail')) ? p.get('avail') : 'all'
  };
}

/** Keep the address bar in sync with the filters (defaults are omitted). */
function writeState() {
  const p = new URLSearchParams();
  if (state.dept) p.set('dept', state.dept);
  if (state.spec) p.set('spec', state.spec);
  if (state.q) p.set('q', state.q);
  if (state.sort !== 'relevance') p.set('sort', state.sort);
  if (state.page > 1) p.set('page', String(state.page));
  if (state.min !== null) p.set('min', String(state.min));
  if (state.max !== null) p.set('max', String(state.max));
  state.authors.forEach((a) => p.append('author', a));
  state.pubs.forEach((a) => p.append('pub', a));
  if (state.rating) p.set('rating', String(state.rating));
  if (state.avail !== 'all') p.set('avail', state.avail);
  const qs = p.toString();
  window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
}

const state = readState();
let books = [];
try {
  books = await getAllBooks();
} catch (err) {
  showToast(err.message, 'error');
  grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><h3>Could not load the catalogue</h3><p>Please check your connection and refresh the page.</p></div>';
  throw err;
}
const wishlistIds = await getWishlistIds().catch(() => []);

/* ------------------------------ Controls -------------------------------- */
$('f-dept').innerHTML = '<option value="">All departments</option>' + departments.map((d) => `<option value="${d.slug}">${escapeHTML(d.name)}</option>`).join('');

function fillSpecs() {
  const dept = departments.find((d) => d.slug === state.dept);
  const sel = $('f-spec');
  if (dept && dept.specializations.length) {
    sel.disabled = false;
    sel.innerHTML = '<option value="">All specializations</option>' + dept.specializations.map((s) => `<option value="${s.slug}">${escapeHTML(s.name)}</option>`).join('');
  } else {
    sel.disabled = true;
    sel.innerHTML = `<option value="">${dept ? 'No specializations' : 'Choose a department first'}</option>`;
    state.spec = '';
  }
}

const facets = getFacets(books);
const checkbox = (name, value, count, checked) => `<label class="checkbox-row"><input type="checkbox" data-facet="${name}" value="${escapeHTML(value)}" ${checked ? 'checked' : ''}> ${escapeHTML(value)} <span class="text-muted">(${count})</span></label>`;
$('f-authors').innerHTML = facets.authors.map((a) => checkbox('authors', a.name, a.count, state.authors.includes(a.name))).join('');
$('f-pubs').innerHTML = facets.publishers.map((a) => checkbox('pubs', a.name, a.count, state.pubs.includes(a.name))).join('');

function syncControls() {
  $('f-dept').value = state.dept;
  fillSpecs();
  $('f-spec').value = state.spec;
  $('f-min').value = state.min ?? '';
  $('f-max').value = state.max ?? '';
  $('f-sort').value = state.sort;
  $('books-q').value = state.q;
  document.querySelectorAll('[data-facet]').forEach((c) => { c.checked = state[c.dataset.facet].includes(c.value); });
  document.querySelector(`input[name="rating"][value="${state.rating}"]`)?.setAttribute('checked', '');
  document.querySelectorAll('input[name="rating"]').forEach((r) => { r.checked = Number(r.value) === state.rating; });
  document.querySelectorAll('input[name="avail"]').forEach((r) => { r.checked = r.value === state.avail; });
  const navInput = document.getElementById('nav-search-input');
  if (navInput && state.q) navInput.value = state.q;
}

/* ------------------------------- Render --------------------------------- */
function renderHeading() {
  const dept = departments.find((d) => d.slug === state.dept);
  const spec = dept?.specializations.find((s) => s.slug === state.spec);
  $('page-title').textContent = state.q ? `Results for “${state.q}”` : (spec ? spec.name : dept ? dept.name : 'All Books');
  document.title = `${spec ? spec.name : dept ? dept.name : 'Books'} | LibraryReplica`;
  const crumbs = ['<li><a href="index.html">Home</a></li>'];
  if (dept) {
    crumbs.push('<li><a href="departments.html">Departments</a></li>');
    crumbs.push(spec ? `<li><a href="books.html?dept=${dept.slug}">${escapeHTML(dept.name)}</a></li><li aria-current="page">${escapeHTML(spec.name)}</li>` : `<li aria-current="page">${escapeHTML(dept.name)}</li>`);
  } else {
    crumbs.push('<li aria-current="page">Books</li>');
  }
  $('breadcrumb').innerHTML = crumbs.join('');
}

function render() {
  const filtered = filterBooks(books, {
    q: state.q, dept: state.dept, spec: state.spec, minPrice: state.min ?? undefined, maxPrice: state.max ?? undefined,
    authors: state.authors, publishers: state.pubs, minRating: state.rating, availability: state.avail
  });
  const sorted = sortBooks(filtered, state.sort);
  const pageData = paginate(sorted, state.page, CONFIG.PAGE_SIZE);
  state.page = pageData.page;
  renderHeading();
  $('result-count').textContent = `${pageData.total.toLocaleString('en-IN')} book${pageData.total === 1 ? '' : 's'} found`;
  grid.innerHTML = '';
  if (!pageData.total) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class="fa-solid fa-book-open" aria-hidden="true"></i><h3>No results found</h3>
      <p>Try different keywords or remove some filters.</p><button class="btn btn-primary" type="button" id="empty-clear">Clear Filters</button></div>`;
    $('empty-clear').addEventListener('click', clearAll);
  } else {
    pageData.items.forEach((b) => grid.appendChild(createBookCardElement(b, { wishlistIds })));
  }
  renderPagination($('pagination'), pageData.page, pageData.totalPages, (p) => {
    state.page = p;
    update(false);
    $('main-content').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  writeState();
}

/** Re-render after a state change; resetPage=true for filter changes. */
function update(resetPage = true) {
  if (resetPage) state.page = 1;
  render();
}

function clearAll() {
  Object.assign(state, { dept: '', spec: '', q: '', sort: 'relevance', page: 1, min: null, max: null, authors: [], pubs: [], rating: 0, avail: 'all' });
  const navInput = document.getElementById('nav-search-input');
  if (navInput) navInput.value = '';
  syncControls();
  update();
}

/* ------------------------------- Events --------------------------------- */
$('f-dept').addEventListener('change', (e) => { state.dept = e.target.value; state.spec = ''; fillSpecs(); update(); });
$('f-spec').addEventListener('change', (e) => { state.spec = e.target.value; update(); });
const onPrice = debounce(() => { state.min = toNum($('f-min').value); state.max = toNum($('f-max').value); update(); }, 350);
$('f-min').addEventListener('input', onPrice);
$('f-max').addEventListener('input', onPrice);
document.querySelectorAll('[data-facet]').forEach((c) => c.addEventListener('change', () => {
  state[c.dataset.facet] = [...document.querySelectorAll(`[data-facet="${c.dataset.facet}"]:checked`)].map((x) => x.value);
  update();
}));
document.querySelectorAll('input[name="rating"]').forEach((r) => r.addEventListener('change', () => { state.rating = Number(r.value); update(); }));
document.querySelectorAll('input[name="avail"]').forEach((r) => r.addEventListener('change', () => { state.avail = r.value; update(); }));
$('f-sort').addEventListener('change', (e) => { state.sort = e.target.value; update(); });
$('books-q').addEventListener('input', debounce((e) => { state.q = e.target.value.trim(); update(); }, 300));
$('clear-filters').addEventListener('click', clearAll);
$('filter-toggle').addEventListener('click', (e) => {
  const open = $('filters').classList.toggle('open');
  e.currentTarget.setAttribute('aria-expanded', String(open));
});

syncControls();
render();
