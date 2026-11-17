// =====================================================================
// Firebase configuration for LibraryReplica
// =====================================================================
// 1. Create a project at https://console.firebase.google.com
// 2. Add a Web App, copy the config object it shows you
// 3. Replace the PLACEHOLDER values below (keep the quotes)
//
// While ANY value still starts with "YOUR_", Firebase is NOT initialised,
// isFirebaseConfigured is false and the whole app runs in DEMO MODE
// (localStorage only). Nothing here ever pretends to be connected.
// Firebase web keys are not secrets; security comes from firestore.rules
// and storage.rules.
// =====================================================================

// ---------- PLACEHOLDER KEYS: REPLACE THESE ----------
const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
  appId: 'YOUR_APP_ID'
};
// ------------------------------------------------------

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';

export let isFirebaseConfigured = !Object.values(firebaseConfig).some((v) => String(v).startsWith('YOUR_'));
export let app = null;
export let auth = null;
export let db = null;
export let storage = null;

/**
 * Loaded Firebase SDK namespaces (extra export, used by the data modules):
 * fb.app, fb.auth, fb.fs (Firestore), fb.st (Storage). Empty in demo mode.
 */
export const fb = {};

if (isFirebaseConfigured) {
  try {
    const [appMod, authMod, fsMod, stMod] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-auth.js`),
      import(`${SDK}/firebase-firestore.js`),
      import(`${SDK}/firebase-storage.js`)
    ]);
    Object.assign(fb, { app: appMod, auth: authMod, fs: fsMod, st: stMod });
    app = appMod.initializeApp(firebaseConfig);
    auth = authMod.getAuth(app);
    db = fsMod.getFirestore(app);
    storage = stMod.getStorage(app);
  } catch (err) {
    // SDK could not be loaded (offline / blocked CDN): fall back to demo mode honestly.
    isFirebaseConfigured = false;
    app = auth = db = storage = null;
    console.warn('Firebase SDK failed to load; running in demo mode.', err);
  }
}

const FRIENDLY = {
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/user-not-found': 'No account found with that email.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password': 'Password is too weak. Use at least 8 characters.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/network-request-failed': 'Network problem. Check your connection and try again.',
  'auth/requires-recent-login': 'Please log in again before doing this.',
  'auth/user-disabled': 'This account has been disabled.',
  'permission-denied': 'You do not have permission to do that.',
  'unavailable': 'The database is unreachable right now. Please try again shortly.',
  'not-found': 'The requested item was not found.',
  'storage/unauthorized': 'You are not allowed to upload this file.',
  'storage/canceled': 'Upload cancelled.',
  'storage/quota-exceeded': 'Storage quota exceeded.'
};

/**
 * Convert any thrown value (Firebase error codes, network errors, our own
 * Errors) into a friendly, human readable message. Never touches the DOM.
 */
export function friendlyError(err, fallback = 'Something went wrong. Please try again.') {
  if (!err) return fallback;
  const code = String(err.code || '').replace('firestore/', '');
  if (FRIENDLY[code]) return FRIENDLY[code];
  if (err.code) return fallback; // unknown Firebase error: do not leak internals
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
    return 'Network problem. Check your connection and try again.';
  }
  return err.message || fallback;
}
