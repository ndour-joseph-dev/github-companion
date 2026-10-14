// Panneau côté EXTENSION (host) : ordre des envois et visibilité des pannes.
// Le bug d'origine était ici : l'état des comptes partait en premier, une panne
// (réseau, stockage) faisait échouer l'envoi et la carte d'état restait vide,
// sans le moindre message. Ces tests verrouillent « le panneau n'est jamais muet ».
const { load, vscode, ROOT } = require('../harness/load');
const a = require('../harness/assert');
const G = require('../harness/git');

const { GithubCompanionViewProvider } = load('features/panel/index.js', true);

/** Faux token : ne doit apparaître NI au webview NI dans une notification. */
const FAKE_TOKEN = 'ghp_' + 'A'.repeat(36);
const SECRET_FAIL = `stockage des secrets indisponible (${FAKE_TOKEN})`;

/** Vue webview simulée : tout ce que le host envoie est capturé. */
function fakeView() {
  const view = {
    visible: true,
    posted: [],
    webview: {
      html: '',
      options: {},
      cspSource: 'vscode-webview://test',
      asWebviewUri: (uri) => uri,
      postMessage(msg) {
        view.posted.push(msg);
        return Promise.resolve(true);
      },
      onDidReceiveMessage(cb) {
        view.onMessage = cb;
        return { dispose() {} };
      }
    },
    onDidChangeVisibility(cb) {
      view.onVisibility = cb;
      return { dispose() {} };
    },
    onDidDispose(cb) {
      view.onDispose = cb;
      return { dispose() {} };
    }
  };
  return view;
}

/**
 * Contexte minimal. `secretsFail` simule un stockage des secrets en panne :
 * c'est par là que la liste des comptes peut échouer (disque, coffre verrouillé).
 * `accounts` amorce des comptes déjà enregistrés (avec leur token).
 */
function fakeContext(options) {
  const opts = options || {};
  const mem = {};
  return {
    subscriptions: [],
    extensionUri: { fsPath: ROOT, toString: () => 'file://' + ROOT },
    secrets: {
      get: async () => {
        if (opts.secretsFail) throw new Error(opts.secretsFail);
        return opts.accounts ? JSON.stringify(opts.accounts) : undefined;
      },
      store: async (k, v) => {
        mem.secrets = v;
      },
      delete: async () => {
        mem.secrets = undefined;
      }
    },
    globalState: {
      get: (k) => mem['g:' + k],
      update: async (k, v) => {
        mem['g:' + k] = v;
      }
    },
    workspaceState: {
      get: (k) => mem['w:' + k],
      update: async (k, v) => {
        mem['w:' + k] = v;
      }
    }
  };
}

/** Suite des messages envoyés, type (+ état) : l'ordre est significatif. */
const kinds = (view) => view.posted.map((m) => m.type + (m.state ? ':' + m.state : ''));
const lastStatus = (view) => view.posted.filter((m) => m.type === 'status').pop();
const errors = () => vscode.__state.messages.filter((m) => m.level === 'error').map((m) => m.text);

/** Attend qu'une condition devienne vraie (rafraîchissement de fond du host). */
async function waitFor(cond, ms = 500) {
  const end = Date.now() + ms;
  while (Date.now() < end && !cond()) await new Promise((r) => setTimeout(r, 5));
  return cond();
}


(async () => {
  // 1. Aucun dossier ouvert : l'état git part AVANT les comptes.
  vscode.__reset();
  const provider = new GithubCompanionViewProvider(fakeContext());
  const view = fakeView();
  await provider.resolveWebviewView(view);
  a.eq(kinds(view), ['status:no-folder', 'settings'],
    'l’état git précède les comptes (l’écran n’attend pas le réseau)');
  a.eq(lastStatus(view).state, 'no-folder', 'sans dossier ouvert, le panneau reçoit un état explicite');
  a.eq(view.posted[1].autoSync, false, 'le réglage auto-sync accompagne l’état (défaut false)');
  a.eq(view.posted[1].accounts, [], 'aucun compte : liste vide explicite, jamais un champ absent');
  a.inc(view.webview.html, 'account-menu', 'le HTML réel du panneau est chargé dans la vue');
  a.ok(view.webview.html.indexOf('__CORE_JS__') === -1, 'les URI des scripts sont substituées');
  a.ok(view.webview.html.indexOf('__ACCOUNTS_CSS__') === -1, 'les URI des styles sont substituées');

  // 2. Comptes lisibles : transmis au panneau, sans le token (priorité n°1).
  const withAccount = new GithubCompanionViewProvider(fakeContext({
    accounts: [{ id: 'alice', login: 'alice', token: FAKE_TOKEN, repoCount: 3 }]
  }));
  const view2 = fakeView();
  await withAccount.resolveWebviewView(view2);
  a.eq(view2.posted[1].accounts.length, 1, 'le compte enregistré est transmis au panneau');
  a.eq(view2.posted[1].accounts[0], { id: 'alice', login: 'alice', active: true, repoCount: 3 },
    'les comptes partent sans token ni champ interne');
  a.ok(view2.posted.every((m) => JSON.stringify(m).indexOf(FAKE_TOKEN) === -1),
    'aucun message du host ne contient le token');

  // 3. Comptes en panne : l'état git part quand même, puis un diagnostic visible.
  vscode.__reset();
  const broken = new GithubCompanionViewProvider(fakeContext({ secretsFail: SECRET_FAIL }));
  const view3 = fakeView();
  await broken.resolveWebviewView(view3);
  a.eq(kinds(view3), ['status:no-folder', 'notice'],
    'une panne des comptes devient un « notice » au lieu d’une liste vide muette');
  a.inc(view3.posted[1].message, 'Comptes indisponibles', 'le diagnostic nomme ce qui a échoué');
  a.inc(view3.posted[1].message, '***', 'le détail est nettoyé (le token devient « *** »)');
  a.ok(view3.posted[1].message.indexOf(FAKE_TOKEN) === -1,
    'le diagnostic envoyé au webview ne contient jamais le token');
  a.inc(errors().join(' | '), 'comptes indisponibles', 'l’utilisateur est aussi prévenu par VS Code');
  a.ok(errors().join(' | ').indexOf(FAKE_TOKEN) === -1,
    'la notification VS Code ne contient jamais le token');

  // 4. Dossier git + compte en panne : l'étape qui échoue devient un état « error ».
  const dir = G.tmpRepo('panelhost');
  G.write(dir, 'a.txt', 'a\n');
  G.commit(dir, 'init');
  G.sh(dir, ['remote', 'add', 'origin', 'https://github.com/octo/demo.git']);
  vscode.__state.folders = [{ uri: { fsPath: dir } }];
  const repo = new GithubCompanionViewProvider(fakeContext({ secretsFail: SECRET_FAIL }));
  const view4 = fakeView();
  await repo.resolveWebviewView(view4);
  a.eq(kinds(view4), ['status:ok', 'status:error', 'notice'],
    'une étape en panne devient un état « error » visible, pas un silence');
  const failure = lastStatus(view4);
  a.inc(failure.message, 'le rôle du compte sur le dépôt cloud', 'le diagnostic nomme l’étape en panne');
  a.inc(failure.message, 'indisponible', 'le message dit clairement ce qui manque');
  a.ok(failure.message.indexOf(FAKE_TOKEN) === -1, 'aucun token dans l’état d’erreur');
  a.eq(view4.posted[0].data.branch, 'main', 'l’état git local est arrivé avant la panne des comptes');

  // 5. « ready » du webview (rechargement) : l'état repart en entier.
  const before = view4.posted.length;
  await view4.onMessage({ type: 'ready' });
  a.ok(view4.posted.length > before, 'un « ready » du webview relance l’état complet');
  a.eq(kinds(view4).slice(before)[0], 'status:ok', 'le rechargement recommence par l’état git');

  // 6. Retour de visibilité : rafraîchissement de fond (masqué : rien du tout).
  view4.visible = false;
  const hidden = view4.posted.length;
  await view4.onVisibility();
  a.eq(view4.posted.length, hidden, 'une vue masquée ne reçoit aucun message');
  view4.visible = true;
  await view4.onVisibility();
  a.ok(await waitFor(() => view4.posted.length > hidden),
    'une vue réaffichée récupère son état (promesse non attendue par VS Code)');

  // 7. Vue détruite : le host n'écrit plus dans une webview morte.
  view4.onDispose();
  const disposed = view4.posted.length;
  await repo.pushState();
  a.eq(view4.posted.length, disposed, 'après destruction, le host n’envoie plus rien');

  a.done('panelHost');
})().catch((error) => {
  console.error('✗ exception hors assertions :', error);
  process.exit(1);
});

