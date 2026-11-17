// Wishlist (no DOM). Firestore wishlists/{uid} {bookIds:[]} when logged in + configured, else localStorage "lr_wishlist".
import { isFirebaseConfigured, fb, db, friendlyError } from './firebase-config.js';
import { onAuthChange, getCurrentUser, whenAuthReady } from './auth.js';
import { addToCart } from './cart.js';

const KEY = 'lr_wishlist';
let ids = null;
let cacheUid;

function readLocal() {
  try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
}
const unique = (list) => [...new Set(list)];
const notify = () => window.dispatchEvent(new CustomEvent('lr:wishlist-changed', { detail: { count: (ids || []).length } }));

async function load() {
  await whenAuthReady();
  const user = getCurrentUser();
  const uid = isFirebaseConfigured && user ? user.uid : null;
  if (ids && cacheUid === uid) return ids;
  if (uid) {
    try {
      const snap = await fb.fs.getDoc(fb.fs.doc(db, 'wishlists', uid));
      ids = unique(snap.exists() && Array.isArray(snap.data().bookIds) ? snap.data().bookIds : []);
    } catch (err) {
      throw new Error(friendlyError(err, 'Could not load your wishlist.'));
    }
  } else {
    ids = unique(readLocal());
  }
  cacheUid = uid;
  return ids;
}

async function persist(next, silent = false) {
  ids = unique(next);
  if (cacheUid) {
    try { await fb.fs.setDoc(fb.fs.doc(db, 'wishlists', cacheUid), { bookIds: ids }); }
    catch (err) { ids = null; throw new Error(friendlyError(err, 'Could not save your wishlist.')); }
  } else {
    localStorage.setItem(KEY, JSON.stringify(ids));
  }
  if (!silent) notify();
}

// Merge the guest wishlist into the account wishlist on login (Firebase mode).
let lastUid;
onAuthChange(async (user) => {
  const uid = user ? user.uid : null;
  if (uid === lastUid) return;
  lastUid = uid;
  ids = null;
  cacheUid = undefined;
  if (isFirebaseConfigured && user) {
    try {
      const local = readLocal();
      if (local.length) {
        const remote = await load();
        await persist([...remote, ...local], true);
        localStorage.removeItem(KEY);
      }
    } catch (err) {
      console.warn('Wishlist merge skipped', err);
    }
  }
  notify();
});

export async function getWishlistIds() {
  return [...(await load())];
}

export async function isInWishlist(id) {
  return (await load()).includes(id);
}

/** Adds or removes the book. Returns true when the book is now in the wishlist. */
export async function toggleWishlist(id) {
  const list = await load();
  if (list.includes(id)) {
    await persist(list.filter((x) => x !== id));
    return false;
  }
  await persist([...list, id]);
  return true;
}

/** Adds one copy to the cart, then removes the book from the wishlist. */
export async function moveWishlistToCart(id) {
  const result = await addToCart(id, 1); // throws (and keeps the wishlist item) if out of stock
  const list = await load();
  await persist(list.filter((x) => x !== id));
  return result;
}
