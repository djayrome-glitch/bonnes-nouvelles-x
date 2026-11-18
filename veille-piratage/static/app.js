/* Observatoire du piratage : rendu de la page et rafraîchissement automatique. */
(function () {
  "use strict";

  const REFRESH_MS = 60 * 1000;
  const FEED_STEP = 20;
  const DOMAIN_LABEL = { audiovisuel: "Audiovisuel", cyber: "Cyber" };
  const DOMAIN_VAR = { audiovisuel: "--av", cyber: "--cyber" };
  const SEV_LABEL = { 1: "Faible", 2: "Moyenne", 3: "Élevée", 4: "Critique" };

  const state = {
    data: null,
    world: null,
    filters: { domain: "all", days: 7, country: null },
    seen: null, // ids connus avant la dernière mise à jour
    fresh: new Set(), // ids apparus lors de la dernière mise à jour
    feedLimit: FEED_STEP,
  };

  // ---------- utilitaires ----------
  const $ = (id) => document.getElementById(id);
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const fmtNum = new Intl.NumberFormat("fr-FR");
  const fmtTime = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const fmtDay = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
  const fmtDayLong = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const fmtFull = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  let regionNames = null;
  try { regionNames = new Intl.DisplayNames(["fr"], { type: "region" }); } catch (e) { /* ancien navigateur */ }
  const countryName = (code) => { try { return (regionNames && regionNames.of(code)) || code; } catch (e) { return code; } };

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "style") node.style.cssText = v;
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c))); // texte toujours échappé
    }
    return node;
  }

  function ago(iso) {
    const s = (new Date(iso) - Date.now()) / 1000;
    const a = Math.abs(s);
    if (a < 60) return "à l'instant";
    if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
    if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
    return rtf.format(Math.round(s / 86400), "day");
  }

  function save() {
    try { localStorage.setItem("observatoire-filtres", JSON.stringify(state.filters)); } catch (e) { /* stockage indisponible */ }
  }
  function load() {
    try {
      const f = JSON.parse(localStorage.getItem("observatoire-filtres") || "null");
      if (f && ["all", "audiovisuel", "cyber"].includes(f.domain) && [1, 7, 30].includes(f.days)) {
        state.filters.domain = f.domain;
        state.filters.days = f.days;
      }
    } catch (e) { /* stockage indisponible */ }
  }

  // ---------- infobulle ----------
  const tip = $("tip");
  function showTip(evt, title, rows) {
    tip.replaceChildren(
      el("div", { class: "t" }, title),
      ...rows.map((r) => el("div", { class: "r" },
        r.color ? el("i", { style: `background:${r.color}` }) : null,
        el("b", {}, r.value), el("span", {}, r.label)))
    );
    tip.hidden = false;
    const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    let x = evt.clientX + pad, y = evt.clientY + pad;
    if (x + w > window.innerWidth - 8) x = evt.clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = evt.clientY - h - pad;
    tip.style.left = Math.max(8, x) + "px";
    tip.style.top = Math.max(8, y) + "px";
  }
  const hideTip = () => { tip.hidden = true; };

  // ---------- filtres ----------
  function inPeriod(ev) {
    return new Date(ev.published_at) >= Date.now() - state.filters.days * 86400000;
  }
  function events({ withCountry = true } = {}) {
    if (!state.data) return [];
    const f = state.filters;
    return state.data.events.filter((ev) =>
      inPeriod(ev) &&
      (f.domain === "all" || ev.domain === f.domain) &&
      (!withCountry || !f.country || ev.countries.includes(f.country)));
  }
  const activeDomains = () => (state.filters.domain === "all" ? ["audiovisuel", "cyber"] : [state.filters.domain]);

  function bindSeg(id, key, parse) {
    const seg = $(id);
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      state.filters[key] = parse(b.dataset.v);
      state.feedLimit = FEED_STEP;
      save();
      render();
    });
  }
  function syncSeg(id, value) {
    for (const b of $(id).querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.v === String(value)));
  }
  function setCountry(code) {
    state.filters.country = state.filters.country === code ? null : code;
    state.feedLimit = FEED_STEP;
    render();
  }

  // ---------- rendu ----------
  function renderSummary() {
    const s = state.data.summary;
    if (!s) return;
    $("summary-text").textContent = s.text;
    $("summary-when").textContent = `Rédigée par IA le ${fmtFull.format(new Date(s.created_at))}, à partir de ${s.n_events} événement(s).`;
  }

  function renderTiles(list) {
    const by = (d) => list.filter((e) => e.domain === d).length;
    $("t-total").textContent = fmtNum.format(list.length);
    $("t-total-split").textContent = state.filters.domain === "all"
      ? `${fmtNum.format(by("audiovisuel"))} audiovisuel · ${fmtNum.format(by("cyber"))} cyber` : DOMAIN_LABEL[state.filters.domain];
    const severe = list.filter((e) => e.severity >= 3);
    $("t-severe").textContent = fmtNum.format(severe.length);
    $("t-severe-split").textContent = `dont ${fmtNum.format(severe.filter((e) => e.severity === 4).length)} critique(s)`;
    const cc = new Map();
    for (const e of list) for (const c of e.countries) cc.set(c, (cc.get(c) || 0) + 1);
    $("t-countries").textContent = fmtNum.format(cc.size);
    const top = [...cc.entries()].sort((a, b) => b[1] - a[1])[0];
    $("t-countries-split").textContent = top ? `le plus cité : ${countryName(top[0])}` : "";
    const sources = new Set(list.map((e) => e.source));
    $("t-sources").textContent = fmtNum.format(sources.size);
    $("t-sources-split").textContent = "médias différents";
  }

  function countByCountry(list) {
    const m = new Map();
    for (const e of list) for (const c of e.countries) {
      const r = m.get(c) || { code: c, total: 0, audiovisuel: 0, cyber: 0 };
      r.total++; r[e.domain]++;
      m.set(c, r);
    }
    return m;
  }

  function domainRows(r) {
    return activeDomains().map((d) => ({ color: css(DOMAIN_VAR[d]), value: fmtNum.format(r[d]), label: DOMAIN_LABEL[d] }));
  }

  function legend(target) {
    const doms = activeDomains();
    target.replaceChildren(...(doms.length > 1
      ? doms.map((d) => el("span", {}, el("span", { class: "key", style: `background:var(${DOMAIN_VAR[d]})` }), DOMAIN_LABEL[d]))
      : []));
  }

  function renderMap(list) {
    const box = $("map");
    if (!state.world) { box.textContent = "Chargement de la carte…"; return; }
    const counts = countByCountry(list);
    const codes = state.data.codes;
    const byNum = new Map();
    for (const r of counts.values()) if (codes[r.code]) byNum.set(codes[r.code], r);
    const max = Math.max(0, ...[...byNum.values()].map((r) => r.total));
    const steps = ["--seq-1", "--seq-2", "--seq-3", "--seq-4", "--seq-5"].map(css);
    const stepOf = (n) => Math.min(5, Math.max(1, Math.ceil((n / max) * 5)));

    const W = 960, H = 440;
    const svg = d3.create("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img")
      .attr("aria-label", "Carte du monde des événements par pays");
    const proj = d3.geoNaturalEarth1().fitExtent([[4, 4], [W - 4, H - 4]], state.world.fc);
    const path = d3.geoPath(proj);
    svg.append("g").selectAll("path").data(state.world.fc.features).join("path")
      .attr("d", path)
      .attr("class", (f) => {
        const r = byNum.get(f.id);
        let c = "country" + (r ? "" : " empty");
        if (r && r.code === state.filters.country) c += " selected";
        return c;
      })
      .attr("fill", (f) => { const r = byNum.get(f.id); return r ? steps[stepOf(r.total) - 1] : css("--land-empty"); })
      .on("pointermove", (evt, f) => {
        const r = byNum.get(f.id);
        if (!r) { showTip(evt, f.properties.name, [{ value: "0", label: "événement" }]); return; }
        showTip(evt, countryName(r.code), [{ value: fmtNum.format(r.total), label: "événement(s)" }, ...(activeDomains().length > 1 ? domainRows(r) : [])]);
      })
      .on("pointerleave", hideTip)
      .on("click", (evt, f) => { const r = byNum.get(f.id); if (r) setCountry(r.code); });
    box.replaceChildren(svg.node());

    // légende de la rampe
    const ramp = $("ramp");
    if (!max) { ramp.replaceChildren(el("span", {}, "Aucun pays identifié sur la période.")); return; }
    const parts = [el("span", {}, "Événements :")];
    for (let k = 1; k <= 5; k++) {
      const lo = Math.floor(((k - 1) * max) / 5) + 1, hi = Math.floor((k * max) / 5);
      if (lo > hi) continue;
      parts.push(el("span", { class: "sw", style: `background:${steps[k - 1]}` }), el("span", {}, lo === hi ? `${lo}` : `${lo}–${hi}`));
    }
    ramp.replaceChildren(...parts);
  }

  function renderRank(list) {
    const rows = [...countByCountry(list).values()].sort((a, b) => b.total - a.total).slice(0, 10);
    legend($("rank-legend"));
    const ol = $("rank");
    if (!rows.length) { ol.replaceChildren(el("li", { class: "empty" }, "Aucun pays identifié.")); return; }
    const max = rows[0].total;
    ol.replaceChildren(...rows.map((r) => {
      const li = el("li", { tabindex: "0", class: r.code === state.filters.country ? "selected" : null, role: "button",
        "aria-label": `${countryName(r.code)} : ${r.total} événement(s). Filtrer sur ce pays.` },
        el("span", { class: "name" }, countryName(r.code)),
        el("span", { class: "num" }, fmtNum.format(r.total)),
        el("span", { class: "bar" }, ...activeDomains().filter((d) => r[d]).map((d) =>
          el("span", { style: `width:${(r[d] / max) * 100}%;background:var(${DOMAIN_VAR[d]})` }))));
      li.addEventListener("click", () => setCountry(r.code));
      li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCountry(r.code); } });
      li.addEventListener("pointermove", (evt) => showTip(evt, countryName(r.code), domainRows(r)));
      li.addEventListener("pointerleave", hideTip);
      return li;
    }));
  }

  function bins() {
    const out = [];
    const now = new Date();
    if (state.filters.days === 1) {
      const end = new Date(now); end.setMinutes(0, 0, 0);
      for (let i = 23; i >= 0; i--) {
        const start = new Date(end.getTime() - i * 3600000);
        out.push({ start, end: new Date(start.getTime() + 3600000), label: fmtTime.format(start), long: `${fmtTime.format(start)} – ${fmtTime.format(new Date(start.getTime() + 3600000))}` });
      }
    } else {
      const today = new Date(now); today.setHours(0, 0, 0, 0);
      for (let i = state.filters.days - 1; i >= 0; i--) {
        const start = new Date(today); start.setDate(today.getDate() - i);
        const end = new Date(start); end.setDate(start.getDate() + 1);
        out.push({ start, end, label: fmtDay.format(start), long: fmtDayLong.format(start) });
      }
    }
    return out;
  }

  function roundedTop(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  function renderTimeline(list) {
    const box = $("timeline");
    const doms = activeDomains();
    legend($("time-legend"));
    $("time-hint").textContent = state.filters.days === 1 ? "Événements par heure, sur 24 heures." : `Événements par jour, sur ${state.filters.days} jours.`;
    const bs = bins();
    for (const b of bs) { b.audiovisuel = 0; b.cyber = 0; }
    for (const e of list) {
      const t = new Date(e.published_at);
      const b = bs.find((x) => t >= x.start && t < x.end);
      if (b) b[e.domain]++;
    }
    for (const b of bs) b.total = doms.reduce((s, d) => s + b[d], 0);

    const W = Math.max(280, box.clientWidth || 600), H = 210;
    const m = { l: 30, r: 6, t: 8, b: 22 };
    const x = d3.scaleBand().domain(bs.map((_, i) => i)).range([m.l, W - m.r]).paddingInner(0.2).paddingOuter(0.05);
    const ymax = Math.max(4, d3.max(bs, (b) => b.total));
    const y = d3.scaleLinear().domain([0, ymax]).nice(4).range([H - m.b, m.t]);
    const svg = d3.create("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("width", W).attr("height", H)
      .attr("role", "img").attr("aria-label", "Histogramme des événements dans le temps");
    svg.append("g").attr("class", "grid").selectAll("line").data(y.ticks(4).filter((t) => t > 0)).join("line")
      .attr("x1", m.l).attr("x2", W - m.r).attr("y1", (t) => y(t)).attr("y2", (t) => y(t));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(4).tickSize(0).tickPadding(6).tickFormat(d3.format("d"))).call((g) => g.select(".domain").remove());
    const every = Math.ceil(bs.length / Math.max(2, Math.floor((W - m.l) / 70)));
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).tickSize(0).tickPadding(6).tickFormat((i) => ((bs.length - 1 - i) % every === 0 ? bs[i].label : "")))
      .call((g) => g.select(".domain").attr("stroke", css("--line")));

    const marks = svg.append("g");
    const gap = 2;
    bs.forEach((b, i) => {
      let base = y(0);
      const segs = doms.filter((d) => b[d] > 0);
      segs.forEach((d, k) => {
        const h = y(0) - y(b[d]);
        const top = k === segs.length - 1;
        const hh = Math.max(1, h - (k > 0 ? gap : 0));
        const yy = base - h;
        marks.append("path")
          .attr("d", top ? roundedTop(x(i), yy, x.bandwidth(), hh, 4) : `M${x(i)},${yy}h${x.bandwidth()}v${hh}h${-x.bandwidth()}Z`)
          .attr("fill", css(DOMAIN_VAR[d]));
        base -= h;
      });
    });
    svg.append("g").selectAll("rect").data(bs).join("rect").attr("class", "hit")
      .attr("x", (_, i) => x(i) - (x.step() - x.bandwidth()) / 2).attr("width", x.step())
      .attr("y", m.t).attr("height", H - m.t - m.b)
      .on("pointermove", (evt, b) => showTip(evt, b.long, [
        ...(doms.length > 1 ? [{ value: fmtNum.format(b.total), label: "au total" }] : []),
        ...doms.map((d) => ({ color: css(DOMAIN_VAR[d]), value: fmtNum.format(b[d]), label: DOMAIN_LABEL[d] }))]))
      .on("pointerleave", hideTip);
    box.replaceChildren(svg.node());
  }

  function renderTypes(list) {
    const box = $("types");
    const groups = activeDomains().map((d) => {
      const m = new Map();
      for (const e of list) if (e.domain === d) m.set(e.type, (m.get(e.type) || 0) + 1);
      return { d, rows: [...m.entries()].sort((a, b) => b[1] - a[1]) };
    }).filter((g) => g.rows.length);
    if (!groups.length) { box.replaceChildren(el("div", { class: "empty" }, "Aucun événement sur la période.")); return; }
    const max = Math.max(...groups.flatMap((g) => g.rows.map((r) => r[1])));
    box.replaceChildren(...groups.map((g) => {
      const total = g.rows.reduce((s, r) => s + r[1], 0);
      return el("div", { class: "group" },
        el("h3", {}, state.data.domains[g.d]),
        ...g.rows.map(([type, n]) => {
          const row = el("div", { class: "row" },
            el("span", { class: "lbl", title: type }, type),
            el("span", { class: "track" }, el("span", { class: "fill", style: `display:block;width:${(n / max) * 100}%;background:var(${DOMAIN_VAR[g.d]})` })),
            el("span", { class: "v" }, fmtNum.format(n)));
          row.addEventListener("pointermove", (evt) => showTip(evt, type, [
            { color: css(DOMAIN_VAR[g.d]), value: fmtNum.format(n), label: `événement(s), ${Math.round((n / total) * 100)} % du domaine` }]));
          row.addEventListener("pointerleave", hideTip);
          return row;
        }));
    }));
  }

  function renderFeed(list) {
    const ol = $("feed");
    const shown = list.slice(0, state.feedLimit);
    if (!shown.length) {
      ol.replaceChildren(el("li", { class: "empty" }, state.data.last_cycle ? "Aucun événement pour ces filtres." : "Première collecte en cours, revenez dans quelques minutes."));
    } else {
      ol.replaceChildren(...shown.map((e) => el("li", {},
        el("div", { class: "meta" },
          state.fresh.has(e.id) ? el("span", { class: "new" }, "Nouveau") : null,
          el("time", { datetime: e.published_at, title: fmtFull.format(new Date(e.published_at)) }, ago(e.published_at)),
          el("span", { class: "dom" }, el("i", { style: `background:var(${DOMAIN_VAR[e.domain]})` }), DOMAIN_LABEL[e.domain]),
          el("span", {}, e.type),
          el("span", { class: `sev s${e.severity}` }, el("i", { style: `background:var(--sev-${e.severity})` }), SEV_LABEL[e.severity])),
        el("h4", {}, el("a", { href: /^https?:\/\//.test(e.url) ? e.url : "#", target: "_blank", rel: "noopener noreferrer" }, e.title)),
        e.summary ? el("p", {}, e.summary) : null,
        el("div", { class: "where" }, `${e.countries.length ? e.countries.map(countryName).join(", ") : "Mondial ou non précisé"} · ${e.source}`))));
    }
    $("more").hidden = list.length <= state.feedLimit;
  }

  function render() {
    syncSeg("f-domain", state.filters.domain);
    syncSeg("f-period", state.filters.days);
    const chip = $("f-country");
    chip.hidden = !state.filters.country;
    if (state.filters.country) $("f-country-name").textContent = countryName(state.filters.country);
    if (!state.data) return;
    const all = events({ withCountry: false });
    const list = events();
    renderSummary();
    renderTiles(list);
    renderMap(all);
    renderRank(all);
    renderTimeline(list);
    renderTypes(list);
    renderFeed(list);
  }

  // ---------- données ----------
  function setLive(ok, text) {
    const live = $("live");
    live.classList.toggle("ok", ok);
    live.classList.toggle("down", !ok);
    $("live-text").textContent = text;
  }

  let busy = false;
  async function refresh() {
    if (busy) return;
    busy = true;
    $("main").classList.add("refreshing");
    try {
      const r = await fetch("/api/state", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      const data = await r.json();
      const ids = new Set(data.events.map((e) => e.id));
      state.fresh = state.seen ? new Set([...ids].filter((id) => !state.seen.has(id))) : new Set();
      state.seen = ids;
      state.data = data;
      let text = `En direct · actualisé à ${fmtTime.format(new Date())}`;
      if (data.last_cycle) text += ` · collecte ${ago(data.last_cycle)}`;
      setLive(true, text);
      render();
    } catch (e) {
      setLive(false, "Connexion perdue · nouvel essai dans une minute");
    } finally {
      busy = false;
      $("main").classList.remove("refreshing");
    }
  }

  async function loadWorld() {
    try {
      const topo = await (await fetch("/static/vendor/countries-110m.json")).json();
      const fc = topojson.feature(topo, topo.objects.countries);
      fc.features = fc.features.filter((f) => f.id !== "010"); // sans l'Antarctique
      state.world = { fc };
      render();
    } catch (e) {
      $("map").textContent = "Carte indisponible.";
    }
  }

  // ---------- démarrage ----------
  load();
  bindSeg("f-domain", "domain", (v) => v);
  bindSeg("f-period", "days", (v) => Number(v));
  $("f-country").querySelector("button").addEventListener("click", () => setCountry(state.filters.country));
  $("more").querySelector("button").addEventListener("click", () => { state.feedLimit += FEED_STEP; render(); });
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => state.data && renderTimeline(events()), 150); });
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  if (mq.addEventListener) mq.addEventListener("change", render);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
  render();
  refresh();
  loadWorld();
})();
