# Ausgangsdaten und Kennzahlen

Die Gemeinde-Seite trennt **Ausgangsdaten** (Werte, die so in einer Datei stehen) von
**Kennzahlen** (Werte, die aus Ausgangsdaten berechnet werden). Das erste Dropdown im
Kennzahl-Panel der Karte wählt die Datenart, die beiden folgenden Kategorie und Ansicht
wie bisher.

## Zwei Implementierungen, ein Test

Jede eingebaute Kennzahl existiert doppelt:

1. Als handgeschriebene Funktion — `demographicIndicatorValue`, `movementMetricValue`,
   `municipalityCostShare` und so weiter. Das ist der Ausführungspfad der Karte. Er läuft
   über 2.092 Gemeinden × 24 Jahre und bleibt deshalb so, wie er ist.
2. Als Ausdrucksbaum in `kennzahlExpressionFor` (`src/modules/municipalities/kennzahlen.ts`).
   Daraus entstehen der Herleitungs-Graph im Analyse-Tool, der Formeltext und die
   Auswertung selbst definierter Kennzahlen.

`kennzahlen.test.ts` rechnet beide Wege für jede Kennzahl über alle Jahre gegeneinander.
**Eine neue Kennzahl braucht daher beides** — sonst schlägt der Test fehl. Genau das ist
seine Aufgabe: Die im Analyse-Tool angezeigte Herleitung soll die Formel sein, mit der die
Karte tatsächlich rechnet, und nicht eine gut gemeinte Nacherzählung.

Vier Kennzahlen haben bewusst keinen Ausdrucksbaum (`expression: null`) und werden im
Katalog als Primärberechnung ausgewiesen:

| Kennzahl | fehlendes Vokabular |
| --- | --- |
| Durchschnittsalter | Summe der Lebensjahre, kein sinnvolles Ausgangsdatum |
| Real je Einwohner | VPI je Jahr, also eine jahresabhängige Referenzreihe |
| Abweichung von Vergleichsgemeinden | Median über andere Gemeinden, kein Operator über Gemeinden |
| Politik und Digitales | eigene Ausgangsdaten, noch nicht modelliert |

## Eine Kennzahl hinzufügen

1. Ausgangsdaten prüfen: Lässt sich die Kennzahl aus vorhandenen Basisgrößen ausdrücken?
   Falls nicht, die fehlende Größe ergänzen. Dabei die Konvention beachten: Arrays, die
   die Validierung gegen die Datendatei vergleicht (`COST_CATEGORIES`, `MOVEMENT_METRICS`,
   `AGE_GROUPS`), **dürfen nicht wachsen**. Zusätzliche Auswahlziele kommen in ein eigenes
   `*_TARGETS`-Array daneben.
2. Die handgeschriebene Berechnung ergänzen und den Ref-Typ in `analysis.ts` erweitern.
3. `kennzahlExpressionFor` um den Ausdrucksbaum ergänzen.
4. Die Ansicht in `*_VIEWS_BY_KIND` der richtigen Datenart zuordnen.
5. Deutsche und englische Labels ergänzen — auch für jede neue Einheit unter `units.*`.
   Eine fehlende Einheit lässt next-intl werfen und nimmt die ganze Knotenliste mit.

## Selbst definierte Kennzahlen

Im Analyse-Tool wird der Teilgraph unter einem Knoten über „Als Kennzahl speichern" zu
einer eigenen Kennzahl (`municipality_metrics`). Die Gemeinde wird dabei abgestreift und
zum Parameter — das geht nur, wenn der Teilgraph von einer einzigen Gemeinde handelt.
Ein Graph, der zwei Gemeinden vergleicht, ist ein Vergleich und keine Kennzahl und wird
abgelehnt statt stillschweigend umgedeutet.

Der Ausdrucksbaum kennt neben den zweiseitigen Operatoren eine einseitige Form: der
**Zeitversatz** trägt statt `b` eine Jahreszahl und liest seinen Eingang um so viele Jahre
früher. Damit ist „Veränderung zum Vorjahr" als Kennzahl ausdrückbar —
`Einwohnerzahl − Einwohnerzahl (t−1)`. Auf der Karte kostet das nichts: dort wird ohnehin
pro Jahr gefragt, der Zeitversatz stellt dieselbe Frage für ein früheres Jahr. Jahre vor
dem Beginn der Daten bleiben leer, wie jede andere Lücke auch.

Auf der Karte werden diese Kennzahlen über `createKennzahlLookup` ausgewertet, nicht über
`resolveMunicipalityDataset`: Letzteres sucht pro Jahr linear im Index und die
Peer-Abweichung darin ist quadratisch über alle Gemeinden.

## Gemeinden filtern und Bedingungen

Unter **Gemeinden filtern** lassen sich Einwohnerzahl (2002–2025), Fläche,
Bundesland, Bürger-App-Anbieter, App-Verfügbarkeit, Recherchestatus und die
Anzahlen der digitalen Plattformansichten kombinieren. Gruppen unterstützen UND,
ODER und NICHT. Zahlen bieten Vergleiche und ein einschließliches Intervall;
Anbieter und Bundesländer erlauben Mehrfachauswahl. Die Ergebnisse erscheinen als
Liste oder Karte, mit getrennten Treffern, Nichttreffern und unbekannten Ergebnissen.
Die Bedingungen können über die URL als Lesezeichen gespeichert werden.

`filters.ts` enthält Schema und gemeinsame Auswertung. `condition`-Datensätze im
Analysegraphen verwenden dieselbe Auswertung und liefern Wahrheitswerte. Sie
lassen sich im Datenpanel hinzufügen, im Inspektor bearbeiten, mit UND/ODER
verbinden und als Kennzahl speichern. **Als Analyse öffnen** übernimmt alle
Filterbedingungen; negierte Gruppen werden nach De Morgan umgeformt. Der Graph
wertet die Bedingungen für die gesamte Bevölkerungszeitreihe aus, während die
Filterseite nur das ausgewählte Jahr zeigt.

Plattformdaten sind ein aktueller Recherchesnapshot, keine historische Zeitreihe.
Dies wird im Filter und am Bedingungsblock ausgewiesen. Mehrere Anbieter werden
über ihre tatsächliche Liste geprüft, niemals über Farbcodes der Karte. Ein
gefundener Anbieter kann auch bei unvollständiger Recherche einen Treffer liefern;
ein nicht gefundener Anbieter bleibt dann unbekannt. Exakte Plattformanzahlen
setzen abgeschlossene Recherche voraus. „Keine App gefunden“ ist ein
Rechercheergebnis, kein Beweis der Abwesenheit.

Unbekannt bleibt auch unter NICHT unbekannt. FALSCH UND UNBEKANNT ist FALSCH;
WAHR ODER UNBEKANNT ist WAHR. Filter, Graph und Kennzahl-Kartenauswertung teilen
diese dreiwertige Logik. `filters.test.ts` prüft Grenzen, Mehrfachanbieter,
Datenlücken, Speichern und Ergebnisgleichheit über alle Gemeinden.

### Ausgangsdaten im Filter erkunden

Die Filterseite zeigt eine gemeinsame Karte neben den Bedingungen (auf schmalen
Bildschirmen darüber). Die Kategorien Bevölkerung/Geografie und digitale
Plattformen bieten alle derzeit unterstützten Filterfelder als Kartenansicht an.
Die Darstellung lässt sich zwischen Ausgangsdaten und Filterergebnissen wechseln,
ohne Bedingungen oder Kartenausschnitt zurückzusetzen. `readFilterField` liefert
die gemeinsamen Werte; Einwohnerklassen und Anbieterfarben stammen aus dem
Überblick. Andere numerische Felder verwenden fünf gleich breite Werteklassen.

Ein Klick auf die Karte zeigt den Rohwert und bei
digitalen Daten den Recherchestatus und das Prüfdatum. „Als Bedingung hinzufügen"
übernimmt Feld und gegebenenfalls ausgewählten Wert in eine gewählte Gruppe.
Bei mehreren Anbietern wird eine Mehrfachauswahl angelegt; bei einer bekannten
leeren Anbieterliste die Bedingung „Keine vergleichbare App gefunden". Die
Vorschau unter dem Button zeigt die Bedingung vor dem Hinzufügen.

### Kennzahlen im Filter

Unter Kategorie **Kennzahl** stehen die numerischen Kennzahlen des Analysekatalogs
zur Verfügung: Bevölkerungsdichte, Ausländeranteil, Altersgruppen (nach Geschlecht),
demografische Indikatoren, Bewegungsraten/-salden und Finanzkennzahlen für jede
Aufgabengruppe. Eigene gespeicherte Kennzahlen und politische Wahldaten sind in
dieser Auswahl noch nicht enthalten.

`filter-metrics.ts` erweitert den gemeinsamen Katalog um konkrete Alters- und
Finanzkategorien und verwendet dieselben Primärberechnungen wie der Überblick.
Anteile und relative Abweichungen werden für Karte und Bedingungen in Prozent
umgerechnet (25 bedeutet 25 %); Raten behalten ihre ausgewiesene Einheit.
Negative Schwellen sind erlaubt. Werteklassen berücksichtigen negative Werte.
Das ausgewählte Jahr gilt exakt: keine stillschweigende Übernahme aus einem
anderen Jahr, fehlende Daten bleiben auch unter NICHT unbekannt.

Bedingungen speichern die stabile Kennzahl-ID. Der Analyse-Datenlader und die
Abhängigkeitsermittlung gespeicherter Bedingungskennzahlen laden die zugehörigen
Zeitreihen. Vergleichsgruppen-Mediane werden gemeinsam mit dem Überblick über
`peer-medians.ts` berechnet; Werte werden pro Datenbestand, Jahr und Kennzahl
zwischengespeichert. Tests prüfen die Übereinstimmung für alle Auswahlmöglichkeiten,
Einheiten, negative Schwellen, Datenlücken und die Übernahme in die Analyse.

Im Kartenmodus „Daten“ bleiben Gruppenauswahl, Hinzufügen-Button und
Bedingungsvorschau ausgeblendet. Sie erscheinen nur bei gültigen „Ergebnissen“.
Die Verknüpfung von Gruppen wird erst ab zwei Gruppen gezeigt; Hinweise zum
Datenstand und zu fehlenden Werten sind aufklappbar.

Die Filterkarte zeigt beim Darüberfahren den Gemeindenamen und hebt die Fläche
mit einer stärkeren Kontur hervor. Beim Verlassen verschwindet die Hervorhebung.
Ein Klick oder Antippen öffnet die Werte; die separate Gemeindeauswahlliste entfällt.
Bedingungen stehen in einzelnen Karten mit einem durchgehenden Datenfeld und
nebeneinander angeordneten Vergleichs- und Wertefeldern.

### Analyse-Bibliothek und Ablage

Katalogkategorien sind standardmäßig eingeklappt; eine Suche öffnet passende
Kategorien. Datensätze, Kennzahlen, Bedingungen, Operatoren, Konstanten und Notizen
lassen sich auf die Arbeitsfläche ziehen. Der Ablagepunkt wird mit der aktuellen
Kartenverschiebung und Zoomstufe in Arbeitsflächenkoordinaten umgerechnet.
`add-kennzahl.position` verschiebt ausschließlich neu eingefügte Knoten; bestehende
Knoten bleiben an ihrer Position. Eigene Kennzahlen werden als Ausdrucksgraph eingefügt.

Zweimaliges kurzes Drücken der Umschalttaste (innerhalb von 450 ms) öffnet
„Schnell hinzufügen“, ebenso Strg/Cmd+K. Texteingaben und Shift-Tastenkombinationen
lösen die neue Tastenkombination nicht aus. Gespeicherte Analysen lassen sich direkt
in der Übersicht über einen Löschknopf mit Bestätigungsdialog entfernen.
