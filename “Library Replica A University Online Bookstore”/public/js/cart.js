// Shopping cart (no DOM). Firestore carts/{uid} when logged in + configured, else localStorage "lr_cart".
import { CONFIG } from './config.js';
import { isFirebaseConfigured, fb, db, friendlyError } from './firebase-config.js';
import { onAuthChange, getCurrentUser, whenAuthReady } from './auth.js';
import { getAllBooks, getBookById } from './books.js';

const KEY = 'lr_cart';
let items = null;       // in-memory copy for the current storage context
let cacheUid;           // uid the in-memory copy belongs to (null = local storage)

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function readLocal() {
  try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : []; } catch { return []; }
}

/** Keep only valid entries and merge duplicates. */
function sanitize(list) {
  const map = new Map();
  (Array.isArray(list) ? list : []).forEach((it) => {
    const q = Math.floor(Number(it?.quantity));
    if (typeof it?.bookId === 'string' && q >= 1) map.set(it.bookId, (map.get(it.bookId) || 0) + q);
  });
  return [...map].map(([bookId, quantity]) => ({ bookId, quantity }));
}

function notify() {
  const count = (items || []).reduce((s, i) => s + i.quantity, 0);
  window.dispatchEvent(new CustomEvent('lr:cart-changed', { detail: { count } }));
}

async function load() {
  await whenAuthReady();
  const user = getCurrentUser();
  const uid = isFirebaseConfigured && user ? user.uid : null;
  if (items && cacheUid === uid) return items;
  if (uid) {
    try {
      const snap = await fb.fs.getDoc(fb.fs.doc(db, 'carts', uid));
      items = sanitize(snap.exists() ? snap.data().items : []);
    } catch (err) {
      throw new Error(friendlyError(err, 'Could not load your cart.'));
    }
  } else {
    items = sanitize(readLocal());
  }
  cacheUid = uid;
  return items;
}

async function persist(next, silent = false) {
  items = sanitize(next);
  if (cacheUid) {
    try { await fb.fs.setDoc(fb.fs.doc(db, 'carts', cacheUid), { items }); }
    catch (err) { items = null; throw new Error(friendlyError(err, 'Could not save your cart.')); }
  } else {
    localStorage.setItem(KEY, JSON.stringify(items));
  }
  if (!silent) notify();
}

// On login (Firebase mode) merge the guest cart into the user's cart without duplicates.
let lastUid;
onAuthChange(async (user) => {
  const uid = user ? user.uid : null;
  if (uid === lastUid) return;
  lastUid = uid;
  items = null;
  cacheUid = undefined;
  if (isFirebaseConfigured && user) {
    try {
      const local = sanitize(readLocal());
      if (local.length) {
        const remote = await load();
        const books = await getAllBooks().catch(() => []);
        const merged = new Map(remote.map((i) => [i.bookId, i.quantity]));
        local.forEach((i) => merged.set(i.bookId, (merged.get(i.bookId) || 0) + i.quantity));
        const next = [...merged].map(([bookId, quantity]) => {
          const book = books.find((b) => b.bookId === bookId);
          return { bookId, quantity: book ? Math.min(quantity, book.stock) : quantity };
        }).filter((i) => i.quantity >= 1);
        await persist(next, true);
        localStorage.removeItem(KEY);
      }
    } catch (err) {
      console.warn('Cart merge skipped', err);
    }
  }
  notify();
});

/** Raw cart: [{bookId, quantity}] */
export async function getCart() {
  return [...(await load())];
}

/** Cart joined with book data: [{book, quantity, lineTotal}]. Missing / out-of-stock lines are pruned. */
export async function getCartDetailed() {
  const cart = await load();
  const books = await getAllBooks();
  const detailed = [];
  const cleaned = [];
  cart.forEach((it) => {
    const book = books.find((b) => b.bookId === it.bookId);
    if (!book || book.stock <= 0) return;
    const quantity = Math.min(it.quantity, book.stock);
    cleaned.push({ bookId: it.bookId, quantity });
    detailed.push({ book, quantity, lineTotal: round2(book.price * quantity) });
  });
  if (cleaned.length !== cart.length || cleaned.some((c, i) => c.quantity !== cart[i]?.quantity)) {
    await persist(cleaned, true);
  }
  return detailed;
}

/** Adds qty (default 1). Returns {quantity, capped}. Throws if unavailable. */
export async function addToCart(id, qty = 1) {
  const amount = Math.floor(Number(qty));
  if (!(amount >= 1)) throw new Error('Quantity must be at least 1.');
  const book = await getBookById(id);
  if (!book) throw new Error('This book could not be found.');
  if (book.stock <= 0) throw new Error('Sorry, this book is out of stock.');
  const cart = [...(await load())];
  const existing = cart.find((i) => i.bookId === id);
  const current = existing ? existing.quantity : 0;
  if (current >= book.stock) throw new Error(`You already have all ${book.stock} available copies in your cart.`);
  const quantity = Math.min(current + amount, book.stock);
  if (existing) existing.quantity = quantity; else cart.push({ bookId: id, quantity });
  await persist(cart);
  return { quantity, capped: current + amount > book.stock };
}

/** Sets a quantity (capped at stock). Quantity <= 0 removes the line. Returns the final quantity. */
export async function updateQuantity(id, qty) {
  const wanted = Math.floor(Number(qty));
  if (!Number.isFinite(wanted) || wanted <= 0) { await removeFromCart(id); return 0; }
  const book = await getBookById(id);
  if (!book) throw new Error('This book could not be found.');
  const quantity = Math.min(wanted, book.stock);
  const cart = [...(await load())];
  const line = cart.find((i) => i.bookId === id);
  if (!line) throw new Error('That book is not in your cart.');
  line.quantity = quantity;
  await persist(cart);
  return quantity;
}

export async function removeFromCart(id) {
  const cart = await load();
  await persist(cart.filter((i) => i.bookId !== id));
}

export async function clearCart() {
  await load();
  await persist([]);
}

/** Total number of copies in the cart. */
export async function getCartCount() {
  return (await load()).reduce((s, i) => s + i.quantity, 0);
}

/** Totals from detailed items: {subtotal, tax, deliveryCharge, totalAmount}. */
export function calculateTotals(detailedItems) {
  const subtotal = round2((detailedItems || []).reduce((s, i) => s + i.lineTotal, 0));
  const tax = round2(subtotal * CONFIG.TAX_RATE);
  const deliveryCharge = subtotal === 0 || subtotal >= CONFIG.FREE_DELIVERY_ABOVE ? 0 : CONFIG.DELIVERY_CHARGE;
  return { subtotal, tax, deliveryCharge, totalAmount: round2(subtotal + tax + deliveryCharge) };
}
