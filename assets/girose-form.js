/* Girose Patrimoine — moteur commun des formulaires
 *
 * Chaque formulaire contient uniquement ses questions (HTML) et appelle GP.init({...}).
 * Fonctions prises en charge ici :
 *  - navigation par étapes (#step0, #step1…), barre de progression ;
 *  - champs obligatoires : .field-group[data-req="Libellé"] ;
 *  - affichage conditionnel : [data-if="champ=valeur1|valeur2;autre=val"], [data-if-gt="champ:0"] ;
 *  - case exclusive : <input type="checkbox" data-exclusive> (décoche les autres cases du même nom) ;
 *  - compteurs (boutons − / +), bulles d'aide (.info-btn[data-tip]), ventilations à 100 % (.vent) ;
 *  - pré-remplissage par lien (#d=…) et mode conseiller (#conseiller) ; cfg.noLink exclut des champs du lien ;
 *  - pied de page légal, mentions RGPD, envoi Formspree.
 * Aucune donnée client n'est écrite dans la page : elles ne transitent que par le fragment # du lien.
 */
(function () {
  var cfg = {};
  var form, currentStep = 0, nbSteps = 0, isAdmin = false;

  // ---------- Textes communs ----------
  var FOOTER_HTML =
    '<div class="legal-line"><strong>Girose Patrimoine</strong> — 13 rue Henri Regnault, 92210 Saint-Cloud — 01 88 61 25 65 — <a href="mailto:contact@girose-patrimoine.fr">contact@girose-patrimoine.fr</a> — <a href="https://www.girose-patrimoine.fr" target="_blank" rel="noopener">www.girose-patrimoine.fr</a></div>' +
    '<div class="legal-line">SAS au capital de 5 000 € — SIREN 913 770 160 — RCS Nanterre — TVA intracommunautaire FR88913770160 — Enregistrée à l\'ORIAS sous le n° 22003796 (<a href="https://www.orias.fr" target="_blank" rel="noopener">www.orias.fr</a>) en qualité de courtier en assurances (catégorie B), membre de l\'association Endya, association professionnelle agréée par l\'ACPR. Garantie financière et assurance de RCP souscrites auprès de MMA IARD (n° 233206).</div>' +
    '<details class="legal"><summary>Mentions légales et protection des données personnelles</summary>' +
    '<p><strong>Protection des données personnelles.</strong> Les informations recueillies dans ce formulaire sont collectées et traitées par Girose Patrimoine, en qualité de responsable de traitement au sens du Règlement Général sur la Protection des Données (RGPD), afin d\'étudier votre demande et de vous adresser une proposition adaptée. Elles pourront être communiquées aux partenaires et fournisseurs de Girose Patrimoine dans le cadre des propositions et services fournis en sa qualité d\'intermédiaire. Sauf exceptions, elles sont conservées pendant toute la durée de la relation contractuelle, puis archivées pendant cinq ans. Conformément à la loi Informatique et Libertés n° 78-17 du 6 janvier 1978 modifiée et au règlement (UE) 2016/679, vous disposez d\'un droit d\'opposition, d\'accès, de rectification, de suppression, de limitation, de portabilité et de directive après décès sur les données vous concernant, en écrivant à <a href="mailto:dpo@girose-patrimoine.fr">dpo@girose-patrimoine.fr</a>. En cas d\'insatisfaction, vous pouvez adresser une réclamation à la CNIL (<a href="https://www.cnil.fr" target="_blank" rel="noopener">www.cnil.fr</a>).</p>' +
    '<p><strong>Réclamations et médiation.</strong> Vous pouvez adresser une réclamation à votre conseiller habituel, qui en accusera réception sous 10 jours et y répondra dans un délai de deux mois à compter de sa réception. À défaut d\'arrangement amiable, vous pouvez saisir La Médiation de l\'Assurance — TSA 50110 — 75441 Paris Cedex 09 — <a href="mailto:le.mediateur@mediation-assurance.org">le.mediateur@mediation-assurance.org</a>.</p>' +
    '<p><strong>Autorité de tutelle.</strong> Autorité de Contrôle Prudentiel et de Résolution (ACPR) — 4 place de Budapest — CS 92459 — 75436 Paris Cedex 09.</p>' +
    '<p><a href="girose-patrimoine-entree-en-relation-2026.pdf" target="_blank" rel="noopener">Consulter notre document d\'entrée en relation (PDF)</a></p></details>';

  var RGPD_HTML = 'Vos données sont traitées par Girose Patrimoine pour l\'étude de votre demande et pourront être transmises aux assureurs consultés. Vous disposez de droits sur ces données (accès, rectification, suppression…) : voir les mentions légales en bas de page ou écrire à <a href="mailto:dpo@girose-patrimoine.fr" style="color:inherit">dpo@girose-patrimoine.fr</a>.';
  var DECLARATION_HTML = 'En validant ce formulaire, vous certifiez l\'exactitude des informations déclarées. Toute réticence ou fausse déclaration intentionnelle peut entraîner la nullité du contrat (art. L.113-8 du Code des assurances) ; toute omission ou déclaration inexacte peut entraîner une réduction des indemnités (art. L.113-9).';

  var ADMIN_HTML =
    '<div class="inner"><div class="title">Mode conseiller — non visible par le client</div>' +
    '<div class="desc">Vérifiez et complétez les réponses : aucune réponse n\'est obligatoire dans ce mode, les étapes et le bouton « Suivant » ne bloquent pas. Générez ensuite le lien à envoyer au client. Les données figurent uniquement dans le lien, pas dans la page.</div>' +
    '<div class="row"><button type="button" class="btn btn-primary" onclick="makeClientLink()">Générer le lien client</button>' +
    '<input id="clientLink" readonly placeholder="Le lien client apparaîtra ici">' +
    '<button type="button" class="btn" onclick="copyLink()">Copier</button></div></div>';

  // ---------- Outils ----------
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function norm(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function byName(name) { return form.querySelectorAll('[name="' + name + '"]'); }
  function hidden(el) { return !!el.closest('.cond-hidden'); }

  function val(name) {
    var els = byName(name);
    if (!els.length) return '';
    var el = els[0];
    if (el.type === 'radio') { var c = form.querySelector('[name="' + name + '"]:checked'); return c ? c.value : ''; }
    if (el.type === 'checkbox') {
      if (els.length === 1) return el.checked ? el.value : '';
      return Array.prototype.filter.call(els, function (x) { return x.checked; }).map(function (x) { return x.value; });
    }
    return el.value;
  }

  function condOk(cond) {
    return cond.split(';').every(function (part) {
      var k = part.indexOf('='), name = part.slice(0, k), wanted = part.slice(k + 1).split('|');
      var v = val(name);
      if (Array.isArray(v)) return wanted.some(function (w) { return v.indexOf(w) >= 0; });
      return wanted.indexOf(v) >= 0;
    });
  }

  function refresh() {
    document.querySelectorAll('[data-if]').forEach(function (el) { el.classList.toggle('cond-hidden', !condOk(el.getAttribute('data-if'))); });
    document.querySelectorAll('[data-if-gt]').forEach(function (el) {
      var p = el.getAttribute('data-if-gt').split(':');
      el.classList.toggle('cond-hidden', !((parseFloat(val(p[0])) || 0) > parseFloat(p[1])));
    });
    if (cfg.onRefresh) cfg.onRefresh();
  }

  function showToast(msg, ok) {
    var t = document.getElementById('toast');
    t.textContent = (ok ? '✓ ' : '⚠️ ') + msg;
    t.classList.toggle('ok', !!ok);
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove('show'); }, 3500);
  }

  // ---------- Compteurs ----------
  function step(name, d) {
    var el = form.querySelector('[name="' + name + '"]');
    var v = el.value === '' ? 0 : (parseInt(el.value, 10) || 0) + d;
    v = Math.max(parseInt(el.min, 10) || 0, Math.min(parseInt(el.max, 10) || 999, v));
    el.value = v;
    refresh();
  }

  // ---------- Ventilations liées (total 100 %) ----------
  function initVent(group) {
    var a = form.querySelector('[name="' + group.dataset.a + '"]'), b = form.querySelector('[name="' + group.dataset.b + '"]');
    var range = group.querySelector('input[type=range]'), total = group.querySelector('.total');
    function show() {
      var t = (parseFloat(a.value) || 0) + (parseFloat(b.value) || 0);
      total.textContent = 'Ventilation totale ' + t + ' %';
      total.classList.toggle('ok', t === 100 && a.value !== '' && b.value !== '');
      if (a.value !== '' && range) range.value = a.value;
    }
    function clamp(x) { return Math.max(0, Math.min(100, Math.round(parseFloat(x) || 0))); }
    a.addEventListener('input', function () { if (a.value !== '') { a.value = clamp(a.value); b.value = 100 - a.value; } show(); });
    b.addEventListener('input', function () { if (b.value !== '') { b.value = clamp(b.value); a.value = 100 - b.value; } show(); });
    if (range) range.addEventListener('input', function () { a.value = range.value; b.value = 100 - range.value; show(); });
    group._show = show;
  }

  // ---------- Navigation ----------
  function goStep(n) {
    var pills = document.querySelectorAll('.step-pill');
    document.getElementById('step' + currentStep).classList.remove('active');
    pills[currentStep].classList.remove('active');
    if (n > currentStep) pills[currentStep].classList.add('done');
    currentStep = n;
    document.getElementById('step' + currentStep).classList.add('active');
    pills.forEach(function (p, i) { p.classList.toggle('active', i === currentStep); });
    document.getElementById('progressFill').style.width = ((currentStep + 1) / nbSteps * 100) + '%';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function pillClick(n) {
    if (isAdmin || n < currentStep) { goStep(n); return; }
    for (var s = currentStep; s < n; s++) { if (!validateStep(s)) { if (s !== currentStep) goStep(s); return; } }
    goStep(n);
  }
  function nextStep() {
    // Mode conseiller : navigation libre, sans contrôle des réponses obligatoires
    if ((isAdmin || validateStep(currentStep)) && currentStep < nbSteps - 1) goStep(currentStep + 1);
  }
  function prevStep() { if (currentStep > 0) goStep(currentStep - 1); }

  // ---------- Validation ----------
  function groupIsEmpty(group) {
    var choices = group.querySelectorAll('input[type=radio],input[type=checkbox]');
    if (choices.length) return Array.prototype.filter.call(choices, function (c) { return c.checked && !hidden(c); }).length === 0;
    var el = Array.prototype.find.call(group.querySelectorAll('input,select,textarea'), function (x) { return !hidden(x) && x.type !== 'range'; });
    if (!el || !el.value.trim()) return true;
    if (el.type === 'email') return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value);
    if (el.pattern) return !new RegExp('^(?:' + el.pattern + ')$').test(el.value.trim());
    if (el.type === 'number') { var n = parseFloat(el.value); if ((el.min !== '' && n < +el.min) || (el.max !== '' && n > +el.max)) return true; }
    return false;
  }
  function markError(group, msg) {
    group.classList.add('error');
    var hint = document.createElement('div');
    hint.className = 'error-hint';
    hint.textContent = '⚠ ' + msg;
    group.appendChild(hint);
  }
  function validateStep(s) {
    var stepEl = document.getElementById('step' + s);
    stepEl.querySelectorAll('.field-group.error').forEach(function (g) {
      g.classList.remove('error');
      g.querySelectorAll(':scope > .error-hint').forEach(function (h) { h.remove(); });
    });
    var errors = [];
    function err(group, msg) { markError(group, msg); errors.push(group); }
    stepEl.querySelectorAll('.field-group[data-req]').forEach(function (group) {
      if (hidden(group) || !groupIsEmpty(group)) return;
      err(group, group.getAttribute('data-req') + ' : réponse obligatoire ou invalide');
    });
    stepEl.querySelectorAll('.vent').forEach(function (g) {
      if (hidden(g)) return;
      var a = val(g.dataset.a), b = val(g.dataset.b);
      if (a === '' || b === '' || (+a) + (+b) !== 100) err(g, 'La ventilation doit totaliser 100 %');
    });
    if (cfg.validate) cfg.validate(s, err);
    if (errors.length) {
      showToast('Veuillez compléter les réponses signalées');
      errors[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    return true;
  }

  // ---------- Lien pré-rempli (fragment #, jamais transmis au serveur) ----------
  function collect() {
    var data = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.type === 'button' || (cfg.noLink && cfg.noLink.test(el.name))) return;
      if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; return; }
      if (el.type === 'checkbox') {
        if (!el.checked) return;
        if (byName(el.name).length > 1) (data[el.name] = data[el.name] || []).push(el.value);
        else data[el.name] = el.value;
        return;
      }
      if (el.value !== '') data[el.name] = el.value;
    });
    return data;
  }
  function encode(obj) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return JSON.parse(decodeURIComponent(escape(atob(s))));
  }
  function applyData(data) {
    Object.keys(data).forEach(function (name) {
      var v = data[name];
      byName(name).forEach(function (el) {
        if (el.type === 'radio') el.checked = el.value === v;
        else if (el.type === 'checkbox') el.checked = Array.isArray(v) ? v.indexOf(el.value) >= 0 : el.value === v;
        else el.value = v;
      });
    });
  }
  function readHash() {
    var h = location.hash.replace(/^#/, ''), params = {};
    h.split('&').forEach(function (p) { if (!p) return; var k = p.indexOf('='); if (k < 0) params[p] = true; else params[p.slice(0, k)] = p.slice(k + 1); });
    return params;
  }
  function makeClientLink() {
    var url = location.href.split('#')[0] + '#d=' + encode(collect());
    var input = document.getElementById('clientLink');
    input.value = url;
    input.select();
    showToast('Lien client généré', true);
  }
  function copyLink() {
    var input = document.getElementById('clientLink');
    if (!input.value) makeClientLink();
    (navigator.clipboard ? navigator.clipboard.writeText(input.value) : Promise.reject()).then(
      function () { showToast('Lien copié', true); },
      function () { input.select(); document.execCommand('copy'); showToast('Lien copié', true); });
  }

  // ---------- Envoi ----------
  function fmtValue(el) {
    var m;
    if (el.type === 'date' && (m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(el.value))) return m[3] + '/' + m[2] + '/' + m[1];
    if (el.type === 'month' && (m = /^(\d{4})-(\d{2})$/.exec(el.value))) return m[2] + '/' + m[1];
    return el.value;
  }
  async function submitFormData() {
    if (isAdmin) { showToast('Mode conseiller : utilisez « Générer le lien client » pour envoyer le formulaire au client'); return; }
    for (var s = 0; s < nbSteps; s++) { if (!validateStep(s)) { goStep(s); setTimeout(function () { validateStep(currentStep); }, 50); return; } }
    var btn = document.getElementById('submitBtn'), label = btn.textContent;
    btn.textContent = 'Envoi en cours…';
    btn.disabled = true;
    var fd = new FormData(), lists = {};
    fd.append('_subject', cfg.subject ? cfg.subject() : 'Recueil des besoins — ' + (cfg.formulaire || ''));
    fd.append('formulaire', cfg.formulaire || '');
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || hidden(el) || (cfg.skip && cfg.skip.test(el.name))) return;
      if ((el.type === 'radio' || el.type === 'checkbox') && !el.checked) return;
      if (el.type === 'checkbox' && byName(el.name).length > 1) { (lists[el.name] = lists[el.name] || []).push(el.value); return; }
      if (el.value === '') return;
      fd.append(el.name, fmtValue(el));
    });
    Object.keys(lists).forEach(function (k) { fd.append(k, lists[k].join(' ; ')); });
    if (cfg.beforeSubmit) cfg.beforeSubmit(fd);
    try {
      var response = await fetch(cfg.formspree || 'https://formspree.io/f/xwlpkzyn', { method: 'POST', body: fd, headers: { 'Accept': 'application/json' } });
      var data = await response.json();
      if (!data.ok) throw new Error('ko');
      form.style.display = 'none';
      document.querySelector('.progress-steps').style.display = 'none';
      document.querySelector('.progress-bar').style.display = 'none';
      document.getElementById('successWrap').style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      btn.textContent = label;
      btn.disabled = false;
      alert('Une erreur est survenue lors de l\'envoi. Vérifiez votre connexion internet et réessayez.');
    }
  }

  // ---------- Initialisation ----------
  function init(config) {
    cfg = config || {};
    form = document.getElementById('mainForm');
    nbSteps = document.querySelectorAll('.step-content').length;

    // Éléments communs
    var toast = document.createElement('div'); toast.className = 'toast'; toast.id = 'toast'; document.body.prepend(toast);
    var footer = document.createElement('div'); footer.className = 'form-footer'; footer.innerHTML = FOOTER_HTML;
    document.querySelector('.form-wrap').appendChild(footer);
    var bar = document.createElement('div'); bar.className = 'admin-bar'; bar.innerHTML = ADMIN_HTML; document.body.appendChild(bar);
    document.querySelectorAll('[data-gp="rgpd"]').forEach(function (el) { el.className = 'info-box'; el.innerHTML = cfg.rgpdHtml || RGPD_HTML; });
    document.querySelectorAll('[data-gp="declaration"]').forEach(function (el) { el.className = 'info-box'; el.innerHTML = DECLARATION_HTML; });
    if (!document.getElementById('successWrap')) {
      var sw = document.createElement('div'); sw.className = 'success-wrap'; sw.id = 'successWrap';
      sw.innerHTML = '<span class="success-icon">✅</span><div class="success-title">Demande envoyée avec succès !</div><p class="success-text">' +
        (cfg.successText || 'Votre conseiller Girose Patrimoine a bien reçu vos informations.<br>Il revient vers vous dans les plus brefs délais avec une proposition.') + '</p>';
      form.after(sw);
    }

    // Bulles d'aide
    document.addEventListener('click', function (e) {
      var b = e.target.closest('.info-btn');
      if (!b) return;
      e.preventDefault();
      var t = document.getElementById(b.getAttribute('data-tip'));
      var open = !t.classList.contains('open');
      t.classList.toggle('open', open);
      b.setAttribute('aria-expanded', open);
    });

    // Cases exclusives (ex. « Aucune »)
    form.addEventListener('change', function (e) {
      var el = e.target;
      if (el.type === 'checkbox' && el.checked) {
        byName(el.name).forEach(function (o) {
          if (o !== el && (el.hasAttribute('data-exclusive') || o.hasAttribute('data-exclusive'))) o.checked = false;
        });
      }
      refresh();
    });
    form.addEventListener('input', function (e) { if (e.target.type === 'number' || e.target.tagName === 'SELECT') refresh(); });

    document.querySelectorAll('.vent').forEach(initVent);

    // Pré-remplissage et mode conseiller
    var p = readHash();
    if (p.d) { try { applyData(decode(p.d)); } catch (e) { console.warn('Lien de pré-remplissage illisible'); } }
    if (p.conseiller) { isAdmin = true; document.body.classList.add('admin'); }

    document.querySelectorAll('.vent').forEach(function (g) { g._show(); });
    if (cfg.afterRestore) cfg.afterRestore();
    refresh();
  }

  // API
  window.GP = { init: init, val: val, refresh: refresh, esc: esc, norm: norm, showToast: showToast, isAdmin: function () { return isAdmin; } };
  window.nextStep = nextStep; window.prevStep = prevStep; window.pillClick = pillClick;
  window.step = step; window.refresh = refresh;
  window.makeClientLink = makeClientLink; window.copyLink = copyLink; window.submitFormData = submitFormData;
})();
