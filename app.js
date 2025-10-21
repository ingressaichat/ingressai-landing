/* eslint-disable no-console */
console.log("[IngressAI] app.js boot");

/* ================== config de API ================== */
function normalizeApi(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  s = s.replace(/\/+$/g, "");
  if (!/\/api$/i.test(s)) s += "/api";
  s = s.replace(/([^:])\/{2,}/g, "$1/");
  return s;
}

(function bootstrapApi() {
  const qsApi   = new URLSearchParams(location.search).get("api") || "";
  const metaApi = document.querySelector('meta[name="ingressai-api"]')?.getAttribute("content") || "";
  const winApi  = (typeof window !== "undefined" && window.INGRESSAI_API) ? window.INGRESSAI_API : "";
  const pref    = qsApi || metaApi || winApi || "https://ingressai-backend-production.up.railway.app/api";
  window.INGRESSAI_API = normalizeApi(pref);
})();

const API_PARAM       = new URLSearchParams(location.search).get("api");
const ENV_API         = (typeof window !== "undefined" && window.INGRESSAI_API) ? window.INGRESSAI_API : "";
const BASE_WITH_API   = normalizeApi(API_PARAM || ENV_API || "https://ingressai-backend-production.up.railway.app/api");
const BASE_ROOT       = BASE_WITH_API.replace(/\/api$/, "");
const WHATSAPP_NUMBER = "5534999992747";

/* ================== helpers ================== */
function absUrl(u){
  try{
    const s = String(u || "").trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith("/")) return `${BASE_ROOT.replace(/\/$/, "")}${s}`;
    return `${BASE_ROOT}/${s}`;
  }catch{ return ""; }
}

async function tryFetch(paths, opts) {
  let lastErr;
  for (const p of paths) {
    try {
      const res = await fetch(p, { mode: "cors", ...opts });
      if (res.ok) return res;
      lastErr = new Error(`HTTP ${res.status} @ ${p}`);
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("Falha na requisição");
}

async function fetchJson(url, opts) {
  const res = await fetch(url, {
    headers: { "Accept": "application/json", ...(opts?.headers || {}) },
    mode: "cors",
    credentials: opts?.credentials || "omit",
    ...opts
  });
  const ct = res.headers.get("content-type") || "";
  const j = ct.includes("application/json") ? await res.json().catch(()=>null) : await res.text();
  if (!res.ok) {
    const msg = (j && (j.error || j.message)) || res.statusText || "Request failed";
    throw new Error(msg);
  }
  return j;
}

const BRL = new Intl.NumberFormat("pt-BR",{ style:"currency", currency:"BRL" });
const money = v => BRL.format(isFinite(v)?v:0);
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function safePreventAnchor(e){
  const a = e.target.closest("a[href='#']");
  if (a) { e.preventDefault(); e.stopPropagation(); }
}
function formatDate(iso){
  try { const d = new Date(iso); return d.toLocaleString("pt-BR",{ dateStyle:"medium", timeStyle:"short" }); }
  catch { return iso }
}
function normalizeStatusLabel(s){ if(!s) return ""; return s.replace("Últimos ingressos","Último lote"); }
function waHref(text){return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`}

/* ================== estado/UI ================== */
let eventos = [];
let evIndex = {};
let backendOnline = false;
let loginNext = null;

const lista         = $("#lista-eventos");
const inputBusca    = $("#busca-eventos");
const chipsRow      = $("#filtro-cidades");
const sheet         = $("#sheet");
const sheetBody     = $("#sheet-body");
const sheetBackdrop = $("#sheet-backdrop");
const authTag       = $("#auth-indicator");

// Drawer
const drawerToggle   = $("#drawer-toggle");
const drawer         = $("#drawer");
const drawerBackdrop = $("#drawer-backdrop");
const drawerClose    = $("#drawer-close");
const drawerCreate   = $("#drawer-create");

// Organizadores
const orgSection      = $("#organizadores");
const orgValidatorBtn = $("#org-validator");

// diag
const dApi    = $("#d-api");
const dHealth = $("#d-health");
const dEv2    = $("#d-ev2");
const errOverlay = $("#err-overlay");
const errPre     = $("#err-pre");

/* ================== header/hero ================== */
function initHeader(){
  document.addEventListener("click",e=>{
    safePreventAnchor(e);
    const el=e.target.closest(".btn,.drawer-btn,.link-like");
    if(!el) return;
    el.style.transform="translateY(0) scale(.98)";
    setTimeout(()=>{ el.style.transform=""; }, 120);
  });
  const hero=$(".hero"); const header=$("header");
  const HIDE_START=16,HIDE_END=240; let ticking=false;
  function onScroll(){
    if(ticking) return;
    ticking=true;
    requestAnimationFrame(()=>{
      const y=window.scrollY||document.documentElement.scrollTop||0;
      header&&header.classList.toggle("is-scrolled", y>8);
      const p=Math.min(1,Math.max(0,(y-HIDE_START)/(HIDE_END-HIDE_START)));
      if(hero){ hero.style.setProperty("--hero-p", p.toFixed(3)); hero.classList.toggle("is-hidden", p>=1); }
      ticking=false;
    });
  }
  onScroll(); window.addEventListener("scroll", onScroll, { passive:true });
}

/* ================== Drawer ================== */
function openDrawer(){
  drawer?.classList.add("is-open");
  drawer?.setAttribute("aria-hidden","false");
  drawerToggle?.setAttribute("aria-expanded","true");
  drawerBackdrop?.classList.add("is-open");
  drawerBackdrop?.setAttribute("aria-hidden","false");
}
function closeDrawer(){
  drawer?.classList.remove("is-open");
  drawer?.setAttribute("aria-hidden","true");
  drawerToggle?.setAttribute("aria-expanded","false");
  drawerBackdrop?.classList.remove("is-open");
  drawerBackdrop?.setAttribute("aria-hidden","true");
}
drawerToggle?.addEventListener("click", (e)=>{ e.preventDefault(); openDrawer(); });
drawerClose?.addEventListener("click", (e)=>{ e.preventDefault(); closeDrawer(); });
drawerBackdrop?.addEventListener("click", closeDrawer);
document.addEventListener("keydown", (e)=>{ if(e.key==="Escape" && drawer?.classList?.contains("is-open")) closeDrawer(); });

/* ================== vitrine ================== */
function buildChips(){
  if (!chipsRow) return;
  chipsRow.innerHTML="";
  const cities = Array.from(new Set(eventos.map(e=>e.city).filter(Boolean)));
  const all = document.createElement("button");
  all.className="chip"; all.type="button"; all.textContent="Todas"; all.setAttribute("role","tab"); all.setAttribute("aria-selected","true");
  chipsRow.appendChild(all);
  cities.forEach(c=>{
    const b=document.createElement("button");
    b.className="chip"; b.type="button"; b.textContent=c; b.dataset.city=c; b.setAttribute("role","tab"); b.setAttribute("aria-selected","false");
    chipsRow.appendChild(b);
  });
}

function cardMediaHTML(ev){
  const alt = `Imagem do evento ${ev.title}`;
  const src = absUrl(ev.image || "");
  const ph  = `<div class="card-media" data-ph="1" aria-label="Imagem indisponível">Ingresso</div>`;
  if (!src) return ph;
  return `
    <div class="card-media">
      <img src="${src}" alt="${alt}" loading="lazy" decoding="async"
           onerror="this.onerror=null;const p=this.parentElement;p.innerHTML='Ingresso';p.setAttribute('data-ph','1');" />
    </div>
  `;
}

function renderCards(filterCity="", q=""){
  if (!lista) return;
  lista.innerHTML="";
  const qn=(q||"").toLowerCase();
  const data = eventos.filter(ev=>{
    const byCity = filterCity ? ev.city===filterCity : true;
    const byQ = qn ? (ev.title||"").toLowerCase().includes(qn) || (ev.description||"").toLowerCase().includes(qn) : true;
    return byCity && byQ;
  });

  if (!data.length){
    const empty=document.createElement("div");
    empty.className="std-card";
    empty.innerHTML='<strong>Sem eventos publicados ainda.</strong><br><span class="subtle">Volte em breve — estamos preparando novidades ✨</span>';
    lista.appendChild(empty);
    dEv2 && (dEv2.textContent = "0");
    return;
  }

  data.forEach(ev=>{
    const statusLabel = normalizeStatusLabel(ev.statusLabel||ev.status||"");
    const statusKey   = statusLabel==="Esgotado" ? "sold" : (statusLabel==="Último lote" ? "low" : "soon");
    const card=document.createElement("article");
    card.className="card";
    card.setAttribute("tabindex","0");
    card.setAttribute("role","button");
    card.dataset.open = ev.id;
    card.setAttribute("aria-labelledby", `card-title-${ev.id}`);
    card.innerHTML=`
      <div class="card-header">
        <div>
          <div class="card-title" id="card-title-${ev.id}">${ev.title}</div>
          <div class="card-city">${ev.city||""}</div>
          <div class="status-line status--${statusKey}"><span class="status-dot"></span> <span class="status-label">${statusLabel||"Em breve"}</span></div>
        </div>
      </div>
      ${cardMediaHTML(ev)}
    `;
    lista.appendChild(card);
  });

  dEv2 && (dEv2.textContent = String(data.length));
}

function buildStatusChip(statusLabel){
  const key = statusLabel==="Esgotado" ? "sold" : (statusLabel==="Último lote" ? "low" : "soon");
  const lbl = statusLabel || "Em breve";
  return `<span class="status-chip ${key}"><span class="dot" aria-hidden="true"></span>${lbl}</span>`;
}

function sheetMediaHTML(ev){
  const alt = `Imagem do evento ${ev.title}`;
  const src = absUrl(ev.image || "");
  if (!src) return `<div class="sheet-media" data-ph="1" aria-label="Imagem indisponível"></div>`;
  return `
    <div class="sheet-media">
      <img src="${src}" alt="${alt}" loading="lazy" decoding="async"
           onerror="this.onerror=null;this.closest('.sheet-media').setAttribute('data-ph','1');this.remove();" />
    </div>
  `;
}

function openSheet(ev){
  if (!sheet || !sheetBody || !sheetBackdrop) return;
  const walink = waHref(`ingressai:start ev=${ev.id}`);
  sheetBody.innerHTML = `
    <div class="sheet-head">
      <h3 id="sheet-title">${ev.title} — ${ev.city||""}</h3>
      ${buildStatusChip(normalizeStatusLabel(ev.statusLabel||ev.status||""))}
    </div>
    ${sheetMediaHTML(ev)}
    <div class="std-card">
      <p style="margin-top:0"><strong>Local:</strong> ${ev.venue || "-"}<br/>
      <strong>Quando:</strong> ${formatDate(ev.date)}<br/>
      ${Number.isFinite(+ev.price) ? `<strong>Preço:</strong> ${money(ev.price)}` : ""}</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <a class="btn btn--secondary btn--sm" id="buy-whatsapp" href="${walink}" target="_blank" rel="noopener noreferrer">Comprar</a>
      </div>
    </div>
  `;

  sheet.setAttribute("aria-hidden","false");
  sheet.setAttribute("aria-labelledby","sheet-title");
  sheetBackdrop.setAttribute("aria-hidden","false");
  sheet.classList.add("is-open");
  sheetBackdrop.classList.add("is-open");
}

function closeSheet(){
  if (!sheet || !sheetBackdrop) return;
  sheet.classList.remove("is-open");
  sheetBackdrop.classList.remove("is-open");
  sheet.removeAttribute("aria-labelledby");
  sheet.setAttribute("aria-hidden","true");
  sheetBackdrop.setAttribute("aria-hidden","true");
}

/* ================== organizadores / calc ================== */
(function initOrgCalc(){
  const std = $("#std-card");
  if (std) {
    const features=[
      "Criação de evento 100% pelo WhatsApp",
      "Geração automática de ingresso com QR Code",
      "Link público de vendas e acompanhamento em tempo real",
      "Repasse na hora ao organizador",
      "Página de validador liberada no Dashboard",
      "Lista de compradores atualizada"
    ];
    std.innerHTML = "<ul class='std-list'>" + features.map(f=>`<li>${f}</li>`).join("") + "</ul>";
  }

  const FEES = {
    atl:  { pct: 0.08, fix: 1.00, label: "8% + R$ 1,00" },
    prod: { pct: 0.10, fix: 1.20, label: "10% + R$ 1,20" }
  };

  const feeEl     = $("#calc-fee");
  const feeUnitEl = $("#calc-fee-unit");
  const grossEl   = $("#calc-gross");
  const netEl     = $("#calc-net");
  const qtySl     = $("#calc-qty");
  const qtyIn     = $("#calc-qty-n");
  const priceIn   = $("#calc-price");

  function currentCat(){
    return document.querySelector('input[name="org-cat"]:checked')?.value || "atl";
  }
  function sanitizeMoneyInput(el){
    const val = Number(String(el.value).replace(",", "."));
    if (!isFinite(val) || val < 0) return 0;
    return Math.min(val, 1_000_000);
  }
  function sanitizeQty(el){
    const v = parseInt(el.value, 10);
    if (!isFinite(v) || v < 0) return 0;
    return Math.min(v, 10000);
  }

  function recalc(){
    const { pct, fix, label } = FEES[currentCat()] || FEES.atl;
    const qty = sanitizeQty(qtyIn || qtySl);
    const price = sanitizeMoneyInput(priceIn || { value: 0 });

    if (qtySl && String(qtySl.value) !== String(qty)) qtySl.value = String(qty);
    if (qtyIn && String(qtyIn.value) !== String(qty)) qtyIn.value = String(qty);

    const gross    = price * qty;
    const feeUnit  = (price * pct) + fix;
    const fees     = feeUnit * qty;
    const net      = Math.max(0, gross - fees);

    feeEl     && (feeEl.textContent = label);
    feeUnitEl && (feeUnitEl.textContent = money(feeUnit));
    grossEl   && (grossEl.textContent = money(gross));
    netEl     && (netEl.textContent = money(net));
  }

  // interações dos pills acessíveis
  const pillAtl  = $("#pill-atl");
  const pillProd = $("#pill-prod");
  function updatePills(){
    const cat = currentCat();
    const a = cat === "atl";
    pillAtl?.setAttribute("aria-checked", a ? "true" : "false");
    pillAtl?.setAttribute("aria-selected", a ? "true" : "false");
    pillProd?.setAttribute("aria-checked", !a ? "true" : "false");
    pillProd?.setAttribute("aria-selected", !a ? "true" : "false");
  }

  $$('input[name="org-cat"]').forEach(r=>{
    r.addEventListener("change", ()=>{ updatePills(); recalc(); });
  });
  qtySl?.addEventListener("input", ()=>{ qtyIn.value = qtySl.value; recalc(); });
  qtyIn?.addEventListener("input", ()=>{ qtySl.value = qtyIn.value; recalc(); });
  priceIn?.addEventListener("input", recalc);

  // defaults
  if (qtySl && !qtySl.value) qtySl.value = "0";
  if (qtyIn && !qtyIn.value) qtyIn.value = "0";
  if (priceIn && !priceIn.value) priceIn.value = "60";
  updatePills();
  recalc();
})();

/* ================== login modal (OTP) ================== */
const loginModal   = $("#login-modal");
const loginSendBtn = $("#login-send");
const loginCancel  = $("#login-cancel");
const loginPhone   = $("#login-phone");
const codeBlock    = $("#code-block");
const codeBack     = $("#code-back");
const codeVerify   = $("#code-verify");
const codeInput    = $("#login-code");
const loginHint    = $("#login-hint");

function openLogin(next="dashboard"){
  loginNext = next;
  if(!loginModal) return;
  loginHint && (loginHint.textContent="");
  codeBlock && (codeBlock.style.display="none");
  loginModal.classList.add("is-open");
  loginModal.setAttribute("aria-hidden","false");
  loginPhone?.focus();
  document.documentElement.style.overflow = "hidden";
}
function closeLogin(){
  if(!loginModal) return;
  loginModal.classList.remove("is-open");
  loginModal.setAttribute("aria-hidden","true");
  document.documentElement.style.overflow = "";
}

loginCancel?.addEventListener("click", (e)=>{ e.preventDefault(); closeLogin(); });
codeBack?.addEventListener("click", (e)=>{ e.preventDefault(); codeBlock.style.display="none"; loginHint.textContent=""; });

loginSendBtn?.addEventListener("click", async (e)=>{
  e.preventDefault();
  const phone = String(loginPhone.value||"").replace(/[^\d]/g,"");
  if (!/^\d{10,15}$/.test(phone)) { loginHint.textContent="Número inválido. Use DDI+DDD+NÚMERO (ex.: 5534999999999)"; return; }
  try {
    loginHint.textContent="Enviando código…";
    await fetchJson(`${BASE_WITH_API}/auth/request`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ phone }),
      credentials: "include"
    });
    loginHint.textContent="Código enviado no seu WhatsApp. Digite abaixo para verificar.";
    codeBlock.style.display="block";
    codeInput.focus();
    sessionStorage.setItem("ingr_phone", phone);
  } catch (e2) {
    console.error(e2);
    loginHint.textContent="Falha ao enviar código (CORS ou indisponível).";
  }
});

codeVerify?.addEventListener("click", async (e)=>{
  e.preventDefault();
  const phone = sessionStorage.getItem("ingr_phone") || String(loginPhone.value||"").replace(/[^\d]/g,"");
  const code  = String(codeInput.value||"").trim();
  if (!/^\d{3,6}$/.test(code)) { loginHint.textContent="Código inválido."; return; }
  try {
    loginHint.textContent="Verificando…";
    await fetchJson(`${BASE_WITH_API}/auth/verify`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ phone, code }),
      credentials: "include"
    });
    loginHint.textContent="Pronto! Autenticado.";
    // marca sessão autenticada para permitir acesso direto ao validador
    sessionStorage.setItem("ingr_auth", "1");
    if (loginNext === "validator") {
      location.assign(`${BASE_ROOT}/app/validator.html`);
    } else {
      location.assign(`${BASE_ROOT}/app/dashboard.html`);
    }
  } catch (e3) {
    console.error(e3);
    loginHint.textContent="Código inválido, expirado ou bloqueado por CORS.";
  }
});

/* ================== solicitação de criação de evento ================== */
const reqSend  = $("#req-send");
const reqHint  = $("#req-hint");
const reqPhone = $("#req-phone");
const reqTitle = $("#req-title");
const reqCity  = $("#req-city");
const reqVenue = $("#req-venue");
const reqDate  = $("#req-date");

reqSend?.addEventListener("click", async (e)=>{
  e.preventDefault();
  openLogin("dashboard");

  const phone = String(reqPhone?.value||"").replace(/[^\d]/g,"");
  const title = String(reqTitle?.value||"").trim();
  const city  = String(reqCity?.value||"").trim();
  const venue = String(reqVenue?.value||"").trim();
  const date  = String(reqDate?.value||"").trim();
  const category = document.querySelector('input[name="req-cat"]:checked')?.value || "atl";

  if (!/^\d{10,15}$/.test(phone)) {
    reqHint && (reqHint.textContent = "Informe um WhatsApp válido (DDI+DDD+Número).");
    return;
  }
  if (!title || !city) {
    reqHint && (reqHint.textContent = "Preencha ao menos Nome do evento e Cidade.");
    return;
  }

  const payload = { phone, title, city, venue, date: date || null, category };

  try {
    reqHint && (reqHint.textContent = "Enviando solicitação…");
    const res = await tryFetch(
      [
        `${BASE_WITH_API}/org/request`,
        `${BASE_WITH_API}/events/request`
      ],
      {
        method:"POST",
        headers:{ "Content-Type":"application/json", "Accept":"application/json" },
        body: JSON.stringify(payload),
        credentials:"include"
      }
    );
    await res.clone().json().catch(()=>null);
    reqHint && (reqHint.textContent = "Solicitação enviada! Você será avisado no WhatsApp após a aprovação.");
  } catch (err) {
    console.warn("Falha ao registrar solicitação — fallback WhatsApp", err);
    reqHint && (reqHint.textContent = "Não consegui registrar agora. Vou abrir o WhatsApp com sua solicitação.");
    const texto = `Solicitação de criação de evento:%0A• Tel: ${phone}%0A• Evento: ${title}%0A• Cidade: ${city}%0A• Local: ${venue||"-"}%0A• Data: ${date||"-"}%0A• Modelo: ${category}`;
    const href = `https://wa.me/${WHATSAPP_NUMBER}?text=${texto}`;
    window.open(href, "_blank", "noopener,noreferrer");
  }
});

/* ================== ações e Validador ================== */
function openOrganizadores() {
  orgSection?.scrollIntoView({ behavior: "smooth", block: "start" });
}
drawerCreate?.addEventListener("click", () => { closeDrawer(); openOrganizadores(); });

// Validador com fallback de link direto (corrige problema de navegação)
if (orgValidatorBtn){
  // define href absoluto para middle-click/cmd+click
  orgValidatorBtn.setAttribute("href", `${BASE_ROOT}/app/validator.html`);
  orgValidatorBtn.addEventListener("click", (e)=>{
    // se já autenticado nesta sessão, vai direto
    const authed = sessionStorage.getItem("ingr_auth") === "1";
    if (authed) {
      // deixa o link navegar normalmente
      return;
    }
    // senão, intercepta e abre login
    e.preventDefault();
    openLogin("validator");
  });
}

/* ================== navegação / sheet bindings ================== */
document.addEventListener("click", (e)=>{
  safePreventAnchor(e);
  if (e.target.closest("[data-close='sheet']")) { e.preventDefault(); closeSheet(); }
  const openCard = e.target.closest(".card[data-open]");
  if (openCard){
    const ev = evIndex[openCard.dataset.open]; if (ev) openSheet(ev);
  }
});
document.addEventListener("keydown", (e)=>{
  if (e.key==="Escape" && sheet?.classList?.contains("is-open")) { closeSheet(); }
  const focused = document.activeElement;
  if ((e.key === "Enter" || e.key === " ") && focused?.classList?.contains("card") && focused?.dataset?.open){
    e.preventDefault();
    const ev = evIndex[focused.dataset.open];
    if (ev) openSheet(ev);
  }
});
sheetBackdrop?.addEventListener("click", closeSheet);

/* ================== init ================== */
async function initLanding(){
  initHeader();

  const dApiEl = $("#d-api");
  dApiEl && (dApiEl.textContent = BASE_WITH_API);

  // Health
  try{
    const h = await fetchJson(`${BASE_WITH_API}/health`, {});
    backendOnline = !!h?.ok || h === "ok" || h === true;
  }catch{ backendOnline = false; }
  if (authTag){
    authTag.textContent = backendOnline ? "online" : "offline";
    authTag.classList.toggle("off", !backendOnline);
    authTag.classList.toggle("on", !!backendOnline);
  }
  const dHealthEl = $("#d-health");
  dHealthEl && (dHealthEl.textContent = backendOnline ? "ok" : "off");

  // Eventos
  try{
    const r = await tryFetch([ `${BASE_WITH_API}/events`, `${BASE_ROOT}/events` ], { headers:{ Accept:"application/json" } });
    const j = await r.json().catch(()=> ({}));
    const arr = Array.isArray(j?.items) ? j.items : (Array.isArray(j) ? j : []);
    eventos = arr.length ? arr : [{
      id:"TST-INGRESSAI",
      title:"Evento Teste IngressAI",
      city:"Uberaba-MG",
      venue:"Espaço Demo",
      date:new Date(Date.now()+2*86400e3).toISOString(),
      price: 60,
      statusLabel:"Último lote",
      image:""
    }];
    eventos = eventos.map(e => ({ ...e, image: absUrl(e.image || "") }));
    evIndex = Object.fromEntries(eventos.map(e=>[String(e.id), e]));
  }catch(e){
    console.warn("falha /events", e);
    eventos = [{
      id:"TST-INGRESSAI",
      title:"Evento Teste IngressAI",
      city:"Uberaba-MG",
      venue:"Espaço Demo",
      date:new Date(Date.now()+2*86400e3).toISOString(),
      price: 60,
      statusLabel:"Último lote",
      image:""
    }];
    evIndex = Object.fromEntries(eventos.map(e=>[String(e.id), e]));
  }

  buildChips();
  renderCards();

  chipsRow?.addEventListener("click", e=>{
    const b=e.target.closest("button.chip"); if(!b) return;
    chipsRow.querySelectorAll(".chip").forEach(x=>x.setAttribute("aria-selected","false"));
    b.setAttribute("aria-selected","true");
    renderCards(b.dataset.city||"", inputBusca?.value||"");
  });

  let debounce;
  inputBusca?.addEventListener("input", ()=>{
    clearTimeout(debounce);
    debounce=setTimeout(()=>{
      const active = chipsRow?.querySelector('.chip[aria-selected="true"]');
      renderCards(active?.dataset.city||"", inputBusca.value);
    }, 180);
  });

  console.log("[IngressAI] ready", { BASE_WITH_API, BASE_ROOT });
}

document.addEventListener("DOMContentLoaded", initLanding);

/* ================== erro global (debug) ================== */
window.addEventListener("error", (ev)=>{
  if (!errOverlay || !errPre) return;
  errPre.textContent = String(ev?.error?.stack || ev?.message || ev).slice(0, 4000);
  errOverlay.style.display = "flex";
});
window.addEventListener("unhandledrejection", (ev)=>{
  if (!errOverlay || !errPre) return;
  errPre.textContent = String(ev?.reason?.stack || ev?.reason || ev).slice(0, 4000);
  errOverlay.style.display = "flex";
});
