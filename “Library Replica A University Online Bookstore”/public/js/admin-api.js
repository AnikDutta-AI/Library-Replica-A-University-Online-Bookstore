// Admin-only data helpers (no DOM). Real protection lives in firestore.rules.
import { isFirebaseConfigured, fb, db, friendlyError } from './firebase-config.js';
import { getCurrentUser, listDemoUsers } from './auth.js';
import { getAllBooks } from './books.js';
import { getAllOrders } from './orders.js';

function assertAdmin() {
  const u = getCurrentUser();
  if (!u || u.role !== 'admin') throw new Error('Only administrators can do that.');
}

/** All user profiles (admin only). */
export async function listUsers() {
  assertAdmin();
  if (!isFirebaseConfigured) return listDemoUsers();
  try {
    const snap = await fb.fs.getDocs(fb.fs.collection(db, 'users'));
    return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  } catch (err) {
    throw new Error(friendlyError(err, 'Could not load users.'));
  }
}

/** Dashboard numbers. Sales exclude cancelled orders and are SIMULATED totals. */
export async function getAdminStats() {
  assertAdmin();
  const [books, users, orders] = await Promise.all([getAllBooks(), listUsers(), getAllOrders()]);
  return {
    totalBooks: books.length,
    totalCategories: 16,
    totalDepartments: 12,
    totalStudents: users.filter((u) => u.role === 'student').length,
    totalOrders: orders.length,
    totalSales: orders.filter((o) => o.orderStatus !== 'Cancelled').reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0)
  };
}
