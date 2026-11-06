(function () {
  "use strict";
  // ---------- utilidades ----------
  const $ = (id) => document.getElementById(id);
  const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const DOW = ["dom","seg","ter","qua","qui","sex","sáb"];
  const PLAN = { 1: "mt", 3: "mt", 5: "mt", 2: "mu", 4: "mu", 6: "mu" };
  const NOME = { mt: "Muay thai", mu: "Musculação", ou: "Outro" };
  const COR = { mt: "var(--gold)", mu: "var(--blue)", ou: "var(--gray)" };
  const EXS = [
    { n: "Barra pronada", u: "reps" }, { n: "Barra supinada", u: "reps" }, { n: "Negativa na barra", u: "reps" },
    { n: "Barra escapular", u: "reps" }, { n: "Remada nas argolas", u: "reps" }, { n: "Rosca direta", u: "reps" },
    { n: "Face pull", u: "reps" }, { n: "Dead hang", u: "seg" }, { n: "Flexão", u: "reps" },
    { n: "Mergulho nas argolas", u: "reps" }, { n: "Agachamento", u: "reps" }, { n: "Prancha", u: "seg" }
  ];
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const parse = (s) => { const [a, b, c] = s.split("-").map(Number); return new Date(a, b - 1, c); };
  const hoje = () => iso(new Date());
  const fmtKg = (n) => Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmtD = (s) => { const d = parse(s); return pad(d.getDate()) + "/" + pad(d.getMonth() + 1); };
  const fmtDLong = (s) => { const d = parse(s); return DOW[d.getDay()] + ", " + d.getDate() + " de " + MESES[d.getMonth()]; };
  const num = (v) => { if (v === "" || v == null) return null; const n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : null; };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let toastT;
  function toast(t) { const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), 2600); }

  // ---------- estado ----------
  let sb = null, user = null;
  let pesos = [], treinos = [], metaKg = 80;
  let calView = new Date(); calView.setDate(1);
  let calSel = hoje();
  let draft = null;
  let authMode = "in";
  let exSel = null;

  // ---------- início ----------
  const cfg = window.CANTO_CONFIG || {};
  $("boot").hidden = true;
  if (!cfg.supabaseUrl || cfg.supabaseUrl.indexOf("COLE_AQUI") === 0 || !window.supabase) {
    $("vSetup").hidden = false;
    if (!window.supabase && cfg.supabaseUrl && cfg.supabaseUrl.indexOf("COLE_AQUI") !== 0) {
      $("vSetup").querySelector("p").textContent = "Não consegui carregar a conexão com o banco. Confira sua internet e abra o app de novo.";
    }
    return;
  }
  sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

  sb.auth.getSession().then(({ data }) => onSession(data.session));
  sb.auth.onAuthStateChange((_e, session) => onSession(session));

  function onSession(session) {
    const u = session ? session.user : null;
    if (u && user && u.id === user.id) return;
    user = u;
    $("vAuth").hidden = !!user;
    $("vApp").hidden = !user;
    if (user) { $("ajEmail").textContent = user.email; loadAll(); }
  }

  // ---------- login ----------
  document.querySelectorAll("#authTabs button").forEach((b) => b.addEventListener("click", () => {
    authMode = b.dataset.m;
    document.querySelectorAll("#authTabs button").forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
    $("aGo").textContent = authMode === "in" ? "Entrar" : "Criar conta";
    $("aPass").autocomplete = authMode === "in" ? "current-password" : "new-password";
    $("aMsg").textContent = "";
  }));
  $("fAuth").addEventListener("submit", async (e) => {
    e.preventDefault();
    const m = $("aMsg"); m.className = "msg"; m.textContent = "";
    const email = $("aEmail").value.trim(), password = $("aPass").value;
    $("aGo").disabled = true;
    try {
      if (authMode === "in") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) { m.textContent = "Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre aqui."; }
      }
    } catch (err) {
      m.className = "msg err";
      const t = (err && err.message) || "";
      m.textContent = /invalid login/i.test(t) ? "E-mail ou senha incorretos." :
        /not confirmed/i.test(t) ? "Confirme seu e-mail pelo link que chegou na caixa de entrada." :
        /already registered/i.test(t) ? "Esse e-mail já tem conta. Use Entrar." :
        /password/i.test(t) ? "A senha precisa ter pelo menos 6 caracteres." :
        "Não deu certo: " + t;
    }
    $("aGo").disabled = false;
  });
  $("ajSair").addEventListener("click", async () => { await sb.auth.signOut(); user = null; $("vApp").hidden = true; $("vAuth").hidden = false; });

  // ---------- dados ----------
  async function loadAll() {
    $("topNote").textContent = "carregando…";
    try {
      const [p, t, c] = await Promise.all([
        sb.from("pesagens").select("id,data,kg").order("data"),
        sb.from("treinos").select("id,data,tipo,nota,series(id,exercicio,ordem,serie,reps,segundos,carga_kg)").order("data"),
        sb.from("config").select("meta_kg").maybeSingle()
      ]);
      if (p.error) throw p.error; if (t.error) throw t.error;
      pesos = (p.data || []).map((r) => ({ ...r, kg: Number(r.kg) }));
      treinos = (t.data || []).map((r) => ({ ...r, series: (r.series || []).sort((a, b) => a.ordem - b.ordem || a.serie - b.serie) }));
      if (c.data && c.data.meta_kg != null) metaKg = Number(c.data.meta_kg);
      $("topNote").textContent = "";
    } catch (err) {
      $("topNote").textContent = "sem conexão";
      toast("Não consegui carregar seus dados. Confira a internet.");
    }
    renderAll();
  }

  function inicioData() {
    const ds = pesos.map((p) => p.data).concat(treinos.map((t) => t.data)).sort();
    return ds[0] || null;
  }
  function treinosDoDia(s) { return treinos.filter((t) => t.data === s); }
  function faltou(s) { const ini = inicioData(); return !!ini && s >= ini && s < hoje() && !treinosDoDia(s).length; }
  function melhorReps(nome) {
    let best = null;
    treinos.forEach((t) => t.series.forEach((s) => { if (s.exercicio === nome && s.reps != null && (!best || s.reps > best.v)) best = { v: s.reps, data: t.data }; }));
    return best;
  }

  // ---------- navegação ----------
  const TITLES = { tabHome: "Início", tabTreino: "Treinar", tabCal: "Calendário", tabEvo: "Evolução", tabAj: "Ajustes" };
  let tab = "tabHome";
  function go(t) {
    tab = t;
    document.querySelectorAll(".tab").forEach((s) => (s.hidden = s.id !== t));
    document.querySelectorAll("#tabs button").forEach((b) => { if (b.dataset.tab === t) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    $("title").textContent = TITLES[t];
    if (t === "tabTreino" && !draft) openDraft(hoje());
    window.scrollTo(0, 0);
  }
  document.querySelectorAll("#tabs button").forEach((b) => b.addEventListener("click", () => { if (b.dataset.tab === "tabTreino") draft = null; go(b.dataset.tab); }));

  function renderAll() { renderHome(); renderCal(); renderPeso(); renderExEvo(); $("mKg").value = fmtKg(metaKg); }

  // ---------- INÍCIO ----------
  function renderHome() {
    $("hMeta").textContent = fmtKg(metaKg).replace(",0", "");
    $("hFim").textContent = fmtKg(metaKg) + " kg";
    if (pesos.length) {
      const i = pesos[0], a = pesos[pesos.length - 1], dif = i.kg - a.kg, tot = i.kg - metaKg;
      const pct = tot > 0 ? Math.max(0, Math.min(100, (dif / tot) * 100)) : 0;
      $("hFill").style.width = pct + "%";
      $("hMetaTxt").textContent = a.kg <= metaKg ? "Meta alcançada!" : "faltam " + fmtKg(a.kg - metaKg) + " kg · " + Math.round(pct) + "%";
      $("hIni").textContent = fmtKg(i.kg) + " kg";
      $("hPeso").textContent = fmtKg(a.kg); $("hPesoD").textContent = "kg em " + fmtD(a.data);
      $("hPerdido").textContent = (dif < 0 ? "+" : "") + fmtKg(Math.abs(dif));
      $("hPerdido").className = "num" + (dif > 0 ? " good" : "");
      $("hPerdidoD").textContent = dif < 0 ? "kg acima do início" : "kg desde " + fmtD(i.data);
    } else {
      $("hMetaTxt").textContent = "registre uma pesagem"; $("hIni").textContent = "";
    }
    const ym = hoje().slice(0, 7), now = new Date(), ini = inicioData();
    const doMes = treinos.filter((t) => t.data.startsWith(ym));
    let prev = 0;
    for (let d = 1; d <= now.getDate(); d++) { const s = ym + "-" + pad(d); if (PLAN[new Date(now.getFullYear(), now.getMonth(), d).getDay()] && (!ini || s >= ini)) prev++; }
    $("hMes").textContent = doMes.length;
    $("hMesD").textContent = new Set(doMes.map((t) => t.data)).size + " de " + prev + " dias previstos";
    const b = melhorReps("Barra pronada"), f = melhorReps("Flexão");
    $("hBar").textContent = b ? b.v : "—"; $("hFlex").textContent = f ? f.v : "—";

    // semana
    const w = $("hWeek"); w.textContent = "";
    const d0 = new Date(); d0.setDate(d0.getDate() - d0.getDay());
    let feitos = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(d0); d.setDate(d0.getDate() + i); const s = iso(d); const ts = treinosDoDia(s);
      if (ts.length) feitos++;
      const el = document.createElement("div");
      el.className = "wd" + (ts.length ? " " + (ts.find((t) => t.tipo === "mt") ? "mt" : ts[0].tipo) : faltou(s) ? " faltou" : "") + (s === hoje() ? " hoje" : "");
      el.innerHTML = "<span>" + DOW[i] + "</span><i>" + d.getDate() + "</i>";
      el.title = ts.length ? ts.map((t) => NOME[t.tipo]).join(" + ") : "";
      w.appendChild(el);
    }
    $("hSemana").textContent = feitos + (feitos === 1 ? " dia treinado" : " dias treinados");

    // hoje
    const plan = PLAN[new Date().getDay()], ts = treinosDoDia(hoje());
    if (ts.length) { $("hHoje").textContent = ts.map((t) => NOME[t.tipo]).join(" + ") + " feito ✓"; $("hHojeD").textContent = "Bom trabalho. Toque para editar ou adicionar exercícios."; $("hGo").textContent = "Ver treino de hoje"; }
    else if (plan) { $("hHoje").textContent = NOME[plan]; $("hHojeD").textContent = plan === "mt" ? "Treino de muay thai às 19h." : "Comece pela barra fixa pronada, ainda descansado."; $("hGo").textContent = "Registrar treino"; }
    else { $("hHoje").textContent = "Descanso"; $("hHojeD").textContent = "Domingo é dia de recuperar. Se treinar mesmo assim, registre."; $("hGo").textContent = "Registrar treino"; }
  }
  $("hGo").addEventListener("click", () => { openDraft(hoje()); go("tabTreino"); });
  $("hPesar").addEventListener("click", () => { setEvoMode("peso"); go("tabEvo"); setTimeout(() => $("pKg").focus(), 50); });

  // ---------- TREINAR ----------
  function seriesToExs(series) {
    const exs = [];
    series.forEach((s) => {
      let ex = exs.find((e) => e.nome === s.exercicio && e.ordem === s.ordem);
      if (!ex) { ex = { nome: s.exercicio, ordem: s.ordem, unid: s.segundos != null && s.reps == null ? "seg" : "reps", sets: [] }; exs.push(ex); }
      ex.sets.push({ v: ex.unid === "seg" ? s.segundos : s.reps, kg: s.carga_kg != null ? Number(s.carga_kg) : null });
    });
    return exs;
  }
  function openDraft(data, tipo) {
    const ts = treinosDoDia(data);
    const t = tipo ? ts.find((x) => x.tipo === tipo) : ts[0];
    const tp = t ? t.tipo : tipo || PLAN[parse(data).getDay()] || "mu";
    draft = t
      ? { id: t.id, origData: t.data, origTipo: t.tipo, data: t.data, tipo: t.tipo, nota: t.nota || "", exs: seriesToExs(t.series) }
      : { id: null, data, tipo: tp, nota: "", exs: [] };
    renderDraft();
  }
  function renderDraft() {
    $("tData").value = draft.data;
    $("tNota").value = draft.nota;
    document.querySelectorAll("#tTipo button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.t === draft.tipo ? "true" : "false"));
    $("tEditando").hidden = !draft.id;
    $("tEditando").textContent = draft.id ? "Editando o treino de " + fmtDLong(draft.origData) + "." : "";
    $("tSalvar").textContent = draft.id ? "Salvar alterações" : "Salvar treino";
    $("tExBox").hidden = draft.tipo === "mt" && !draft.exs.length;
    renderExs();
    renderChips();
  }
  function renderChips() {
    const c = $("tChips"); c.textContent = "";
    const usados = new Set();
    treinos.forEach((t) => t.series.forEach((s) => usados.add(s.exercicio)));
    const lista = EXS.map((e) => e.n);
    usados.forEach((n) => { if (!lista.includes(n)) lista.push(n); });
    lista.forEach((n) => {
      const b = document.createElement("button"); b.type = "button"; b.textContent = "+ " + n;
      b.onclick = () => addEx(n); c.appendChild(b);
    });
  }
  function unidPadrao(n) { const e = EXS.find((x) => x.n === n); if (e) return e.u; for (const t of treinos) for (const s of t.series) if (s.exercicio === n) return s.segundos != null && s.reps == null ? "seg" : "reps"; return "reps"; }
  function addEx(nome) {
    nome = nome.trim(); if (!nome) return;
    draft.exs.push({ nome, unid: unidPadrao(nome), sets: [{ v: null, kg: null }] });
    renderExs();
    const inputs = $("tExs").querySelectorAll(".ex:last-child input");
    if (inputs[0]) inputs[0].focus();
  }
  $("tNovoGo").addEventListener("click", () => { addEx($("tNovo").value); $("tNovo").value = ""; });
  $("tNovo").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("tNovoGo").click(); } });

  function renderExs() {
    const box = $("tExs"); box.textContent = "";
    if (!draft.exs.length) { box.innerHTML = '<p class="empty">Adicione os exercícios do treino abaixo, ou use "Repetir último treino".</p>'; return; }
    draft.exs.forEach((ex, ei) => {
      const card = document.createElement("div"); card.className = "card ex";
      const rec = melhorReps(ex.nome);
      card.innerHTML =
        '<div class="ex-h"><div><b>' + esc(ex.nome) + '</b>' + (rec && ex.unid === "reps" ? '<div class="small muted">recorde: ' + rec.v + " reps</div>" : "") + "</div>" +
        '<div class="unit"><button type="button" data-u="reps" aria-pressed="' + (ex.unid === "reps") + '">reps</button><button type="button" data-u="seg" aria-pressed="' + (ex.unid === "seg") + '">seg</button>' +
        '<button type="button" class="link danger" data-rm="1">remover</button></div></div>' +
        '<div class="set set-h muted"><span></span><span class="lbl">' + (ex.unid === "seg" ? "Segundos" : "Reps") + '</span><span class="lbl">Carga kg</span><span></span></div>';
      ex.sets.forEach((st, si) => {
        const row = document.createElement("div"); row.className = "set";
        row.innerHTML = '<span class="n">' + (si + 1) + 'ª</span>' +
          '<input type="number" inputmode="numeric" min="0" placeholder="' + (ex.unid === "seg" ? "seg" : "reps") + '" value="' + (st.v ?? "") + '" aria-label="' + (ex.unid === "seg" ? "Segundos" : "Repetições") + " da série " + (si + 1) + '">' +
          '<input type="text" inputmode="decimal" placeholder="corpo" value="' + (st.kg != null ? fmtKg(st.kg).replace(",0", "") : "") + '" aria-label="Carga extra em kg da série ' + (si + 1) + '">' +
          '<button type="button" class="rm" aria-label="Apagar série">×</button>';
        const [iv, ik] = row.querySelectorAll("input");
        iv.addEventListener("input", () => (st.v = num(iv.value)));
        ik.addEventListener("input", () => (st.kg = num(ik.value)));
        row.querySelector(".rm").onclick = () => { ex.sets.splice(si, 1); if (!ex.sets.length) draft.exs.splice(ei, 1); renderExs(); };
        card.appendChild(row);
      });
      const add = document.createElement("button"); add.type = "button"; add.className = "ghost"; add.textContent = "+ série";
      add.onclick = () => { const last = ex.sets[ex.sets.length - 1] || { v: null, kg: null }; ex.sets.push({ v: last.v, kg: last.kg }); renderExs(); };
      card.appendChild(add);
      card.querySelectorAll(".unit [data-u]").forEach((b) => (b.onclick = () => { ex.unid = b.dataset.u; renderExs(); }));
      card.querySelector("[data-rm]").onclick = () => { draft.exs.splice(ei, 1); renderExs(); };
      box.appendChild(card);
    });
  }
  document.querySelectorAll("#tTipo button").forEach((b) => b.addEventListener("click", () => {
    draft.tipo = b.dataset.t; draft.nota = $("tNota").value; draft.data = $("tData").value;
    document.querySelectorAll("#tTipo button").forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
    $("tExBox").hidden = draft.tipo === "mt" && !draft.exs.length;
  }));
  $("tData").addEventListener("change", () => {
    const d = $("tData").value; if (!d) return;
    if (!draft.id && !draft.exs.length && treinosDoDia(d).length) { openDraft(d); toast("Esse dia já tem treino. Abri para editar."); return; }
    draft.data = d;
  });
  $("tNota").addEventListener("input", () => (draft.nota = $("tNota").value));
  $("tRepetir").addEventListener("click", () => {
    const tipo = draft.tipo === "mt" ? "mu" : draft.tipo;
    const ult = treinos.filter((t) => t.series.length && t.id !== draft.id && (t.tipo === tipo)).sort((a, b) => b.data.localeCompare(a.data))[0]
      || treinos.filter((t) => t.series.length && t.id !== draft.id).sort((a, b) => b.data.localeCompare(a.data))[0];
    if (!ult) { toast("Ainda não há treino com exercícios para repetir."); return; }
    draft.exs = seriesToExs(ult.series);
    renderExs(); toast("Copiei o treino de " + fmtD(ult.data) + ". Ajuste o que mudou.");
  });

  $("fTreino").addEventListener("submit", async (e) => {
    e.preventDefault();
    draft.data = $("tData").value; draft.nota = $("tNota").value.trim();
    if (!draft.data) { toast("Escolha o dia do treino."); return; }
    const btn = $("tSalvar"); btn.disabled = true;
    try {
      const { data: row, error } = await sb.from("treinos")
        .upsert({ user_id: user.id, data: draft.data, tipo: draft.tipo, nota: draft.nota || null }, { onConflict: "user_id,data,tipo" })
        .select("id").single();
      if (error) throw error;
      if (draft.id && draft.id !== row.id) { const r = await sb.from("treinos").delete().eq("id", draft.id); if (r.error) throw r.error; }
      const del = await sb.from("series").delete().eq("treino_id", row.id); if (del.error) throw del.error;
      const linhas = [];
      draft.exs.forEach((ex, oi) => ex.sets.forEach((st, si) => {
        if (st.v == null && st.kg == null) return;
        linhas.push({ user_id: user.id, treino_id: row.id, exercicio: ex.nome, ordem: oi, serie: si + 1,
          reps: ex.unid === "reps" ? (st.v != null ? Math.round(st.v) : null) : null,
          segundos: ex.unid === "seg" ? (st.v != null ? Math.round(st.v) : null) : null,
          carga_kg: st.kg });
      }));
      if (linhas.length) { const ins = await sb.from("series").insert(linhas); if (ins.error) throw ins.error; }
      const antes = { b: melhorReps("Barra pronada"), f: melhorReps("Flexão") };
      await loadAll();
      const dep = { b: melhorReps("Barra pronada"), f: melhorReps("Flexão") };
      let msg = NOME[draft.tipo] + " salvo em " + fmtD(draft.data) + ".";
      if (dep.b && (!antes.b || dep.b.v > antes.b.v)) msg = "Recorde de barras: " + dep.b.v + "! 🔥";
      else if (dep.f && (!antes.f || dep.f.v > antes.f.v)) msg = "Recorde de flexões: " + dep.f.v + "! 🔥";
      toast(msg);
      calSel = draft.data; draft = null; go("tabHome");
    } catch (err) {
      toast("Não salvou: " + ((err && err.message) || "tente de novo"));
    }
    btn.disabled = false;
  });

  // ---------- CALENDÁRIO ----------
  $("cPrev").onclick = () => { calView.setMonth(calView.getMonth() - 1); renderCal(); };
  $("cNext").onclick = () => { calView.setMonth(calView.getMonth() + 1); renderCal(); };
  function renderCal() {
    const y = calView.getFullYear(), m = calView.getMonth();
    $("cMes").textContent = MESES[m] + " " + y;
    const g = $("cGrid"); g.textContent = "";
    DOW.forEach((d) => { const e = document.createElement("div"); e.className = "dow"; e.textContent = d; g.appendChild(e); });
    const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
    for (let i = 0; i < first; i++) { const e = document.createElement("div"); e.className = "day out"; g.appendChild(e); }
    for (let d = 1; d <= days; d++) {
      const s = y + "-" + pad(m + 1) + "-" + pad(d), plan = PLAN[new Date(y, m, d).getDay()], ts = treinosDoDia(s);
      const b = document.createElement("button"); b.type = "button"; b.className = "day";
      if (s === hoje()) b.classList.add("hoje"); if (s === calSel) b.classList.add("sel");
      if (ts.length) b.classList.add(ts.find((t) => t.tipo === "mt") ? "mt" : ts[0].tipo === "mu" ? "mu" : "x");
      const fal = faltou(s); if (fal) b.classList.add("faltou");
      b.innerHTML = '<span class="d num">' + d + '</span><span class="p">' + (fal ? "Faltou" : ts.length ? ts.map((t) => (t.tipo === "mt" ? "MT" : t.tipo === "mu" ? "Musc" : "Out")).join("+") : plan ? (plan === "mt" ? "MT" : "Musc") : "Desc.") + "</span>" +
        ts.map((t) => '<i class="mk" style="--c:' + COR[t.tipo] + '"></i>').join("");
      b.setAttribute("aria-label", d + " de " + MESES[m] + (ts.length ? ", feito: " + ts.map((t) => NOME[t.tipo]).join(" e ") : fal ? ", sem treino" : ""));
      b.onclick = () => { calSel = s; renderCal(); };
      g.appendChild(b);
    }
    renderDia();
  }
  function resumoSeries(t) {
    return seriesToExs(t.series).map((ex) =>
      "<li><b>" + esc(ex.nome) + "</b>: " + ex.sets.map((s) => (s.v ?? "–") + (ex.unid === "seg" ? "s" : "") + (s.kg ? " (+" + fmtKg(s.kg).replace(",0", "") + "kg)" : "")).join(" · ") + "</li>").join("");
  }
  function renderDia() {
    const box = $("cDia"), s = calSel, ts = treinosDoDia(s), pz = pesos.find((p) => p.data === s);
    let h = '<div class="row-between"><h2>' + esc(fmtDLong(s)) + "</h2></div>";
    if (pz) h += '<p class="small">Pesagem: <b class="num">' + fmtKg(pz.kg) + " kg</b></p>";
    if (!ts.length) h += '<p class="empty">' + (faltou(s) ? "Nenhum treino registrado neste dia." : s > hoje() ? "Ainda não chegou." : "Nada registrado ainda.") + "</p>";
    ts.forEach((t) => {
      h += '<div class="treino"><div class="row-between"><span class="chip ' + t.tipo + '">' + NOME[t.tipo] + '</span><span class="btns"><button type="button" class="link" data-ed="' + t.id + '">editar</button><button type="button" class="link danger" data-del="' + t.id + '">apagar</button></span></div>' +
        (t.nota ? '<p class="small muted">' + esc(t.nota) + "</p>" : "") + (t.series.length ? "<ul>" + resumoSeries(t) + "</ul>" : "") + "</div>";
    });
    if (s <= hoje()) h += '<button type="button" class="ghost" id="cNovo">Registrar treino neste dia</button>';
    box.innerHTML = h;
    box.querySelectorAll("[data-ed]").forEach((b) => (b.onclick = () => { const t = treinos.find((x) => x.id === b.dataset.ed); openDraft(t.data, t.tipo); go("tabTreino"); }));
    box.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
      if (b.dataset.c !== "1") { b.dataset.c = "1"; b.textContent = "confirmar?"; setTimeout(() => { b.dataset.c = ""; b.textContent = "apagar"; }, 3000); return; }
      const r = await sb.from("treinos").delete().eq("id", b.dataset.del);
      if (r.error) toast("Não apagou: " + r.error.message); else { toast("Treino apagado."); loadAll(); }
    }));
    const n = $("cNovo"); if (n) n.onclick = () => { draft = { id: null, data: s, tipo: PLAN[parse(s).getDay()] || "mu", nota: "", exs: [] }; renderDraft(); go("tabTreino"); };
  }

  // ---------- EVOLUÇÃO ----------
  function setEvoMode(m) {
    document.querySelectorAll("#eModo button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.m === m ? "true" : "false"));
    $("ePeso").hidden = m !== "peso"; $("eEx").hidden = m !== "ex";
  }
  document.querySelectorAll("#eModo button").forEach((b) => b.addEventListener("click", () => setEvoMode(b.dataset.m)));

  function chart(pts, opt) {
    opt = opt || {};
    if (!pts.length) return '<p class="empty">' + (opt.empty || "Sem dados ainda.") + "</p>";
    const W = 380, H = 210, L = 34, R = 10, T = 14, B = 24;
    const t0 = parse(pts[0].x).getTime(), t1 = Math.max(parse(pts[pts.length - 1].x).getTime(), t0 + 6 * 864e5);
    const ys = pts.map((p) => p.y).concat(opt.goal != null ? [opt.goal] : []);
    let lo = Math.floor(Math.min(...ys) - (opt.pad ?? 1)), hi = Math.ceil(Math.max(...ys) + (opt.pad ?? 1));
    if (opt.zero) lo = 0;
    if (hi - lo < 4) hi = lo + 4;
    const step = hi - lo > 30 ? 5 : hi - lo > 12 ? 2 : 1;
    const x = (d) => L + ((parse(d).getTime() - t0) / (t1 - t0)) * (W - L - R), y = (v) => T + ((hi - v) / (hi - lo)) * (H - T - B);
    let s = "";
    for (let k = Math.ceil(lo / step) * step; k <= hi; k += step) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(k) + '" y2="' + y(k) + '" stroke="var(--line)"/><text x="' + (L - 6) + '" y="' + (y(k) + 4) + '" text-anchor="end">' + k + "</text>";
    if (opt.goal != null) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(opt.goal) + '" y2="' + y(opt.goal) + '" stroke="var(--good)" stroke-width="2"/><text x="' + (W - R) + '" y="' + (y(opt.goal) - 6) + '" text-anchor="end" style="fill:var(--good);font-weight:600">meta ' + fmtKg(opt.goal) + "</text>";
    const poly = pts.map((p) => x(p.x) + "," + y(p.y)).join(" ");
    if (pts.length > 1) s += '<polygon points="' + x(pts[0].x) + "," + (H - B) + " " + poly + " " + x(pts[pts.length - 1].x) + "," + (H - B) + '" fill="' + (opt.color || "var(--blue)") + '" fill-opacity=".1"/><polyline points="' + poly + '" fill="none" stroke="' + (opt.color || "var(--blue)") + '" stroke-width="2.5" stroke-linejoin="round"/>';
    pts.forEach((p, i) => { const last = i === pts.length - 1; s += '<circle cx="' + x(p.x) + '" cy="' + y(p.y) + '" r="' + (last ? 5 : 3) + '" fill="' + (last ? opt.color || "var(--blue)" : "var(--surface)") + '" stroke="' + (opt.color || "var(--blue)") + '" stroke-width="2"/>'; });
    const n = Math.min(4, pts.length), seen = new Set();
    for (let i = 0; i < n; i++) { const p = pts[Math.round((i * (pts.length - 1)) / Math.max(1, n - 1))]; if (seen.has(p.x)) continue; seen.add(p.x); s += '<text x="' + x(p.x) + '" y="' + (H - 8) + '" text-anchor="middle">' + fmtD(p.x) + "</text>"; }
    return '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(opt.label || "Gráfico") + '">' + s + "</svg>";
  }

  function renderPeso() {
    if (!$("pData").value) $("pData").value = hoje();
    $("pChart").innerHTML = chart(pesos.map((p) => ({ x: p.data, y: p.kg })), { goal: metaKg, pad: 2, label: "Peso ao longo do tempo", empty: "Sua linha de peso aparece aqui depois da primeira pesagem." });
    const ul = $("pList"); ul.textContent = "";
    if (!pesos.length) { ul.innerHTML = '<li class="empty">Nenhuma pesagem ainda.</li>'; return; }
    pesos.slice().reverse().forEach((p, i, arr) => {
      const ant = arr[i + 1]; const li = document.createElement("li");
      const dif = ant ? p.kg - ant.kg : null;
      li.innerHTML = '<span class="num">' + fmtD(p.data) + '</span><span class="num"><b>' + fmtKg(p.kg) + " kg</b>" + (dif != null ? ' <span class="small ' + (dif < 0 ? "g" : "muted") + '" style="' + (dif < 0 ? "color:var(--good)" : "") + '">' + (dif > 0 ? "+" : "") + fmtKg(dif) + "</span>" : "") + '</span><button type="button" class="link danger">apagar</button>';
      const b = li.querySelector("button");
      b.onclick = async () => {
        if (b.dataset.c !== "1") { b.dataset.c = "1"; b.textContent = "confirmar?"; setTimeout(() => { b.dataset.c = ""; b.textContent = "apagar"; }, 3000); return; }
        const r = await sb.from("pesagens").delete().eq("id", p.id); if (r.error) toast("Não apagou: " + r.error.message); else loadAll();
      };
      ul.appendChild(li);
    });
  }
  $("fPeso").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = $("pData").value, kg = num($("pKg").value);
    if (!data || kg == null || kg < 30 || kg > 300) { toast("Informe o dia e um peso entre 30 e 300 kg."); return; }
    const ant = pesos.filter((p) => p.data < data).pop();
    const r = await sb.from("pesagens").upsert({ user_id: user.id, data, kg: Math.round(kg * 10) / 10 }, { onConflict: "user_id,data" });
    if (r.error) { toast("Não salvou: " + r.error.message); return; }
    $("pKg").value = "";
    toast("Pesagem salva." + (ant ? " " + (kg < ant.kg ? "−" : "+") + fmtKg(Math.abs(kg - ant.kg)) + " kg desde " + fmtD(ant.data) + "." : ""));
    loadAll();
  });

  function renderExEvo() {
    const nomes = [];
    treinos.forEach((t) => t.series.forEach((s) => { if (!nomes.includes(s.exercicio)) nomes.push(s.exercicio); }));
    const sel = $("xSel");
    if (!nomes.length) {
      sel.innerHTML = "<option>Nenhum exercício registrado</option>"; sel.disabled = true;
      $("xStats").innerHTML = ""; $("xChart").innerHTML = '<p class="empty">Registre um treino com exercícios para ver a evolução de cada um.</p>'; $("xList").innerHTML = ""; return;
    }
    sel.disabled = false;
    if (!exSel || !nomes.includes(exSel)) exSel = nomes.includes("Barra pronada") ? "Barra pronada" : nomes[0];
    sel.innerHTML = nomes.map((n) => '<option value="' + esc(n) + '"' + (n === exSel ? " selected" : "") + ">" + esc(n) + "</option>").join("");
    const sess = [];
    treinos.forEach((t) => { const ss = t.series.filter((s) => s.exercicio === exSel); if (ss.length) sess.push({ data: t.data, ss }); });
    const seg = sess.some((x) => x.ss.some((s) => s.segundos != null && s.reps == null));
    const val = (s) => (seg ? s.segundos : s.reps);
    const usaCarga = sess.some((x) => x.ss.some((s) => s.carga_kg));
    let rec = null, maxKg = null, tot = 0;
    sess.forEach((x) => x.ss.forEach((s) => { const v = val(s); if (v != null) { tot += v; if (!rec || v > rec.v) rec = { v, data: x.data }; } if (s.carga_kg && (!maxKg || Number(s.carga_kg) > maxKg.v)) maxKg = { v: Number(s.carga_kg), data: x.data }; }));
    const u = seg ? "seg" : "reps";
    $("xStats").innerHTML =
      '<div class="stat"><span class="lbl">Recorde</span><b class="num">' + (rec ? rec.v : "—") + '</b><span class="small muted">' + u + " numa série" + (rec ? " · " + fmtD(rec.data) : "") + "</span></div>" +
      '<div class="stat"><span class="lbl">' + (usaCarga ? "Maior carga" : "Total") + '</span><b class="num">' + (usaCarga ? (maxKg ? fmtKg(maxKg.v).replace(",0", "") : "—") : tot) + '</b><span class="small muted">' + (usaCarga ? "kg" + (maxKg ? " · " + fmtD(maxKg.data) : "") : u + " em " + sess.length + " treino" + (sess.length > 1 ? "s" : "")) + "</span></div>";
    $("xChartT").textContent = "Melhor série por treino (" + u + ")";
    $("xChart").innerHTML = chart(sess.map((x) => ({ x: x.data, y: Math.max(0, ...x.ss.map((s) => val(s) || 0)) })), { zero: true, color: "var(--gold)", label: "Evolução de " + exSel });
    $("xList").innerHTML = sess.slice().reverse().map((x) =>
      '<li><span class="num">' + fmtD(x.data) + '</span><span class="num small" style="text-align:right">' + x.ss.map((s) => (val(s) ?? "–") + (seg ? "s" : "") + (s.carga_kg ? " +" + fmtKg(s.carga_kg).replace(",0", "") + "kg" : "")).join(" · ") + "</span></li>").join("");
  }
  $("xSel").addEventListener("change", () => { exSel = $("xSel").value; renderExEvo(); });

  // ---------- AJUSTES ----------
  $("fMeta").addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = num($("mKg").value);
    if (v == null || v < 30 || v > 300) { toast("Informe uma meta entre 30 e 300 kg."); return; }
    const r = await sb.from("config").upsert({ user_id: user.id, meta_kg: Math.round(v * 10) / 10 });
    if (r.error) { toast("Não salvou: " + r.error.message); return; }
    metaKg = Math.round(v * 10) / 10; renderAll(); toast("Meta salva: " + fmtKg(metaKg) + " kg.");
  });

  document.addEventListener("visibilitychange", () => { if (!document.hidden && user) loadAll(); });
})();
