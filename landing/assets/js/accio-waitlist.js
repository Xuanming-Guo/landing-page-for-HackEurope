/**
 * Accio Waitlist – Simplified Direct-to-DB Flow
 * (No email verification to bypass rate limits)
 */

(function () {
  /* ── DOM refs ──────────────────────────────────────────────── */
  let waitlistCountEl;
  let waitlistStatusEl;
  let emailFormEl;
  let emailInputEl;
  let joinBtn;
  let confirmedCardEl;
  let confirmedEmailEl;
  let resetBtn;

  /* ── State ─────────────────────────────────────────────────── */
  let supabase = null;
  let pollTimer = null;
  const STORAGE_KEY = 'accio_waitlist_joined_email';

  const numberFormat = new Intl.NumberFormat('en-US');

  /* ── Helpers ────────────────────────────────────────────────── */
  function setStatus(text) {
    if (waitlistStatusEl) waitlistStatusEl.textContent = text;
  }

  function setCount(n) {
    if (!waitlistCountEl) return;
    const safe = Number.isFinite(n) ? Math.max(0, n) : 0;
    waitlistCountEl.textContent = numberFormat.format(safe);
  }

  function showEmailForm() {
    if (emailFormEl) emailFormEl.style.display = 'flex';
    if (confirmedCardEl) confirmedCardEl.style.display = 'none';
  }

  function showConfirmedCard(email) {
    if (emailFormEl) emailFormEl.style.display = 'none';
    if (confirmedCardEl) confirmedCardEl.style.display = 'flex';
    if (confirmedEmailEl) confirmedEmailEl.textContent = email || '';
  }

  function setButtonLoading(btn, isLoading, label) {
    if (!btn) return;
    btn.disabled = isLoading;
    btn.textContent = isLoading ? 'Joining...' : label;
  }

  /* ── Count polling ──────────────────────────────────────────── */
  async function refreshCount() {
    try {
      const res = await fetch('/api/waitlist/count');
      const data = await res.json();
      setCount(Number(data.count ?? 0));
    } catch (_) {
      /* keep stale value on failure */
    }
  }

  function startPolling() {
    refreshCount();
    if (!pollTimer) {
      pollTimer = window.setInterval(refreshCount, 2 * 60 * 1000); // every 2 min
    }
  }

  /* ── Direct Join Logic ──────────────────────────────────────── */
  async function joinWaitlist() {
    const email = emailInputEl ? emailInputEl.value.trim().toLowerCase() : '';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus('Please enter a valid email address.');
      return;
    }

    setButtonLoading(joinBtn, true, 'Join Waitlist');
    setStatus('Joining waitlist...');

    // Direct insert into public 'waitlist' table
    // We use the supabase client initialized with the anon key
    const { error } = await supabase
      .from('waitlist')
      .insert({ email: email });

    setButtonLoading(joinBtn, false, 'Join Waitlist');

    if (error) {
      // If it's a unique constraint error (user already joined), we show success anyway
      if (error.code === '23505') {
        onJoinedSuccess(email, "You're already on the list!");
      } else {
        console.error('[accio] join error:', error.message);
        setStatus('Failed to join. Please try again later.');
      }
    } else {
      onJoinedSuccess(email, "You're in! Welcome to the waitlist.");
    }
  }

  function onJoinedSuccess(email, message) {
    localStorage.setItem(STORAGE_KEY, email);
    showConfirmedCard(email);
    setStatus(message);
    refreshCount();
  }

  /* ── Init ───────────────────────────────────────────────────── */
  async function init() {
    waitlistCountEl = document.getElementById('waitlistCount');
    waitlistStatusEl = document.getElementById('waitlistStatus');
    emailFormEl = document.getElementById('waitlistEmailForm');
    emailInputEl = document.getElementById('waitlistEmailInput');
    joinBtn = document.getElementById('waitlistSendBtn'); // Re-using ID for simplicity
    confirmedCardEl = document.getElementById('waitlistConfirmedCard');
    confirmedEmailEl = document.getElementById('waitlistConfirmedEmail');
    resetBtn = document.getElementById('waitlistSwitchEmailBtn'); // Re-using ID

    if (!waitlistCountEl && !emailFormEl) return;

    setStatus('Loading counter...');
    startPolling();

    // ── Fetch public config ──
    let config;
    try {
      const res = await fetch('/api/public-config');
      config = await res.json();
    } catch (_) {
      setStatus('Could not reach the server.');
      showEmailForm();
      return;
    }

    if (!config.supabaseConfigured) {
      setStatus('System initializing. Ready soon.');
      showEmailForm();
      return;
    }

    // ── Init Supabase ──
    if (!window.supabase || !window.supabase.createClient) {
      setStatus('Error loading libraries. Please refresh.');
      showEmailForm();
      return;
    }

    supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

    // ── Set UI label to "Join Waitlist" ──
    if (joinBtn) joinBtn.textContent = 'Join Waitlist';

    // ── Wire events ──
    if (joinBtn) {
      joinBtn.addEventListener('click', joinWaitlist);
    }

    if (emailInputEl) {
      emailInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); joinWaitlist(); }
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        localStorage.removeItem(STORAGE_KEY);
        showEmailForm();
        if (emailInputEl) emailInputEl.value = '';
        setStatus('Enter your email to join the waitlist.');
      });
    }

    // ── Check if already joined (LocalStorage) ──
    const cachedEmail = localStorage.getItem(STORAGE_KEY);
    if (cachedEmail) {
      showConfirmedCard(cachedEmail);
      setStatus("You're on the waitlist! We'll be in touch.");
    } else {
      showEmailForm();
      setStatus('Enter your email to join the waitlist.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
