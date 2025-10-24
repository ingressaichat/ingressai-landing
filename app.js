/* app.js — IngressAI (frontend leve)
   - vitrine, filtros, sheet
   - org request, calc de taxas
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

  // Exponho global (útil p/ debug)
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
      const msg =
        json?.error || json?.message || `HTTP ${r.status} @ ${url}`;
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
      if (v === null || v === undefined) return;
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

  /* =============== Overlay de erro =============== */
  function showErrorOverlay(title, error) {
    const wrap = $("#err-overlay");
    if (!wrap) return alert(`${title}\n\n${error?.message || error}`);
    const pre = $("#err-pre");
    const h4 = $("#err-card h4");
    h4.textContent = title || "Erro";
    pre.textContent =
      (error && (error.stack || error.message)) ||
      (typeof error === "string" ? error : JSON.stringify(error, null, 2));
    wrap.style.display = "flex";
    wrap.addEventListener("click", () => (wrap.style.display = "none"), {
      once: true,
    });
  }

  /* =============== Drawer =============== */
  const drawer = $("#drawer");
  const drawerBackdrop = $("#drawer-backdrop");
  const btnDrawerOpen = $("#drawer-toggle");
  const btnDrawerClose = $("#drawer-close");
  const drawerValidator = $("#drawer-validator");

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

  // atalho do validador (href já é ajustado no index; aqui só previno vazio)
  if (drawerValidator) {
    drawerValidator.addEventListener("click", (ev) => {
      if (!drawerValidator.href || drawerValidator.getAttribute("href") === "#") {
        ev.preventDefault();
        const url = INGRESSAI_BASE.replace(/\/+$/, "") + "/app/validator.html";
        location.href = url;
      }
    });
  }

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
  const sheet = $("#sheet");
  const sheetBody = $("#sheet-body");
  const sheetBackdrop = $("#sheet-backdrop");
  const btnSheetClose = $("#sheet-close");

  let allEvents = [];
  let activeCity = null;
  let searchTerm = "";

  async function fetchEventsSmart() {
    // Tenta em ordem decrescente de “provável existência”
    const endpoints = [
      "/api/events/vitrine",
      "/api/events/public",
      "/api/events",
    ];
    for (const p of endpoints) {
      try {
        const url = INGRESSAI_API + p;
        const json = await getJSON(url);
        // aceito formatos:
        // { ok:true, events:[...] } | { events:[...] } | [...]
        const events =
          json?.events || (Array.isArray(json) ? json : json?.data) || [];
        if (Array.isArray(events) && events.length >= 0) return events;
      } catch (e) {
        // segue pro próximo
        // console.debug("events endpoint fail", p, e.message);
      }
    }
    // se nenhum funcionou, erro
    throw new Error("Nenhum endpoint de eventos respondeu.");
  }

  function cityFrom(ev) {
    // tenta campos comuns
    return (
      ev.city ||
      ev.cidade ||
      ev.location?.city ||
      ev.venueCity ||
      ev.placeCity ||
      null
    );
  }

  function dateTextFrom(ev) {
    return ev.dateText || ev.eventDateText || ev.date || ev.startsAt || "";
  }

  function mediaFrom(ev) {
    return (
      ev.coverUrl ||
      ev.image ||
      ev.banner ||
      ev.media?.[0] ||
      ev.thumb ||
      null
    );
  }

  function statusChip(ev) {
    // heurística simples
    if (ev.soldOut) return ["sold", "Esgotado"];
    if (ev.lowStock) return ["low", "Últimos ingressos"];
    return ["soon", "Disponível"];
  }

  function renderEvents() {
    if (!listaEl) return;
    const q = (searchTerm || "").trim().toLowerCase();

    const filtered = allEvents.filter((ev) => {
      const city = (cityFrom(ev) || "").toLowerCase();
      const title =
        (ev.title || ev.name || ev.eventTitle || "").toLowerCase();
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
      const dateText = dateTextFrom(ev);
      const img = mediaFrom(ev);
      const [k, label] = statusChip(ev);

      const card = el(
        "article",
        { class: "card", tabindex: "0", role: "button" },
        [
          el("div", { class: "card-header" }, [
            el("div", {}, [
              el("div", { class: "card-city" }, city || "—"),
              el(
                "div",
                { class: "card-title" },
                ev.title || ev.name || ev.eventTitle || "Evento"
              ),
              el(
                "div",
                { class: `status-line status--${k}` },
                [
                  el("span", { class: "status-dot", "aria-hidden": "true" }),
                  el("span", {}, label),
                ]
              ),
            ]),
          ]),
          el(
            "div",
            { class: "card-media" },
            img ? el("img", { src: img, alt: "Capa do evento" }) : "IngressAI"
          ),
        ]
      );

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

    // chip “todas”
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
    if (!sheet || !sheetBody) return;
    sheetBody.innerHTML = "";

    const city = cityFrom(ev);
    const dateText = dateTextFrom(ev);
    const img = mediaFrom(ev);

    const head = el("div", {}, [
      el("h3", {}, ev.title || ev.name || ev.eventTitle || "Evento"),
      el(
        "div",
        { class: "status-chip soon", style: "margin-top:6px" },
        [el("span", { class: "dot" }), el("span", {}, city || "—")]
      ),
    ]);

    const mediaNode = el("div", { class: "sheet-media" }, [
      img ? el("img", { src: img, alt: "Capa do evento" }) : document.createTextNode("IngressAI"),
    ]);

    // CTA: se o backend expõe link/slug, uso; senão, fallback para o WhatsApp geral
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
    if (!sheet) return;
    sheet.classList.remove("is-open");
    sheetBackdrop.classList.remove("is-open");
    sheet.setAttribute("aria-hidden", "true");
  }
  btnSheetClose?.addEventListener("click", closeSheet);
  sheetBackdrop?.addEventListener("click", closeSheet);

  buscaEl?.addEventListener("input", (e) => {
    searchTerm = e.target.value || "";
    renderEvents();
  });

  /* =============== Calculadora =============== */
  const pillAtl = $("#pill-atl");
  const pillProd = $("#pill-prod");
  const priceEl = $("#calc-price");
  const qtyNEl = $("#calc-qty-n");
  const qtySlider = $("#calc-qty");
  const feeLabel = $("#calc-fee");
  const feeUnit = $("#calc-fee-unit");
  const grossEl = $("#calc-gross");
  const netEl = $("#calc-net");

  let feeMode = "atl"; // atl | prod

  function formatBRL(v) {
    try {
      return v.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 2,
      });
    } catch {
      return `R$ ${Number(v || 0).toFixed(2)}`;
    }
  }

  function feeParams(mode) {
    // retorna { pct, fixo }
    return mode === "prod" ? { pct: 0.10, fixo: 1.2 } : { pct: 0.08, fixo: 1.0 };
  }

  function recalc() {
    const price = Math.max(0, parseFloat(priceEl?.value || "0") || 0);
    const qty = Math.max(0, parseInt(qtyNEl?.value || "0", 10) || 0);
    const { pct, fixo } = feeParams(feeMode);

    // taxa por ingresso
    const unitFee = price * pct + fixo;

    // totais
    const gross = price * qty;
    const totalFees = unitFee * qty;
    const net = Math.max(0, gross - totalFees);

    feeLabel && (feeLabel.textContent =
      (feeMode === "prod" ? "10% + R$ 1,20" : "8% + R$ 1,00"));
    feeUnit && (feeUnit.textContent = formatBRL(unitFee));
    grossEl && (grossEl.textContent = formatBRL(gross));
    netEl && (netEl.textContent = formatBRL(net));
  }

  function selectPill(mode) {
    feeMode = mode;
    pillAtl?.setAttribute("aria-checked", mode === "atl" ? "true" : "false");
    pillAtl?.setAttribute("aria-selected", mode === "atl" ? "true" : "false");
    pillProd?.setAttribute("aria-checked", mode === "prod" ? "true" : "false");
    pillProd?.setAttribute("aria-selected", mode === "prod" ? "true" : "false");
    recalc();
  }

  pillAtl?.addEventListener("click", () => selectPill("atl"));
  pillProd?.addEventListener("click", () => selectPill("prod"));

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

  // start valores default
  selectPill("atl");
  recalc();

  /* =============== Solicitação de criação (org) =============== */
  const reqForm = $("#req-form");
  const reqBtn = $("#req-send");
  const reqHint = $("#req-hint");

  async function submitOrgRequest() {
    if (!reqForm) return;
    const phone = $("#req-phone")?.value?.trim() || "";
    const title = $("#req-title")?.value?.trim() || "";
    const city = $("#req-city")?.value?.trim() || "";
    const venue = $("#req-venue")?.value?.trim() || "";
    const date = $("#req-date")?.value?.trim() || "";
    const cat =
      (reqForm.querySelector('input[name="req-cat"]:checked')?.value || "atl")
        .toLowerCase();

    if (!phone || !title || !city) {
      reqHint && (reqHint.textContent = "Preencha WhatsApp, nome e cidade.");
      return;
    }

    reqBtn?.setAttribute("disabled", "true");
    reqHint && (reqHint.textContent = "Enviando…");

    try {
      const payload = { phone, title, city, venue, date, cat };
      const res = await postJSON(INGRESSAI_API + "/api/org/request", payload);
      if (res?.ok) {
        reqHint && (reqHint.textContent = "Solicitação enviada. Você receberá o passo a passo no WhatsApp.");
        reqForm.reset();
      } else {
        reqHint && (reqHint.textContent = "Não foi possível enviar agora.");
      }
    } catch (e) {
      reqHint && (reqHint.textContent = "Falha ao enviar. Tente novamente.");
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
    // API base
    setDiag(dApi, !!INGRESSAI_API, INGRESSAI_API || "off");

    // Health
    try {
      const j = await getJSON(INGRESSAI_API + "/api/health");
      setDiag(dHealth, !!j?.ok, j?.ok ? "on" : "off");
      authIndicator?.classList.remove("off", "on");
      authIndicator?.classList.add(j?.ok ? "on" : "off");
      authIndicator && (authIndicator.textContent = j?.ok ? "online" : "offline");
    } catch (e) {
      setDiag(dHealth, false);
      authIndicator?.classList.remove("off", "on");
      authIndicator?.classList.add("off");
      authIndicator && (authIndicator.textContent = "offline");
    }

    // Eventos
    try {
      allEvents = await fetchEventsSmart();
      setDiag(dEv, true, `${allEvents.length} evt`);
      buildCityChips();
      renderEvents();
    } catch (e) {
      setDiag(dEv, false, "—");
      console.error(e);
      // mantém UI, mas mostra overlay se quiser debugar
      // showErrorOverlay("Falha ao listar eventos", e);
    }

    // Validador: HEAD (ou GET) do arquivo estático
    try {
      const url = INGRESSAI_BASE.replace(/\/+$/, "") + "/app/validator.html";
      const r = await fetch(url, { method: "HEAD", cache: "no-store" });
      const ok = r.ok || r.status === 200;
      // se o index ainda não setou, garanto aqui
      if (ok && orgValidatorBtn && (!orgValidatorBtn.href || orgValidatorBtn.getAttribute("href") === "#")) {
        orgValidatorBtn.href = url;
      }
    } catch {
      // silencioso — pode estar em outra origem
    }
  }

  /* =============== Boot =============== */
  window.addEventListener("DOMContentLoaded", () => {
    runDiagnostics().catch((e) => console.error(e));
  });
})();
