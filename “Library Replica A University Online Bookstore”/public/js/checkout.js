import { initLayout, showToast, escapeHTML, formatPrice, setFieldError, clearFieldErrors } from './main.js';
import { requireAuth } from './auth.js';
import { getCartDetailed, calculateTotals } from './cart.js';
import { createOrder } from './orders.js';
import { bookCoverHTML } from './bookcard.js';
import { CONFIG } from './config.js';

await initLayout();
const user = await requireAuth();

const form = document.getElementById('checkout-form');
const summary = document.getElementById('summary');
const placeBtn = document.getElementById('place-order');
const $ = (id) => document.getElementById(id);
let submitting = false; // blocks double submission

async function loadItems() {
  try {
    return await getCartDetailed();
  } catch (err) {
    showToast(err.message, 'error');
    return [];
  }
}

let items = await loadItems();
if (!items.length) {
  window.location.replace('cart.html?notice=empty-checkout');
  await new Promise(() => {}); // stop here while the redirect happens
}

function renderSummary() {
  const totals = calculateTotals(items);
  summary.innerHTML = `<h2>Order summary</h2>
    <ul class="mini-items">${items.map(({ book, quantity, lineTotal }) => `<li>
      <div class="cart-thumb">${bookCoverHTML(book)}</div>
      <div><div class="t">${escapeHTML(book.title)}</div><div class="q">${formatPrice(book.price)} × ${quantity}</div></div>
      <strong>${formatPrice(lineTotal)}</strong></li>`).join('')}</ul>
    <div class="summary-row"><span>Subtotal</span><span>${formatPrice(totals.subtotal)}</span></div>
    <div class="summary-row"><span>Tax (${Math.round(CONFIG.TAX_RATE * 100)}%)</span><span>${formatPrice(totals.tax)}</span></div>
    <div class="summary-row"><span>Delivery</span><span>${totals.deliveryCharge ? formatPrice(totals.deliveryCharge) : 'Free'}</span></div>
    <div class="summary-row total"><span>Total</span><span>${formatPrice(totals.totalAmount)}</span></div>
    <a class="btn btn-outline btn-block mt-1" href="cart.html">Edit cart</a>`;
}
renderSummary();

// Prefill from the profile
$('fullName').value = user.fullName || '';
$('email').value = user.email || '';
$('studentId').value = user.studentId || '';

// Simulated-payment banner
const selected = () => form.querySelector('input[name="payment"]:checked').value;
form.querySelectorAll('input[name="payment"]').forEach((r) => r.addEventListener('change', () => {
  $('sim-banner').classList.toggle('hidden', selected() === 'COD');
}));
$('phone').addEventListener('input', () => { $('phone').value = $('phone').value.replace(/\D/g, '').slice(0, 10); });

function validate() {
  let ok = true;
  const fail = (id, msg) => { setFieldError($(id), msg); ok = false; };
  if (!$('fullName').value.trim()) fail('fullName', 'Please enter your full name.');
  const email = $('email').value.trim();
  if (!email) fail('email', 'Email is required.');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fail('email', 'Please enter a valid email address.');
  if (!$('studentId').value.trim()) fail('studentId', 'Please enter your student ID.');
  if (!$('phone').value.trim()) fail('phone', 'Contact number is required.');
  else if (!/^\d{10}$/.test($('phone').value.trim())) fail('phone', 'Enter a valid 10-digit contact number.');
  if (!$('address').value.trim()) fail('address', 'Delivery address is required.');
  else if ($('address').value.trim().length < 8) fail('address', 'Please enter your full delivery address.');
  return ok;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (submitting) return;
  clearFieldErrors(form);
  if (!validate()) {
    showToast('Please fix the highlighted fields.', 'error');
    form.querySelector('.is-invalid')?.focus();
    return;
  }
  submitting = true;
  placeBtn.disabled = true;
  placeBtn.textContent = 'Placing order…';
  try {
    const order = await createOrder({
      customer: { fullName: $('fullName').value, email: $('email').value, studentId: $('studentId').value, phone: $('phone').value, address: $('address').value },
      paymentMethod: selected()
    });
    window.location.href = `order-confirmation.html?id=${encodeURIComponent(order.orderId)}`;
  } catch (err) {
    showToast(err.message, 'error');
    submitting = false;
    placeBtn.disabled = false;
    placeBtn.textContent = 'Place Order';
    items = await loadItems(); // stock may have changed: refresh the summary
    if (!items.length) { window.location.replace('cart.html?notice=empty-checkout'); return; }
    renderSummary();
  }
});
