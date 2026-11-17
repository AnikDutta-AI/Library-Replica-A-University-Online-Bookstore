import { initLayout, showToast, setFieldError, clearFieldErrors, escapeHTML } from '../main.js';
import { register, getCurrentUser, whenAuthReady } from '../auth.js';
import { getCategories } from '../books.js';

await initLayout();
await whenAuthReady();
if (getCurrentUser()) window.location.replace('dashboard.html');

const form = document.getElementById('signup-form');
const alertBox = document.getElementById('signup-alert');
const submitBtn = document.getElementById('signup-submit');
const $ = (id) => document.getElementById(id);

// Department select grouped into all 16 catalogue categories.
const categories = getCategories();
const cse = categories.filter((c) => c.slug === 'cse');
const others = categories.filter((c) => c.slug !== 'cse');
const opt = (c) => `<option value="${escapeHTML(c.label)}">${escapeHTML(c.label)}</option>`;
$('department').innerHTML = `<option value="">Select your department…</option>
  <optgroup label="Computer Science &amp; Engineering (5 specializations)">${cse.map(opt).join('')}</optgroup>
  <optgroup label="Other Departments (11)">${others.map(opt).join('')}</optgroup>`;
$('semester').innerHTML = '<option value="">Select…</option>' + Array.from({ length: 8 }, (_, i) => `<option value="${i + 1}">Semester ${i + 1}</option>`).join('');

$('toggle-password').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  const show = $('password').type === 'password';
  $('password').type = show ? 'text' : 'password';
  $('confirm').type = show ? 'text' : 'password';
  btn.setAttribute('aria-pressed', String(show));
  btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  btn.querySelector('i').className = show ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
});

function validate() {
  let ok = true;
  const fail = (input, msg) => { setFieldError(input, msg); ok = false; };
  if (!$('fullName').value.trim()) fail($('fullName'), 'Please enter your full name.');
  if (!$('studentId').value.trim()) fail($('studentId'), 'Please enter your student ID.');
  if (!$('semester').value) fail($('semester'), 'Please choose your semester.');
  const email = $('email').value.trim();
  if (!email) fail($('email'), 'Email is required.');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fail($('email'), 'Please enter a valid email address.');
  if (!$('department').value) fail($('department'), 'Please choose your department.');
  if (!$('password').value) fail($('password'), 'Password is required.');
  else if ($('password').value.length < 8) fail($('password'), 'Password must be at least 8 characters.');
  if (!$('confirm').value) fail($('confirm'), 'Please confirm your password.');
  else if ($('confirm').value !== $('password').value) fail($('confirm'), 'Passwords do not match.');
  return ok;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFieldErrors(form);
  alertBox.textContent = '';
  alertBox.className = 'form-alert';
  if (!validate()) {
    alertBox.textContent = 'Please fix the highlighted fields and try again.';
    alertBox.className = 'form-alert error';
    return;
  }
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating account…';
  try {
    const user = await register({
      fullName: $('fullName').value, studentId: $('studentId').value, email: $('email').value,
      password: $('password').value, department: $('department').value, semester: $('semester').value
    });
    showToast(`Account created. Welcome, ${user.fullName.split(' ')[0]}!`, 'success');
    window.location.href = 'dashboard.html';
  } catch (err) {
    alertBox.textContent = err.message;
    alertBox.className = 'form-alert error';
    showToast(err.message, 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create account';
  }
});
