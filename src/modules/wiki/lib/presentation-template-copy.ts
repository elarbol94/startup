/** Authoring prompts are intentionally placeholders, never invented business results. */
export type TemplateSection = { title: string; prompt: string; items: [string, string, string] };
export type TemplateCopy = { title: string; subtitle: string; sections: TemplateSection[] };
const section = (title: string, prompt: string, ...items: [string, string, string]): TemplateSection => ({ title, prompt, items });

export const presentationTemplateCopy = {
  de: {
    pitch: {
      title: "Eine Idee.\nNeue Möglichkeiten.", subtitle: "Ein klarer Weg vom Problem zur nächsten Entscheidung.",
      sections: [
        section("Das Problem", "Welches konkrete Problem ist es wert, gelöst zu werden?", "Zielgruppe\nFür wen ist das heute relevant?", "Herausforderung\nWas kostet Zeit, Geld oder Qualität?", "Beleg\nEine Beobachtung oder Quelle ergänzen."),
        section("Unsere Lösung", "Den Nutzen in einem Satz auf den Punkt bringen.", "Ansatz\nSo lösen wir das Problem.", "Mehrwert\nDas wird für die Zielgruppe besser.", "Nachweis\nBeispiel, Prototyp oder Ergebnis zeigen."),
        section("Der nächste Schritt", "Eine konkrete Entscheidung möglich machen.", "Entscheidung\nWelche Unterstützung brauchen wir?", "Verantwortung\nWer übernimmt die Umsetzung?", "Zeitplan\nBis wann erreichen wir das nächste Ziel?"),
      ],
    },
    report: {
      title: "Ergebnisse,\ndie weiterführen.", subtitle: "Status, Einordnung und die richtigen nächsten Schritte.",
      sections: [
        section("Auf einen Blick", "Die wichtigste Entwicklung dieses Zeitraums zusammenfassen.", "Erreicht\nDas wichtigste Ergebnis benennen.", "Abweichung\nWas liegt über oder unter dem Plan?", "Empfehlung\nWas sollte jetzt entschieden werden?"),
        section("Die Kennzahlen", "Zeitraum, Quelle und Vergleichsbasis ergänzen.", "Kennzahl 01\nWert · Ziel · Veränderung", "Kennzahl 02\nWert · Ziel · Veränderung", "Kennzahl 03\nWert · Ziel · Veränderung"),
        section("Was wir daraus lernen", "Beobachtung und Interpretation klar voneinander trennen.", "Beobachtung\nWas zeigen die Daten?", "Einordnung\nWelche Erklärung ist belegt?", "Offene Frage\nWas müssen wir noch prüfen?"),
        section("Vom Ergebnis zur Aktion", "Maßnahmen mit Verantwortung und Termin festhalten.", "Priorität 01\nMaßnahme · Person · Termin", "Priorität 02\nMaßnahme · Person · Termin", "Erfolgskriterium\nWoran erkennen wir die Verbesserung?"),
      ],
    },
    roadmap: {
      title: "Heute Klarheit.\nMorgen Fortschritt.", subtitle: "Eine gemeinsame Richtung. Nachvollziehbare Meilensteine.",
      sections: [
        section("Unsere Richtung", "Welchen Zustand wollen wir gemeinsam erreichen?", "Zielbild\nWas soll sich verändern?", "Wirkung\nWarum lohnt sich dieser Weg?", "Erfolg\nWoran messen wir den Fortschritt?"),
        section("Jetzt", "Den nächsten umsetzbaren Abschnitt abgrenzen.", "Fokus\nWas hat aktuell Vorrang?", "Lieferumfang\nWas wird konkret fertig?", "Verantwortung\nTeam oder Person ergänzen."),
        section("Als Nächstes", "Den nächsten Meilenstein mit Abhängigkeiten planen.", "Meilenstein\nErgebnis und Zieldatum ergänzen.", "Abhängigkeit\nWas muss vorher geklärt sein?", "Entscheidung\nWas brauchen wir zum Start?"),
        section("Danach", "Den Ausblick bewusst offen für neue Erkenntnisse halten.", "Möglichkeit\nWas könnte darauf aufbauen?", "Annahme\nWas ist noch nicht gesichert?", "Überprüfung\nWann aktualisieren wir den Plan?"),
      ],
    },
    workshop: {
      title: "Gemeinsam denken.\nKlar entscheiden.", subtitle: "Ein moderierter Weg von der Frage zum nächsten Schritt.",
      sections: [
        section("Ziel & Ablauf", "Am Ende dieses Workshops haben wir …", "Ankommen · 5 Min.\nZiel und Erwartungen abgleichen.", "Erarbeiten · 20 Min.\nIdeen sammeln und gemeinsam sortieren.", "Entscheiden · 10 Min.\nPrioritäten und nächste Schritte festhalten."),
        section("Gemeinsamer Kontext", "Die Ausgangslage in wenigen Punkten erklären.", "Was wir wissen\nFakten und Beobachtungen sammeln.", "Was offen ist\nFragen und Annahmen sichtbar machen.", "Unser Rahmen\nZeit, Umfang und Grenzen klären."),
        section("Ideen sammeln", "Erst einzeln nachdenken, dann gemeinsam ergänzen.", "Idee 01\nEin Gedanke pro Karte.", "Idee 02\nAuch ungewöhnliche Ansätze zulassen.", "Idee 03\nAuf vorhandenen Ideen aufbauen."),
        section("Gemeinsam bewerten", "Ideen nach Wirkung und Aufwand vergleichen.", "Wirkung\nWelchen Nutzen erwarten wir?", "Aufwand\nWas brauchen wir für die Umsetzung?", "Risiko\nWelche Annahme sollten wir testen?"),
        section("Eine Entscheidung treffen", "Die gewählte Richtung und ihre Begründung festhalten.", "Entscheidung\nDarauf einigen wir uns.", "Begründung\nDiese Kriterien waren ausschlaggebend.", "Offene Punkte\nDas klären wir anschließend."),
        section("Verbindlich weiter", "Jede Aufgabe bekommt eine Person und einen Termin.", "Aufgabe\nWas ist der erste konkrete Schritt?", "Verantwortung\nWer übernimmt ihn?", "Termin\nWann prüfen wir das Ergebnis?"),
      ],
    },
    demo: {
      title: "Weniger erklären.\nMehr zeigen.", subtitle: "Eine Produktgeschichte aus Sicht der Menschen, die es nutzen.",
      sections: [
        section("Die Ausgangslage", "Mit einer vertrauten Situation aus dem Alltag beginnen.", "Person\nWer möchte etwas erledigen?", "Aufgabe\nWas soll erreicht werden?", "Hürde\nWas macht es heute schwierig?"),
        section("Der entscheidende Moment", "Einen konkreten Ablauf live oder mit eigenen Bildern zeigen.", "Einstieg\nSo beginnt der Ablauf.", "Interaktion\nHier entsteht der Mehrwert.", "Ergebnis\nDas hat die Person jetzt erreicht."),
        section("Der Unterschied", "Vorher und nachher anhand desselben Anwendungsfalls erklären.", "Bisher\nAufwand und Einschränkungen beschreiben.", "Mit dem Produkt\nDen verbesserten Ablauf zeigen.", "Nachweis\nEigenen Test oder Rückmeldung ergänzen."),
        section("Selbst ausprobieren", "Das Publikum zu einem klaren nächsten Schritt einladen.", "Einstieg\nWo kann man es ausprobieren?", "Feedback\nWelche Frage möchten wir beantworten?", "Kontakt\nAnsprechperson und Link ergänzen."),
      ],
    },
    portfolio: {
      title: "Gute Arbeit.\nKlar erzählt.", subtitle: "Ausgewählte Projekte, die Ansatz und Wirkung sichtbar machen.",
      sections: [
        section("Mein Profil", "In einem Satz sagen, welchen Beitrag Sie leisten.", "Schwerpunkt\nWoran arbeite ich besonders gern?", "Arbeitsweise\nWas prägt meine Zusammenarbeit?", "Erfahrung\nWelche Perspektive bringe ich mit?"),
        section("Ausgewählte Arbeit", "Ein Projekt anhand von Aufgabe, Beitrag und Ergebnis zeigen.", "Aufgabe\nWas war die Ausgangslage?", "Mein Beitrag\nWas habe ich konkret verantwortet?", "Ergebnis\nEigene Arbeit oder Beleg ergänzen."),
        section("Von der Idee zur Wirkung", "Den Weg hinter einem zweiten Projekt sichtbar machen.", "Verstehen\nWie habe ich die Aufgabe eingegrenzt?", "Gestalten\nWelche Entscheidung war entscheidend?", "Lernen\nWas nehme ich daraus mit?"),
        section("Lassen Sie uns sprechen", "Den passenden nächsten Kontakt einfach machen.", "Zusammenarbeit\nWelche Aufgaben passen zu mir?", "Verfügbarkeit\nZeitraum und Rahmen ergänzen.", "Kontakt\nName · E-Mail · Portfolio-Link"),
      ],
    },
    timeline: {
      title: "Ein Weg.\nKlare Meilensteine.", subtitle: "Entwicklungen verständlich erzählen und Fortschritt einordnen.",
      sections: [
        section("Der Ausgangspunkt", "Datum oder Zeitraum ergänzen und den Kontext setzen.", "Situation\nWo standen wir am Anfang?", "Auslöser\nWarum wurde eine Veränderung nötig?", "Ziel\nWas wollten wir erreichen?"),
        section("Der Wendepunkt", "Das Ereignis zeigen, das die Richtung verändert hat.", "Ereignis\nWas ist passiert?", "Entscheidung\nWie haben wir reagiert?", "Folge\nWas wurde dadurch möglich?"),
        section("Der heutige Stand", "Fortschritt mit einem konkreten Ergebnis belegen.", "Ergebnis\nWas haben wir erreicht?", "Erkenntnis\nWas haben wir gelernt?", "Offen\nWas braucht noch Aufmerksamkeit?"),
        section("Der nächste Meilenstein", "Den Ausblick mit einem greifbaren nächsten Ziel verbinden.", "Nächster Schritt\nWas geschieht als Nächstes?", "Zieldatum\nBis wann soll es erreicht sein?", "Erfolg\nWoran erkennen wir den Abschluss?"),
      ],
    },
    hub: {
      title: "Das Ganze\nim Blick.", subtitle: "Ein zentrales Thema aus vier Perspektiven verstehen.",
      sections: [
        section("Menschen", "Wer ist beteiligt und welche Bedürfnisse zählen?", "Zielgruppe\nFür wen gestalten wir?", "Beteiligte\nWer trägt zum Ergebnis bei?", "Bedürfnisse\nWas ist diesen Menschen wichtig?"),
        section("Prozesse", "Den Weg zum Ergebnis verständlich machen.", "Ablauf\nWelche Schritte gehören dazu?", "Schnittstelle\nWo wird etwas übergeben?", "Verbesserung\nWas kann einfacher werden?"),
        section("Ressourcen", "Die Voraussetzungen für die Umsetzung benennen.", "Kompetenz\nWelches Wissen brauchen wir?", "Kapazität\nWelche Zeit steht zur Verfügung?", "Werkzeuge\nWas unterstützt die Arbeit?"),
        section("Wirkung", "Die Perspektiven zu einem gemeinsamen Ergebnis verbinden.", "Nutzen\nWas verändert sich für die Zielgruppe?", "Messung\nWie erkennen wir den Fortschritt?", "Entscheidung\nWas folgt aus dem Gesamtbild?"),
      ],
    },
    mindmap: {
      title: "Raum für\nneue Gedanken.", subtitle: "Ideen verbinden, Fragen öffnen und eine Richtung finden.",
      sections: [
        section("Die Leitfrage", "Eine offene Frage formulieren, die zum Denken einlädt.", "Ausgangspunkt\nWas beschäftigt uns?", "Bedeutung\nWarum ist die Frage relevant?", "Rahmen\nWas gehört dazu, was bleibt außen vor?"),
        section("Beobachtungen", "Sammeln, was wir tatsächlich gesehen oder gehört haben.", "Signal 01\nBeobachtung und Quelle ergänzen.", "Signal 02\nEine weitere Perspektive aufnehmen.", "Muster\nWelche Verbindung fällt auf?"),
        section("Möglichkeiten", "Mehrere Richtungen zulassen, bevor wir auswählen.", "Richtung A\nWas wäre ein naheliegender Ansatz?", "Richtung B\nWas wäre eine mutige Alternative?", "Verbindung\nWas lässt sich kombinieren?"),
        section("Offene Fragen", "Unsicherheit sichtbar und bearbeitbar machen.", "Annahme\nWas setzen wir bisher voraus?", "Frage\nWas müssen wir verstehen?", "Prüfung\nWie könnten wir es herausfinden?"),
        section("Unser nächster Versuch", "Eine Idee in einen kleinen, überprüfbaren Versuch übersetzen.", "Hypothese\nWir erwarten, dass …", "Versuch\nSo können wir es einfach testen.", "Lernen\nDaran erkennen wir den nächsten Schritt."),
      ],
    },
    lesson: {
      title: "Verstehen.\nAnwenden. Behalten.", subtitle: "Ein Lernweg mit Beispiel, eigener Übung und Rückblick.",
      sections: [
        section("Das Lernziel", "Nach dieser Einheit können Sie …", "Können\nEine konkrete Fähigkeit benennen.", "Relevanz\nWo hilft diese Fähigkeit im Alltag?", "Vorwissen\nWas setzen wir bereits voraus?"),
        section("Die Grundlagen", "Auf die drei wichtigsten Begriffe konzentrieren.", "Begriff 01\nEinfach erklären, Fachwörter auflösen.", "Begriff 02\nDen Zusammenhang sichtbar machen.", "Begriff 03\nEine typische Verwechslung klären."),
        section("Ein konkretes Beispiel", "Den Gedankengang Schritt für Schritt zeigen.", "Ausgangslage\nEine verständliche Aufgabe stellen.", "Vorgehen\nDen Lösungsweg nachvollziehbar machen.", "Ergebnis\nErklären, warum die Lösung passt."),
        section("Jetzt selbst ausprobieren", "Eine Aufgabe geben, die zum Lernziel passt.", "Aufgabe\nWas soll bearbeitet werden?", "Rahmen\nZeit, Material und Arbeitsform angeben.", "Hilfestellung\nEinen Tipp oder Leitgedanken anbieten."),
        section("Was bleibt?", "Das Gelernte sichern und den Transfer vorbereiten.", "Merksatz\nDie wichtigste Erkenntnis formulieren.", "Selbstcheck\nEine Frage zur Überprüfung stellen.", "Transfer\nWo wenden Sie das als Nächstes an?"),
      ],
    },
  },
  en: {
    pitch: { title: "One idea.\nNew possibilities.", subtitle: "A clear path from the problem to the next decision.", sections: [
      section("The problem", "What specific problem is worth solving?", "Audience\nWho needs this today?", "Challenge\nWhat costs time, money or quality?", "Evidence\nAdd an observation or source."),
      section("Our solution", "Express the value in one clear sentence.", "Approach\nHow we solve the problem.", "Value\nWhat improves for the audience?", "Proof\nShow an example, prototype or result."),
      section("The next step", "Make a concrete decision possible.", "Decision\nWhat support do we need?", "Ownership\nWho will lead the work?", "Timing\nWhen will we reach the next milestone?"),
    ] },
    report: { title: "Results that\nmove us forward.", subtitle: "Performance, perspective and the right next steps.", sections: [
      section("At a glance", "Summarize the most important development this period.", "Achievement\nName the most important result.", "Variance\nWhat is above or below plan?", "Recommendation\nWhat should we decide now?"),
      section("Key metrics", "Add the reporting period, source and comparison basis.", "Metric 01\nValue · Target · Change", "Metric 02\nValue · Target · Change", "Metric 03\nValue · Target · Change"),
      section("What we learned", "Separate observations from interpretations.", "Observation\nWhat do the data show?", "Interpretation\nWhich explanation has evidence?", "Open question\nWhat still needs checking?"),
      section("From results to action", "Give every action an owner and a deadline.", "Priority 01\nAction · Owner · Date", "Priority 02\nAction · Owner · Date", "Success measure\nHow will we recognize improvement?"),
    ] },
    roadmap: { title: "Clarity today.\nProgress tomorrow.", subtitle: "A shared direction. Milestones everyone can follow.", sections: [
      section("Our direction", "What future state do we want to reach together?", "Vision\nWhat should change?", "Impact\nWhy is this worth pursuing?", "Success\nHow will we measure progress?"),
      section("Now", "Define the next achievable piece of work.", "Focus\nWhat takes priority today?", "Deliverable\nWhat will actually be finished?", "Ownership\nAdd the responsible team or person."),
      section("Next", "Plan the next milestone and its dependencies.", "Milestone\nAdd an outcome and target date.", "Dependency\nWhat needs to happen first?", "Decision\nWhat do we need to get started?"),
      section("Later", "Leave room for what we learn along the way.", "Opportunity\nWhat could we build on this?", "Assumption\nWhat remains uncertain?", "Review\nWhen will we update the plan?"),
    ] },
    workshop: { title: "Think together.\nDecide clearly.", subtitle: "A facilitated journey from a shared question to action.", sections: [
      section("Goal & agenda", "By the end of this workshop, we will have …", "Connect · 5 min\nAlign on the goal and expectations.", "Explore · 20 min\nCollect and organize ideas together.", "Decide · 10 min\nAgree priorities and next steps."),
      section("Shared context", "Explain the starting point in a few key points.", "What we know\nCollect facts and observations.", "What is open\nMake questions and assumptions visible.", "Our boundaries\nClarify time, scope and constraints."),
      section("Collect ideas", "Think individually first, then build together.", "Idea 01\nOne thought per card.", "Idea 02\nMake room for unexpected approaches.", "Idea 03\nBuild on what others have shared."),
      section("Evaluate together", "Compare ideas by impact and effort.", "Impact\nWhat benefit do we expect?", "Effort\nWhat does implementation require?", "Risk\nWhich assumption should we test?"),
      section("Make a decision", "Record the chosen direction and its rationale.", "Decision\nThis is what we agree on.", "Rationale\nThese criteria made the difference.", "Open points\nThis is what we will clarify next."),
      section("Commit to action", "Every task needs a person and a date.", "Task\nWhat is the first concrete step?", "Owner\nWho will take it on?", "Date\nWhen will we review the result?"),
    ] },
    demo: { title: "Explain less.\nShow more.", subtitle: "A product story told through the people who use it.", sections: [
      section("The starting point", "Begin with a familiar everyday situation.", "Person\nWho wants to get something done?", "Task\nWhat are they trying to achieve?", "Friction\nWhat makes it difficult today?"),
      section("The moment that matters", "Show one real workflow live or with your own images.", "Start\nThis is how the workflow begins.", "Interaction\nHere is where the value appears.", "Outcome\nThis is what the person achieved."),
      section("The difference", "Compare before and after using the same use case.", "Before\nDescribe the effort and limitations.", "With the product\nShow the improved workflow.", "Evidence\nAdd your own test or feedback."),
      section("Try it yourself", "Invite the audience to take one clear next step.", "Get started\nWhere can people try it?", "Feedback\nWhich question do we want to answer?", "Contact\nAdd a person and a link."),
    ] },
    portfolio: { title: "Thoughtful work.\nClearly told.", subtitle: "Selected projects that reveal your approach and impact.", sections: [
      section("My profile", "Describe the contribution you make in one sentence.", "Focus\nWhat work do I enjoy most?", "Approach\nHow do I collaborate?", "Experience\nWhat perspective do I bring?"),
      section("Selected work", "Show a project through its challenge, contribution and outcome.", "Challenge\nWhat was the starting point?", "My contribution\nWhat was I responsible for?", "Outcome\nAdd your own work or evidence."),
      section("From idea to impact", "Reveal the process behind a second project.", "Understand\nHow did I define the challenge?", "Design\nWhich decision made the difference?", "Learn\nWhat did I take away from it?"),
      section("Let’s talk", "Make the next conversation easy to start.", "Collaboration\nWhat kind of work suits me?", "Availability\nAdd timing and scope.", "Contact\nName · Email · Portfolio link"),
    ] },
    timeline: { title: "One journey.\nClear milestones.", subtitle: "Tell the story of change and put progress in perspective.", sections: [
      section("The starting point", "Add a date or period and set the context.", "Situation\nWhere did we begin?", "Trigger\nWhy was change needed?", "Goal\nWhat did we want to achieve?"),
      section("The turning point", "Show the event that changed the direction.", "Event\nWhat happened?", "Decision\nHow did we respond?", "Consequence\nWhat did this make possible?"),
      section("Where we are today", "Demonstrate progress with a concrete result.", "Result\nWhat have we achieved?", "Learning\nWhat have we learned?", "Open point\nWhat still needs attention?"),
      section("The next milestone", "Connect the outlook to a tangible next goal.", "Next step\nWhat happens next?", "Target date\nWhen should it be achieved?", "Success\nHow will we know it is complete?"),
    ] },
    hub: { title: "See the\nbigger picture.", subtitle: "Understand one central topic from four perspectives.", sections: [
      section("People", "Who is involved and whose needs matter?", "Audience\nWho are we designing for?", "Contributors\nWho helps deliver the outcome?", "Needs\nWhat matters to these people?"),
      section("Processes", "Make the path to the outcome understandable.", "Workflow\nWhich steps are involved?", "Handoff\nWhere does work change hands?", "Improvement\nWhat could become simpler?"),
      section("Resources", "Name the conditions needed to deliver.", "Expertise\nWhat knowledge do we need?", "Capacity\nHow much time is available?", "Tools\nWhat supports the work?"),
      section("Impact", "Connect the perspectives to a shared outcome.", "Value\nWhat changes for the audience?", "Measurement\nHow do we recognize progress?", "Decision\nWhat follows from the bigger picture?"),
    ] },
    mindmap: { title: "Room for\nnew thinking.", subtitle: "Connect ideas, open up questions and find a direction.", sections: [
      section("The guiding question", "Ask an open question that invites exploration.", "Starting point\nWhat is on our minds?", "Relevance\nWhy does the question matter?", "Scope\nWhat belongs here and what does not?"),
      section("Observations", "Collect what we have actually seen or heard.", "Signal 01\nAdd an observation and source.", "Signal 02\nInclude another perspective.", "Pattern\nWhat connection stands out?"),
      section("Possibilities", "Explore several directions before choosing.", "Direction A\nWhat is a natural approach?", "Direction B\nWhat is a bold alternative?", "Connection\nWhat could we combine?"),
      section("Open questions", "Make uncertainty visible and actionable.", "Assumption\nWhat are we taking for granted?", "Question\nWhat do we need to understand?", "Check\nHow could we find out?"),
      section("Our next experiment", "Turn one idea into a small, testable experiment.", "Hypothesis\nWe expect that …", "Experiment\nHere is a simple way to test it.", "Learning\nThis will guide our next step."),
    ] },
    lesson: { title: "Understand.\nApply. Remember.", subtitle: "A learning journey with an example, practice and reflection.", sections: [
      section("The learning goal", "After this session, you will be able to …", "Ability\nName a concrete skill.", "Relevance\nWhere does this help in everyday life?", "Prior knowledge\nWhat do we already expect?"),
      section("The foundations", "Focus on the three most important concepts.", "Concept 01\nExplain simply and unpack terminology.", "Concept 02\nMake the connection clear.", "Concept 03\nResolve a common misunderstanding."),
      section("A concrete example", "Show the thinking step by step.", "Starting point\nPose an understandable problem.", "Approach\nMake the solution easy to follow.", "Result\nExplain why the solution works."),
      section("Try it yourself", "Set an exercise that matches the learning goal.", "Task\nWhat should be worked on?", "Setup\nGive the time, materials and format.", "Support\nOffer a hint or guiding principle."),
      section("What will you take away?", "Reinforce learning and prepare to apply it.", "Key idea\nState the most important insight.", "Self-check\nAsk a question to check understanding.", "Transfer\nWhere will you use this next?"),
    ] },
  },
} satisfies Record<"de" | "en", Record<string, TemplateCopy>>;
