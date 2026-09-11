import path from "node:path";
import { eq } from "drizzle-orm";

/** Fixture-only enrichment, called once by the local creator. */
export async function completeScenarioDetails() {
  const root = path.resolve("data/local-scenario");
  if (process.env.NODE_ENV === "production" || path.resolve(process.env.DATABASE_PATH ?? "") !== path.join(root, "scenario.db") || path.resolve(process.env.UPLOADS_PATH ?? "") !== path.join(root, "uploads")) throw new Error("Expected isolated local scenario paths");
  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const { saveAttachment } = await import("../src/lib/files");
  const { DEFAULT_DOCUMENT_SETTINGS } = await import("../src/modules/wiki/lib/document-settings");
  const { presentationTemplates, localizedPresentationTemplate } = await import("../src/modules/wiki/lib/presentation-templates");
  const base = new Date();
  const date = (offset: number) => { const d = new Date(base); d.setDate(d.getDate() + offset); d.setHours(10, 0, 0, 0); return d; };
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const bodies = [
    "Alpenblick Digital arbeitet von Graz aus an Software für kommunale Teams. Anna führt Kundengespräche und priorisiert den Auftragseingang. Lukas betreut die Datenplattform, David die fachliche Recherche, Sofia den Prototyp und Miriam die Finanzen. Jeden Freitag gleichen wir Zusagen, Kapazität und offene Entscheidungen ab.",
    "Bis Quartalsende sollen drei Pilotberichte freigegeben sein. Der Energieimport muss fehlende Messwerte zuverlässig kennzeichnen; der Bürgerdialog-Prototyp soll von fünf Testpersonen ohne Einführung bedient werden können. Zusätzliche Wünsche kommen ins Backlog. Anna entscheidet mit dem Team, welche Zusage noch in die verfügbare Kapazität passt.",
    "Sonnfeld, Waldbrunn und Mühlental erproben einen gemeinsamen Monatsbericht. Die Gemeinden liefern Abrechnungen und Gebäudelisten; Alpenblick erstellt den Datenkatalog und den Prototyp. Abnahmefähig ist der Pilot, wenn jeder dargestellte Wert auf eine Quelle zurückgeführt werden kann und die Fachabteilung die offenen Annahmen bestätigt hat.",
    "Für jedes Gebäude werden Zählernummer, Nutzfläche, Zeitraum und Quelldatei gespeichert. Von 36 erwarteten Monatswerten liegen im Demo-Pilot 32 vor. Zwei Lücken betreffen einen Zählerwechsel und zwei eine verspätete Abrechnung. Fehlende Werte werden nicht als Null behandelt. David klärt die Fälle fachlich; Lukas ergänzt die Importprüfung.",
    "Das Interview dauert 45 Minuten: 10 Minuten zum bisherigen Ablauf, 20 Minuten zu einem konkreten Bericht und 15 Minuten zum Prototyp. Sofia fragt nach der letzten schwierigen Entscheidung, nicht nach gewünschten Funktionen. Die Notizen unterscheiden Beobachtung, wörtliche Aussage und Interpretation. Teilnehmernamen bleiben außerhalb des gemeinsamen Berichts.",
    "Das Designsystem verwendet klare Beschriftungen, sichtbare Fokuszustände und eine gemeinsame Farbpalette. Status darf nie ausschließlich über Farbe erkennbar sein. Im nächsten Review prüft Sofia insbesondere breite Tabellen, Dialoge auf dem Telefon und die Navigation mit Tastatur. Der Prototyp erhält erst nach diesem Check die Freigabe für den Workshop.",
    "Am ersten Tag werden Zugänge und Ansprechpartner gemeinsam erklärt. In Woche eins begleitet die neue Person ein Kundengespräch und bearbeitet eine kleine Aufgabe mit Review. Nach zwei Wochen besprechen wir Arbeitslast und Rückfragen. Miriam organisiert den 30-Tage-Termin; die fachliche Begleitung übernimmt jeweils eine Person aus dem Projektteam.",
    "Miriam ordnet jede Bankbewegung einem Beleg zu und prüft Zahlungsdatum, Umsatzsteuer und Leistungsumfang. Fehlende Dokumente bleiben als Entwurf sichtbar. Anna prüft die offenen Kundenrechnungen am Monatsende. Vor der Freigabe müssen Zahlungsbetrag, Steuerzeilen und Rechnungsbezug übereinstimmen; eine Korrektur erhält immer eine nachvollziehbare Begründung.",
    "Der fiktive KlimaCockpit-Forschungspilot hat ein Budget von 60.000 EUR und einen Förderanteil von 50 Prozent. Die erste Demo-Tranche von 15.000 EUR ist eingegangen. Externe Leistungen werden nur anteilig zugeordnet. Miriam sammelt Rechnungen und Zahlungsnachweise; David führt die fachlichen Berichte, Anna stimmt die Einreichung ab. Dies ist keine reale Förderzusage.",
    "Die Standortanalyse trennt amtliche Ausgangsdaten von selbst berechneten Kennzahlen. Für den Vergleich werden Gemeindegröße und Datenjahr angegeben. Bevölkerungsdichte ist Einwohnerzahl geteilt durch Fläche; sie bewertet weder Servicequalität noch wirtschaftlichen Erfolg. David dokumentiert Datenlücken und vermeidet Ranglisten, wenn die Definitionen nicht vergleichbar sind.",
    "Sofia nimmt Rückmeldungen aus dem Pilot auf und fragt nach Reproduktionsschritten, betroffener Ansicht und gewünschtem Ergebnis. Ein blockierter Monatsbericht wird am selben Arbeitstag an Lukas und Anna weitergegeben. Reine Darstellungswünsche werden im wöchentlichen Review priorisiert. Die Rückmeldung an den Kunden nennt eine verantwortliche Person und den nächsten Termin.",
    "Beschluss der Produktteamrunde: Der Import zeigt unvollständige Zeitreihen ausdrücklich an. Eine automatische Schätzung wird vorerst nicht umgesetzt. Lukas baut die Prüfung, Sofia formuliert die Hinweise und David liefert drei fachliche Beispiele. Anna informiert die Pilotpartner. Die Entscheidung wird nach zwei vollständigen Monatsberichten erneut bewertet.",
    "Im Demo-Gebäudepilot wurden drei Liegenschaften betrachtet. Bei zwei Gebäuden stimmen Abrechnung und Messreihe überein; im dritten ist ein Zählerwechsel offen. Die Auswertung zeigt deshalb vorläufig nur bestätigte Zeiträume. Der Bericht empfiehlt zuerst die Klärung der Stammdaten, bevor aus Verbrauchsunterschieden eine Sanierungsmaßnahme abgeleitet wird.",
    "Der Bürgerdialog-Workshop umfasst sechs fiktive Verwaltungsmitarbeitende. Nach einer kurzen Einführung bearbeiten sie drei Aufgaben: Meldung erfassen, Zuständigkeit erkennen und Rückmeldung verfolgen. Sofia moderiert, David protokolliert Beobachtungen und Anna sammelt organisatorische Fragen. Die letzte halbe Stunde dient der Priorisierung; zugesagte Änderungen werden im Projektboard erfasst.",
    "Die Anwendung führt strukturierte Daten in SQLite und Dateien im gemeinsamen Attachment-Store. Eingaben werden vor dem Speichern validiert. Lukas überprüft Importläufe mit kleinen Referenzdateien, bevor neue Datenquellen freigeschaltet werden. Für die lokale Demo sind Datenbank und Uploads vollständig getrennt; externe Einladungsmails und Ordnersynchronisation sind deaktiviert.",
    "Die wichtigsten Pilotrisiken sind verspätete Quelldaten, uneinheitliche Gebäudenamen und zu viele gleichzeitige Änderungswünsche. David pflegt eine Liste der offenen Datenfragen. Sofia bündelt Feedback nach Arbeitsablauf statt nach Einzelfunktion. Anna entscheidet bei Terminrisiken gemeinsam mit dem Auftraggeber über eine kleinere, überprüfbare Lieferung.",
    "Der Pilot-Testplan umfasst Anmeldung mit fünf Rollenprofilen, Suche, Aufgabenfilter, Terminüberschneidungen, Belegansicht und gemeinsame Dokumentprüfung. Für Rechnungen werden bezahlte, offene, stornierte und unfertige Beispiele verwendet. Bei einem Fehler werden erwartetes Ergebnis, tatsächliches Verhalten und betroffener Datensatz festgehalten. Nur lokale Testdaten dürfen verändert werden.",
    "Nach jedem Kundentermin versendet die verantwortliche Person eine kurze Zusammenfassung mit Beschlüssen, offenen Punkten und Terminen. Neue Anforderungen werden erst nach Aufwandsschätzung zugesagt. Anna hält die kommerzielle Abstimmung zusammen; Sofia ist erste Ansprechpartnerin für den Pilotablauf. Interne Unsicherheiten werden vor einer verbindlichen Zusage geklärt.",
    "Dieses Szenario enthält ausschließlich erfundene Personen und Geschäftsvorgänge. Testdateien dürfen keine Originalbelege oder personenbezogenen Kundendaten enthalten. Für reproduzierbare Fehlerberichte reichen Datensatz-ID und Ablauf. Die Demo-Datenbank liegt unter data/local-scenario; sie wird weder synchronisiert noch auf den Homeserver übertragen.",
    "Der Sommerpilot lieferte einen verständlichen Prototyp und einen belastbaren Datenkatalog. Gut funktioniert haben kurze Reviews mit echten Arbeitsbeispielen. Zu spät geklärt wurden Zuständigkeiten bei fehlenden Daten. Für die nächste Phase benennen wir deshalb schon beim Kick-off eine fachliche Kontaktperson und ein klares Abnahmekriterium pro Lieferung.",
    "Ein Pilotangebot enthält Dateninventur, einen abgestimmten Prototyp, zwei Reviews und eine dokumentierte Übergabe. Zusätzliche Schnittstellen, rückwirkende Datenkorrekturen und laufender Betrieb werden separat beschrieben. Anna prüft Leistungsumfang und Zahlungsplan; Lukas bestätigt den technischen Aufwand. Angebote nennen ausdrücklich die Mitwirkungspflichten des Auftraggebers.",
    "Die Planung trennt bestätigte Einnahmen, offene Rechnungen und mögliche Folgeaufträge. Miriam aktualisiert die Liquiditätsvorschau monatlich. Personalkosten und Studiomiete werden zuerst reserviert. Die zweite fiktive Fördertranche wird erst nach Nachweis erwartet. Neue Ausgaben über dem Projektbudget werden mit Anna abgestimmt, bevor eine Bestellung erfolgt.",
    "The municipal interviews suggest that traceability matters more than additional charts. Participants want to know where a number came from, which period it covers and who can resolve a mismatch. These are fictional research notes for the local pilot. David will compare the observations with the workshop findings before drawing broader conclusions.",
    "Anna berichtet über die nächste Pilotfreigabe. Lukas hat die Prüfung fehlender Messwerte umgesetzt; David ergänzt die offenen Zählerfragen. Sofia bereitet die mobile Teststrecke vor. Miriam benötigt noch zwei Belege für den Abschluss. Vereinbart wurden ein gemeinsamer Review am Freitag und eine kurze Rückmeldung zu jedem offenen Punkt bis Donnerstagmittag.",
  ];
  const pageRows = db.select().from(s.wikiPages).all();
  db.transaction(tx => {
    for (let i = 0; i < 24; i++) {
      const row = pageRows.find(p => p.id === `page-${i}`); if (!row) throw new Error("Incomplete demo pages");
      const content = JSON.parse(row.contentJson);
      content.content[1].content = [{ type: "text", text: bodies[i] }];
      const textOf = (node: { text?: string; content?: Array<{ text?: string }> }): string => node.text ?? (node.content ?? []).map(textOf).join(" ");
      tx.update(s.wikiPages).set({ contentJson: JSON.stringify(content), contentText: textOf(content) }).where(eq(s.wikiPages.id, row.id)).run();
    }
    for (let p = 0; p < 6; p++) for (let t = 0; t < 15; t++) {
      if (p !== 5 && t >= 4) continue;
      const offset = -45 + t * 2;
      tx.update(s.tasks).set({ dueDate: iso(date(offset)), startDate: iso(date(offset - 5)), completedAt: date(offset), updatedAt: date(offset) }).where(eq(s.tasks.id, `task-${p}-${t}`)).run();
    }
    tx.update(s.projects).set({ name: "Sommerpilot – Abschlussarchiv" }).where(eq(s.projects.id, "project-5")).run();
    const people = ["anna", "lukas", "miriam", "david", "sofia"];
    for (const [i, username] of people.entries()) {
      tx.update(s.employees).set({ joinedOn: iso(date(-210 + i * 7)) }).where(eq(s.employees.id, `employee-${i}`)).run();
      tx.update(s.employmentContractPeriods).set({ validFrom: iso(date(-210 + i * 7)) }).where(eq(s.employmentContractPeriods.employeeId, `employee-${i}`)).run();
      tx.update(s.personnelTaxProfiles).set({ validFrom: iso(date(-210 + i * 7)) }).where(eq(s.personnelTaxProfiles.employeeId, `employee-${i}`)).run();
      tx.update(s.user).set({ createdAt: date(-210 + i * 7) }).where(eq(s.user.id, `demo-${username}`)).run();
    }
    tx.update(s.wikiNotifications).set({ createdAt: date(-3) }).run();
    for (let i = 0; i < 25; i++) {
      const page = i % 24;
      const title = `${["Verantwortlichkeiten bestätigen", "Importbeispiel prüfen", "Belegliste abstimmen", "Quellenstand dokumentieren", "Review vorbereiten"][i % 5]}: ${pageRows.find(p => p.id === `page-${page}`)!.title}`;
      tx.update(s.tasks).set({ title }).where(eq(s.tasks.id, `inbox-task-${i}`)).run();
    }
    const deadlineTitles = ["Quartalsziele freigeben", "Importprüfung abschließen", "Fördernachweise einreichen", "Standortbericht abgeben", "Workshopunterlagen freigeben"];
    const deadlinePages = [1, 3, 8, 9, 13];
    for (let i = 25; i < 40; i++) {
      const page = deadlinePages[i % 5]; const label = pageRows.find(p => p.id === `page-${page}`)!.title;
      tx.update(s.tasks).set({ title: `${deadlineTitles[i % 5]} · Abstimmung ${Math.floor((i - 25) / 5) + 1}` }).where(eq(s.tasks.id, `inbox-task-${i}`)).run();
      tx.update(s.taskContexts).set({ entityId: `page-${page}`, route: `/wiki/demo-${page}`, label }).where(eq(s.taskContexts.taskId, `inbox-task-${i}`)).run();
      tx.update(s.contextLinks).set({ targetId: `page-${page}`, route: `/wiki/demo-${page}`, label }).where(eq(s.contextLinks.ownerId, `inbox-task-${i}`)).run();
    }
    for (const [i, name] of ["Alpenblick Projektbericht", "Workshop-Protokoll", "Interne Entscheidungsvorlage"].entries()) tx.insert(s.wikiDocumentTemplates).values({ id: `demo-template-${i}`, name, description: "Lokale Demo-Vorlage mit Gliederung und neutralem Seitenlayout.", settingsJson: JSON.stringify(DEFAULT_DOCUMENT_SETTINGS), contentJson: pageRows.find(p => p.id === `page-${12 + i}`)!.contentJson, createdBy: "demo-sofia", updatedBy: "demo-sofia" }).onConflictDoNothing().run();
    const template = localizedPresentationTemplate(presentationTemplates.report, "de", "Alpenblick Projektbericht");
    tx.insert(s.wikiPresentationLibrary).values({ id: "demo-slide-template", name: "Alpenblick · Projektbericht", kind: "template", documentJson: JSON.stringify(template), createdBy: "demo-sofia" }).onConflictDoNothing().run();
  });
  for (let i = 0; i < 3; i++) {
    if (db.select().from(s.wikiFigureAssets).where(eq(s.wikiFigureAssets.id, `demo-figure-${i}`)).get()) continue;
    const labels = [["Quelldaten", "Prüfung", "Pilotbericht"], ["Interview", "Prototyp", "Feedback"], ["Beleg", "Abgleich", "Freigabe"]][i];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="320" viewBox="0 0 960 320"><rect width="960" height="320" fill="#f5f8f7"/><text x="40" y="48" font-family="Arial" font-size="24" fill="#153c43">Alpenblick | ${["Datenfluss", "Lernzyklus", "Monatsabschluss"][i]} (Demo)</text>${labels.map((label, n) => `<rect x="${40 + n * 305}" y="100" width="265" height="100" rx="12" fill="#153c43"/><text x="${172 + n * 305}" y="158" text-anchor="middle" font-family="Arial" font-size="24" fill="white">${label}</text>${n < 2 ? `<path d="M ${310 + n * 305} 150 h 23 l -7 -7 m 7 7 l -7 7" fill="none" stroke="#538886" stroke-width="3"/>` : ""}`).join("")}<text x="40" y="272" font-family="Arial" font-size="17" fill="#4a6668">Jeder Schritt hat eine verantwortliche Person und ein nachvollziehbares Ergebnis.</text></svg>`;
    const pageId = `page-${[14, 13, 7][i]}`;
    const attachment = await saveAttachment({ entityType: "wikiPage", entityId: pageId, userId: "demo-sofia", file: new File([svg], `alpenblick-prozess-${i + 1}.svg`, { type: "image/svg+xml" }) });
    db.insert(s.wikiFigureAssets).values({ id: `demo-figure-${i}`, pageId, attachmentId: attachment.id, caption: `${labels.join(" → ")} · lokale Demo-Prozessgrafik` }).run();
    db.insert(s.wikiFigureRevisions).values({ assetId: `demo-figure-${i}`, version: 1, attachmentId: attachment.id, createdBy: "demo-sofia" }).run();
  }
}
