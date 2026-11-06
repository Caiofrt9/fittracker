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
  let rotinas = [], bancoNovo = true, sessao = null, rotEdit = null, descanso = null;

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
      let [p, t, c, r] = await Promise.all([
        sb.from("pesagens").select("id,data,kg").order("data"),
        sb.from("treinos").select("id,data,tipo,nota,duracao_seg,series(id,exercicio,ordem,serie,reps,segundos,carga_kg,tipo_serie)").order("data"),
        sb.from("config").select("meta_kg").maybeSingle(),
        sb.from("rotinas").select("id,nome,exercicios,ordem,criado_em").order("ordem").order("criado_em")
      ]);
      // Banco ainda sem a atualização de rotinas: carrega do jeito antigo
      bancoNovo = !t.error && !r.error;
      if (t.error) t = await sb.from("treinos").select("id,data,tipo,nota,series(id,exercicio,ordem,serie,reps,segundos,carga_kg)").order("data");
      rotinas = r.error ? [] : (r.data || []);
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
    treinos.forEach((t) => t.series.forEach((s) => { if (s.exercicio === nome && s.reps != null && s.tipo_serie !== "A" && (!best || s.reps > best.v)) best = { v: s.reps, data: t.data }; }));
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
    if (t === "tabTreino") treinoModo(draft ? "manual" : null);
    window.scrollTo(0, 0);
  }
  document.querySelectorAll("#tabs button").forEach((b) => b.addEventListener("click", () => { if (b.dataset.tab === "tabTreino") draft = null; go(b.dataset.tab); }));

  function renderAll() { renderHome(); renderCal(); renderPeso(); renderExEvo(); renderHub(); $("mKg").value = fmtKg(metaKg); }

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
  $("hGo").addEventListener("click", () => {
    if (!sessao && (treinosDoDia(hoje()).length || PLAN[new Date().getDay()] === "mt")) openDraft(hoje()); else draft = null;
    go("tabTreino");
  });
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

  // =====================================================================
  // ROTINAS E TREINO AO VIVO
  // =====================================================================
  const DESCANSOS = [0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300];
  const fmtT = (seg) => { seg = Math.max(0, Math.round(seg)); const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), x = seg % 60; return (h ? h + ":" + pad(m) : m) + ":" + pad(x); };
  const fmtDesc = (seg) => (seg ? (seg >= 60 ? Math.floor(seg / 60) + "min" + (seg % 60 ? " " + (seg % 60) + "s" : "") : seg + "s") : "sem descanso");
  const SKEY = "ft_sessao";
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(SKEY) || "null"); } catch (e) { return null; } },
    set(v) { try { if (v) localStorage.setItem(SKEY, JSON.stringify(v)); else localStorage.removeItem(SKEY); } catch (e) {} }
  };

  // ---------- modos da aba Treinar ----------
  let modo = "hub";
  function treinoModo(m) {
    if (!m) m = sessao ? "sessao" : "hub";
    modo = m;
    $("tHub").hidden = m !== "hub";
    $("tRotEdit").hidden = m !== "rotina";
    $("tSessao").hidden = m !== "sessao";
    $("fTreino").hidden = m !== "manual";
    $("title").textContent = m === "rotina" ? (rotEdit && rotEdit.id ? "Editar rotina" : "Nova rotina") : m === "sessao" ? "Treinando" : m === "manual" ? "Registro rápido" : "Treinar";
    if (m === "hub") renderHub();
    if (m === "sessao") renderSessao();
    atualizarBanner();
  }
  $("tVoltar").addEventListener("click", () => { draft = null; treinoModo("hub"); window.scrollTo(0, 0); });
  $("hubManual").addEventListener("click", () => { openDraft(hoje()); treinoModo("manual"); });
  $("hubVazio").addEventListener("click", () => iniciarSessao(null));
  $("hubNova").addEventListener("click", () => abrirRotina(null));

  function exLista() {
    const lista = EXS.map((e) => e.n);
    treinos.forEach((t) => t.series.forEach((s) => { if (!lista.includes(s.exercicio)) lista.push(s.exercicio); }));
    rotinas.forEach((r) => (r.exercicios || []).forEach((e) => { if (!lista.includes(e.nome)) lista.push(e.nome); }));
    return lista;
  }
  function chips(boxId, onPick) {
    const c = $(boxId); c.textContent = "";
    exLista().forEach((n) => { const b = document.createElement("button"); b.type = "button"; b.textContent = "+ " + n; b.onclick = () => onPick(n); c.appendChild(b); });
  }
  function descSelect(valor, onChange) {
    const w = document.createElement("label"); w.className = "rest-pick";
    w.innerHTML = '<span>⏱ Descanso</span>';
    const sel = document.createElement("select");
    const opts = DESCANSOS.includes(valor) ? DESCANSOS : DESCANSOS.concat([valor]).sort((a, b) => a - b);
    opts.forEach((v) => { const o = document.createElement("option"); o.value = v; o.textContent = fmtDesc(v); if (v === valor) o.selected = true; sel.appendChild(o); });
    sel.onchange = () => onChange(Number(sel.value));
    w.appendChild(sel); return w;
  }

  // ---------- lista de rotinas ----------
  function renderHub() {
    const box = $("hubRotinas"); if (!box) return;
    box.textContent = "";
    $("hubAviso").hidden = bancoNovo;
    $("hubAviso").textContent = "Para salvar rotinas, rode o arquivo supabase/3-rotinas.sql no Supabase (SQL Editor). Enquanto isso, use o treino vazio.";
    if (!rotinas.length) {
      const c = document.createElement("div"); c.className = "card";
      c.innerHTML = '<p class="empty">Você ainda não tem rotinas. Crie a sua ou comece pela sugestão de treino de pull para a barra fixa.</p>';
      const b = document.createElement("button"); b.type = "button"; b.className = "ghost"; b.textContent = "Usar modelo: Pull para barra fixa";
      b.disabled = !bancoNovo; b.onclick = criarModeloPull; c.appendChild(b); box.appendChild(c); return;
    }
    rotinas.forEach((r) => {
      const exs = r.exercicios || [];
      const c = document.createElement("div"); c.className = "card rot";
      const series = exs.reduce((a, e) => a + (e.sets || []).length, 0);
      c.innerHTML = '<div class="rot-h"><b>' + esc(r.nome) + '</b><button type="button" class="link" data-ed="1">editar</button></div>' +
        "<p>" + esc(exs.map((e) => e.nome).join(" · ") || "sem exercícios") + "</p>" +
        '<span class="small muted">' + exs.length + " exercício" + (exs.length === 1 ? "" : "s") + " · " + series + " séries</span>";
      const go1 = document.createElement("button"); go1.type = "button"; go1.className = "go"; go1.textContent = "Iniciar rotina";
      go1.onclick = () => iniciarSessao(r); c.appendChild(go1);
      c.querySelector("[data-ed]").onclick = () => abrirRotina(r);
      box.appendChild(c);
    });
  }

  async function criarModeloPull() {
    const S = (n, alvo, tipo) => Array.from({ length: n }, () => ({ tipo: tipo || "N", alvo, kg: null }));
    const exercicios = [
      { nome: "Barra escapular", unid: "reps", descanso: 60, nota: "Aquecimento: só puxar as escápulas, braço estendido.", sets: S(2, 8, "A") },
      { nome: "Barra pronada", unid: "reps", descanso: 150, nota: "Sempre primeiro, descansado. Pare 1 repetição antes da falha.", sets: S(5, 3) },
      { nome: "Negativa na barra", unid: "reps", descanso: 90, nota: "Descer em 5 segundos.", sets: S(2, 3) },
      { nome: "Barra supinada", unid: "reps", descanso: 120, nota: "", sets: S(3, 4) },
      { nome: "Remada nas argolas", unid: "reps", descanso: 90, nota: "Quanto mais deitado, mais difícil.", sets: S(3, 10) },
      { nome: "Rosca direta", unid: "reps", descanso: 60, nota: "Barra pesada.", sets: S(3, 10) },
      { nome: "Face pull", unid: "reps", descanso: 60, nota: "Nas argolas.", sets: S(3, 12) },
      { nome: "Dead hang", unid: "seg", descanso: 60, nota: "Pegada: aguente o máximo.", sets: S(3, 30) }
    ];
    const r = await sb.from("rotinas").insert({ user_id: user.id, nome: "Pull — barra fixa", exercicios, ordem: rotinas.length }).select().single();
    if (r.error) { toast("Não salvou: " + r.error.message); return; }
    rotinas.push(r.data); renderHub(); toast("Rotina criada. Ajuste as metas ao seu nível.");
  }

  // ---------- editor de rotina ----------
  function abrirRotina(r) {
    if (!bancoNovo) { toast("Rode o arquivo 3-rotinas.sql no Supabase para salvar rotinas."); return; }
    rotEdit = r ? JSON.parse(JSON.stringify({ id: r.id, nome: r.nome, exercicios: r.exercicios || [] })) : { id: null, nome: "", exercicios: [] };
    $("rNome").value = rotEdit.nome;
    $("rApagar").hidden = !rotEdit.id; $("rApagar").textContent = "Apagar"; $("rApagar").dataset.c = "";
    chips("rChips", (n) => { rotEdit.exercicios.push({ nome: n, unid: unidPadrao(n), descanso: unidPadrao(n) === "seg" ? 60 : 90, nota: "", sets: [{ tipo: "N", alvo: null, kg: null }, { tipo: "N", alvo: null, kg: null }, { tipo: "N", alvo: null, kg: null }] }); renderRotEx(); });
    renderRotEx(); treinoModo("rotina"); window.scrollTo(0, 0);
  }
  $("rNome").addEventListener("input", () => { if (rotEdit) rotEdit.nome = $("rNome").value; });
  $("rNovoGo").addEventListener("click", () => { const n = $("rNovo").value.trim(); if (!n) return; rotEdit.exercicios.push({ nome: n, unid: "reps", descanso: 90, nota: "", sets: [{ tipo: "N", alvo: null, kg: null }] }); $("rNovo").value = ""; renderRotEx(); });
  $("rCancelar").addEventListener("click", () => { rotEdit = null; treinoModo("hub"); });

  function renderRotEx() {
    const box = $("rExs"); box.textContent = "";
    if (!rotEdit.exercicios.length) { box.innerHTML = '<p class="empty">Adicione os exercícios da rotina abaixo.</p>'; return; }
    rotEdit.exercicios.forEach((ex, ei) => {
      const c = document.createElement("div"); c.className = "card ex";
      c.innerHTML = '<div class="ex-h"><b>' + esc(ex.nome) + '</b><div class="ex-tools">' +
        '<button type="button" data-mv="-1" aria-label="Subir">↑</button><button type="button" data-mv="1" aria-label="Descer">↓</button>' +
        '<span class="unit"><button type="button" data-u="reps" aria-pressed="' + (ex.unid === "reps") + '">reps</button><button type="button" data-u="seg" aria-pressed="' + (ex.unid === "seg") + '">seg</button></span>' +
        '<button type="button" class="danger" data-rm="1" aria-label="Remover exercício">✕</button></div></div>';
      const nota = document.createElement("input"); nota.type = "text"; nota.placeholder = "Nota (aparece durante o treino)"; nota.value = ex.nota || ""; nota.maxLength = 140;
      nota.oninput = () => (ex.nota = nota.value); c.appendChild(nota);
      c.appendChild(descSelect(ex.descanso ?? 90, (v) => (ex.descanso = v)));
      const h = document.createElement("div"); h.className = "rx set-h"; h.innerHTML = '<span class="lbl">Série</span><span class="lbl">Meta ' + (ex.unid === "seg" ? "seg" : "reps") + '</span><span class="lbl">Carga kg</span><span></span>'; c.appendChild(h);
      ex.sets.forEach((st, si) => {
        const row = document.createElement("div"); row.className = "rx";
        const n = ex.sets.slice(0, si + 1).filter((x) => x.tipo !== "A").length;
        row.innerHTML = '<button type="button" class="tag ' + st.tipo + '" aria-label="Tipo da série">' + (st.tipo === "N" ? n : st.tipo) + "</button>" +
          '<input type="number" inputmode="numeric" min="0" placeholder="—" value="' + (st.alvo ?? "") + '">' +
          '<input type="text" inputmode="decimal" placeholder="corpo" value="' + (st.kg != null ? fmtKg(st.kg).replace(",0", "") : "") + '">' +
          '<button type="button" class="rm" aria-label="Apagar série">×</button>';
        const [ia, ik] = row.querySelectorAll("input");
        ia.oninput = () => (st.alvo = num(ia.value)); ik.oninput = () => (st.kg = num(ik.value));
        row.querySelector(".tag").onclick = () => { st.tipo = st.tipo === "N" ? "A" : st.tipo === "A" ? "F" : "N"; renderRotEx(); };
        row.querySelector(".rm").onclick = () => { ex.sets.splice(si, 1); renderRotEx(); };
        c.appendChild(row);
      });
      const add = document.createElement("button"); add.type = "button"; add.className = "ghost"; add.textContent = "+ série";
      add.onclick = () => { const l = ex.sets[ex.sets.length - 1] || { tipo: "N", alvo: null, kg: null }; ex.sets.push({ tipo: l.tipo === "A" ? "N" : l.tipo, alvo: l.alvo, kg: l.kg }); renderRotEx(); };
      c.appendChild(add);
      c.querySelectorAll("[data-u]").forEach((b) => (b.onclick = () => { ex.unid = b.dataset.u; renderRotEx(); }));
      c.querySelectorAll("[data-mv]").forEach((b) => (b.onclick = () => { const j = ei + Number(b.dataset.mv); if (j < 0 || j >= rotEdit.exercicios.length) return; const a = rotEdit.exercicios; [a[ei], a[j]] = [a[j], a[ei]]; renderRotEx(); }));
      c.querySelector("[data-rm]").onclick = () => { rotEdit.exercicios.splice(ei, 1); renderRotEx(); };
      box.appendChild(c);
    });
    $("rSalvar").textContent = rotEdit.id ? "Salvar alterações" : "Salvar rotina";
  }
  $("rSalvar").addEventListener("click", async () => {
    rotEdit.nome = $("rNome").value.trim();
    if (!rotEdit.nome) { toast("Dê um nome para a rotina."); $("rNome").focus(); return; }
    if (!rotEdit.exercicios.length) { toast("Adicione pelo menos um exercício."); return; }
    $("rSalvar").disabled = true;
    const body = { nome: rotEdit.nome, exercicios: rotEdit.exercicios };
    const r = rotEdit.id ? await sb.from("rotinas").update(body).eq("id", rotEdit.id) : await sb.from("rotinas").insert({ ...body, user_id: user.id, ordem: rotinas.length });
    $("rSalvar").disabled = false;
    if (r.error) { toast("Não salvou: " + r.error.message); return; }
    toast("Rotina salva."); rotEdit = null; await loadAll(); treinoModo("hub");
  });
  $("rApagar").addEventListener("click", async () => {
    const b = $("rApagar");
    if (b.dataset.c !== "1") { b.dataset.c = "1"; b.textContent = "Confirmar?"; setTimeout(() => { b.dataset.c = ""; b.textContent = "Apagar"; }, 3000); return; }
    const r = await sb.from("rotinas").delete().eq("id", rotEdit.id);
    if (r.error) { toast("Não apagou: " + r.error.message); return; }
    toast("Rotina apagada."); rotEdit = null; await loadAll(); treinoModo("hub");
  });

  // ---------- treino ao vivo ----------
  function anterior(nome) {
    const ts = treinos.filter((t) => t.series.some((s) => s.exercicio === nome)).sort((a, b) => b.data.localeCompare(a.data));
    if (!ts.length) return [];
    return ts[0].series.filter((s) => s.exercicio === nome).sort((a, b) => a.serie - b.serie)
      .map((s) => ({ v: s.segundos != null && s.reps == null ? s.segundos : s.reps, kg: s.carga_kg != null ? Number(s.carga_kg) : null, tipo: s.tipo_serie || "N" }));
  }
  function novoEx(nome, base) {
    const unid = (base && base.unid) || unidPadrao(nome);
    const sets = base && base.sets && base.sets.length ? base.sets.map((s) => ({ tipo: s.tipo || "N", alvo: s.alvo ?? null, kgAlvo: s.kg ?? null, v: null, kg: null, feito: false }))
      : [{ tipo: "N", alvo: null, kgAlvo: null, v: null, kg: null, feito: false }];
    return { nome, unid, descanso: base && base.descanso != null ? base.descanso : unid === "seg" ? 60 : 90, nota: (base && base.nota) || "", sets };
  }
  function iniciarSessao(rot) {
    if (sessao) { treinoModo("sessao"); toast("Já tem um treino em andamento."); return; }
    sessao = { rotinaId: rot ? rot.id : null, nome: rot ? rot.nome : "Treino livre", inicio: Date.now(), data: hoje(), nota: "", exs: rot ? (rot.exercicios || []).map((e) => novoEx(e.nome, e)) : [] };
    store.set(sessao); treinoModo("sessao"); window.scrollTo(0, 0); tick();
  }
  function salvarSessao() { store.set(sessao); }

  function renderSessao() {
    if (!sessao) return;
    $("sNome").textContent = sessao.nome;
    $("sNota").value = sessao.nota || "";
    chips("sChips", (n) => { sessao.exs.push(novoEx(n)); salvarSessao(); renderSessao(); });
    const box = $("sExs"); box.textContent = "";
    if (!sessao.exs.length) box.innerHTML = '<p class="empty">Adicione o primeiro exercício abaixo.</p>';
    sessao.exs.forEach((ex, ei) => {
      const prev = anterior(ex.nome);
      const c = document.createElement("div"); c.className = "card ex";
      const rec = melhorReps(ex.nome);
      c.innerHTML = '<div class="ex-h"><div><b>' + esc(ex.nome) + "</b>" + (rec && ex.unid === "reps" ? '<div class="small muted">recorde: ' + rec.v + " reps</div>" : "") + '</div><div class="ex-tools">' +
        '<button type="button" data-mv="-1" aria-label="Subir">↑</button><button type="button" data-mv="1" aria-label="Descer">↓</button>' +
        '<button type="button" class="danger" data-rm="1" aria-label="Remover exercício">✕</button></div></div>' +
        (ex.nota ? '<p class="small muted">' + esc(ex.nota) + "</p>" : "");
      c.appendChild(descSelect(ex.descanso, (v) => { ex.descanso = v; salvarSessao(); }));
      const h = document.createElement("div"); h.className = "sx h";
      h.innerHTML = "<span>Série</span><span>Anterior</span><span>kg</span><span>" + (ex.unid === "seg" ? "seg" : "reps") + "</span><span>✓</span>";
      c.appendChild(h);
      let n = 0;
      ex.sets.forEach((st, si) => {
        if (st.tipo !== "A") n++;
        const p = prev[si];
        const prevTxt = p ? (p.v ?? "–") + (ex.unid === "seg" ? "s" : "") + (p.kg ? " × " + fmtKg(p.kg).replace(",0", "") + "kg" : "") : "—";
        const phV = p && p.v != null ? p.v : st.alvo != null ? st.alvo : "";
        const phK = p && p.kg ? fmtKg(p.kg).replace(",0", "") : st.kgAlvo != null ? fmtKg(st.kgAlvo).replace(",0", "") : "";
        const row = document.createElement("div"); row.className = "sx" + (st.feito ? " done" : "");
        row.innerHTML = '<button type="button" class="tag ' + st.tipo + '" aria-label="Tipo da série (toque para mudar)">' + (st.tipo === "N" ? n : st.tipo) + "</button>" +
          '<span class="prev num">' + prevTxt + "</span>" +
          '<input type="text" inputmode="decimal" placeholder="' + (phK || "—") + '" value="' + (st.kg != null ? fmtKg(st.kg).replace(",0", "") : "") + '" aria-label="Carga em kg">' +
          '<input type="number" inputmode="numeric" min="0" placeholder="' + phV + '" value="' + (st.v ?? "") + '" aria-label="' + (ex.unid === "seg" ? "Segundos" : "Repetições") + '">' +
          '<button type="button" class="ck" aria-label="Marcar série como feita">✓</button>';
        const [ik, iv] = row.querySelectorAll("input");
        ik.oninput = () => { st.kg = num(ik.value); salvarSessao(); };
        iv.oninput = () => { st.v = num(iv.value); salvarSessao(); };
        row.querySelector(".tag").onclick = () => { st.tipo = st.tipo === "N" ? "A" : st.tipo === "A" ? "F" : "N"; salvarSessao(); renderSessao(); };
        row.querySelector(".ck").onclick = () => {
          if (!st.feito) {
            if (st.v == null) { const pv = num(iv.placeholder); if (pv == null) { toast("Anote quantas " + (ex.unid === "seg" ? "segundos" : "repetições") + " fez."); iv.focus(); return; } st.v = pv; }
            if (st.kg == null && ik.placeholder && ik.placeholder !== "—") st.kg = num(ik.placeholder);
            st.feito = true; salvarSessao();
            const r0 = melhorReps(ex.nome);
            if (ex.unid === "reps" && st.tipo !== "A" && r0 && st.v > r0.v) toast("Novo recorde em " + ex.nome + ": " + st.v + "! 🔥");
            if (ex.descanso > 0) iniciarDescanso(ex.descanso);
          } else { st.feito = false; salvarSessao(); }
          renderSessao(); resumoSessao();
        };
        c.appendChild(row);
      });
      const add = document.createElement("button"); add.type = "button"; add.className = "ghost"; add.textContent = "+ série";
      add.onclick = () => { const l = ex.sets[ex.sets.length - 1]; ex.sets.push({ tipo: l && l.tipo !== "A" ? l.tipo : "N", alvo: l ? l.alvo : null, kgAlvo: l ? l.kgAlvo : null, v: null, kg: l ? l.kg : null, feito: false }); salvarSessao(); renderSessao(); };
      c.appendChild(add);
      c.querySelectorAll("[data-mv]").forEach((b) => (b.onclick = () => { const j = ei + Number(b.dataset.mv); if (j < 0 || j >= sessao.exs.length) return; const a = sessao.exs; [a[ei], a[j]] = [a[j], a[ei]]; salvarSessao(); renderSessao(); }));
      c.querySelector("[data-rm]").onclick = () => { sessao.exs.splice(ei, 1); salvarSessao(); renderSessao(); };
      box.appendChild(c);
    });
    resumoSessao();
  }
  function resumoSessao() {
    if (!sessao) return;
    let feitas = 0, vol = 0;
    sessao.exs.forEach((ex) => ex.sets.forEach((s) => { if (s.feito) { feitas++; if (s.kg && ex.unid === "reps") vol += s.kg * (s.v || 0); } }));
    $("sResumo").textContent = feitas + (feitas === 1 ? " série feita" : " séries feitas");
    $("sVolume").textContent = vol ? fmtKg(vol).replace(",0", "") + " kg de carga extra" : "";
  }
  $("sNota").addEventListener("input", () => { if (sessao) { sessao.nota = $("sNota").value; salvarSessao(); } });
  $("sNovoGo").addEventListener("click", () => { const n = $("sNovo").value.trim(); if (!n) return; sessao.exs.push(novoEx(n)); $("sNovo").value = ""; salvarSessao(); renderSessao(); });

  $("sDescartar").addEventListener("click", () => {
    const b = $("sDescartar");
    if (b.dataset.c !== "1") { b.dataset.c = "1"; b.textContent = "Toque de novo para descartar"; setTimeout(() => { b.dataset.c = ""; b.textContent = "Descartar treino"; }, 3000); return; }
    sessao = null; store.set(null); pararDescanso(); treinoModo("hub"); toast("Treino descartado.");
  });
  $("sFinalizar").addEventListener("click", async () => {
    const feitos = [];
    sessao.exs.forEach((ex, oi) => { let k = 0; ex.sets.forEach((s) => { if (!s.feito) return; k++; feitos.push({ ex, oi, s, k }); }); });
    if (!feitos.length) { toast("Marque pelo menos uma série com ✓ antes de finalizar."); return; }
    const b = $("sFinalizar"); b.disabled = true;
    try {
      const dur = Math.round((Date.now() - sessao.inicio) / 1000);
      const notaBase = [sessao.nome !== "Treino livre" ? sessao.nome : "", sessao.nota].filter(Boolean).join(" — ");
      const existente = treinos.find((t) => t.data === sessao.data && t.tipo === "mu");
      let tid, ordemBase = 0;
      if (existente) {
        tid = existente.id; ordemBase = existente.series.reduce((m, s) => Math.max(m, s.ordem + 1), 0);
        const up = { nota: [existente.nota, notaBase].filter(Boolean).join(" · ") || null };
        if (bancoNovo) up.duracao_seg = (existente.duracao_seg || 0) + dur;
        const r = await sb.from("treinos").update(up).eq("id", tid); if (r.error) throw r.error;
      } else {
        const row = { user_id: user.id, data: sessao.data, tipo: "mu", nota: notaBase || null };
        if (bancoNovo) row.duracao_seg = dur;
        const r = await sb.from("treinos").insert(row).select("id").single(); if (r.error) throw r.error; tid = r.data.id;
      }
      const linhas = feitos.map(({ ex, oi, s, k }) => {
        const l = { user_id: user.id, treino_id: tid, exercicio: ex.nome, ordem: ordemBase + oi, serie: k,
          reps: ex.unid === "reps" ? (s.v != null ? Math.round(s.v) : null) : null,
          segundos: ex.unid === "seg" ? (s.v != null ? Math.round(s.v) : null) : null, carga_kg: s.kg };
        if (bancoNovo) l.tipo_serie = s.tipo;
        return l;
      });
      const ins = await sb.from("series").insert(linhas); if (ins.error) throw ins.error;
      const antes = { b: melhorReps("Barra pronada"), f: melhorReps("Flexão") };
      sessao = null; store.set(null); pararDescanso();
      await loadAll();
      const dep = { b: melhorReps("Barra pronada"), f: melhorReps("Flexão") };
      let msg = "Treino salvo: " + feitos.length + " séries em " + fmtT(dur) + ".";
      if (dep.b && (!antes.b || dep.b.v > antes.b.v)) msg = "Recorde de barras: " + dep.b.v + "! 🔥 Treino salvo.";
      else if (dep.f && (!antes.f || dep.f.v > antes.f.v)) msg = "Recorde de flexões: " + dep.f.v + "! 🔥 Treino salvo.";
      toast(msg); go("tabHome");
    } catch (err) { toast("Não salvou: " + ((err && err.message) || "tente de novo") + ". Seu treino continua aqui."); }
    b.disabled = false;
  });

  // ---------- cronômetro de descanso ----------
  let audio = null;
  function bip() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25, 0.5].forEach((t) => { const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
        g.gain.setValueAtTime(0.0001, audio.currentTime + t); g.gain.exponentialRampToValueAtTime(0.4, audio.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.18);
        o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.2); });
    } catch (e) {}
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
  }
  function iniciarDescanso(seg) {
    try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === "suspended") audio.resume(); } catch (e) {} // destrava o som no iPhone (precisa de um toque)
    descanso = { fim: Date.now() + seg * 1000, total: seg, avisou: false };
    try { localStorage.setItem("ft_desc", JSON.stringify(descanso)); } catch (e) {}
    $("restBar").hidden = false; $("restBar").classList.remove("fim"); document.body.classList.add("resting"); tick();
  }
  function pararDescanso() { descanso = null; try { localStorage.removeItem("ft_desc"); } catch (e) {} $("restBar").hidden = true; document.body.classList.remove("resting"); }
  $("restMenos").addEventListener("click", () => { if (descanso) { descanso.fim -= 15000; descanso.total = Math.max(1, descanso.total - 15); tick(); } });
  $("restMais").addEventListener("click", () => { if (descanso) { descanso.fim = Math.max(descanso.fim, Date.now()) + 15000; descanso.total += 15; descanso.avisou = false; $("restBar").classList.remove("fim"); tick(); } });
  $("restPular").addEventListener("click", pararDescanso);

  function atualizarBanner() {
    const mostrar = !!sessao && !(tab === "tabTreino" && modo === "sessao");
    $("sessBanner").hidden = !mostrar;
  }
  $("sessBanner").addEventListener("click", () => { draft = null; go("tabTreino"); treinoModo("sessao"); });

  function tick() {
    if (sessao) {
      const t = fmtT((Date.now() - sessao.inicio) / 1000);
      $("sTempo").textContent = t; $("sessBannerT").textContent = t;
    }
    if (descanso) {
      const rest = (descanso.fim - Date.now()) / 1000;
      if (rest <= 0) {
        $("restTxt").textContent = "Bora!"; $("restFill").style.width = "100%"; $("restBar").classList.add("fim");
        if (!descanso.avisou) { descanso.avisou = true; bip(); toast("Descanso acabou: hora da próxima série."); setTimeout(() => { if (descanso && descanso.avisou) pararDescanso(); }, 4000); }
      } else {
        $("restTxt").textContent = fmtT(rest);
        $("restFill").style.width = Math.max(0, Math.min(100, (rest / descanso.total) * 100)) + "%";
      }
    }
    atualizarBanner();
  }
  setInterval(tick, 500);

  // retoma um treino que ficou aberto (app fechado no meio do treino)
  (function retomar() {
    const s = store.get();
    if (s && s.exs && Date.now() - s.inicio < 12 * 3600 * 1000) { sessao = s; }
    else if (s) store.set(null);
    try { const d = JSON.parse(localStorage.getItem("ft_desc") || "null"); if (sessao && d && d.fim > Date.now()) { descanso = d; $("restBar").hidden = false; document.body.classList.add("resting"); } } catch (e) {}
  })();

  document.addEventListener("visibilitychange", () => { if (!document.hidden && user) loadAll(); });
})();
