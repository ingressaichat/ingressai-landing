/* app.js — IngressAI (landing)
   - Vitrine com /api/events
   - Sheet com mídia primeiro e deep-link WhatsApp (ingressai:start ev=<id>)
   - Calculadora: 3% org + 4%/5% comprador, KPIs por ingresso e totais
   - Fluxo “Criar evento” com stepper (POST /api/events se possível, fallback WhatsApp)
*/
(() => {
  "use strict";

  /* ================= Base / Descoberta de API ================= */
  const qs = new URLSearchParams(location.search);
  const QS_API = (qs.get("api") || "").trim();
  const META_API = document.querySelector('meta[name="ingressai-api"]')?.content?.trim() || "";
  const PUBLIC_WABA = "5534999992747"; // número público
  const DEFAULT_LOGO = "https://ingressai.chat/logo_ingressai.png";
  const PLACEHOLDER = "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 744'>
      <defs>
        <linearGradient id='g' x1='0' x2='0' y1='0' y2='1'>
          <stop offset='0%' stop-color='#0e141a'/><stop offset='100%' stop-color='#0b0e12'/>
        </linearGradient>
      </defs>
      <rect fill='url(#g)' width='1200' height='744'/>
      <g fill='#2F7DD9' opacity='.55'>
        <circle cx='150' cy='120' r='3'/><circle cx='300' cy='240' r='3'/><circle cx='900' cy='180' r='3'/>
        <circle cx='1050' cy='360' r='3'/><circle cx='700' cy='520' r='3'/>
      </g>
    </svg>`
  );

  function normalizeApi(raw){
    let s = String(raw || "").trim().replace(/\/+$/g, "");
    if (!/\/api$/i.test(s)) s += "/api";
    s = s.replace(/([^:])\/{2,}/g, "$1/");
    return s;
  }
  const INGRESSAI_API = normalizeApi(QS_API || META_API || location.origin);

  /* ================= Helpers ================= */
  const $ = (sel, p=document) => p.querySelector(sel);
  const $$ = (sel, p=document) => Array.from(p.querySelectorAll(sel));
  const fmtBRL = (n) => (isFinite(n) ? n : 0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  const money = (s) => Number(String(s||"").replace(/[^\d,.-]/g,"").replace(".","").replace(",",".")) || 0;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const on = (el,ev,fn) => el && el.addEventListener(ev,fn);

  function waHref(text){
    const url = new URL(`https://wa.me/${PUBLIC_WABA}`);
    url.searchParams.set("text", text);
    return url.toString();
  }
  function waBuyDeep(evId, nameOpt){
    // suporta “ingressai:start ev=<id> [name=...]”
    const parts = [`ingressai:start`, `ev=${encodeURIComponent(evId)}`];
    if (nameOpt) parts.push(`name=${encodeURIComponent(nameOpt)}`);
    return waHref(parts.join(" "));
  }

  /* ================= Status / Healthcheck ================= */
  async function health(){
    const el = $("#status");
    try{
      const r = await fetch(`${INGRESSAI_API}/health`, { cache: "no-store" });
      const j = await r.json();
      el.textContent = j?.ok ? "online • " + (j?.brand || "IngressAI") : "offline";
      const logo = j?.logo || DEFAULT_LOGO;
      $("#logo").src = logo;
    }catch{
      el.textContent = "offline";
      $("#logo").src = DEFAULT_LOGO;
    }
  }

  /* ================= Vitrine ================= */
  let events = [];
  async function loadEvents(){
    const grid = $("#grid");
    grid.innerHTML = "";
    const sk = (i)=>`
      <div class="card" data-skel="1">
        <div class="media"><img src="${PLACEHOLDER}" alt=""></div>
        <div class="body">
          <div class="title" style="opacity:.3">•••••• ••••••</div>
          <div class="meta" style="opacity:.25">—</div>
        </div>
      </div>`;
    grid.innerHTML = sk()+sk()+sk()+sk()+sk()+sk();
    try{
      const r = await fetch(`${INGRESSAI_API}/events`);
      const j = await r.json();
      events = Array.isArray(j?.items) ? j.items : (Array.isArray(j)? j : []);
    }catch{ events = []; }
    renderEvents();
  }

  function matchCityTag(ev, tag){
    if (!tag) return true;
    if (tag === "Outra") return !["Uberaba","Uberlândia","Belo Horizonte"].includes(ev.city||"");
    return (ev.city||"").toLowerCase() === tag.toLowerCase();
  }
  function renderEvents(){
    const grid = $("#grid");
    const q = $("#q").value.trim().toLowerCase();
    const tag = $(".chip.active")?.getAttribute("data-city") || "";
    const list = events.filter(ev => {
      const txt = `${ev.title||""} ${ev.city||""} ${ev.venue||""}`.toLowerCase();
      return matchCityTag(ev, tag) && (!q || txt.includes(q));
    });

    grid.innerHTML = "";
    if (!list.length){
      grid.innerHTML = `<div class="panelCard" style="grid-column:1/-1">
        Nenhum evento encontrado. Tente limpar filtros.
      </div>`;
      return;
    }
    for (const ev of list){
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="media"><img alt=""></div>
        <div class="body">
          <div class="title">${ev.title||"—"}</div>
          <div class="meta">${(ev.city||"—")} • ${fmtDateTime(ev.date)}</div>
        </div>
      `;
      const img = $("img", card);
      const src = (ev.imageUrl || ev.image || ev.cover || "").trim();
      img.src = src || PLACEHOLDER;
      img.onerror = () => (img.src = PLACEHOLDER);
      on(card, "click", () => openSheet(ev));
      grid.appendChild(card);
    }
  }

  function fmtDateTime(v){
    try{
      const d = new Date(v);
      if (!isFinite(+d)) return "data a confirmar";
      return d.toLocaleString("pt-BR",{weekday:"short", day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit"});
    }catch{ return "data a confirmar"; }
  }

  /* ================= Sheet ================= */
  const sheet = $("#sheet");
  const sheetImg = $("#sheetImg");
  const sheetTitle = $("#sheetTitle");
  const sheetMeta = $("#sheetMeta");
  const sheetClose = $("#sheetClose");
  const buyBtn = $("#buyBtn");
  const shareBtn = $("#shareBtn");
  let sheetEv = null;

  function openSheet(ev){
    sheetEv = ev;
    sheetImg.src = (ev.imageUrl || ev.image || "").trim() || PLACEHOLDER;
    sheetImg.onerror = () => (sheetImg.src = PLACEHOLDER);
    sheetTitle.textContent = ev.title || "—";
    sheetMeta.textContent = `${ev.city || "—"} • ${fmtDateTime(ev.date)} • ${fmtBRL(Number(ev.price||0))}`;
    sheet.classList.add("open");
  }
  on(sheetClose, "click", () => sheet.classList.remove("open"));
  on(sheet, "click", (e) => { if (e.target === sheet) sheet.classList.remove("open"); });

  on(buyBtn, "click", () => {
    if (!sheetEv) return;
    const url = waBuyDeep(sheetEv.id || sheetEv.slug || sheetEv.eventId || "", "");
    window.open(url, "_blank", "noopener");
  });
  on(shareBtn, "click", async () => {
    if (!sheetEv) return;
    const text =
      `IngressAI • ${sheetEv.title}\n${sheetEv.city||""} • ${fmtDateTime(sheetEv.date)}\n`+
      `Comprar no WhatsApp: ${waBuyDeep(sheetEv.id||"", "")}`;
    if (navigator.share) {
      try { await navigator.share({ text }); } catch {}
    } else {
      await navigator.clipboard.writeText(text).catch(()=>{});
      alert("Link copiado!");
    }
  });

  /* ================= Calculadora (3% org + 4/5% comprador) ================= */
  const $cat = $("#cat");
  const $price = $("#price");
  const $qty = $("#qty");
  const kFeeBuyer = $("#k_fee_buyer");
  const kFeeOrg = $("#k_fee_org");
  const kNet = $("#k_net");
  const kGross = $("#k_gross");

  function calc(){
    const isProd = $cat.value === "prod"; // 5%
    const buyerRate = isProd ? 0.05 : 0.04;
    const orgRate = 0.03;

    const p = money($price.value);
    const q = Math.max(1, Math.floor(Number($qty.value||1)));
    $qty.value = String(q);

    const buyerFeeUnit = p * buyerRate;
    const orgFeeUnit = p * orgRate;
    const netUnit = p - orgFeeUnit;            // líquido para org por ingresso
    const grossUnit = p + buyerFeeUnit;        // total cobrado do comprador (p + taxa dele)

    const buyerFeeTot = buyerFeeUnit * q;
    const orgFeeTot = orgFeeUnit * q;
    const netTot = netUnit * q;
    const grossTot = grossUnit * q;

    kFeeBuyer.textContent = `${fmtBRL(buyerFeeUnit)} por ingresso • ${fmtBRL(buyerFeeTot)} total`;
    kFeeOrg.textContent = `${fmtBRL(orgFeeUnit)} por ingresso • ${fmtBRL(orgFeeTot)} total`;
    kNet.textContent = `${fmtBRL(netUnit)} por ingresso • ${fmtBRL(netTot)} total`;
    kGross.textContent = `${fmtBRL(grossUnit)} por ingresso • ${fmtBRL(grossTot)} total`;
  }
  ["input","change","blur"].forEach(ev=>{
    on($price, ev, calc); on($qty, ev, calc); on($cat, ev, calc);
  });

  on($("#copyPlan"), "click", async () => {
    const isProd = $cat.value === "prod";
    const buyerRate = isProd ? "5%" : "4%";
    const p = money($price.value);
    const q = Math.max(1, Math.floor(Number($qty.value||1)));
    const txt =
`Plano IngressAI
• Preço de capa: ${fmtBRL(p)}
• Taxa do comprador: ${buyerRate}
• Taxa do organizador: 3% (fixo)
• Quantidade: ${q}

KPIs:
• Taxa do comprador (unitária/total): ${$("#k_fee_buyer").textContent}
• Taxa do organizador (unitária/total): ${$("#k_fee_org").textContent}
• Líquido ao organizador (unitário/total): ${$("#k_net").textContent}
• Total cobrado ao comprador (unitário/total): ${$("#k_gross").textContent}
`;
    try{ await navigator.clipboard.writeText(txt); alert("Resumo copiado!"); }catch{ alert("Não consegui copiar. :/"); }
  });

  /* ================= Criar Evento (UX guiada, fallback WhatsApp) ================= */
  const stepDots = $("#stepDots").children;
  const stepWrap = $("#stepWrap");
  const steps = [
    renderStep1, renderStep2, renderStep3, renderStep4, renderStep5
  ];
  let st = { step:0, title:"", city:"", dateISO:"", price:0, venue:"" };

  function markStep(n){
    Array.from(stepDots).forEach((d,i)=>d.classList.toggle("on", i<=n));
  }
  function renderStep1(){
    stepWrap.innerHTML = `
      <label>Título do evento</label>
      <input id="ev_title" maxlength="80" placeholder="Ex.: Tech Thursday" value="${st.title}"/>
      <div class="hr"></div>
      <div class="inline">
        <button class="btn" id="next1">Continuar</button>
        <span class="hint">Se preferir, você pode fazer tudo pelo WhatsApp depois.</span>
      </div>`;
    on($("#next1"), "click", ()=>{
      const v = $("#ev_title").value.trim();
      if (!v) { alert("Manda um título estiloso 🙂"); return; }
      st.title = v; st.step=1; markStep(st.step); renderStep2();
    });
  }
  function renderStep2(){
    stepWrap.innerHTML = `
      <label>Cidade</label>
      <div class="row">
        <select id="ev_city">
          <option value="">Selecione…</option>
          <option>Uberaba</option><option>Uberlândia</option><option>Belo Horizonte</option>
          <option>Outra</option>
        </select>
        <input id="ev_city_custom" placeholder="Se ‘Outra’, escreva aqui" />
      </div>
      <div class="hr"></div>
      <div class="inline">
        <button class="btn secondary" id="back">Voltar</button>
        <button class="btn" id="next2">Continuar</button>
      </div>`;
    $("#ev_city").value = st.city && ["Uberaba","Uberlândia","Belo Horizonte"].includes(st.city)? st.city : "";
    $("#ev_city_custom").value = st.city && !["Uberaba","Uberlândia","Belo Horizonte"].includes(st.city)? st.city : "";
    on($("#back"),"click",()=>{ st.step=0; markStep(st.step); renderStep1(); });
    on($("#next2"),"click",()=>{
      const sel = $("#ev_city").value.trim();
      const custom = $("#ev_city_custom").value.trim();
      const city = sel || custom;
      if (!city){ alert("Qual a cidade?"); return; }
      st.city = city; st.step=2; markStep(st.step); renderStep3();
    });
  }
  function renderStep3(){
    stepWrap.innerHTML = `
      <label>Data e hora</label>
      <div class="row">
        <input id="ev_date" type="date"/>
        <input id="ev_time" type="time"/>
      </div>
      <div class="hr"></div>
      <div class="inline">
        <button class="btn secondary" id="back">Voltar</button>
        <button class="btn" id="next3">Continuar</button>
      </div>`;
    on($("#back"),"click",()=>{ st.step=1; markStep(st.step); renderStep2(); });
    on($("#next3"),"click",()=>{
      const d = $("#ev_date").value; const t = $("#ev_time").value || "21:00";
      if(!d){ alert("Manda uma data 😉"); return; }
      const iso = new Date(`${d}T${t}:00-03:00`).toISOString();
      st.dateISO = iso; st.step=3; markStep(st.step); renderStep4();
    });
  }
  function renderStep4(){
    stepWrap.innerHTML = `
      <label>Preço (R$)</label>
      <input id="ev_price" inputmode="decimal" placeholder="60,00" value="${st.price? String(st.price).replace('.',',') : ''}"/>
      <div class="hr"></div>
      <div class="inline">
        <button class="btn secondary" id="back">Voltar</button>
        <button class="btn" id="next4">Continuar</button>
      </div>`;
    on($("#back"),"click",()=>{ st.step=2; markStep(st.step); renderStep3(); });
    on($("#next4"),"click",()=>{
      const p = money($("#ev_price").value);
      if (p<0){ alert("Preço inválido"); return; }
      st.price = p; st.step=4; markStep(st.step); renderStep5();
    });
  }
  function renderStep5(){
    stepWrap.innerHTML = `
      <label>Local / Estabelecimento</label>
      <input id="ev_venue" maxlength="120" placeholder="Ex.: Boiler Club, Centro" value="${st.venue}"/>
      <div class="hr"></div>
      <div class="inline">
        <button class="btn secondary" id="back">Voltar</button>
        <button class="btn" id="finish">Finalizar</button>
        <button class="btn secondary" id="whatsapp">Fazer pelo WhatsApp</button>
      </div>
      <div class="hint">Tentamos criar o <b>rascunho</b> via API. Se não estiver autorizado, abrimos o WhatsApp com instruções.</div>
    `;
    on($("#back"),"click",()=>{ st.step=3; markStep(st.step); renderStep4(); });
    on($("#whatsapp"),"click",()=>fallbackWhatsApp());
    on($("#finish"),"click",()=>finishCreate());
  }

  async function finishCreate(){
    st.venue = $("#ev_venue").value.trim();
    if(!st.venue){ alert("Qual o local do evento?"); return; }
    // Tenta criar via API (opcional). Mantém 100% compat: se 401/403/falhar, cai no WhatsApp.
    try{
      const r = await fetch(`${INGRESSAI_API}/events`,{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          title: st.title, city: st.city, date: st.dateISO, price: st.price, venue: st.venue, status:"draft"
        })
      });
      if(!r.ok) throw new Error("api_denied");
      const j = await r.json().catch(()=>null);
      if (!j || !(j.id || j.eventId)) throw new Error("bad_payload");
      alert("Rascunho criado! Publique pelo WhatsApp ou painel.");
    }catch{
      await fallbackWhatsApp();
    }
  }

  async function fallbackWhatsApp(){
    // Mensagem pronta para “Sou organizador” no bot
    const summary =
`Quero criar um evento (rascunho):
• Título: ${st.title}
• Cidade: ${st.city}
• Data: ${new Date(st.dateISO).toLocaleString("pt-BR")}
• Preço: ${fmtBRL(st.price)}
• Local: ${st.venue}`;
    const url = waHref(`menu\n\n${summary}`);
    window.open(url,"_blank","noopener");
  }

  /* ================= Filtros / Busca / Reload ================= */
  $$(".chip").forEach(ch=>{
    on(ch, "click", ()=>{
      $$(".chip").forEach(x=>x.classList.remove("active"));
      ch.classList.add("active");
      renderEvents();
    });
  });
  on($("#q"), "input", renderEvents);
  on($("#reload"), "click", loadEvents);

  /* ================= Boot ================= */
  on(window, "DOMContentLoaded", async ()=>{
    $("#year").textContent = new Date().getFullYear();
    calc();
    renderStep1(); markStep(0);
    await health();
    await loadEvents();
    // Refresh leve de saúde a cada 60s
    setInterval(health, 60000);
  });
})();
