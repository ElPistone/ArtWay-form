(function () {
  "use strict";

  const CFG = window.PSM_CONFIG;
  const MB = 1024 * 1024;
  const VISUAL_TYPES = ["image/jpeg", "image/png", "image/webp"];
  const DRAFT_KEY = "psm25-brouillon-v1";
  const startedAt = Date.now();

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const form = $("#psm-form");
  const steps = $$(".step", form);
  const projectsEl = $("#projects");
  const tpl = $("#project-template");
  const prevBtn = $("#prev");
  const nextBtn = $("#next");
  const globalError = $("#global-error");

  let current = 0;
  let maxReached = 0;
  let returnToRecap = false;
  let sending = false;
  let sent = false;
  let dirty = false;
  const RECAP = steps.length - 1;

  /* =====================================================================
     Initialisation
     ===================================================================== */

  // Lancé à la fin du fichier, une fois toutes les constantes définies.

  function fillRgpd() {
    $$("[data-rgpd]").forEach((el) => { el.textContent = CFG.RGPD[el.dataset.rgpd] || ""; });
  }

  function fillYears() {
    const select = $("#annee");
    for (let y = CFG.LAST_YEAR; y >= CFG.FIRST_YEAR; y--) {
      const label = `${y}-${y + 1}`;
      select.add(new Option(y === CFG.LAST_YEAR ? `${label} (en cours)` : label, label));
    }
    select.add(new Option("Autre", "Autre"));
    select.addEventListener("change", syncYear);
  }

  function syncYear() {
    const val = $("#annee").value;
    $("#annee-autre-wrap").hidden = val !== "Autre";
    $("#niveau-wrap").hidden = val === "";
  }

  function checkDeadline() {
    const deadline = new Date(CFG.DEADLINE);
    $("#deadline-text").textContent = "Le formulaire est ouvert jusqu'au " +
      deadline.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }) + " inclus.";
    if (Date.now() > deadline.getTime()) {
      form.hidden = true;
      $(".stepper").hidden = true;
      $("#closed").hidden = false;
    }
  }

  /* =====================================================================
     Navigation par étapes (visibilité + mapping)
     ===================================================================== */

  function buildStepper() {
    const list = $("#stepper-list");
    steps.forEach((step, i) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.innerHTML = `<span class="dot">${i + 1}</span><span class="name"></span>`;
      $(".name", btn).textContent = step.dataset.title;
      btn.addEventListener("click", () => jumpTo(i));
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function renderStepper() {
    $$("#stepper-list li").forEach((li, i) => {
      const done = i <= maxReached && i !== current;
      li.className = i === current ? "current" : done ? "done" : "";
      const btn = $("button", li);
      btn.disabled = sending || (!done && i !== current);
      $(".dot", li).textContent = done ? "✓" : i + 1;
      btn.setAttribute("aria-label", `Étape ${i + 1} : ${steps[i].dataset.title}` +
        (i === current ? " (étape en cours)" : done ? " (terminée, cliquer pour y revenir)" : " (à venir)"));
      if (i === current) btn.setAttribute("aria-current", "step"); else btn.removeAttribute("aria-current");
    });
    $("#stepper-label").innerHTML = `Étape ${current + 1} sur ${steps.length} <span>· ${steps[current].dataset.title}</span>`;
    $("#stepper-fill").style.width = Math.round((current / (steps.length - 1)) * 100) + "%";
  }

  function goTo(i, dir, focus = true) {
    steps.forEach((s, k) => {
      s.hidden = k !== i;
      s.classList.toggle("back", dir < 0);
    });
    current = i;
    maxReached = Math.max(maxReached, i);
    document.body.classList.toggle("started", i !== 0); // en-tête plus compact une fois le formulaire commencé
    $("#intro").hidden = i !== 0; // consignes visibles au départ, puis place au contenu de l'étape
    if (i === RECAP) { returnToRecap = false; buildRecap(); }
    globalError.textContent = "";

    updateNav();
    renderStepper();

    if (focus) {
      $(".stepper").scrollIntoView({ behavior: "smooth", block: "start" });
      const h = $("h2", steps[i]);
      if (h) h.focus({ preventScroll: true });
    }
  }

  function updateNav() {
    // Précédent à gauche, Suivant à droite : le sens des boutons suit le sens du parcours.
    prevBtn.style.visibility = current === 0 ? "hidden" : "visible";
    if (current === RECAP) {
      nextBtn.innerHTML = 'Envoyer ma réponse <span aria-hidden="true">✓</span>';
      nextBtn.classList.add("send");
    } else if (returnToRecap) {
      nextBtn.innerHTML = 'Revenir au récapitulatif <span aria-hidden="true">→</span>';
      nextBtn.classList.remove("send");
    } else if (current === RECAP - 1) {
      nextBtn.innerHTML = 'Voir le récapitulatif <span aria-hidden="true">→</span>';
      nextBtn.classList.remove("send");
    } else {
      nextBtn.innerHTML = 'Suivant <span aria-hidden="true">→</span>';
      nextBtn.classList.remove("send");
    }
  }

  async function jumpTo(target) {
    if (target === current || sending) return;
    if (target < current) return goTo(target, -1);
    for (let k = current; k < target; k++) {
      if (!validateStep(k, true)) { if (k !== current) { goTo(k, -1); validateStep(k, true); } return; }
    }
    goTo(target, 1);
  }

  prevBtn.addEventListener("click", () => { if (current > 0 && !sending) goTo(current - 1, -1); });

  // « Entrée » dans un champ et clic sur Suivant passent par ici.
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sending) return;
    if (current === RECAP) return send();

    if (!validateStep(current, true)) return;
    if (current === 0 && !(await checkEmailAvailable())) return;

    const title = steps[current].dataset.title;
    if (returnToRecap) {
      for (let k = current + 1; k < RECAP; k++) {
        if (!validateStep(k, false)) { goTo(k, 1); validateStep(k, true); return; }
      }
      toast(`✓ ${title} : modifications enregistrées`);
      goTo(RECAP, 1);
    } else {
      toast(`✓ Étape « ${title} » complétée`);
      goTo(current + 1, 1);
    }
  });

  function failStep(count) {
    globalError.textContent = count > 1
      ? `${count} champs sont à compléter ou corriger avant de continuer.`
      : "Un champ est à compléter ou corriger avant de continuer.";
    nextBtn.classList.remove("shake");
    void nextBtn.offsetWidth;
    nextBtn.classList.add("shake");
  }

  function setBusy(busy, label) {
    nextBtn.disabled = busy;
    prevBtn.disabled = busy;
    if (busy) nextBtn.innerHTML = `<span class="spinner" aria-hidden="true"></span> ${label}`;
    else updateNav();
  }

  /* =====================================================================
     Validation et retour visuel (feedback)
     ===================================================================== */

  function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }
  function isUrl(v) {
    try { const u = new URL(v); return u.protocol === "http:" || u.protocol === "https:"; } catch (_) { return false; }
  }
  function val(id) { return $("#" + id).value.trim(); }
  function fmtSize(b) { return b >= MB ? (b / MB).toFixed(1).replace(".", ",") + " Mo" : Math.max(1, Math.round(b / 1024)) + " Ko"; }

  const FIELD_RULES = {
    email: (v) => !v ? "Indiquez votre adresse e-mail." : !isEmail(v) ? "Cette adresse e-mail ne semble pas valide (ex. prenom.nom@mail.com)." : "",
    nom: (v) => v ? "" : "Indiquez votre nom.",
    prenom: (v) => v ? "" : "Indiquez votre prénom.",
    annee: (v) => v ? "" : "Choisissez l'année de votre promotion.",
    annee_autre: (v) => val("annee") !== "Autre" || v ? "" : "Précisez l'année de votre promotion.",
    linkedin: (v) => !v || isUrl(v) ? "" : "Le lien doit commencer par https://",
    portfolio: (v) => !v || isUrl(v) ? "" : "Le lien doit commencer par https://"
  };

  /** Affiche l'état d'un champ : erreur (rouge + message) ou valide (vert + ✓). */
  function mark(input, msg, errEl) {
    const control = input.closest(".control");
    const hasValue = input.value.trim() !== "";
    if (control) {
      control.classList.toggle("is-invalid", !!msg);
      control.classList.toggle("is-valid", !msg && hasValue);
    }
    input.setAttribute("aria-invalid", msg ? "true" : "false");
    if (errEl) errEl.textContent = msg || "";
  }

  function checkField(id) {
    const input = $("#" + id);
    const msg = FIELD_RULES[id](input.value.trim());
    mark(input, msg, $(`.error[data-for="${id}"]`));
    return msg;
  }

  function setupLiveValidation() {
    Object.keys(FIELD_RULES).forEach((id) => {
      const input = $("#" + id);
      input.addEventListener("blur", () => { if (input.value.trim() || input.closest(".is-invalid")) checkField(id); });
      input.addEventListener("input", () => { if (input.closest(".is-invalid") || input.closest(".is-valid")) checkField(id); });
      input.addEventListener("change", () => checkField(id));
    });
    $$('input[name="niveau"]').forEach((r) => r.addEventListener("change", () => {
      $('.error[data-for="niveau"]').textContent = "";
      $("#niveau-wrap").classList.remove("is-invalid");
    }));
    form.addEventListener("input", markDirty);
    form.addEventListener("change", markDirty);
  }

  function validateStep(i, show) {
    const errors = [];
    const push = (el) => errors.push(el);

    if (i === 0) {
      ["email", "nom", "prenom"].forEach((id) => { if (checkField(id)) push($("#" + id)); });
    }
    if (i === 1) {
      ["annee", "annee_autre", "linkedin", "portfolio"].forEach((id) => { if (checkField(id)) push($("#" + id)); });
      if (val("annee") && !$('input[name="niveau"]:checked')) {
        $('.error[data-for="niveau"]').textContent = "Choisissez votre niveau : Licence, Master 1 ou Master 2.";
        $("#niveau-wrap").classList.add("is-invalid");
        push($('input[name="niveau"]'));
      }
    }
    if (i === 2) {
      if (!projectsEl.children.length) addProject();
      $$(".project", projectsEl).forEach((node) => validateProject(node).forEach(push));
    }
    if (i === 3) {
      const missing = $$('input[name="auth"]').filter((c) => !c.checked);
      if (missing.length) {
        $('.error[data-for="auth"]').textContent = `Il reste ${missing.length} autorisation${missing.length > 1 ? "s" : ""} à cocher pour figurer dans l'application.`;
        $("#auth-all").closest("fieldset").classList.add("is-invalid");
        push(missing[0]);
      }
    }

    if (errors.length && show) {
      if (i === current) {
        failStep(errors.length);
        errors[0].scrollIntoView({ behavior: "smooth", block: "center" });
        errors[0].focus({ preventScroll: true });
      }
    }
    return errors.length === 0;
  }

  /* =====================================================================
     Fichiers
     ===================================================================== */

  function checkFile(file, types, maxMb, label) {
    if (!types.includes(file.type)) return `« ${file.name} » n'est pas dans un format accepté (${label}).`;
    if (file.size > maxMb * MB) return `« ${file.name} » pèse ${fmtSize(file.size)} : la limite est de ${maxMb} Mo.`;
    return "";
  }

  function setupDropzone(input, handle) {
    const zone = input.closest(".dropzone");
    input.addEventListener("change", () => { handle(Array.from(input.files)); input.value = ""; });
    ["dragenter", "dragover"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("drag"); }));
    ["dragleave", "drop"].forEach((ev) => zone.addEventListener(ev, () => zone.classList.remove("drag")));
    zone.addEventListener("drop", (e) => { e.preventDefault(); handle(Array.from(e.dataTransfer.files)); });
  }

  /* =====================================================================
     Projets
     ===================================================================== */

  $("#add-project").addEventListener("click", () => {
    if (projectsEl.children.length >= CFG.MAX_PROJECTS) {
      toast(`Vous pouvez présenter ${CFG.MAX_PROJECTS} projets au maximum.`);
      return;
    }
    const node = addProject();
    node.scrollIntoView({ behavior: "smooth", block: "start" });
    $(".p-titre", node).focus({ preventScroll: true });
    toast("Nouveau projet ajouté");
  });

  function addProject(data) {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node._rapport = null;
    node._visuels = [];
    projectsEl.appendChild(node);

    // Lie chaque libellé à son champ (accessibilité + zone cliquable plus grande).
    const uid = "p" + Math.random().toString(36).slice(2, 8);
    $$(".p-lbl", node).forEach((lbl) => {
      const input = $(".p-" + lbl.dataset.for, node);
      input.id = `${uid}-${lbl.dataset.for}`;
      lbl.htmlFor = input.id;
    });

    if (data) ["titre", "type", "annee", "resume", "equipe", "lien"].forEach((k) => { $(".p-" + k, node).value = data[k] || ""; });

    $(".remove-project", node).addEventListener("click", () => {
      const title = $(".p-titre", node).value.trim();
      if ((title || node._rapport || node._visuels.length) && !confirm(`Retirer le projet${title ? " « " + title + " »" : ""} ? Ce que vous avez saisi sera perdu.`)) return;
      node.remove();
      renumberProjects();
      saveDraft();
      toast("Projet retiré");
    });

    const titre = $(".p-titre", node);
    titre.addEventListener("input", () => {
      $(".p-head-title", node).textContent = titre.value.trim() ? " · " + titre.value.trim() : "";
    });
    titre.dispatchEvent(new Event("input"));

    const live = (key, rule) => {
      const input = $(".p-" + key, node);
      const run = () => mark(input, rule(input.value.trim()), $(".p-err-" + key, node));
      input.addEventListener("blur", () => { if (input.value.trim() || input.closest(".is-invalid")) run(); });
      input.addEventListener("input", () => { if (input.closest(".is-invalid") || input.closest(".is-valid")) run(); });
      input.addEventListener("change", run);
    };
    live("titre", (v) => v ? "" : "Donnez un titre à ce projet.");
    live("type", (v) => v ? "" : "Choisissez le type de projet.");
    live("lien", (v) => !v || isUrl(v) ? "" : "Le lien doit commencer par https://");
    live("resume", (v) => resumeRule(node, v));

    const resume = $(".p-resume", node);
    const updateCount = () => {
      const n = resume.value.length;
      $(".p-count", node).textContent = n;
      $(".counter", node).classList.toggle("ok", n >= 50);
    };
    resume.addEventListener("input", updateCount);
    updateCount();

    setupDropzone($(".p-rapport", node), (files) => {
      const f = files[0];
      if (!f) return;
      const err = checkFile(f, ["application/pdf"], CFG.MAX_REPORT_MB, "PDF uniquement");
      $(".p-err-rapport", node).textContent = err;
      if (err) return;
      node._rapport = f;
      renderRapport(node);
      toast("✓ Rapport PDF ajouté");
    });

    setupDropzone($(".p-visuels", node), (files) => {
      const errs = [];
      files.forEach((f) => {
        if (node._visuels.length >= CFG.MAX_VISUALS_PER_PROJECT) { errs.push(`Limite de ${CFG.MAX_VISUALS_PER_PROJECT} visuels atteinte : « ${f.name} » n'a pas été ajouté.`); return; }
        const err = checkFile(f, VISUAL_TYPES, CFG.MAX_VISUAL_MB, "JPG, PNG ou WEBP");
        if (err) errs.push(err); else node._visuels.push(f);
      });
      $(".p-err-visuels", node).textContent = errs.join(" ");
      renderVisuels(node);
      const added = files.length - errs.length;
      if (added > 0) toast(`✓ ${added} visuel${added > 1 ? "s" : ""} ajouté${added > 1 ? "s" : ""}`);
    });

    renumberProjects();
    return node;
  }

  function resumeRule(node, v) {
    if (node._rapport || v.length >= 50) return "";
    return v ? `Encore ${50 - v.length} caractères, ou joignez le rapport PDF.` : "Joignez le rapport PDF ou rédigez un résumé (50 caractères minimum).";
  }

  function renderRapport(node) {
    const list = $(".p-rapport-list", node);
    list.innerHTML = "";
    const zone = $(".p-rapport", node).closest(".dropzone");
    zone.classList.toggle("has-file", !!node._rapport);
    $(".dz-text", zone).innerHTML = node._rapport ? "<strong>Remplacer le PDF</strong>" : "<strong>Choisir le PDF</strong> ou le glisser ici";
    if (node._rapport) {
      const li = document.createElement("li");
      li.innerHTML = '<span class="ficon" aria-hidden="true">PDF</span><span class="fname"></span><span class="fsize"></span><button type="button" class="remove-file" aria-label="Retirer le rapport">×</button>';
      $(".fname", li).textContent = node._rapport.name;
      $(".fsize", li).textContent = fmtSize(node._rapport.size);
      $(".remove-file", li).addEventListener("click", () => { node._rapport = null; renderRapport(node); toast("Rapport retiré"); });
      list.appendChild(li);
    }
    // Le résumé devient facultatif quand un rapport est joint
    $(".p-resume-req", node).hidden = !!node._rapport;
    $(".p-resume-hint", node).textContent = node._rapport
      ? "Facultatif : un rapport PDF est joint."
      : "Obligatoire si vous ne joignez pas de rapport PDF (50 caractères minimum).";
    const resume = $(".p-resume", node);
    mark(resume, resume.closest(".is-invalid") ? resumeRule(node, resume.value.trim()) : "", $(".p-err-resume", node));
    markDirty();
  }

  function renderVisuels(node) {
    const box = $(".p-thumbs", node);
    box.innerHTML = "";
    node._visuels.forEach((f, idx) => {
      const div = document.createElement("div");
      div.className = "thumb";
      div.innerHTML = '<img alt=""><span class="fsize"></span><button type="button" class="remove-file">×</button>';
      $("img", div).src = URL.createObjectURL(f);
      $("img", div).alt = f.name;
      $(".fsize", div).textContent = fmtSize(f.size);
      $(".remove-file", div).setAttribute("aria-label", "Retirer " + f.name);
      $(".remove-file", div).addEventListener("click", () => { node._visuels.splice(idx, 1); renderVisuels(node); toast("Visuel retiré"); });
      box.appendChild(div);
    });
    const zone = $(".p-visuels", node).closest(".dropzone");
    const left = CFG.MAX_VISUALS_PER_PROJECT - node._visuels.length;
    $(".dz-text", zone).innerHTML = left > 0
      ? `<strong>Ajouter des images</strong> ou les glisser ici (encore ${left})`
      : "<strong>Limite atteinte</strong> : retirez une image pour en ajouter une autre";
    markDirty();
  }

  function renumberProjects() {
    const list = $$(".project", projectsEl);
    list.forEach((p, i) => {
      $(".p-num", p).textContent = i + 1;
      $(".remove-project", p).hidden = list.length === 1;
    });
    $("#add-project").disabled = list.length >= CFG.MAX_PROJECTS;
  }

  function validateProject(node) {
    const bad = [];
    const check = (key, rule) => {
      const input = $(".p-" + key, node);
      const msg = rule(input.value.trim());
      mark(input, msg, $(".p-err-" + key, node));
      if (msg) bad.push(input);
    };
    check("titre", (v) => v ? "" : "Donnez un titre à ce projet.");
    check("type", (v) => v ? "" : "Choisissez le type de projet.");
    check("resume", (v) => resumeRule(node, v));
    check("lien", (v) => !v || isUrl(v) ? "" : "Le lien doit commencer par https://");
    return bad;
  }

  /* =====================================================================
     Autorisations
     ===================================================================== */

  function setupAuths() {
    const all = $("#auth-all");
    const boxes = $$('input[name="auth"]');
    const sync = () => {
      const n = boxes.filter((b) => b.checked).length;
      all.checked = n === boxes.length;
      all.indeterminate = n > 0 && n < boxes.length;
      const count = $("#auth-count");
      count.textContent = n === boxes.length
        ? "✓ Toutes les autorisations sont accordées."
        : `${n} autorisation${n > 1 ? "s" : ""} sur ${boxes.length} cochée${n > 1 ? "s" : ""}.`;
      count.classList.toggle("ok", n === boxes.length);
      if (n === boxes.length) {
        $('.error[data-for="auth"]').textContent = "";
        all.closest("fieldset").classList.remove("is-invalid");
      }
    };
    all.addEventListener("change", () => { boxes.forEach((b) => (b.checked = all.checked)); sync(); });
    boxes.forEach((b) => b.addEventListener("change", sync));
    sync();
  }

  /* =====================================================================
     Récapitulatif
     ===================================================================== */

  function buildRecap() {
    const recap = $("#recap");
    recap.innerHTML = "";

    const block = (title, stepIndex, rows) => {
      const sec = document.createElement("section");
      sec.className = "recap-block";
      sec.innerHTML = '<header><h3></h3><button type="button" class="btn link">Modifier</button></header><dl></dl>';
      $("h3", sec).textContent = title;
      const btn = $("button", sec);
      btn.setAttribute("aria-label", "Modifier : " + title);
      btn.addEventListener("click", () => { returnToRecap = true; goTo(stepIndex, -1); });
      const dl = $("dl", sec);
      rows.forEach(([label, value]) => {
        if (label === null) {
          const sub = document.createElement("div");
          sub.className = "sub";
          sub.textContent = value;
          dl.appendChild(sub);
          return;
        }
        const dt = document.createElement("dt");
        const dd = document.createElement("dd");
        dt.textContent = label;
        if (value instanceof Node) dd.appendChild(value);
        else if (value) dd.textContent = value;
        else { dd.textContent = "Non renseigné"; dd.className = "empty"; }
        dl.append(dt, dd);
      });
      recap.appendChild(sec);
    };

    block("Identité", 0, [
      ["E-mail", val("email")],
      ["Nom", val("nom")],
      ["Prénom", val("prenom")]
    ]);

    const niveau = $('input[name="niveau"]:checked');
    block("Parcours", 1, [
      ["Promotion", val("annee") === "Autre" ? val("annee_autre") : val("annee")],
      ["Niveau", niveau ? niveau.value : ""],
      ["LinkedIn", val("linkedin")],
      ["Portfolio", val("portfolio")],
      ["Poste actuel", val("poste")],
      ["Entreprise", val("entreprise")]
    ]);

    const rows = [];
    $$(".project", projectsEl).forEach((node, i) => {
      const q = (k) => $(".p-" + k, node).value.trim();
      rows.push([null, `Projet ${i + 1} : ${q("titre")}`]);
      rows.push(["Type", q("type")]);
      rows.push(["Année", q("annee")]);
      rows.push(["Rapport PDF", node._rapport ? `${node._rapport.name} (${fmtSize(node._rapport.size)})` : ""]);
      const resume = q("resume");
      rows.push(["Résumé", resume.length > 300 ? resume.slice(0, 300) + "…" : resume]);
      let visu = "";
      if (node._visuels.length) {
        visu = document.createElement("div");
        visu.className = "recap-thumbs";
        node._visuels.forEach((f) => {
          const img = document.createElement("img");
          img.src = URL.createObjectURL(f);
          img.alt = f.name;
          visu.appendChild(img);
        });
      }
      rows.push(["Visuels", visu]);
      rows.push(["Co-auteurs", q("equipe")]);
      rows.push(["Lien", q("lien")]);
    });
    block(`Projets (${$$(".project", projectsEl).length})`, 2, rows);

    const n = $$('input[name="auth"]:checked').length;
    block("Autorisations", 3, [["Autorisations", `${n} sur ${$$('input[name="auth"]').length} accordées`]]);
  }

  /* =====================================================================
     Brouillon local (textes uniquement)
     ===================================================================== */

  const DRAFT_FIELDS = ["email", "nom", "prenom", "annee", "annee_autre", "linkedin", "portfolio", "poste", "entreprise"];
  let draftTimer = null;

  function markDirty() {
    dirty = true;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraft, 600);
  }

  function saveDraft() {
    if (sent) return;
    try {
      const niveau = $('input[name="niveau"]:checked');
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        fields: Object.fromEntries(DRAFT_FIELDS.map((id) => [id, $("#" + id).value])),
        niveau: niveau ? niveau.value : "",
        auths: $$('input[name="auth"]:checked').map((c) => c.value),
        projects: $$(".project", projectsEl).map((node) => Object.fromEntries(
          ["titre", "type", "annee", "resume", "equipe", "lien"].map((k) => [k, $(".p-" + k, node).value])
        ))
      }));
    } catch (_) { /* stockage indisponible : pas de brouillon */ }
  }

  function restoreDraft() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch (_) { return false; }
    if (!d || !d.fields) return false;
    DRAFT_FIELDS.forEach((id) => { if (d.fields[id]) $("#" + id).value = d.fields[id]; });
    syncYear();
    if (d.niveau) { const r = $(`input[name="niveau"][value="${CSS.escape(d.niveau)}"]`); if (r) r.checked = true; }
    $$('input[name="auth"]').forEach((c) => { c.checked = (d.auths || []).includes(c.value); c.dispatchEvent(new Event("change")); });
    (d.projects && d.projects.length ? d.projects : [null]).forEach((p) => addProject(p));
    if (DRAFT_FIELDS.some((id) => d.fields[id])) setTimeout(() => toast("Vos réponses précédentes ont été restaurées (les fichiers sont à rajouter)."), 400);
    return true;
  }

  window.addEventListener("beforeunload", (e) => {
    if (dirty && !sent) { saveDraft(); e.preventDefault(); e.returnValue = ""; }
  });

  /* =====================================================================
     Messages
     ===================================================================== */

  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  /* =====================================================================
     Envoi
     ===================================================================== */

  function apiConfigured() { return CFG.API_URL && CFG.API_URL.startsWith("https://"); }

  async function api(payload) {
    // Corps en text/plain : pas de requête préalable CORS, compatible avec Apps Script.
    const res = await fetch(CFG.API_URL, { method: "POST", body: JSON.stringify(payload) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  async function checkEmailAvailable() {
    if (!apiConfigured()) return true;
    setBusy(true, "Vérification…");
    try {
      const res = await api({ action: "check", email: val("email").toLowerCase() });
      if (res.exists) {
        mark($("#email"), "Une réponse a déjà été envoyée avec cette adresse e-mail. Il n'est pas possible de répondre une seconde fois.", $("#email-err"));
        failStep(1);
        return false;
      }
      return true;
    } catch (_) {
      return true; // vérifié à nouveau au moment de l'envoi
    } finally {
      setBusy(false);
    }
  }

  function readBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1]);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }

  function progress(done, total, text) {
    $("#progress").hidden = false;
    $("#progress-bar").style.width = Math.round((done / total) * 100) + "%";
    $("#progress-text").textContent = text;
  }

  async function send() {
    globalError.textContent = "";
    for (let k = 0; k < RECAP; k++) {
      if (!validateStep(k, false)) { goTo(k, -1); validateStep(k, true); return; }
    }
    if (!apiConfigured()) {
      globalError.textContent = "Le formulaire n'est pas encore relié au serveur (API_URL manquante dans config.js).";
      return;
    }

    const email = val("email").toLowerCase();
    const submissionId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    const projectNodes = $$(".project", projectsEl);

    const uploads = [];
    projectNodes.forEach((node, i) => {
      if (node._rapport) uploads.push({ file: node._rapport, kind: "rapport", project: i });
      node._visuels.forEach((f) => uploads.push({ file: f, kind: "visuel", project: i }));
    });
    const totalSteps = uploads.length + 2;

    sending = true;
    setBusy(true, "Envoi en cours…");
    renderStepper();
    $$(".recap-block .btn").forEach((b) => (b.disabled = true));
    try {
      progress(0, totalSteps, "Vérification de votre adresse…");
      const check = await api({ action: "check", email });
      if (check.closed) throw new Error("Le formulaire est clos.");
      if (check.exists) throw new Error("Une réponse a déjà été envoyée avec cette adresse e-mail. Il n'est pas possible de répondre une seconde fois.");

      for (let i = 0; i < uploads.length; i++) {
        const u = uploads[i];
        progress(i + 1, totalSteps, `Envoi des fichiers (${i + 1} sur ${uploads.length}) : ${u.file.name}`);
        const res = await api({
          action: "upload", submissionId, email,
          kind: u.kind, project: u.project,
          name: u.file.name, mimeType: u.file.type,
          data: await readBase64(u.file)
        });
        if (!res.ok) throw new Error(res.error || "Échec de l'envoi d'un fichier.");
        u.result = { id: res.id, name: u.file.name };
      }

      progress(totalSteps - 1, totalSteps, "Enregistrement de votre réponse…");
      const res = await api({
        action: "submit",
        submissionId,
        website: val("website"),
        elapsedMs: Date.now() - startedAt,
        data: {
          email,
          nom: val("nom"),
          prenom: val("prenom"),
          annee: val("annee") === "Autre" ? val("annee_autre") : val("annee"),
          niveau: $('input[name="niveau"]:checked').value,
          linkedin: val("linkedin"),
          portfolio: val("portfolio"),
          poste: val("poste"),
          entreprise: val("entreprise"),
          autorisations: $$('input[name="auth"]:checked').map((c) => c.value),
          projets: projectNodes.map((node, i) => ({
            titre: $(".p-titre", node).value.trim(),
            type: $(".p-type", node).value,
            annee: $(".p-annee", node).value.trim(),
            resume: $(".p-resume", node).value.trim(),
            equipe: $(".p-equipe", node).value.trim(),
            lien: $(".p-lien", node).value.trim(),
            rapport: (uploads.find((u) => u.kind === "rapport" && u.project === i) || {}).result || null,
            visuels: uploads.filter((u) => u.kind === "visuel" && u.project === i).map((u) => u.result)
          }))
        }
      });
      if (!res.ok) throw new Error(res.error || "L'enregistrement a échoué.");

      progress(totalSteps, totalSteps, "Terminé !");
      sent = true;
      try { localStorage.removeItem(DRAFT_KEY); } catch (_) { /* rien */ }
      form.hidden = true;
      $(".stepper").hidden = true;
      $("#intro").hidden = true;
      const success = $("#success");
      success.hidden = false;
      success.scrollIntoView({ behavior: "smooth" });
      success.focus({ preventScroll: true });
    } catch (err) {
      globalError.textContent = err.message === "Failed to fetch"
        ? "Impossible de joindre le serveur. Vérifiez votre connexion puis cliquez de nouveau sur « Envoyer »."
        : err.message;
      $("#progress").hidden = true;
      sending = false;
      setBusy(false);
      renderStepper();
      $$(".recap-block .btn").forEach((b) => (b.disabled = false));
    }
  }

  /* Démarrage */
  fillRgpd();
  fillYears();
  checkDeadline();
  buildStepper();
  setupAuths();
  setupLiveValidation();
  if (!restoreDraft()) addProject();
  goTo(0, 0, false);
})();
