/* app.js — IngressAI (vitrine, filtros, sheet, calculadora, criar evento)
   Mantém: override ?api=, busca /api/events, deep-link ingressai:start ev=<id>,
   bottom sheet mídia primeiro, calculadora 3% org + 4/5% comprador.
*/
(() => {
  "use strict";

  /* ==================== Utils/Config ==================== */
  const qs = new URLSearchParams(location.search);
  const QS_API = (qs.get("api") || "").trim();
  const META_API = document.querySelector('meta[name="ingressai-api"]')?.content?.trim() || "";

  function normalizeApi(raw) {
    let s = String(raw || "").trim();
    s = s.replace(/\/+$/g, "");
    if (!/\/api$/i.test(s)) s += "/api";
    s = s.replace(/([^:])\/{2,}/g, "$1/");
    return s;
  }
  const API = normalizeApi(QS_API || META_API || location.origin);

  const el = sel => document.querySelector(sel);
  const fmtBRL = v => (new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"})).format(Number(v||0));
  const toNum = s => {
    if (s == null) return NaN;
    const t = String(s).replace(/\./g,"").replace(",",".");
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  };
  const on = (node, ev, fn) => node && node.addEventListener(ev, fn, {passive:true});

  /* ==================== DOM refs ==================== */
  const year = el("#year");
  if (year) year.textContent = String(new Date().getFullYear());

  const grid = el("#grid");
  const chipsWrap = el("#chips");
  const search = el("#search");

  const sheet = el("#sheet");
  const sheetBackdrop = el("#sheet-backdrop");
  const sheetClose = el("#sheet-close");
  const sheetImg = el("#sheet-img");
  const sheetTitle = el("#sheet-title");
  const sheetMeta = el("#sheet-meta");
  const buyBtn = el("#buy-btn");
  const shareBtn = el("#share-btn");

  // Calc
  const calcPrice = el("#calc-price");
  const calcQty   = el("#calc-qty");
  const calcModel = el("#calc-model");
  const kpiBruto  = el("#kpi-bruto");
  const kpiTaxas  = el("#kpi-taxas");
  const kpiLiq    = el("#kpi-liq");
  const kpiTBruto = el("#kpi-tbruto");
  const kpiTTaxas = el("#kpi-ttaxas");
  const kpiTLiq   = el("#kpi-tliq");

  // Create
  const evTitle = el("#ev-title");
  const evCity  = el("#ev-city");
  const evDate  = el("#ev-date");
  const evPrice = el("#ev-price");
  const evVenue = el("#ev-venue");
  const createBtn = el("#create-btn");
  const createWA  = el("#create-wa");

  /* ==================== State ==================== */
  const state = {
    events: [],
    cities: [],
    selectedCity: "",
    filtered: [],
    current: null, // evento aberto no sheet
  };

  /* ==================== Fetch / API ==================== */
  async function apiGet(path) {
    const url = `${API}${path.startsWith("/")?"":"/"}${path}`;
    const r = await fetch(url, {credentials:"omit"});
    if (!r.ok) throw new Error(`GET ${path} -> ${r.status}`);
    return r.json();
  }

  async function apiPost(path, body) {
    const url = `${API}${path.startsWith("/")?"":"/"}${path}`;
    const r = await fetch(url, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify(body||{})
    });
    const j = await r.json().catch(()=>null);
    if (!r.ok || !j) throw new Error(`POST ${path} -> ${r.status}`);
    return j;
  }

  /* ==================== Render helpers ==================== */
  function cityChip(city) {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.textContent = city;
    btn.onclick = () => {
      state.selectedCity = (state.selectedCity === city) ? "" : city;
      syncChips();
      applyFilter();
    };
    return btn;
  }

  function syncChips() {
    if (!chipsWrap) return;
    chipsWrap.innerHTML = "";
    const cities = state.cities.slice().sort((a,b)=>a.localeCompare(b,'pt-BR'));
    cities.forEach(c => {
      const chip = cityChip(c);
      if (state.selectedCity === c) chip.classList.add("active");
      chipsWrap.appendChild(chip);
    });
  }

  function card(ev) {
    const d = document.createElement("div");
    d.className = "card";
    d.innerHTML = `
      <div class="thumb">
        <img src="${ev.image || ''}" alt="${escapeHtml(ev.title)}" onerror="this.src='data:image/svg+xml;utf8,${encodeURIComponent(placeholder(ev.title))}'">
      </div>
      <div class="card-body">
        <div class="card-title">${escapeHtml(ev.title)}</div>
        <div class="card-meta">
          <span>${escapeHtml(ev.city||"-")}</span>
          <span>•</span>
          <span>${fmtDateBR(ev.date)}</span>
          ${priceBadge(ev.price)}
        </div>
        <div class="card-cta">
          <button class="btn primary">Ver detalhes</button>
          <button class="btn">WhatsApp</button>
        </div>
      </div>
    `;
    const [btnOpen, btnWa] = d.querySelectorAll(".btn");
    btnOpen.onclick = () => openSheet(ev);
    btnWa.onclick = () => openWhatsApp(ev);
    return d;
  }

  function priceBadge(v){
    const n = Number(v||0);
    if (!Number.isFinite(n) || n<=0) return `<span style="margin-left:10px;color:#9aa0a6">• <b>Entrada gratuita</b></span>`;
    return `<span style="margin-left:10px;color:#cfd8ff">• R$ ${n.toFixed(2)}</span>`;
  }

  function fmtDateBR(ts){
    try{
      const d = new Date(Number(ts||0));
      return d.toLocaleString("pt-BR", {dateStyle:"medium", timeStyle:"short"});
    }catch{ return "-" }
  }

  function escapeHtml(s=""){
    return String(s).replace(/[&<>"]/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[m]));
  }

  function placeholder(title="Evento"){
    const t = encodeURIComponent(title.slice(0,28));
    return `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='742'>
      <defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'>
        <stop offset='0%' stop-color='%23131c27'/><stop offset='100%' stop-color='%230c1116'/></linearGradient></defs>
      <rect fill='url(%23g)' width='1200' height='742'/>
      <text x='50%' y='52%' fill='%238aa8d6' font-family='Inter,Arial' font-size='46' text-anchor='middle'>${t}</text>
    </svg>`;
  }

  function render() {
    if (!grid) return;
    grid.innerHTML = "";
    (state.filtered.length?state.filtered:state.events).forEach(ev => grid.appendChild(card(ev)));
  }

  function applyFilter() {
    const q = (search?.value || "").trim().toLowerCase();
    state.filtered = state.events.filter(ev => {
      const cityOk = !state.selectedCity || ev.city?.toLowerCase() === state.selectedCity.toLowerCase();
      const qOk = !q || `${ev.title} ${ev.city} ${fmtDateBR(ev.date)}`.toLowerCase().includes(q);
      return cityOk && qOk && (ev.status === "published" || !ev.status);
    });
    render();
  }

  /* ==================== Sheet ==================== */
  function openSheet(ev) {
    state.current = ev;
    sheetImg.src = ev.image || `data:image/svg+xml;utf8,${encodeURIComponent(placeholder(ev.title))}`;
    sheetTitle.textContent = ev.title;
    sheetMeta.textContent = `${ev.city || "-"} • ${fmtDateBR(ev.date)} • ${Number(ev.price||0)>0?("R$ "+Number(ev.price||0).toFixed(2)):"Entrada gratuita"}`;
    sheet.classList.add("open");
    sheetBackdrop.classList.add("open");
    sheet.setAttribute("aria-hidden","false");
  }
  function closeSheet(){
    sheet.classList.remove("open");
    sheetBackdrop.classList.remove("open");
    sheet.setAttribute("aria-hidden","true");
    state.current = null;
  }
  on(sheetBackdrop,"click",closeSheet);
  on(sheetClose,"click",closeSheet);
  on(document,"keydown",(e)=>{ if(e.key==="Escape") closeSheet(); });

  async function openWhatsApp(ev) {
    const name = encodeURIComponent("Participante");
    const dl = `ingressai:start ev=${encodeURIComponent(ev.id)} qty=1 autopay=1 name=${name}`;
    const phone = "5534999992747"; // público / baseline
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(dl)}`;
    window.open(url,"_blank","noopener");
  }

  on(buyBtn,"click",()=>{ if(state.current) openWhatsApp(state.current); });
  on(shareBtn,"click",async ()=>{
    if(!state.current) return;
    try{
      const shareData = {
        title: state.current.title,
        text: `Bora? ${state.current.title} — ingressos no WhatsApp (IngressAI)`,
        url: location.href.split("?")[0]
      };
      if (navigator.share) await navigator.share(shareData);
      else await navigator.clipboard.writeText(`${shareData.title} — ${shareData.text} ${shareData.url}`);
      alert("Link copiado/compartilhado ✅");
    }catch{}
  });

  /* ==================== Calculadora (3% org, 4/5% comprador) ==================== */
  function calcUpdate(){
    const price = toNum(calcPrice.value);
    const qty = Math.max(0, Math.floor(toNum(calcQty.value)));
    const buyerFeePct = Number(calcModel.value); // 4 ou 5
    const orgFeePct = 3;

    if (!Number.isFinite(price) || price<=0 || qty<=0){
      setKpis(0,0,0,0,0,0); return;
    }

    const feeOrg = price * (orgFeePct/100);
    const feeBuyer = price * (buyerFeePct/100);
    const bruto = price;
    const liq = price - feeOrg; // o organizador recebe preço - 3%
    const taxas = feeOrg + feeBuyer;

    const tBruto = bruto * qty;
    const tTaxas = taxas * qty;
    const tLiq = liq * qty;

    setKpis(bruto,taxas,liq,tBruto,tTaxas,tLiq);
  }
  function setKpis(b, t, l, tb, tt, tl){
    kpiBruto.textContent = fmtBRL(b);
    kpiTaxas.textContent = fmtBRL(t);
    kpiLiq.textContent = fmtBRL(l);
    kpiTBruto.textContent = fmtBRL(tb);
    kpiTTaxas.textContent = fmtBRL(tt);
    kpiTLiq.textContent = fmtBRL(tl);
  }
  ["input","change"].forEach(evt=>{
    on(calcPrice,evt,calcUpdate);
    on(calcQty,evt,calcUpdate);
    on(calcModel,evt,calcUpdate);
  });

  /* ==================== Criar Evento (UX guiada, não quebra rotas) ==================== */
  on(createBtn,"click", async ()=>{
    const title = (evTitle.value||"").trim();
    const city  = (evCity.value||"").trim();
    const dateRaw = evDate.value; // datetime-local
    const price = toNum(evPrice.value);
    const venue = (evVenue.value||"").trim();

    if (!title || !city || !dateRaw || !Number.isFinite(price) || price<0 || !venue){
      alert("Preencha Título, Cidade, Data/Hora, Preço e Local."); return;
    }

    // Converte datetime-local para ISO com timezone local
    const d = new Date(dateRaw);
    const iso = new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString();

    try{
      const r = await apiPost("/events", { title, city, date: iso, price, venue, status: "draft" });
      if (!r?.ok || !r?.event?.id) throw new Error("Falha ao criar evento");
      alert("Rascunho criado ✅ — envie a capa pelo WhatsApp para aparecer bonito na vitrine.");
      // Atualiza feed
      await loadEvents();
      // Foca o recém criado (se voltar na lista)
      const created = r.event;
      setTimeout(()=>{
        const it = state.events.find(e=>e.id===created.id);
        if (it) openSheet(it);
      },200);
    }catch(e){
      alert("Não consegui criar agora. Tente novamente em instantes.");
    }
  });

  on(createWA,"click", ()=>{
    const phone = "5534999992747";
    const url = `https://wa.me/${phone}?text=${encodeURIComponent("menu")}`;
    window.open(url,"_blank","noopener");
  });

  /* ==================== Load / bootstrap ==================== */
  async function loadEvents(){
    try{
      const j = await apiGet("/events");
      const list = Array.isArray(j?.items)? j.items : (Array.isArray(j)?j:[]);
      state.events = list.filter(Boolean);
      // Cidades
      const cities = Array.from(new Set(state.events.map(e=>(e.city||"").trim()).filter(Boolean)));
      state.cities = cities;
      syncChips();
      applyFilter();
      calcUpdate();
    }catch{
      grid.innerHTML = `<div style="opacity:.8">Não consegui carregar os eventos agora.</div>`;
    }
  }

  on(search,"input",applyFilter);

  // Inicializa
  loadEvents();

})();
