/*
 * Workspace plugin for the embedded ONLYOFFICE editor.
 * Connections are stored as tagged content controls: mp:cite:{"ids":[…],"loc":"…"},
 * mp:evidence:{"id":…}, mp:task:{"id":…}, mp:deadline:{"id":…} and mp:bibliography.
 * The app re-reads them from every saved DOCX (src/modules/wiki/office/docx-extract.ts).
 * The plugin is served from the app origin, so fetch() carries the session cookie.
 */
(function (window) {
  "use strict";
  var plugin = window.Asc.plugin;
  var state = { pageId: "", locale: "de-DE", selectedSources: [] };

  function tr(text) { return plugin.tr ? plugin.tr(text) : text; }
  function $(id) { return document.getElementById(id); }
  function say(text) { $("message").textContent = text || ""; }
  function tag(kind, data) { return kind === "bibliography" ? "mp:bibliography" : "mp:" + kind + ":" + JSON.stringify(data); }
  function parseTag(value) {
    if (!value || value.indexOf("mp:") !== 0) return null;
    var rest = value.slice(3);
    if (rest === "bibliography") return { kind: "bibliography" };
    var colon = rest.indexOf(":");
    if (colon < 0) return null;
    try { return { kind: rest.slice(0, colon), data: JSON.parse(rest.slice(colon + 1)) }; } catch { return null; }
  }
  function api(path, options) {
    return fetch(path, Object.assign({ credentials: "same-origin", headers: { "Content-Type": "application/json" } }, options || {}))
      .then(function (response) { if (!response.ok) throw new Error(String(response.status)); return response.json(); });
  }
  function method(name, args) { return new Promise(function (resolve) { plugin.executeMethod(name, args || null, resolve); }); }
  function command(fn) { return new Promise(function (resolve) { plugin.callCommand(fn, false, true, resolve); }); }
  function fail(error) { console.warn(error); say(tr("Failed. Please try again.")); }

  /** Inserts an inline content control with `text` at the cursor. */
  function insertInlineControl(tagValue, text, href) {
    Asc.scope.tag = tagValue;
    Asc.scope.text = text;
    Asc.scope.href = href || "";
    return command(function () {
      var doc = Api.GetDocument();
      var sdt = Api.CreateInlineLvlSdt();
      sdt.SetTag(Asc.scope.tag);
      var run = Api.CreateRun();
      run.AddText(Asc.scope.text);
      sdt.AddElement(run, 0);
      var paragraph = Api.CreateParagraph();
      paragraph.AddInlineLvlSdt(sdt);
      doc.InsertContent([paragraph], true);
      if (Asc.scope.href) run.AddHyperlink(Asc.scope.href);
    });
  }

  function taggedControls() {
    return method("GetAllContentControls").then(function (controls) {
      return (controls || []).map(function (control) { return { id: control.InternalId, tag: parseTag(control.Tag) }; })
        .filter(function (control) { return control.tag; });
    });
  }

  // --- Citations ---------------------------------------------------------

  function searchSources() {
    api("/api/wiki/office/citations?page=" + encodeURIComponent(state.pageId) + "&q=" + encodeURIComponent($("cite-query").value)).then(function (result) {
      var select = $("cite-style");
      if (!select.options.length) {
        result.styles.forEach(function (style) { var option = document.createElement("option"); option.value = style; option.textContent = style.toUpperCase(); select.appendChild(option); });
      }
      select.value = result.style;
      state.locale = result.locale;
      renderList("cite-results", result.sources, function (source) {
        return { title: source.title, detail: [source.authors, source.year].filter(Boolean).join(" · "), selected: state.selectedSources.indexOf(source.id) >= 0 };
      }, function (source, element) {
        var index = state.selectedSources.indexOf(source.id);
        if (index >= 0) state.selectedSources.splice(index, 1); else state.selectedSources.push(source.id);
        element.classList.toggle("selected", index < 0);
      });
    }).catch(fail);
  }

  function insertCitation() {
    if (!state.selectedSources.length) { say(tr("Select at least one source.")); return; }
    var data = { ids: state.selectedSources.slice(0, 50) };
    var loc = $("cite-locator").value.trim();
    if (loc) data.loc = loc;
    insertInlineControl(tag("cite", data), "[…]").then(updateCitations).then(function () {
      state.selectedSources = [];
      $("cite-locator").value = "";
      searchSources();
    }).catch(fail);
  }

  function updateCitations() {
    return taggedControls().then(function (controls) {
      var cites = controls.filter(function (control) { return control.tag.kind === "cite" && control.tag.data; });
      var items = cites.map(function (control) { return { ids: control.tag.data.ids || [], loc: control.tag.data.loc }; });
      return api("/api/wiki/office/citations", { method: "POST", body: JSON.stringify({ pageId: state.pageId, items: items }) }).then(function (result) {
        Asc.scope.labels = cites.map(function (control, index) { return { id: control.id, text: result.labels[index] || "[?]" }; });
        Asc.scope.bibliography = result.bibliography;
        Asc.scope.bibliographyTitle = tr("Bibliography");
        return command(function () {
          var doc = Api.GetDocument();
          var all = doc.GetAllContentControls();
          var byId = {};
          for (var i = 0; i < all.length; i++) byId[all[i].GetInternalId()] = all[i];
          for (var j = 0; j < Asc.scope.labels.length; j++) {
            var control = byId[Asc.scope.labels[j].id];
            if (!control || control.GetClassType() !== "inlineLvlSdt") continue;
            control.RemoveAllElements();
            var run = Api.CreateRun();
            run.AddText(Asc.scope.labels[j].text);
            control.AddElement(run, 0);
          }
          var bibliography = null;
          for (var k = 0; k < all.length; k++) if (all[k].GetTag() === "mp:bibliography" && all[k].GetClassType() === "blockLvlSdt") bibliography = all[k];
          if (!Asc.scope.bibliography.length && !bibliography) return;
          if (!bibliography) {
            bibliography = Api.CreateBlockLvlSdt();
            bibliography.SetTag("mp:bibliography");
            doc.Push(bibliography);
          }
          var content = bibliography.GetContent();
          content.RemoveAllElements();
          var heading = Api.CreateParagraph();
          heading.AddText(Asc.scope.bibliographyTitle);
          heading.SetStyle(doc.GetStyle("Heading 1"));
          content.Push(heading);
          for (var m = 0; m < Asc.scope.bibliography.length; m++) {
            var entry = Api.CreateParagraph();
            entry.AddText(Asc.scope.bibliography[m]);
            content.Push(entry);
          }
        });
      });
    }).then(function () { say(tr("Done.")); });
  }

  function saveStyle() {
    api("/api/wiki/office/citations", { method: "PUT", body: JSON.stringify({ pageId: state.pageId, style: $("cite-style").value, locale: state.locale }) })
      .then(updateCitations).catch(fail);
  }

  // --- PDF evidence ---------------------------------------------------------

  function evidenceText(item) {
    var quote = (item.selectedText || item.label || "").replace(/\s+/g, " ").trim();
    if (quote.length > 300) quote = quote.slice(0, 297) + "…";
    return "„" + quote + "“ (" + item.sourceTitle + ", " + tr("Page") + " " + item.pageNumber + ")";
  }

  function insertEvidence(item) {
    return insertInlineControl(tag("evidence", { id: item.id }), evidenceText(item), window.location.origin + item.href).then(function () { say(tr("Done.")); });
  }

  function searchEvidence() {
    api("/api/wiki/office/evidence?q=" + encodeURIComponent($("evidence-query").value)).then(function (result) {
      renderList("evidence-results", result.items, function (item) {
        return { title: item.selectedText || item.label || item.sourceTitle, detail: item.sourceTitle + " · " + tr("Page") + " " + item.pageNumber };
      }, function (item) { insertEvidence(item).catch(fail); });
    }).catch(fail);
  }

  // --- Wiki links -----------------------------------------------------------

  function searchPages() {
    var query = $("link-query").value.trim();
    if (!query) { $("link-results").innerHTML = ""; return; }
    api("/api/wiki/office/pages?q=" + encodeURIComponent(query)).then(function (result) {
      renderList("link-results", result.pages, function (page) { return { title: page.title, detail: page.slug }; }, function (page) {
        Asc.scope.text = page.title;
        Asc.scope.href = window.location.origin + page.href;
        command(function () {
          var doc = Api.GetDocument();
          var run = Api.CreateRun();
          run.AddText(Asc.scope.text);
          var paragraph = Api.CreateParagraph();
          paragraph.AddElement(run);
          doc.InsertContent([paragraph], true);
          run.AddHyperlink(Asc.scope.href);
        }).then(function () { say(tr("Done.")); }).catch(fail);
      });
    }).catch(fail);
  }

  // --- Tasks and deadlines (host dialog through a MessageChannel) ------------

  function askHost(action, quote) {
    return new Promise(function (resolve, reject) {
      if (!window.top || window.top === window) { reject(new Error("no host")); return; }
      var channel = new MessageChannel();
      channel.port1.onmessage = function (event) { channel.port1.close(); resolve(event.data || {}); };
      window.top.postMessage({ type: "mp-office", action: action, pageId: state.pageId, quote: quote }, window.location.origin, [channel.port2]);
    });
  }

  function createFromSelection(kind) {
    method("GetSelectedText", [{ Numbering: false, Math: false, TableCellSeparator: " ", ParaSeparator: " " }]).then(function (text) {
      var quote = String(text || "").replace(/\s+/g, " ").trim();
      if (!quote) { say(tr("Select text first.")); return; }
      return askHost(kind === "task" ? "createTask" : "createDeadline", quote.slice(0, 300)).then(function (reply) {
        if (!reply.id) return;
        // AddContentControl wraps the current selection; Lock 3 means "not locked".
        return method("AddContentControl", [2, { Tag: tag(kind, { id: reply.id }), Lock: 3 }]).then(function () { say(tr("Done.")); });
      });
    }).catch(fail);
  }

  // --- Pending actions from the host (plugins.options) -------------------------

  function selectTagged(kind, id) {
    return taggedControls().then(function (controls) {
      var match = controls.filter(function (control) { return control.tag.kind === kind && control.tag.data && control.tag.data.id === id; })[0];
      if (match) return method("SelectContentControl", [match.id]);
    });
  }

  function runPending(options) {
    if (options.insertEvidenceId) {
      api("/api/wiki/office/evidence?id=" + encodeURIComponent(options.insertEvidenceId)).then(function (result) {
        if (result.items && result.items[0]) return insertEvidence(result.items[0]);
      }).catch(fail);
    }
    if (options.focusTaskId) selectTagged("task", options.focusTaskId).catch(fail);
    if (options.focusDeadlineId) selectTagged("deadline", options.focusDeadlineId).catch(fail);
  }

  function removeControlAtCursor() {
    method("GetCurrentContentControl").then(function (id) {
      if (!id) { say(tr("Nothing found.")); return; }
      return method("RemoveContentControls", [[{ InternalId: id }]]).then(function () { say(tr("Done.")); });
    }).catch(fail);
  }

  // --- UI helpers ------------------------------------------------------------

  function renderList(id, items, describe, onPick) {
    var list = $(id);
    list.innerHTML = "";
    if (!items || !items.length) { var empty = document.createElement("li"); empty.textContent = tr("Nothing found."); list.appendChild(empty); return; }
    items.forEach(function (item) {
      var info = describe(item);
      var element = document.createElement("li");
      element.textContent = info.title;
      if (info.selected) element.classList.add("selected");
      if (info.detail) { var small = document.createElement("small"); small.textContent = info.detail; element.appendChild(small); }
      element.addEventListener("click", function () { onPick(item, element); });
      list.appendChild(element);
    });
  }

  function debounce(fn) { var timer; return function () { clearTimeout(timer); timer = setTimeout(fn, 250); }; }

  function translateUi() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n]"), function (element) { element.textContent = tr(element.getAttribute("data-i18n")); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-placeholder]"), function (element) { element.placeholder = tr(element.getAttribute("data-i18n-placeholder")); });
  }

  plugin.onTranslate = translateUi;

  plugin.init = function () {
    var options = (plugin.info && plugin.info.options) || {};
    state.pageId = options.pageId || "";
    translateUi();
    Array.prototype.forEach.call(document.querySelectorAll(".tabs button"), function (button) {
      button.addEventListener("click", function () {
        Array.prototype.forEach.call(document.querySelectorAll(".tabs button"), function (other) { other.classList.toggle("active", other === button); });
        Array.prototype.forEach.call(document.querySelectorAll("section[data-panel]"), function (panel) { panel.hidden = panel.getAttribute("data-panel") !== button.getAttribute("data-tab"); });
      });
    });
    $("cite-query").addEventListener("input", debounce(searchSources));
    $("cite-insert").addEventListener("click", insertCitation);
    $("cite-update").addEventListener("click", function () { updateCitations().catch(fail); });
    $("cite-style-save").addEventListener("click", saveStyle);
    $("evidence-query").addEventListener("input", debounce(searchEvidence));
    $("link-query").addEventListener("input", debounce(searchPages));
    $("task-create").addEventListener("click", function () { createFromSelection("task"); });
    $("deadline-create").addEventListener("click", function () { createFromSelection("deadline"); });
    $("remove-control").addEventListener("click", removeControlAtCursor);
    if (state.pageId) { searchSources(); searchEvidence(); }
    runPending(options);
  };

  plugin.button = function () { plugin.executeCommand("close", ""); };
})(window);
