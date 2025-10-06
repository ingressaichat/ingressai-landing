/* app/app.js — Landing IngressAI (GitHub Pages) */

(() => {
  const API = window.INGRESSAI_API;                   // ex.: https://...railway.app/api
  const BASE = window.INGRESSAI_BASE;                 // ex.: https://...railway.app
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));

  const els = {
    lista: $("#lista-eventos"),
    filtroCidades: $("#filtro-cidades"),
    busca: $("#busca-eventos"),
    orgSec: $("#organizadores"),
    ctaOrg: $("#cta-organizadores"),
    navOrg: $("#nav-org"),
    navLogin: $("#nav-login"),
    diagApi: $("#d-api"),
    diagHealth: $("#d-health"),
    diagEv: $("#d-ev"),
    tagAuth: $("#auth-indicator"),

    // modal OTP
    modal: $("#login-modal"),
    loginPhone: $("#login-phone"),
    loginSend: $("#login-send"),
    loginCancel: $("#login-cancel"),
    codeBlock: $("#code-block"),
    codeBack: $("#code-back"),
    codeInput: $("#login-code"),
    codeVerify: $("#code-verify"),
    loginHint: $("#login-hint"),

    // sheet
    sheet: $("#sheet"),
    sheetBody: $("#sheet-body"),
    sheetBackdrop: $("#sheet-backdrop"),
  };

  const state = {
    events: [],
    filtered: [],
    cities: [],
    city: "todas",
    term: "",
    health: null,
    otpRef: null,
    isAuth: false
  };

  function fmtBRL(n){
    try { return (n || 0).toLocaleString("pt-BR",{ style:"currency", currency:"BRL" }); }
    catch{ return "R$ 0,00"; }
  }

  function openModal(){ els.modal.setAttribute("aria-hidden","false"); }
  function closeModal(){ els.modal.setAttribute("aria-hidden","true"); resetOtpUI(); }
  function resetOtpUI(){
    els.codeBlock.style.display = "none";
    els.loginHint.textContent = "";
    els.codeInput.value = "";
  }

  // ---------- UI ----------
  function renderCities(){
    els.filtroCidades.innerHTML = "";
    const all = ["todas", ...state.cities];
    all.forEach(city => {
      const b = document.createElement("button");
      b.className = "chip";
      b.role = "tab";
      b.textContent = city;
      b.setAttribute("aria-selected", city === state.city ? "true" : "false");
      b.addEventListener("click", () => {
        state.city = city;
        renderList();
        renderCities();
      });
      els.filtroCidades.appendChild(b);
    });
  }

  function card(ev){
    const soon  = ev.status === "em_breve" || ev.status === "aberto";
    const low   = ev.status === "quase_esgotado";
    const sold  = ev.status === "esgotado";
    const stc   = sold ? "sold" : (low ? "low" : (soon ? "soon" : "soon"));

    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div class="card-header">
        <div>
          <div class="card-title">${ev.title || "Evento"}</div>
          <div class="card-city">${ev.city || "-"}</div>
          <div class="status-line status--${stc}">
            <span class="status-dot"></span>
            <span>${ev.status_label || ev.status || ""}</span>
          </div>
        </div>
      </div>
      <div class="card-media">
        ${ev.cover ? `<img src="${ev.cover}" alt="">` : "IngressAI"}
      </div>
      <div class="card-meta">
        <div class="subtle">${ev.date_label || ev.date || ""}</div>
        ${ev.price ? `<strong>${fmtBRL(ev.price)}</strong>` : ""}
      </div>
    `;
    div.addEventListener("click", () => openSheet(ev));
    return div;
  }

  function openSheet(ev){
    els.sheetBody.innerHTML = `
      <div class="sheet-head">
        <h3>${ev.title}</h3>
        <span class="status-chip ${ev.status}">
          <span class="dot" style="background:#1B5FB3"></span>
          ${ev.status_label || ev.status}
        </span>
      </div>
      <a class="sheet-media" href="${ev.deep_link || '#'}" target="_blank" rel="noopener">
        ${ev.cover ? `<img src="${ev.cover}" alt="">` : ""}
      </a>
      <div><strong>Cidade:</strong> ${ev.city || "-"}</div>
      ${ev.date_label ? `<div><strong>Data:</strong> ${ev.date_label}</div>` : ""}
      ${ev.price ? `<div><strong>A partir de:</strong> ${fmtBRL(ev.price)}</div>` : ""}
      ${ev.deep_link ? `<a class="btn btn--secondary btn--sm" href="${ev.deep_link}" target="_blank" rel="noopener">Comprar no WhatsApp</a>` : ""}
    `;
    els.sheet.classList.add("is-open");
    els.sheet.setAttribute("aria-hidden","false");
    els.sheetBackdrop.classList.add("is-open");
  }

  function closeSheet(){
    els.sheet.classList.remove("is-open");
    els.sheetBackdrop.classList.remove("is-open");
    els.sheet.setAttribute("aria-hidden","true");
  }

  function renderList(){
    const term = state.term.trim().toLowerCase();
    state.filtered = state.events
      .filter(ev => state.city === "todas" ? true : (ev.city || "").toLowerCase() === state.city.toLowerCase())
      .filter(ev => !term ? true : (ev.title||"").toLowerCase().includes(term));

    els.lista.innerHTML = "";
    state.filtered.forEach(ev => els.lista.appendChild(card(ev)));
    els.diagEv.textContent = String(state.filtered.length);
  }

  // ---------- DATA ----------
  async function fetchJSON(url, opts={}){
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  }

  async function loadHealth(){
    try{
      const j = await fetchJSON(`${API}/health`);
      state.health = j;
      els.diagHealth.textContent = "on";
      els.diagApi.textContent = API;
    }catch(e){
      els.diagHealth.textContent = "off";
      els.diagApi.textContent = API + " (erro)";
      console.error(e);
    }
  }

  async function loadEvents(){
    try{
      const { items=[] } = await fetchJSON(`${API}/events`);
      state.events = items;
      const cities = Array.from(new Set(items.map(e => (e.city||"").trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'pt-BR'));
      state.cities = cities;
      renderCities();
      renderList();
    }catch(e){
      console.error("Falha ao carregar eventos:", e);
    }
  }

  // ---------- OTP ----------
  function showCodeStep(){
    els.codeBlock.style.display = "block";
    els.codeInput.focus();
  }

  function isValidPhone(s){
    return /^[1-9]\d{10,14}$/.test(String(s||"").replace(/\D/g,""));
  }

  async function requestOtp(){
    const phoneRaw = (els.loginPhone.value || "").replace(/\D/g,"");
    if (!isValidPhone(phoneRaw)){
      els.loginHint.textContent = "Informe DDI+DDD+número (ex.: 5534999999999)";
      return;
    }
    els.loginHint.textContent = "Enviando código...";
    try{
      const res = await fetch(`${API}/auth/request`,{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        credentials:"include",
        body: JSON.stringify({ phone: phoneRaw })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message || "Erro ao solicitar código");
      state.otpRef = j.ref || null;
      els.loginHint.textContent = "Código enviado via WhatsApp ✨";
      showCodeStep();
    }catch(e){
      els.loginHint.textContent = "Não foi possível enviar o código.";
      console.error(e);
    }
  }

  async function verifyOtp(){
    const code = (els.codeInput.value || "").trim();
    if (!/^\d{4,6}$/.test(code)){
      els.loginHint.textContent = "Código inválido.";
      return;
    }
    els.loginHint.textContent = "Verificando...";
    try{
      const res = await fetch(`${API}/auth/verify`,{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        credentials:"include",
        body: JSON.stringify({ code, ref: state.otpRef })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message || "Falha na verificação");

      state.isAuth = true;
      els.tagAuth.textContent = "online";
      els.tagAuth.classList.remove("off");
      els.tagAuth.classList.add("on");
      els.loginHint.textContent = "Ok! Redirecionando...";
      // envia para o dashboard do backend
      location.href = `${BASE}/app/dashboard.html`;
    }catch(e){
      els.loginHint.textContent = "Código inválido ou expirado.";
      console.error(e);
    }
  }

  // ---------- REQ criação de evento ----------
  async function sendCreateRequest(){
    const phone = ($("#req-phone")?.value||"").replace(/\D/g,"");
    const title = ($("#req-title")?.value||"").trim();
    const city  = ($("#req-city")?.value||"").trim();
    const venue = ($("#req-venue")?.value||"").trim();
    const date  = ($("#req-date")?.value||"").trim();
    const hint  = $("#req-hint");

    if (!isValidPhone(phone)) { hint.textContent = "Telefone inválido."; return; }
    if (!title || !city){ hint.textContent = "Preencha nome e cidade."; return; }

    hint.textContent = "Enviando...";
    try{
      const res = await fetch(`${API}/organizers/requests`,{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ phone, title, city, venue, date })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message || "Erro ao enviar");
      hint.textContent = "Recebido! te chamamos no WhatsApp ✅";
    }catch(e){
      hint.textContent = "Não foi possível enviar agora.";
      console.error(e);
    }
  }

  // ---------- eventos UI ----------
  function bindUI(){
    // scroll / header
    const header = document.querySelector("header");
    document.addEventListener("scroll", () => {
      header.classList.toggle("is-scrolled", window.scrollY>4);
    });

    els.busca.addEventListener("input", (e) => {
      state.term = e.target.value;
      renderList();
    });

    // abrir/fechar sheet
    els.sheetBackdrop.addEventListener("click", closeSheet);
    document.addEventListener("click", (e)=>{
      if (e.target?.matches?.("[data-close='sheet']")) closeSheet();
    });

    // abrir seção organizadores
    els.navOrg.addEventListener("click", (e)=>{ e.preventDefault(); toggleOrganizadores(true); });
    els.ctaOrganizadores?.addEventListener?.("click",(e)=>{ e.preventDefault(); toggleOrganizadores(true); });

    // OTP modal
    els.navLogin.addEventListener("click",(e)=>{ e.preventDefault(); openModal(); });
    els.loginCancel.addEventListener("click", closeModal);
    els.loginSend.addEventListener("click", requestOtp);
    els.codeBack.addEventListener("click", resetOtpUI);
    els.codeVerify.addEventListener("click", verifyOtp);

    // req criação
    $("#req-send")?.addEventListener("click", sendCreateRequest);
  }

  function toggleOrganizadores(show){
    els.orgSec.hidden = !show;
    if (show) els.orgSec.scrollIntoView({ behavior:"smooth", block:"start" });
  }

  // ---------- boot ----------
  async function boot(){
    try{
      bindUI();
      await Promise.all([loadHealth(), loadEvents()]);
      els.tagAuth.textContent = "offline";
      els.tagAuth.classList.add("off");
    }catch(e){
      console.error(e);
      showError(e);
    }
  }

  function showError(err){
    $("#err-pre").textContent = String(err?.stack || err?.message || err);
    $("#err-overlay").style.display = "flex";
  }

  boot();
})();
