// Rendu de la zone d'état + indicateur sur « Mettre à jour » (badge / coche).
let lastBehind = 0;

function row(label, value, cls) {
  return '<div class="status-row' + (cls ? ' ' + cls : '') + '">' +
    '<span class="label">' + label + '</span>' +
    '<span class="value">' + value + '</span></div>';
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function ago(ts) {
  if (!ts) return '';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return 'il y a ' + m + ' min';
  return 'il y a ' + Math.round(m / 60) + ' h';
}
/** Date et heure locales d'un horodatage : « 14/10/2026 16:41 » ('' si absent). */
function stamp(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/** Badge animé (nb de commits distants) ou coche de validation si tout est synchro. */
function updateSyncIndicator(behind, synced) {
  const badge = document.getElementById('pull-badge');
  const ok = document.getElementById('pull-ok');
  if (behind > 0) {
    badge.textContent = String(behind);
    badge.classList.remove('hidden');
    if (lastBehind !== behind) {
      badge.classList.remove('pop');
      void badge.offsetWidth; // force le redémarrage de l'animation
      badge.classList.add('pop');
    }
    ok.classList.add('hidden');
  } else {
    badge.classList.add('hidden');
    badge.classList.remove('pop');
    ok.classList.toggle('hidden', !synced);
  }
  lastBehind = behind;
}

function renderStatus(msg) {
  const el = document.getElementById('status');
  const state = msg && msg.state;
  // États sans données git : chargement en cours, silence de l'extension, ou
  // diagnostic d'erreur envoyé par le host (panne d'un volet du panneau).
  if (state === 'loading') {
    el.innerHTML = row('État', 'Chargement…');
    updateSyncIndicator(0, false);
    return;
  }
  if (state === 'no-answer') {
    el.innerHTML = row('État',
      'Aucune réponse de l’extension — ouvre la console du panneau', 'danger');
    updateSyncIndicator(0, false);
    return;
  }
  if (state === 'error') {
    el.innerHTML = row('État', 'Erreur : ' + esc(msg.message || 'inconnue'), 'danger');
    updateSyncIndicator(0, false);
    return;
  }
  if (state === 'no-folder') {
    el.innerHTML = row('État', 'Aucun dossier ouvert');
    updateSyncIndicator(0, false);
    return;
  }
  if (state === 'no-repo') {
    el.innerHTML = row('État', 'Repo non initialisé — étape 1', 'warn');
    updateSyncIndicator(0, false);
    return;
  }
  const s = msg && msg.data;
  if (!s) {
    // Message « ok » sans données : jamais de zone muette, on le signale.
    el.innerHTML = row('État', 'État indisponible', 'warn');
    updateSyncIndicator(0, false);
    return;
  }
  const lines = [];
  if (s.isDetached) lines.push(row('Branche', 'HEAD détaché', 'warn'));
  else if (!s.branch) lines.push(row('Branche', 'Aucun commit encore'));
  else lines.push(row('Branche', s.branch));
  if (!s.hasRemote) lines.push(row('Remote', 'Aucun — crée un repo GitHub', 'warn'));
  else if (s.remoteUrl) {
    lines.push(row('Remote',
      '<a class="status-link" data-url="' + s.remoteUrl + '">Voir sur GitHub ↗</a>'));
  }
  // Dépôt cloud ↔ compte actif : nom, propriétaire, rôle (défini dans repo.js).
  if (typeof repoRows === 'function') {
    repoRows(s).forEach(function (line) { lines.push(line); });
  }
  if (s.hasRemote && s.checkedAt && !s.upstream) {
    lines.push(row('Distant', 'Aucune branche — pousse au moins une fois', 'warn'));
  }
  if (s.lastCommit) {
    // Date + heure d'un côté, message de l'autre : le message d'un commit est
    // souvent long, la date seule se lit d'un coup d'œil.
    // « (local) » dès qu'un remote existe : ces deux lignes décrivent le dossier
    // ouvert, pas le dépôt cloud (qui a ses propres commits, plus bas). Sans
    // cette précision, un dépôt GitHub recréé ou renommé laissait croire que
    // l'affichage était figé.
    const what = s.hasRemote ? 'Dernier commit (local)' : 'Dernier commit';
    if (s.lastCommitAt) {
      const who = s.lastAuthor ? ' (' + esc(s.lastAuthor) + ')' : '';
      lines.push(row(what, stamp(s.lastCommitAt) + who));
    }
    lines.push(row('Message', esc(s.lastCommit)));
  } else {
    // Dépôt initialisé mais aucun commit : le dire, plutôt que de laisser la
    // zone muette (même exigence que la liste des dépôts).
    lines.push(row('Dernier commit', 'Aucun commit en local', 'warn'));
  }
  if (s.checkedAt) lines.push(row('Vérifié', ago(s.checkedAt)));
  if (s.opLabel) lines.push(row('Opération', esc(s.opLabel) + ' — à terminer ou annuler', 'danger'));
  if (s.conflicts > 0) lines.push(row('Conflits', s.conflicts + ' à résoudre', 'danger'));
  if (s.staged > 0) lines.push(row('Indexés', s.staged + ' fichier(s)', 'warn'));
  if (s.modified > 0) lines.push(row('Modifiés', s.modified + ' non commité(s)', 'warn'));
  if (s.ahead > 0) lines.push(row('À pousser', s.ahead + ' commit(s)', 'warn'));
  if (s.behind > 0) {
    lines.push(row('À récupérer', s.behind + ' commit(s) distant(s)', 'danger'));
    if (s.remoteCommits && s.remoteCommits.length) {
      lines.push('<ul class="commit-list">' + s.remoteCommits.map(function (c) {
        return '<li><strong>' + esc(c.author) + '</strong> · ' +
          esc(c.when) + ' — ' + esc(c.subject) + '</li>';
      }).join('') + '</ul>');
    }
  }
  const synced = s.modified === 0 && s.ahead === 0 && s.behind === 0 && s.hasRemote &&
    !s.conflicts && !(s.checkedAt && !s.upstream);
  if (synced) lines.push(row('Sync', 'À jour avec le cloud', 'ok'));
  el.innerHTML = lines.join('');
  el.querySelectorAll('.status-link').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      post('openExternal', { url: a.dataset.url });
    });
  });
  updateSyncIndicator(s.behind, synced);
}
