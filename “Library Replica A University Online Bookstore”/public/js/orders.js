// Orders + invoice (no DOM). Firestore orders/{orderId} when configured, else localStorage "lr_orders".
// PAYMENTS ARE SIMULATED: no card data or real money is ever handled.
import { CONFIG } from './config.js';
import { isFirebaseConfigured, fb, db, friendlyError } from './firebase-config.js';
import { getCurrentUser, whenAuthReady } from './auth.js';
import { getAllBooks, clearBooksCache, setDemoStock } from './books.js';
import { getCartDetailed, calculateTotals, clearCart } from './cart.js';

const KEY = 'lr_orders';
export const ORDER_STATUSES = ['Placed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
export const PAYMENT_METHODS = ['COD', 'UPI_SIMULATED', 'CARD_SIMULATED'];
const PAYMENT_LABELS = { COD: 'Cash on Delivery', UPI_SIMULATED: 'UPI (simulated)', CARD_SIMULATED: 'Card (simulated)' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Human readable payment label (extra helper). */
export function paymentLabel(method) { return PAYMENT_LABELS[method] || method; }

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function readLocal() {
  try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : []; } catch { return []; }
}

function makeOrderId() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  const bytes = new Uint8Array(6);
  (window.crypto || { getRandomValues: (a) => a.map(() => Math.floor(Math.random() * 256)) }).getRandomValues(bytes);
  bytes.forEach((b) => { suffix += alphabet[b % alphabet.length]; });
  return `LR-${ymd}-${suffix}`;
}

async function requireUser() {
  await whenAuthReady();
  const user = getCurrentUser();
  if (!user) throw new Error('Please log in to continue.');
  return user;
}

function validateCustomer(c) {
  const customer = {
    fullName: String(c?.fullName || '').trim(), email: String(c?.email || '').trim(), studentId: String(c?.studentId || '').trim(),
    phone: String(c?.phone || '').trim(), address: String(c?.address || '').trim()
  };
  if (!customer.fullName) throw new Error('Please enter your full name.');
  if (!EMAIL_RE.test(customer.email)) throw new Error('Please enter a valid email address.');
  if (!customer.studentId) throw new Error('Please enter your student ID.');
  if (!/^\d{10}$/.test(customer.phone)) throw new Error('Contact number must be exactly 10 digits.');
  if (customer.address.length < 8) throw new Error('Please enter your full delivery address.');
  return customer;
}

/** Builds totals from order lines using the same rules as the cart. */
function totalsFor(lines) {
  return calculateTotals(lines.map((l) => ({ lineTotal: round2(l.price * l.quantity) })));
}

/**
 * Validates, re-checks stock, saves the order and reduces stock (one Firestore transaction),
 * then clears the cart. Returns the Order.
 */
export async function createOrder({ customer, paymentMethod } = {}) {
  const user = await requireUser();
  const cleanCustomer = validateCustomer(customer);
  if (!PAYMENT_METHODS.includes(paymentMethod)) throw new Error('Please choose a payment method.');
  const detailed = await getCartDetailed();
  if (!detailed.length) throw new Error('Your cart is empty.');
  const wanted = detailed.map((d) => ({ bookId: d.book.bookId, quantity: d.quantity }));
  const orderId = makeOrderId();
  const base = {
    orderId, userId: user.uid, customer: cleanCustomer, paymentMethod,
    paymentStatus: paymentMethod === 'COD' ? 'Pending' : 'Simulated-Paid', orderStatus: 'Placed', createdAt: new Date().toISOString()
  };
  const makeLines = (books) => wanted.map((w) => {
    const b = books.get(w.bookId);
    if (!b) throw new Error('A book in your cart is no longer available. Please review your cart.');
    if (b.stock < w.quantity) throw new Error(b.stock > 0 ? `Only ${b.stock} cop${b.stock === 1 ? 'y' : 'ies'} of "${b.title}" left. Please update your cart.` : `"${b.title}" just went out of stock. Please update your cart.`);
    return { bookId: w.bookId, title: b.title, author: b.author, price: b.price, quantity: w.quantity, coverImage: b.coverImage || null };
  });

  let order;
  try {
    if (isFirebaseConfigured) {
      order = await fb.fs.runTransaction(db, async (tx) => {
        const refs = wanted.map((w) => fb.fs.doc(db, 'books', w.bookId));
        const snaps = await Promise.all(refs.map((r) => tx.get(r)));
        const live = new Map();
        snaps.forEach((s, i) => { if (s.exists()) live.set(wanted[i].bookId, { ...s.data(), bookId: wanted[i].bookId }); });
        const items = makeLines(live);
        const totals = totalsFor(items);
        items.forEach((it, i) => tx.update(refs[i], { stock: live.get(it.bookId).stock - it.quantity }));
        const o = { ...base, items, ...totals };
        tx.set(fb.fs.doc(db, 'orders', orderId), o);
        return o;
      });
    } else {
      clearBooksCache();
      const books = new Map((await getAllBooks()).map((b) => [b.bookId, b]));
      const items = makeLines(books);
      const totals = totalsFor(items);
      items.forEach((it) => setDemoStock(it.bookId, books.get(it.bookId).stock - it.quantity));
      order = { ...base, items, ...totals };
      localStorage.setItem(KEY, JSON.stringify([order, ...readLocal()]));
    }
  } catch (err) {
    throw new Error(friendlyError(err, 'Could not place your order. Please try again.'));
  }
  clearBooksCache(); // stock changed: force a fresh catalogue read
  try { await clearCart(); } catch (err) { console.warn('Order saved but the cart could not be cleared', err); }
  return order;
}

const byNewest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);

export async function getMyOrders() {
  const user = await requireUser();
  if (!isFirebaseConfigured) return readLocal().filter((o) => o.userId === user.uid).sort(byNewest);
  try {
    const q = fb.fs.query(fb.fs.collection(db, 'orders'), fb.fs.where('userId', '==', user.uid));
    return (await fb.fs.getDocs(q)).docs.map((d) => d.data()).sort(byNewest);
  } catch (err) {
    throw new Error(friendlyError(err, 'Could not load your orders.'));
  }
}

/** Owner or admin only. */
export async function getOrderById(id) {
  const user = await requireUser();
  let order = null;
  if (!isFirebaseConfigured) {
    order = readLocal().find((o) => o.orderId === id) || null;
  } else {
    try {
      const snap = await fb.fs.getDoc(fb.fs.doc(db, 'orders', id));
      order = snap.exists() ? snap.data() : null;
    } catch (err) {
      throw new Error(friendlyError(err, 'Could not load this order.'));
    }
  }
  if (!order) throw new Error('Order not found.');
  if (order.userId !== user.uid && user.role !== 'admin') throw new Error('You do not have access to this order.');
  return order;
}

export async function getAllOrders() {
  const user = await requireUser();
  if (user.role !== 'admin') throw new Error('Only administrators can view all orders.');
  if (!isFirebaseConfigured) return readLocal().sort(byNewest);
  try {
    return (await fb.fs.getDocs(fb.fs.collection(db, 'orders'))).docs.map((d) => d.data()).sort(byNewest);
  } catch (err) {
    throw new Error(friendlyError(err, 'Could not load orders.'));
  }
}

export async function updateOrderStatus(id, status) {
  const user = await requireUser();
  if (user.role !== 'admin') throw new Error('Only administrators can update orders.');
  if (!ORDER_STATUSES.includes(status)) throw new Error('Invalid order status.');
  if (!isFirebaseConfigured) {
    const list = readLocal();
    const idx = list.findIndex((o) => o.orderId === id);
    if (idx < 0) throw new Error('Order not found.');
    list[idx] = { ...list[idx], orderStatus: status };
    localStorage.setItem(KEY, JSON.stringify(list));
    return list[idx];
  }
  try {
    await fb.fs.updateDoc(fb.fs.doc(db, 'orders', id), { orderStatus: status });
    return { orderId: id, orderStatus: status };
  } catch (err) {
    throw new Error(friendlyError(err, 'Could not update the order.'));
  }
}

/* ------------------------------- Invoice --------------------------------- */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => CONFIG.CURRENCY_SYMBOL + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Self-contained printable invoice document (synchronous). */
export function generateInvoiceHTML(order) {
  const simulated = order.paymentMethod !== 'COD';
  const rows = order.items.map((it, i) => `<tr><td>${i + 1}</td><td>${esc(it.title)}<br><small>${esc(it.author)}</small></td>
    <td class="r">${money(it.price)}</td><td class="r">${esc(it.quantity)}</td><td class="r">${money(it.price * it.quantity)}</td></tr>`).join('');
  const date = new Date(order.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Invoice ${esc(order.orderId)} - ${esc(CONFIG.APP_NAME)}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;color:#122033;margin:0;padding:32px;background:#fff}
.wrap{max-width:780px;margin:0 auto}
header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #C9A227;padding-bottom:16px;margin-bottom:20px}
h1{margin:0;font-size:26px;color:#0B1F3A} h1 span{color:#C9A227} h2{font-size:15px;margin:0 0 6px;color:#0B1F3A}
.meta{text-align:right;font-size:13px;line-height:1.6}
.cols{display:flex;gap:32px;margin-bottom:20px;font-size:13px;line-height:1.6}.cols>div{flex:1}
table{width:100%;border-collapse:collapse;font-size:13px}
th{background:#0B1F3A;color:#fff;text-align:left;padding:8px}td{padding:8px;border-bottom:1px solid #e2e8f0;vertical-align:top}
.r{text-align:right} small{color:#5B6B82}
.totals{margin-left:auto;width:290px;margin-top:16px;font-size:14px}.totals div{display:flex;justify-content:space-between;padding:4px 0}
.totals .grand{border-top:2px solid #0B1F3A;font-weight:700;font-size:16px;margin-top:6px;padding-top:8px}
.sim{margin-top:20px;padding:10px 14px;border:2px dashed #D64545;color:#D64545;font-weight:700;text-align:center;border-radius:6px;font-size:13px}
.note{margin-top:18px;font-size:11px;color:#5B6B82;line-height:1.5}
@media print{body{padding:0}}
</style></head><body><div class="wrap">
<header><div><h1>Library<span>Replica</span></h1><div style="font-size:12px;color:#5B6B82">Your Academic World, One Book Away.</div></div>
<div class="meta"><strong>INVOICE</strong><br>Order ID: ${esc(order.orderId)}<br>Date: ${esc(date)}<br>Status: ${esc(order.orderStatus)}</div></header>
<div class="cols"><div><h2>Billed to</h2>${esc(order.customer.fullName)}<br>Student ID: ${esc(order.customer.studentId)}<br>${esc(order.customer.email)}<br>Phone: ${esc(order.customer.phone)}</div>
<div><h2>Delivery address</h2>${esc(order.customer.address).replace(/\n/g, '<br>')}</div>
<div><h2>Payment</h2>${esc(paymentLabel(order.paymentMethod))}<br>Payment status: ${esc(order.paymentStatus)}</div></div>
<table><thead><tr><th>#</th><th>Book</th><th class="r">Price</th><th class="r">Qty</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
<div class="totals"><div><span>Subtotal</span><span>${money(order.subtotal)}</span></div>
<div><span>Tax (${Math.round(CONFIG.TAX_RATE * 100)}%)</span><span>${money(order.tax)}</span></div>
<div><span>Delivery</span><span>${order.deliveryCharge ? money(order.deliveryCharge) : 'Free'}</span></div>
<div class="grand"><span>Total</span><span>${money(order.totalAmount)}</span></div></div>
${simulated ? '<div class="sim">SIMULATED PAYMENT: no real money was processed</div>' : '<div class="sim">SIMULATED ORDER (Cash on Delivery): no real order or delivery exists</div>'}
<p class="note">This document was generated by LibraryReplica, an independent academic project that is not affiliated with Jain University. Catalogue entries are sample data. This is not a tax invoice. Use your browser's Print dialog to print or save as PDF.</p>
</div></body></html>`;
}
