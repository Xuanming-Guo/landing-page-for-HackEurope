/**
 * Accio Waitlist – Supabase Magic Link Auth
 *
 * Flow:
 *  1. On page load, fetch /api/public-config to get Supabase credentials.
 *  2. Init Supabase JS client (loaded via CDN in index.html).
 *  3. Check if this is a magic-link callback (URL contains #access_token or ?type=magiclink).
 *  4. If session exists → upsert user into waitlist_users → show confirmed state.
 *  5. If no session → show email input form.
 *  6. Poll /api/waitlist/count every 2 minutes to keep counter fresh.
 */

(function () {
  /* ── DOM refs ──────────────────────────────────────────────── */
  let waitlistCountEl;
  let waitlistStatusEl;
  let emailFormEl;
  let emailInputEl;
  let sendMagicLinkBtn;
  let confirmedCardEl;
  let confirmedEmailEl;
  let switchEmailBtn;

  /* ── State ─────────────────────────────────────────────────── */
  let supabase = null;
  let pollTimer = null;

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
    if (emailFormEl) emailFormEl.style.display = '';
    if (confirmedCardEl) confirmedCardEl.style.display = 'none';
  }

  function showConfirmedCard(email) {
    if (emailFormEl) emailFormEl.style.display = 'none';
    if (confirmedCardEl) confirmedCardEl.style.display = '';
    if (confirmedEmailEl) confirmedEmailEl.textContent = email || '';
  }

  function setButtonLoading(btn, isLoading, label) {
    if (!btn) return;
    btn.disabled = isLoading;
    btn.textContent = isLoading ? 'Sending…' : label;
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

  /* ── Supabase waitlist upsert ───────────────────────────────── */
  async function upsertWaitlistUser(session) {
    if (!supabase || !session) return;

    const user = session.user;
    const { error } = await supabase
      .from('waitlist_users')
      .upsert(
        {
          user_id: user.id,
          email: user.email,
          joined_at: new Date().toISOString(),
        },
        { onConflict: 'user_id', ignoreDuplicates: true }
      );

    if (error) {
      console.error('[accio] upsert error:', error.message);
    }

    // Refresh count after joining
    await refreshCount();
  }

  /* ── Handle active session (magic link callback or existing) ── */
  async function handleSession(session) {
    if (!session) return false;

    showConfirmedCard(session.user?.email);
    setStatus("You're on the waitlist! We'll be in touch.");

    await upsertWaitlistUser(session);
    return true;
  }

  /* ── Magic link send ────────────────────────────────────────── */
  async function sendMagicLink() {
    const email = emailInputEl ? emailInputEl.value.trim().toLowerCase() : '';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus('Please enter a valid email address.');
      return;
    }

    setButtonLoading(sendMagicLinkBtn, true, 'Send Magic Link');
    setStatus('Sending your sign-in link…');

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // After clicking the link Supabase redirects back here
        emailRedirectTo: window.location.href.split('#')[0],
      },
    });

    setButtonLoading(sendMagicLinkBtn, false, 'Send Magic Link');

    if (error) {
      setStatus(error.message || 'Failed to send magic link. Try again.');
    } else {
      setStatus(`Check your inbox at ${email} — click the link to join the waitlist.`);
      if (sendMagicLinkBtn) {
        sendMagicLinkBtn.textContent = 'Resend Link';
      }
    }
  }

  /* ── Init ───────────────────────────────────────────────────── */
  async function init() {
    waitlistCountEl = document.getElementById('waitlistCount');
    waitlistStatusEl = document.getElementById('waitlistStatus');
    emailFormEl = document.getElementById('waitlistEmailForm');
    emailInputEl = document.getElementById('waitlistEmailInput');
    sendMagicLinkBtn = document.getElementById('waitlistSendBtn');
    confirmedCardEl = document.getElementById('waitlistConfirmedCard');
    confirmedEmailEl = document.getElementById('waitlistConfirmedEmail');
    switchEmailBtn = document.getElementById('waitlistSwitchEmailBtn');

    // Abort if the waitlist section isn't on this page
    if (!waitlistCountEl && !emailFormEl) return;

    setStatus('Loading…');
    startPolling();

    // ── Fetch public config from server ──
    let config;
    try {
      const res = await fetch('/api/public-config');
      config = await res.json();
    } catch (_) {
      setStatus('Could not reach the server. Please refresh.');
      showEmailForm();
      return;
    }

    if (!config.supabaseConfigured) {
      setStatus('Waitlist live. Auth coming soon.');
      showEmailForm();
      return;
    }

    // ── Init Supabase client (from CDN: window.supabase) ──
    if (!window.supabase || !window.supabase.createClient) {
      setStatus('Auth library failed to load. Refresh and try again.');
      showEmailForm();
      return;
    }

    supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

    // ── Wire up UI events ──
    if (sendMagicLinkBtn) {
      sendMagicLinkBtn.addEventListener('click', sendMagicLink);
    }

    if (emailInputEl) {
      emailInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); sendMagicLink(); }
      });
    }

    if (switchEmailBtn) {
      switchEmailBtn.addEventListener('click', async () => {
        await supabase.auth.signOut();
        showEmailForm();
        if (emailInputEl) emailInputEl.value = '';
        setStatus('Sign in with a different email.');
      });
    }

    // ── Check for existing or incoming session ──
    setStatus('Checking session…');

    // getSession() also handles the magic-link hash exchange automatically
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
      await handleSession(session);
    } else {
      showEmailForm();
      setStatus('Enter your email to join the waitlist.');
    }

    // Listen for auth state changes (e.g. magic link completes in same tab)
    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        await handleSession(session);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
