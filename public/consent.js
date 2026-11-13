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
 *   data-mode="preferences"   use the preferences window (below) for every entry point
 *
 * Preferences window (opt-in) — a modal that lists what the site uses per category, with a switch
 * per category and Allow all / Reject all / Confirm my choices. Put a link in the site's footer:
 *   <button type="button" data-cookie-preferences></button>
 * Left empty it is filled with a small icon and "Cookie preferences"; with content of its own it is
 * left alone. Clicking it opens the window, the corner button is no longer shown, and the first-visit
 * banner gets a "Customise" button. Add data-mode="preferences" to the script tag when the footer is
 * rendered on the client (so links that appear later are filled too) or when existing
 * data-privacy-settings links should open the window as well.
 *
 * A site can list more of what it uses, as JSON anywhere in the page (or as the same object on
 * window.AtlesqueConsentConfig before DOMContentLoaded):
 *   <script type="application/json" data-atlesque-consent-config>
 *     { "categories": [
 *       { "id": "necessary", "items": [
 *         { "name": "theme", "provider": "This site", "type": "Local storage",
 *           "duration": "Until you clear it", "purpose": "Remembers light or dark mode." } ] },
 *       { "id": "media", "title": "Embedded media", "description": "Videos played from YouTube.",
 *         "items": [ { "name": "YouTube player", "provider": "Google", "purpose": "Plays the videos." } ] }
 *     ] }
 *   </script>
 * "necessary" and "analytics" add items to the built-in categories; any other id becomes a category
 * of its own that is off until the visitor allows it. The site loads those services itself:
 *   AtlesqueConsent.get('media')                      true | false | null (not chosen yet)
 *   document.addEventListener('atlesque-consent', (e) => e.detail.media)
 * The event fires on load when a choice was saved and again on every change. The page reloads when
 * a category that was on is switched off.
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
  const SETTINGS = '[data-privacy-settings]';
  const PREFS_LINK = '[data-cookie-preferences]';

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
  const prefsEverywhere = script?.dataset.mode === 'preferences';
  const policyUrl = (() => {
    try {
      const u = new URL(script?.dataset.policy || POLICY_URL, location.href);
      if (u.protocol === 'https:' || u.protocol === 'http:') return u.href;
    } catch {}
    return POLICY_URL;
  })();
  const policyIsLocal = new URL(policyUrl).origin === location.origin;

  // Global Privacy Control is a legally recognised "no": honour it without asking.
  const gpc = navigator.globalPrivacyControl === true;

  // ── What the site uses, per category ─────────────────────────────

  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  let cats;
  const categories = () => {
    if (cats) return cats;
    cats = [
      {
        id: 'necessary',
        required: true,
        title: 'Strictly necessary',
        description: 'Needed for the site to work and to remember the choices you make here. These cannot be switched off.',
        items: [
          {
            name: STORAGE_KEY,
            provider: 'This site',
            type: 'Local storage',
            duration: '12 months',
            purpose: 'Remembers the choices you make in this window.',
          },
        ],
      },
      {
        id: 'analytics',
        title: 'Analytics',
        description: 'Shows us how this site is used, so we can improve it. Not used for ads or to follow you across sites.',
        // Without a token (localhost, preview hosts) nothing is measured, so nothing is listed.
        items: token
          ? [
              {
                name: 'Cloudflare Web Analytics',
                provider: 'Cloudflare',
                type: 'Script, sets no cookies',
                duration: 'Nothing is stored on your device',
                purpose: 'Counts page views, where visitors came from and how fast pages load.',
              },
            ]
          : [],
      },
    ];
    let config = window.AtlesqueConsentConfig;
    try {
      const block = document.querySelector('script[type="application/json"][data-atlesque-consent-config]');
      if (block) config = JSON.parse(block.textContent);
    } catch {}
    for (const c of Array.isArray(config?.categories) ? config.categories : []) {
      const id = str(c?.id, 32);
      if (!/^[a-z][a-z0-9-]*$/.test(id)) continue;
      let cat = cats.find((x) => x.id === id);
      if (!cat) {
        cat = { id, title: str(c.title, 60) || id, description: str(c.description, 600), items: [] };
        cats.push(cat);
      }
      for (const it of Array.isArray(c.items) ? c.items : []) {
        const name = str(it?.name, 80);
        if (!name) continue;
        cat.items.push({
          name,
          provider: str(it.provider, 80),
          type: str(it.type, 60),
          duration: str(it.duration, 60),
          purpose: str(it.purpose, 300),
        });
      }
    }
    cats = cats.filter((c) => c.items.length);
    return cats;
  };
  const optional = () => categories().filter((c) => !c.required);
  // The original banner only talks about Cloudflare Web Analytics.
  const analyticsOnly = () => {
    const o = optional();
    return !!token && o.length === 1 && o[0].id === 'analytics' && o[0].items.length === 1;
  };
  const prefsMode = () => prefsEverywhere || !analyticsOnly() || !!document.querySelector(PREFS_LINK);
  const all = (on) => Object.fromEntries(optional().map((c) => [c.id, on]));

  // ── Saved choice ─────────────────────────────────────────────────

  const read = () => {
    try {
      const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (v && v.v === VERSION && typeof v.analytics === 'boolean' && Date.now() - v.at < MAX_AGE_MS) return v;
    } catch {}
    return null;
  };
  const saved = (v, id) => (id === 'analytics' ? v?.analytics : v?.c?.[id]);
  // `complete` is false until every optional category has an answer, so a category the site adds
  // later is asked about while the earlier answers keep counting.
  const state = () => {
    const v = read();
    const on = {};
    let complete = !!v;
    for (const { id } of optional()) {
      const x = saved(v, id);
      if (typeof x !== 'boolean') complete = false;
      on[id] = x === true;
    }
    return { on, complete };
  };
  const write = (now) => {
    const { analytics, ...c } = now;
    const record = { v: VERSION, analytics: analytics === true, at: Date.now() };
    if (Object.keys(c).length) record.c = c;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch {}
  };

  let beaconLoaded = false;
  const loadBeacon = () => {
    if (beaconLoaded || !token) return;
    beaconLoaded = true;
    const s = document.createElement('script');
    s.defer = true;
    s.src = BEACON_URL;
    s.setAttribute('data-cf-beacon', JSON.stringify({ token, spa: true }));
    document.head.appendChild(s);
  };

  const announce = (on) => document.dispatchEvent(new CustomEvent('atlesque-consent', { detail: { ...on } }));

  const apply = (now) => {
    const before = state().on;
    write(now);
    hide();
    announce(now);
    // Scripts that already run cannot be unloaded; reload so they stop right away.
    if ((beaconLoaded && !now.analytics) || optional().some(({ id }) => before[id] && !now[id])) location.reload();
    else if (now.analytics) loadBeacon();
  };

  // ── Interface ────────────────────────────────────────────────────

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
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

    .prefs {
      width: min(640px, calc(100vw - 24px)); max-width: none; max-height: none; margin: auto;
      padding: 0; border: 0; background: none; color: inherit; overflow: visible;
    }
    .prefs::backdrop { background: rgba(10,12,18,.55); }
    .sheet {
      display: flex; flex-direction: column; max-height: calc(100vh - 24px); overflow: hidden;
      background: var(--bg); border: 1px solid var(--line); border-radius: 14px;
      box-shadow: 0 30px 80px -20px rgba(0,0,0,.6);
    }
    @supports (height: 100dvh) { .sheet { max-height: calc(100dvh - 24px); } }
    .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 20px 16px 0 24px; }
    .head h2 { margin: 4px 0 0; font-size: 20px; line-height: 1.25; }
    .close {
      flex: none; min-width: 0; width: 32px; height: 32px; padding: 0; border: 0; background: none;
      display: grid; place-items: center; color: var(--muted);
    }
    .close:hover { background: var(--soft); color: var(--ink); }
    .close svg { width: 16px; height: 16px; }
    .body { padding: 10px 24px 8px; overflow-y: auto; overscroll-behavior: contain; }
    .body h3 { margin: 24px 0 2px; font-size: 14px; font-weight: 650; }
    .note { padding: 10px 12px; border-radius: 8px; background: var(--soft); color: var(--ink); }
    .allow-all { flex: none; }
    .cats, .items { list-style: none; margin: 0; padding: 0; }
    .cat { border-bottom: 1px solid var(--line); }
    .cat:last-child { border-bottom: 0; }
    .row { display: flex; align-items: center; gap: 12px; }
    .expander {
      flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 12px;
      padding: 15px 0; border: 0; background: none; text-align: left;
    }
    .plus { position: relative; flex: none; width: 12px; height: 12px; color: var(--muted); }
    .plus::before, .plus::after {
      content: ""; position: absolute; left: 0; right: 0; top: 5px; height: 2px; border-radius: 1px; background: currentColor;
    }
    .plus::after { transform: rotate(90deg); }
    .expander[aria-expanded="true"] .plus::after { transform: none; }
    .always { flex: none; font-size: 13px; font-weight: 600; color: var(--muted); }
    .switch {
      flex: none; min-width: 0; width: 40px; height: 24px; padding: 2px; border-radius: 999px;
    }
    .knob { display: block; width: 18px; height: 18px; border-radius: 50%; background: var(--muted); }
    .switch[aria-checked="true"] { background: var(--btn); border-color: var(--btn); }
    .switch[aria-checked="true"] .knob { transform: translateX(16px); background: var(--btn-ink); }
    .switch:disabled { opacity: .5; cursor: not-allowed; }
    .panel { padding: 0 0 16px 24px; }
    .items { display: grid; gap: 8px; }
    .items li { padding: 10px 12px; border-radius: 8px; background: var(--soft); }
    .items strong { display: block; font-weight: 600; overflow-wrap: anywhere; }
    .items span { display: block; }
    .meta { font-size: 12.5px; color: var(--muted); }
    .foot { display: flex; gap: 8px; flex-wrap: wrap; padding: 14px 24px; border-top: 1px solid var(--line); }
    @media (max-width: 480px) {
      .head { padding-left: 16px; } .body { padding-left: 16px; padding-right: 16px; } .foot { padding: 12px 16px; }
    }

    @media (prefers-reduced-motion: no-preference) {
      .banner { animation: in .2s ease-out; }
      .plus::after, .knob { transition: transform .15s ease-out; }
    }
    @keyframes in { from { opacity: 0; transform: translateY(8px); } }
    @media print { .banner, .launcher, .prefs { display: none; } }
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

  const linkPolicy = (a) => {
    a.href = policyUrl;
    // A site's own policy opens in place; the shared one opens in a new tab.
    if (!policyIsLocal) {
      a.target = '_blank';
      a.rel = 'noopener';
    }
  };

  // Text from a site's config only ever goes in through textContent.
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  let ui;
  let prefs;
  let draft = {};

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
        <p id="ac-text"><span class="text">With your permission we use Cloudflare Web Analytics to see how this tool is used.
          It sets no cookies and is not used for ads or to follow you across sites.
          You can change your mind at any time.</span> <a class="policy">Privacy policy</a></p>
        <div class="actions">
          <button type="button" class="customise" hidden>Customise</button>
          <button type="button" data-choice="deny">No thanks</button>
          <button type="button" class="primary" data-choice="allow">Allow</button>
        </div>
      </section>
      <button type="button" class="launcher ${launcherSide === 'right' ? 'right' : 'left'}" aria-label="Privacy settings" title="Privacy settings" hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>
      </button>`;
    shadow.appendChild(wrap);

    linkPolicy(wrap.querySelector('a.policy'));
    if (!analyticsOnly()) {
      wrap.querySelector('#ac-title').textContent = 'Your privacy choices';
      wrap.querySelector('#ac-text .text').textContent =
        `With your permission this site uses optional services: ${optional().map((c) => c.title).join(', ')}. ` +
        'Allow them all, refuse them all, or choose per category. You can change your mind at any time.';
    }

    const banner = wrap.querySelector('.banner');
    const launcher = wrap.querySelector('.launcher');
    const customise = wrap.querySelector('.customise');
    wrap.querySelectorAll('[data-choice]').forEach((b) =>
      b.addEventListener('click', () => apply(all(b.getAttribute('data-choice') === 'allow'))),
    );
    customise.addEventListener('click', () => openPrefs());
    launcher.addEventListener('click', () => open());
    banner.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state().complete) hide();
    });

    (document.body || document.documentElement).appendChild(hostEl);
    ui = { wrap, banner, launcher, customise };
    return ui;
  };

  const hasOwnSettingsLink = () => !!document.querySelector(`${SETTINGS}, ${PREFS_LINK}`);

  const showLauncher = () => {
    if (!optional().length || launcherSide === 'none' || hasOwnSettingsLink()) return;
    const { wrap, launcher } = build();
    wrap.classList.toggle('dark', isDark());
    launcher.hidden = false;
  };

  const hide = () => {
    if (!ui) return;
    ui.banner.hidden = true;
    // Closing the preferences window brings the corner button back by itself.
    if (prefs?.dialog.open) prefs.close();
    else showLauncher();
  };

  const openBanner = () => {
    const { wrap, banner, launcher, customise } = build();
    wrap.classList.toggle('dark', isDark());
    launcher.hidden = true;
    customise.hidden = !prefsMode();
    banner.hidden = false;
    const { on, complete } = state();
    const refused = complete && !optional().every((c) => on[c.id]);
    banner.querySelector(`[data-choice="${refused ? 'deny' : 'allow'}"]`)?.focus({ preventScroll: true });
  };

  // ── Preferences window ───────────────────────────────────────────

  const buildPrefs = () => {
    if (prefs) return prefs;
    const { wrap } = build();
    const dialog = document.createElement('dialog');
    if (typeof dialog.showModal !== 'function') return null;
    dialog.className = 'prefs';
    dialog.setAttribute('aria-labelledby', 'ap-title');
    dialog.innerHTML = `
      <div class="sheet">
        <div class="head">
          <h2 id="ap-title">Cookie preferences</h2>
          <button type="button" class="close" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
        <div class="body">
          <p>This is everything this site keeps in your browser or loads from other companies, grouped by purpose.
            Choose which categories you allow. You can change your mind at any time. <a class="policy">Privacy policy</a></p>
          <p class="note" hidden>Your browser sends a Global Privacy Control signal, so the optional categories stay off.</p>
          <button type="button" class="primary allow-all" data-set="allow">Allow all</button>
          <h3>Manage consent preferences</h3>
          <ul class="cats"></ul>
        </div>
        <div class="foot">
          <button type="button" data-set="reject">Reject all</button>
          <button type="button" data-set="confirm">Confirm my choices</button>
        </div>
      </div>`;
    linkPolicy(dialog.querySelector('a.policy'));

    const list = dialog.querySelector('.cats');
    const switches = {};
    for (const cat of categories()) {
      const li = el('li', 'cat');
      const row = el('div', 'row');
      const expander = el('button', 'expander');
      expander.type = 'button';
      expander.setAttribute('aria-expanded', 'false');
      expander.setAttribute('aria-controls', `ap-panel-${cat.id}`);
      expander.append(el('span', 'plus'), el('span', '', cat.title));
      row.append(expander);
      if (cat.required) row.append(el('span', 'always', 'Always active'));
      else {
        const sw = el('button', 'switch');
        sw.type = 'button';
        sw.setAttribute('role', 'switch');
        sw.setAttribute('aria-label', cat.title);
        sw.disabled = gpc;
        sw.append(el('span', 'knob'));
        sw.addEventListener('click', () => {
          draft[cat.id] = !draft[cat.id];
          sw.setAttribute('aria-checked', String(draft[cat.id]));
        });
        switches[cat.id] = sw;
        row.append(sw);
      }

      const panel = el('div', 'panel');
      panel.id = `ap-panel-${cat.id}`;
      panel.hidden = true;
      if (cat.description) panel.append(el('p', '', cat.description));
      const items = el('ul', 'items');
      for (const it of cat.items) {
        const item = el('li');
        item.append(el('strong', '', it.name));
        const meta = [it.provider, it.type, it.duration].filter(Boolean).join(' · ');
        if (meta) item.append(el('span', 'meta', meta));
        if (it.purpose) item.append(el('span', '', it.purpose));
        items.append(item);
      }
      panel.append(items);
      expander.addEventListener('click', () => {
        panel.hidden = !panel.hidden;
        expander.setAttribute('aria-expanded', String(!panel.hidden));
      });

      li.append(row, panel);
      list.append(li);
    }

    // Nothing optional (no analytics on this host, nothing listed by the site): the window only informs.
    const choosable = optional().length > 0;
    dialog.querySelector('.note').hidden = !(gpc && choosable);
    dialog.querySelector('[data-set="allow"]').hidden = !choosable || gpc;
    dialog.querySelector('[data-set="reject"]').hidden = !choosable;
    if (!choosable) dialog.querySelector('[data-set="confirm"]').textContent = 'Close';

    // Runs once per opening. The dialog's own close event can arrive late (Chrome waits for the next painted
    // frame), so every close we start ourselves tidies up straight away and the event only covers Escape.
    const closed = () => {
      if (!prefs.showing || dialog.open) return;
      prefs.showing = false;
      document.documentElement.style.overflow = prefs.pageOverflow;
      // Closed without an answer on a first visit: the question still stands.
      if (prefs.fromBanner && !state().complete) openBanner();
      else showLauncher();
    };
    const close = () => {
      dialog.close();
      closed();
    };
    dialog.addEventListener('close', closed); // Escape

    dialog.querySelectorAll('[data-set]').forEach((b) =>
      b.addEventListener('click', () => {
        const set = b.getAttribute('data-set');
        if (!choosable) close();
        else apply(gpc || set === 'reject' ? all(false) : set === 'allow' ? all(true) : { ...draft });
      }),
    );
    dialog.querySelector('.close').addEventListener('click', close);
    // A click on the backdrop lands on the dialog itself; a text selection dragged out of the sheet does not count.
    let pressedBackdrop = false;
    dialog.addEventListener('mousedown', (e) => (pressedBackdrop = e.target === dialog));
    dialog.addEventListener('click', (e) => {
      if (pressedBackdrop && e.target === dialog) close();
    });

    wrap.appendChild(dialog);
    prefs = { dialog, switches, close, showing: false, fromBanner: false, pageOverflow: '' };
    return prefs;
  };

  const openPrefs = () => {
    const p = buildPrefs();
    if (!p) return openBanner();
    if (p.dialog.open) return;
    const { wrap, banner, launcher } = ui;
    wrap.classList.toggle('dark', isDark());
    p.fromBanner = !banner.hidden;
    banner.hidden = true;
    launcher.hidden = true;
    draft = gpc ? all(false) : { ...state().on };
    for (const [id, sw] of Object.entries(p.switches)) sw.setAttribute('aria-checked', String(draft[id]));
    // The page behind a modal should not scroll. Set through the CSSOM, so a strict style-src allows it.
    p.pageOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    p.showing = true;
    p.dialog.showModal();
    p.dialog.querySelector('.body').scrollTop = 0;
  };

  const open = () => (prefsMode() ? openPrefs() : openBanner());

  // ── Footer link ──────────────────────────────────────────────────

  const SVG = 'http://www.w3.org/2000/svg';
  const fillLinks = () => {
    document.querySelectorAll(PREFS_LINK).forEach((link) => {
      if (link.firstElementChild || link.textContent.trim()) return;
      const icon = document.createElementNS(SVG, 'svg');
      const attrs = {
        viewBox: '0 0 30 14', width: '2.15em', height: '1em', fill: 'none', stroke: 'currentColor',
        'stroke-width': '1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
      };
      for (const [k, v] of Object.entries(attrs)) icon.setAttribute(k, v);
      const path = document.createElementNS(SVG, 'path');
      path.setAttribute('d', 'M7 .75h16a6.25 6.25 0 010 12.5H7A6.25 6.25 0 017 .75zM6.5 7.2l2.3 2.3 4.2-4.9M18.6 4.5l5 5m0-5l-5 5');
      icon.append(path);
      icon.style.verticalAlign = '-0.15em';
      icon.style.marginRight = '0.45em';
      link.replaceChildren(icon, 'Cookie preferences');
    });
  };

  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element && e.target.closest(`${SETTINGS}, ${PREFS_LINK}`);
    if (!t) return;
    e.preventDefault();
    if (t.matches(PREFS_LINK)) openPrefs();
    else open();
  });

  window.AtlesqueConsent = {
    open,
    openPreferences: openPrefs,
    get: (id = 'analytics') => {
      if (gpc) return false;
      const x = saved(read(), id);
      return typeof x === 'boolean' ? x : null;
    },
    reset: () => {
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      if (beaconLoaded) location.reload();
      else if (optional().length) openBanner();
    },
  };

  const start = () => {
    fillLinks();
    if (prefsEverywhere && document.body) {
      // Client-rendered footers come and go; fill their links as they appear.
      let queued = false;
      new MutationObserver(() => {
        if (queued) return;
        queued = true;
        setTimeout(() => {
          queued = false;
          fillLinks();
        }, 100);
      }).observe(document.body, { childList: true, subtree: true });
    }
    // Nothing to ask where nothing optional is used (localhost and preview hosts have no analytics).
    if (gpc || !optional().length) return;
    const { on, complete } = state();
    if (read()) announce(on);
    if (on.analytics) loadBeacon();
    if (complete) showLauncher();
    else openBanner();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
