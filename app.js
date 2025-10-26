/* app.js — IngressAI (frontend leve)
   - vitrine, filtros, sheet
   - org request, calculadora de planos (sem "comprador/organizador")
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
  const sheet = $("#sheet");
  const sheetBody = $("#sheet-body");
  const sheetBackdrop = $("#sheet-backdrop");
  const buscaEl = $("#busca-eventos");

  let allEvents = [];
  let activeCity = null;
  let searchTerm = "";

  async function fetchEventsSmart() {
    const endpoints = ["/events/vitrine","/events/public","/events","/events/seed"];
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
      } catch (e) {}
    }
    throw new Error("Nenhum endpoint de eventos respondeu.");
  }

  const cityFrom = (ev) =>
    ev.city || ev.cidade || ev.location?.city || ev.venueCity || ev.placeCity || null;
  const dateTextFrom = (ev) =>
    ev.dateText || ev.eventDateText || ev.date || ev.startsAt || "";
  const mediaFrom = (ev) =>
    ev.coverUrl || ev.image || ev.banner || ev.media?.[0] || ev.thumb || null;

  function statusChip(ev) {
    if (ev.soldOut) return ["sold", "Esgotado"];
    if (ev.lowStock) return ["low", "Últimos ingressos"];
    return ["soon", "Disponível"];
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
        el("div", { class: "card-media" }, img ? el("img", { src: img, alt: "Capa do evento" }) : "IngressAI"),
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

    const allChip = el("button", { class: "chip", role: "tab", "aria-selected": activeCity ? "false" : "true" }, "Todas");
    allChip.addEventListener("click", () => {
      activeCity = null;
      $$('[role="tab"]', filtroCidadesEl).forEach((n) => n.setAttribute("aria-selected","false"));
      allChip.setAttribute("aria-selected","true");
      renderEvents();
    });
    filtroCidadesEl.appendChild(allChip);

    cities.forEach((city) => {
      const chip = el("button", {
        class: "chip", role: "tab",
        "aria-selected": activeCity && activeCity.toLowerCase() === city.toLowerCase() ? "true" : "false",
      }, city);
      chip.addEventListener("click", () => {
        activeCity = city;
        $$('[role="tab"]', filtroCidadesEl).forEach((n) => n.setAttribute("aria-selected","false"));
        chip.setAttribute("aria-selected","true");
        renderEvents();
      });
      filtroCidadesEl.appendChild(chip);
    });
  }

  function openEventSheet(ev) {
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
      img ? el("img", { src: img, alt: "Capa do evento" }) : document.createTextNode("IngressAI"),
    ]);

    const ctaHref =
      ev.whatsappLink ||
      ev.deepLink ||
      (ev.slug ? `${INGRESSAI_BASE}/e/${encodeURIComponent(ev.slug)}` : "") ||
      "https://wa.me/5534999992747";

    const details = el("div", { class: "std-list" }, [
      el("div", {}, `Quando: ${dateText || "—"}`),
      el("div", {}, `Local: ${ev.venue || ev.local || city || "—"}`),
    ]);

    const actions = el("div", { style: "display:flex;gap:8px;margin-top:8px" }, [
      el("a", { class: "btn btn--secondary btn--sm", href: ctaHref, target: "_blank", rel: "noopener noreferrer" }, "Comprar no WhatsApp"),
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
    if (!sheet) return;
    sheet.classList.remove("is-open");
    sheetBackdrop.classList.remove("is-open");
    sheet.setAttribute("aria-hidden", "true");
  }
  $("#sheet-close")?.addEventListener("click", closeSheet);
  sheetBackdrop?.addEventListener("click", closeSheet);
  buscaEl?.addEventListener("input", (e) => {
    searchTerm = e.target.value || "";
    renderEvents();
  });

  /* =============== Calculadora (Planos) =============== */
  const pillAtl = $("#pill-atl");
  const pillProd = $("#pill-prod");
  const priceEl = $("#calc-price");
  const qtyNEl = $("#calc-qty-n");
  const qtySlider = $("#calc-qty");

  const feeInfoEl = $("#calc-fee");
  const baseKpi = $("#calc-base");
  const finalKpi = $("#calc-final");
  const payoutKpi = $("#calc-payout");

  const receipt = $("#receipt");
  const viewFinalBtn = $("#view-final");
  const viewPayoutBtn = $("#view-payout");
  const embedFeeChk = $("#embed-fee");
  const labelPrice = $("#label-price");

  // Receipt fields
  const uBase = $("#u-base");
  const uServFee = $("#u-serv-fee");
  const uPlatFee = $("#u-plat-fee");
  const uTotal = $("#u-total");

  const tQty = $("#t-qty");
  const tBase = $("#t-base");
  const tServFee = $("#t-serv-fee");
  const tPlatFee = $("#t-plat-fee");
  const tTotal = $("#t-total");

  const labelTotalLeft = $("#label-total-left");
  const labelTotalRight = $("#label-total-right");

  let plan = "atl";        // 'atl' | 'prod'
  let viewMode = "final";  // 'final' | 'payout'
  let embed = false;       // embutir serviço no preço informado?

  function formatBRL(v) {
    try {
      return Number(v || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 2,
      });
    } catch {
      const n = Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;
      return `R$ ${n.toFixed(2)}`;
    }
  }

  function planParams(kind) {
    // Serviço = +4% ou +5% no checkout; Plataforma = -3% do base
    if (kind === "prod") return { plat_pct: 0.03, serv_pct: 0.05, label: "Produtoras — Serviço 5% • Plataforma 3%" };
    return { plat_pct: 0.03, serv_pct: 0.04, label: "Atléticas — Serviço 4% • Plataforma 3%" };
  }

  function compute(priceInput, qty, params, embedService) {
    const { plat_pct, serv_pct } = params;

    let base;        // valor base (antes das taxas)
    let finalPrice;  // preço exibido no checkout
    let servUnit;    // taxa de serviço unitária
    let platUnit;    // taxa de plataforma unitária
    let payoutUnit;  // repasse unitário

    if (!embedService) {
      // Input é BASE
      base = priceInput;
      servUnit = base * serv_pct;
      finalPrice = base + servUnit;
    } else {
      // Input é o PREÇO FINAL; backsolve base
      finalPrice = priceInput;
      base = finalPrice / (1 + serv_pct);
      servUnit = finalPrice - base; // mantém final "redondo"
    }

    platUnit = base * plat_pct;
    payoutUnit = Math.max(0, base - platUnit);

    const totalBase = base * qty;
    const totalServ = servUnit * qty;
    const totalPlat = platUnit * qty;

    return {
      base, finalPrice, servUnit, platUnit, payoutUnit,
      totalBase, totalServ, totalPlat,
      totalFinal: finalPrice * qty,
      totalPayout: payoutUnit * qty,
    };
  }

  function recalc() {
    const qPrice = Math.max(0, parseFloat((priceEl?.value || "0").replace(",", ".")) || 0);
    const qty = Math.max(0, parseInt(qtyNEl?.value || "0", 10) || 0);
    const params = planParams(plan);

    const r = compute(qPrice, qty, params, embed);

    // KPIs
    feeInfoEl && (feeInfoEl.textContent = params.label);
    baseKpi && (baseKpi.textContent = formatBRL(r.base));
    finalKpi && (finalKpi.textContent = formatBRL(r.finalPrice));
    payoutKpi && (payoutKpi.textContent = formatBRL(r.totalPayout));

    // Receipt unit
    uBase && (uBase.textContent = formatBRL(r.base));
    uServFee && (uServFee.textContent = formatBRL(r.servUnit));
    uPlatFee && (uPlatFee.textContent = formatBRL(r.platUnit));
    // Título do total conforme visor
    if (viewMode === "final") {
      labelTotalLeft && (labelTotalLeft.textContent = "Preço final");
      uTotal && (uTotal.textContent = formatBRL(r.finalPrice));
    } else {
      labelTotalLeft && (labelTotalLeft.textContent = "Repasse unitário");
      uTotal && (uTotal.textContent = formatBRL(r.payoutUnit));
    }

    // Receipt totals
    tQty && (tQty.textContent = String(qty));
    tBase && (tBase.textContent = formatBRL(r.totalBase));
    tServFee && (tServFee.textContent = formatBRL(r.totalServ));
    tPlatFee && (tPlatFee.textContent = formatBRL(r.totalPlat));
    if (viewMode === "final") {
      labelTotalRight && (labelTotalRight.textContent = "Total cobrado");
      tTotal && (tTotal.textContent = formatBRL(r.totalFinal));
    } else {
      labelTotalRight && (labelTotalRight.textContent = "Total do repasse");
      tTotal && (tTotal.textContent = formatBRL(r.totalPayout));
    }

    // Ajusta label do input conforme embed
    if (labelPrice) {
      labelPrice.textContent = embed
        ? "Preço do ingresso (exibido)"
        : "Preço do ingresso (base)";
    }
  }

  function selectPlan(kind) {
    plan = kind;
    pillAtl?.setAttribute("aria-checked", kind === "atl" ? "true" : "false");
    pillAtl?.setAttribute("aria-selected", kind === "atl" ? "true" : "false");
    pillProd?.setAttribute("aria-checked", kind === "prod" ? "true" : "false");
    pillProd?.setAttribute("aria-selected", kind === "prod" ? "true" : "false");
    recalc();
  }

  function setView(mode) {
    viewMode = mode;
    viewFinalBtn?.setAttribute("aria-pressed", mode === "final" ? "true" : "false");
    viewPayoutBtn?.setAttribute("aria-pressed", mode === "payout" ? "true" : "false");
    recalc();
  }

  pillAtl?.addEventListener("click", () => selectPlan("atl"));
  pillProd?.addEventListener("click", () => selectPlan("prod"));

  priceEl?.addEventListener("input", recalc);
  qtyNEl?.addEventListener("input", (e) => {
    const v = Math.max(0, Math.min(10000, parseInt(e.target.value || "0", 10) || 0));
    e.target.value = String(v);
    if (qtySlider) qtySlider.value = String(Math.min(1000, v));
    recalc();
  });
  qtySlider?.addEventListener("input", (e) => {
    const v = parseInt(e.target.value || "0", 10) || 0;
    if (qtyNEl) qtyNEl.value = String(v);
    recalc();
  });

  viewFinalBtn?.addEventListener("click", () => setView("final"));
  viewPayoutBtn?.addEventListener("click", () => setView("payout"));
  embedFeeChk?.addEventListener("change", (e) => {
    embed = !!e.target.checked;
    recalc();
  });

  // defaults
  selectPlan("atl");
  setView("final");
  embed = false;
  embedFeeChk && (embedFeeChk.checked = false);
  recalc();

  /* =============== Solicitação de criação (org) =============== */
  const reqForm = $("#req-form");
  const reqBtn = $("#req-send");
  const reqHint = $("#req-hint");

  async function submitOrgRequest() {
    if (!reqForm) return;
    const phone = ($("#req-phone")?.value || "").replace(/\D+/g, "");
    const title = $("#req-title")?.value?.trim() || "";
    const city = $("#req-city")?.value?.trim() || "";
    const venue = $("#req-venue")?.value?.trim() || "";
    const date = $("#req-date")?.value?.trim() || "";
    const cat =
      (reqForm.querySelector('input[name="req-cat"]:checked')?.value || "atl").toLowerCase();

    if (!phone || !title || !city) {
      if (reqHint) reqHint.textContent = "Preencha WhatsApp, nome e cidade.";
      return;
    }

    reqBtn?.setAttribute("disabled", "true");
    if (reqHint) reqHint.textContent = "Enviando…";

    try {
      const payload = { phone, title, city, venue, date, cat };
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
      try { j = await getJSON(INGRESSAI_API + "/health"); }
      catch { j = await getJSON(INGRESSAI_BASE + "/health"); }
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
    } catch {}
  }

  window.addEventListener("DOMContentLoaded", () => {
    runDiagnostics().catch((e) => console.error(e));
  });
})();
