import { initLayout, showToast, escapeHTML } from '../main.js';
import { getDepartments, getDepartmentCounts } from '../books.js';

await initLayout();

const grid = document.getElementById('dept-grid');

let counts = {};
try {
  counts = await getDepartmentCounts();
} catch (err) {
  showToast(err.message, 'error');
}

grid.innerHTML = getDepartments().map((d) => {
  const total = counts[d.slug] || 0;
  const specs = d.specializations.length
    ? `<button class="btn btn-outline btn-sm" type="button" data-toggle="${d.slug}" aria-expanded="false" aria-controls="specs-${d.slug}">Show ${d.specializations.length} specializations <i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button>
       <ul class="spec-list hidden" id="specs-${d.slug}">
         ${d.specializations.map((s) => `<li><a href="books.html?dept=${d.slug}&spec=${s.slug}"><span>${escapeHTML(s.name)}</span><small>${counts[`${d.slug}/${s.slug}`] || 0} books</small></a></li>`).join('')}
       </ul>`
    : '';
  return `<article class="card card-hover dept-tile ${d.specializations.length ? 'has-specs' : ''}">
    <a class="dept-main" href="books.html?dept=${d.slug}" aria-label="${escapeHTML(d.name)}: ${total} books">
      <div class="dept-icon"><i class="fa-solid ${d.icon}" aria-hidden="true"></i></div>
      <h2>${escapeHTML(d.name)}</h2>
      <span class="count">${total.toLocaleString('en-IN')} books</span>
    </a>${specs}</article>`;
}).join('');

grid.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-toggle]');
  if (!btn) return;
  const list = document.getElementById(`specs-${btn.dataset.toggle}`);
  const open = list.classList.toggle('hidden') === false;
  btn.setAttribute('aria-expanded', String(open));
  btn.querySelector('i').className = open ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
  btn.firstChild.textContent = open ? 'Hide specializations ' : `Show ${list.children.length} specializations `;
});
