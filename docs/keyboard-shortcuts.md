# Keyboard shortcuts

Every letter is a German mnemonic taken from the German label of the action. The source of
truth is `src/lib/app-shortcuts.ts` (rules in its header comment); the clash test is
`src/lib/shortcuts.test.ts`. Single keys and `G` sequences never fire while typing or inside
dialogs and menus. "Strg" is ⌘ on macOS.

## Rules

- `G` + letter = **G**ehe zu, followed by the first letter of the section name.
- When two names share a letter, the more frequent one keeps it and the other takes the next
  distinctive German word (Personal → **L**ohnverrechnung, Besprechungen → **S**itzungen).
- The same action uses the same key everywhere: **N** = Neu, **/** = Suchen, **H** = Heute,
  **?** = Tastenkürzel, digits switch the views of a page.
- Shift picks the variant of a view (Shift+W Arbeitswoche, Shift+T Team).
- Universal keys stay: Strg+K search, Strg+Z/Strg+Umschalt+Z, Strg+C/X/V/A, Strg+B/I/U in text,
  Strg+F find, Strg+S save, Strg+P print, arrows, Esc, Enter.
- Never bind keys the browser keeps for itself (Strg+N/T/W and their Shift variants).

## Global

| Key | Action |
|---|---|
| Strg+K | Suchen |
| Strg+Umschalt+A | Neue **A**ufgabe |
| Strg+Umschalt+D | Neue **D**eadline |
| Strg+Umschalt+M | Fehler **m**elden |
| Strg+Umschalt+F | **F**okusmodus |
| Alt+Q (Umschalt: zurück) | Zuletzt genutzte Tabs wechseln (Q liegt neben Tab, wie Alt+Tab) |

## Navigation

| Key | Section |
|---|---|
| G Ü | **Ü**bersicht |
| G K | **K**alender |
| G B | **B**uchhaltung |
| G L | Personal (**L**ohnverrechnung) |
| G Z | **Z**eiterfassung |
| G P | **P**rojekte |
| G S | Besprechungen (**S**itzungen) |
| G W | **W**iki |
| G G | **G**emeinden |
| G N | **N**etzwerk |
| G E | **E**instellungen |

## Pages

| Section | Keys |
|---|---|
| Kalender | H Heute · ←/→ zurück/weiter · T Tag · Shift+W Arbeitswoche · W Woche · M Monat · A Agenda · Shift+T Team · N Neuer Termin · / Suchen · Strg+Z Verschieben rückgängig · ? Hilfe |
| Projekte (Zeitplan) | 1 Zeitplan · 2 Projektübersicht · W/M/Q Woche/Monat/Quartal · H Heute · E Einpassen · K Kritischer Pfad · L Linien · N Neues Projekt · Shift+N Unteraufgabe · / Suchen · F Fokus auf Aufgabe |
| Projekt | 1 Aufgaben · 2 Wissen · 3 Aktivität · N Neue Aufgabe |
| Netzwerk | N Kontakt erfassen · / Kontaktsuche · Strg+Enter speichert die Schnellerfassung |
| Buchhaltung | N Neue Buchung / Rechnung / Kunde (je Tab) · / Rechnungssuche |
| Förderprojekte | N Neues Förderprojekt |
| Personal | N Neue Person (aus jedem Tab) |
| Zeiterfassung | N Neuer Eintrag · H diese Woche |
| Besprechungen | N Neue Besprechung · / Suchen |
| Gemeinden | / Gemeindesuche · Analyse: ⇧ ⇧ Schnell hinzufügen, Strg+Z / Strg+Umschalt+Z |
| Einstellungen | N Einladen / Hinzufügen (Benutzer, Kategorien, Standorte) |
| Wiki | ⇧ ⇧ Wiki-Inhalt öffnen · / Recherche-Suche · Strg+Umschalt+E neues Dokument im **E**ingang |

## Presentation editor

T **T**ext · V **V**iereck · E **E**llipse · L **L**inie · R **R**ahmen. Object shortcuts follow
PowerPoint: Strg+D duplizieren, Strg+G gruppieren, Strg+Umschalt+G Gruppierung aufheben,
Strg+]/[ Ebene, Strg+Umschalt+C/V Format kopieren/einfügen, ⇧ ⇧ Befehle.

## PDF reader

Users can rebind every action in the reader's shortcut dialog; these are the defaults.
Preferences saved with an old default move to the new one (version 4); custom keys stay.

| Key | Action |
|---|---|
| Strg+←/→ | Seite zurück/weiter |
| Strg+Alt+B | An **B**reite anpassen |
| Strg+Alt+G | **G**anze Seite |
| Strg+Umschalt+G | **G**roß-/Kleinschreibung |
| Strg+Alt+W | Nur ganze **W**örter |
| Strg+Alt+S / F / L | **S**eiten / Suche (**F**inden) / G**l**iederung |
| Strg+Alt+N | **N**avigator ein-/ausblenden |
| Strg+Umschalt+B | **B**ereich markieren |
| Strg+Umschalt+S | **S**eite merken |
| Strg+Alt+K | **K**ommentare |
| Strg+E | Annotation **e**ditieren |
| Strg+Alt+R | d**r**ehen |
| Strg+O | **O**riginal öffnen |
