# Komponenty zewnętrzne i źródła

Echo nie zawiera kodu bibliotek zewnętrznych. Cały kod w `index.html`, łącznie z ikonami SVG, jest napisany na potrzeby tego projektu.

## Czcionki

Ładowane w czasie działania z Google Fonts, nie są przechowywane w repozytorium.

| Czcionka | Autor | Licencja |
|---|---|---|
| [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) | Mathieu Triay | [SIL Open Font License 1.1](https://openfontlicense.org) |
| [Atkinson Hyperlegible](https://fonts.google.com/specimen/Atkinson+Hyperlegible) | Braille Institute of America | [SIL Open Font License 1.1](https://openfontlicense.org) |

Licencja OFL pozwala używać czcionek w dowolnych projektach, także komercyjnych.

## Interfejsy przeglądarki i platformy

- **Web Speech API** (`speechSynthesis`): lektor korzysta z głosów zainstalowanych w systemie użytkownika. Echo nie dystrybuuje żadnych nagrań.
- **Zapis na koncie Claude** (`window.claude`): używany tylko wtedy, gdy aplikacja działa jako artefakt w claude.ai. W innych miejscach postępy zapisują się w `localStorage` przeglądarki.

## Algorytm powtórek

Planowanie powtórek jest własną implementacją opartą na publicznie opisanym algorytmie SM-2 (P. A. Woźniak, 1990). Echo nie jest powiązane z SuperMemo, Anki ani innymi aplikacjami do nauki. Wymienione nazwy należą do ich właścicieli.

## Treści

Repozytorium nie zawiera talii słówek. Jedyna talia, `examples/podroze.json`, została napisana dla tego projektu i jest udostępniona jako CC0. Talie wczytywane przez użytkownika są jego własnymi danymi: odpowiada on za to, czy ma prawo ich używać.

## Znaki towarowe

„Echo” to robocza nazwa projektu. Projekt nie jest powiązany z Amazon Echo ani z żadnym innym produktem o tej nazwie.
