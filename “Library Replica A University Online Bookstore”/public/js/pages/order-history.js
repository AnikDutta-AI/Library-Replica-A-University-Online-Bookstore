import { initLayout, showToast, escapeHTML, formatPrice, formatDate, statusBadge, openPrintWindow } from '../main.js';
import { requireAuth } from '../auth.js';
import { getMyOrders, generateInvoiceHTML, paymentLabel } from '../orders.js';

await initLayout();
await requireAuth();

const root = document.getElementById('orders-root');
let orders = [];
try {
  orders = await getMyOrders();
} catch (err) {
  showToast(err.message, 'error');
  root.innerHTML = '<div class="empty-state"><h3>Could not load your orders</h3><p>Please refresh the page and try again.</p></div>';
  throw err;
}

if (!orders.length) {
  root.innerHTML = `<div class="empty-state"><i class="fa-solid fa-box-open" aria-hidden="true"></i><h3>No orders yet</h3>
    <p>When you place an order it will show up here.</p><a class="btn btn-primary" href="books.html">Start shopping</a></div>`;
} else {
  root.innerHTML = orders.map((o) => `
    <details class="card order-card" data-id="${escapeHTML(o.orderId)}">
      <summary>
        <div><div class="oid">${escapeHTML(o.orderId)}</div><div class="odate">${escapeHTML(formatDate(o.createdAt))}</div></div>
        <div><strong>${formatPrice(o.totalAmount)}</strong><div class="odate">${o.items.reduce((s, i) => s + i.quantity, 0)} item(s) · ${escapeHTML(paymentLabel(o.paymentMethod))}</div></div>
        <div>${statusBadge(o.orderStatus)}</div>
        <i class="fa-solid fa-chevron-down chev" aria-hidden="true"></i>
      </summary>
      <div class="body">
        <table class="order-table"><thead><tr><th>Book</th><th class="r">Qty</th><th class="r">Amount</th></tr></thead><tbody>
          ${o.items.map((it) => `<tr><td><a href="book-details.html?id=${encodeURIComponent(it.bookId)}">${escapeHTML(it.title)}</a></td><td class="r">${it.quantity}</td><td class="r">${formatPrice(it.price * it.quantity)}</td></tr>`).join('')}
        </tbody></table>
        <div class="totals-box">
          <div class="summary-row"><span>Subtotal</span><span>${formatPrice(o.subtotal)}</span></div>
          <div class="summary-row"><span>Tax</span><span>${formatPrice(o.tax)}</span></div>
          <div class="summary-row"><span>Delivery</span><span>${o.deliveryCharge ? formatPrice(o.deliveryCharge) : 'Free'}</span></div>
          <div class="summary-row total"><span>Total</span><span>${formatPrice(o.totalAmount)}</span></div>
        </div>
        <div class="confirm-actions">
          <a class="btn btn-primary btn-sm" href="order-confirmation.html?id=${encodeURIComponent(o.orderId)}">View Details</a>
          <button class="btn btn-outline btn-sm" type="button" data-invoice="${escapeHTML(o.orderId)}"><i class="fa-solid fa-file-invoice" aria-hidden="true"></i> Invoice</button>
        </div>
      </div>
    </details>`).join('');
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-invoice]');
    if (!btn) return;
    const order = orders.find((o) => o.orderId === btn.dataset.invoice);
    if (order) openPrintWindow(generateInvoiceHTML(order));
  });
}
