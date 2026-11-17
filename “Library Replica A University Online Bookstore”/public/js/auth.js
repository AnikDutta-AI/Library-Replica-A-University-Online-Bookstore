// Authentication + user profiles.
// Firebase Auth + Firestore users/{uid} when configured, otherwise a clearly labelled
// localStorage DEMO (not real security). Never touches the DOM, never imports main.js.
import { isFirebaseConfigured, fb, auth, db, friendlyError } from './firebase-config.js';

export const DEMO_HINT = 'Demo mode (no Firebase configured). Student: student@libraryreplica.demo · Admin: admin@libraryreplica.demo · Password for both: Demo@1234. This is a localStorage demo, not real security.';

const DEMO_PASSWORD = 'Demo@1234';
const USERS_KEY = 'lr_demo_users';
const SESSION_KEY = 'lr_demo_session';
const EDITABLE_FIELDS = ['fullName', 'studentId', 'department', 'semester', 'photoURL']; // role/uid/email are never client-editable
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

let currentUser = null;
let registering = false;
let isReady = false;
let readyResolve;
const ready = new Promise((resolve) => { readyResolve = resolve; });
const listeners = new Set();

function emit() {
  listeners.forEach((cb) => {
    try { cb(currentUser); } catch (err) { console.error('Auth listener failed', err); }
  });
}

function setUser(user) {
  currentUser = user;
  if (!isReady) { isReady = true; readyResolve(); }
  emit();
}

/** Resolves once the first auth state is known (extra helper). */
export function whenAuthReady() { return ready; }

/** Subscribe to auth changes. cb(UserProfile|null). Returns an unsubscribe function. */
export function onAuthChange(cb) {
  listeners.add(cb);
  if (isReady) { try { cb(currentUser); } catch (err) { console.error('Auth listener failed', err); } }
  return () => listeners.delete(cb);
}

/** Synchronously returns the cached profile (null before auth is ready or when logged out). */
export function getCurrentUser() { return currentUser; }

/* ------------------------------ Demo store ------------------------------ */

function readJSON(storage, key, fallback) {
  try { const v = JSON.parse(storage.getItem(key)); return v ?? fallback; } catch { return fallback; }
}

/** Demo-only password digest. NOT real security; keeps the demo from storing raw passwords. */
async function demoDigest(email, password) {
  const text = `lr-demo:${email.toLowerCase()}:${password}`;
  if (window.crypto?.subtle) {
    const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return `weak-${h}`;
}

async function loadDemoUsers() {
  const users = readJSON(localStorage, USERS_KEY, []);
  const seeds = [
    { uid: 'demo-student', fullName: 'Demo Student', studentId: 'JU-DEMO-001', email: 'student@libraryreplica.demo', department: 'CSE – Data Science', semester: '3', role: 'student' },
    { uid: 'demo-admin', fullName: 'Demo Admin', studentId: 'JU-ADMIN-001', email: 'admin@libraryreplica.demo', department: 'Computer Science & Engineering', semester: '8', role: 'admin' }
  ];
  let changed = false;
  for (const seed of seeds) {
    if (!users.some((u) => u.email === seed.email)) {
      users.push({ ...seed, photoURL: null, createdAt: new Date().toISOString(), digest: await demoDigest(seed.email, DEMO_PASSWORD) });
      changed = true;
    }
  }
  if (changed) localStorage.setItem(USERS_KEY, JSON.stringify(users));
  return users;
}

function saveDemoUsers(users) { localStorage.setItem(USERS_KEY, JSON.stringify(users)); }
function publicProfile(u) { const { digest, ...rest } = u; return rest; }

/** Demo-mode user list for the admin panel (extra helper). */
export async function listDemoUsers() {
  return (await loadDemoUsers()).map(publicProfile);
}

function demoSessionUid() {
  return sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
}

/* ---------------------------- Firebase helpers --------------------------- */

async function loadFirebaseProfile(firebaseUser) {
  const ref = fb.fs.doc(db, 'users', firebaseUser.uid);
  const snap = await fb.fs.getDoc(ref);
  if (snap.exists()) return { uid: firebaseUser.uid, ...snap.data() };
  // Account created outside the app (e.g. Firebase Console): create a default STUDENT profile.
  const profile = {
    uid: firebaseUser.uid,
    fullName: firebaseUser.displayName || (firebaseUser.email || 'Student').split('@')[0],
    studentId: '', email: firebaseUser.email || '', department: '', semester: '',
    role: 'student', photoURL: firebaseUser.photoURL || null, createdAt: new Date().toISOString()
  };
  await fb.fs.setDoc(ref, profile);
  return profile;
}

/* ------------------------------ Initialisation --------------------------- */

if (isFirebaseConfigured) {
  fb.auth.onAuthStateChanged(auth, async (firebaseUser) => {
    if (registering) return; // register() sets the user itself once the profile exists
    if (!firebaseUser) { setUser(null); return; }
    try {
      setUser(await loadFirebaseProfile(firebaseUser));
    } catch (err) {
      console.warn('Could not load user profile', err);
      setUser(null);
    }
  });
} else {
  (async () => {
    const users = await loadDemoUsers();
    const uid = demoSessionUid();
    const found = users.find((u) => u.uid === uid);
    setUser(found ? publicProfile(found) : null);
  })();
}

/* ------------------------------ Public API ------------------------------- */

export async function login(email, password, remember = false) {
  const cleanEmail = String(email || '').trim();
  if (!cleanEmail || !password) throw new Error('Please enter your email and password.');
  if (!EMAIL_RE.test(cleanEmail)) throw new Error('Please enter a valid email address.');
  if (!isFirebaseConfigured) {
    const users = await loadDemoUsers();
    const user = users.find((u) => u.email.toLowerCase() === cleanEmail.toLowerCase());
    const digest = await demoDigest(cleanEmail, password);
    if (!user || user.digest !== digest) throw new Error('Incorrect email or password.');
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, user.uid);
    setUser(publicProfile(user));
    return currentUser;
  }
  try {
    await fb.auth.setPersistence(auth, remember ? fb.auth.browserLocalPersistence : fb.auth.browserSessionPersistence);
    const cred = await fb.auth.signInWithEmailAndPassword(auth, cleanEmail, password);
    const profile = await loadFirebaseProfile(cred.user);
    setUser(profile);
    return profile;
  } catch (err) {
    throw new Error(friendlyError(err, 'Could not log in. Please try again.'));
  }
}

/** Create a STUDENT account. A role can never be supplied by the client. */
export async function register({ fullName, studentId, email, password, department, semester }) {
  const name = String(fullName || '').trim();
  const sid = String(studentId || '').trim();
  const mail = String(email || '').trim();
  if (!name || !sid || !mail || !password || !department || !semester) throw new Error('Please fill in all the fields.');
  if (!EMAIL_RE.test(mail)) throw new Error('Please enter a valid email address.');
  if (String(password).length < 8) throw new Error('Password must be at least 8 characters.');
  const sem = Number(semester);
  if (!Number.isInteger(sem) || sem < 1 || sem > 8) throw new Error('Please choose a semester between 1 and 8.');

  const profileBase = { fullName: name, studentId: sid, email: mail, department, semester: String(sem), role: 'student', photoURL: null, createdAt: new Date().toISOString() };

  if (!isFirebaseConfigured) {
    const users = await loadDemoUsers();
    if (users.some((u) => u.email.toLowerCase() === mail.toLowerCase())) throw new Error('An account with this email already exists.');
    const user = { uid: `demo-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ...profileBase, digest: await demoDigest(mail, password) };
    users.push(user);
    saveDemoUsers(users);
    sessionStorage.setItem(SESSION_KEY, user.uid);
    setUser(publicProfile(user));
    return currentUser;
  }
  registering = true;
  try {
    const cred = await fb.auth.createUserWithEmailAndPassword(auth, mail, password);
    const profile = { uid: cred.user.uid, ...profileBase };
    await fb.fs.setDoc(fb.fs.doc(db, 'users', cred.user.uid), profile);
    registering = false;
    setUser(profile);
    return profile;
  } catch (err) {
    registering = false;
    throw new Error(friendlyError(err, 'Could not create the account. Please try again.'));
  }
}

export async function logout() {
  if (!isFirebaseConfigured) {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
    return;
  }
  try {
    await fb.auth.signOut(auth);
    setUser(null);
  } catch (err) {
    throw new Error(friendlyError(err, 'Could not log out. Please try again.'));
  }
}

export async function resetPassword(email) {
  const mail = String(email || '').trim();
  if (!mail) throw new Error('Please enter your email address.');
  if (!EMAIL_RE.test(mail)) throw new Error('Please enter a valid email address.');
  if (!isFirebaseConfigured) throw new Error('Password reset emails need Firebase. Demo mode is active.');
  try {
    await fb.auth.sendPasswordResetEmail(auth, mail);
  } catch (err) {
    throw new Error(friendlyError(err, 'Could not send the reset email.'));
  }
}

/** Update the editable fields of a profile. role/uid/email/createdAt are ignored on purpose. */
export async function updateUserProfile(uid, partial) {
  if (!currentUser || currentUser.uid !== uid) throw new Error('You can only edit your own profile.');
  const clean = {};
  EDITABLE_FIELDS.forEach((f) => { if (partial && partial[f] !== undefined) clean[f] = partial[f]; });
  if ('fullName' in clean && !String(clean.fullName).trim()) throw new Error('Name cannot be empty.');
  if (!isFirebaseConfigured) {
    const users = await loadDemoUsers();
    const idx = users.findIndex((u) => u.uid === uid);
    if (idx < 0) throw new Error('Profile not found.');
    users[idx] = { ...users[idx], ...clean };
    saveDemoUsers(users);
    setUser(publicProfile(users[idx]));
    return currentUser;
  }
  try {
    await fb.fs.updateDoc(fb.fs.doc(db, 'users', uid), clean);
    setUser({ ...currentUser, ...clean });
    return currentUser;
  } catch (err) {
    throw new Error(friendlyError(err, 'Could not save your profile.'));
  }
}

/** Re-authenticates with the current password, then sets the new one. */
export async function changePassword(current, next) {
  if (!isFirebaseConfigured) throw new Error('Changing the password needs Firebase. Demo mode is active.');
  if (!current || !next) throw new Error('Please enter your current and new password.');
  if (String(next).length < 8) throw new Error('New password must be at least 8 characters.');
  const fu = auth.currentUser;
  if (!fu) throw new Error('Please log in again.');
  try {
    const credential = fb.auth.EmailAuthProvider.credential(fu.email, current);
    await fb.auth.reauthenticateWithCredential(fu, credential);
    await fb.auth.updatePassword(fu, next);
  } catch (err) {
    throw new Error(friendlyError(err, 'Could not change the password.'));
  }
}

/** Fetch the freshest profile (role is read from the data store, never from a cached variable). */
async function fetchFreshProfile() {
  if (!currentUser) return null;
  if (!isFirebaseConfigured) {
    const found = (await loadDemoUsers()).find((u) => u.uid === currentUser.uid);
    return found ? publicProfile(found) : null;
  }
  try {
    const snap = await fb.fs.getDoc(fb.fs.doc(db, 'users', currentUser.uid));
    return snap.exists() ? { uid: currentUser.uid, ...snap.data() } : null;
  } catch {
    return null;
  }
}

const never = () => new Promise(() => {}); // keeps the calling page script from continuing after a redirect

function loginUrl(redirectTo) {
  const here = (window.location.pathname.split('/').pop() || 'index.html') + window.location.search;
  return `${redirectTo}?redirect=${encodeURIComponent(here)}`;
}

/** Returns the UserProfile or redirects to the login page. */
export async function requireAuth(redirectTo = 'login.html') {
  await ready;
  if (currentUser) return currentUser;
  window.location.href = loginUrl(redirectTo);
  return never();
}

/** Returns the UserProfile if role === 'admin' (re-checked in the data store), else redirects. */
export async function requireAdmin() {
  await ready;
  if (!currentUser) { window.location.href = loginUrl('login.html'); return never(); }
  const fresh = await fetchFreshProfile();
  if (!fresh || fresh.role !== 'admin') {
    window.location.href = 'index.html?error=admin_only';
    return never();
  }
  return fresh;
}
