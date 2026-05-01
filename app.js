(() => {
  const state = {
    mode: 'login',
    phone: '',
    name: '',
  };

  const els = {
    tabLogin: document.getElementById('tab-login'),
    tabSignup: document.getElementById('tab-signup'),

    screenLogin: document.getElementById('screen-login'),
    screenSignup: document.getElementById('screen-signup'),
    screenVerify: document.getElementById('screen-verify'),
    screenSuccess: document.getElementById('screen-success'),

    formLogin: document.getElementById('form-login'),
    formSignup: document.getElementById('form-signup'),
    formVerify: document.getElementById('form-verify'),

    loginPhone: document.getElementById('login-phone'),
    signupName: document.getElementById('signup-name'),
    signupPhone: document.getElementById('signup-phone'),

    verifySubtitle: document.getElementById('verify-subtitle'),
    verifyOtp: document.getElementById('verify-otp'),

    btnResend: document.getElementById('btn-resend'),
    btnStartOver: document.getElementById('btn-start-over'),

    status: document.getElementById('status'),
    successSummary: document.getElementById('success-summary'),
  };

  function setStatus(message, kind) {
    els.status.textContent = message || '';
    els.status.classList.remove('error', 'ok');
    if (kind) els.status.classList.add(kind);
  }

  function showScreen(screenId) {
    const allScreens = [els.screenLogin, els.screenSignup, els.screenVerify, els.screenSuccess];
    for (const screen of allScreens) {
      screen.classList.add('hidden');
    }

    if (screenId === 'login') els.screenLogin.classList.remove('hidden');
    if (screenId === 'signup') els.screenSignup.classList.remove('hidden');
    if (screenId === 'verify') els.screenVerify.classList.remove('hidden');
    if (screenId === 'success') els.screenSuccess.classList.remove('hidden');
  }

  function setMode(mode) {
    state.mode = mode;
    setStatus('');

    const isLogin = mode === 'login';
    els.tabLogin.setAttribute('aria-selected', String(isLogin));
    els.tabSignup.setAttribute('aria-selected', String(!isLogin));

    showScreen(isLogin ? 'login' : 'signup');
  }

  function onlyDigits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function normalizeIndiaPhone(raw) {
    const digits = onlyDigits(raw);
    // Accept: 10 digits, or 91 + 10 digits.
    if (digits.length === 10) return digits;
    if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
    return '';
  }

  function maskPhone(digits10) {
    if (!digits10 || digits10.length !== 10) return '';
    return `+91 ${digits10.slice(0, 2)}******${digits10.slice(8)}`;
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      // ignore
    }

    if (!res.ok) {
      const message = data?.error || `Request failed (${res.status})`;
      const error = new Error(message);
      error.status = res.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  function setBusy(isBusy) {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      btn.disabled = isBusy;
    }

    const inputs = document.querySelectorAll('input');
    for (const input of inputs) {
      input.disabled = isBusy;
    }
  }

  async function requestOtp() {
    setStatus('');

    const rawPhone = state.mode === 'login' ? els.loginPhone.value : els.signupPhone.value;
    const phone = normalizeIndiaPhone(rawPhone);

    if (!phone) {
      setStatus('Enter a valid 10-digit Indian phone number.', 'error');
      return;
    }

    let name = '';
    if (state.mode === 'signup') {
      name = String(els.signupName.value || '').trim();
      if (!name) {
        setStatus('Enter your name for signup.', 'error');
        return;
      }
    }

    state.phone = phone;
    state.name = name;

    setBusy(true);
    try {
      const payload = {
        phone: `+91${phone}`,
        flow: state.mode,
        ...(state.mode === 'signup' ? { name } : {}),
      };
      const data = await postJson('/api/request-otp', payload);

      els.verifySubtitle.textContent = `We sent an OTP to ${data?.phoneMasked || maskPhone(phone)}.`;
      els.verifyOtp.value = '';
      showScreen('verify');
      setStatus(`OTP sent. Expires in ${data?.expiresInSec ?? 300}s.`, 'ok');
    } catch (err) {
      setStatus(err.message || 'Failed to send OTP.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    setStatus('');

    const otp = onlyDigits(els.verifyOtp.value);
    if (otp.length !== 6) {
      setStatus('Enter a 6-digit OTP.', 'error');
      return;
    }

    if (!state.phone) {
      setStatus('Phone is missing. Start over.', 'error');
      return;
    }

    setBusy(true);
    try {
      const payload = {
        phone: `+91${state.phone}`,
        flow: state.mode,
        otp,
        ...(state.mode === 'signup' ? { name: state.name } : {}),
      };
      const data = await postJson('/api/verify-otp', payload);

      const user = data?.user || { phone: `+91${state.phone}`, name: state.name };
      els.successSummary.textContent = `Phone: ${user.phone}\nName: ${user.name || '(none)'}`;
      showScreen('success');
      setStatus('Verified successfully.', 'ok');
    } catch (err) {
      setStatus(err.message || 'Verification failed.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setStatus('');
    state.phone = '';
    state.name = '';

    els.loginPhone.value = '';
    els.signupPhone.value = '';
    els.signupName.value = '';
    els.verifyOtp.value = '';

    setMode('login');
  }

  // Wire up UI
  els.tabLogin.addEventListener('click', () => setMode('login'));
  els.tabSignup.addEventListener('click', () => setMode('signup'));

  els.formLogin.addEventListener('submit', (e) => {
    e.preventDefault();
    requestOtp();
  });

  els.formSignup.addEventListener('submit', (e) => {
    e.preventDefault();
    requestOtp();
  });

  els.formVerify.addEventListener('submit', (e) => {
    e.preventDefault();
    verifyOtp();
  });

  els.btnResend.addEventListener('click', () => requestOtp());
  els.btnStartOver.addEventListener('click', () => startOver());

  // Initialize
  setMode('login');
})();
