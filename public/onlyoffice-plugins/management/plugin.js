/*
 * Workspace plugin for the embedded ONLYOFFICE editor (runs in the background).
 *
 * It adds a "Workspace" tab to the toolbar. Buttons ask the app page (same
 * origin) through a BroadcastChannel to open its own dialogs (sources, PDF
 * evidence, wiki pages, tasks, deadlines); the page answers with commands the
 * plugin applies to the document. The page's connections panel uses the same
 * channel to jump to a linked passage.
 *
 * Connections are stored as tagged content controls: mp:cite:{"ids":[…],"loc":"…"},
 * mp:evidence:{"id":…}, mp:task:{"id":…}, mp:deadline:{"id":…} and mp:bibliography.
 * The app re-reads them from every saved DOCX (src/modules/wiki/office/docx-extract.ts).
 */
(function (window) {
  "use strict";
  var plugin = window.Asc.plugin;
  var state = { pageId: "", channel: null };

  // Own dictionary: the SDK loads translations asynchronously, after the toolbar is registered.
  var DE = {
    "Workspace": "Workspace", "Citation": "Zitat", "Update bibliography": "Literatur aktualisieren", "PDF evidence": "PDF-Nachweis",
    "Wiki link": "Wiki-Link", "Task": "Aufgabe", "Deadline": "Frist", "Remove link": "Verknüpfung entfernen",
    "Select text first.": "Bitte zuerst Text markieren.", "Place the cursor in a link first.": "Bitte den Cursor zuerst in eine Verknüpfung setzen.",
    "Not found in the text.": "Im Text nicht gefunden.", "Citations updated.": "Zitate und Literaturverzeichnis aktualisiert.",
    "Done.": "Erledigt.", "Failed. Please try again.": "Fehlgeschlagen. Bitte erneut versuchen.", "Bibliography": "Literaturverzeichnis", "Page": "S.",
    "Place the cursor outside the bibliography.": "Bitte den Cursor außerhalb des Literaturverzeichnisses setzen.",
  };
  function tr(text) { return String((plugin.info && plugin.info.lang) || "").indexOf("de") === 0 && DE[text] ? DE[text] : text; }
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
  function post(message) { if (state.channel) state.channel.postMessage(message); }
  function notify(kind, text) { post({ type: "notice", kind: kind, text: text }); }
  function fail(error) { console.warn(error); notify("error", tr("Failed. Please try again.")); }

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

  function selectedText() {
    return method("GetSelectedText", [{ Numbering: false, Math: false, TableCellSeparator: " ", ParaSeparator: " " }])
      .then(function (text) { return String(text || "").replace(/\s+/g, " ").trim(); });
  }

  // --- Commands from the page ------------------------------------------------

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
    });
  }

  function evidenceText(item) {
    var quote = (item.selectedText || item.label || "").replace(/\s+/g, " ").trim();
    if (quote.length > 300) quote = quote.slice(0, 297) + "…";
    return "„" + quote + "“ (" + item.sourceTitle + ", " + tr("Page") + " " + item.pageNumber + ")";
  }

  function insertEvidence(item) {
    return insertInlineControl(tag("evidence", { id: item.id }), evidenceText(item), window.location.origin + item.href);
  }

  function insertLink(page) {
    Asc.scope.text = page.title;
    Asc.scope.href = window.location.origin + page.href;
    return command(function () {
      var doc = Api.GetDocument();
      var run = Api.CreateRun();
      run.AddText(Asc.scope.text);
      var paragraph = Api.CreateParagraph();
      paragraph.AddElement(run);
      doc.InsertContent([paragraph], true);
      run.AddHyperlink(Asc.scope.href);
    });
  }

  /** Selects the first control of `kind` whose tag matches `id` (a task/deadline/evidence id or a cited source id). */
  function selectTagged(kind, id) {
    return taggedControls().then(function (controls) {
      var match = controls.filter(function (control) {
        if (control.tag.kind !== kind || !control.tag.data) return false;
        return kind === "cite" ? (control.tag.data.ids || []).indexOf(id) >= 0 : control.tag.data.id === id;
      })[0];
      if (!match) { notify("info", tr("Not found in the text.")); return; }
      return method("SelectContentControl", [match.id]);
    });
  }

  function removeControlAtCursor() {
    return method("GetCurrentContentControl").then(function (id) {
      if (!id) { notify("info", tr("Place the cursor in a link first.")); return; }
      return method("RemoveContentControls", [[{ InternalId: id }]]);
    });
  }

  /** Rejects inserts inside the generated bibliography (it is rewritten on every update). */
  function outsideBibliography() {
    return command(function () {
      var doc = Api.GetDocument();
      var paragraph = doc.GetCurrentParagraph ? doc.GetCurrentParagraph() : null;
      if (!paragraph) {
        var range = doc.GetRangeBySelect();
        var paragraphs = range ? range.GetAllParagraphs() : [];
        paragraph = paragraphs.length ? paragraphs[0] : null;
      }
      var block = paragraph && paragraph.GetParentContentControl ? paragraph.GetParentContentControl() : null;
      return Boolean(block && block.GetTag() === "mp:bibliography");
    }).then(function (inside) {
      if (inside) throw new Error("bibliography");
    });
  }

  function run(message) {
    if (message.command === "insertCitation" || message.command === "insertEvidence" || message.command === "insertLink") {
      return outsideBibliography().then(function () { return apply(message); });
    }
    return apply(message);
  }

  function apply(message) {
    switch (message.command) {
      case "insertCitation": {
        var data = { ids: message.ids.slice(0, 50) };
        if (message.loc) data.loc = message.loc;
        return insertInlineControl(tag("cite", data), "[…]").then(updateCitations);
      }
      case "updateCitations": return updateCitations();
      case "insertEvidence": return insertEvidence(message.item);
      case "insertLink": return insertLink(message.page);
      case "wrapSelection":
        // AddContentControl wraps the current selection; Lock 3 means "not locked".
        return method("AddContentControl", [2, { Tag: tag(message.kind, { id: message.id }), Lock: 3 }]);
      case "select": return selectTagged(message.kind, message.id);
      default: return Promise.resolve();
    }
  }

  // --- Toolbar ---------------------------------------------------------------

  function request(action) {
    if (action === "task" || action === "deadline") {
      return selectedText().then(function (quote) {
        if (!quote) { notify("info", tr("Select text first.")); return; }
        post({ type: "request", action: action, quote: quote.slice(0, 300) });
      });
    }
    post({ type: "request", action: action });
    return Promise.resolve();
  }

  function icon(name) { return window.location.origin + "/onlyoffice-plugins/management/resources/" + name + ".png"; }

  function registerToolbar() {
    var tab = new Asc.ButtonToolbar(null);
    tab.text = tr("Workspace");
    var buttons = [
      ["cite", "Citation", function () { request("cite"); }],
      ["bibliography", "Update bibliography", function () { updateCitations().then(function () { notify("success", tr("Citations updated.")); }, fail); }],
      ["evidence", "PDF evidence", function () { request("evidence"); }],
      ["link", "Wiki link", function () { request("link"); }],
      ["task", "Task", function () { request("task").catch(fail); }],
      ["deadline", "Deadline", function () { request("deadline").catch(fail); }],
      ["remove", "Remove link", function () { removeControlAtCursor().catch(fail); }],
    ];
    buttons.forEach(function (entry, index) {
      var button = new Asc.ButtonToolbar(tab);
      button.text = tr(entry[1]);
      button.hint = tr(entry[1]);
      button.icons = icon(entry[0]);
      button.separator = index === 2 || index === 4 || index === 6;
      button.attachOnClick(entry[2]);
    });
    Asc.Buttons.registerToolbarMenu();
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

  plugin.init = function () {
    var options = (plugin.info && plugin.info.options) || {};
    state.pageId = options.pageId || "";
    if (options.bridgeId && window.BroadcastChannel) {
      state.channel = new BroadcastChannel("mp-office:" + options.bridgeId);
      state.channel.onmessage = function (event) {
        var message = event.data || {};
        if (message.type !== "command") return;
        run(message).then(function () {
          if (message.command !== "select") notify("success", tr("Done."));
        }, function (error) {
          if (error && error.message === "bibliography") notify("info", tr("Place the cursor outside the bibliography."));
          else fail(error);
        });
      };
      post({ type: "ready" });
    }
    registerToolbar();
    runPending(options);
  };

  plugin.onTranslate = function () {};
  plugin.button = function () {};
})(window);
