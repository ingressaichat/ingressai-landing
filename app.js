/* IngressAI — Landing (GitHub Pages)
   - Lê a API do <meta name="ingressai-api"> ou ?api=
   - Lista cidades e eventos
   - Faz health check e indica online/offline
   - Fluxo de OTP e redireciona p/ Dashboard no backend
   - Form de “Quero criar meu evento”
*/

(function () {
  "use strict";

  // --------- Utils ---------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fmtBRL = (n) =>
    (isFinite(n) ? n : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const apiMeta = document.querySelector('meta[name="ingressai-api"]');
  const API = (window.INGRESSAI_API || (apiMeta && apiMeta.content) || "").replace(/\/+$/, "");
  const BASE = (window.INGRESSAI_BASE || API.replace(/\/api$/,'')).replace(/\/+$/,""); // backend sem /api

  const els = {
    health: $("#d-health"),
    api: $("#d-api"),
    evCount: $("#d-ev2"),
    cards: $("#lista-eventos"),
    cities: $("#filtro-cidades"),
    search: $("#busca-eventos"),
    hero: $(".hero"),
    orgSection: $("#organizadores"),
    orgNav: $("#nav-org"),
    ctaOrg: $("#cta-organizadores"),
    validator: $("#nav-validator"),
    loginBtn: $("#nav-login"),
    authIndicator: $("#auth-indicator"),
    sheet: $("#sheet"),
    sheetBody: $("#sheet-body"),
    sheetBackdrop: $("#sheet-backdrop"),
    sheetClose: $("#sheet-close"),
    req: {
      phone: $("#req-phone"),
      title: $("#req-title"),
      city: $("#req-city"),
      venue: $("#req-venue"),
      date: $("#req-date"),
      send: $("#req-send"),
      hint: $("#req-hint"),
    },
    calc: {
      gross: $("#calc-gross"),
      net: $("#calc-net"),
      ev: $("#d-ev"),
    },
    stdCard: $("#std-card"),
    // modal login
    modal: $("#login-modal"),
    loginPhone: $("#login-phone"),
    loginSend: $("#login-send"),
    loginCancel: $("#login-cancel"),
    codeBlock: $("#code-block"),
    codeBack: $("#code-back"),
    codeVerify: $("#code-verify"),
    codeInput: $("#login-code"),
    loginHint: $("#login-hint"),
    // debug
    errOverlay: $("#err-overlay"),
    errPre: $("#err-pre"),
  };

  // Exibe erro em overlay (para depurar no Pages)
  function showErr(e) {
    try {
      els.errPre.textContent = (e && (e.stack || e.message || e.toString())) || String(e);
      els.errOverlay.style.display = "flex";
    } catch (_) {}
  }

  // Fetch pequeno com tratamento simples
  async function apiFetch(path, opts = {}) {
    const url = path.startsWith("http") ? path : `${API}${path}`;
    const res = await fetch(url, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
      mode: "cors",
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText} — ${t || url}`);
    }
    const ct = res.headers.get("content-type") || "";
    return ct.includes("application/json") ? res.json() : res.text();
  }

  // --------- Navegação/header ---------
  function setHeaderEffects() {
    const onScroll = () => {
      const scrolled = window.scrollY > 10;
      document.querySelector("header").classList.toggle("is-scrolled", scrolled);
      // anima hero sutil
      document.documentElement.style.setProperty("--hero-p", Math.min(1, window.scrollY / 140));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  function wireAnchorToggles() {
    // abre/fecha seção organizadores
    function openOrganizadores() {
      els.orgSection.hidden = false;
      els.orgSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    els.orgNav?.addEventListener("click", (e) => {
      e.preventDefault();
      openOrganizadores();
    });
    els.ctaOrg?.addEventListener("click", (e) => {
      e.preventDefault();
      openOrganizadores();
    });

    // Validador → backend
    els.validator?.addEventListener("click", (e) => {
      e.preventDefault();
      window.open(`${BASE}/validator`, "_blank", "noopener,noreferrer");
    });
  }

  // --------- Health / status ---------
  async function checkHealth() {
    els.api.textContent = API;
    try {
      const h = await apiFetch("/health");
      const ok = (h && (h.ok === true || h.status === "ok")) ? "on" : "off";
      els.health.textContent = ok;
      els.authIndicator.textContent = ok === "on" ? "online" : "offline";
      els.authIndicator.classList.toggle("on", ok === "on");
      els.authIndicator.classList.toggle("off", ok !== "on");
    } catch (e) {
      els.health.textContent = "off";
      els.authIndicator.textContent = "offline";
      els.authIndicator.classList.remove("on");
      els.authIndicator.classList.add("off");
      // não quebra a página se o /health falhar
      console.warn("Health check failed:", e);
    }
  }

  // --------- Vitrine ---------
  let allEvents = [];
  let activeCity = "";

  function renderCities(list = []) {
    els.cities.innerHTML = "";
    const makeChip = (label, value = "") => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.setAttribute("role", "tab");
      btn.textContent = label;
      btn.dataset.city = value;
      btn.addEventListener("click", () => {
        activeCity = value;
        $$(".chip", els.cities).forEach((c) => c.setAttribute("aria-selected", String(c === btn)));
        renderEvents();
      });
      return btn;
    };
    const all = makeChip("Todas", "");
    all.setAttribute("aria-selected", "true");
    els.cities.appendChild(all);
    list.forEach((c) => els.cities.appendChild(makeChip(c, c)));
  }

  function renderEvents() {
    const q = (els.search.value || "").toLowerCase().trim();
    let items = allEvents.slice();

    if (activeCity) items = items.filter((e) => (e.city || "").toLowerCase() === activeCity.toLowerCase());
    if (q) items = items.filter((e) => (e.title || "").toLowerCase().includes(q));

    els.evCount.textContent = String(items.length);
    els.calc.ev.textContent = String(allEvents.length);

    els.cards.innerHTML = "";
    if (!items.length) {
      els.cards.innerHTML = `<div class="subtle">Nenhum evento encontrado.</div>`;
      return;
    }

    for (const ev of items) {
      const card = document.createElement("article");
      card.className = "card";
      const price = ev.price ?? ev.minPrice ?? 0;
      const status = ev.status || "soon"; // soon | low | sold
      const dotClass = status === "low" ? "status--low" : status === "sold" ? "status--sold" : "status--soon";
      const media = ev.cover || ev.image || "";

      card.innerHTML = `
        <div class="card-header">
          <div>
            <div class="card-title">${escapeHtml(ev.title || "Evento")}</div>
            <div class="card-city">${escapeHtml(ev.city || "-")}</div>
            <div class="status-line ${dotClass}">
              <span class="status-dot"></span>
              <span>${statusLabel(status)}</span>
            </div>
          </div>
          <div><strong>${fmtBRL(price)}</strong></div>
        </div>
        <a class="card-media" href="#" data-ev="${ev.id}">
          ${media ? `<img src="${media}" alt="">` : `<span>IngressAI</span>`}
        </a>
      `;

      card.querySelector('[data-ev]')?.addEventListener("click", (e) => {
        e.preventDefault();
        openSheet(ev);
      });

      els.cards.appendChild(card);
    }
  }

  function statusLabel(s) {
    if (s === "low") return "Últimos ingressos";
    if (s === "sold") return "Esgotado";
    return "Em breve";
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
  }

  function wireSearch() {
    els.search.addEventListener("input", () => renderEvents());
  }

  async function loadVitrine() {
    try {
      const [cities, events] = await Promise.allSettled([
        apiFetch("/cities"),
        apiFetch("/events"),
      ]);

      const cityList = cities.status === "fulfilled" && Array.isArray(cities.value) ? cities.value : [];
      const evList = events.status === "fulfilled" && Array.isArray(events.value) ? events.value : [];

      renderCities(cityList);
      allEvents = evList;
      renderEvents();
    } catch (e) {
      console.warn("Falha ao carregar vitrine:", e);
    }
  }

  // --------- Sheet (detalhe) ---------
  function openSheet(ev) {
    els.sheetBody.innerHTML = `
      <div class="sheet-head">
        <h3>${escapeHtml(ev.title || "Evento")}</h3>
        <div class="status-chip ${ev.status || "soon"}">
          <span class="dot" style="background:#cfe3ff"></span>
          ${statusLabel(ev.status || "soon")}
        </div>
      </div>
      <div class="sheet-media">${ev.cover ? `<img src="${ev.cover}" alt="">` : ""}</div>
      <div class="std-list">
        <li><strong>Cidade:</strong> ${escapeHtml(ev.city || "-")}</li>
        ${ev.venue ? `<li><strong>Local:</strong> ${escapeHtml(ev.venue)}</li>` : ""}
        ${ev.date ? `<li><strong>Data:</strong> ${escapeHtml(new Date(ev.date).toLocaleString("pt-BR"))}</li>` : ""}
        <li><strong>Preço:</strong> ${fmtBRL(ev.price ?? ev.minPrice ?? 0)}</li>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <a class="btn btn--secondary btn--sm" href="${whatsappLink(ev)}" target="_blank" rel="noopener">Comprar no WhatsApp</a>
        <a class="btn btn--ghost btn--sm" href="#" id="sheet-close-btn">Fechar</a>
      </div>
    `;
    els.sheet.setAttribute("aria-hidden", "false");
    els.sheet.classList.add("is-open");
    els.sheetBackdrop.classList.add("is-open");
    $("#sheet-close-btn")?.addEventListener("click", (e) => { e.preventDefault(); closeSheet(); });
  }

  function closeSheet(){
    els.sheet.setAttribute("aria-hidden", "true");
    els.sheet.classList.remove("is-open");
    els.sheetBackdrop.classList.remove("is-open");
  }

  els.sheetBackdrop?.addEventListener("click", closeSheet);
  els.sheetClose?.addEventListener("click", closeSheet);

  function whatsappLink(ev){
    // fallback simples; se backend fornecer deep-link, pode vir em ev.wa_link
    if (ev.wa_link) return ev.wa_link;
    const title = encodeURIComponent(ev.title || "Evento");
    return `https://wa.me/5534999992747?text=Quero%20comprar%20para%20${title}`;
  }

  // --------- Organizadores ---------
  function wireOrganizerCalc() {
    const radios = $$('input[name="org-cat"]');
    const recalc = () => {
      const cat = (radios.find(r => r.checked)?.value) || "promotor";
      // exemplo fixo (pode ser lido do backend futuramente)
      const fee = cat === "casa" ? 0.065 : 0.08;
      const total = allEvents.reduce((acc, e) => acc + (e.price ?? e.minPrice ?? 0), 0);
      const net = total * (1 - fee);
      els.calc.gross.textContent = fmtBRL(total);
      els.calc.net.textContent = fmtBRL(net);
    };
    radios.forEach(r => r.addEventListener("change", recalc));
    recalc();
  }

  async function wireOrganizerForm() {
    els.req.send?.addEventListener("click", async () => {
      els.req.hint.textContent = "Enviando...";
      try {
        const payload = {
          phone: (els.req.phone.value || "").trim(),
          title: (els.req.title.value || "").trim(),
          city: (els.req.city.value || "").trim(),
          venue: (els.req.venue.value || "").trim(),
          date: els.req.date.value ? new Date(els.req.date.value).toISOString() : null,
        };
        if (!payload.phone || !payload.title || !payload.city) {
          els.req.hint.textContent = "Preencha telefone, nome e cidade.";
          return;
        }
        await apiFetch("/organizers/request", { method: "POST", body: JSON.stringify(payload) });
        els.req.hint.textContent = "Solicitação enviada! Você receberá uma confirmação no WhatsApp.";
      } catch (e) {
        els.req.hint.textContent = "Falha ao enviar. Tente novamente.";
        console.warn(e);
      }
    });

    // texto/benefícios (opcional do backend)
    try {
      const txt = await apiFetch("/organizers/text").catch(() => null);
      if (txt && (txt.html || txt.markdown)) {
        els.stdCard.innerHTML = txt.html || `<pre>${txt.markdown}</pre>`;
      } else {
        els.stdCard.innerHTML = `
          <ul class="std-list">
            <li>Checkout instantâneo via WhatsApp</li>
            <li>Repasse T+0 via Pix</li>
            <li>QR Code antifraude e validador</li>
            <li>Dashboard para gestão de ingressos</li>
          </ul>`;
      }
    } catch (_) {}
  }

  // --------- Login OTP → Dashboard no backend ---------
  function openLoginModal() {
    els.modal.setAttribute("aria-hidden", "false");
    els.loginHint.textContent = "";
    els.codeBlock.style.display = "none";
    els.loginPhone.focus();
  }
  function closeLoginModal() {
    els.modal.setAttribute("aria-hidden", "true");
  }

  function wireLogin() {
    els.loginBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      openLoginModal();
    });
    els.loginCancel?.addEventListener("click", (e) => {
      e.preventDefault();
      closeLoginModal();
    });

    els.loginSend?.addEventListener("click", async () => {
      const phone = (els.loginPhone.value || "").trim();
      if (!phone) {
        els.loginHint.textContent = "Informe seu WhatsApp com DDI+DDD.";
        return;
      }
      els.loginHint.textContent = "Enviando código...";
      try {
        await apiFetch("/auth/send-otp", { method: "POST", body: JSON.stringify({ phone }) });
        els.loginHint.textContent = "Código enviado no seu WhatsApp.";
        els.codeBlock.style.display = "block";
        els.codeInput.focus();
      } catch (e) {
        els.loginHint.textContent = "Não foi possível enviar o código.";
        console.warn(e);
      }
    });

    els.codeBack?.addEventListener("click", (e) => {
      e.preventDefault();
      els.codeBlock.style.display = "none";
    });

    els.codeVerify?.addEventListener("click", async () => {
      const phone = (els.loginPhone.value || "").trim();
      const code = (els.codeInput.value || "").trim();
      if (!phone || !code) {
        els.loginHint.textContent = "Preencha telefone e código.";
        return;
      }
      els.loginHint.textContent = "Verificando...";
      try {
        const r = await apiFetch("/auth/verify", { method: "POST", body: JSON.stringify({ phone, code }) });
        // esperamos algo como { ok:true, token:"..." }
        if (r && r.token) {
          els.loginHint.textContent = "Ok! Redirecionando...";
          await sleep(400);
          // dashboard vive no backend root (sem /api)
          location.href = `${BASE}/dashboard?token=${encodeURIComponent(r.token)}`;
        } else {
          els.loginHint.textContent = "Código inválido.";
        }
      } catch (e) {
        els.loginHint.textContent = "Falha na verificação.";
        console.warn(e);
      }
    });
  }

  // --------- Init ---------
  async function init() {
    try {
      setHeaderEffects();
      wireAnchorToggles();
      wireSearch();
      wireOrganizerCalc();
      await checkHealth();
      await loadVitrine();
      await wireOrganizerForm();
      wireLogin();
    } catch (e) {
      showErr(e);
    }
  }

  // run
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
