import { initLayout, showToast, escapeHTML, formatPrice, statusBadge } from './main.js';
import { requireAuth } from './auth.js';
import { getAllBooks, getCategories, getRecommendedBooks, getRecentlyViewedIds } from './books.js';
import { getCartCount } from './cart.js';
import { getWishlistIds } from './wishlist.js';
import { getMyOrders } from './orders.js';
import { createBookCardElement, renderSkeletonCards, bookCoverHTML, detailsUrl } from './bookcard.js';

await initLayout();
const user = await requireAuth();

const $ = (id) => document.getElementById(id);
$('welcome-title').textContent = `Welcome back, ${user.fullName.split(' ')[0]}!`;
$('welcome-sub').textContent = user.department ? `${user.department}${user.semester ? ` · Semester ${user.semester}` : ''}` : 'What would you like to read today?';

$('dash-search').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $('dash-q').value.trim();
  window.location.href = q ? `books.html?q=${encodeURIComponent(q)}` : 'books.html';
});

const rows = ['row-recommended', 'row-recent', 'row-best', 'row-new', 'row-disc'];
rows.forEach((id) => renderSkeletonCards($(id), 4));

$('shortcuts').innerHTML = getCategories().map((c) => {
  const href = `books.html?dept=${encodeURIComponent(c.slug)}${c.specSlug ? `&spec=${encodeURIComponent(c.specSlug)}` : ''}`;
  return `<a class="chip" href="${href}">${escapeHTML(c.label)}</a>`;
}).join('');

function fillRow(id, list, emptyText, wishlistIds) {
  const box = $(id);
  box.innerHTML = '';
  if (!list.length) { box.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p style="margin:0">${escapeHTML(emptyText)}</p></div>`; return; }
  list.forEach((b) => box.appendChild(createBookCardElement(b, { wishlistIds })));
}

function miniList(books) {
  return `<ul class="mini-list">${books.map((b) => `<li><div class="cart-thumb">${bookCoverHTML(b)}</div>
    <div><div class="t"><a href="${detailsUrl(b)}">${escapeHTML(b.title)}</a></div><div class="s">${escapeHTML(b.author)}</div></div><strong>${formatPrice(b.price)}</strong></li>`).join('')}</ul>`;
}

try {
  const [books, wishlistIds] = await Promise.all([getAllBooks(), getWishlistIds()]);
  $('stat-books').textContent = books.length.toLocaleString('en-IN');
  $('stat-wish').textContent = String(wishlistIds.length);

  const recommended = await getRecommendedBooks(user, 4);
  fillRow('row-recommended', recommended, 'Recommendations will appear here once the catalogue is loaded.', wishlistIds);
  const recent = getRecentlyViewedIds().map((id) => books.find((b) => b.bookId === id)).filter(Boolean).slice(0, 4);
  fillRow('row-recent', recent, 'Books you open will show up here.', wishlistIds);
  const inStock = books.filter((b) => b.stock > 0);
  fillRow('row-best', [...inStock].sort((a, b) => b.popularity - a.popularity).slice(0, 4), 'No books available.', wishlistIds);
  fillRow('row-new', [...inStock].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 4), 'No books available.', wishlistIds);
  fillRow('row-disc', [...inStock].sort((a, b) => b.discountPercent - a.discountPercent || b.popularity - a.popularity).slice(0, 4), 'No discounted books right now.', wishlistIds);

  const wishBooks = wishlistIds.map((id) => books.find((b) => b.bookId === id)).filter(Boolean).slice(0, 4);
  $('wishlist-preview').innerHTML = wishBooks.length ? miniList(wishBooks) : '<div class="empty-state"><p style="margin:0">Your wishlist is empty. Tap the heart on a book to save it.</p></div>';
} catch (err) {
  showToast(err.message, 'error');
  rows.forEach((id) => { $(id).innerHTML = '<div class="empty-state" style="grid-column:1/-1"><p style="margin:0">Could not load books.</p></div>'; });
  $('wishlist-preview').innerHTML = '<div class="empty-state"><p style="margin:0">Could not load your wishlist.</p></div>';
}

try {
  const count = await getCartCount();
  $('stat-cart').textContent = String(count);
  $('cart-link-count').textContent = String(count);
} catch (err) {
  showToast(err.message, 'error');
}

try {
  const orders = await getMyOrders();
  $('stat-orders').textContent = String(orders.length);
  $('orders-preview').innerHTML = orders.length
    ? `<ul class="mini-list orders-list">${orders.slice(0, 3).map((o) => `<li><div><div class="t"><a href="order-confirmation.html?id=${encodeURIComponent(o.orderId)}">${escapeHTML(o.orderId)}</a></div>
        <div class="s">${o.items.length} title(s)</div></div><strong>${formatPrice(o.totalAmount)}</strong>${statusBadge(o.orderStatus)}</li>`).join('')}</ul>`
    : '<div class="empty-state"><p style="margin:0">No orders yet.</p></div>';
} catch (err) {
  showToast(err.message, 'error');
  $('stat-orders').textContent = '0';
  $('orders-preview').innerHTML = '<div class="empty-state"><p style="margin:0">Could not load your orders.</p></div>';
}
