---
title: Formulare umstellen
order: 10
routes:
  - civicrm/admin/afreact
  - civicrm/admin/setting/afreact
---

# Formulare umstellen

Zwei Verwaltungsseiten steuern afreact. Sie haben keinen Menüeintrag; öffnen Sie sie über ihre Adresse in Ihrer CiviCRM-Installation.

## Der Support-Bericht

**Unterstützung des React-Renderers** unter `civicrm/admin/afreact` listet jedes Formular mit dem Ort, an dem es angezeigt wird, womit es gerade gezeichnet wird und was afreact darin nicht zeichnen kann. Blöcke haben keine eigene Zeile; sie werden in den Formularen geprüft, die sie enthalten. Jedes Formular lässt sich vor dem Umstellen in React und in Angular als Vorschau öffnen.

**Alle unterstützten Formulare mit React zeichnen** setzt die Liste auf alle Formulare ohne einen solchen Hinweis. Ein Formular, das schon auf der Liste steht und einen Hinweis hat, geht zurück an Angular; ein Formular, dessen Prüfung fehlschlug, behält seinen Zustand.

## Die Einstellungen

**Einstellungen des React-Renderers** unter `civicrm/admin/setting/afreact` hat zwei Felder:

| Einstellung                     | Wirkung                                                                                                                                                                                                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mit React gezeichnete Formulare | Die Formulare, die afreact zeichnet: auf ihren eigenen Seiten, in Reitern und Blöcken der Kontaktübersicht, in Reitern der Veranstaltungsverwaltung, in Blöcken der Fallübersicht, im Popup der Kontaktaktionen und in Dashlets. Alle anderen Formulare bleiben bei Angular. |
| Mit React geöffnete Editoren    | Die Editoren, deren Links den React-Editor öffnen. Der Original-Editor bleibt unter seiner Adresse mit angehängtem `/classic` erreichbar.                                                                                                                                    |

Ein Formular, das von der Liste genommen wird, wird sofort wieder mit Angular gezeichnet, überall, wo es erscheint. Nur die Vorschau im Support-Bericht zeigt es weiter mit React. Beachten Sie, dass bedingte Regeln, die im React-FormBuilder mit „this row“ oder „Compare with a field“ (`afreact-if`, `afreact-required`, `afreact-disabled`) angelegt wurden, nur von afreact ausgewertet und bei einer Rückstellung auf Angular ignoriert werden.

## Was afreact nicht zeichnet

afreact zeichnet lieber nicht, als zu raten. Nutzt ein Formular etwas, das afreact nicht zeichnen kann, zeigt das Formular einen Hinweis, der diesen Teil nennt, und der Support-Bericht listet das Formular, bevor jemand es umstellt. Das betrifft:

- Formulare mit selbst geschriebenem Angular-Code, der über reinen Text und Übersetzungen hinausgeht;
- Feldtypen und Seitenelemente, die andere Erweiterungen in Angular hinzufügen;
- Massenaktionen, deren Dialog eine andere Erweiterung in Angular mitbringt;
- einige selten genutzte Einstellungen der Stapelerfassung und der Diagramm-Anzeigen.

In den React-Editoren bleibt eine Einstellung, die sie nicht bearbeiten können, erhalten und wird unverändert zurückgespeichert. Ein Editor, den eine andere Erweiterung für ihren eigenen Anzeigetyp in Angular mitbringt, läuft in Angular innerhalb der React-Seite.
