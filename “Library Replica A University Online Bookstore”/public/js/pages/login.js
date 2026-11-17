import { initLayout, showToast, openModal, closeModal, setFieldError, clearFieldErrors, getQueryParam } from '../main.js';
import { login, resetPassword, getCurrentUser, whenAuthReady, DEMO_HINT } from '../auth.js';
import { isFirebaseConfigured } from '../firebase-config.js';

await initLayout();

const form = document.getElementById('login-form');
const alertBox = document.getElementById('login-alert');
const submitBtn = document.getElementById('login-submit');
const emailInput = document.getElementById('email');
const passInput = document.getElementById('password');

/** Only allow redirects to local pages (e.g. checkout.html), never to other sites. */
function safeRedirect() {
  const target = getQueryParam('redirect');
  return target && /^[a-z0-9-]+\.html(\?[^\s#]*)?$/i.test(target) ? target : 'dashboard.html';
}

await whenAuthReady();
if (getCurrentUser()) window.location.replace(safeRedirect());

if (!isFirebaseConfigured) {
  const hint = document.getElementById('demo-hint');
  hint.innerHTML = `<strong>Demo mode:</strong> ${DEMO_HINT.replace('Demo mode (no Firebase configured). ', '')}<br><button class="btn btn-outline btn-sm" type="button" id="fill-student">Fill student demo login</button>`;
  hint.classList.remove('hidden');
  document.getElementById('fill-student').addEventListener('click', () => {
    emailInput.value = 'student@libraryreplica.demo';
    passInput.value = 'Demo@1234';
  });
}

document.getElementById('toggle-password').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  const show = passInput.type === 'password';
  passInput.type = show ? 'text' : 'password';
  btn.setAttribute('aria-pressed', String(show));
  btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  btn.querySelector('i').className = show ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFieldErrors(form);
  alertBox.textContent = '';
  alertBox.className = 'form-alert';
  let valid = true;
  if (!emailInput.value.trim()) { setFieldError(emailInput, 'Email is required.'); valid = false; }
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailInput.value.trim())) { setFieldError(emailInput, 'Please enter a valid email address.'); valid = false; }
  if (!passInput.value) { setFieldError(passInput, 'Password is required.'); valid = false; }
  if (!valid) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Logging in…';
  try {
    const user = await login(emailInput.value, passInput.value, document.getElementById('remember').checked);
    showToast(`Welcome back, ${user.fullName.split(' ')[0]}!`, 'success');
    window.location.href = safeRedirect();
  } catch (err) {
    alertBox.textContent = err.message;
    alertBox.className = 'form-alert error';
    showToast(err.message, 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Log in';
  }
});

document.getElementById('forgot-btn').addEventListener('click', () => {
  const modal = openModal(`<h2>Reset your password</h2>
    <p class="text-muted">Enter your account email and we will send you a reset link.</p>
    <div id="reset-alert" class="form-alert" role="alert"></div>
    <form id="reset-form" novalidate>
      <div class="form-group"><label for="reset-email">Email</label><input class="input" id="reset-email" type="email" autocomplete="email" required></div>
      <div class="modal-actions"><button class="btn btn-outline" type="button" data-modal-close>Cancel</button><button class="btn btn-primary" type="submit">Send reset email</button></div>
    </form>`, { title: 'Reset password' });
  const resetEmail = modal.querySelector('#reset-email');
  resetEmail.value = emailInput.value;
  modal.querySelector('#reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const box = modal.querySelector('#reset-alert');
    try {
      await resetPassword(resetEmail.value);
      closeModal();
      showToast('If an account exists for that email, a reset link is on its way.', 'success');
    } catch (err) {
      box.textContent = err.message;
      box.className = 'form-alert error';
    }
  });
});
