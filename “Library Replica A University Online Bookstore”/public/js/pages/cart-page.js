import { initLayout, showToast, escapeHTML, formatPrice, confirmDialog, getQueryParam } from '../main.js';
import { getCartDetailed, updateQuantity, removeFromCart, clearCart, calculateTotals } from '../cart.js';
import { bookCoverHTML, detailsUrl } from '../bookcard.js';
import { getCurrentUser, whenAuthReady } from '../auth.js';
import { CONFIG } from '../config.js';

await initLayout();

if (getQueryParam('notice') === 'empty-checkout') showToast('Your cart is empty. Add some books before checking out.', 'warning');

const root = document.getElementById('cart-root');
const clearBtn = document.getElementById('clear-cart');

const EMPTY_SVG = `<svg viewBox="0 0 220 170" role="img" aria-label="Empty shopping cart illustration" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="110" cy="152" rx="80" ry="9" fill="currentColor" opacity=".08"/>
  <path d="M30 28h28l16 80h92l14-56H66" fill="none" stroke="#C9A227" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="92" cy="130" r="10" fill="#13315C"/><circle cx="160" cy="130" r="10" fill="#13315C"/>
  <rect x="86" y="62" width="14" height="38" rx="2" fill="#2F6FED" opacity=".85"/><rect x="104" y="54" width="14" height="46" rx="2" fill="#C9A227"/>
  <rect x="122" y="66" width="14" height="34" rx="2" fill="#13315C"/><rect x="140" y="58" width="14" height="42" rx="2" fill="#E0B93B"/>
</svg>`;

async function render() {
  let items;
  try {
    items = await getCartDetailed();
  } catch (err) {
    showToast(err.message, 'error');
    root.innerHTML = '<div class="empty-state"><h3>Could not load your cart</h3><p>Please refresh the page and try again.</p></div>';
    return;
  }
  clearBtn.classList.toggle('hidden', !items.length);
  if (!items.length) {
    root.innerHTML = `<div class="empty-state empty-cart">${EMPTY_SVG}<h3>Your cart is empty</h3><p>Looks like you have not added any books yet.</p>
      <a class="btn btn-primary" href="books.html">Continue Shopping</a></div>`;
    return;
  }
  const totals = calculateTotals(items);
  const toFree = CONFIG.FREE_DELIVERY_ABOVE - totals.subtotal;
  root.innerHTML = `<div class="cart-layout">
    <section class="cart-list" aria-label="Cart items">
      ${items.map(({ book, quantity, lineTotal }) => `
        <article class="card cart-item" data-id="${escapeHTML(book.bookId)}">
          <div class="cart-thumb">${bookCoverHTML(book)}</div>
          <div class="cart-info">
            <h2><a href="${detailsUrl(book)}">${escapeHTML(book.title)}</a></h2>
            <div class="by">${escapeHTML(book.author)}</div>
            <div class="unit">${formatPrice(book.price)} each${book.stock <= 5 ? ` · <span class="badge badge-warning">Only ${book.stock} left</span>` : ''}</div>
          </div>
          <div class="cart-side">
            <div class="qty-ctrl" role="group" aria-label="Quantity for ${escapeHTML(book.title)}">
              <button type="button" data-act="dec" aria-label="Decrease quantity">−</button>
              <input type="number" min="1" max="${book.stock}" value="${quantity}" data-act="qty" aria-label="Quantity">
              <button type="button" data-act="inc" aria-label="Increase quantity" ${quantity >= book.stock ? 'disabled' : ''}>+</button>
            </div>
            <div class="line-total">${formatPrice(lineTotal)}</div>
            <button class="link-danger" type="button" data-act="remove"><i class="fa-regular fa-trash-can" aria-hidden="true"></i> Remove</button>
          </div>
        </article>`).join('')}
    </section>
    <aside class="card summary" aria-label="Order summary">
      <h2>Order summary</h2>
      <div class="summary-row"><span>Subtotal</span><span>${formatPrice(totals.subtotal)}</span></div>
      <div class="summary-row"><span>Tax (${Math.round(CONFIG.TAX_RATE * 100)}%)</span><span>${formatPrice(totals.tax)}</span></div>
      <div class="summary-row"><span>Delivery</span><span>${totals.deliveryCharge ? formatPrice(totals.deliveryCharge) : 'Free'}</span></div>
      ${totals.deliveryCharge ? `<div class="ship-note">Add ${formatPrice(toFree)} more for free delivery.</div>` : '<div class="free-note"><i class="fa-solid fa-truck-fast" aria-hidden="true"></i> You get free delivery!</div>'}
      <div class="summary-row total"><span>Total</span><span>${formatPrice(totals.totalAmount)}</span></div>
      <a class="btn btn-primary btn-block" id="checkout-link" href="checkout.html">Proceed to Checkout</a>
      <a class="btn btn-outline btn-block" href="books.html">Continue Shopping</a>
      <p class="form-hint mt-1" id="login-note"></p>
    </aside></div>`;
  const note = document.getElementById('login-note');
  await whenAuthReady();
  note.textContent = getCurrentUser() ? 'Payments are simulated. No real money is processed.' : 'You will be asked to log in before checkout.';
}

root.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  const row = e.target.closest('.cart-item');
  if (!btn || !row || btn.dataset.act === 'qty') return;
  const id = row.dataset.id;
  const input = row.querySelector('input[data-act="qty"]');
  try {
    if (btn.dataset.act === 'remove') { await removeFromCart(id); showToast('Removed from your cart.', 'info'); }
    else if (btn.dataset.act === 'inc') await updateQuantity(id, Number(input.value) + 1);
    else if (btn.dataset.act === 'dec') await updateQuantity(id, Number(input.value) - 1);
  } catch (err) {
    showToast(err.message, 'error');
  }
  await render();
});

root.addEventListener('change', async (e) => {
  if (e.target.dataset.act !== 'qty') return;
  const row = e.target.closest('.cart-item');
  const wanted = Math.floor(Number(e.target.value));
  try {
    const final = await updateQuantity(row.dataset.id, wanted);
    if (final > 0 && final < wanted) showToast(`Only ${final} cop${final === 1 ? 'y is' : 'ies are'} available.`, 'warning');
  } catch (err) {
    showToast(err.message, 'error');
  }
  await render();
});

clearBtn.addEventListener('click', async () => {
  if (!(await confirmDialog('Remove every book from your cart?'))) return;
  try {
    await clearCart();
    showToast('Your cart is now empty.', 'info');
  } catch (err) {
    showToast(err.message, 'error');
  }
  await render();
});

await render();
