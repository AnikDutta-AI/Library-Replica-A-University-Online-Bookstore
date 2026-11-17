import { initLayout, showToast, escapeHTML, formatPrice } from '../main.js';
import { getWishlistIds, toggleWishlist, moveWishlistToCart } from '../wishlist.js';
import { getAllBooks } from '../books.js';
import { bookCoverHTML, availabilityHTML, detailsUrl } from '../bookcard.js';

await initLayout();

const root = document.getElementById('wishlist-root');

async function render() {
  let books = [];
  try {
    const [ids, all] = await Promise.all([getWishlistIds(), getAllBooks()]);
    books = ids.map((id) => all.find((b) => b.bookId === id)).filter(Boolean);
  } catch (err) {
    showToast(err.message, 'error');
    root.innerHTML = '<div class="empty-state"><h3>Could not load your wishlist</h3><p>Please refresh the page and try again.</p></div>';
    return;
  }
  if (!books.length) {
    root.innerHTML = `<div class="empty-state"><i class="fa-regular fa-heart" aria-hidden="true"></i><h3>Your wishlist is empty</h3>
      <p>Tap the heart on any book to save it here for later.</p><a class="btn btn-primary" href="books.html">Browse books</a></div>`;
    return;
  }
  root.innerHTML = `<div class="wl-grid">${books.map((b) => `
    <article class="card wl-item" data-id="${escapeHTML(b.bookId)}">
      <div class="cart-thumb">${bookCoverHTML(b)}</div>
      <div>
        <h2><a href="${detailsUrl(b)}">${escapeHTML(b.title)}</a></h2>
        <div class="text-muted" style="font-size:.88rem">${escapeHTML(b.author)} · ${escapeHTML(b.specializationName || b.departmentName)}</div>
        <div class="wl-price">${formatPrice(b.price)} ${b.discountPercent > 0 ? `<span class="off">${b.discountPercent}% off</span>` : ''}</div>
        <div>${availabilityHTML(b)}</div>
        <div class="wl-actions">
          <button class="btn btn-primary btn-sm" type="button" data-act="move" ${b.stock > 0 ? '' : 'disabled'}><i class="fa-solid fa-cart-plus" aria-hidden="true"></i> Move to Cart</button>
          <a class="btn btn-outline btn-sm" href="${detailsUrl(b)}">View Details</a>
          <button class="btn btn-outline btn-sm" type="button" data-act="remove"><i class="fa-regular fa-trash-can" aria-hidden="true"></i> Remove</button>
        </div>
      </div>
    </article>`).join('')}</div>`;
}

root.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  const card = e.target.closest('.wl-item');
  if (!btn || !card) return;
  const id = card.dataset.id;
  try {
    if (btn.dataset.act === 'remove') {
      await toggleWishlist(id);
      showToast('Removed from your wishlist.', 'info');
    } else if (btn.dataset.act === 'move') {
      const { capped } = await moveWishlistToCart(id);
      showToast(capped ? 'Moved to your cart (limited by available stock).' : 'Moved to your cart.', capped ? 'warning' : 'success');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
  await render();
});

await render();
