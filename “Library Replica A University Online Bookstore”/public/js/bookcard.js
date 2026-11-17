// Book card (3D flip card) + PDF preview modal + small shared book UI helpers.
import { escapeHTML, formatPrice, showToast, openModal } from './main.js';
import { addToCart } from './cart.js';
import { toggleWishlist, getWishlistIds } from './wishlist.js';

const PLACEHOLDER = 'images/placeholder-cover.svg';
const DEPT_HUES = { cse: 0, mathematics: 40, physics: 70, eee: 120, civil: 160, mechanical: 200, aerospace: 230, chemistry: 270, biochemical: 300, 'food-technology': 330, ipe: 20, textile: 100 };

export const detailsUrl = (book) => `book-details.html?id=${encodeURIComponent(book.bookId)}`;

/** Star string like ★★★★☆ (extra helper). */
export function renderStars(rating) {
  const full = Math.round(Number(rating) || 0);
  return `<span class="stars" role="img" aria-label="Rated ${Number(rating).toFixed(1)} out of 5">${'★'.repeat(full)}${'☆'.repeat(5 - full)}</span>`;
}

/** Cover block. When there is no real cover the placeholder is tinted per department and the title is overlaid. */
export function bookCoverHTML(book) {
  const hasCover = Boolean(book.coverImage);
  const hue = DEPT_HUES[book.department] ?? 0;
  return `<div class="cover${hasCover ? '' : ' cover-generated'}"${hasCover ? '' : ` style="--hue:${hue}deg"`}>
    <img src="${escapeHTML(book.coverImage || PLACEHOLDER)}" alt="Cover of ${escapeHTML(book.title)}" loading="lazy">
    ${hasCover ? '' : `<span class="cover-title">${escapeHTML(book.title)}</span>`}</div>`;
}

/** Availability badge HTML (extra helper). */
export function availabilityHTML(book) {
  if (book.stock <= 0) return '<span class="badge badge-danger">Out of stock</span>';
  if (book.stock <= 5) return `<span class="badge badge-warning">Only ${book.stock} left</span>`;
  return '<span class="badge badge-success">In stock</span>';
}

/** Skeleton placeholders while data loads (extra helper). */
export function renderSkeletonCards(container, count = 8) {
  container.innerHTML = Array.from({ length: count }, () => '<div class="skeleton skeleton-card" aria-hidden="true"></div>').join('');
}

function syncHearts(ids, root = document) {
  root.querySelectorAll('[data-wish-id]').forEach((btn) => {
    const on = ids.includes(btn.dataset.wishId);
    btn.setAttribute('aria-pressed', String(on));
    btn.classList.toggle('is-on', on);
    const icon = btn.querySelector('i');
    if (icon) icon.className = on ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
  });
}
window.addEventListener('lr:wishlist-changed', () => { getWishlistIds().then(syncHearts).catch(() => {}); });

/** Modal viewer for the sample PDF, or a friendly message when there is none. */
export function openPdfPreview(book) {
  if (!book.previewPdf) {
    openModal(`<h3>${escapeHTML(book.title)}</h3><div class="empty-state"><i class="fa-regular fa-file-pdf" aria-hidden="true"></i>
      <h3>Preview not available</h3><p>No sample PDF has been published for this book yet.</p></div>
      <div class="modal-actions"><button class="btn btn-primary" type="button" data-modal-close>Close</button></div>`, { title: 'Preview not available' });
    return;
  }
  const src = escapeHTML(book.previewPdf);
  openModal(`<h3>${escapeHTML(book.title)} · Sample preview</h3>
    <iframe class="pdf-frame" src="${src}" title="PDF preview of ${escapeHTML(book.title)}"></iframe>
    <p class="form-hint mt-1">Can't see the preview? <a href="${src}" target="_blank" rel="noopener">Open the PDF in a new tab</a>.</p>
    <div class="modal-actions"><button class="btn btn-primary" type="button" data-modal-close>Close</button></div>`, { title: 'PDF preview', size: 'xl' });
}

/** Add-to-cart with user feedback (extra helper, shared by pages). */
export async function addToCartWithToast(book, qty = 1) {
  try {
    const { quantity, capped } = await addToCart(book.bookId, qty);
    if (capped) showToast(`Only ${book.stock} copies available. Cart quantity set to ${quantity}.`, 'warning');
    else showToast(`Added “${book.title}” to your cart.`, 'success');
    return true;
  } catch (err) {
    showToast(err.message, 'error');
    return false;
  }
}

/** Toggle wishlist with user feedback (extra helper, shared by pages). */
export async function toggleWishlistWithToast(book) {
  try {
    const on = await toggleWishlist(book.bookId);
    showToast(on ? 'Added to your wishlist.' : 'Removed from your wishlist.', on ? 'success' : 'info');
    return on;
  } catch (err) {
    showToast(err.message, 'error');
    return null;
  }
}

/**
 * Create a flip card. Works with mouse hover, touch tap and keyboard (flip buttons).
 * options: { wishlistIds?: string[] } to avoid a wishlist lookup per card.
 */
export function createBookCardElement(book, options = {}) {
  const el = document.createElement('article');
  el.className = 'book-card';
  el.dataset.bookId = book.bookId;
  const inStock = book.stock > 0;
  const title = escapeHTML(book.title);
  const category = escapeHTML(book.specializationName || book.departmentName);
  const showDiscount = book.discountPercent > 0 && book.originalPrice > book.price;

  el.innerHTML = `
    <div class="flip">
      <div class="flip-inner">
        <div class="flip-face flip-front">
          ${bookCoverHTML(book)}
          ${showDiscount ? `<span class="badge badge-gold card-discount">-${book.discountPercent}%</span>` : ''}
          ${!inStock ? '<span class="badge badge-danger card-stock">Out of stock</span>' : ''}
          <button class="flip-btn" type="button" aria-label="Show details for ${title}" aria-expanded="false"><i class="fa-solid fa-rotate" aria-hidden="true"></i></button>
          <div class="front-info"><h3 class="card-title">${title}</h3><div class="card-price">${formatPrice(book.price)}</div></div>
        </div>
        <div class="flip-face flip-back">
          <button class="flip-btn" type="button" aria-label="Back to cover of ${title}" aria-expanded="true"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i></button>
          <h3 class="card-title">${title}</h3>
          <dl class="back-facts">
            <div><dt>Author</dt><dd>${escapeHTML(book.author)}</dd></div>
            <div><dt>Edition</dt><dd>${escapeHTML(book.edition)}</dd></div>
            <div><dt>Department</dt><dd>${escapeHTML(book.departmentName)}</dd></div>
          </dl>
          <p class="back-desc">${escapeHTML(book.description)}</p>
          <div class="back-actions">
            <a class="btn btn-outline btn-sm" href="${detailsUrl(book)}">View Details</a>
            <button class="btn btn-primary btn-sm" type="button" data-act="cart" ${inStock ? '' : 'disabled'}><i class="fa-solid fa-cart-plus" aria-hidden="true"></i> Add to Cart</button>
          </div>
        </div>
      </div>
    </div>
    <div class="book-meta">
      <div class="meta-line">${escapeHTML(book.publisher)} · ${category}</div>
      <div class="price-row"><span class="price">${formatPrice(book.price)}</span>
        ${showDiscount ? `<s class="orig">${formatPrice(book.originalPrice)}</s><span class="off">${book.discountPercent}% off</span>` : ''}</div>
      <div class="rating-row">${renderStars(book.rating)} <span class="text-muted">${book.rating.toFixed(1)} (${book.ratingCount.toLocaleString('en-IN')})</span></div>
      <div class="avail-row">${availabilityHTML(book)}<span class="sample-note">Sample catalogue entry</span></div>
      <div class="card-actions">
        <a class="btn btn-outline btn-sm" href="${detailsUrl(book)}">View Details</a>
        <button class="btn btn-outline btn-sm" type="button" data-act="preview"><i class="fa-regular fa-file-pdf" aria-hidden="true"></i> Preview PDF</button>
        <button class="btn btn-primary btn-sm" type="button" data-act="cart" ${inStock ? '' : 'disabled'}><i class="fa-solid fa-cart-plus" aria-hidden="true"></i> ${inStock ? 'Add to Cart' : 'Unavailable'}</button>
        <button class="wish-btn" type="button" data-wish-id="${escapeHTML(book.bookId)}" aria-pressed="false" aria-label="Toggle wishlist for ${title}"><i class="fa-regular fa-heart" aria-hidden="true"></i></button>
      </div>
    </div>`;

  // Flip behaviour: hover (mouse only), tap (touch/pen), keyboard (flip buttons).
  const flip = el.querySelector('.flip');
  const front = el.querySelector('.flip-front');
  const back = el.querySelector('.flip-back');
  const setFlipped = (value) => {
    flip.classList.toggle('is-flipped', value);
    front.inert = value;
    back.inert = !value;
    front.setAttribute('aria-hidden', String(value));
    back.setAttribute('aria-hidden', String(!value));
  };
  setFlipped(false);
  el.querySelectorAll('.flip-btn').forEach((btn) => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const next = !flip.classList.contains('is-flipped');
    setFlipped(next);
    setTimeout(() => (next ? back : front).querySelector('.flip-btn')?.focus(), 50);
  }));
  flip.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') setFlipped(true); });
  flip.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') setFlipped(false); });
  flip.addEventListener('click', (e) => {
    if (e.target.closest('a,button')) return;
    if (e.pointerType === 'mouse') return; // hover already handles mouse users
    setFlipped(!flip.classList.contains('is-flipped'));
  });

  el.querySelectorAll('[data-act="cart"]').forEach((btn) => btn.addEventListener('click', () => addToCartWithToast(book, 1)));
  el.querySelector('[data-act="preview"]').addEventListener('click', () => openPdfPreview(book));
  el.querySelector('.wish-btn').addEventListener('click', () => toggleWishlistWithToast(book));

  if (options.wishlistIds) syncHearts(options.wishlistIds, el);
  else getWishlistIds().then((ids) => syncHearts(ids, el)).catch(() => {});
  return el;
}
