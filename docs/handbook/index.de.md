---
title: afreact
---

# afreact

![afreact: FormBuilder-Formulare, SearchKit-Anzeigen und beide Editoren mit React gezeichnet, auf denselben Daten und Rechten](images/cover.png)

> **Status: Alpha.** Einstellungen und Verhalten können sich zwischen Releases noch ändern. Probieren Sie die Erweiterung auf einem Testsystem aus, bevor Sie sie produktiv nutzen.

CiviCRM hat zwei Werkzeuge, mit denen man Bildschirme ohne Programmierung baut. FormBuilder baut Formulare, etwa ein Anmeldeformular, ein Formular zum Bearbeiten von Kontakten oder einen Reiter in der Kontaktübersicht. SearchKit baut Listen und Tabellen, etwa Mitglieder, offene Spenden oder einen Bericht mit Summen. Beide zeichnen ihre Bildschirme mit AngularJS, einer Browser-Technik, die nicht mehr weiterentwickelt wird.

afreact zeichnet dieselben Formulare und Tabellen mit React. Es ändert nicht, was gespeichert wird, wer was sehen darf oder wie ein Formular gebaut ist: Ein Formular aus FormBuilder bleibt dasselbe Formular, nur wie es im Browser aussieht und sich verhält, ändert sich. Jedes Formular wird mit einer Einstellung einzeln umgestellt und auch wieder zurückgestellt.

afreact baut auch die beiden Editoren nach, den SearchKit-Editor und den FormBuilder-Editor. Sie speichern genau dieselben Datensätze wie die Originale, sodass sich eine Suche oder ein Formular in beiden bearbeiten lässt.

## Was Nutzende bemerken

Meist nichts: Formulare und Tabellen nutzen denselben Seitenaufbau und dasselbe Theme. Wo ein Unterschied auffällt, ist er als Verbesserung gedacht:

- **Screenreader und Tastatur funktionieren.** Felder sind benannt und gruppiert, Reiter und Listen lassen sich mit den Pfeiltasten bedienen, Zeilen lassen sich per Tastatur umsortieren, und wer einen Screenreader nutzt, hört, wann eine Suche fertig ist und wie viele Treffer sie hat.
- **Fehler werden dort erklärt, wo sie entstehen.** Ein Formular, das sich nicht absenden lässt, nennt jedes Feld, das Aufmerksamkeit braucht, und sagt unter jedem Feld, was falsch ist.
- **Weniger geht versehentlich verloren.** Das Entfernen eines wiederholten Blocks lässt sich rückgängig machen, und Werte, die getippt werden, während ein Formular noch lädt, bleiben erhalten.
- **Tabellen bleiben sichtbar.** Während die nächste Seite lädt, bleiben die aktuellen Zeilen stehen, statt zu grauen Platzhaltern zu werden.
- **Die Editoren sind leichter zu bedienen.** Die FormBuilder-Palette zeigt, was ein Feld tut, bevor es hinzugefügt wird, Ziehen und Ablegen geht auch per Tastatur, und das Entfernen einer Entität fragt erst nach, wenn andere Teile des Formulars sie noch nutzen.

Beim Nachbauen der Bildschirme sind weit über hundert Fehler in CiviCRMs eigenen Bildschirmen aufgefallen. afreact macht es an diesen Stellen richtig, statt sie zu übernehmen.

## Voraussetzungen

afreact braucht FormBuilder und SearchKit, die mit CiviCRM ausgeliefert werden. Den React-Editor für FormBuilder gibt es nur, wo FormBuilders eigener Editor (afform_admin) aktiviert ist. Die unterstützten Versionen von CiviCRM und PHP stehen in der `info.xml` der Erweiterung.

## Installation

Laden Sie das Release-Archiv von der [Release-Seite](https://github.com/civico-de/afreact/releases) herunter, entpacken Sie es in das Erweiterungsverzeichnis von CiviCRM und aktivieren Sie es:

```bash
cv ext:enable afreact
```

Danach ändert sich noch nichts: Jedes Formular bleibt bei Angular, bis Sie es umstellen, siehe [Formulare umstellen](switching.md).

## Berechtigungen

afreact bringt keine eigenen Berechtigungen mit. Seine beiden Verwaltungsseiten brauchen **administer CiviCRM**. Ein mit React gezeichnetes Formular behält die Berechtigungen aus FormBuilder, und die React-Editoren brauchen dieselben Berechtigungen wie die Originale.
