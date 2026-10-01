(function () {
  "use strict";

  var DEFAULT_REQUIREMENTS = [
    "False ceiling in every bedroom",
    "Cot and headboard in the main bedrooms",
    "Kitchen false ceiling with focus light",
    "Pooja unit: backpanel, top, storage, lighting, false ceiling",
    "Shoe rack",
    "Lighting / electrical wiring scope stated clearly",
    "GST rate stated (should read 18% for this kind of work)",
    "Warranty terms stated",
    "Design / 3D rendering charge stated"
  ].join("\n");

  var EXAMPLE_VENDOR = {
    id: "ex1", name: "Example Vendor (sample — replace me)", isExample: true,
    status: "done", error: "", rawText: "", fileName: null,
    totals: { statedSubtotal: 184500, gstPercent: 18, statedGrandTotal: 217710 },
    paymentTerms: "50% advance, 40% on delivery, 10% on completion",
    warrantyText: null, designFeeNote: "Design & rendering: Rs 25,000",
    checklist: [
      { item: "False ceiling in every bedroom", present: false, evidence: "Only the master bedroom has a false ceiling line item." },
      { item: "Cot and headboard in the main bedrooms", present: false, evidence: "Not mentioned anywhere in the quote." },
      { item: "Kitchen false ceiling with focus light", present: false, evidence: "No kitchen false ceiling line item." },
      { item: "Pooja unit: backpanel, top, storage, lighting, false ceiling", present: false, evidence: "No pooja room section." },
      { item: "Shoe rack", present: false, evidence: "Not listed." },
      { item: "Lighting / electrical wiring scope stated clearly", present: false, evidence: "Living room item says lighting excluded; nothing stated elsewhere." },
      { item: "GST rate stated (should read 18% for this kind of work)", present: true, evidence: "\"GST @ 18%\" printed on the summary line." },
      { item: "Warranty terms stated", present: false, evidence: "No warranty clause in the document." },
      { item: "Design / 3D rendering charge stated", present: true, evidence: "\"Design & rendering: Rs 25,000\" listed under other charges." }
    ],
    items: [
      { id: "e1", room: "Master Bedroom", item: "Wardrobe, sliding, 2 lockers", category: "wardrobe", unit: "SFT", qty: 42, heightMm: null, widthMm: null, rate: 1350, amount: 56700 },
      { id: "e2", room: "Master Bedroom", item: "Loft over wardrobe", category: "loft", unit: "SFT", qty: 25, heightMm: null, widthMm: null, rate: 700, amount: 17500 },
      { id: "e3", room: "Master Bedroom", item: "False ceiling, POP, no electrical", category: "false_ceiling_shell", unit: "SFT", qty: 120, heightMm: null, widthMm: null, rate: 120, amount: 14400 },
      { id: "e4", room: "Kitchen", item: "Base unit, acrylic finish", category: "kitchen_base_acrylic", unit: "SFT", qty: 46.5, heightMm: null, widthMm: null, rate: 2500, amount: 116250 },
      { id: "e5", room: "Kitchen", item: "Tandem basket", category: "accessory", unit: "NOS", qty: 3, heightMm: null, widthMm: null, rate: 5000, amount: 15000 }
    ]
  };

  var state = {
    requirements: DEFAULT_REQUIREMENTS,
    categories: {},
    roomExpectations: {},
    vendors: [cloneVendor(EXAMPLE_VENDOR)],
    activeId: "ex1",
    floorplan: null // {status, error, rooms, summary, fileName}
  };

  try {
    var savedReq = localStorage.getItem("ib_requirements");
    if (savedReq) state.requirements = savedReq;
  } catch (e) {}

  function cloneVendor(v) { return JSON.parse(JSON.stringify(v)); }
  function uid() { return Math.random().toString(36).slice(2, 9); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function money(n) { if (n == null || isNaN(n)) return "—"; return "₹" + Math.round(n).toLocaleString("en-IN"); }
  function num(n, d) { if (n == null || isNaN(n)) return d == null ? "—" : d; return n; }

  function newVendor() {
    var n = state.vendors.length + 1;
    return {
      id: uid(), name: "Vendor " + n, isExample: false, rawText: "", fileName: null, status: "idle", error: "",
      totals: { statedSubtotal: null, gstPercent: null, statedGrandTotal: null }, paymentTerms: null, warrantyText: null, designFeeNote: null,
      checklist: [], items: []
    };
  }

  function getVendor(id) { for (var i = 0; i < state.vendors.length; i++) if (state.vendors[i].id === id) return state.vendors[i]; return null; }

  function effectiveRate(item) {
    if (item.unit === "SFT" && item.rate != null) return item.rate;
    if (item.unit === "MM_DIM" && item.heightMm && item.widthMm && item.amount != null) {
      var sqft = (item.heightMm * item.widthMm / 92903) * (item.qty || 1);
      if (sqft > 0) return item.amount / sqft;
    }
    return null;
  }

  function benchStatus(categoryKey, rate) {
    var b = state.categories[categoryKey];
    if (!b || rate == null || b.low == null || b.high == null) return { cls: "na", text: "no benchmark" };
    if (rate < b.low * 0.85) return { cls: "bad", text: "below range" };
    if (rate > b.high * 1.15) return { cls: "warn", text: "above range" };
    return { cls: "good", text: "within range" };
  }

  function roomTypeFor(roomName) {
    var name = (roomName || "").toLowerCase();
    for (var key in state.roomExpectations) {
      var kws = state.roomExpectations[key].keywords || [];
      for (var i = 0; i < kws.length; i++) if (name.indexOf(kws[i]) > -1) return key;
    }
    return null;
  }

  // What's missing per room, given what's typically expected there (e.g. a kitchen
  // with no wall/overhead unit priced) — independent of the user's own checklist.
  function roomExpectationFlags(v) {
    var byRoom = {};
    v.items.forEach(function (it) { (byRoom[it.room] = byRoom[it.room] || []).push(it); });
    var flags = [];
    Object.keys(byRoom).forEach(function (room) {
      var type = roomTypeFor(room);
      if (!type) return;
      var expect = state.roomExpectations[type].expect || [];
      var have = byRoom[room].map(function (it) { return it.category; });
      expect.forEach(function (cat) {
        if (have.indexOf(cat) === -1) {
          var label = (state.categories[cat] || { label: cat }).label;
          flags.push(room + ": no " + label.toLowerCase() + " priced");
        }
      });
    });
    return flags;
  }

  // Rooms the floor plan shows that this vendor doesn't appear to have priced at all.
  function floorplanCoverageGaps(v) {
    if (!state.floorplan || !state.floorplan.rooms || !state.floorplan.rooms.length) return [];
    var vendorRooms = v.items.map(function (it) { return (it.room || "").toLowerCase(); });
    return state.floorplan.rooms.filter(function (r) {
      var keyword = (r.name || "").toLowerCase().split(/\s+/)[0];
      if (!keyword) return false;
      return !vendorRooms.some(function (vr) { return vr.indexOf(keyword) > -1 || keyword.indexOf(vr) > -1; });
    }).map(function (r) { return r.name; });
  }

  function vendorSubtotal(v) {
    var sum = 0;
    v.items.forEach(function (it) { if (it.amount != null && !isNaN(it.amount)) sum += Number(it.amount); });
    return sum;
  }

  function vendorGrandTotal(v) {
    var lineSum = vendorSubtotal(v);
    var gstPct = v.totals.gstPercent != null ? Number(v.totals.gstPercent) : 18;
    var computed = lineSum + (lineSum * gstPct / 100);
    var stated = v.totals.statedGrandTotal;
    return { lineSum: lineSum, gstPct: gstPct, computed: computed, stated: stated };
  }

  // ---------------- rendering ----------------

  function render() {
    renderBenchEditor();
    renderTabs();
    renderPanel();
    renderCompare();
    renderFloorplan();
    document.getElementById("requirementList").value = state.requirements;
  }

  function renderBenchEditor() {
    var host = document.getElementById("benchEditor");
    var html = "";
    Object.keys(state.categories).forEach(function (k) {
      var b = state.categories[k];
      if (b.low == null && b.high == null) return;
      html += '<div class="bench-row" data-bench="' + k + '">' +
        '<div>' + esc(b.label) + '</div>' +
        '<div><input type="number" class="bench-low" value="' + num(b.low, "") + '"></div>' +
        '<div><input type="number" class="bench-high" value="' + num(b.high, "") + '"></div>' +
        '</div>';
    });
    host.innerHTML = html;
  }

  function renderTabs() {
    var host = document.getElementById("tabs");
    var html = "";
    state.vendors.forEach(function (v) {
      html += '<button class="tab' + (v.id === state.activeId ? " active" : "") + '" data-tab="' + v.id + '">' + esc(v.name) + (v.isExample ? ' <span class="example-tag">example</span>' : '') + '</button>';
    });
    if (state.vendors.length < 4) html += '<button class="tab-add" id="addVendorBtn">+ add vendor</button>';
    host.innerHTML = html;
  }

  function roomsOf(v) {
    var order = [], map = {};
    v.items.forEach(function (it) {
      var r = it.room || "Unassigned";
      if (!map[r]) { map[r] = []; order.push(r); }
      map[r].push(it);
    });
    return order.map(function (r) { return { room: r, items: map[r] }; });
  }

  function renderPanel() {
    var v = getVendor(state.activeId);
    var host = document.getElementById("panel");
    if (!v) { host.innerHTML = ""; return; }

    var checklistHtml = "";
    if (v.checklist && v.checklist.length) {
      checklistHtml = '<div><p class="note" style="margin-bottom:6px">Against your must-have list:</p><div class="chips">' + v.checklist.map(function (c) {
        return '<span class="chip ' + (c.present ? "yes" : "no") + '" title="' + esc(c.evidence || "") + '"><span class="stamp">' + (c.present ? "✓" : "✗") + '</span>' + esc(c.item) + '</span>';
      }).join("") + '</div></div>';
    }

    var roomFlags = v.items.length ? roomExpectationFlags(v) : [];
    var fpGaps = v.items.length ? floorplanCoverageGaps(v) : [];
    var flagsHtml = "";
    if (roomFlags.length || fpGaps.length) {
      flagsHtml = '<div><p class="note" style="margin-bottom:6px">Room checks:</p><div class="chips">' +
        roomFlags.map(function (f) { return '<span class="chip no"><span class="stamp">⚑</span>' + esc(f) + '</span>'; }).join("") +
        fpGaps.map(function (f) { return '<span class="chip no"><span class="stamp">⚑</span>Not priced anywhere: ' + esc(f) + ' (from your floor plan)</span>'; }).join("") +
        '</div></div>';
    }

    var gstBanner = "";
    if (v.totals.gstPercent != null && Number(v.totals.gstPercent) < 17.5) {
      gstBanner = '<div class="gst-banner">⚑ This quote applies ' + esc(v.totals.gstPercent) + '% tax. Standard GST on interior works contracts in India is 18% (9% CGST + 9% SGST) — confirm this isn\'t a drafting error before comparing totals.</div>';
    }

    var rooms = roomsOf(v);
    var tableRows = "";
    rooms.forEach(function (group) {
      tableRows += '<tr class="room-head"><td colspan="10">' + esc(group.room) + '</td></tr>';
      group.items.forEach(function (it) {
        var rate = effectiveRate(it);
        var status = benchStatus(it.category, rate);
        tableRows += '<tr data-item="' + it.id + '">' +
          '<td><input class="f-room" value="' + esc(it.room) + '"></td>' +
          '<td><input class="f-item" value="' + esc(it.item) + '"></td>' +
          '<td><select class="f-cat">' + Object.keys(state.categories).map(function (k) { return '<option value="' + k + '"' + (k === it.category ? " selected" : "") + '>' + esc(state.categories[k].label) + '</option>'; }).join("") + '</select></td>' +
          '<td><select class="f-unit">' + ["SFT", "MM_DIM", "RFT", "NOS", "LSM", "OTHER"].map(function (u) { return '<option value="' + u + '"' + (u === it.unit ? " selected" : "") + '>' + u + '</option>'; }).join("") + '</select></td>' +
          '<td class="num"><input class="f-qty" type="number" step="any" value="' + num(it.qty, "") + '"></td>' +
          '<td class="num"><input class="f-h" type="number" placeholder="h mm" value="' + num(it.heightMm, "") + '" style="visibility:' + (it.unit === "MM_DIM" ? "visible" : "hidden") + '"></td>' +
          '<td class="num"><input class="f-w" type="number" placeholder="w mm" value="' + num(it.widthMm, "") + '" style="visibility:' + (it.unit === "MM_DIM" ? "visible" : "hidden") + '"></td>' +
          '<td class="num"><input class="f-rate" type="number" step="any" value="' + num(it.rate, "") + '"></td>' +
          '<td class="num"><input class="f-amount" type="number" step="any" value="' + num(it.amount, "") + '"></td>' +
          '<td>' + (rate != null ? '<span class="pill ' + status.cls + '">' + money(rate) + '/sft · ' + status.text + '</span>' : '<span class="pill na">n/a</span>') + '</td>' +
          '<td><button class="delrow" data-del="' + it.id + '">✕</button></td>' +
          '</tr>';
      });
    });

    var gt = vendorGrandTotal(v);
    var totalDiffNote = "";
    if (gt.stated != null && Math.abs(gt.stated - gt.computed) > gt.computed * 0.02) {
      totalDiffNote = '<div class="note">Quote\'s own stated total (' + money(gt.stated) + ') differs from line-items + GST (' + money(gt.computed) + ') — likely a negotiated discount or rounding. Stated total used below.</div>';
    }
    var displayedTotal = gt.stated != null ? gt.stated : gt.computed;

    host.innerHTML =
      '<div class="vendor-head">' +
      '<input class="vendor-name-input" id="vendorNameInput" value="' + esc(v.name) + '">' +
      (state.vendors.length > 1 ? '<button class="danger" id="removeVendorBtn">remove vendor</button>' : '') +
      '</div>' +
      '<div class="setup-body">' +
      '<textarea class="quote-paste" id="rawTextInput" placeholder="Paste the full text of this vendor\'s quote here (open the PDF, Ctrl+A, Ctrl+C, paste) — or upload the PDF below.">' + esc(v.rawText) + '</textarea>' +
      '<div class="row">' +
      '<input type="file" id="quoteFile" accept="application/pdf">' +
      '</div>' +
      '<div class="row">' +
      '<button id="analyzeBtn" ' + (v.status === "loading" ? "disabled" : "") + '>' + (v.status === "loading" ? "Reading…" : "Analyze this quote") + '</button>' +
      '<span class="status-line ' + (v.status === "error" ? "err" : "") + '">' + (v.status === "loading" ? "Sending to Claude for extraction…" : (v.error || "")) + '</span>' +
      '</div>' +
      '</div>' +
      checklistHtml +
      flagsHtml +
      gstBanner +
      (v.paymentTerms ? '<p class="note"><strong>Payment:</strong> ' + esc(v.paymentTerms) + '</p>' : "") +
      (v.warrantyText ? '<p class="note"><strong>Warranty:</strong> ' + esc(v.warrantyText) + '</p>' : '<p class="note">No warranty terms found in this quote.</p>') +
      (v.designFeeNote ? '<p class="note"><strong>Design fee:</strong> ' + esc(v.designFeeNote) + '</p>' : "") +
      '<div class="tablewrap"><table><thead><tr>' +
      '<th>Room</th><th>Item</th><th>Category</th><th>Unit</th><th>Qty</th><th>H mm</th><th>W mm</th><th>Rate</th><th>Amount</th><th>₹/sqft check</th><th></th>' +
      '</tr></thead><tbody>' + tableRows + '</tbody></table></div>' +
      '<div class="row"><button class="ghost" id="addItemBtn">+ add item</button></div>' +
      '<div class="tally">' +
      '<div><span class="k">Line items</span><span class="v">' + money(gt.lineSum) + '</span></div>' +
      '<div><span class="k">GST (' + gt.gstPct + '%)</span><span class="v">' + money(gt.computed - gt.lineSum) + '</span></div>' +
      '<div><span class="k">Total</span><span class="v total">' + money(displayedTotal) + '</span></div>' +
      '</div>' +
      totalDiffNote;
  }

  function renderFloorplan() {
    var host = document.getElementById("floorplanRooms");
    var statusEl = document.getElementById("floorplanStatus");
    var fp = state.floorplan;
    if (!fp) { host.innerHTML = ""; statusEl.textContent = ""; return; }
    statusEl.textContent = fp.status === "loading" ? "Reading the floor plan…" : (fp.error || "");
    statusEl.className = "status-line" + (fp.status === "error" ? " err" : "");
    if (fp.rooms && fp.rooms.length) {
      host.innerHTML = (fp.summary ? '<p class="note" style="flex-basis:100%">' + esc(fp.summary) + '</p>' : "") +
        fp.rooms.map(function (r) {
          return '<span class="chip info">' + esc(r.name) + (r.approxSqft ? " · " + Math.round(r.approxSqft) + " sqft" : "") + '</span>';
        }).join("");
    } else {
      host.innerHTML = "";
    }
  }

  function renderCompare() {
    var section = document.getElementById("compareSection");
    var ready = state.vendors.filter(function (v) { return v.items.length > 0; });
    if (ready.length < 2) { section.hidden = true; return; }
    section.hidden = false;

    var catTotals = {};
    ready.forEach(function (v) {
      v.items.forEach(function (it) {
        var k = it.category || "other";
        catTotals[k] = catTotals[k] || {};
        catTotals[k][v.id] = (catTotals[k][v.id] || 0) + (Number(it.amount) || 0);
      });
    });

    var rows = "";
    Object.keys(catTotals).forEach(function (k) {
      var vals = ready.map(function (v) { return catTotals[k][v.id] || 0; });
      var nonZero = vals.filter(function (x) { return x > 0; });
      var max = Math.max.apply(null, vals);
      var min = nonZero.length ? Math.min.apply(null, nonZero) : 0;
      rows += '<tr><td>' + esc((state.categories[k] || { label: k }).label) + '</td>' +
        ready.map(function (v) {
          var val = catTotals[k][v.id] || 0;
          var cls = val === max && max > 0 ? " max" : (val === min && val > 0 ? " min" : "");
          return '<td class="' + cls.trim() + '">' + (val > 0 ? money(val) : "—") + '</td>';
        }).join("") +
        '</tr>';
    });

    var totals = ready.map(function (v) { return vendorGrandTotal(v); });
    var grandVals = totals.map(function (t) { return t.stated != null ? t.stated : t.computed; });
    var maxGrand = Math.max.apply(null, grandVals);

    var reqCount = (state.requirements || "").split("\n").filter(function (l) { return l.trim(); }).length;
    var coverageHtml = '<div class="chips" style="margin-bottom:10px">' + ready.map(function (v) {
      var met = (v.checklist || []).filter(function (c) { return c.present; }).length;
      var total = (v.checklist || []).length || reqCount;
      return '<span class="chip info">' + esc(v.name) + ': ' + met + '/' + total + ' requirements met</span>';
    }).join("") + '</div>';

    var barsHtml = '<div class="bars">' + ready.map(function (v, i) {
      var val = grandVals[i];
      var pct = maxGrand > 0 ? Math.round((val / maxGrand) * 100) : 0;
      return '<div class="bar-row"><div>' + esc(v.name) + '</div><div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div><div>' + money(val) + '</div></div>';
    }).join("") + '</div>';

    document.getElementById("compareBody").innerHTML =
      coverageHtml +
      '<div class="tablewrap"><table><thead><tr><th>Category</th>' + ready.map(function (v) { return '<th>' + esc(v.name) + '</th>'; }).join("") + '</tr></thead><tbody>' + rows +
      '<tr style="font-weight:700;border-top:2px solid var(--rule)"><td>Grand total</td>' + ready.map(function (v, i) { return '<td>' + money(grandVals[i]) + '</td>'; }).join("") + '</tr>' +
      '</tbody></table></div>' +
      '<h3 style="margin-top:14px">Grand total, side by side</h3>' + barsHtml;
  }

  // ---------------- events: setup ----------------

  document.getElementById("requirementList").addEventListener("input", function (e) {
    state.requirements = e.target.value;
    try { localStorage.setItem("ib_requirements", state.requirements); } catch (err) {}
  });

  document.getElementById("benchEditor").addEventListener("input", function (e) {
    var row = e.target.closest(".bench-row");
    if (!row) return;
    var key = row.getAttribute("data-bench");
    if (e.target.classList.contains("bench-low")) state.categories[key].low = e.target.value === "" ? null : Number(e.target.value);
    if (e.target.classList.contains("bench-high")) state.categories[key].high = e.target.value === "" ? null : Number(e.target.value);
    renderPanel(); renderCompare();
  });

  // ---------------- events: floor plan ----------------

  document.getElementById("floorplanBtn").addEventListener("click", function () {
    var input = document.getElementById("floorplanFile");
    if (!input.files || !input.files[0]) {
      state.floorplan = { status: "error", error: "Choose an image of your floor plan first.", rooms: [] };
      renderFloorplan(); return;
    }
    var file = input.files[0];
    state.floorplan = { status: "loading", error: "", rooms: [], fileName: file.name };
    renderFloorplan();

    var fd = new FormData();
    fd.append("file", file);
    fetch("/api/extract-floorplan", { method: "POST", body: fd })
      .then(function (res) { if (!res.ok) return res.json().then(function (j) { throw new Error(j.detail || "failed"); }); return res.json(); })
      .then(function (data) {
        state.floorplan = { status: "done", error: "", rooms: data.rooms || [], summary: data.summary || "", fileName: file.name };
        renderFloorplan(); renderPanel(); renderCompare();
      })
      .catch(function (err) {
        state.floorplan = { status: "error", error: err.message || "Couldn't read that floor plan.", rooms: [] };
        renderFloorplan();
      });
  });

  // ---------------- events: tabs ----------------

  document.getElementById("tabs").addEventListener("click", function (e) {
    var tabBtn = e.target.closest(".tab");
    if (tabBtn) { state.activeId = tabBtn.getAttribute("data-tab"); render(); return; }
    if (e.target.id === "addVendorBtn") {
      var v = newVendor();
      state.vendors.push(v);
      state.activeId = v.id;
      render();
    }
  });

  // ---------------- events: panel ----------------

  document.getElementById("panel").addEventListener("click", function (e) {
    var v = getVendor(state.activeId);
    if (!v) return;

    if (e.target.id === "removeVendorBtn") {
      state.vendors = state.vendors.filter(function (x) { return x.id !== v.id; });
      state.activeId = state.vendors[0].id;
      render(); return;
    }
    if (e.target.id === "analyzeBtn") { runAnalysis(v); return; }
    if (e.target.id === "addItemBtn") {
      v.items.push({ id: uid(), room: (roomsOf(v)[0] || { room: "Room" }).room, item: "New item", category: "other", unit: "SFT", qty: null, heightMm: null, widthMm: null, rate: null, amount: null });
      renderPanel(); renderCompare(); return;
    }
    var del = e.target.closest("[data-del]");
    if (del) {
      var id = del.getAttribute("data-del");
      v.items = v.items.filter(function (it) { return it.id !== id; });
      renderPanel(); renderCompare(); return;
    }
  });

  document.getElementById("panel").addEventListener("input", function (e) {
    var v = getVendor(state.activeId);
    if (!v) return;
    if (e.target.id === "vendorNameInput") { v.name = e.target.value; renderTabs(); renderCompare(); return; }
    if (e.target.id === "rawTextInput") { v.rawText = e.target.value; return; }

    var tr = e.target.closest("tr[data-item]");
    if (!tr) return;
    var id = tr.getAttribute("data-item");
    var it = null;
    for (var i = 0; i < v.items.length; i++) if (v.items[i].id === id) it = v.items[i];
    if (!it) return;

    if (e.target.classList.contains("f-room")) it.room = e.target.value;
    if (e.target.classList.contains("f-item")) it.item = e.target.value;
    if (e.target.classList.contains("f-cat")) it.category = e.target.value;
    if (e.target.classList.contains("f-unit")) { it.unit = e.target.value; renderPanel(); renderCompare(); return; }
    if (e.target.classList.contains("f-qty")) it.qty = e.target.value === "" ? null : Number(e.target.value);
    if (e.target.classList.contains("f-h")) it.heightMm = e.target.value === "" ? null : Number(e.target.value);
    if (e.target.classList.contains("f-w")) it.widthMm = e.target.value === "" ? null : Number(e.target.value);
    if (e.target.classList.contains("f-rate")) it.rate = e.target.value === "" ? null : Number(e.target.value);
    if (e.target.classList.contains("f-amount")) it.amount = e.target.value === "" ? null : Number(e.target.value);

    var rate = effectiveRate(it);
    var status = benchStatus(it.category, rate);
    var pillCell = tr.children[9];
    pillCell.innerHTML = rate != null ? '<span class="pill ' + status.cls + '">' + money(rate) + '/sft · ' + status.text + '</span>' : '<span class="pill na">n/a</span>';
    var gt = vendorGrandTotal(v);
    var displayedTotal = gt.stated != null ? gt.stated : gt.computed;
    var tally = document.querySelector(".tally");
    if (tally) {
      tally.children[0].querySelector(".v").textContent = money(gt.lineSum);
      tally.children[1].querySelector(".v").textContent = money(gt.computed - gt.lineSum);
      tally.children[2].querySelector(".v").textContent = money(displayedTotal);
    }
    renderCompare();
  });

  // ---------------- AI calls ----------------

  function runAnalysis(v) {
    var fileInput = document.getElementById("quoteFile");
    var file = fileInput && fileInput.files && fileInput.files[0];
    if (!file && (!v.rawText || v.rawText.trim().length < 20)) {
      v.status = "error"; v.error = "Paste the quote's text, or choose a PDF to upload, first.";
      renderPanel(); return;
    }
    v.status = "loading"; v.error = ""; renderPanel();

    var fd = new FormData();
    fd.append("requirements", state.requirements);
    fd.append("vendorName", v.isExample ? "" : v.name);
    if (file) fd.append("file", file); else fd.append("rawText", v.rawText);

    fetch("/api/extract-quote", { method: "POST", body: fd })
      .then(function (res) { if (!res.ok) return res.json().then(function (j) { throw new Error(j.detail || "failed"); }); return res.json(); })
      .then(function (data) {
        v.isExample = false;
        v.name = data.vendorName || v.name;
        v.items = (data.items || []).map(function (it) {
          return {
            id: uid(), room: it.room || "Unassigned", item: it.item || "",
            category: state.categories[it.category] ? it.category : "other",
            unit: ["SFT", "MM_DIM", "RFT", "NOS", "LSM"].indexOf(it.unit) > -1 ? it.unit : "OTHER",
            qty: it.qty, heightMm: it.heightMm, widthMm: it.widthMm, rate: it.rate, amount: it.amount
          };
        });
        v.totals = data.totals || { statedSubtotal: null, gstPercent: null, statedGrandTotal: null };
        v.paymentTerms = data.paymentTerms || null;
        v.warrantyText = data.warrantyText || null;
        v.designFeeNote = data.designFeeNote || null;
        v.checklist = Array.isArray(data.checklist) ? data.checklist : [];
        v.status = "done"; v.error = "";
        renderTabs(); renderPanel(); renderCompare();
      })
      .catch(function (err) {
        v.status = "error";
        v.error = err.message || "Couldn't read that quote cleanly.";
        renderPanel();
      });
  }

  document.getElementById("guidanceBtn").addEventListener("click", function () {
    var ready = state.vendors.filter(function (v) { return v.items.length > 0; });
    if (!ready.length) return;
    var btn = document.getElementById("guidanceBtn");
    var statusEl = document.getElementById("guidanceStatus");
    btn.disabled = true;
    statusEl.textContent = "Reading everything entered…";

    var payload = {
      requirements: state.requirements,
      floorplan: state.floorplan && state.floorplan.rooms && state.floorplan.rooms.length ? state.floorplan : null,
      vendors: ready.map(function (v) {
        var gt = vendorGrandTotal(v);
        return {
          vendor: v.name,
          total: gt.stated != null ? gt.stated : gt.computed,
          paymentTerms: v.paymentTerms,
          warranty: v.warrantyText,
          checklist: v.checklist,
          coverageGaps: floorplanCoverageGaps(v),
          roomFlags: roomExpectationFlags(v),
          items: v.items.map(function (it) {
            var rate = effectiveRate(it); var status = benchStatus(it.category, rate);
            return { room: it.room, item: it.item, category: it.category, amount: it.amount, ratePerSqft: rate, benchmarkStatus: status.text };
          })
        };
      })
    };

    fetch("/api/guidance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then(function (res) { if (!res.ok) return res.json().then(function (j) { throw new Error(j.detail || "failed"); }); return res.json(); })
      .then(function (data) {
        document.getElementById("guidanceOut").textContent = data.text;
        statusEl.textContent = ""; btn.disabled = false;
      })
      .catch(function (err) {
        statusEl.textContent = err.message || "Couldn't get guidance just now — try again in a moment.";
        btn.disabled = false;
      });
  });

  // ---------------- boot ----------------

  fetch("/api/config").then(function (r) { return r.json(); }).then(function (cfg) {
    state.categories = cfg.categories || {};
    state.roomExpectations = cfg.roomExpectations || {};
    if (!localStorage.getItem("ib_requirements") && cfg.defaultRequirements) {
      state.requirements = cfg.defaultRequirements.join("\n");
    }
    render();
  }).catch(function () {
    document.getElementById("panel").innerHTML = '<p class="note err">Couldn\'t reach the server — is it running?</p>';
  });
})();
