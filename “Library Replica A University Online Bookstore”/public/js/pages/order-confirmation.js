import { initLayout, showToast, escapeHTML, formatPrice, formatDate, getQueryParam, statusBadge, openPrintWindow } from '../main.js';
import { requireAuth } from '../auth.js';
import { getOrderById, generateInvoiceHTML, paymentLabel } from '../orders.js';
import { CONFIG } from '../config.js';

await initLayout();
await requireAuth();

const root = document.getElementById('confirm-root');
const id = getQueryParam('id');

let order = null;
try {
  if (!id) throw new Error('No order was specified.');
  order = await getOrderById(id);
} catch (err) {
  root.innerHTML = `<div class="empty-state"><i class="fa-solid fa-lock" aria-hidden="true"></i><h3>Order unavailable</h3><p>${escapeHTML(err.message)}</p>
    <a class="btn btn-primary" href="order-history.html">Go to my orders</a></div>`;
  showToast(err.message, 'error');
}

if (order) {
  document.title = `Order ${order.orderId} | LibraryReplica`;
  const simulated = order.paymentMethod !== 'COD';
  root.innerHTML = `
    <div class="confirm-hero"><div class="tick"><i class="fa-solid fa-check" aria-hidden="true"></i></div>
      <h1>Thank you, ${escapeHTML(order.customer.fullName.split(' ')[0])}!</h1>
      <p class="text-muted">Your order has been placed. Order ID: <span class="order-id">${escapeHTML(order.orderId)}</span></p></div>
    <div class="sim-banner" role="note">${simulated ? 'SIMULATED PAYMENT: no real money was processed' : 'SIMULATED ORDER (Cash on Delivery): no real order or delivery exists'}
      <small>LibraryReplica is an academic demo. Nothing will be shipped or charged.</small></div>
    <div class="info-grid">
      <div class="card"><h2>Order</h2><p><strong>Placed:</strong> ${escapeHTML(formatDate(order.createdAt))}</p><p><strong>Status:</strong> ${statusBadge(order.orderStatus)}</p></div>
      <div class="card"><h2>Payment</h2><p>${escapeHTML(paymentLabel(order.paymentMethod))}</p><p>${statusBadge(order.paymentStatus)}</p></div>
      <div class="card"><h2>Customer</h2><p>${escapeHTML(order.customer.fullName)}</p><p class="text-muted">${escapeHTML(order.customer.email)}<br>ID: ${escapeHTML(order.customer.studentId)} · ${escapeHTML(order.customer.phone)}</p></div>
      <div class="card"><h2>Delivery address</h2><p style="white-space:pre-line">${escapeHTML(order.customer.address)}</p></div>
    </div>
    <div class="card" style="overflow-x:auto">
      <table class="order-table"><thead><tr><th>Book</th><th class="r">Price</th><th class="r">Qty</th><th class="r">Amount</th></tr></thead><tbody>
        ${order.items.map((it) => `<tr><td><a href="book-details.html?id=${encodeURIComponent(it.bookId)}">${escapeHTML(it.title)}</a><br><small class="text-muted">${escapeHTML(it.author)}</small></td>
          <td class="r">${formatPrice(it.price)}</td><td class="r">${it.quantity}</td><td class="r">${formatPrice(it.price * it.quantity)}</td></tr>`).join('')}
      </tbody></table>
      <div class="totals-box">
        <div class="summary-row"><span>Subtotal</span><span>${formatPrice(order.subtotal)}</span></div>
        <div class="summary-row"><span>Tax (${Math.round(CONFIG.TAX_RATE * 100)}%)</span><span>${formatPrice(order.tax)}</span></div>
        <div class="summary-row"><span>Delivery</span><span>${order.deliveryCharge ? formatPrice(order.deliveryCharge) : 'Free'}</span></div>
        <div class="summary-row total"><span>Total</span><span>${formatPrice(order.totalAmount)}</span></div>
      </div>
    </div>
    <div class="confirm-actions">
      <button class="btn btn-secondary" id="invoice-btn" type="button"><i class="fa-solid fa-file-invoice" aria-hidden="true"></i> Download Invoice</button>
      <a class="btn btn-primary" href="books.html">Continue Shopping</a>
      <a class="btn btn-outline" href="order-history.html">My Orders</a>
    </div>`;
  document.getElementById('invoice-btn').addEventListener('click', () => openPrintWindow(generateInvoiceHTML(order)));
}
