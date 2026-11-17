import { initLayout, showToast, escapeHTML, getInitials, openModal, closeModal, setFieldError, clearFieldErrors } from './main.js';
import { requireAuth, updateUserProfile, changePassword, logout } from './auth.js';
import { getCategories } from './books.js';
import { uploadProfilePhoto } from './storage.js';
import { isFirebaseConfigured } from './firebase-config.js';

await initLayout();
let user = await requireAuth();

const $ = (id) => document.getElementById(id);
const form = $('profile-form');
const editable = ['fullName', 'studentId', 'department', 'semester'];

// Department / semester options
const cats = getCategories();
const opt = (c) => `<option value="${escapeHTML(c.label)}">${escapeHTML(c.label)}</option>`;
$('department').innerHTML = `<option value="">Select…</option>
  <optgroup label="Computer Science &amp; Engineering">${cats.filter((c) => c.slug === 'cse').map(opt).join('')}</optgroup>
  <optgroup label="Other Departments">${cats.filter((c) => c.slug !== 'cse').map(opt).join('')}</optgroup>`;
$('semester').innerHTML = '<option value="">Select…</option>' + Array.from({ length: 8 }, (_, i) => `<option value="${i + 1}">Semester ${i + 1}</option>`).join('');

function ensureOption(select, value) {
  if (value && ![...select.options].some((o) => o.value === value)) select.insertAdjacentHTML('beforeend', `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`);
}

function render() {
  $('p-name').textContent = user.fullName;
  $('p-email').textContent = user.email;
  $('p-role').textContent = user.role === 'admin' ? 'Administrator' : 'Student';
  $('avatar').innerHTML = user.photoURL ? `<img src="${escapeHTML(user.photoURL)}" alt="Profile photo of ${escapeHTML(user.fullName)}">` : escapeHTML(getInitials(user.fullName));
  ensureOption($('department'), user.department);
  $('fullName').value = user.fullName || '';
  $('studentId').value = user.studentId || '';
  $('email').value = user.email || '';
  $('department').value = user.department || '';
  $('semester').value = user.semester || '';
}

function setEditing(on) {
  editable.forEach((f) => { $(f).disabled = !on; });
  $('edit-actions').classList.toggle('hidden', !on);
  $('edit-btn').classList.toggle('hidden', on);
  clearFieldErrors(form);
  if (on) $('fullName').focus();
}
render();

$('edit-btn').addEventListener('click', () => setEditing(true));
$('cancel-btn').addEventListener('click', () => { render(); setEditing(false); });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFieldErrors(form);
  let ok = true;
  if (!$('fullName').value.trim()) { setFieldError($('fullName'), 'Name cannot be empty.'); ok = false; }
  if (!$('studentId').value.trim()) { setFieldError($('studentId'), 'Student ID cannot be empty.'); ok = false; }
  if (!$('department').value) { setFieldError($('department'), 'Please choose a department.'); ok = false; }
  if (!$('semester').value) { setFieldError($('semester'), 'Please choose a semester.'); ok = false; }
  if (!ok) return;
  $('save-btn').disabled = true;
  try {
    user = await updateUserProfile(user.uid, {
      fullName: $('fullName').value.trim(), studentId: $('studentId').value.trim(),
      department: $('department').value, semester: $('semester').value
    });
    render();
    setEditing(false);
    showToast('Profile updated.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    $('save-btn').disabled = false;
  }
});

// Photo upload (Firebase Storage only)
$('photo-btn').addEventListener('click', () => {
  if (!isFirebaseConfigured) { showToast('Photo upload needs Firebase Storage. Demo mode is active, so your initials are used.', 'info'); return; }
  $('photo-input').click();
});
$('photo-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    showToast('Uploading photo…', 'info');
    const url = await uploadProfilePhoto(user.uid, file);
    user = await updateUserProfile(user.uid, { photoURL: url });
    render();
    showToast('Profile photo updated.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Change password
$('password-btn').addEventListener('click', () => {
  const modal = openModal(`<h2>Change password</h2>
    ${isFirebaseConfigured ? '' : '<div class="form-alert info">Changing the password needs Firebase. Demo mode is active, so this form is disabled.</div>'}
    <div id="pw-alert" class="form-alert" role="alert"></div>
    <form id="pw-form" novalidate>
      <fieldset style="border:0;padding:0;margin:0" ${isFirebaseConfigured ? '' : 'disabled'}>
        <div class="form-group"><label for="pw-current">Current password</label><input class="input" id="pw-current" type="password" autocomplete="current-password"></div>
        <div class="form-group"><label for="pw-new">New password</label><input class="input" id="pw-new" type="password" autocomplete="new-password"><span class="form-hint">At least 8 characters.</span></div>
        <div class="form-group"><label for="pw-confirm">Confirm new password</label><input class="input" id="pw-confirm" type="password" autocomplete="new-password"></div>
      </fieldset>
      <div class="modal-actions"><button class="btn btn-outline" type="button" data-modal-close>Close</button>
        <button class="btn btn-primary" type="submit" ${isFirebaseConfigured ? '' : 'disabled'}>Update password</button></div>
    </form>`, { title: 'Change password' });
  modal.querySelector('#pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const box = modal.querySelector('#pw-alert');
    const next = modal.querySelector('#pw-new').value;
    box.className = 'form-alert error';
    if (next !== modal.querySelector('#pw-confirm').value) { box.textContent = 'New passwords do not match.'; return; }
    try {
      await changePassword(modal.querySelector('#pw-current').value, next);
      closeModal();
      showToast('Password changed successfully.', 'success');
    } catch (err) {
      box.textContent = err.message;
    }
  });
});

$('logout').addEventListener('click', async () => {
  try {
    await logout();
    window.location.href = 'index.html';
  } catch (err) {
    showToast(err.message, 'error');
  }
});
