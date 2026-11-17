// Catalogue data layer (no DOM). Firestore `books` when configured, else data/books.json.
// In demo mode, admin edits / stock changes live in localStorage as overrides on top of the JSON.
import { isFirebaseConfigured, fb, db, friendlyError } from './firebase-config.js';
import { getCurrentUser } from './auth.js';

const DEMO_BOOKS_KEY = 'lr_demo_books';
const RECENT_KEY = 'lr_recent';
const RECENT_MAX = 12;

/** Static taxonomy: 12 departments, CSE holds 5 specializations = 16 catalogue categories. */
const DEPARTMENTS = [
  { slug: 'cse', name: 'Computer Science & Engineering', short: 'CSE', icon: 'fa-laptop-code', specializations: [
    { slug: 'iot', name: 'Internet of Things' }, { slug: 'ds', name: 'Data Science' },
    { slug: 'ai', name: 'Artificial Intelligence' }, { slug: 'aids', name: 'AI & Data Science' },
    { slug: 'blockchain', name: 'Blockchain Technology' }] },
  { slug: 'mathematics', name: 'Mathematics', icon: 'fa-square-root-variable', specializations: [] },
  { slug: 'physics', name: 'Physics', icon: 'fa-atom', specializations: [] },
  { slug: 'eee', name: 'Electrical and Electronics Engineering', icon: 'fa-bolt', specializations: [] },
  { slug: 'civil', name: 'Civil Engineering', icon: 'fa-building', specializations: [] },
  { slug: 'mechanical', name: 'Mechanical Engineering', icon: 'fa-gears', specializations: [] },
  { slug: 'aerospace', name: 'Aerospace Engineering', icon: 'fa-rocket', specializations: [] },
  { slug: 'chemistry', name: 'Chemistry', icon: 'fa-flask', specializations: [] },
  { slug: 'biochemical', name: 'Biochemical Engineering', icon: 'fa-dna', specializations: [] },
  { slug: 'food-technology', name: 'Food Technology', icon: 'fa-wheat-awn', specializations: [] },
  { slug: 'ipe', name: 'Industrial & Production Engineering', icon: 'fa-industry', specializations: [] },
  { slug: 'textile', name: 'Textile Engineering', icon: 'fa-shirt', specializations: [] }
];

let cache = null;
let loading = null;

/* ------------------------------ Taxonomy -------------------------------- */

export function getDepartments() { return DEPARTMENTS; }

/** The 16 catalogue categories as a flat list (extra helper). label is stored on user profiles. */
export function getCategories() {
  const out = [];
  DEPARTMENTS.forEach((d) => {
    if (d.specializations.length) {
      d.specializations.forEach((s) => out.push({
        key: `${d.slug}-${s.slug}`, slug: d.slug, specSlug: s.slug, name: s.name, deptName: d.name,
        label: `${d.short} – ${s.name}`, icon: d.icon
      }));
    } else {
      out.push({ key: d.slug, slug: d.slug, specSlug: null, name: d.name, deptName: d.name, label: d.name, icon: d.icon });
    }
  });
  return out;
}

/* ------------------------------ Demo overrides --------------------------- */

function readOverrides() {
  try {
    const v = JSON.parse(localStorage.getItem(DEMO_BOOKS_KEY));
    return { upserts: v?.upserts || {}, deletes: v?.deletes || [] };
  } catch { return { upserts: {}, deletes: [] }; }
}
function writeOverrides(o) { localStorage.setItem(DEMO_BOOKS_KEY, JSON.stringify(o)); }

/** Demo-mode stock update used by checkout (extra helper). */
export function setDemoStock(bookId, stock) {
  const o = readOverrides();
  const base = (cache || []).find((b) => b.bookId === bookId) || o.upserts[bookId];
  if (!base) return;
  o.upserts[bookId] = { ...base, stock };
  writeOverrides(o);
  if (cache) cache = cache.map((b) => (b.bookId === bookId ? { ...b, stock } : b));
}

/** Drop the in-memory catalogue so the next read reloads it (extra helper). */
export function clearBooksCache() { cache = null; loading = null; }

/* ------------------------------ Loading ---------------------------------- */

function normalizeBook(raw) {
  return {
    bookId: raw.bookId, title: raw.title || 'Untitled', author: raw.author || 'Unknown', publisher: raw.publisher || '',
    edition: raw.edition || '', isbn: raw.isbn ?? null, department: raw.department, specialization: raw.specialization ?? null,
    departmentName: raw.departmentName || '', specializationName: raw.specializationName ?? null, subject: raw.subject || '',
    description: raw.description || '', price: Number(raw.price) || 0, originalPrice: Number(raw.originalPrice) || Number(raw.price) || 0,
    discountPercent: Number(raw.discountPercent) || 0, coverImage: raw.coverImage || null, previewPdf: raw.previewPdf || null,
    rating: Number(raw.rating) || 0, ratingCount: Number(raw.ratingCount) || 0, popularity: Number(raw.popularity) || 0,
    stock: Math.max(0, parseInt(raw.stock, 10) || 0), isSample: Boolean(raw.isSample), createdAt: raw.createdAt || new Date().toISOString()
  };
}

async function fetchJsonCatalogue() {
  const res = await fetch('data/books.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Could not load the sample catalogue (data/books.json).');
  const list = await res.json();
  if (!Array.isArray(list)) throw new Error('The sample catalogue file is not valid.');
  return list;
}

async function loadBooks() {
  try {
    if (isFirebaseConfigured) {
      const snap = await fb.fs.getDocs(fb.fs.collection(db, 'books'));
      return snap.docs.map((d) => normalizeBook({ ...d.data(), bookId: d.id }));
    }
    const list = await fetchJsonCatalogue();
    const o = readOverrides();
    const merged = list.filter((b) => !o.deletes.includes(b.bookId)).map((b) => o.upserts[b.bookId] || b);
    const known = new Set(list.map((b) => b.bookId));
    Object.values(o.upserts).forEach((b) => { if (!known.has(b.bookId) && !o.deletes.includes(b.bookId)) merged.push(b); });
    return merged.map(normalizeBook);
  } catch (err) {
    throw new Error(friendlyError(err, 'Could not load the book catalogue. Please try again.'));
  }
}

/** All books (cached in memory). */
export function getAllBooks() {
  if (cache) return Promise.resolve(cache);
  if (!loading) {
    loading = loadBooks().then((b) => { cache = b; return b; }).finally(() => { loading = null; });
  }
  return loading;
}

export async function getBookById(id) {
  const books = await getAllBooks();
  return books.find((b) => b.bookId === id) || null;
}

export async function getBooksByDepartment(deptSlug, specSlug) {
  const books = await getAllBooks();
  return books.filter((b) => b.department === deptSlug && (!specSlug || b.specialization === specSlug));
}

/** Counts keyed by department slug and by "dept/spec" for CSE specializations. */
export async function getDepartmentCounts() {
  const counts = {};
  (await getAllBooks()).forEach((b) => {
    counts[b.department] = (counts[b.department] || 0) + 1;
    if (b.specialization) counts[`${b.department}/${b.specialization}`] = (counts[`${b.department}/${b.specialization}`] || 0) + 1;
  });
  return counts;
}

/* ------------------------- Recently viewed / recommended ----------------- */

export function addToRecentlyViewed(id) {
  try {
    const ids = getRecentlyViewedIds().filter((x) => x !== id);
    ids.unshift(id);
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, RECENT_MAX)));
  } catch { /* storage unavailable: feature silently disabled */ }
}

export function getRecentlyViewedIds() {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY)); return Array.isArray(v) ? v : []; } catch { return []; }
}

/** Score by the student's department, recently viewed categories, rating and popularity. */
export async function getRecommendedBooks(user, limit = 8) {
  const books = await getAllBooks();
  const label = String(user?.department || '').toLowerCase();
  const recentIds = getRecentlyViewedIds();
  const recentCats = new Set(books.filter((b) => recentIds.includes(b.bookId)).map((b) => `${b.department}/${b.specialization || ''}`));
  const scored = books.filter((b) => !recentIds.includes(b.bookId)).map((b) => {
    let score = b.rating * 5 + b.popularity / 10 + (b.stock > 0 ? 5 : -20);
    if (label) {
      const specMatch = b.specializationName && label.includes(b.specializationName.toLowerCase());
      const deptMatch = !b.specializationName && label.includes(b.departmentName.toLowerCase());
      if (specMatch || deptMatch) score += 50;
      else if (label.includes(b.departmentName.toLowerCase())) score += 20;
    }
    if (recentCats.has(`${b.department}/${b.specialization || ''}`)) score += 30;
    return { b, score };
  });
  return scored.sort((x, y) => y.score - x.score).slice(0, limit).map((s) => s.b);
}

/* ------------------------------ Admin writes ----------------------------- */

function assertAdmin() {
  const u = getCurrentUser();
  if (!u || u.role !== 'admin') throw new Error('Only administrators can change the catalogue.');
}

/** Validates + derives fields, then upserts the book. Returns the saved book. */
export async function saveBook(book) {
  assertAdmin();
  const title = String(book?.title || '').trim();
  const author = String(book?.author || '').trim();
  const dept = DEPARTMENTS.find((d) => d.slug === book?.department);
  if (!title) throw new Error('Title is required.');
  if (!author) throw new Error('Author is required.');
  if (!dept) throw new Error('Please choose a department.');
  const spec = dept.specializations.find((s) => s.slug === book.specialization) || null;
  if (dept.specializations.length && !spec) throw new Error('Please choose a specialization for this department.');
  const price = Number(book.price);
  const stock = Number(book.stock);
  if (!Number.isFinite(price) || price < 0) throw new Error('Price must be a number of 0 or more.');
  if (!Number.isInteger(stock) || stock < 0) throw new Error('Stock must be a whole number of 0 or more.');
  const originalPrice = Number(book.originalPrice) >= price ? Number(book.originalPrice) : price;

  const all = await getAllBooks();
  let bookId = book.bookId;
  if (!bookId) {
    const key = spec ? `${dept.slug}-${spec.slug}` : dept.slug;
    const nums = all.filter((b) => b.bookId.startsWith(`${key}-`)).map((b) => parseInt(b.bookId.slice(key.length + 1), 10) || 0);
    bookId = `${key}-${String(Math.max(0, ...nums) + 1).padStart(3, '0')}`;
  }
  const existing = all.find((b) => b.bookId === bookId);
  const clean = normalizeBook({
    ...(existing || {}), ...book, bookId, title, author, department: dept.slug, departmentName: dept.name,
    specialization: spec ? spec.slug : null, specializationName: spec ? spec.name : null, price, originalPrice,
    discountPercent: originalPrice > price ? Math.round((1 - price / originalPrice) * 100) : 0, stock,
    createdAt: existing?.createdAt || new Date().toISOString()
  });
  if (isFirebaseConfigured) {
    try { await fb.fs.setDoc(fb.fs.doc(db, 'books', bookId), clean); } catch (err) { throw new Error(friendlyError(err, 'Could not save the book.')); }
  } else {
    const o = readOverrides();
    o.upserts[bookId] = clean;
    o.deletes = o.deletes.filter((x) => x !== bookId);
    writeOverrides(o);
  }
  cache = existing ? all.map((b) => (b.bookId === bookId ? clean : b)) : [...all, clean];
  return clean;
}

export async function deleteBook(id) {
  assertAdmin();
  if (isFirebaseConfigured) {
    try { await fb.fs.deleteDoc(fb.fs.doc(db, 'books', id)); } catch (err) { throw new Error(friendlyError(err, 'Could not delete the book.')); }
  } else {
    const o = readOverrides();
    delete o.upserts[id];
    if (!o.deletes.includes(id)) o.deletes.push(id);
    writeOverrides(o);
  }
  if (cache) cache = cache.filter((b) => b.bookId !== id);
}

/** Upload data/books.json to Firestore in batches of 500. onProgress({done,total}). */
export async function importBooksFromJson(onProgress) {
  assertAdmin();
  if (!isFirebaseConfigured) throw new Error('Importing needs Firebase. Demo mode already uses the sample catalogue directly.');
  const list = await fetchJsonCatalogue();
  const total = list.length;
  let done = 0;
  try {
    for (let i = 0; i < total; i += 500) {
      const batch = fb.fs.writeBatch(db);
      list.slice(i, i + 500).forEach((raw) => {
        const b = normalizeBook(raw);
        batch.set(fb.fs.doc(db, 'books', b.bookId), b);
      });
      await batch.commit();
      done = Math.min(i + 500, total);
      if (typeof onProgress === 'function') onProgress({ done, total });
    }
  } catch (err) {
    throw new Error(friendlyError(err, 'Import failed part-way. You can safely run it again.'));
  }
  clearBooksCache();
  return { done, total };
}
