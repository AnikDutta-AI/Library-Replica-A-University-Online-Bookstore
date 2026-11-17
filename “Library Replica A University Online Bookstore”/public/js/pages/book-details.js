import { initLayout, showToast, escapeHTML, formatPrice, getQueryParam, getInitials } from '../main.js';
import { getBookById, getAllBooks, addToRecentlyViewed } from '../books.js';
import { createBookCardElement, bookCoverHTML, availabilityHTML, renderStars, openPdfPreview, addToCartWithToast, toggleWishlistWithToast } from '../bookcard.js';
import { getWishlistIds } from '../wishlist.js';

await initLayout();

const root = document.getElementById('details-root');
const id = getQueryParam('id');

function notFound(message) {
  root.innerHTML = `<div class="empty-state"><i class="fa-solid fa-book-skull" aria-hidden="true"></i><h3>Book not found</h3><p>${escapeHTML(message)}</p>
    <a class="btn btn-primary" href="books.html">Browse all books</a></div>`;
}

let book = null;
let loadFailed = false;
try {
  book = id ? await getBookById(id) : null;
} catch (err) {
  loadFailed = true;
  showToast(err.message, 'error');
  notFound('We could not load the catalogue right now.');
}

if (!book) {
  if (!loadFailed) notFound('This book does not exist or may have been removed.');
} else {
  addToRecentlyViewed(book.bookId);
  document.title = `${book.title} | LibraryReplica`;
  const inStock = book.stock > 0;
  const showDiscount = book.discountPercent > 0 && book.originalPrice > book.price;

  const crumbs = ['<li><a href="index.html">Home</a></li>', '<li><a href="departments.html">Departments</a></li>',
    `<li><a href="books.html?dept=${encodeURIComponent(book.department)}">${escapeHTML(book.departmentName)}</a></li>`];
  if (book.specialization) crumbs.push(`<li><a href="books.html?dept=${encodeURIComponent(book.department)}&spec=${encodeURIComponent(book.specialization)}">${escapeHTML(book.specializationName)}</a></li>`);
  crumbs.push(`<li aria-current="page">${escapeHTML(book.title)}</li>`);
  document.getElementById('breadcrumb').innerHTML = crumbs.join('');

  root.innerHTML = `<article class="details">
    <div><div class="details-cover">${bookCoverHTML(book)}</div></div>
    <div>
      <span class="sample-banner">Sample catalogue entry (not a real publication)</span>
      <h1 class="mt-1">${escapeHTML(book.title)}</h1>
      <p class="byline">by ${escapeHTML(book.author)} · ${escapeHTML(book.edition)}</p>
      <div class="rating-row">${renderStars(book.rating)} <span class="text-muted">${book.rating.toFixed(1)} · ${book.ratingCount.toLocaleString('en-IN')} ratings</span></div>
      <div class="big-price"><span>${formatPrice(book.price)}</span>
        ${showDiscount ? `<s class="orig">${formatPrice(book.originalPrice)}</s><span class="off">${book.discountPercent}% off</span>` : ''}</div>
      <p>${availabilityHTML(book)} ${inStock ? `<span class="text-muted">${book.stock} in stock</span>` : ''}</p>
      <p>${escapeHTML(book.description)}</p>
      <div class="details-actions">
        <label class="sr-only" for="qty">Quantity</label>
        <input class="input qty-input" id="qty" type="number" min="1" max="${Math.max(1, book.stock)}" value="1" ${inStock ? '' : 'disabled'}>
        <button class="btn btn-primary" id="add-cart" type="button" ${inStock ? '' : 'disabled'}><i class="fa-solid fa-cart-plus" aria-hidden="true"></i> ${inStock ? 'Add to Cart' : 'Out of stock'}</button>
        <button class="btn btn-outline" id="wish-btn" type="button" aria-pressed="false"><i class="fa-regular fa-heart" aria-hidden="true"></i> <span>Add to Wishlist</span></button>
        <button class="btn btn-outline" id="preview-btn" type="button"><i class="fa-regular fa-file-pdf" aria-hidden="true"></i> Preview PDF</button>
      </div>
      <table class="spec-table"><tbody>
        <tr><th scope="row">Publisher</th><td>${escapeHTML(book.publisher)}</td></tr>
        <tr><th scope="row">Edition</th><td>${escapeHTML(book.edition)}</td></tr>
        <tr><th scope="row">ISBN</th><td>${book.isbn ? escapeHTML(book.isbn) : 'Not assigned (sample entry)'}</td></tr>
        <tr><th scope="row">Department</th><td>${escapeHTML(book.departmentName)}</td></tr>
        ${book.specializationName ? `<tr><th scope="row">Specialization</th><td>${escapeHTML(book.specializationName)}</td></tr>` : ''}
        <tr><th scope="row">Subject</th><td>${escapeHTML(book.subject)}</td></tr>
        <tr><th scope="row">Book ID</th><td>${escapeHTML(book.bookId)}</td></tr>
      </tbody></table>
      <div class="card author-box"><div class="avatar" aria-hidden="true">${escapeHTML(getInitials(book.author))}</div>
        <div><strong>About the author</strong><p class="text-muted" style="margin:0">${escapeHTML(book.author)} is a placeholder author profile used in this demo catalogue. No real person is represented.</p></div></div>
    </div></article>`;

  document.getElementById('add-cart').addEventListener('click', async () => {
    const qty = Math.floor(Number(document.getElementById('qty').value));
    if (!(qty >= 1)) { showToast('Please enter a quantity of at least 1.', 'warning'); return; }
    await addToCartWithToast(book, qty);
  });
  document.getElementById('preview-btn').addEventListener('click', () => openPdfPreview(book));

  const wishBtn = document.getElementById('wish-btn');
  const setWish = (on) => {
    wishBtn.setAttribute('aria-pressed', String(on));
    wishBtn.querySelector('i').className = on ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
    wishBtn.querySelector('span').textContent = on ? 'In your Wishlist' : 'Add to Wishlist';
  };
  getWishlistIds().then((ids) => setWish(ids.includes(book.bookId))).catch(() => {});
  wishBtn.addEventListener('click', async () => {
    const on = await toggleWishlistWithToast(book);
    if (on !== null) setWish(on);
  });

  // Related books: same specialization first, then same department.
  try {
    const all = await getAllBooks();
    const related = [
      ...all.filter((b) => b.bookId !== book.bookId && b.department === book.department && b.specialization === book.specialization),
      ...all.filter((b) => b.bookId !== book.bookId && b.department === book.department && b.specialization !== book.specialization)
    ].sort((a, b) => b.popularity - a.popularity).slice(0, 4);
    if (related.length) {
      const wishlistIds = await getWishlistIds().catch(() => []);
      const box = document.getElementById('related-books');
      related.forEach((b) => box.appendChild(createBookCardElement(b, { wishlistIds })));
      document.getElementById('related-section').hidden = false;
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}
