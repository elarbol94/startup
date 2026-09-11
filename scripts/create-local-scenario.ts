/** Explicit, one-time fictional fixture creation. Never uses the configured database. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

async function main() {
  if (process.env.NODE_ENV === "production" || !process.argv.includes("--create")) {
    throw new Error("Local fixtures only. Run with --create outside production.");
  }
  const root = path.resolve("data/local-scenario");
  if (fs.existsSync(root)) throw new Error(`Refusing to overwrite existing scenario: ${root}`);
  fs.mkdirSync(root, { recursive: true });
  process.env.DATABASE_PATH = path.join(root, "scenario.db");
  process.env.UPLOADS_PATH = path.join(root, "uploads");
  process.env.WIKI_FIGURE_ROOTS = "{}";
  const { runMigrations } = await import("../src/db/migrate");
  await runMigrations();
  // Assert again after environment loading, before inserting any fixtures.
  if (path.resolve(process.env.DATABASE_PATH) !== path.join(root, "scenario.db")) throw new Error("Database isolation lost");
  const { db, sqlite } = await import("../src/db");
  const s = await import("../src/db/schema");
  const { seedDefaults } = await import("../src/db/seed");
  const { saveAttachment } = await import("../src/lib/files");
  const { DEFAULT_DOCUMENT_SETTINGS } = await import("../src/modules/wiki/lib/document-settings");
  const { municipalityAnalysisGraphSchema } = await import("../src/modules/municipalities/analysis");
  const { presentationElementsSchema, presentationStepsSchema } = await import("../src/modules/wiki/lib/presentation");
  seedDefaults();
  const now = new Date();
  const year = now.getFullYear();
  const day = (offset: number, hour = 10) => new Date(year, now.getMonth(), now.getDate() + offset, hour);
  const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const date = (offset: number) => iso(day(offset));
  const password = `AlpenDemo-${crypto.randomBytes(9).toString("base64url")}!`;
  const people = [
    { id: "demo-anna", username: "anna", name: "Anna Berger", role: "admin", job: "Geschäftsführung & Partnerschaften", color: "#2563eb", salary: 520000 },
    { id: "demo-lukas", username: "lukas", name: "Lukas Steiner", role: "member", job: "Softwareentwicklung & Datenplattform", color: "#16a34a", salary: 460000 },
    { id: "demo-miriam", username: "miriam", name: "Miriam Hofer", role: "personnel", job: "Finanzen & People Operations", color: "#9333ea", salary: 380000 },
    { id: "demo-david", username: "david", name: "David Gruber", role: "member", job: "Kommunalforschung & GIS", color: "#ea580c", salary: 410000 },
    { id: "demo-sofia", username: "sofia", name: "Sofia Novak", role: "member", job: "Produktdesign & Kundenbetreuung", color: "#0891b2", salary: 390000 },
  ];
  const passwordHashes = await Promise.all(people.map(() => hashPassword(password)));
  const fictional = "Fiktive lokale Testdaten – keine echten Personen, Forderungen oder Förderzusagen.";
  const projectNames = ["KlimaCockpit – Pilotgemeinden", "EnergieMonitor – Gebäudedaten", "Bürgerdialog – Serviceportal", "KommunalRadar – Standortanalyse", "Alpenblick – Unternehmensaufbau", "Pilot 2025 – Abschlussarchiv"];
  const projectBriefs = [
    "Drei Gemeinden vergleichen Energieverbrauch, Kosten und Maßnahmen. Ziel: ein monatlicher Bericht mit nachvollziehbaren Quellen und freigegebenen Empfehlungen.",
    "Zählerdaten aus kommunalen Gebäuden normalisieren. Fehlende Monate markieren, Importfehler transparent machen und Verbrauch pro Quadratmeter vergleichen.",
    "Ein barrierearmer Prototyp für Meldungen und Beteiligung. Der Pilot umfasst einen moderierten Workshop, Nutzertests und eine dokumentierte Übergabe.",
    "Standortprofile für Gemeinden zwischen 5.000 und 30.000 Einwohnern. Bevölkerung, Altersstruktur und Budgetdaten werden getrennt von eigenen Interpretationen dargestellt.",
    "Interne Abläufe für Angebote, Personal, Liquidität und Wissensmanagement stabilisieren. Verantwortlichkeiten und monatliche Routinen festlegen.",
    "Abgeschlossener Machbarkeitspilot. Erfahrungen, freigegebene Ergebnisse und offene Folgeideen bleiben für neue Projektteams auffindbar.",
  ];
  const deliverables = ["Auftrag und Erfolgskriterien abstimmen", "Datenquellen inventarisieren", "Fachgespräch vorbereiten", "Rohdaten auf Vollständigkeit prüfen", "Importregeln dokumentieren", "Ersten Prototyp bauen", "Kennzahlen fachlich prüfen", "Nutzertest durchführen", "Rückmeldungen priorisieren", "Barrierefreiheit prüfen", "Ergebnisbericht abstimmen", "Freigabe beim Kunden einholen", "Übergabe dokumentieren", "Abschlussrechnung vorbereiten", "Retrospektive durchführen"];
  const pageTitles = ["Willkommen bei Alpenblick", "Strategie und Quartalsziele", "Projektbrief KlimaCockpit", "Datenqualität im Gebäudemonitoring", "Interviewleitfaden für Gemeinden", "Designsystem und Barrierefreiheit", "Onboarding in den ersten 30 Tagen", "Monatsabschluss und Belegprüfung", "Förderprojekt: Nachweise und Termine", "Standortanalyse und Methodik", "Support und Eskalationswege", "Entscheidungsprotokoll Produktteam", "Pilotbericht: Energie und Gebäude", "Workshopkonzept Bürgerdialog", "Technische Architektur", "Risikoregister und Maßnahmen", "Testplan für die Pilotphase", "Kommunikation mit Auftraggebern", "Datenschutz im Testbetrieb", "Retrospektive Sommerpilot", "Angebotsbausteine und Leistungsumfang", "Finanzplanung bis Jahresende", "Research notes: municipal interviews", "Protokoll der letzten Teamrunde"];
  const paragraphs = [
    "Alpenblick entwickelt digitale Werkzeuge für österreichische Gemeinden. Unser fünfköpfiges Team verbindet Datenanalyse, Software und verständliche Kommunikation. Wir arbeiten mit überprüfbaren Ausgangsdaten und halten Annahmen ausdrücklich fest.",
    "Im laufenden Quartal hat die Verlässlichkeit des Piloten Vorrang. Neue Funktionen werden nur aufgenommen, wenn ein konkreter Anwendungsfall und eine verantwortliche Person benannt sind. Anna koordiniert die Freigabe mit den Auftraggebern.",
    "Der Pilot umfasst drei kommunale Ansprechpartner, einen gemeinsamen Datenkatalog und einen monatlichen Review. Die Abnahme erfolgt anhand von nachvollziehbaren Rechenwegen und einer dokumentierten Übergabe an die Fachabteilung.",
    "Für jedes Gebäude werden Zählernummer, Nutzfläche, Abrechnungszeitraum und Quelle erfasst. Fehlende Monate sind keine Nullwerte. David prüft Auffälligkeiten, Lukas dokumentiert die technische Behandlung und Sofia überprüft die Verständlichkeit im Interface.",
    "Das Gespräch beginnt mit dem heutigen Arbeitsablauf und konkreten Beispielen. Erst danach zeigen wir den Prototyp. Aussagen werden anonymisiert zusammengefasst; eine einzelne Rückmeldung ist noch kein Beleg für den Bedarf aller Gemeinden.",
    "Bedienelemente brauchen sichtbare Beschriftungen, klare Fokuszustände und ausreichende Kontraste. Farben unterstützen die Orientierung, ersetzen aber keine Statusangabe. Sofia überprüft die Ansichten auf schmalen Bildschirmen und mit Tastatur.",
    "In der ersten Woche werden Zugänge, Ansprechpartner und Sicherheitsregeln gemeinsam durchgegangen. Jede neue Person bearbeitet eine überschaubare Aufgabe und bekommt Feedback. Nach 30 Tagen überprüfen wir Rolle, Arbeitslast und Lernziele.",
    "Miriam gleicht Bankbewegungen mit Belegen ab und markiert offene Rückfragen. Entwürfe werden erst nach Prüfung finalisiert. Rechnungen, Zahlungen und Leistungszeiträume bleiben voneinander unterscheidbar; Korrekturen werden mit Begründung dokumentiert.",
  ];
  const doc = (title: string, body: string, index: number) => ({ type: "doc", content: [
    { type: "heading", attrs: { level: 1, id: `section-${index}-summary` }, content: [{ type: "text", text: title }] },
    { type: "paragraph", content: [{ type: "text", text: body }] },
    { type: "heading", attrs: { level: 2, id: `section-${index}-decisions` }, content: [{ type: "text", text: "Vorgehen und Entscheidungen" }] },
    { type: "paragraph", content: [{ type: "text", text: "Der aktuelle Stand wurde in der Teamrunde besprochen. Die nächste Prüfung erfolgt anhand der offenen Aufgaben und der Rückmeldungen aus dem Pilot. Änderungen am Umfang benötigen eine kurze schriftliche Begründung." }] },
    { type: "bulletList", content: ["Quellen und Annahmen dokumentieren", "Ergebnisse im Vier-Augen-Prinzip prüfen", "Offene Punkte vor der Freigabe klären"].map(text => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })) },
    { type: "heading", attrs: { level: 2, id: `section-${index}-next` }, content: [{ type: "text", text: "Nächste Schritte" }] },
    { type: "paragraph", content: [{ type: "text", text: `Verantwortlich: ${people[index % 5].name}. Review am ${date(7 + index % 10)}. Status und Änderungen werden im verknüpften Projekt gepflegt. ${fictional}` }] },
  ] });
  const categoryRows = db.select().from(s.categories).all();
  const cat = (name: string) => { const row = categoryRows.find(c => c.name === name); if (!row) throw new Error(name); return row.id; };
  const receiptIds: string[] = [];
  db.transaction(tx => {
    for (const [i, person] of people.entries()) {
      tx.insert(s.user).values({ id: person.id, name: person.name, username: person.username, displayUsername: person.username, email: `${person.username}@alpenblick.example.invalid`, emailVerified: true, role: person.role, createdAt: day(-180 + i * 14), updatedAt: now }).run();
      tx.insert(s.account).values({ id: `account-${person.id}`, accountId: person.id, providerId: "credential", userId: person.id, password: passwordHashes[i], createdAt: day(-180 + i * 14), updatedAt: now }).run();
      tx.insert(s.userProfilePreferences).values({ userId: person.id, markColor: person.color }).run();
    }
    tx.insert(s.appSettings).values({ companyName: "Alpenblick Digital GmbH · LOKALE DEMO", address: "Musterstraße 12\n8010 Graz\nÖsterreich", invoicePrefix: "DEMO-", defaultVatRate: 20 }).run();
    tx.insert(s.businessLocations).values({ id: "demo-office", name: "Studio Graz", state: "Steiermark", municipality: "Graz" }).run();
    for (const [i, person] of people.entries()) {
      tx.insert(s.employees).values({ id: `employee-${i}`, name: person.name, userId: person.id, personnelNumber: `AB-${String(i + 1).padStart(3, "0")}`, employmentType: i === 0 ? "managing_director_asvg" : "employee", locationId: "demo-office", joinedOn: date(-180 + i * 14), collectiveAgreement: "IT-KV – Demoannahme" }).run();
      tx.insert(s.employmentContractPeriods).values({ employeeId: `employee-${i}`, validFrom: date(-180 + i * 14), employmentType: i === 0 ? "managing_director_asvg" : "employee", monthlyAmountCents: person.salary, weeklyMinutes: i === 4 ? 1920 : 2310, workdaysPerWeek: i === 4 ? 4 : 5, overheadRateBasisPoints: 1800, salesMarkupBasisPoints: 2500, collectiveAgreement: "IT-KV – Demoannahme", createdBy: people[2].id }).run();
      tx.insert(s.personnelTaxProfiles).values({ employeeId: `employee-${i}`, validFrom: date(-180 + i * 14) }).run();
    }
    for (const [p, name] of projectNames.entries()) {
      tx.insert(s.projects).values({ id: `project-${p}`, name, description: `${projectBriefs[p]} ${fictional}`, color: people[p % 5].color, status: p === 5 ? "archived" : "active", managerId: people[p % 5].id, plannedStartDate: date(-70), targetEndDate: date(p === 5 ? -10 : 45 + p * 10), createdBy: people[0].id, createdAt: day(-90), updatedAt: day(-p) }).run();
      for (const [c, column] of ["Backlog", "In Arbeit", "Review", "Erledigt"].entries()) tx.insert(s.projectColumns).values({ id: `column-${p}-${c}`, projectId: `project-${p}`, name: column, sortOrder: c * 1000, isCompleted: c === 3 }).run();
      for (const [f, name] of ["Discovery", "Umsetzung", "Pilot und Übergabe"].entries()) tx.insert(s.projectPhases).values({ id: `phase-${p}-${f}`, projectId: `project-${p}`, name, sortOrder: f * 1000, plannedStartDate: date(-60 + f * 30), targetEndDate: date(-30 + f * 35) }).run();
      for (const [t, title] of deliverables.entries()) {
        const complete = p === 5 || t < 4;
        const c = complete ? 3 : t < 8 ? 1 : t < 11 ? 2 : 0;
        const dueOffset = complete ? -35 + t * 3 : -5 + (t - 4) * 4 + p;
        const owner = people[(p + t) % 5].id;
        const id = `task-${p}-${t}`;
        tx.insert(s.tasks).values({ id, projectId: `project-${p}`, columnId: `column-${p}-${c}`, phaseId: `phase-${p}-${Math.floor(t / 5)}`, title, description: `${projectBriefs[p]}\n\nAbnahmekriterium: ${title.toLowerCase()} ist dokumentiert und mit der fachlich verantwortlichen Person abgestimmt. Rückfragen bleiben bis zur Klärung sichtbar.`, assigneeId: owner, priority: t % 5 === 0 ? "high" : t % 3 === 0 ? "low" : "medium", status: complete ? "done" : "open", progress: complete ? 100 : c === 2 ? 85 : c === 1 ? 45 : 0, startDate: date(dueOffset - 8), dueDate: date(dueOffset), completedAt: complete ? day(dueOffset) : null, sortOrder: t * 1000, createdBy: people[p % 5].id, createdAt: day(-65), updatedAt: complete ? day(dueOffset) : day(-t % 4) }).run();
        tx.insert(s.taskAssignees).values({ taskId: id, userId: owner }).run();
        if (t % 4 === 0) tx.insert(s.taskAssignees).values({ taskId: id, userId: people[(p + t + 1) % 5].id }).run();
        if (t > 0 && t % 5 !== 0) tx.insert(s.taskDependencies).values({ predecessorTaskId: `task-${p}-${t - 1}`, successorTaskId: id }).run();
      }
      tx.insert(s.contextLinks).values({ ownerType: "project", ownerId: `project-${p}`, targetType: "wikiPage", targetId: `page-${p + 2}`, route: `/wiki/demo-${p + 2}`, label: pageTitles[p + 2], createdBy: people[0].id }).run();
    }
    for (const [i, person] of people.entries()) {
      for (let m = 0; m < 3; m++) for (let p = 0; p < 3; p++) tx.insert(s.projectHourAllocations).values({ employeeId: `employee-${i}`, projectId: `project-${p}`, payrollMonth: iso(new Date(year, now.getMonth() + m, 1)).slice(0, 7), plannedMinutes: [2400, 1800, 1200][p], costRateCents: [5900, 5400, 4500, 4800, 4600][i], createdBy: people[2].id }).run();
      tx.insert(s.calendars).values({ id: `calendar-${i}`, ownerId: person.id, name: `${person.name.split(" ")[0]} · ${person.job.split(" & ")[0]}`, color: person.color, visibility: i === 2 ? "busy" : "company" }).run();
      tx.insert(s.calendarMemberships).values({ calendarId: `calendar-${i}`, userId: person.id, role: "owner" }).run();
      tx.insert(s.calendarPreferences).values({ userId: person.id, timezone: "Europe/Vienna" }).run();
    }
    tx.insert(s.calendars).values({ id: "calendar-team", ownerId: people[0].id, name: "Alpenblick · Team & Kundentermine", color: "#475569", visibility: "company" }).run();
    for (const person of people) tx.insert(s.calendarMemberships).values({ calendarId: "calendar-team", userId: person.id, role: person.role === "admin" ? "owner" : "editor" }).run();
    const meetingTitles = ["KlimaCockpit: Datenreview", "EnergieMonitor: Import und Qualität", "Bürgerdialog: Prototyp-Feedback", "KommunalRadar: Quellenabgleich", "Pilotgemeinden: offene Fragen", "Sprint-Planung und Prioritäten", "Monatsabschluss: Belegabgleich", "Designreview: mobile Ansichten"];
    let eventCount = 0;
    for (let offset = -28; offset <= 35; offset++) {
      if ([0, 6].includes(day(offset).getDay())) continue;
      for (let slot = 0; slot < 2; slot++) {
        const i = ((offset + 30) * 2 + slot) % 5;
        const id = `event-${eventCount++}`;
        const start = day(offset, slot ? 14 : 10); const end = new Date(start.getTime() + (slot ? 90 : 60) * 60000);
        tx.insert(s.calendarEvents).values({ id, calendarId: slot ? `calendar-${i}` : "calendar-team", title: slot ? `${people[i].name.split(" ")[0]}: Fokus ${["Angebot", "Importpipeline", "Buchhaltung", "Recherche", "Nutzertest"][i]}` : meetingTitles[(offset + 32) % 8], kind: slot ? "focus" : "event", description: "Vorbereitung: aktuellen Projektstand lesen. Ergebnis: Entscheidungen, Verantwortliche und nächste Schritte im Wiki festhalten.", location: slot ? "Studio Graz" : "Besprechungsraum Mur / Videocall", startAt: start, endAt: end, timezone: "Europe/Vienna", createdBy: people[i].id, createdAt: day(offset - 7), updatedAt: day(offset - 5) }).run();
        for (const [a, person] of people.entries()) if (!slot || a === i) tx.insert(s.calendarEventAttendees).values({ eventId: id, userId: person.id, response: offset > 0 && a === 4 ? "tentative" : "accepted" }).run();
      }
    }
    tx.insert(s.calendarEvents).values({ id: "weekly-sync", calendarId: "calendar-team", title: "Team-Check-in: Woche und Engpässe", startAt: day(-7, 9), endAt: new Date(day(-7, 9).getTime() + 30 * 60000), recurrenceRule: "FREQ=WEEKLY;COUNT=12", timezone: "Europe/Vienna", createdBy: people[0].id }).run();
    for (const person of people) tx.insert(s.calendarEventAttendees).values({ eventId: "weekly-sync", userId: person.id, response: "accepted" }).run();
    for (let i = 0; i < 3; i++) tx.insert(s.calendarEvents).values({ id: `absence-${i}`, calendarId: `calendar-${i + 1}`, title: ["Urlaub", "Fortbildung: Datenvisualisierung", "Gemeindeworkshop vor Ort"][i], kind: i === 0 ? "absence" : "event", allDay: true, startDate: date(10 + i * 4), endDate: date(13 + i * 4), timezone: "Europe/Vienna", createdBy: people[i + 1].id }).run();
    for (const [i, title] of pageTitles.entries()) {
      const body = paragraphs[i % paragraphs.length]; const content = doc(title, body, i);
      const status = i % 6 === 0 ? "inbox" : i % 3 === 0 ? "working" : "evergreen";
      tx.insert(s.wikiPages).values({ id: `page-${i}`, title, slug: `demo-${i}`, parentId: i > 7 ? `page-${i % 8}` : null, sortOrder: i * 1000, contentJson: JSON.stringify(content), contentText: `${title}\n${body}\n${fictional}`, status, documentMode: i >= 12 && i <= 17, documentSettingsJson: JSON.stringify(DEFAULT_DOCUMENT_SETTINGS), proofingLanguage: i === 22 ? "en-US" : "de-AT", createdBy: people[i % 5].id, updatedBy: people[(i + 1) % 5].id, createdAt: day(-60 + i), updatedAt: day(-i % 9), version: 2, contentVersion: 2 }).run();
      tx.insert(s.wikiPageRevisions).values({ pageId: `page-${i}`, version: 1, contentVersion: 1, title, contentJson: JSON.stringify(doc(title, `${body} Arbeitsfassung vor dem Teamreview.`, i)), status: "working", citationLocale: "de-DE", createdBy: people[i % 5].id, createdAt: day(-20), label: "Arbeitsfassung vor Teamreview", kind: "manual" }).run();
      tx.insert(s.wikiCommentThreads).values({ id: `thread-${i}`, pageId: `page-${i}`, anchorType: "page", assigneeId: people[(i + 2) % 5].id, createdBy: people[i % 5].id, createdAt: day(-5), resolvedAt: i % 3 === 0 ? day(-1) : null, resolvedBy: i % 3 === 0 ? people[(i + 2) % 5].id : null }).run();
      for (let c = 0; c < 3; c++) tx.insert(s.wikiComments).values({ threadId: `thread-${i}`, body: ["Bitte die Annahmen für den Pilot noch von den bestätigten Ergebnissen trennen. Das erleichtert die Abstimmung mit der Gemeinde.", "Die Quelle ist ergänzt. Zwei Werte sind noch vorläufig; ich habe sie im Review für nächste Woche vorgemerkt.", i % 3 === 0 ? "Geprüft und freigegeben. Die Abgrenzung ist jetzt nachvollziehbar." : "Danke! Ich prüfe die offenen Werte bis zur nächsten Teamrunde und ergänze das Ergebnis."][c], createdBy: people[(i + c) % 5].id, createdAt: day(-5 + c) }).run();
      tx.insert(s.wikiFavorites).values({ userId: people[i % 5].id, entityType: "page", entityId: `page-${i}` }).run();
      tx.insert(s.wikiNotifications).values({ userId: people[(i + 2) % 5].id, actorId: people[i % 5].id, type: "assignment", pageId: `page-${i}`, threadId: `thread-${i}`, readAt: i % 2 === 0 ? null : day(-1) }).run();
    }
    for (const [i, tag] of ["Pilot", "Datenqualität", "Finanzen", "Team", "Recherche", "Freigabe"].entries()) {
      tx.insert(s.wikiTags).values({ id: `tag-${i}`, name: tag, normalizedName: tag.toLowerCase(), createdBy: people[0].id }).run();
      tx.insert(s.wikiCategories).values({ id: `wiki-category-${i}`, name: tag, description: `Argumente und Belege zum Thema ${tag}`, createdBy: people[3].id, sortOrder: i * 1000 }).run();
    }
    for (let i = 0; i < 24; i++) tx.insert(s.wikiPageTags).values({ pageId: `page-${i}`, tagId: `tag-${i % 6}` }).run();
    for (let i = 0; i < 15; i++) {
      tx.insert(s.wikiSources).values({ id: `source-${i}`, title: ["Interviewnotizen Pilotgemeinde", "Messdatenprüfung Gebäude", "Workshopauswertung Bürgerdialog", "Rechercheprotokoll Standortprofil", "Anforderungen an den Monatsbericht"][i % 5] + ` – Runde ${Math.floor(i / 5) + 1}`, type: "report", documentType: "Interner Projektbericht", institution: "Alpenblick Digital – Demo", issuedDate: date(-45 + i * 2), language: "de-AT", abstract: paragraphs[i % 8], notes: fictional, readingStatus: ["toRead", "reading", "read"][i % 3] as "toRead" | "reading" | "read", createdBy: people[i % 5].id, updatedBy: people[(i + 1) % 5].id }).run();
      tx.insert(s.wikiSourceContributors).values({ sourceId: `source-${i}`, literal: people[i % 5].name }).run();
      tx.insert(s.wikiSourceTags).values({ sourceId: `source-${i}`, tagId: `tag-${i % 6}` }).run();
      tx.insert(s.wikiPageSources).values({ pageId: `page-${i + 2}`, sourceId: `source-${i}` }).run();
    }
    for (let i = 0; i < 40; i++) {
      const deadline = i >= 25; const id = `inbox-task-${i}`; const owner = people[i % 5].id;
      const offset = i % 14 - 4;
      tx.insert(s.tasks).values({ id, title: deadline ? `${["Quartalsbericht abgeben", "Kundenfreigabe einholen", "Fördernachweis abschließen", "Pilot-Review durchführen", "Personalplanung bestätigen"][i % 5]} · ${pageTitles[i % 24]}` : `${["Quellen prüfen", "Feedback einarbeiten", "Belege zuordnen", "Pilotdaten vergleichen", "Nächsten Workshop vorbereiten"][i % 5]} · ${pageTitles[i % 24]}`, kind: deadline ? "deadline" : "task", description: `Offener Punkt aus der gemeinsamen Prüfung. ${paragraphs[i % 8]}`, assigneeId: owner, dueDate: date(offset), deadlineAt: deadline ? day(offset, 16) : null, priority: offset < 0 ? "high" : "medium", status: i % 8 === 0 ? "done" : "open", completedAt: i % 8 === 0 ? day(-1) : null, progress: i % 8 === 0 ? 100 : 0, createdBy: people[(i + 1) % 5].id, createdAt: day(-12), updatedAt: day(-i % 3) }).run();
      if (!deadline) tx.insert(s.taskAssignees).values({ taskId: id, userId: owner }).run();
      tx.insert(s.taskContexts).values({ taskId: id, type: "wikiPage", entityId: `page-${i % 24}`, route: `/wiki/demo-${i % 24}`, label: pageTitles[i % 24] }).run();
      tx.insert(s.contextLinks).values({ ownerType: "task", ownerId: id, targetType: "wikiPage", targetId: `page-${i % 24}`, relation: "origin", route: `/wiki/demo-${i % 24}`, label: pageTitles[i % 24], createdBy: owner }).run();
    }
    const customerNames = ["Gemeinde Sonnfeld", "Marktgemeinde Waldbrunn", "Stadtgemeinde Mühlental", "Energiegenossenschaft Morgenrot", "Regionalverband Hügelland", "Stadtwerke Quellenau", "Kulturforum Bergblick", "Mobilitätsregion Süd"];
    for (const [i, name] of customerNames.entries()) tx.insert(s.customers).values({ id: `customer-${i}`, name: `${name} (Demo)`, address: `Musterplatz ${i + 1}\n80${String(i).padStart(2, "0")} Musterort`, email: `kontakt-${i}@kunde.example.invalid`, notes: `${fictional}\nKontakt über Anna Berger; Zahlungsziel 14 Tage.` }).run();
    const addEntry = (id: string, description: string, net: number, rate: number, offset: number, kind: "income" | "expense", categoryId: string, counterparty: string, invoiceId?: string, draft = false) => {
      const vat = Math.round(net * rate / 100); const gross = net + vat;
      const row = { id, kind, date: date(offset), documentDate: date(offset - 2), documentNumber: invoiceId ? `DEMO-${year}-${String(Number(invoiceId.split("-")[1]) + 1).padStart(4, "0")}` : `DEMO-B-${id}`, description, counterparty, categoryId, grossAmountCents: gross, netAmountCents: net, vatAmountCents: vat, vatRate: rate, status: draft ? "draft" as const : "finalized" as const, invoiceId, notes: fictional, createdBy: people[2].id, createdAt: day(offset), updatedAt: day(offset) };
      tx.insert(s.entries).values(row).run();
      tx.insert(s.entryTaxLines).values({ entryId: id, description, netAmountCents: net, vatRate: rate, vatAmountCents: vat, grossAmountCents: gross }).run();
      tx.insert(s.entryPaymentLines).values({ entryId: id, date: date(offset), recipient: counterparty, amountCents: gross }).run();
      tx.insert(s.entryAuditLog).values({ entryId: id, action: "create", snapshot: row, reason: "Lokales Demoszenario", changedBy: people[2].id, changedAt: day(offset) }).run();
    };
    for (let i = 0; i < 24; i++) {
      const status = i < 15 ? "paid" : i < 21 ? "sent" : i < 23 ? "draft" : "canceled";
      const offset = i < 15 ? -150 + i * 6 : Math.min(-1, -35 + (i - 15) * 5);
      const net = 145000 + (i % 6) * 35000;
      tx.insert(s.invoices).values({ id: `invoice-${i}`, invoiceNumber: `DEMO-${year}-${String(i + 1).padStart(4, "0")}`, numberYear: year, numberSeq: i + 1, customerId: `customer-${i % 8}`, issueDate: date(offset), dueDate: date(offset + 14), status, paidAt: status === "paid" ? day(offset + 10) : null, notes: `Leistungsumfang: ${projectNames[i % 5]}. ${fictional}`, createdBy: people[0].id, createdAt: day(offset), updatedAt: day(status === "paid" ? offset + 10 : offset) }).run();
      tx.insert(s.invoiceItems).values({ invoiceId: `invoice-${i}`, description: `${projectNames[i % 5]} – Analyse und Umsetzung`, quantityThousandths: 10000, unitPriceCents: net / 10, vatRate: 20, sortOrder: 0 }).run();
      tx.insert(s.invoiceItems).values({ invoiceId: `invoice-${i}`, description: "Ergebnisgespräch und Dokumentation", quantityThousandths: 2000, unitPriceCents: 12500, vatRate: 20, sortOrder: 1000 }).run();
      if (status === "paid") addEntry(`income-${i}`, `Zahlung ${projectNames[i % 5]}`, net + 25000, 20, offset + 10, "income", cat("Erlöse 20 % USt"), customerNames[i % 8], `invoice-${i}`);
    }
    const expenses = [
      ["Studio-Miete Graz", "Miete", 125000, 20, "Raumwerk Büroservice"],
      ["Cloudbetrieb und Datensicherung", "Software & Hosting", 24900, 20, "Alpencloud Hosting"],
      ["Internet und Mobilfunk", "Telefon & Internet", 13900, 20, "Netzwerk Telekom"],
      ["Externe Datenaufbereitung", "Fremdleistungen", 175000, 20, "Datenatelier KG"],
      ["Workshopmaterial", "Büromaterial", 18600, 20, "Papier & Plan"],
      ["Fachbuch kommunale Energiedaten", "Fachliteratur", 5800, 10, "Wissensraum Verlag"],
      ["Bahnfahrt zum Pilotworkshop", "Reisekosten", 7600, 10, "Demo Bahnverkehr"],
      ["Betriebshaftpflicht", "Versicherungen", 19500, 0, "Demo Versicherung"],
      ["Teamgehälter laut Demoabrechnung", "Personalkosten", 2100000, 0, "Alpenblick Team"],
      ["Kontoführung", "Bankspesen", 2800, 0, "Demo Hausbank"],
      ["Pilotkommunikation und Druck", "Werbung & Marketing", 32500, 20, "Studio Morgen"],
      ["Strom Studio", "Strom & Energie", 16700, 20, "Demo Energie"],
    ] as const;
    for (let m = 0; m < 6; m++) for (const [i, expense] of expenses.entries()) {
      const id = `expense-${m}-${i}`; const [title, category, net, rate, supplier] = expense;
      addEntry(id, `${title} · Monat ${m + 1}`, net + (i === 3 ? m * 10000 : 0), rate, -175 + m * 30 + i, "expense", cat(category), `${supplier} (Demo)`);
      if (i < 4) receiptIds.push(id);
    }
    for (let i = 0; i < 4; i++) addEntry(`draft-expense-${i}`, `Belegprüfung offen: ${expenses[i][0]}`, expenses[i][2], expenses[i][3], -i, "expense", cat(expenses[i][1]), expenses[i][4], undefined, true);
    for (const c of categoryRows) for (let month = 1; month <= 12; month++) tx.insert(s.budgetPlans).values({ categoryId: c.id, year, month, amountCents: c.kind === "income" ? c.name === "Erlöse 20 % USt" ? 3800000 + month * 85000 : c.name === "Förderungen" && month % 3 === 0 ? 1500000 : 0 : c.name === "Personalkosten" ? 2800000 : c.name === "Miete" ? 150000 : 35000 }).run();
    for (let f = 0; f < 3; f++) {
      tx.insert(s.fundingProjects).values({ id: `funding-${f}`, name: ["KlimaCockpit Forschungspilot", "EnergieMonitor Markteinführung", "Bürgerdialog Machbarkeitsstudie"][f], fundingBody: "Demo Innovationsagentur", programName: "Fiktives Innovationsprogramm", status: ["active", "submitted", "preparing"][f] as "active" | "submitted" | "preparing", fundingRateBasisPoints: 5000, fundingCapCents: 6000000, approvedFundingCents: f === 0 ? 3000000 : 0, submissionDeadline: date(f === 0 ? -100 : f === 1 ? -14 : 21), projectStart: date(-90), projectEnd: date(120), vatDeductible: true, notes: fictional, contactName: "Demo Förderbetreuung", contactEmail: "foerderung@example.invalid", createdBy: people[0].id }).run();
      for (const [i, costType] of (["personnel", "external_services", "material", "travel"] as const).entries()) {
        const total = [3600000, 1600000, 500000, 300000][i];
        tx.insert(s.fundingBudgetItems).values({ id: `funding-budget-${f}-${i}`, projectId: `funding-${f}`, costType, description: ["Entwicklung und Forschung", "Externe Datenprüfung", "Pilotmaterial", "Gemeindeworkshops"][i], unitPriceCents: total, totalCents: total, eligibleAmountCents: total, workPackage: `AP${i + 1}`, plannedMonth: date(0).slice(0, 7), necessityJustification: "Für den Pilotumfang notwendig; fiktive Planannahme.", sortOrder: i * 1000 }).run();
        tx.insert(s.fundingEvidenceItems).values({ projectId: `funding-${f}`, budgetItemId: `funding-budget-${f}-${i}`, name: ["Stundenaufzeichnungen", "Prüfbericht Datenqualität", "Rechnungen und Zahlungsnachweise", "Workshopprotokolle"][i], status: ["partial", "complete", "missing", "partial"][i] as "partial" | "complete" | "missing", dueDate: date(14 + i * 7), notes: "Demo: Vollständigkeit vor nächstem Bericht prüfen." }).run();
      }
      for (const [i, sourceType] of (["requested_grant", "own_funds"] as const).entries()) tx.insert(s.fundingFinancingSources).values({ projectId: `funding-${f}`, sourceType, label: i ? "Eigenmittel" : "Beantragte Förderung", amountCents: 3000000 }).run();
      tx.insert(s.fundingDisbursements).values({ projectId: `funding-${f}`, label: "Erste Tranche", amountCents: 1500000, plannedDate: date(f === 0 ? -30 : 60), status: f === 0 ? "received" : "planned", receivedAt: f === 0 ? date(-30) : null }).run();
      tx.insert(s.fundingDisbursements).values({ projectId: `funding-${f}`, label: "Schlussrate nach Nachweis", amountCents: 1500000, plannedDate: date(120) }).run();
      tx.insert(s.personnelFundingProjectLinks).values({ projectId: `project-${f}`, fundingProjectId: `funding-${f}` }).run();
    }
    addEntry("grant-income", "KlimaCockpit – erste Fördertranche", 1500000, 0, -30, "income", cat("Förderungen"), "Demo Innovationsagentur");
    tx.insert(s.fundingIncomeLinks).values({ projectId: "funding-0", accountingEntryId: "grant-income" }).run();
    for (let m = 0; m < 3; m++) tx.insert(s.fundingBookingAllocations).values({ projectId: "funding-0", budgetItemId: "funding-budget-0-1", accountingEntryId: `expense-${m}-3`, bookingDate: date(-172 + m * 30), description: "Anteilig zugeordnete Datenaufbereitung", actualAmountCents: 100000, evidenceStatus: m === 0 ? "complete" : "partial" }).run();
    // Saved graphs use the existing bundled official dataset; no public data is modified.
    for (const [u, person] of people.entries()) for (let a = 0; a < 2; a++) {
      const graph = municipalityAnalysisGraphSchema.parse({ version: 2, subject: { municipalityCode: a ? "60101" : "50101", municipalityName: a ? "Graz" : "Salzburg" }, nodes: [
        { id: "population", type: "dataset", position: { x: 0, y: 0 }, data: { dataset: { kind: "population", view: "count" } } },
        { id: "area", type: "dataset", position: { x: 0, y: 230 }, data: { dataset: { kind: "attribute", field: "area" } } },
        { id: "density", type: "operator", position: { x: 370, y: 80 }, data: { operator: "divide", alias: "Einwohner je km²" } },
        { id: "note", type: "annotation", position: { x: 700, y: 0 }, data: { text: "Demo-Arbeitsmappe: Bevölkerungsdichte zur Einordnung kommunaler Strukturen. Keine Aussage über die Qualität kommunaler Leistungen.", color: "sand" } },
      ], edges: [{ id: "a", source: "population", target: "density", targetHandle: "a" }, { id: "b", source: "area", target: "density", targetHandle: "b" }], viewport: { x: 20, y: 30, zoom: 0.8 }, selectedNodeId: "density" });
      tx.insert(s.municipalityAnalyses).values({ ownerId: person.id, name: `${a ? "Graz" : "Salzburg"}: Dichte und Standortprofil`, graphJson: JSON.stringify(graph) }).run();
      if (!a) tx.insert(s.municipalityMetrics).values({ ownerId: person.id, name: `Demo: Bevölkerungsänderung zum Vorjahr (${u + 1})`, unit: "persons", expressionJson: JSON.stringify({ op: "subtract", a: { input: { kind: "population", view: "count" } }, b: { op: "shift", years: 1, a: { input: { kind: "population", view: "count" } } } }) }).run();
    }
  });
  // Real attachments enter through the application's existing validated store.
  async function attachPdf(entityType: "entry" | "invoice" | "wikiSource", entityId: string, title: string, lines: string[]) {
    const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const page = pdf.addPage([595.28, 841.89]);
    page.drawRectangle({ x: 0, y: 756, width: 595.28, height: 86, color: rgb(0.08, 0.23, 0.27) });
    page.drawText("ALPENBLICK DIGITAL", { x: 44, y: 804, size: 18, font: bold, color: rgb(1, 1, 1) });
    page.drawText("LOKALE DEMO / FIKTIVER BELEG", { x: 44, y: 782, size: 10, font, color: rgb(0.8, 0.9, 0.9) });
    const wrap = (text: string) => text.replace(/[–—]/g, "-").match(/.{1,76}(?:\s|$)|.{1,76}/g) ?? [];
    let y = 718;
    for (const line of wrap(title)) { page.drawText(line.trim(), { x: 44, y, size: 14, font: bold }); y -= 22; }
    y -= 15;
    for (const text of lines) { for (const line of wrap(text)) { page.drawText(line.trim(), { x: 44, y, size: 10, font }); y -= 16; } y -= 12; }
    if (y < 85) throw new Error(`PDF overflow: ${title}`);
    page.drawText("Nur zur Funktionsprüfung. Keine Zahlung auslösen. Seite 1 / 1", { x: 44, y: 44, size: 9, font });
    return saveAttachment({ entityType, entityId, userId: people[2].id, file: new File([new Uint8Array(await pdf.save())], `${entityId}.pdf`, { type: "application/pdf" }) });
  }
  for (const id of receiptIds) {
    const entry = db.select().from(s.entries).where(eq(s.entries.id, id)).get()!;
    await attachPdf("entry", id, entry.description, [`Lieferant: ${entry.counterparty}`, `Belegnummer: ${entry.documentNumber}`, `Belegdatum: ${entry.documentDate} | Zahlung: ${entry.date}`, `Netto: EUR ${(entry.netAmountCents / 100).toFixed(2)}`, `USt ${entry.vatRate}%: EUR ${(entry.vatAmountCents / 100).toFixed(2)}`, `Gesamt: EUR ${(entry.grossAmountCents / 100).toFixed(2)}`, "Leistung für das lokale Beispielszenario. Zugeordnet und von Miriam Hofer geprüft.", fictional]);
  }
  for (let i = 0; i < 6; i++) {
    const inv = db.select().from(s.invoices).where(eq(s.invoices.id, `invoice-${i}`)).get()!;
    await attachPdf("invoice", inv.id, `${inv.invoiceNumber} / ${projectNames[i % 5]}`, [`Rechnungsdatum: ${inv.issueDate} | Zahlungsziel: ${inv.dueDate}`, "Analyse, Umsetzung und Ergebnisgespräch gemäß Demo-Leistungsumfang.", "Die verbindlichen Demo-Positionen und Summen stehen in der Rechnungsansicht.", fictional]);
  }
  for (let i = 0; i < 9; i++) {
    const source = db.select().from(s.wikiSources).where(eq(s.wikiSources.id, `source-${i}`)).get()!;
    const attachment = await attachPdf("wikiSource", source.id, source.title, [`Autor: ${people[i % 5].name} | Stand: ${source.issuedDate}`, source.abstract, "Beobachtung: Die Pilotpartner wünschen nachvollziehbare Datenherkunft und klare Zuständigkeiten. Fehlende Messwerte sollen sichtbar bleiben.", "Nächster Schritt: Rückfragen sammeln, Datenprüfung abschließen und die Ergebnisse im Review besprechen.", fictional]);
    db.insert(s.wikiPdfDocuments).values({ id: `pdf-${i}`, sourceId: source.id, attachmentId: attachment.id, status: "queued", createdBy: people[i % 5].id }).run();
    db.insert(s.wikiPdfAnnotations).values({ id: `annotation-${i}`, sourceId: source.id, documentId: `pdf-${i}`, pageNumber: 1, kind: "bookmark", label: "Für das Pilot-Review", note: "Datenherkunft und Zuständigkeit mit der Gemeinde abstimmen.", createdBy: people[3].id, updatedBy: people[3].id }).run();
    db.insert(s.wikiPdfAnnotationComments).values({ annotationId: `annotation-${i}`, body: "Bitte im nächsten Review prüfen, welche Felder bereits bestätigt sind.", createdBy: people[0].id }).run();
    db.insert(s.evidenceLinks).values({ annotationId: `annotation-${i}`, targetType: "wikiPage", targetId: `page-${i + 2}`, createdBy: people[3].id }).run();
  }
  for (let i = 0; i < 5; i++) {
    const title = ["KlimaCockpit: Pilot-Review", "EnergieMonitor: Umsetzung", "Bürgerdialog: Workshop", "KommunalRadar: Methodik", "Alpenblick: Quartalsplanung"][i];
    const elements = []; const steps = [];
    const sections = [title, "Ausgangslage", "Vorgehen", "Offene Entscheidungen", "Nächste Schritte"];
    for (let f = 0; f < 5; f++) {
      const id = `frame-${i}-${f}`; const x = f * 1100;
      elements.push({ id, type: "frame", x, y: 0, width: 960, height: 540, rotation: 0, background: "#f5f8f7", content: { label: sections[f], shape: "rect" } });
      elements.push({ id: `title-${i}-${f}`, type: "text", parentId: id, x: x + 60, y: 60, width: 840, height: 90, rotation: 0, content: { text: sections[f], fontSize: 40, bold: true, color: "#153c43", align: "left" } });
      elements.push({ id: `body-${i}-${f}`, type: "text", parentId: id, x: x + 60, y: 185, width: 820, height: 255, rotation: 0, content: { text: f === 0 ? `${projectBriefs[i]}\n\n${people[i].name} · ${date(0)}` : f === 4 ? `Review am ${date(7)}\nDatenprüfung abschließen\nKundenfeedback priorisieren\nFreigabe und Übergabe dokumentieren` : paragraphs[(i + f) % 8], fontSize: 25, bold: false, color: "#284d51", align: "left" } });
      steps.push({ id: `step-${i}-${f}`, elementId: id, durationMs: 6000, notes: `Demo-Präsentation. ${projectBriefs[i]}` });
    }
    const parsed = { elements: presentationElementsSchema.parse(elements), steps: presentationStepsSchema.parse(steps) };
    db.insert(s.wikiPresentations).values({ id: `presentation-${i}`, title, elementsJson: JSON.stringify(parsed.elements), pathJson: JSON.stringify(parsed.steps), createdBy: people[i].id, updatedBy: people[(i + 1) % 5].id }).run();
    db.insert(s.wikiPresentationAccess).values({ presentationId: `presentation-${i}`, coediting: true }).run();
    db.insert(s.wikiPresentationComments).values({ presentationId: `presentation-${i}`, elementId: `frame-${i}-3`, body: "Die offenen Entscheidungen bitte beim Kundenreview zuerst besprechen.", authorId: people[(i + 2) % 5].id }).run();
    db.insert(s.wikiPresentationRevisions).values({ presentationId: `presentation-${i}`, title: `${title} – Arbeitsfassung`, elementsJson: JSON.stringify(parsed.elements), pathJson: JSON.stringify(parsed.steps), createdBy: people[i].id, createdAt: day(-7) }).run();
  }
  const { completeScenarioDetails } = await import("./local-scenario-details");
  await completeScenarioDetails();
  if ((sqlite.pragma("foreign_key_check") as unknown[]).length) throw new Error("Foreign-key verification failed");
  if (sqlite.pragma("integrity_check", { simple: true }) !== "ok") throw new Error("SQLite integrity check failed");
  const tables = ["user", "projects", "tasks", "calendar_events", "employees", "project_hour_allocations", "invoices", "entries", "budget_plans", "funding_projects", "wiki_pages", "wiki_sources", "wiki_comments", "wiki_presentations", "attachments", "municipality_analyses", "platform_versions"];
  const counts = Object.fromEntries(tables.map(table => [table, (sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n]));
  const manifest = { kind: "alpenblick-local-scenario", createdAt: now.toISOString(), database: process.env.DATABASE_PATH, uploads: process.env.UPLOADS_PATH, users: people.map(p => ({ username: p.username, name: p.name, role: p.role, job: p.job })), password, counts };
  fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(root, "LOGIN.md"), `# Alpenblick local demo\n\n${fictional}\n\nURL: http://localhost:3000\n\nPassword for all five demo accounts: ${password}\n\n${people.map(p => `- ${p.username}: ${p.name} — ${p.job} (${p.role})`).join("\n")}\n\nStart: npm run dev:scenario\nTraffic: npm run traffic:scenario\n\nDatabase and uploads are exclusively under data/local-scenario. Ordinary npm run dev keeps its original configuration.\n`);
  sqlite.close();
  console.log(JSON.stringify({ root, counts, logins: path.join(root, "LOGIN.md") }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
