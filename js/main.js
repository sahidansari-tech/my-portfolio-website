/**
 * ═══════════════════════════════════════════════════════════════════════
 *  SAHID ANSARI — PORTFOLIO  |  main.js
 *  Advanced Frontend Architecture with DSA-Optimised Patterns
 *
 *  Data Structures used:
 *  ─ Map         : O(1) tab lookup, O(1) section map, O(1) skill registry
 *  ─ WeakMap     : Per-element reveal state (no memory leaks)
 *  ─ Set         : Deduplicated observer targets
 *  ─ Array (sorted) : Binary-search active section detection  O(log n)
 *  ─ Queue (array)  : Toast notification queue
 *  ─ Trie concept   : Typewriter character sequence
 *
 *  Patterns:
 *  ─ Debounce  : resize handler
 *  ─ Throttle  : scroll handler via rAF
 *  ─ Observer  : IntersectionObserver for reveal + active nav
 *  ─ Module pattern via ES class
 * ═══════════════════════════════════════════════════════════════════════
 */

'use strict';

/* ══════════════════════════════════════════════════════════════════════
   SKILLS DATA — single source of truth
   DSA: Array<Object> → rendered via Map for O(1) icon-color lookup
══════════════════════════════════════════════════════════════════════ */
const SKILLS = [
  { name: 'Python',      sub: 'Data Science, AI/ML',      icon: 'python/python-original.svg',             glow: '37,118,171' },
  { name: 'C',           sub: 'System Programming',       icon: 'c/c-original.svg',                       glow: '0,89,156'   },
  { name: 'HTML5',       sub: 'Semantic Markup',          icon: 'html5/html5-original.svg',               glow: '227,76,38'  },
  { name: 'CSS3',        sub: 'Responsive Design',        icon: 'css3/css3-original.svg',                 glow: '21,114,182' },
  { name: 'JavaScript',  sub: 'ES6+, DOM Manipulation',   icon: 'javascript/javascript-original.svg',     glow: '247,223,30' },
  { name: 'Git',         sub: 'Version Control',          icon: 'git/git-original.svg',                   glow: '240,80,50'  },
];

const DEVICONS_BASE = 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/';

/* ══════════════════════════════════════════════════════════════════════
   UTILITY — Pure functions, no side effects
══════════════════════════════════════════════════════════════════════ */

/**
 * Debounce: delays fn until after `wait` ms have elapsed since last call.
 * Used for resize events to avoid thrashing layout.
 * @param {Function} fn
 * @param {number}   wait ms
 * @returns {Function}
 */
function debounce(fn, wait = 150) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

/**
 * Throttle via requestAnimationFrame — fires at most once per frame.
 * Used for scroll handlers to maintain 60 fps.
 * @param {Function} fn
 * @returns {Function}
 */
function throttleRAF(fn) {
  let rafId = null;
  return function (...args) {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      fn.apply(this, args);
      rafId = null;
    });
  };
}

/**
 * Binary search — finds the last section whose top <= scrollMid.
 * O(log n) vs O(n) linear scan.
 * @param {Array<{id:string, top:number}>} sorted  ascending by top
 * @param {number} scrollMid  current scroll midpoint
 * @returns {string|null} active section id
 */
function binarySearchActiveSection(sorted, scrollMid) {
  let lo = 0, hi = sorted.length - 1, result = null;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;           // unsigned right shift = Math.floor((lo+hi)/2)
    if (sorted[mid].top <= scrollMid) {
      result = sorted[mid].id;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

/**
 * Typewriter — writes characters one by one using a recursive setTimeout.
 * @param {HTMLElement} el
 * @param {string}      text
 * @param {number}      speed ms per char
 */
function typewriter(el, text, speed = 85) {
  el.textContent = '';
  let i = 0;
  const tick = () => {
    if (i < text.length) {
      el.textContent += text[i++];
      setTimeout(tick, speed);
    }
  };
  tick();
}

/* ══════════════════════════════════════════════════════════════════════
   TOAST QUEUE — Array used as FIFO queue
══════════════════════════════════════════════════════════════════════ */
class ToastQueue {
  constructor() {
    /** @type {Array<{message:string, type:string}>} */
    this._queue = [];
    this._active = false;
  }

  /** Enqueue a toast */
  push(message, type = 'info') {
    this._queue.push({ message, type });
    if (!this._active) this._flush();
  }

  /** Dequeue and display */
  _flush() {
    if (!this._queue.length) { this._active = false; return; }
    this._active = true;
    const { message, type } = this._queue.shift();
    this._show(message, type, () => this._flush());
  }

  _show(message, type, onDone) {
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', 'polite');

    const icon = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' }[type] ?? 'fa-info-circle';
    el.innerHTML = `<i class="fas ${icon}" aria-hidden="true"></i><span>${message}</span>`;
    document.body.appendChild(el);

    setTimeout(() => {
      el.classList.add('out');
      el.addEventListener('animationend', () => { el.remove(); onDone(); }, { once: true });
    }, 3200);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   PORTFOLIO MANAGER — Main controller class
══════════════════════════════════════════════════════════════════════ */
class PortfolioManager {
  constructor() {
    /**
     * DSA: Map<string, HTMLElement>
     * O(1) tab content lookup instead of querySelector on every click
     */
    this._tabPanels = new Map();

    /**
     * DSA: Map<string, HTMLButtonElement>
     * O(1) tab button lookup
     */
    this._tabBtns = new Map();

    /**
     * DSA: WeakMap<HTMLElement, boolean>
     * Tracks whether a reveal-item has already been animated.
     * WeakMap: elements can be GC'd naturally — no memory leak.
     */
    this._revealed = new WeakMap();

    /**
     * DSA: Set<HTMLElement>
     * Deduplicated set of elements observed by IntersectionObserver.
     * Prevents double-registering the same node.
     */
    this._observed = new Set();

    /**
     * DSA: Array<{id, top}> sorted ascending — enables O(log n) active-section detection
     * Rebuilt on resize via debounce.
     */
    this._sectionOffsets = [];

    /** Toast queue */
    this.toast = new ToastQueue();

    this._init();
  }

  /* ──────────────────────── INIT ──────────────────────────────────── */
  _init() {
    /* Add .js-ready FIRST — switches reveal-items from always-visible to animated */
    document.body.classList.add('js-ready');

    this._buildTabMaps();
    this._setupRevealObserver();   // MUST come before _renderSkills (which calls _observe)
    this._renderSkills();
    this._setupNav();
    this._setupTabs();
    this._setupScrollHandler();
    this._setupResizeHandler();
    this._setupForm();
    this._setupFooterYear();
    this._buildSectionOffsets();

    /* Typewriter on hero name after 800ms */
    const tw = document.getElementById('typewriter-target');
    if (tw) setTimeout(() => typewriter(tw, 'Sahid Ansari', 80), 800);

    /* CV download button */
    document.getElementById('cv-download-btn')
      ?.addEventListener('click', () => this._downloadCV());

    /* Certificates — delegate to cert-card clicks */
    this._setupCertCards();

    console.log('%c🚀 Portfolio Ready', 'color:#6366f1;font-weight:700;font-size:14px');
  }

  /* ──────────────────────── TAB MAP (DSA: Map) ─────────────────────── */
  _buildTabMaps() {
    document.querySelectorAll('.tab-panel').forEach(panel => {
      // Strip "tab-" prefix so key matches data-tab value on buttons
      // e.g. panel.id="tab-projects" → key="projects"
      const key = panel.id.replace(/^tab-/, '');
      this._tabPanels.set(key, panel);
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
      this._tabBtns.set(btn.dataset.tab, btn);
    });
  }

  /* ──────────────────────── SKILLS RENDERER ────────────────────────── */
  _renderSkills() {
    const grid = document.getElementById('skills-grid');
    if (!grid) return;

    /* DSA: Map for O(1) icon-src construction per skill */
    const iconMap = new Map(SKILLS.map(s => [s.name, `${DEVICONS_BASE}${s.icon}`]));

    const fragment = document.createDocumentFragment();   // batch DOM insert — 1 reflow

    SKILLS.forEach(skill => {
      const item = document.createElement('div');
      item.className = 'skill-item reveal-item';
      item.setAttribute('role', 'listitem');
      item.setAttribute('aria-label', skill.name);

      item.innerHTML = `
        <img
          src="${iconMap.get(skill.name)}"
          alt="${skill.name} icon"
          width="72" height="72"
          loading="lazy"
        />
        <span class="skill-name">${skill.name}</span>
        <span class="skill-sub">${skill.sub}</span>
      `;

      /* Coloured glow on hover */
      const [r, g, b] = skill.glow.split(',');
      item.addEventListener('mouseenter', () => {
        item.style.boxShadow = `0 16px 48px rgba(${r},${g},${b},.28)`;
        item.style.borderColor = `rgba(${r},${g},${b},.45)`;
      });
      item.addEventListener('mouseleave', () => {
        item.style.boxShadow = '';
        item.style.borderColor = '';
      });

      fragment.appendChild(item);
    });

    grid.appendChild(fragment);

    /* Register new items with the reveal observer */
    grid.querySelectorAll('.reveal-item').forEach(el => this._observe(el));
  }

  /* ──────────────────────── NAV SETUP ──────────────────────────────── */
  _setupNav() {
    /* Mobile toggle */
    const toggle = document.getElementById('nav-toggle');
    const list   = document.getElementById('nav-list');
    if (toggle && list) {
      toggle.addEventListener('click', () => {
        const open = list.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(open));
        toggle.querySelector('i').className = open ? 'fas fa-times' : 'fas fa-bars';
      });

      /* Close on nav link click */
      list.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
          list.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
          toggle.querySelector('i').className = 'fas fa-bars';
        });
      });

      /* Close on outside click */
      document.addEventListener('click', e => {
        if (!toggle.contains(e.target) && !list.contains(e.target)) {
          list.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
          toggle.querySelector('i').className = 'fas fa-bars';
        }
      });
    }

    /* Smooth scroll — intercept all anchor hrefs */
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener('click', e => {
        const target = document.querySelector(a.getAttribute('href'));
        if (!target) return;
        e.preventDefault();
        const headerH = document.getElementById('site-header')?.offsetHeight ?? 68;
        window.scrollTo({ top: target.offsetTop - headerH - 8, behavior: 'smooth' });
      });
    });
  }

  /* ──────────────────────── BUILD SECTION OFFSETS (DSA: sorted array) ─ */
  _buildSectionOffsets() {
    const ids = ['home', 'about', 'portfolio', 'contact'];
    this._sectionOffsets = ids
      .map(id => {
        const el = document.getElementById(id);
        return el ? { id, top: el.offsetTop } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.top - b.top);    // ensure ascending order
  }

  /* ──────────────────────── SCROLL HANDLER (Throttle + Binary Search) ─ */
  _setupScrollHandler() {
    const header = document.getElementById('site-header');
    const navLinks = document.querySelectorAll('.nav-link');

    /** DSA: Map<string, HTMLAnchorElement> for O(1) active-link update */
    const linkMap = new Map(
      [...navLinks].map(l => [l.dataset.section, l])
    );

    let prevActive = null;

    const onScroll = throttleRAF(() => {
      const scrollY = window.scrollY;

      /* Header scrolled class */
      header?.classList.toggle('scrolled', scrollY > 60);

      /* Active nav: binary search O(log n) */
      const scrollMid = scrollY + window.innerHeight * 0.35;
      const activeId  = binarySearchActiveSection(this._sectionOffsets, scrollMid);

      if (activeId !== prevActive) {
        if (prevActive) linkMap.get(prevActive)?.classList.remove('active');
        if (activeId)   linkMap.get(activeId)?.classList.add('active');
        prevActive = activeId;
      }
    });

    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ──────────────────────── RESIZE HANDLER (Debounce) ─────────────── */
  _setupResizeHandler() {
    const onResize = debounce(() => {
      this._buildSectionOffsets();   // recalculate section tops after layout change
    }, 200);
    window.addEventListener('resize', onResize, { passive: true });
  }

  /* ──────────────────────── TABS ──────────────────────────────────── */
  _setupTabs() {
    this._tabBtns.forEach((btn, tabName) => {
      btn.addEventListener('click', () => this._switchTab(tabName));
    });

    /* Keyboard arrow navigation */
    document.querySelector('.tab-bar')?.addEventListener('keydown', e => {
      const keys = ['ArrowLeft', 'ArrowRight'];
      if (!keys.includes(e.key)) return;
      const tabs  = [...this._tabBtns.keys()];
      const cur   = tabs.findIndex(t => this._tabBtns.get(t).classList.contains('active'));
      const next  = (cur + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      this._switchTab(tabs[next]);
      this._tabBtns.get(tabs[next]).focus();
    });
  }

  /**
   * _switchTab — O(1) Map lookup; cascades staggered reveal-item animation
   * @param {string} tabName
   */
  _switchTab(tabName) {
    /* Hide all panels */
    this._tabPanels.forEach((panel, id) => {
      panel.classList.remove('active');
      panel.hidden = id !== tabName;
    });
    /* Deactivate all buttons */
    this._tabBtns.forEach(btn => {
      btn.classList.remove('active');
      btn.setAttribute('aria-selected', 'false');
    });

    /* Activate target */
    const panel = this._tabPanels.get(tabName);          // O(1)
    const btn   = this._tabBtns.get(tabName);            // O(1)
    if (panel) { panel.classList.add('active'); panel.removeAttribute('hidden'); }
    if (btn)   { btn.classList.add('active');   btn.setAttribute('aria-selected', 'true'); }

    /* ── Reveal cards in the newly-active panel ──────────────────────────
       Fix: add .visible class directly (reliable) with CSS transition stagger.
       Old rAF+setTimeout inline-style approach had race conditions.         */
    if (panel) {
      requestAnimationFrame(() => {
        panel.querySelectorAll('.reveal-item').forEach((el, i) => {
          el.style.opacity        = '';   // clear any leftover inline styles
          el.style.transform      = '';
          el.style.transition     = '';
          el.style.transitionDelay = i * 0.07 + 's';   // stagger

          el.classList.add('visible');          // CSS: opacity 0→1
          this._revealed.set(el, true);         // WeakMap: mark done

          if (this._observed.has(el)) {
            this._revealObserver.unobserve(el);
            this._observed.delete(el);          // clean Set
          }
        });
      });
    }
  }

  /* ──────────────────────── REVEAL OBSERVER (WeakMap + Set) ──────────── */
  _setupRevealObserver() {
    this._revealObserver = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting)              return;
          if (this._revealed.get(entry.target))   return;  // WeakMap: already done

          entry.target.classList.add('visible');
          this._revealed.set(entry.target, true);          // mark as revealed
          this._revealObserver.unobserve(entry.target);    // stop watching
          this._observed.delete(entry.target);             // clean Set
        });
      },
      {
        threshold:  0.08,
        rootMargin: '0px 0px 0px 0px'   // no negative margin — avoids items near fold staying invisible
      }
    );

    /* Observe all existing reveal-items */
    document.querySelectorAll('.reveal-item').forEach(el => this._observe(el));

    /* Safety net — reveal anything already fully in viewport after one frame.
       Handles case where IntersectionObserver fires before paint completes. */
    requestAnimationFrame(() => {
      this._observed.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          el.classList.add('visible');
          this._revealed.set(el, true);
          this._revealObserver.unobserve(el);
          this._observed.delete(el);
        }
      });
    });
  }

  /**
   * Register element with observer — Set prevents duplicates O(1)
   * Safely guards against calling before _revealObserver is initialised.
   * @param {HTMLElement} el
   */
  _observe(el) {
    if (!this._revealObserver) return;        // guard: observer not ready yet
    if (this._observed.has(el))  return;      // O(1) Set dedup check
    this._observed.add(el);
    this._revealObserver.observe(el);
  }

  /* ──────────────────────── CERT CARDS ───────────────────────────── */
  _setupCertCards() {
    document.querySelectorAll('.cert-card[data-cert-id]').forEach(card => {
      const open = () => {
        if (typeof showCertificateImage === 'function') {
          showCertificateImage(card.dataset.certId);
        }
      };
      card.addEventListener('click', open);
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });

    /* View buttons inside cert cards */
    document.querySelectorAll('.cert-view-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const card = btn.closest('.cert-card[data-cert-id]');
        if (card && typeof showCertificateImage === 'function') {
          showCertificateImage(card.dataset.certId);
        }
      });
    });
  }

  /* ──────────────────────── CONTACT FORM ─────────────────────────── */
  _setupForm() {
    const form = document.getElementById('contact-form');
    const btn  = document.getElementById('form-submit');
    if (!form || !btn) return;

    form.addEventListener('submit', e => {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }

      const label = btn.querySelector('.btn__label');
      const icon  = btn.querySelector('.btn__icon');

      /* Loading state */
      label.textContent = 'Sending…';
      if (icon) { icon.className = 'fas fa-spinner fa-spin btn__icon'; }
      btn.disabled = true;

      /* Simulate async send (replace with fetch/EmailJS in production) */
      setTimeout(() => {
        this.toast.push('Message sent successfully! 🚀', 'success');
        form.reset();
        label.textContent = 'Send Message';
        if (icon) { icon.className = 'fas fa-paper-plane btn__icon'; }
        btn.disabled = false;
      }, 1800);
    });
  }

  /* ──────────────────────── FOOTER YEAR ──────────────────────────── */
  _setupFooterYear() {
    const el = document.getElementById('footer-year');
    if (el) el.textContent = new Date().getFullYear();
  }

  /* ──────────────────────── CV DOWNLOAD ──────────────────────────── */
  _downloadCV() {
    const cvText = `
SAHID ANSARI
B.Tech CSE (AI/ML) Student
sahidansari2906@gmail.com | Kolkata, India
LinkedIn: linkedin.com/in/sahidansari19 | GitHub: github.com/sahidansari

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EDUCATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• B.Tech Computer Science Engineering (AI & ML)
  Brainware University, Kolkata  |  2024 – 2028

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TECHNICAL SKILLS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Python • C Programming • HTML5 • CSS3 • JavaScript • Git
Machine Learning • Natural Language Processing
Data Analysis • Web Development

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROJECTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• AI Virtual Assistant  [In Progress]
  Intelligent assistant powered by AI/ML for NLP and task automation.
  Technologies: Python, NLP, Machine Learning

• Smart Attendance System  [In Progress]
  Face-recognition attendance system using OpenCV & Flask with SQLite.
  Technologies: Python, Flask, OpenCV, SQLite

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CERTIFICATES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• AI Tools Workshop — Be10x (2025)
  ChatGPT and AI Tools for enhanced productivity.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INTERESTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Artificial Intelligence • Machine Learning • Web Development
Technology Innovation • Problem Solving
    `.trim();

    const blob = new Blob([cvText], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'Sahid_Ansari_CV.txt' });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.toast.push('CV downloaded! 📄', 'success');
  }

  /* ──────────────────────── PUBLIC API ────────────────────────────── */
  showNotification(msg, type = 'info') { this.toast.push(msg, type); }
}

/* ══════════════════════════════════════════════════════════════════════
   ANIMATION KEYFRAMES — injected once (not duplicated in CSS)
══════════════════════════════════════════════════════════════════════ */
(function injectAnimStyles() {
  const css = `
    @keyframes slideInRight { from { transform:translateX(110%); opacity:0; } to { transform:translateX(0); opacity:1; } }
    @keyframes slideOutRight { from { transform:translateX(0); opacity:1; } to { transform:translateX(110%); opacity:0; } }
  `;
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
})();

/* ══════════════════════════════════════════════════════════════════════
   BOOT
══════════════════════════════════════════════════════════════════════ */

/** @type {PortfolioManager} */
let portfolioManager;

document.addEventListener('DOMContentLoaded', () => {
  portfolioManager = new PortfolioManager();

  /* Initialise first tab (projects is default active) */
  portfolioManager._switchTab('projects');

  /* Page-load fade-in */
  document.body.style.opacity = '0';
  document.body.style.transition = 'opacity .4s ease';
  requestAnimationFrame(() => { document.body.style.opacity = '1'; });
});

/* ── Global legacy shims (referenced by HTML onclick) ── */
function downloadCV()             { portfolioManager?.downloadCV?.() || portfolioManager?._downloadCV(); }
function handleFormSubmit(event)  { event.preventDefault(); /* handled by class */ }

/* Error boundary */
window.addEventListener('error',             e => console.error('JS Error:',      e.error));
window.addEventListener('unhandledrejection', e => console.error('Unhandled Rejection:', e.reason));
