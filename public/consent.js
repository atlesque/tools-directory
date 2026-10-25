/*
 * Atlesque analytics consent — shared opt-in banner for the tools on tools.atlesque.dev.
 *
 * Add to a site's <head>:
 *   <script src="https://tools.atlesque.dev/consent.js" defer></script>
 *
 * Cloudflare Web Analytics is only loaded after the visitor clicks "Allow". The choice is kept in
 * localStorage on the site itself and can be changed at any time through the small privacy button
 * (or any element with a data-privacy-settings attribute, or window.AtlesqueConsent.open()).
 *
 * Optional attributes on the script tag:
 *   data-token="…"            Web Analytics token, overrides the per-domain default below
 *   data-launcher="left|right|none"  where the privacy button sits after a choice (default: left)
 *   data-policy="…"           the site's own privacy policy (absolute or relative URL), instead of the
 *                             generic tools.atlesque.dev/privacy
 *
 * CSP for sites that set one:
 *   script-src  https://tools.atlesque.dev https://static.cloudflareinsights.com
 *   connect-src https://cloudflareinsights.com
 */
(() => {
  if (window.AtlesqueConsent) return;

  const POLICY_URL = 'https://tools.atlesque.dev/privacy';
  const BEACON_URL = 'https://static.cloudflareinsights.com/beacon.min.js';
  const STORAGE_KEY = 'atlesque-consent';
  const VERSION = 1;
  const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

  // One Web Analytics site per Cloudflare zone; the dashboard splits it per hostname.
  const TOKENS = {
    'atlesque.dev': 'd9c31845046f4fc3885e19e65eac8f95',
    'atlesque.com': 'c4f0288dfce741c9b78324fb11259b50',
    'amongusdetective.com': '94f160c35d97492c8040ee8a89ca5d7a',
    'semina.be': 'dffef36fb58747c6b841a2d4a6228357',
  };

  const script = document.currentScript;
  const host = location.hostname;
  const zone = Object.keys(TOKENS).find((d) => host === d || host.endsWith('.' + d));
  const token = script?.dataset.token || (zone && TOKENS[zone]);
  const launcherSide = script?.dataset.launcher || 'left';
  const policyUrl = (() => {
    try {
      const u = new URL(script?.dataset.policy || POLICY_URL, location.href);
      if (u.protocol === 'https:' || u.protocol === 'http:') return u.href;
    } catch {}
    return POLICY_URL;
  })();
  const policyIsLocal = new URL(policyUrl).origin === location.origin;
  if (!token) return;

  const read = () => {
    try {
      const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (v && v.v === VERSION && typeof v.analytics === 'boolean' && Date.now() - v.at < MAX_AGE_MS) return v;
    } catch {}
    return null;
  };
  const write = (analytics) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: VERSION, analytics, at: Date.now() }));
    } catch {}
  };

  let beaconLoaded = false;
  const loadBeacon = () => {
    if (beaconLoaded) return;
    beaconLoaded = true;
    const s = document.createElement('script');
    s.defer = true;
    s.src = BEACON_URL;
    s.setAttribute('data-cf-beacon', JSON.stringify({ token, spa: true }));
    document.head.appendChild(s);
  };

  // Global Privacy Control is a legally recognised "no": honour it without asking.
  const gpc = navigator.globalPrivacyControl === true;

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .wrap {
      --bg: #ffffff; --ink: #15171d; --muted: #5d6170; --line: rgba(30,34,50,.14);
      --btn: #15171d; --btn-ink: #ffffff; --soft: rgba(30,34,50,.07);
      font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: var(--ink);
    }
    .wrap.dark {
      --bg: #1b1c22; --ink: #f1f1f4; --muted: #a3a5b0; --line: rgba(255,255,255,.12);
      --btn: #f1f1f4; --btn-ink: #15171d; --soft: rgba(255,255,255,.08);
    }
    .banner {
      position: fixed; z-index: 2147483646; left: 16px; right: 16px; bottom: 16px;
      max-width: 420px; padding: 16px; border-radius: 12px;
      background: var(--bg); border: 1px solid var(--line);
      box-shadow: 0 18px 50px -18px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.08);
    }
    .banner[hidden], .launcher[hidden] { display: none; }
    h2 { margin: 0 0 6px; font-size: 15px; font-weight: 650; }
    p { margin: 0 0 12px; color: var(--muted); }
    a { color: inherit; text-underline-offset: 2px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    button {
      font: inherit; font-weight: 600; cursor: pointer; border-radius: 8px;
      padding: 8px 14px; border: 1px solid var(--line); background: var(--soft); color: var(--ink);
      flex: 1 1 0; min-width: 120px;
    }
    button.primary { background: var(--btn); color: var(--btn-ink); border-color: var(--btn); }
    button:focus-visible { outline: 2px solid #7c4ddb; outline-offset: 2px; }
    .launcher {
      position: fixed; z-index: 2147483645; bottom: 12px; width: 32px; height: 32px; min-width: 0;
      padding: 0; flex: none; border-radius: 50%; display: grid; place-items: center;
      background: var(--bg); color: var(--muted); opacity: .7;
      box-shadow: 0 4px 14px -6px rgba(0,0,0,.4);
    }
    .launcher:hover, .launcher:focus-visible { opacity: 1; }
    .launcher.left { left: 12px; } .launcher.right { right: 12px; }
    .launcher svg { width: 16px; height: 16px; }
    @media (prefers-reduced-motion: no-preference) { .banner { animation: in .2s ease-out; } }
    @keyframes in { from { opacity: 0; transform: translateY(8px); } }
    @media print { .banner, .launcher { display: none; } }
  `;

  const isDark = () => {
    const root = document.documentElement;
    const t = (root.getAttribute('data-theme') || root.getAttribute('data-color-scheme') || '').toLowerCase();
    if (t.includes('dark')) return true;
    if (t.includes('light')) return false;
    if (root.classList.contains('dark')) return true;
    if (root.classList.contains('light')) return false;
    return matchMedia('(prefers-color-scheme: dark)').matches;
  };

  let ui;
  const build = () => {
    if (ui) return ui;
    const hostEl = document.createElement('div');
    hostEl.setAttribute('data-atlesque-consent', '');
    const shadow = hostEl.attachShadow({ mode: 'open' });

    // Constructed stylesheets are not blocked by a strict style-src; very old browsers get a <style>.
    if ('adoptedStyleSheets' in shadow && 'replaceSync' in CSSStyleSheet.prototype) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      shadow.adoptedStyleSheets = [sheet];
    } else {
      const style = document.createElement('style');
      style.textContent = CSS;
      shadow.appendChild(style);
    }

    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    wrap.innerHTML = `
      <section class="banner" role="dialog" aria-modal="false" aria-labelledby="ac-title" aria-describedby="ac-text" hidden>
        <h2 id="ac-title">Can we count your visit?</h2>
        <p id="ac-text">With your permission we use Cloudflare Web Analytics to see how this tool is used.
          It sets no cookies and is not used for ads or to follow you across sites.
          You can change your mind at any time. <a class="policy">Privacy policy</a></p>
        <div class="actions">
          <button type="button" data-choice="deny">No thanks</button>
          <button type="button" class="primary" data-choice="allow">Allow</button>
        </div>
      </section>
      <button type="button" class="launcher ${launcherSide === 'right' ? 'right' : 'left'}" aria-label="Privacy settings" title="Privacy settings" hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>
      </button>`;
    shadow.appendChild(wrap);

    const policy = wrap.querySelector('a.policy');
    policy.href = policyUrl;
    // A site's own policy opens in place; the shared one opens in a new tab.
    if (!policyIsLocal) {
      policy.target = '_blank';
      policy.rel = 'noopener';
    }

    const banner = wrap.querySelector('.banner');
    const launcher = wrap.querySelector('.launcher');
    wrap.querySelectorAll('[data-choice]').forEach((b) =>
      b.addEventListener('click', () => choose(b.getAttribute('data-choice') === 'allow')),
    );
    launcher.addEventListener('click', () => open());
    banner.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && read()) hide();
    });

    (document.body || document.documentElement).appendChild(hostEl);
    ui = { wrap, banner, launcher };
    return ui;
  };

  const hasOwnSettingsLink = () => !!document.querySelector('[data-privacy-settings]');

  const showLauncher = () => {
    if (launcherSide === 'none' || hasOwnSettingsLink()) return;
    const { wrap, launcher } = build();
    wrap.classList.toggle('dark', isDark());
    launcher.hidden = false;
  };

  const hide = () => {
    if (!ui) return;
    ui.banner.hidden = true;
    showLauncher();
  };

  const open = () => {
    const { wrap, banner, launcher } = build();
    wrap.classList.toggle('dark', isDark());
    launcher.hidden = true;
    banner.hidden = false;
    const current = read();
    const focus = banner.querySelector(`[data-choice="${current?.analytics ? 'allow' : 'deny'}"]`);
    (current ? focus : banner.querySelector('[data-choice="allow"]'))?.focus({ preventScroll: true });
  };

  const choose = (analytics) => {
    const before = read();
    write(analytics);
    hide();
    if (analytics) loadBeacon();
    // The beacon cannot be unloaded; reload so it stops measuring right away.
    else if (beaconLoaded || before?.analytics) location.reload();
  };

  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element && e.target.closest('[data-privacy-settings]');
    if (t) {
      e.preventDefault();
      open();
    }
  });

  window.AtlesqueConsent = {
    open,
    get: () => (gpc ? false : read()?.analytics ?? null),
    reset: () => {
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      if (beaconLoaded) location.reload();
      else open();
    },
  };

  const start = () => {
    if (gpc) return;
    const saved = read();
    if (!saved) open();
    else {
      if (saved.analytics) loadBeacon();
      showLauncher();
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
