(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  var STATES = [{ slug: "va", name: "Virginia" }, { slug: "tx", name: "Texas" }];
  var ORDER = ["transit", "novehicle", "renters", "rentstress", "income", "electric", "population"];
  var REL_TEXT = {
    good: "Solid estimate",
    caution: "Use with care",
    low: "Shaky estimate",
    unknown: "Top income group"
  };
  var REL_ORDER = { good: 0, caution: 1, low: 2, unknown: 3 };
  var W = 800;

  var state = { s: "va", m: "transit", d: "", v: "map", shaky: true, sort: { key: "rank", dir: 1 } };
  var indicators = null;
  var cache = {};
  var cur = null;        // the loaded state: { meta, districts, byId, geo }
  var proj = null, path = null, H = 600;
  var svg, viewport, shapesG, shakyG, zoom;
  var classOf = {};      // district id -> 0..4 for the current measure
  var breaks = [];

  // ---------------------------------------------------------------- formatting

  function ordinal(n) {
    var v = n % 100;
    if (v >= 11 && v <= 13) return n + "th";
    return n + (["th", "st", "nd", "rd"][n % 10] || "th");
  }

  function fmtValue(key, v) {
    if (!v) return "n/a";
    if (key === "income") return v.topCoded ? "$250,000 or more" : "$" + Math.round(v.est).toLocaleString("en-US");
    if (key === "population") return Math.round(v.est).toLocaleString("en-US");
    return v.est.toFixed(1) + "%";
  }

  function fmtShort(key, n) {
    if (key === "income") return "$" + Math.round(n).toLocaleString("en-US");
    if (key === "population") return Math.round(n).toLocaleString("en-US");
    return n.toFixed(1) + "%";
  }

  function fmtMoe(key, v) {
    if (!v) return "";
    if (v.moe === null) return "no margin possible";
    if (v.moe === 0) return "official count";
    if (key === "income") return "±$" + Math.round(v.moe).toLocaleString("en-US");
    if (key === "population") return "±" + Math.round(v.moe).toLocaleString("en-US");
    return "±" + v.moe.toFixed(1) + " points";
  }

  function unitText(key) { return indicators[key].unit; }

  // ---------------------------------------------------------------- loading

  function loadJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("Couldn't load " + url);
      return r.json();
    });
  }

  function loadState(slug) {
    if (cache[slug]) return Promise.resolve(cache[slug]);
    return Promise.all([loadJson("data/" + slug + ".json"), loadJson("data/" + slug + "-map.json")]).then(function (r) {
      var byId = {};
      r[0].districts.forEach(function (d) { byId[d.id] = d; });
      cache[slug] = { meta: r[0], districts: r[0].districts, byId: byId, geo: r[1] };
      return cache[slug];
    });
  }

  // ---------------------------------------------------------------- hash

  function readHash() {
    var q = new URLSearchParams(location.hash.slice(1));
    var s = q.get("s");
    if (STATES.some(function (x) { return x.slug === s; })) state.s = s;
    var m = q.get("m");
    if (indicators[m]) state.m = m;
    state.d = q.get("d") || "";
    state.v = q.get("v") === "table" ? "table" : "map";
  }

  function writeHash() {
    var q = new URLSearchParams();
    q.set("s", state.s);
    q.set("m", state.m);
    if (state.d) q.set("d", state.d);
    if (state.v === "table") q.set("v", "table");
    try { history.replaceState(null, "", location.pathname + location.search + "#" + q.toString()); } catch (e) { /* some browsers refuse this on a file */ }
  }

  // ---------------------------------------------------------------- the measure: classes and legend

  function computeClasses() {
    var vals = cur.districts.map(function (d) { return d.values[state.m].est; });
    var sorted = vals.slice().sort(d3.ascending);
    var n = sorted.length;
    breaks = [1, 2, 3, 4].map(function (i) { return sorted[Math.floor((i * n) / 5)]; });
    classOf = {};
    var ranges = [[Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity]];
    cur.districts.forEach(function (d) {
      var v = d.values[state.m].est;
      var c = d3.bisectRight(breaks, v);
      classOf[d.id] = c;
      ranges[c][0] = Math.min(ranges[c][0], v);
      ranges[c][1] = Math.max(ranges[c][1], v);
    });
    return ranges;
  }

  function renderLegend(ranges) {
    var html = "";
    ranges.forEach(function (r, i) {
      if (r[0] === Infinity) return;
      var label = r[0] === r[1] ? fmtShort(state.m, r[0]) : fmtShort(state.m, r[0]) + " to " + fmtShort(state.m, r[1]);
      html += '<div class="item"><span class="swatch c' + i + '"></span>' + esc(label) + "</div>";
    });
    if (state.shaky) html += '<div class="item"><span class="swatch shaky"></span>Shaky estimate</div>';
    $("legend").innerHTML = html;
  }

  // ---------------------------------------------------------------- the map

  function buildMap() {
    svg = d3.select("#map");
    svg.selectAll("*").remove();

    var b = cur.meta.bounds;
    var lonC = (b[0] + b[2]) / 2, latC = (b[1] + b[3]) / 2, span = b[3] - b[1];
    proj = d3.geoConicConformal().rotate([-lonC, 0]).center([0, latC]).parallels([b[1] + span / 6, b[3] - span / 6]);
    // fitWidth sets the scale from the width alone and puts the top of the map at the top.
    // (fitExtent would centre the map in a huge box, which is how a first attempt ended up 50,000 pixels down.)
    proj.fitWidth(W - 20, cur.geo);
    var t = proj.translate();
    proj.translate([t[0] + 10, t[1] + 10]);
    path = d3.geoPath(proj);
    var pb = path.bounds(cur.geo);
    H = Math.ceil(pb[1][1] + 10);
    svg.attr("viewBox", "0 0 " + W + " " + H);

    var defs = svg.append("defs");
    // Light diagonal stripes in two tones, so they show up on every shade of blue without hiding it.
    var pat = defs.append("pattern").attr("id", "hatch").attr("width", 9).attr("height", 9)
      .attr("patternUnits", "userSpaceOnUse").attr("patternTransform", "rotate(45)");
    pat.append("rect").attr("width", 9).attr("height", 9).attr("fill", "none");
    pat.append("line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 9).attr("stroke", "var(--hatch-a)").attr("stroke-width", 1.3).attr("stroke-opacity", 0.55);
    pat.append("line").attr("x1", 4.5).attr("y1", 0).attr("x2", 4.5).attr("y2", 9).attr("stroke", "var(--hatch-b)").attr("stroke-width", 1.3).attr("stroke-opacity", 0.7);

    viewport = svg.append("g").attr("id", "viewport");
    shapesG = viewport.append("g");
    shakyG = viewport.append("g");

    var feats = cur.geo.features.slice().sort(function (a, c) { return a.id < c.id ? -1 : 1; });
    shapesG.selectAll("path").data(feats).enter().append("path")
      .attr("class", "district")
      .attr("id", function (f) { return "d-" + f.id; })
      .attr("d", path)
      .attr("tabindex", 0)
      .attr("role", "button")
      .on("click", function (e, f) { select(f.id, {}); })
      .on("keydown", function (e, f) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(f.id, {}); }
      })
      .on("pointerenter pointermove", function (e, f) { showTip(e, f.id); })
      .on("pointerleave", hideTip)
      .on("focus", function (e, f) { showTipAt(f.id); })
      .on("blur", hideTip);

    // Zoom: buttons, two finger pinch, and Ctrl + scroll. One finger still scrolls the page.
    zoom = d3.zoom()
      .scaleExtent([1, 18])
      .extent([[0, 0], [W, H]])
      .translateExtent([[0, 0], [W, H]])
      .filter(function (e) {
        if (e.type === "wheel") return e.ctrlKey || e.metaKey;
        if (e.touches) return e.touches.length >= 2;
        return !e.button;
      })
      .on("zoom", function (e) { viewport.attr("transform", e.transform); });
    svg.call(zoom);
  }

  function updateMap() {
    var ranges = computeClasses();
    var key = state.m;
    shapesG.selectAll("path.district")
      .attr("class", function (f) {
        return "district c" + classOf[f.id] + (f.id === state.d ? " selected" : "");
      })
      .attr("aria-label", function (f) {
        var d = cur.byId[f.id], v = d.values[key];
        return d.name + ": " + fmtValue(key, v) + ", " + (v.rel === "low" ? "shaky estimate, " : "") + "rank " + v.rank + " of " + cur.districts.length + ". Press Enter to select.";
      });

    shakyG.selectAll("*").remove();
    if (state.shaky) {
      var lows = cur.geo.features.filter(function (f) { return cur.byId[f.id].values[key].rel === "low"; });
      shakyG.selectAll("path").data(lows).enter().append("path").attr("class", "shaky").attr("d", path);
    }
    renderLegend(ranges);

    var sorted = cur.districts.slice().sort(function (a, c) { return c.values[key].est - a.values[key].est; });
    var hi = sorted[0], lo = sorted[sorted.length - 1];
    $("map-summary").textContent = "Map of " + cur.districts.length + " " + cur.meta.state + " state House districts, shaded by " +
      indicators[key].label.toLowerCase() + ". Highest: " + hi.name + " (" + fmtValue(key, hi.values[key]) + "). Lowest: " + lo.name + " (" + fmtValue(key, lo.values[key]) + ").";
    $("map-h").textContent = indicators[key].label + " by district, " + cur.meta.state + " (" + unitText(key) + ")";
  }

  function zoomTo(id) {
    var f = cur.geo.features.filter(function (x) { return x.id === id; })[0];
    if (!f) return;
    var b = path.bounds(f);
    var dx = b[1][0] - b[0][0], dy = b[1][1] - b[0][1];
    var x = (b[0][0] + b[1][0]) / 2, y = (b[0][1] + b[1][1]) / 2;
    var k = Math.max(1, Math.min(14, 0.7 / Math.max(dx / W, dy / H)));
    var t = d3.zoomIdentity.translate(W / 2 - k * x, H / 2 - k * y).scale(k);
    svg.transition().duration(500).call(zoom.transform, t);
  }

  // ---------------------------------------------------------------- tooltip

  function tipHtml(id) {
    var d = cur.byId[id], v = d.values[state.m];
    return "<strong>" + esc(d.name) + "</strong><span>" + esc(indicators[state.m].label) + ": </span>" + esc(fmtValue(state.m, v)) +
      (v.moe ? " <span>" + esc(fmtMoe(state.m, v)) + "</span>" : "");
  }

  function placeTip(x, y) {
    var tip = $("tip"), wrap = tip.parentNode.getBoundingClientRect();
    var tx = x - wrap.left + 12, ty = y - wrap.top + 12;
    tx = Math.min(tx, wrap.width - tip.offsetWidth - 6);
    if (tx < 6) tx = 6;
    if (ty + tip.offsetHeight > wrap.height - 6) ty = y - wrap.top - tip.offsetHeight - 12;
    tip.style.left = tx + "px";
    tip.style.top = Math.max(6, ty) + "px";
  }

  function showTip(e, id) {
    var tip = $("tip");
    tip.innerHTML = tipHtml(id);
    tip.hidden = false;
    placeTip(e.clientX, e.clientY);
  }

  function showTipAt(id) {
    var el = $("d-" + id), tip = $("tip");
    tip.innerHTML = tipHtml(id);
    tip.hidden = false;
    var r = el.getBoundingClientRect();
    placeTip(r.left + r.width / 2, r.top + r.height / 2);
  }

  function hideTip() { $("tip").hidden = true; }

  // ---------------------------------------------------------------- details

  function renderDetails() {
    var body = $("details-body");
    if (!state.d || !cur.byId[state.d]) {
      body.innerHTML = '<p class="empty">Pick a district on the map, in the table, or from the "Go to a district" list to see all its numbers here.</p>';
      return;
    }
    var d = cur.byId[state.d], key = state.m, v = d.values[key], n = cur.districts.length;

    var html = "<h3>" + esc(d.name) + ", " + esc(cur.meta.state) + "</h3>";
    html += '<p class="hint">' + esc(indicators[key].label) + " (" + esc(unitText(key)) + ")</p>";
    html += '<p class="big">' + esc(fmtValue(key, v)) + "</p>";
    html += '<p class="hint">' + esc(fmtMoe(key, v)) + "</p>";
    html += '<p><span class="badge ' + v.rel + '">' + esc(REL_TEXT[v.rel]) + "</span></p>";
    if (v.rel === "low") html += '<p class="hint">The margin of error is large compared with the estimate, so the true figure could be quite different. Treat the exact number with caution.</p>';
    if (v.topCoded) html += '<p class="hint">The Census groups every household income above this level together, so it can only say "this much or more".</p>';
    var where = v.pct === 100 ? "the highest in the state" : v.pct === 0 ? "the lowest in the state" : "higher than " + v.pct + "% of the other districts";
    html += '<p>Ranks <strong>' + esc(ordinal(v.rank)) + "</strong> highest of " + n + " districts, " + where + ".</p>";
    html += '<div class="rankbar" role="img" aria-label="Position among the state\'s districts: higher than ' + v.pct + ' percent"><i style="left:' + v.pct + '%"></i></div>';
    html += '<p class="hint" style="display:flex;justify-content:space-between;margin-top:4px"><span>Lowest</span><span>Highest</span></p>';

    html += '<h3>All measures for this district</h3><table class="measures"><thead><tr><th scope="col">Measure</th><th scope="col">Value</th><th scope="col">Rank</th></tr></thead><tbody>';
    ORDER.forEach(function (k) {
      var x = d.values[k];
      html += '<tr class="' + (k === key ? "current" : "") + '"><th scope="row">' + esc(indicators[k].label) + "</th><td>" + esc(fmtValue(k, x)) +
        (x.moe ? '<br><span class="hint">' + esc(fmtMoe(k, x)) + "</span>" : "") + '</td><td class="num">' + esc(ordinal(x.rank)) + "</td></tr>";
    });
    html += "</tbody></table>";

    html += '<p style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">';
    if (state.v === "map") html += '<button type="button" class="btn" id="zoom-district">Zoom to this district</button>';
    html += '<button type="button" class="btn ghost" id="clear-district">Clear</button></p>';
    body.innerHTML = html;
  }

  // ---------------------------------------------------------------- table

  function renderTable() {
    var key = state.m;
    var cols = [
      { id: "number", label: "District" },
      { id: "est", label: indicators[key].label },
      { id: "moe", label: "Margin of error" },
      { id: "rel", label: "How solid" },
      { id: "rank", label: "Rank" }
    ];
    var thead = $("table").tHead;
    thead.innerHTML = "<tr>" + cols.map(function (c) {
      var sort = state.sort.key === c.id ? (state.sort.dir === 1 ? "ascending" : "descending") : "none";
      return '<th scope="col" aria-sort="' + sort + '"><button type="button" data-sort="' + c.id + '">' + esc(c.label) + "</button></th>";
    }).join("") + "</tr>";

    var val = function (d, id) {
      var v = d.values[key];
      if (id === "number") return d.number;
      if (id === "est") return v.est;
      if (id === "moe") return v.moe === null ? Infinity : v.moe;
      if (id === "rel") return REL_ORDER[v.rel];
      return v.rank;
    };
    var rows = cur.districts.slice().sort(function (a, c) {
      var x = val(a, state.sort.key), y = val(c, state.sort.key);
      return (x < y ? -1 : x > y ? 1 : a.number - c.number) * state.sort.dir;
    });

    $("table").tBodies[0].innerHTML = rows.map(function (d) {
      var v = d.values[key];
      return '<tr class="' + (d.id === state.d ? "selected" : "") + '"><td><button type="button" data-pick="' + esc(d.id) + '">' + esc(d.name) + "</button></td>" +
        '<td class="num">' + esc(fmtValue(key, v)) + '</td><td class="num">' + esc(fmtMoe(key, v)) + "</td><td>" + esc(REL_TEXT[v.rel]) + '</td><td class="num">' + v.rank + "</td></tr>";
    }).join("");
  }

  // ---------------------------------------------------------------- state changes

  function setView(v) {
    state.v = v;
    $("map-view").hidden = v !== "map";
    $("table-view").hidden = v !== "table";
    $("view-map").setAttribute("aria-pressed", String(v === "map"));
    $("view-table").setAttribute("aria-pressed", String(v === "table"));
    if (v === "table") renderTable();
    renderDetails();
    writeHash();
  }

  function select(id, opts) {
    state.d = id || "";
    // A short spoken message, instead of re-reading the whole details panel.
    if (state.d) {
      var dd = cur.byId[state.d];
      $("status").textContent = dd.name + " selected. " + indicators[state.m].label + ": " + fmtValue(state.m, dd.values[state.m]) + ". Details are below the map.";
    }
    shapesG.selectAll("path.district").classed("selected", function (f) { return f.id === state.d; });
    $("jump").value = state.d;
    renderDetails();
    if (state.v === "table") renderTable();
    writeHash();
    if (opts && opts.zoom) zoomTo(id);
    if (opts && opts.focus) $("details").focus();
  }

  function applyMeasure() {
    $("measure").value = state.m;
    $("measure-what").textContent = indicators[state.m].what;
    updateMap();
    renderTable();
    renderDetails();
    writeHash();
    $("status").textContent = "Showing " + indicators[state.m].label.toLowerCase() + " for " + cur.meta.state + ".";
  }

  function applyState(slug, keepDistrict) {
    return loadState(slug).then(function (data) {
      state.s = slug;
      cur = data;
      if (!keepDistrict || !cur.byId[state.d]) state.d = "";
      Array.prototype.forEach.call($("state-buttons").children, function (b) {
        b.setAttribute("aria-pressed", String(b.dataset.slug === slug));
      });
      $("jump").innerHTML = '<option value="">Choose a district</option>' + cur.districts.map(function (d) {
        return '<option value="' + esc(d.id) + '">' + esc(d.name) + "</option>";
      }).join("");
      $("jump").value = state.d;
      $("sources").textContent = "Numbers: " + cur.meta.source + " (fetched " + cur.meta.acsFetched + "). Shapes: " + cur.meta.boundaries + ". Margins of error are at the 90 percent confidence level.";
      buildMap();
      applyMeasure();
      if (state.d) select(state.d, {});
      $("status").textContent = "Showing " + cur.meta.state + ".";
    });
  }

  // ---------------------------------------------------------------- start

  function wire() {
    $("state-buttons").innerHTML = STATES.map(function (s) {
      return '<button type="button" data-slug="' + s.slug + '" aria-pressed="false">' + esc(s.name) + "</button>";
    }).join("");
    $("measure").innerHTML = ORDER.map(function (k) {
      return '<option value="' + k + '">' + esc(indicators[k].label) + "</option>";
    }).join("");

    $("state-buttons").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-slug]");
      if (!b || b.dataset.slug === state.s) return;
      state.d = "";
      applyState(b.dataset.slug, false);
    });
    $("measure").addEventListener("change", function (e) { state.m = e.target.value; applyMeasure(); });
    $("jump").addEventListener("change", function (e) { if (e.target.value) select(e.target.value, { zoom: state.v === "map" }); });
    $("view-map").addEventListener("click", function () { setView("map"); });
    $("view-table").addEventListener("click", function () { setView("table"); });
    $("show-shaky").addEventListener("change", function (e) { state.shaky = e.target.checked; updateMap(); });

    $("zoom-in").addEventListener("click", function () { svg.transition().duration(250).call(zoom.scaleBy, 1.7); });
    $("zoom-out").addEventListener("click", function () { svg.transition().duration(250).call(zoom.scaleBy, 1 / 1.7); });
    $("zoom-reset").addEventListener("click", function () { svg.transition().duration(350).call(zoom.transform, d3.zoomIdentity); });

    $("table").addEventListener("click", function (e) {
      var s = e.target.closest("button[data-sort]");
      if (s) {
        var id = s.dataset.sort;
        state.sort = state.sort.key === id ? { key: id, dir: -state.sort.dir } : { key: id, dir: id === "est" ? -1 : 1 };
        renderTable();
        return;
      }
      var p = e.target.closest("button[data-pick]");
      if (p) select(p.dataset.pick, { focus: true });
    });

    $("details").addEventListener("click", function (e) {
      if (e.target.id === "zoom-district") zoomTo(state.d);
      if (e.target.id === "clear-district") { select("", {}); svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity); }
    });

    window.addEventListener("hashchange", function () {
      var before = state.s;
      readHash();
      applyState(state.s, true).then(function () { setView(state.v); });
      if (before === state.s) { /* same state: applyState still refreshes the measure and selection */ }
    });
  }

  function start() {
    loadJson("data/indicators.json").then(function (ind) {
      indicators = ind;
      readHash();
      wire();
      return applyState(state.s, true);
    }).then(function () {
      setView(state.v);
    }).catch(function (e) {
      $("details-body").innerHTML = '<p class="empty">The page couldn\'t load its data. ' + esc(e.message) + "</p>";
    });
  }

  start();
})();
