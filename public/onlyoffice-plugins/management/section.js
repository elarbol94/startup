/*
 * "Edit section separately" for the workspace plugin (see plugin.js and
 * docs/office-documents.md). The page decides; this file only reads and
 * changes the documents.
 *
 * Main document:
 * - The context-menu item reads the top-level blocks (heading level/title,
 *   section-edit locks), the cursor's block and whether change tracking is on
 *   and posts them as "sectionOutline". The page works out the section
 *   (src/modules/wiki/components/office/section-editor/section-logic.ts).
 * - "lockSection" selects those blocks, wraps them in a block content control
 *   tagged mp:section-edit:{"id","user","at"} and locked (sdtContentLocked),
 *   and posts the wrapper as Document Builder JSON ("sectionLocked").
 * - "commitSection" replaces the wrapper's content with the section editor's
 *   JSON (Api.FromJSON), removes the wrapper keeping its content and refreshes
 *   the bibliography if the section has citations. "releaseSection" only
 *   unwraps (discard, stale locks).
 * - On start, existing section-edit locks are reported ("sectionLocks") so the
 *   page can release leftovers.
 *
 * Section editor (options.mode "section", a scratch document): "loadSection"
 * replaces the body with the JSON, "readSection" posts the body as JSON.
 *
 * Api.FromJSON adds the styles it brings along again, even when the document
 * already has an identical one; dedupeStyles() drops those copies afterwards
 * (internal ONLYOFFICE objects, so it gives up silently if they change).
 */
(function (window) {
  "use strict";
  var ws = window.MpWorkspace;
  if (!ws) return;
  var COMMANDS = ["lockSection", "commitSection", "releaseSection", "loadSection", "readSection"];

  ws.addTranslations({ "Edit section separately": "Abschnitt separat bearbeiten" });

  // --- Main document ---------------------------------------------------------

  /** Top-level blocks, the block holding the cursor and whether change tracking is on. Read-only. */
  function readOutline() {
    return ws.read(function () {
      var doc = Api.GetDocument();
      var count = doc.GetElementsCount();
      var blocks = [];
      var ids = {};
      for (var i = 0; i < count; i++) {
        var element = doc.GetElement(i);
        var type = element.GetClassType();
        var block = { level: 0 };
        if (type === "paragraph") {
          var level = element.GetParaPr().GetOutlineLvl();
          if (typeof level === "number" && level >= 1 && level <= 9) {
            var title = element.GetText().replace(/\s+/g, " ").trim();
            if (title) { block.level = level; block.title = title.slice(0, 200); }
          }
        } else if (type === "blockLvlSdt") {
          var tag = element.GetTag();
          if (tag && tag.indexOf("mp:section-edit:") === 0) block.tag = tag;
        }
        if (element.GetInternalId) ids[element.GetInternalId()] = i;
        blocks.push(block);
      }
      var current = doc.GetCurrentParagraph ? doc.GetCurrentParagraph() : null;
      if (!current) {
        var range = doc.GetRangeBySelect();
        var selected = range ? range.GetAllParagraphs() : [];
        current = selected.length ? selected[0] : null;
      }
      // Climb from the cursor's paragraph (maybe inside a table or control) to its top-level block.
      var cursor = -1;
      for (var depth = 0, node = current; node && depth < 32; depth++) {
        var id = node.GetInternalId ? node.GetInternalId() : null;
        if (id !== null && ids[id] !== undefined) { cursor = ids[id]; break; }
        node = (node.GetParentContentControl && node.GetParentContentControl()) || (node.GetParentTable && node.GetParentTable()) || null;
      }
      return { blocks: blocks, cursor: cursor, tracking: Boolean(doc.IsTrackRevisions()) };
    });
  }

  function requestSectionEdit() {
    return readOutline().then(function (outline) {
      if (!outline) throw new Error("outline");
      ws.post({ type: "sectionOutline", blocks: outline.blocks, cursor: outline.cursor, tracking: outline.tracking, user: ws.state.user });
    });
  }

  function lockSection(message) {
    Asc.scope.section = { start: message.start, end: message.end, count: message.count, title: message.title };
    return ws.command(function () {
      var s = Asc.scope.section;
      var doc = Api.GetDocument();
      if (doc.IsTrackRevisions()) return "tracking";
      if (doc.GetElementsCount() !== s.count || s.start < 0 || s.end > s.count || s.start >= s.end) return "changed";
      var first = doc.GetElement(s.start);
      if (s.title !== null && (first.GetClassType() !== "paragraph" || first.GetText().replace(/\s+/g, " ").trim().slice(0, 200) !== s.title)) return "changed";
      var from = null;
      var to = null;
      for (var i = s.start; i < s.end; i++) {
        var element = doc.GetElement(i);
        if (element.GetClassType() === "blockLvlSdt" && String(element.GetTag() || "").indexOf("mp:section-edit:") === 0) return "locked";
        var range = element.GetRange ? element.GetRange() : null;
        if (range) { if (!from) from = range; to = range; }
      }
      var whole = from && to && from !== to ? from.ExpandTo(to) : from;
      if (!whole) return "failed";
      whole.Select();
      return "ok";
    }).then(function (result) {
      if (result !== "ok") return { error: result || "failed" };
      // Block-level control around the selected blocks; Lock 1 = sdtContentLocked.
      return ws.method("AddContentControl", [1, { Tag: message.tag, Lock: 1, Alias: message.alias }]).then(function (control) {
        if (!control) return { error: "failed" };
        Asc.scope.lockTag = message.tag;
        return ws.command(function () {
          var doc = Api.GetDocument();
          var all = doc.GetAllContentControls();
          var wrapper = null;
          for (var i = 0; i < all.length; i++) if (all[i].GetClassType() === "blockLvlSdt" && all[i].GetTag() === Asc.scope.lockTag) wrapper = all[i];
          if (!wrapper) return { error: "failed" };
          if (doc.RemoveSelection) doc.RemoveSelection();
          if (wrapper.GetParentContentControl() || wrapper.GetParentTable()) {
            // Ended up inside a table or control instead of around the blocks: undo.
            wrapper.SetLock("unlocked");
            wrapper.Delete(true);
            return { error: "failed" };
          }
          return { json: wrapper.ToJSON(true, true) };
        });
      });
    }).then(function (result) {
      if (result && result.json) ws.post({ type: "sectionLocked", id: message.id, json: result.json });
      else ws.post({ type: "sectionLockFailed", id: message.id, reason: (result && result.error) || "failed" });
    });
  }

  function commitSection(message) {
    var before = null;
    return stylesSnapshot().then(function (ids) {
      before = ids;
      Asc.scope.commit = { id: message.id, json: message.json };
      return ws.command(function () {
        var c = Asc.scope.commit;
        var doc = Api.GetDocument();
        if (doc.IsTrackRevisions()) return { error: "tracking" };
        var all = doc.GetAllContentControls();
        var wrapper = null;
        for (var i = 0; i < all.length; i++) {
          var tag = all[i].GetTag();
          if (all[i].GetClassType() !== "blockLvlSdt" || !tag || tag.indexOf("mp:section-edit:") !== 0) continue;
          try { if (JSON.parse(tag.slice(16)).id === c.id) wrapper = all[i]; } catch { /* other tag */ }
        }
        if (!wrapper) return { error: "missing" };
        var elements;
        try { elements = Api.FromJSON(c.json); } catch { return { error: "failed" }; }
        if (!elements || !elements.length) elements = [Api.CreateParagraph()];
        wrapper.SetLock("unlocked");
        var content = wrapper.GetContent();
        content.RemoveAllElements();
        var placeholders = content.GetElementsCount();
        for (var j = 0; j < elements.length; j++) wrapper.Push(elements[j]);
        while (placeholders-- > 0) content.RemoveElement(0);
        wrapper.Delete(true);
        return { ok: true };
      });
    }).then(function (result) {
      if (!result || !result.ok) return result || { error: "failed" };
      return dedupeStyles(before).then(function () {
        if (message.citations) return ws.updateCitations();
      }).then(function () { return result; });
    }).then(function (result) {
      ws.post({ type: "sectionCommitted", id: message.id, ok: Boolean(result && result.ok), reason: result && result.error });
    }, function (error) {
      console.warn(error);
      ws.post({ type: "sectionCommitted", id: message.id, ok: false, reason: "failed" });
    });
  }

  /** Removes the lock around a section, keeping its content (discard, stale locks). */
  function releaseSection(message) {
    Asc.scope.release = message.id;
    return ws.command(function () {
      var all = Api.GetDocument().GetAllContentControls();
      for (var i = 0; i < all.length; i++) {
        var tag = all[i].GetTag();
        if (all[i].GetClassType() !== "blockLvlSdt" || !tag || tag.indexOf("mp:section-edit:") !== 0) continue;
        var data = null;
        try { data = JSON.parse(tag.slice(16)); } catch { /* other tag */ }
        if (!data || data.id !== Asc.scope.release) continue;
        all[i].SetLock("unlocked");
        return all[i].Delete(true);
      }
      return false;
    }).then(function (released) { ws.post({ type: "sectionReleased", id: message.id, ok: Boolean(released) }); });
  }

  function reportLocks() {
    return ws.method("GetAllContentControls").then(function (controls) {
      var tags = (controls || []).map(function (control) { return String(control.Tag || ""); })
        .filter(function (tag) { return tag.indexOf("mp:section-edit:") === 0; });
      if (tags.length) ws.post({ type: "sectionLocks", tags: tags, self: ws.state.user.id });
    });
  }

  // --- Section editor (scratch document) ---------------------------------------

  function loadSection(message) {
    var before = null;
    return stylesSnapshot().then(function (ids) {
      before = ids;
      Asc.scope.load = message.json;
      return ws.command(function () {
        var doc = Api.GetDocument();
        var elements;
        try { elements = Api.FromJSON(Asc.scope.load); } catch { return false; }
        if (!elements) return false;
        doc.RemoveAllElements();
        var placeholders = doc.GetElementsCount();
        for (var i = 0; i < elements.length; i++) doc.Push(elements[i]);
        // A document must end with a paragraph (e.g. after a trailing table).
        if (!elements.length || elements[elements.length - 1].GetClassType() !== "paragraph") doc.Push(Api.CreateParagraph());
        while (placeholders-- > 0) doc.RemoveElement(0);
        var first = doc.GetElement(0);
        var start = first && first.GetClassType() === "paragraph" ? first.GetRange(0, 0) : null;
        if (start) start.Select();
        return true;
      });
    }).then(function (loaded) {
      if (!loaded) return false;
      return dedupeStyles(before).then(function () { return true; });
    }).then(function (ok) { ws.post({ type: "sectionLoaded", ok: ok }); }, function (error) {
      console.warn(error);
      ws.post({ type: "sectionLoaded", ok: false });
    });
  }

  function readSection() {
    return ws.read(function () { return Api.GetDocument().ToJSON(false, false, false, false, true, true); })
      .then(function (json) { ws.post({ type: "sectionContent", json: typeof json === "string" ? json : "" }); });
  }

  // --- Styles -----------------------------------------------------------------

  function stylesSnapshot() {
    return ws.read(function () {
      try { return Object.keys(Api.GetDocument().Document.Get_Styles().Style); } catch { return null; }
    });
  }

  /** Removes styles added since `before` that duplicate an existing style of the same name. */
  function dedupeStyles(before) {
    if (!before || !before.length) return Promise.resolve();
    Asc.scope.styleIds = before;
    return ws.command(function () {
      try {
        var styles = Api.GetDocument().Document.Get_Styles();
        var known = {};
        for (var i = 0; i < Asc.scope.styleIds.length; i++) known[Asc.scope.styleIds[i]] = true;
        var added = [];
        for (var id in styles.Style) if (!known[id]) added.push(styles.Style[id]);
        for (var a = 0; a < added.length; a++) {
          for (var key in known) {
            var existing = styles.Style[key];
            if (!existing || existing.Name !== added[a].Name || existing.Type !== added[a].Type || !existing.Is_Similar(added[a])) continue;
            styles.RemapIdReferences(added[a].Get_Id(), existing.Get_Id());
            styles.Remove(added[a].Get_Id());
            break;
          }
        }
        return true;
      } catch {
        return false;
      }
    });
  }

  // --- Wiring -----------------------------------------------------------------

  function registerContextMenu() {
    var item = new Asc.ButtonContextMenu(null);
    item.text = ws.tr("Edit section separately");
    item.editors = ["word"];
    item.addCheckers("Target", "Selection");
    item.attachOnClick(function () { requestSectionEdit().catch(ws.fail); });
    Asc.Buttons.registerContextMenu();
  }

  window.MpWorkspaceSection = {
    handles: function (name) { return COMMANDS.indexOf(name) >= 0; },
    apply: function (message) {
      switch (message.command) {
        case "lockSection": return lockSection(message);
        case "commitSection": return commitSection(message);
        case "releaseSection": return releaseSection(message);
        case "loadSection": return loadSection(message);
        case "readSection": return readSection();
        default: return Promise.resolve();
      }
    },
    init: function () {
      if (ws.state.section) return;
      registerContextMenu();
      reportLocks().catch(function (error) { console.warn(error); });
    },
  };
})(window);
