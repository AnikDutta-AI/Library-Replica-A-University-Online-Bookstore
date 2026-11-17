// Firebase Storage uploads (no DOM). Demo mode cannot upload.
import { isFirebaseConfigured, fb, storage, friendlyError } from './firebase-config.js';

const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const IMAGE_MAX = 2 * 1024 * 1024;
const PDF_MAX = 10 * 1024 * 1024;

function requireStorage() {
  if (!isFirebaseConfigured) throw new Error('File uploads need Firebase Storage. Demo mode is active.');
}

function checkImage(file) {
  if (!file) throw new Error('Please choose an image file.');
  if (!IMAGE_TYPES[file.type]) throw new Error('Images must be JPG, PNG or WebP.');
  if (file.size > IMAGE_MAX) throw new Error('Images must be 2 MB or smaller.');
}

function checkPdf(file) {
  if (!file) throw new Error('Please choose a PDF file.');
  if (file.type !== 'application/pdf') throw new Error('Preview files must be PDF.');
  if (file.size > PDF_MAX) throw new Error('PDF files must be 10 MB or smaller.');
}

async function upload(path, file) {
  try {
    const ref = fb.st.ref(storage, path);
    await fb.st.uploadBytes(ref, file, { contentType: file.type });
    return await fb.st.getDownloadURL(ref);
  } catch (err) {
    throw new Error(friendlyError(err, 'Upload failed. Please try again.'));
  }
}

/** Client-side validation helpers, usable by the UI before uploading (extra helpers). */
export function validateImageFile(file) { checkImage(file); }
export function validatePdfFile(file) { checkPdf(file); }

export async function uploadBookCover(bookId, file) {
  requireStorage();
  checkImage(file);
  return upload(`book-covers/${bookId}.${IMAGE_TYPES[file.type]}`, file);
}

export async function uploadBookPdf(bookId, file) {
  requireStorage();
  checkPdf(file);
  return upload(`book-previews/${bookId}.pdf`, file);
}

export async function uploadProfilePhoto(uid, file) {
  requireStorage();
  checkImage(file);
  return upload(`users/${uid}/profile.${IMAGE_TYPES[file.type]}`, file);
}
