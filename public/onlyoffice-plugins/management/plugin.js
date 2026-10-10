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
 *
 * The cursor's paragraph is reported to the page (debounced) so it can reopen
 * the document where the user left off; "goToParagraph" jumps back there.
 *
 * "Edit section separately" (document body context menu) lives in section.js,
 * which uses the helpers exported below as window.MpWorkspace. The same plugin
 * runs in the section editor's scratch document with options.mode "section":
 * no bibliography, house styles, grammar or section menu there.
 *
 * "Format document" applies the house paragraph styles (HOUSE_STYLES below) to
 * the open document's styles, so older documents get the same heading and
 * paragraph spacing as new ones.
 */
(function (window) {
  "use strict";
  var plugin = window.Asc.plugin;
  var state = { pageId: "", channel: null, section: false, user: { id: "", name: "" } };

  // Own dictionary: the SDK loads translations asynchronously, after the toolbar is registered.
  var DE = {
    "Workspace": "Workspace", "Citation": "Zitat", "Update bibliography": "Literatur aktualisieren", "PDF evidence": "PDF-Nachweis",
    "Wiki link": "Wiki-Link", "Task": "Aufgabe", "Deadline": "Frist", "Remove link": "Verknüpfung entfernen", "Grammar": "Grammatik",
    "Select text first.": "Bitte zuerst Text markieren.", "Place the cursor in a link first.": "Bitte den Cursor zuerst in eine Verknüpfung setzen.",
    "Not found in the text.": "Im Text nicht gefunden.", "Citations updated.": "Zitate und Literaturverzeichnis aktualisiert.",
    "Done.": "Erledigt.", "Failed. Please try again.": "Fehlgeschlagen. Bitte erneut versuchen.", "Bibliography": "Literaturverzeichnis", "Page": "S.",
    "Place the cursor outside the bibliography.": "Bitte den Cursor außerhalb des Literaturverzeichnisses setzen.",
    "Format document": "Dokument formatieren", "Headings and paragraphs formatted.": "Überschriften und Absätze formatiert.",
  };
  // Same values as src/modules/wiki/lib/docx-styles.ts (checked by docx-styles.test.ts).
  var HOUSE_FONT = "Calibri";
  var HOUSE_STYLES = [
    { "name": "Normal", "size": 22, "before": 0, "after": 120, "line": 276 },
    { "name": "Title", "size": 52, "color": "1F3864", "before": 0, "after": 360, "line": 240, "keepNext": true },
    { "name": "Heading 1", "size": 32, "bold": true, "color": "1F3864", "before": 480, "after": 160, "line": 240, "keepNext": true, "keepLines": true },
    { "name": "Heading 2", "size": 26, "bold": true, "color": "2E74B5", "before": 360, "after": 120, "line": 240, "keepNext": true, "keepLines": true },
    { "name": "Heading 3", "size": 24, "bold": true, "color": "1F4D78", "before": 240, "after": 80, "line": 240, "keepNext": true, "keepLines": true },
    { "name": "Heading 4", "size": 22, "bold": true, "italic": true, "color": "2E74B5", "before": 200, "after": 60, "line": 240, "keepNext": true, "keepLines": true },
    { "name": "Caption", "size": 18, "italic": true, "color": "595959", "before": 60, "after": 240 }
  ];
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

  // --- Reading position --------------------------------------------------------

  var positionTimer = 0;

  /** Index (in document order) of the paragraph holding the cursor, or -1. */
  function cursorParagraph() {
    return command(function () {
      var doc = Api.GetDocument();
      var current = doc.GetCurrentParagraph ? doc.GetCurrentParagraph() : null;
      if (!current) {
        var range = doc.GetRangeBySelect();
        var selected = range ? range.GetAllParagraphs() : [];
        current = selected.length ? selected[0] : null;
      }
      if (!current || !current.GetInternalId) return -1;
      var id = current.GetInternalId();
      var paragraphs = doc.GetAllParagraphs();
      for (var i = 0; i < paragraphs.length; i++) if (paragraphs[i].GetInternalId() === id) return i;
      return -1;
    });
  }

  function reportPosition() {
    cursorParagraph().then(function (index) {
      if (typeof index === "number" && index >= 0) post({ type: "position", index: index });
    }, function () {});
  }

  function goToParagraph(index) {
    Asc.scope.target = index;
    return command(function () {
      var paragraph = Api.GetDocument().GetAllParagraphs()[Asc.scope.target];
      if (!paragraph) return false;
      paragraph.GetRange(0, 0).Select();
      return true;
    });
  }

  // --- House styles ------------------------------------------------------------

  /** Rewrites the document's paragraph styles; paragraphs using them follow. */
  function formatDocument() {
    Asc.scope.styles = HOUSE_STYLES;
    Asc.scope.font = HOUSE_FONT;
    return command(function () {
      var doc = Api.GetDocument();
      var normal = doc.GetStyle("Normal") || doc.GetDefaultStyle("paragraph");
      for (var i = 0; i < Asc.scope.styles.length; i++) {
        var spec = Asc.scope.styles[i];
        var style = spec.name === "Normal" ? normal : doc.GetStyle(spec.name);
        if (!style) {
          style = doc.CreateStyle(spec.name, "paragraph");
          style.SetBasedOn(normal);
        }
        var text = style.GetTextPr();
        if (spec.name === "Normal") text.SetFontFamily(Asc.scope.font);
        text.SetFontSize(spec.size);
        text.SetBold(Boolean(spec.bold));
        text.SetItalic(Boolean(spec.italic));
        if (spec.color) text.SetColor(parseInt(spec.color.slice(0, 2), 16), parseInt(spec.color.slice(2, 4), 16), parseInt(spec.color.slice(4, 6), 16), false);
        var paragraph = style.GetParaPr();
        paragraph.SetSpacingBefore(spec.before, false);
        paragraph.SetSpacingAfter(spec.after, false);
        if (spec.line) paragraph.SetSpacingLine(spec.line, "auto");
        paragraph.SetKeepNext(Boolean(spec.keepNext));
        paragraph.SetKeepLines(Boolean(spec.keepLines));
      }
    });
  }

  // --- Grammar check (LanguageTool through the app) ------------------------------

  /** Non-empty paragraphs with their index in document order. */
  function collectParagraphs() {
    return command(function () {
      var paragraphs = Api.GetDocument().GetAllParagraphs();
      var result = [];
      for (var i = 0; i < paragraphs.length; i++) {
        var text = paragraphs[i].GetText().replace(/[\r\n]+$/, "");
        if (text.trim()) result.push({ index: i, text: text });
      }
      return result;
    });
  }

  /**
   * Selects the checked text of an issue if the paragraph still reads the same
   * there. Uses the editor's search (the n-th occurrence before `offset`):
   * range positions count formatting boundaries, text offsets do not.
   */
  function selectIssue(message) {
    Asc.scope.issue = { index: message.index, offset: message.offset, length: message.length, expected: message.expected };
    return command(function () {
      var issue = Asc.scope.issue;
      var paragraph = Api.GetDocument().GetAllParagraphs()[issue.index];
      if (!paragraph) return "stale";
      var text = paragraph.GetText();
      if (text.substr(issue.offset, issue.length) !== issue.expected) return "stale";
      var occurrence = 0;
      for (var at = text.indexOf(issue.expected); at >= 0 && at < issue.offset; at = text.indexOf(issue.expected, at + 1)) occurrence++;
      var found = paragraph.Search(issue.expected, true) || [];
      var range = found[occurrence];
      if (!range || range.GetText() !== issue.expected) return "stale";
      range.Select();
      return "ok";
    });
  }

  function replaceIssue(message) {
    return selectIssue(message).then(function (result) {
      if (result !== "ok") return result;
      return method("PasteText", [message.replacement]).then(function () { return "ok"; });
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
        // The section editor has no bibliography: the main document numbers the citation after closing.
        return insertInlineControl(tag("cite", data), "[…]").then(function () { if (!state.section) return updateCitations(); });
      }
      case "updateCitations": return state.section ? Promise.resolve() : updateCitations();
      case "insertEvidence": return insertEvidence(message.item);
      case "insertLink": return insertLink(message.page);
      case "wrapSelection":
        // AddContentControl wraps the current selection; Lock 3 means "not locked".
        return method("AddContentControl", [2, { Tag: tag(message.kind, { id: message.id }), Lock: 3 }]);
      case "goToParagraph": return goToParagraph(message.index);
      case "select": return selectTagged(message.kind, message.id);
      case "collectParagraphs": return collectParagraphs().then(function (paragraphs) { post({ type: "paragraphs", paragraphs: paragraphs || [] }); });
      case "selectIssue":
        return selectIssue(message).then(function (result) { post({ type: "issueResult", id: message.id, result: result }); });
      case "replaceIssue":
        return replaceIssue(message).then(function (result) { post({ type: "issueResult", id: message.id, result: result, replaced: result === "ok" }); });
      default: {
        var section = window.MpWorkspaceSection;
        return section && section.handles(message.command) ? section.apply(message) : Promise.resolve();
      }
    }
  }

  /** Commands that report their own result (no "Done." notice). */
  function silent(name) {
    if (["select", "goToParagraph", "collectParagraphs", "selectIssue", "replaceIssue"].indexOf(name) >= 0) return true;
    return Boolean(window.MpWorkspaceSection && window.MpWorkspaceSection.handles(name));
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
      ["grammar", "Grammar", function () { post({ type: "request", action: "grammar" }); }],
      ["format", "Format document", function () { formatDocument().then(function () { notify("success", tr("Headings and paragraphs formatted.")); }, fail); }],
    ];
    // The section editor never writes a bibliography or changes styles; grammar stays in the main document.
    var hidden = state.section ? ["bibliography", "grammar", "format"] : [];
    var separated = ["evidence", "task", "remove", "grammar"];
    buttons.filter(function (entry) { return hidden.indexOf(entry[0]) < 0; }).forEach(function (entry, index) {
      var button = new Asc.ButtonToolbar(tab);
      button.text = tr(entry[1]);
      button.hint = tr(entry[1]);
      button.icons = icon(entry[0]);
      button.separator = index > 0 && separated.indexOf(entry[0]) >= 0;
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
    state.section = options.mode === "section";
    state.user = { id: String(options.userId || plugin.info.userId || ""), name: String(options.userName || plugin.info.userName || "") };
    if (options.bridgeId && window.BroadcastChannel) {
      state.channel = new BroadcastChannel("mp-office:" + options.bridgeId);
      state.channel.onmessage = function (event) {
        var message = event.data || {};
        if (message.type !== "command") return;
        run(message).then(function () {
          if (!silent(message.command)) notify("success", tr("Done."));
        }, function (error) {
          if (error && error.message === "bibliography") notify("info", tr("Place the cursor outside the bibliography."));
          else fail(error);
        });
      };
      post({ type: "ready" });
    }
    registerToolbar();
    if (state.channel && window.MpWorkspaceSection) window.MpWorkspaceSection.init();
    runPending(options);
  };

  plugin.event_onTargetPositionChanged = function () {
    if (state.section) return;
    window.clearTimeout(positionTimer);
    positionTimer = window.setTimeout(reportPosition, 1000);
  };

  plugin.onTranslate = function () {};
  plugin.button = function () {};

  // Shared with section.js, which index.html loads after this file.
  window.MpWorkspace = {
    plugin: plugin, state: state, tr: tr, parseTag: parseTag, method: method, command: command, post: post, notify: notify, fail: fail,
    updateCitations: updateCitations,
    /** Read-only document access: no recalculation. */
    read: function (fn) { return new Promise(function (resolve) { plugin.callCommand(fn, false, false, resolve); }); },
    addTranslations: function (entries) { for (var key in entries) DE[key] = entries[key]; },
  };
})(window);
