# Third-party components and sources

## Original single-file app (`index.html`)

Contains no third-party library code. All code in `index.html`, including the SVG icons, was written for this project.

## Alpha app (`app/`)

Built on open-source libraries installed through npm and Cargo, including React, Vite and Tauri (MIT or Apache-2.0 licenses). The full list with versions is in `app/package-lock.json` and `app/src-tauri/Cargo.lock`; each package keeps its own license.

## Fonts

Loaded at runtime from Google Fonts; not stored in this repository.

| Font | Author | License |
|---|---|---|
| [Bricolage Grotesque](https://fonts.google.com/specimen/Bricolage+Grotesque) | Mathieu Triay | [SIL Open Font License 1.1](https://openfontlicense.org) |
| [Atkinson Hyperlegible](https://fonts.google.com/specimen/Atkinson+Hyperlegible) | Braille Institute of America | [SIL Open Font License 1.1](https://openfontlicense.org) |

The OFL allows the fonts to be used in any project, including commercial ones.

## Browser and platform APIs

- **Web Speech API** (`speechSynthesis`) and the platforms' native text-to-speech: speech uses the voices installed on the user's system. Echo does not distribute any recordings.
- **Claude account storage** (`window.claude`): used only when the app runs as an artifact on claude.ai. Elsewhere, progress is stored in the browser's `localStorage`.

## Spaced-repetition algorithm

Review scheduling is an original implementation based on the publicly described SM-2 algorithm (P. A. Woźniak, 1990). Echo is not affiliated with SuperMemo, Anki or any other learning app. The names mentioned belong to their owners.

## Content

This repository contains no vocabulary decks apart from the examples in `examples/`, which were written for this project. `examples/travel.json` is dedicated to the public domain under CC0 1.0. Decks loaded by users are their own data, and users are responsible for having the right to use them.

## Trademarks

"Echo" is the project's working name. The project is not affiliated with Amazon Echo or any other product of that name.
