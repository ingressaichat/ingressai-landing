/* app.js — IngressAI Landing
   Coloque este arquivo na MESMA pasta do index.html (GitHub Pages).
   Versão: 2025-09-15
*/
(() => {
  "use strict";

  // ========= Config =========
  const API_BASE =
    (typeof window !== "undefined" && window.INGRESSAI_API) ||
    "https://ingressai-backend-production.up.railway.app/api";

  // WhatsApp do comercial/suporte para receber solicitações de criação (fallback = o do footer)
  const CONTACT_WA = (window.INGRESSAI_CONTACT_WA || "5534999992747").replace(/[^\d]/g, "");

  // Número do BOT (opcional) para iniciar fluxo pelo WhatsApp com "ingressai:start ev=<ID>"
  const BOT_WA = (window.INGRESSAI_BOT_PHONE || CONTACT_WA).replace(/[^\d]/g, "");

  // Modelos/planos de organizador (edite à vontade)
  const ORG_MODELS = [
    { id: "start", title: "Start", desc: "Sem mensalidade. Repasse T+0.", feePct: 0.089, feeFix: 0.0 },
    { id: "pro",   title: "Pro",   desc: "Menor taxa + ferramentas PRO.", feePct: 0.069, feeFix: 1.00 },
    { id: "zero",  title: "Zero",  desc: "Repasse integral; taxa fixa.",  feePct: 0.0,   feeFix: 2.99 },
  ];

  // ========= Helpers =========
  const log = (...a) => console.log("[IngressAI]", ...a);
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const ce = (tag, props = {}, children = []) => {
    const el = document.createElement(tag);
    Object.assign(el, props);
    if (props.className) el.setAttribute("class", props.className);
    for (const c of [].concat(children || [])) {
      if (c == null) continue;
      if (typeof c === "string") el.appendChild(document.createTextNode(c));
      else el.appendChild(c);
    }
    return el;
  };
  const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

  // BRL
  const fmtBRL = (v) =>
    (isFinite(v) ? v : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const parseBRL = (s) => {
    if (typeof s === "number") return s;
    const n = String(s || "")
      .replace(/[^\d,.-]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const f = parseFloat(n);
    return isFinite(f) ? f : 0;
  };

  const onlyDigits = (s) => String(s || "").replace(/\D+/g, "");
  const titleCase = (s) => String(s || "").replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase());

  const debounce = (fn, delay = 250) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  };

  // Local storage
  const TOKEN_KEY = "ingressai_token";
  const PHONE_KEY = "ingressai_phone";
  const getToken = () => localStorage.getItem(TOKEN_KEY) || "";
  const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));
  const setPhone = (p) => (p ? localStorage.setItem(PHONE_KEY, p) : localStorage.removeItem(PHONE_KEY));

  // Fetch wrapper
  async function api(path, { method = "GET", headers = {}, body, auth = false, query } = {}) {
    const url = new URL(path.startsWith("http") ? path : API_BASE + path);
    if (query && typeof query === "object") {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
      }
    }
    const h = { "Content-Type": "application/json", ...headers };
    if (auth) {
      const t = getToken();
      if (t) h.Authorization = `Bearer ${t}`;
    }
    const res = await fetch(url.toString(), {
      method,
      headers: h,
      body: body ? JSON.stringify(body) : undefined,
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
    });
    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("application/json") ? await res.json().catch(() => ({})) : await res.text();
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  // ========= Elements =========
  const el = {
    header: $("header"),
    hero: $(".hero"),
    navOrg: $("#nav-org"),
    navVal: $("#nav-val"),
    navLogin: $("#nav-login"),
    authIndicator: $("#auth-indicator"),

    sectionVitrine: $("#vitrine"),
    sectionOrgs: $("#organizadores"),
    sectionVal: $("#validador"),

    // vitrine
    search: $("#busca-eventos"),
    chipWrap: $("#filtro-cidades"),
    list: $("#lista-eventos"),

    // sheet
    sheet: $("#sheet"),
    sheetBody: $("#sheet-body"),
    sheetBackdrop: $("#sheet-backdrop"),
    sheetClose: $("#sheet-close"),

    // organizadores
    stdCard: $("#std-card"),
    models: $("#org-models"),
    feeRow: $("#fee-row"),
    feeChip: $("#fee-chip"),
    orgDetail: $("#org-detail"),
    preco: $("#preco"),
    qtd: $("#qtd"),
    calcGrossRow: $("#calc-gross-row"),
    calcGross: $("#calc-gross"),
    calcNet: $("#calc-net"),
    calcNote: $("#calc-note"),
    orgQuick: $("#org-quick"),
    orgReq: $("#org-request"),
    openDashboard1: $("#open-dashboard"),
    openDashboard2: $("#open-dashboard-2"),
    openLoginInline: $("#open-login-inline"),
    fTitle: $("#f-title"),
    fCity: $("#f-city"),
    fVenue: $("#f-venue"),
    fDate: $("#f-date"),
    fPhone: $("#f-phone"),

    // validador
    valCode: $("#val-code"),
    valCheck: $("#val-check"),
    valResult: $("#val-result"),

    // login modal
    loginModal: $("#login-modal"),
    loginPhone: $("#login-phone"),
    loginSend: $("#login-send"),
    loginHint: $("#login-hint"),
    codeBlock: $("#code-block"),
    codeInput: $("#login-code"),
    codeVerify: $("#code-verify"),
    codeBack: $("#code-back"),
    loginCancel: $("#login-cancel"),

    // CTAs
    ctaOrgs: $("#cta-organizadores"),
  };

  // ========= State =========
  const state = {
    events: [],
    filteredEvents: [],
    cities: [],
    citySelected: "todas",
    model: null, // ORG_MODELS[i]
    // busca
    term: "",
  };

  // ========= Boot =========
  function boot() {
    log("app.js boot", { API_BASE, CONTACT_WA, BOT_WA });
    bindNav();
    bindSheet();
    bindOrganizadores();
    bindValidador();
    bindLogin();

    // carregar vitrine
    loadEvents().finally(() => {
      log("ready");
      updateAuthIndicator();
      applyHashRouting();
    });

    // scroll style header
    window.addEventListener("scroll", () => {
      const sc = window.scrollY || document.documentElement.scrollTop;
      if (sc > 8) el.header.classList.add("is-scrolled");
      else el.header.classList.remove("is-scrolled");
      // herozinho some quando navega
      const heroP = clamp(sc / 220, 0, 1);
      el.hero && (el.hero.style.setProperty("--hero-p", heroP));
    });

    window.addEventListener("hashchange", applyHashRouting);
  }

  // ========= Routing por hash =========
  function applyHashRouting() {
    const hash = (location.hash || "#vitrine").split("?")[0];
    const showVitrine = hash === "#vitrine" || hash === "" || hash === "#";
    const showOrgs = hash === "#organizadores";
    const showVal = hash === "#validador";

    toggleSection(el.sectionVitrine, showVitrine);
    toggleSection(el.sectionOrgs, showOrgs);
    toggleSection(el.sectionVal, showVal);

    // esconder hero quando não está na vitrine
    if (el.hero) el.hero.classList.toggle("is-hidden", !showVitrine);

    // foco acessível
    const toFocus = showVitrine ? $("#vitrine-title") : showOrgs ? $("#orgs-title") : $("#val-title");
    toFocus && toFocus.focus && toFocus.focus();
  }
  function toggleSection(node, visible) {
    if (!node) return;
    node.hidden = !visible;
  }

  function bindNav() {
    // Botões que abrem o modal de login (sem sair da page)
    $$("[data-login]").forEach((a) => {
      a.addEventListener("click", (ev) => {
        ev.preventDefault();
        openLoginModal();
      });
    });

    // CTA rolagem para organizadores
    el.ctaOrgs?.addEventListener("click", () => {
      location.hash = "#organizadores";
    });

    // Se tiver token, liberar validador no topo
    if (getToken()) el.navVal?.removeAttribute("hidden");
  }

  // ========= Vitrine =========
  async function loadEvents() {
    try {
      const res = await api("/events");
      const items = Array.isArray(res) ? res : (res.items || res.data || []);
      state.events = normalizeEvents(items);
      buildCities();
      renderCityChips();
      renderEvents();
      bindSearch();
    } catch (e) {
      console.error(e);
      el.list.innerHTML = `<div class="std-card">Não foi possível carregar os eventos agora.<br><small class="subtle">${e.message || e}</small></div>`;
    }
  }

  function normalizeEvents(list) {
    return (list || []).map((ev) => {
      const id = ev.id || ev.slug || ev._id || ev.code || String(ev.title || "evento").toLowerCase().replace(/\s+/g, "-");
      const title = ev.title || ev.name || "Evento";
      const city = ev.city || ev.location?.city || "—";
      const venue = ev.venue || ev.location?.venue || "";
      const date = ev.date || ev.when || ev.startAt || null;
      const price = ev.price || ev.displayPrice || "";
      const status = ev.status || "soon"; // soon | low | sold
      const mediaUrl =
        ev.media?.url ||
        ev.image?.url ||
        ev.banner ||
        ev.flyer ||
        ""; // pode ficar vazio, a UI lida
      return { id, title, city, venue, date, price, status, mediaUrl };
    });
  }

  function buildCities() {
    const set = new Set(["todas"]);
    for (const ev of state.events) {
      const c = (ev.city || "").trim();
      if (c) set.add(c);
    }
    state.cities = Array.from(set);
  }

  function renderCityChips() {
    el.chipWrap.innerHTML = "";
    for (const c of state.cities) {
      const selected = c === state.citySelected;
      const chip = ce("button", {
        className: "chip",
        type: "button",
        role: "tab",
        "aria-selected": String(selected),
        textContent: c === "todas" ? "Todas" : titleCase(c),
      });
      chip.addEventListener("click", () => {
        state.citySelected = c;
        // update aria
        $$(".chip", el.chipWrap).forEach((ch) => ch.setAttribute("aria-selected", "false"));
        chip.setAttribute("aria-selected", "true");
        renderEvents();
      });
      el.chipWrap.appendChild(chip);
    }
  }

  function bindSearch() {
    if (!el.search) return;
    el.search.addEventListener(
      "input",
      debounce(() => {
        state.term = (el.search.value || "").trim().toLowerCase();
        renderEvents();
      }, 200)
    );
  }

  function eventMatches(ev) {
    const term = state.term;
    const cityOK = state.citySelected === "todas" || (ev.city || "").toLowerCase() === state.citySelected.toLowerCase();
    if (!term) return cityOK;
    const hay = [ev.title, ev.city, ev.venue].join(" ").toLowerCase();
    return cityOK && hay.includes(term);
  }

  function statusBadge(status) {
    const map = {
      soon: { cls: "status--soon", label: "Disponível" },
      low: { cls: "status--low", label: "Últimos ingressos" },
      sold: { cls: "status--sold", label: "Esgotado" },
    };
    const m = map[status] || map.soon;
    return `<div class="status-line ${m.cls}"><span class="status-dot"></span><span>${m.label}</span></div>`;
  }

  function renderEvents() {
    const list = state.events.filter(eventMatches);
    state.filteredEvents = list;
    if (!list.length) {
      el.list.innerHTML = `<div class="std-card">Nenhum evento encontrado.</div>`;
      return;
    }
    el.list.innerHTML = "";
    for (const ev of list) {
      const card = ce("article", { className: "card" });
      const head = ce("div", { className: "card-header" });
      const left = ce("div");
      left.appendChild(ce("div", { className: "card-title", textContent: ev.title }));
      if (ev.city) left.appendChild(ce("div", { className: "card-city", textContent: ev.city }));
      left.insertAdjacentHTML("beforeend", statusBadge(ev.status));
      head.appendChild(left);
      const btn = ce("button", { className: "view", type: "button", textContent: "Ver opções" });
      btn.addEventListener("click", () => openEventSheet(ev));
      head.appendChild(btn);

      const media = ce("div", { className: "card-media" });
      if (ev.mediaUrl) {
        const img = ce("img", { alt: ev.title, loading: "lazy", decoding: "async" });
        img.src = ev.mediaUrl;
        media.appendChild(img);
      } else {
        media.textContent = "Flyer em breve";
      }

      card.appendChild(head);
      card.appendChild(media);
      el.list.appendChild(card);
    }
  }

  // ========= Sheet (detalhes do evento) =========
  function bindSheet() {
    if (!el.sheet || !el.sheetBackdrop || !el.sheetClose) return;
    const close = () => {
      el.sheet.classList.remove("is-open");
      el.sheetBackdrop.classList.remove("is-open");
      el.sheet.setAttribute("aria-hidden", "true");
      el.sheetBackdrop.setAttribute("aria-hidden", "true");
      el.sheetBody.innerHTML = "";
      document.body.style.removeProperty("overflow");
    };
    el.sheetClose.addEventListener("click", close);
    el.sheetBackdrop.addEventListener("click", close);
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
  }

  async function openEventSheet(ev) {
    // tentar pegar detalhes (opcional)
    let detail = ev;
    try {
      const data = await api(`/events/${encodeURIComponent(ev.id)}`).catch(() => null);
      if (data) {
        const d = data.event || data;
        detail = { ...ev, ...normalizeEvents([d])[0] };
      }
    } catch { /* ignore */ }

    const buyWhatsText = `ingressai:start ev=${encodeURIComponent(detail.id)}`;
    const waLink = `https://wa.me/${BOT_WA}?text=${encodeURIComponent(buyWhatsText)}`;

    const body = ce("div");
    const head = ce("div", { className: "sheet-head" });
    head.appendChild(ce("h3", { textContent: detail.title }));
    // chips de status + meta
    const meta = ce("div", { style: "display:flex;flex-wrap:wrap;gap:8px;align-items:center" });
    const st = ce("span", { className: `status-chip ${detail.status === "low" ? "low" : detail.status === "sold" ? "sold" : "soon"}` });
    st.appendChild(ce("span", { className: "dot", style: "background:currentColor" }));
    st.appendChild(document.createTextNode(detail.status === "low" ? "Últimos ingressos" : detail.status === "sold" ? "Esgotado" : "Disponível"));
    meta.appendChild(st);
    if (detail.city) meta.appendChild(ce("span", { className: "tag", textContent: titleCase(detail.city) }));
    if (detail.venue) meta.appendChild(ce("span", { className: "tag", textContent: detail.venue }));
    head.appendChild(meta);
    body.appendChild(head);

    if (detail.mediaUrl) {
      const media = ce("div", { className: "sheet-media" });
      const img = ce("img", { alt: detail.title, loading: "lazy", decoding: "async" });
      img.src = detail.mediaUrl;
      media.appendChild(img);
      body.appendChild(media);
    }

    const info = ce("div", { className: "std-card" });
    const ul = ce("ul", { className: "std-list" });
    if (detail.date) ul.appendChild(ce("li", { textContent: `Data: ${fmtDateBR(detail.date)}` }));
    if (detail.price) ul.appendChild(ce("li", { textContent: `Preço: ${detail.price}` }));
    ul.appendChild(ce("li", { textContent: "Compra 100% via WhatsApp (checkout automático)" }));
    info.appendChild(ul);
    body.appendChild(info);

    const ctas = ce("div", { style: "display:flex;gap:10px;flex-wrap:wrap;margin-top:10px" });
    const buy = ce("a", { className: "btn btn--secondary btn--sm", href: waLink, target: "_blank", rel: "noopener", textContent: "Comprar via WhatsApp" });
    ctas.appendChild(buy);
    const back = ce("button", { className: "btn btn--ghost btn--sm", type: "button", textContent: "Fechar" });
    back.addEventListener("click", () => {
      el.sheetClose.click();
    });
    ctas.appendChild(back);
    body.appendChild(ctas);

    el.sheetBody.innerHTML = "";
    el.sheetBody.appendChild(body);
    el.sheet.classList.add("is-open");
    el.sheetBackdrop.classList.add("is-open");
    el.sheet.removeAttribute("aria-hidden");
    el.sheetBackdrop.removeAttribute("aria-hidden");
    document.body.style.overflow = "hidden";
  }

  function fmtDateBR(iso) {
    try {
      // aceita "YYYY-MM-DDTHH:mm:ss-03:00" etc.
      const d = new Date(iso);
      return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return String(iso);
    }
  }

  // ========= Organizadores =========
  function bindOrganizadores() {
    // cartão padrão com features
    if (el.stdCard) {
      el.stdCard.innerHTML = `
        <strong>Como funciona</strong>
        <ul class="std-list">
          <li>Você cria o evento e define os lotes.</li>
          <li>Divulga o link/QR do WhatsApp.</li>
          <li>O bot vende, emite ingressos e envia por WhatsApp.</li>
          <li>Repasse imediato (Pix) e dashboard para acompanhar.</li>
        </ul>
      `;
    }

    // modelos
    if (el.models) {
      el.models.innerHTML = "";
      for (const m of ORG_MODELS) {
        const btn = ce("button", {
          className: "model",
          type: "button",
          role: "tab",
          "aria-selected": "false",
        });
        btn.appendChild(ce("div", { innerHTML: `<strong>${m.title}</strong><div class="subtle">${m.desc}</div>` }));
        btn.addEventListener("click", () => selectModel(m, btn));
        el.models.appendChild(btn);
      }
    }

    // inputs calculadora
    [el.preco, el.qtd].forEach((inp) => {
      inp?.addEventListener("input", recalc);
    });

    // solicitação por WhatsApp
    el.orgReq?.addEventListener("click", () => {
      const plan = state.model ? `${state.model.title} (${feeLabel(state.model)})` : "—";
      const price = parseBRL(el.preco.value);
      const qty = parseInt(el.qtd.value || "0", 10) || 0;
      const gross = price * qty;
      const fees = state.model ? gross * state.model.feePct + qty * state.model.feeFix : 0;
      const net = gross - fees;

      const payload = {
        plano: plan,
        preco: fmtBRL(price),
        quantidade: qty,
        bruto: fmtBRL(gross),
        recebe: fmtBRL(net),
        titulo: (el.fTitle.value || "").trim(),
        cidade: (el.fCity.value || "").trim(),
        local: (el.fVenue.value || "").trim(),
        data: (el.fDate.value || "").trim(),
        whatsapp: onlyDigits(el.fPhone.value || ""),
      };

      const msg = [
        "Solicitação de criação de evento (IngressAI) 👋",
        `Plano: ${payload.plano}`,
        `Preço: ${payload.preco} | Qtd: ${payload.quantidade}`,
        `Bruto: ${payload.bruto} | Recebe: ${payload.recebe}`,
        `Título: ${payload.titulo}`,
        `Cidade: ${payload.cidade}`,
        `Local: ${payload.local}`,
        `Data: ${payload.data}`,
        `WhatsApp: +${payload.whatsapp || "—"}`,
      ].join("\n");

      const link = `https://wa.me/${CONTACT_WA}?text=${encodeURIComponent(msg)}`;
      window.open(link, "_blank", "noopener");
    });

    // abrir login a partir de botões do painel
    [el.openDashboard1, el.openDashboard2, el.openLoginInline].forEach((a) => {
      a?.addEventListener("click", (ev) => {
        ev.preventDefault();
        openLoginModal();
      });
    });

    // quick create (abre o bot com um texto base)
    el.orgQuick?.addEventListener("click", (ev) => {
      ev.preventDefault();
      if (!state.model) {
        alert("Selecione um plano antes.");
        return;
      }
      const title = (el.fTitle.value || "Meu Evento").trim();
      const text = `Quero criar um evento: ${title}`;
      const link = `https://wa.me/${BOT_WA}?text=${encodeURIComponent(text)}`;
      window.open(link, "_blank", "noopener");
    });
  }

  function selectModel(model, btnNode) {
    state.model = model;
    // toggle aria
    $$(".model", el.models).forEach((b) => b.setAttribute("aria-selected", "false"));
    btnNode.setAttribute("aria-selected", "true");
    // exibir chip de taxa
    el.feeRow?.classList.add("is-visible");
    el.feeChip && (el.feeChip.textContent = `Taxa • ${feeLabel(model)}`);

    // habilitar calculadora
    [el.preco, el.qtd].forEach((inp) => inp && (inp.disabled = false));
    el.preco && !el.preco.value && (el.preco.value = "R$ 60,00");
    el.qtd && !el.qtd.value && (el.qtd.value = "1");
    recalc();

    // habilitar quick
    el.orgQuick?.classList.remove("is-disabled");
    el.orgQuick?.removeAttribute("aria-disabled");
  }

  function feeLabel(m) {
    const pct = `${(m.feePct * 100).toFixed(1).replace(".0", "")}%`;
    const fix = m.feeFix ? ` + ${fmtBRL(m.feeFix)}/un.` : "";
    return pct + fix;
  }

  function recalc() {
    const price = parseBRL(el.preco.value);
    const qty = parseInt(el.qtd.value || "0", 10) || 0;
    const gross = Math.max(0, price * qty);
    el.calcGross.textContent = fmtBRL(gross);

    if (!state.model) {
      el.calcNet.textContent = fmtBRL(0);
      el.calcNote.textContent = "Selecione um plano acima para aplicar a taxa.";
      el.calcGrossRow.style.display = gross > 0 ? "flex" : "none";
      return;
    }
    const fees = gross * state.model.feePct + qty * state.model.feeFix;
    const net = Math.max(0, gross - fees);
    el.calcNet.textContent = fmtBRL(net);
    el.calcNote.textContent = `Aplicando ${feeLabel(state.model)} • Repasse T+0`;
    el.calcGrossRow.style.display = "flex";
  }

  // ========= Validador =========
  function bindValidador() {
    el.valCheck?.addEventListener("click", validateCode);
    el.valCode?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") validateCode();
    });
  }

  async function validateCode() {
    const raw = (el.valCode.value || "").trim();
    if (!raw) return;
    const code = raw.replace(/^ingressai:ticket:/i, "");
    el.valResult.innerHTML = `<span class="subtle">Checando...</span>`;
    try {
      // tenta com token; se não houver, tenta sem
      let data;
      try {
        data = await api("/validator/check", { query: { code }, auth: true });
      } catch (err) {
        // sem token (ou backend permite público)
        data = await api("/validator/check", { query: { code }, auth: false });
      }
      const ok = !!(data.valid ?? data.ok ?? data.success);
      const msg = data.message || (ok ? "Válido" : "Inválido");
      el.valResult.innerHTML = ok
        ? `<div class="valid"><strong>✅ Ingresso válido.</strong><br><small>${msg}</small></div>`
        : `<div class="invalid"><strong>❌ Ingresso inválido.</strong><br><small>${msg}</small></div>`;
    } catch (e) {
      el.valResult.innerHTML = `<div class="invalid"><strong>Erro ao validar</strong><br><small>${e.message || e}</small></div>`;
    }
  }

  // ========= Login / OTP =========
  function bindLogin() {
    // open modal via "Entrar" do topo
    el.navLogin?.addEventListener("click", (ev) => {
      ev.preventDefault();
      openLoginModal();
    });

    el.loginCancel?.addEventListener("click", closeLoginModal);

    el.loginSend?.addEventListener("click", requestCode);
    el.codeBack?.addEventListener("click", () => {
      el.codeBlock.style.display = "none";
      el.loginSend.disabled = false;
      el.loginPhone.disabled = false;
      el.loginHint.textContent = "";
      el.loginPhone.focus();
    });
    el.codeVerify?.addEventListener("click", verifyCode);

    // enter shortcuts
    el.loginPhone?.addEventListener("keydown", (e) => e.key === "Enter" && requestCode());
    el.codeInput?.addEventListener("keydown", (e) => e.key === "Enter" && verifyCode());
  }

  function openLoginModal() {
    el.loginModal?.classList.add("is-open");
    el.loginModal?.removeAttribute("aria-hidden");
    el.loginPhone?.focus();
  }

  function closeLoginModal() {
    el.loginModal?.classList.remove("is-open");
    el.loginModal?.setAttribute("aria-hidden", "true");
    el.loginHint.textContent = "";
    el.codeBlock.style.display = "none";
    el.loginSend.disabled = false;
    el.loginPhone.disabled = false;
    el.loginPhone.value = "";
    el.codeInput.value = "";
  }

  async function requestCode() {
    const phone = onlyDigits(el.loginPhone.value || "");
    if (!phone || phone.length < 10) {
      el.loginHint.textContent = "Informe seu WhatsApp com DDI+DDD, ex.: 5534999999999";
      return;
    }
    el.loginHint.textContent = "Enviando código...";
    el.loginSend.disabled = true;
    el.loginPhone.disabled = true;
    try {
      const res = await api("/auth/request", { method: "POST", body: { phone } });
      const ok = !!(res.ok ?? res.success ?? true);
      if (!ok) throw new Error(res.message || "Falha ao solicitar código.");
      el.loginHint.textContent = "Código enviado por WhatsApp. Digite abaixo:";
      el.codeBlock.style.display = "block";
      el.codeInput.focus();
      setPhone(phone);
    } catch (e) {
      el.loginHint.textContent = `Erro: ${e.message || e}`;
      el.loginSend.disabled = false;
      el.loginPhone.disabled = false;
    }
  }

  async function verifyCode() {
    const phone = localStorage.getItem(PHONE_KEY) || onlyDigits(el.loginPhone.value || "");
    const code = onlyDigits(el.codeInput.value || "");
    if (!phone || !code) {
      el.loginHint.textContent = "Preencha telefone e código.";
      return;
    }
    el.loginHint.textContent = "Verificando...";
    el.codeVerify.disabled = true;
    try {
      const res = await api("/auth/verify", { method: "POST", body: { phone, code } });
      const token = res.token || res.accessToken || "";
      if (!token) throw new Error(res.message || "Código inválido.");
      setToken(token);
      el.loginHint.textContent = "Pronto! Você está logado.";
      updateAuthIndicator();
      // liberar validador no topo
      el.navVal?.removeAttribute("hidden");
      setTimeout(() => closeLoginModal(), 700);
    } catch (e) {
      el.loginHint.textContent = `Erro: ${e.message || e}`;
      el.codeVerify.disabled = false;
    }
  }

  function updateAuthIndicator() {
    const t = getToken();
    if (!el.authIndicator) return;
    if (t) {
      el.authIndicator.textContent = "online";
      el.authIndicator.classList.remove("off");
      el.authIndicator.classList.add("on");
    } else {
      el.authIndicator.textContent = "offline";
      el.authIndicator.classList.remove("on");
      el.authIndicator.classList.add("off");
    }
  }

  // ========= Init =========
  document.addEventListener("DOMContentLoaded", boot);
})();
