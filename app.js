/* app.js — IngressAI (frontend leve)
   - vitrine, filtros, sheet
   - calculadora: 3% fixo organizador; comprador vê +4% e +5% lado a lado
   - emissão manual: 1,5% (pagamento fora)
   - sliders para preço e quantidade
   - animação suave nos números
   - formulário de criação com categoria
   - diagnóstico de backend
*/
(() => {
  "use strict";

  /* ================= Base / Config ================= */
  const qs = new URLSearchParams(location.search);
  const QS_API = (qs.get("api") || "").trim();
  const META_API =
    document.querySelector('meta[name="ingressai-api"]')?.content?.trim() || "";

  function normalizeApi(raw) {
    let s = String(raw || "").trim().replace(/\/+$/g, "");
    if (!/\/api$/i.test(s)) s += "/api";
    s = s.replace(/([^:])\/{2,}/g, "$1/");
    return s;
  }

  const INGRESSAI_API = window.INGRESSAI_API || normalizeApi(QS_API || META_API);
  const INGRESSAI_BASE =
    window.INGRESSAI_BASE || INGRESSAI_API.replace(/\/api$/i, "");

  window.INGRESSAI_API = INGRESSAI_API;
  window.INGRESSAI_BASE = INGRESSAI_BASE;

  const BOT_NUMBER = "5534999992747";
  const PLACEHOLDER_IMG = "./logo_ingressai.png";

  /* =============== Utils HTTP =============== */
  async function getJSON(url, opts = {}) {
    const r = await fetch(url, {
      method: "GET",
      credentials: "omit",
      mode: "cors",
      cache: "no-store",
      ...opts,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} @ ${url}`);
    const text = await r.text();
    return text ? JSON.parse(text) : {};
  }

  async function postJSON(url, body = {}, opts = {}) {
    const r = await fetch(url, {
      method: "POST",
      credentials: "omit",
      mode: "cors",
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      body: JSON.stringify(body),
      ...opts,
    });
    const text = await r.text();
    const json = text ? JSON.parse(text) : {};
    if (!r.ok) {
      const msg = json?.error || json?.message || `HTTP ${r.status} @ ${url}`;
      const err = new Error(msg);
      err.response = json;
      err.status = r.status;
      throw err;
    }
    return json;
  }

  /* =============== DOM helpers =============== */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v == null) return;
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else node.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  /* =============== Drawer =============== */
  const drawer = $("#drawer");
  const drawerBackdrop = $("#drawer-backdrop");
  const btnDrawerOpen = $("#drawer-toggle");
  const btnDrawerClose = $("#drawer-close");
  const btnDrawerCreate = $("#drawer-create");

  function openDrawer() {
    if (!drawer) return;
    drawer.classList.add("is-open");
    drawerBackdrop.classList.add("is-open");
    btnDrawerOpen?.setAttribute("aria-expanded", "true");
    drawer.setAttribute("aria-hidden", "false");
    drawerBackdrop.setAttribute("aria-hidden", "false");
  }
  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove("is-open");
    drawerBackdrop.classList.remove("is-open");
    btnDrawerOpen?.setAttribute("aria-expanded", "false");
    drawer.setAttribute("aria-hidden", "true");
    drawerBackdrop.setAttribute("aria-hidden", "true");
  }
  btnDrawerOpen?.addEventListener("click", openDrawer);
  btnDrawerClose?.addEventListener("click", closeDrawer);
  drawerBackdrop?.addEventListener("click", closeDrawer);
  btnDrawerCreate?.addEventListener("click", () => {
    closeDrawer();
    document.getElementById("organizadores")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /* =============== Header scroll effect =============== */
  const header = $("header");
  const toggleScrolled = () => {
    if (!header) return;
    if (window.scrollY > 4) header.classList.add("is-scrolled");
    else header.classList.remove("is-scrolled");
  };
  window.addEventListener("scroll", toggleScrolled, { passive: true });
  toggleScrolled();

  /* =============== Vitrine: dados e render =============== */
  const listaEl = $("#lista-eventos");
  const filtroCidadesEl = $("#filtro-cidades");
  const buscaEl = $("#busca-eventos");

  let allEvents = [];
  let activeCity = null;
  let searchTerm = "";

  async function fetchEventsSmart() {
    const endpoints = [
      "/events/vitrine",
      "/events/public",
      "/events",
      "/events/seed",
    ];
    for (const p of endpoints) {
      try {
        const url = INGRESSAI_API + p;
        const json = await getJSON(url);
        const events =
          json?.events ||
          (Array.isArray(json) ? json : null) ||
          json?.data?.events ||
          json?.data ||
          json?.items ||
          json?.rows ||
          [];
        if (Array.isArray(events)) return events;
      } catch (e) {
        /* tenta próximo */
      }
    }
    throw new Error("Nenhum endpoint de eventos respondeu.");
  }

  const cityFrom = (ev) =>
    ev.city || ev.cidade || ev.location?.city || ev.venueCity || ev.placeCity || null;

  const dateTextFrom = (ev) =>
    ev.dateText || ev.eventDateText || ev.date || ev.startsAt || "";

  const mediaFrom = (ev) =>
    ev.image || ev.coverUrl || ev.banner || ev.media?.[0] || ev.thumb || null;

  function statusChip(ev) {
    if (ev.soldOut) return ["sold", "Esgotado"];
    if (ev.lowStock) return ["low", "Últimos ingressos"];
    return ["soon", "Disponível"];
  }

  function imgNode(src) {
    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = "Capa do evento";
    img.src = src || PLACEHOLDER_IMG;
    img.addEventListener("error", () => {
      if (img.dataset.fbk) { img.src = PLACEHOLDER_IMG; return; }
      img.dataset.fbk = "1";
      img.src = PLACEHOLDER_IMG;
    }, { once:true });
    return img;
  }

  function renderEvents() {
    if (!listaEl) return;
    const q = (searchTerm || "").trim().toLowerCase();

    const filtered = allEvents.filter((ev) => {
      const city = (cityFrom(ev) || "").toLowerCase();
      const title = (ev.title || ev.name || ev.eventTitle || "").toLowerCase();
      const hitCity = !activeCity || city === activeCity.toLowerCase();
      const hitSearch =
        !q ||
        title.includes(q) ||
        city.includes(q) ||
        (ev.venue || ev.local || "").toLowerCase().includes(q);
      return hitCity && hitSearch;
    });

    listaEl.innerHTML = "";
    if (!filtered.length) {
      listaEl.appendChild(
        el("div", { class: "std-card" }, [
          el("strong", {}, "Nenhum evento encontrado"),
          el("p", { class: "subtle" }, "Tente limpar filtros ou buscar outro termo."),
        ])
      );
      return;
    }

    filtered.forEach((ev) => {
      const city = cityFrom(ev);
      const img = mediaFrom(ev);
      const [k, label] = statusChip(ev);

      const card = el("article", { class: "card", tabindex: "0", role: "button" }, [
        el("div", { class: "card-header" }, [
          el("div", {}, [
            el("div", { class: "card-city" }, city || "—"),
            el("div", { class: "card-title" }, ev.title || ev.name || ev.eventTitle || "Evento"),
            el("div", { class: `status-line status--${k}` }, [
              el("span", { class: "status-dot", "aria-hidden": "true" }),
              el("span", {}, label),
            ]),
          ]),
        ]),
        el("div", { class: "card-media" }, img ? imgNode(img) : imgNode(null)),
      ]);

      card.addEventListener("click", () => openEventSheet(ev));
      card.addEventListener("keyup", (e) => {
        if (e.key === "Enter" || e.key === " ") openEventSheet(ev);
      });
      listaEl.appendChild(card);
    });
  }

  function buildCityChips() {
    if (!filtroCidadesEl) return;
    const set = new Set();
    allEvents.forEach((ev) => {
      const c = cityFrom(ev);
      if (c) set.add(String(c));
    });

    const cities = Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
    filtroCidadesEl.innerHTML = "";

    const allChip = el(
      "button",
      {
        class: "chip",
        role: "tab",
        "aria-selected": activeCity ? "false" : "true",
      },
      "Todas"
    );
    allChip.addEventListener("click", () => {
      activeCity = null;
      $$('[role="tab"]', filtroCidadesEl).forEach((n) =>
        n.setAttribute("aria-selected", "false")
      );
      allChip.setAttribute("aria-selected", "true");
      renderEvents();
    });
    filtroCidadesEl.appendChild(allChip);

    cities.forEach((city) => {
      const chip = el(
        "button",
        {
          class: "chip",
          role: "tab",
          "aria-selected":
            activeCity && activeCity.toLowerCase() === city.toLowerCase()
              ? "true"
              : "false",
        },
        city
      );
      chip.addEventListener("click", () => {
        activeCity = city;
        $$('[role="tab"]', filtroCidadesEl).forEach((n) =>
          n.setAttribute("aria-selected", "false")
        );
        chip.setAttribute("aria-selected", "true");
        renderEvents();
      });
      filtroCidadesEl.appendChild(chip);
    });
  }

  function openEventSheet(ev) {
    const sheet = $("#sheet");
    const sheetBody = $("#sheet-body");
    const sheetBackdrop = $("#sheet-backdrop");
    if (!sheet || !sheetBody) return;
    sheetBody.innerHTML = "";

    const city = cityFrom(ev);
    const dateText = dateTextFrom(ev);
    const img = mediaFrom(ev);

    const head = el("div", {}, [
      el("h3", {}, ev.title || ev.name || ev.eventTitle || "Evento"),
      el("div", { class: "status-chip soon", style: "margin-top:6px" }, [
        el("span", { class: "dot" }),
        el("span", {}, city || "—"),
      ]),
    ]);

    const mediaNode = el("div", { class: "sheet-media" }, [
      img ? imgNode(img) : imgNode(null),
    ]);

    // Deep-link: ingressai:start ev=<id> qty=1 autopay=1
    const makeWaDeepLink = (ev) => {
      const id = ev.id || ev.slug || "";
      if (!id) return `https://wa.me/${BOT_NUMBER}`;
      const txt = encodeURIComponent(`ingressai:start ev=${id} qty=1 autopay=1`);
      return `https://wa.me/${BOT_NUMBER}?text=${txt}`;
    };

    const ctaHref =
      ev.whatsappLink ||
      ev.deepLink ||
      makeWaDeepLink(ev);

    const details = el("div", { class: "std-list" }, [
      el("div", {}, `Quando: ${dateText || "—"}`),
      el("div", {}, `Local: ${ev.venue || ev.local || city || "—"}`),
    ]);

    const actions = el("div", { style: "display:flex;gap:8px;margin-top:8px" }, [
      el(
        "a",
        { class: "btn btn--secondary btn--sm", href: ctaHref, target: "_blank", rel: "noopener noreferrer" },
        "Comprar no WhatsApp"
      ),
    ]);

    sheetBody.appendChild(head);
    sheetBody.appendChild(mediaNode);
    sheetBody.appendChild(details);
    sheetBody.appendChild(actions);

    sheet.setAttribute("aria-hidden", "false");
    sheet.classList.add("is-open");
    sheetBackdrop.classList.add("is-open");
  }

  function closeSheet() {
    const sheet = $("#sheet");
    const sheetBackdrop = $("#sheet-backdrop");
    if (!sheet) return;
    sheet.classList.remove("is-open");
    sheetBackdrop.classList.remove("is-open");
    sheet.setAttribute("aria-hidden", "true");
  }
  $("#sheet-close")?.addEventListener("click", closeSheet);
  $("#sheet-backdrop")?.addEventListener("click", closeSheet);
  buscaEl?.addEventListener("input", (e) => {
    searchTerm = e.target.value || "";
    renderEvents();
  });

  /* =============== Helpers calculadora =============== */
  const priceEl = $("#calc-price");
  const priceRangeEl = $("#calc-price-range");
  const qtyNEl = $("#calc-qty-n");
  const qtySlider = $("#calc-qty");
  const feeOrgEl = $("#calc-fee-org");
  const grossEl = $("#calc-gross");
  const netEl = $("#calc-net");
  const buyer4El = $("#calc-buyer-4");
  const buyer5El = $("#calc-buyer-5");

  const manualFeeUnitEl = $("#manual-fee-unit");
  const manualFeeTotalEl = $("#manual-fee-total");
  const manualNetTotalEl = $("#manual-net-total");
  const manualNetUnitEl = $("#manual-net-unit");

  function clampInt(v, min, max){
    const n = Math.max(min, Math.min(max, parseInt(v || "0", 10) || 0));
    return n;
  }
  function centsToBRL(c){ return (c/100).toLocaleString("pt-BR", { style:"currency", currency:"BRL" }); }
  function brlToCents(raw){
    if (raw == null) return 0;
    const s = String(raw).replace(/[^\d,.-]/g,"").replace(/\./g,"").replace(",",".");
    const n = Number(s);
    return isFinite(n) ? Math.round(n * 100) : 0;
  }
  function maskBRLInput(el){
    const v = el.value;
    const cents = brlToCents(v);
    el.value = centsToBRL(cents);
    return cents;
  }

  // animação simples pros números (pra ficar “vivo”)
  function animateNumber(el, from, to){
    if (!el) return;
    const start = performance.now();
    const dur = 160; // curto pra parecer instantâneo
    const diff = to - from;
    function frame(now){
      const t = Math.min(1, (now - start)/dur);
      const eased = t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t;
      const val = from + diff*eased;
      el.textContent = centsToBRL(Math.round(val));
      el.style.transform = "translateY(-1px)";
      if (t < 1) requestAnimationFrame(frame);
      else el.style.transform = "translateY(0)";
    }
    requestAnimationFrame(frame);
  }

  // estado inicial
  let priceCents = brlToCents(qs.get("price")) || 6000; // default R$ 60,00
  let qty = clampInt(qs.get("qty") || localStorage.getItem("ia.qty") || "100", 0, 10000);

  function pushState(){
    const params = new URLSearchParams(location.search);
    params.set("price", (priceCents/100).toFixed(2));
    params.set("qty", String(qty));
    const newUrl = `${location.pathname}?${params.toString()}${location.hash || ""}`;
    history.replaceState(null, "", newUrl);
    localStorage.setItem("ia.qty", String(qty));
  }

  function recalc(){
    // Organizadores: 3%
    const orgPct = 0.03;
    const feeOrgUnit = Math.round(priceCents * orgPct);
    const gross = priceCents * qty;
    const net = Math.max(0, (priceCents - feeOrgUnit) * qty);

    // Comprador vê +4% ou +5% (exibimos os dois)
    const buyer4 = priceCents + Math.round(priceCents * 0.04);
    const buyer5 = priceCents + Math.round(priceCents * 0.05);

    // ler valores antigos pra animar
    const oldFee = brlToCents(feeOrgEl?.textContent);
    const oldGross = brlToCents(grossEl?.textContent);
    const oldNet = brlToCents(netEl?.textContent);
    const oldManualFeeUnit = brlToCents(manualFeeUnitEl?.textContent);
    const oldManualFeeTotal = brlToCents(manualFeeTotalEl?.textContent);
    const oldManualNetTotal = brlToCents(manualNetTotalEl?.textContent);
    const oldManualNetUnit = brlToCents(manualNetUnitEl?.textContent);

    // escreve com animação
    animateNumber(feeOrgEl, isNaN(oldFee)?feeOrgUnit:oldFee, feeOrgUnit);
    animateNumber(grossEl, isNaN(oldGross)?gross:oldGross, gross);
    animateNumber(netEl, isNaN(oldNet)?net:oldNet, net);

    buyer4El.textContent = centsToBRL(buyer4);
    buyer5El.textContent = centsToBRL(buyer5);

    // Emissão manual: 1,5% do valor base
    const manualPct = 0.015;
    const manualFeeUnit = Math.round(priceCents * manualPct);
    const manualFeeTotal = manualFeeUnit * qty;
    const manualNetTotal = Math.max(0, (priceCents - manualFeeUnit) * qty);
    const manualNetUnit = Math.max(0, priceCents - manualFeeUnit);

    animateNumber(manualFeeUnitEl, isNaN(oldManualFeeUnit)?manualFeeUnit:oldManualFeeUnit, manualFeeUnit);
    animateNumber(manualFeeTotalEl, isNaN(oldManualFeeTotal)?manualFeeTotal:oldManualFeeTotal, manualFeeTotal);
    animateNumber(manualNetTotalEl, isNaN(oldManualNetTotal)?manualNetTotal:oldManualNetTotal, manualNetTotal);
    animateNumber(manualNetUnitEl, isNaN(oldManualNetUnit)?manualNetUnit:oldManualNetUnit, manualNetUnit);
  }

  // UI events - preço (input)
  priceEl?.addEventListener("input", (e) => {
    priceCents = maskBRLInput(e.target);
    if (priceRangeEl) {
      const clamped = Math.min(Math.max(priceCents, Number(priceRangeEl.min)), Number(priceRangeEl.max));
      priceRangeEl.value = String(clamped);
    }
    pushState();
    recalc();
  });
  priceEl?.addEventListener("blur", (e) => {
    let c = brlToCents(e.target.value);
    const mod = c % 100;
    if (mod === 0 && c >= 1000) c = c - 10;
    else if (mod >= 90 && mod < 99) c = c + (99 - mod);
    priceCents = Math.max(0, c);
    e.target.value = centsToBRL(priceCents);
    if (priceRangeEl) {
      const clamped = Math.min(Math.max(priceCents, Number(priceRangeEl.min)), Number(priceRangeEl.max));
      priceRangeEl.value = String(clamped);
    }
    pushState();
    recalc();
  });

  // UI events - preço (slider)
  priceRangeEl?.addEventListener("input", (e) => {
    const v = Number(e.target.value || "0");
    priceCents = v;
    if (priceEl) priceEl.value = centsToBRL(v);
    pushState();
    recalc();
  });

  // quantidade (input)
  qtyNEl?.addEventListener("input", (e) => {
    const v = clampInt(e.target.value, 0, 10000);
    e.target.value = String(v);
    qty = v;
    if (qtySlider) qtySlider.value = String(Math.min(1000, v));
    pushState();
    recalc();
  });

  // quantidade (slider)
  qtySlider?.addEventListener("input", (e) => {
    const v = clampInt(e.target.value, 0, 1000);
    if (qtyNEl) qtyNEl.value = String(v);
    qty = v;
    pushState();
    recalc();
  });

  /* =============== Solicitação de criação (org) =============== */
  const reqForm = $("#req-form");
  const reqBtn = $("#req-send");
  const reqHint = $("#req-hint");

  async function submitOrgRequest() {
    if (!reqForm) return;
    const phone = ($("#req-phone")?.value || "").replace(/\D+/g, "");
    const title = $("#req-title")?.value?.trim() || "";
    const personName = $("#req-name")?.value?.trim() || "";
    const city = $("#req-city")?.value?.trim() || "";
    const category = $("#req-category")?.value?.trim() || "";

    if (!phone || !title || !personName || !city) {
      if (reqHint) reqHint.textContent = "Preencha WhatsApp, nome do evento, seu nome e cidade.";
      return;
    }

    reqBtn?.setAttribute("disabled", "true");
    if (reqHint) reqHint.textContent = "Enviando…";

    try {
      const payload = {
        phone,
        title,
        contactName: personName,
        city,
        category
      };
      const res = await postJSON(INGRESSAI_API + "/org/request", payload);
      if (res?.ok) {
        if (reqHint) reqHint.textContent = "Solicitação enviada. Você receberá o passo a passo no WhatsApp.";
        reqForm.reset();
      } else {
        if (reqHint) reqHint.textContent = "Não foi possível enviar agora.";
      }
    } catch (e) {
      if (reqHint) reqHint.textContent = "Falha ao enviar. Tente novamente.";
      console.error(e);
    } finally {
      reqBtn?.removeAttribute("disabled");
      setTimeout(() => reqHint && (reqHint.textContent = ""), 4500);
    }
  }

  reqBtn?.addEventListener("click", submitOrgRequest);

  /* =============== Diagnóstico =============== */
  const dApi = $("#d-api");
  const dHealth = $("#d-health");
  const dEv = $("#d-ev2");
  const authIndicator = $("#auth-indicator");
  const orgValidatorBtn = $("#org-validator");

  function setDiag(el, ok, extra) {
    if (!el) return;
    el.textContent = ok ? (extra || "on") : (extra || "off");
    el.style.color = ok ? "#157f3b" : "#b64848";
  }

  async function runDiagnostics() {
    setDiag(dApi, !!INGRESSAI_API, INGRESSAI_API || "off");

    try {
      let j;
      try {
        j = await getJSON(INGRESSAI_API + "/health");
      } catch {
        j = await getJSON(INGRESSAI_BASE + "/health");
      }
      setDiag(dHealth, !!j?.ok, j?.ok ? "on" : "off");
      authIndicator?.classList.remove("off", "on");
      authIndicator?.classList.add(j?.ok ? "on" : "off");
      if (authIndicator) authIndicator.textContent = j?.ok ? "online" : "offline";
    } catch (e) {
      setDiag(dHealth, false);
      authIndicator?.classList.remove("off", "on");
      authIndicator?.classList.add("off");
      if (authIndicator) authIndicator.textContent = "offline";
    }

    try {
      allEvents = await fetchEventsSmart();
      setDiag(dEv, true, `${allEvents.length} evt`);
      buildCityChips();
      renderEvents();
    } catch (e) {
      setDiag(dEv, false, "—");
      console.error(e);
    }

    try {
      const url = INGRESSAI_BASE.replace(/\/+$/, "") + "/app/validator.html";
      const r = await fetch(url, { method: "HEAD", cache: "no-store" });
      const ok = r.ok || r.status === 200;
      if (ok && orgValidatorBtn && (!orgValidatorBtn.href || orgValidatorBtn.getAttribute("href") === "#")) {
        orgValidatorBtn.href = url;
      }
    } catch {/* noop */}
  }

  window.addEventListener("DOMContentLoaded", () => {
    // estado inicial da calculadora
    if (priceEl) priceEl.value = centsToBRL(priceCents);
    if (priceRangeEl) priceRangeEl.value = String(Math.min(Math.max(priceCents, Number(priceRangeEl.min)), Number(priceRangeEl.max)));
    if (qtyNEl) qtyNEl.value = String(qty);
    if (qtySlider) qtySlider.value = String(Math.min(1000, qty));
    recalc();

    // roda diag
    runDiagnostics().catch((e) => console.error(e));
  });
})();
