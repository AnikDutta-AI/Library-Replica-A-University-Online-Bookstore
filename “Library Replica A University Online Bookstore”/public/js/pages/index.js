import { initLayout, showToast, escapeHTML, initReveal } from '../main.js';
await initLayout();

import { getAllBooks, getDepartments, getDepartmentCounts, getCategories } from '../books.js';
import { createBookCardElement, renderSkeletonCards } from '../bookcard.js';
import { getWishlistIds } from '../wishlist.js';

const popularBox = document.getElementById('popular-books');
const deptBox = document.getElementById('home-departments');
const featuredBox = document.getElementById('featured-categories');

renderSkeletonCards(popularBox, 4);

try {
  const [books, counts] = await Promise.all([getAllBooks(), getDepartmentCounts()]);
  document.getElementById('stat-books').textContent = books.length.toLocaleString('en-IN');

  // Popular books
  const wishlistIds = await getWishlistIds().catch(() => []);
  const popular = [...books].filter((b) => b.stock > 0).sort((a, b) => b.popularity - a.popularity || b.rating - a.rating).slice(0, 8);
  popularBox.innerHTML = '';
  if (!popular.length) popularBox.innerHTML = '<div class="empty-state"><h3>No books yet</h3><p>The catalogue is empty. An administrator can import the sample catalogue.</p></div>';
  popular.forEach((b) => popularBox.appendChild(createBookCardElement(b, { wishlistIds })));

  // Departments
  deptBox.innerHTML = getDepartments().map((d) => `
    <a class="card card-hover dept-card reveal" href="books.html?dept=${encodeURIComponent(d.slug)}">
      <div class="dept-icon"><i class="fa-solid ${d.icon}" aria-hidden="true"></i></div>
      <h3>${escapeHTML(d.name)}</h3>
      <span class="count">${(counts[d.slug] || 0).toLocaleString('en-IN')} books${d.specializations.length ? ` · ${d.specializations.length} specializations` : ''}</span>
    </a>`).join('');

  // Featured categories (all 16)
  featuredBox.innerHTML = getCategories().map((c) => {
    const href = `books.html?dept=${encodeURIComponent(c.slug)}${c.specSlug ? `&spec=${encodeURIComponent(c.specSlug)}` : ''}`;
    const n = counts[c.specSlug ? `${c.slug}/${c.specSlug}` : c.slug] || 0;
    return `<a class="chip" href="${href}">${escapeHTML(c.label)} <small>${n}</small></a>`;
  }).join('');
  initReveal();
} catch (err) {
  popularBox.innerHTML = '<div class="empty-state"><h3>Could not load books</h3><p>Please check your connection and refresh the page.</p></div>';
  showToast(err.message, 'error');
}
