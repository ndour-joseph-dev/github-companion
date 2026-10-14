'use strict';
// Harnais « webview » : exécute pour de vrai les scripts du panneau (media/*.js)
// dans un DOM minimal, comme le fait VS Code. Les autres tests ne lisent que le
// TEXTE de ces fichiers ; ici ils tournent, ce qui attrape les bugs d'exécution
// (variable non définie, message mal formé, id absent du HTML…).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT } = require('./load');

const MEDIA = path.join(ROOT, 'media');
/** Scripts du panneau, dans l'ordre de chargement de media/panel.html. */
const SCRIPTS = ['panel.js', 'status.js', 'repo.js', 'accounts.js'];

/** Liens <a class="…" data-url="…"> réellement présents dans le HTML rendu. */
function linksIn(html, selector) {
  const wanted = String(selector || '').replace(/^\./, '');
  const out = [];
  const re = /<a\s+class="([^"]*)"\s+data-url="([^"]*)"[^>]*>/g;
  let m;
  while ((m = re.exec(String(html || '')))) {
    const classes = m[1].split(/\s+/).filter(Boolean);
    if (wanted && !classes.includes(wanted)) continue;
    const handlers = {};
    out.push({
      className: m[1],
      dataset: { url: m[2] },
      addEventListener(type, cb) {
        handlers[type] = cb;
      },
      click(ev) {
        if (handlers.click) handlers.click(ev);
      }
    });
  }
  return out;
}

/**
 * Élément DOM minimal : tout ce que les scripts du panneau manipulent.
 * `classes`/`attrs` amorcent l'élément (options <li> rendues par du HTML).
 */
function makeElement(id, classes, attrs) {
  const classSet = new Set(classes || []);
  const attributes = Object.assign({}, attrs);
  // `hidden` est un attribut booléen : sa seule présence masque l'élément (ex. le
  // menu du sélecteur de comptes, replié au chargement du panneau).
  const initiallyHidden = Object.prototype.hasOwnProperty.call(attributes, 'hidden');
  const listeners = {};
  const linkCache = new Map();
  const childCache = new Map();
  const el = {
    id,
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    disabled: false,
    hidden: initiallyHidden,
    offsetWidth: 0,
    dataset: {},
    parentElement: null,
    onclick: null,
    onchange: null,
    onkeydown: null,
    onblur: null,
    classList: {
      add: (c) => classSet.add(c),
      remove: (c) => classSet.delete(c),
      contains: (c) => classSet.has(c),
      toggle: (c, force) => {
        const on = force === undefined ? !classSet.has(c) : !!force;
        if (on) classSet.add(c);
        else classSet.delete(c);
        return on;
      }
    },
    get classes() {
      return [...classSet];
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    removeAttribute(name) {
      delete attributes[name];
    },
    get children() {
      return liChildren(el, childCache);
    },
    /** Un nœud est « dans » cet élément s'il descend de lui (clic dans le menu). */
    contains(node) {
      for (let n = node; n; n = n.parentElement) {
        if (n === el) return true;
      }
      return false;
    },
    addEventListener(type, cb) {
      (listeners[type] = listeners[type] || []).push(cb);
    },
    querySelectorAll(selector) {
      return theLinks(el, linkCache, selector);
    },
    links(selector) {
      return theLinks(el, linkCache, selector || '.status-link');
    }
  };
  return el;
}

/** Options <li …> rendues dans un conteneur (le menu du sélecteur de comptes). */
function liChildren(el, cache) {
  const key = el.id + '\u0000' + el.innerHTML;
  if (cache.has(key)) return cache.get(key);
  const out = [];
  const re = /<li\b([^>]*)>/g;
  let m;
  while ((m = re.exec(String(el.innerHTML || '')))) {
    const attrs = {};
    for (const a of m[1].matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    const child = makeElement(attrs.id || 'option-' + out.length,
      String(attrs.class || '').split(/\s+/).filter(Boolean), attrs);
    child.dataset = { id: attrs['data-id'] };
    child.parentElement = el;
    out.push(child);
  }
  cache.set(key, out);
  return out;
}

/**
 * Même HTML rendu → mêmes liens : un gestionnaire posé au moment du rendu reste
 * joignable depuis le test, comme sur un vrai nœud du DOM.
 */
function theLinks(el, cache, selector) {
  const key = selector + '\u0000' + el.innerHTML;
  if (!cache.has(key)) cache.set(key, linksIn(el.innerHTML, selector));
  return cache.get(key);
}

/** ids câblés par les scripts du panneau (getElementById('x')), sans doublon. */
function wiredIds() {
  const ids = new Set();
  for (const file of SCRIPTS) {
    const src = fs.readFileSync(path.join(MEDIA, file), 'utf8');
    for (const m of src.matchAll(/getElementById\('([^']+)'\)/g)) ids.add(m[1]);
  }
  return [...ids];
}

/** ids déclarés dans media/panel.html. */
function htmlIds() {
  const html = fs.readFileSync(path.join(MEDIA, 'panel.html'), 'utf8');
  return [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
}
/**
 * Attributs déclarés dans media/panel.html, par id : l'état de départ du DOM
 * (ex. `hidden` sur le menu du sélecteur, `aria-expanded="false"` sur le bouton).
 * Sans cela, un élément simulé démarrerait « propre » alors que le vrai panneau
 * le livre déjà masqué, et les tests d'ouverture/fermeture seraient faux.
 */
function htmlAttrs() {
  const html = fs.readFileSync(path.join(MEDIA, 'panel.html'), 'utf8');
  const out = {};
  for (const tag of html.matchAll(/<[a-z][^>]*?\sid="([^"]+)"([^>]*)>/gi)) {
    const attrs = {};
    for (const a of tag[2].matchAll(/([a-zA-Z-]+)(?:="([^"]*)")?/g)) {
      attrs[a[1]] = a[2] === undefined ? '' : a[2];
    }
    out[tag[1]] = attrs;
  }
  return out;
}

/** État initial du DOM lu une seule fois dans media/panel.html. */
const INITIAL_ATTRS = htmlAttrs();



/**
 * Charge le panneau dans un DOM simulé.
 * Toutes les méthodes renvoient { ok, error } : une exception du panneau fait
 * échouer l'assertion au lieu d'interrompre le test.
 * `options.origin` : origine de la vue (défaut « vscode-webview://test »).
 */
function boot(options) {
  const opts = options || {};
  const elements = new Map();
  const listeners = { window: {}, document: {} };
  const posted = [];
  const warns = [];
  const errors = [];
  const state = Object.assign({}, opts.state);

  const doc = {
    hidden: false,
    getElementById(id) {
      const key = String(id);
      if (!elements.has(key)) {
        // L'élément naît avec les attributs du HTML réel : `hidden`,
        // `aria-expanded="false"`, classes de départ… comme dans le panneau.
        const attrs = INITIAL_ATTRS[key] || {};
        elements.set(key, makeElement(key,
          String(attrs.class || '').split(/\s+/).filter(Boolean), attrs));
      }
      return elements.get(key);
    },
    addEventListener(type, cb) {
      (listeners.document[type] = listeners.document[type] || []).push(cb);
    },
    querySelectorAll() {
      return [];
    }
  };
  const viewOrigin = opts.origin || 'vscode-webview://test';
  const win = {
    addEventListener(type, cb) {
      (listeners.window[type] = listeners.window[type] || []).push(cb);
    },
    // Origine de la vue : VS Code y sert le panneau ET envoie ses messages
    // (« vscode-webview://<uuid> » au bureau). Le panneau compare les deux.
    location: { origin: viewOrigin, href: viewOrigin + '/panel.html' }
  };
  // VS Code réassigne « window.parent = window » dans le cadre interne (script
  // « _vscodeApiScript » injecté en tête du panneau) : le host ne doit donc PAS être
  // simulé comme « window.parent ». C'est ce que fait le vrai panneau en
  // production, et c'est pour cela qu'un test d'identité de l'émetteur bloquait
  // tous les messages du host (état « Aucune réponse de l'extension »).
  win.parent = win;
  win.top = win;
  win.frameElement = null;
  /** La page hôte : une AUTRE fenêtre que le panneau (le shell de VS Code). */
  const hostWindow = { fenetre: 'shell' };

  const timers = [];
  let nextTimer = 0;
  const sandbox = {
    console: {
      log() {},
      warn(...args) {
        warns.push(args.map(String).join(' '));
      },
      error(...args) {
        warns.push(args.map(String).join(' '));
      }
    },
    window: win,
    location: win.location,
    document: doc,
    // Minuteurs simulés : le diagnostic « pas de réponse » est testé sans attendre.
    setTimeout: (fn, ms) => {
      timers.push({ id: ++nextTimer, fn, ms });
      return nextTimer;
    },
    clearTimeout: (id) => {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
    acquireVsCodeApi: () => ({
      postMessage: (msg) => posted.push(msg),
      getState: () => state,
      setState: (patch) => Object.assign(state, patch)
    })
  };
  const ctx = vm.createContext(sandbox);
  for (const file of SCRIPTS) {
    try {
      // Chemin absolu : la couverture (V8) doit pouvoir rattacher le script au
      // fichier réel de media/ (le panneau est exécuté, pas seulement lu).
      vm.runInContext(fs.readFileSync(path.join(MEDIA, file), 'utf8'), ctx,
        { filename: path.join(MEDIA, file) });
    } catch (error) {
      errors.push({ file, error });
    }
  }

  function attempt(fn, ...args) {
    try {
      fn(...args);
      return { ok: true };
    } catch (error) {
      return { ok: false, error };
    }
  }
  function dispatch(pool, type, event) {
    let result = { ok: true };
    for (const cb of pool[type] || []) {
      const r = attempt(cb, event);
      if (!r.ok) result = r;
    }
    return result;
  }

  return {
    ctx,
    posted,
    warns,
    state,
    errors,
    element: (id) => doc.getElementById(id),
    /**
     * Message reçu du host : { data, origin, source } surchargeables. Le host est
     * une AUTRE fenêtre que le panneau et parle depuis l'origine de la vue, comme
     * le shell de VS Code (donc jamais « window.parent », voir plus haut).
     */
    message: (data, extra) =>
      dispatch(listeners.window, 'message',
        Object.assign({ data, origin: win.location.origin, source: hostWindow }, extra || {})),
    /** Panneau (re)chargé : les scripts finissent de s'installer. */
    domReady: () => dispatch(listeners.window, 'DOMContentLoaded', {}),
    /** Vue masquée (true) ou réaffichée (false). */
    visibility: (hidden) => {
      doc.hidden = !!hidden;
      return dispatch(listeners.document, 'visibilitychange', {});
    },
    /** Événement clavier minimal : le panneau appelle preventDefault(). */
    key: (name) => ({ key: name, preventDefault() {} }),
    /** Clic ailleurs dans le panneau (fermeture du sélecteur, ex. menu ouvert). */
    click: (target) => dispatch(listeners.document, 'click', { target: target || {} }),
    /** Minuteurs encore programmés (diagnostic de silence de l'extension). */
    pendingTimers: () => timers.length,
    /** Déclenche les minuteurs simulés, dans l'ordre de programmation. */
    runTimers: () => {
      const due = timers.splice(0, timers.length);
      let result = { ok: true, count: due.length };
      for (const t of due) {
        const r = attempt(t.fn);
        if (!r.ok) result = { ok: false, error: r.error, count: due.length };
      }
      return result;
    },
    /** Déclenche onclick/onchange d'un élément identifié par son id. */
    fire: (id, prop, event) => {
      const fn = doc.getElementById(id)[prop];
      if (typeof fn !== 'function') {
        return { ok: false, error: new Error(`aucun gestionnaire ${prop} sur #${id}`) };
      }
      return attempt(fn, event || {});
    }
  };
}

module.exports = { boot, linksIn, wiredIds, htmlIds, htmlAttrs, SCRIPTS, MEDIA };
