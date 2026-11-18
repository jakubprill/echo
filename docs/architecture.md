# Echo architecture (alpha)

As of 2026-11-13. This document describes how the app in `app/` is built and collects the decisions made for the alpha. Each of them can be changed; each lists its reason and the cost of changing it.

## Goal

One app for Android, iOS, Windows and macOS, with two product lines:

- **Echo** for adults: spaced-repetition flashcards (SM-2), quiz, text-to-speech.
- **Echo Kids** for children aged 7–9: island map, listening game, stickers.

Vocabulary is not part of the app. The app reads decks in the `echo-deck` format, and code and content live separately.

## Overview

```
┌────────────────────────── app/src ──────────────────────────┐
│  adult/  kids/        screens (React), separate per line     │
│  ui/                  shared icons and mascot                │
│  styles/              design-system tokens + line styles     │
│        │                                                     │
│        ▼                                                     │
│  state/store.ts       single app state, update(fn)           │
│        │                                                     │
│   ┌────┴─────┐                                               │
│   ▼          ▼                                               │
│  core/      platform/                                        │
│  pure       ports: tts, storage, files                       │
│  logic      (browser | Tauri | Claude artifact)              │
└──────────────────────────────────────────────────────────────┘
        ▲ at build time: virtual:echo-content (decks from ECHO_CONTENT_DIR)
```

Dependencies only point down. `core/` imports nothing outside itself, `platform/` does not know React, and screens never touch `localStorage` or the Tauri APIs.

### `core/`: platform-free logic

Plain TypeScript, no DOM. Every function takes a state and returns a new state, so it can be tested without a browser (`npm test`, 26 tests).

| File | Responsible for |
| --- | --- |
| `types.ts` | model: `Deck`, `Card`, `Book`, `AppState`, `Settings` |
| `deck.ts` | loading and validating `echo-deck` v1/v2, backups, state migration |
| `sm2.ts` | review algorithm, four grades, preview of the next interval |
| `session.ts` | study queue, daily new-word limit, recording a grade |
| `quiz.ts` | building questions, checking typed answers with typo tolerance |
| `kids.ts` | islands, game round, stars, stickers, lighthouses |
| `profiles.ts` | household of profiles, the active profile's view, migration of older saves |
| `backups.ts` | which daily backup to write and which old ones to remove |
| `stats.ts` | day streak, charts, breakdown of words by stage |

This is the part that survives any change of UI technology. If we ever decide on Flutter, this directory is the specification to port 1:1, tests included.

### `platform/`: ports

Three small modules, each with one responsibility. The rest of the app calls only these.

| Port | Browser | Tauri (desktop, mobile) | Claude artifact |
| --- | --- | --- | --- |
| `tts.ts` | Web Speech API | native TTS via `tauri-plugin-tts` | Web Speech API |
| `storage.ts` | `localStorage` | `state.json` in the app data directory (+ `localStorage` copy), daily backups in `backups/` | `localStorage` + copy in the user's account |
| `files.ts` | `<input type=file>`, file download | system dialog + `plugin-fs` | file loading, export by copying text |

The Android WebView has no Web Speech API, so speech has to go through the port. The spike confirmed native TTS on macOS. Polish Windows often has no English voice at all; in that case speech stays silent (it does not read English with a Polish voice) and the app shows where in the system settings to add an English (UK) voice.

### `state/store.ts`: one state, several profiles

The saved document is a `Household`: the decks loaded by the user (shared by everyone) and a list of profiles. Each profile is an adult (Echo) or a child (Echo Kids) and has its own card progress, daily log, stars and stickers, and settings (voice, rate, new words per day, theme). `active` is the profile learning right now; `null` shows the profile chooser.

Screens and `core/` functions work on `AppState`, which is the active profile seen together with the shared decks (`viewOf`). A change is always `update(s => coreFunction(s, ...))`; the store writes the result back to the active profile (`withView`). Adding, editing, removing and switching profiles go through `updateHousehold`. Saving happens in the background, 250 ms after the last change. No state library: about 100 lines and `useSyncExternalStore`.

Older saves (schema 1, alpha 0.1) held both lines in one state. On load they become an adult profile "Ja" and, if a child has played, a kids profile "Dziecko". Version 1 backup files are converted the same way.

### Screens

`App.tsx` picks the line (`settings.line`) and sets `data-theme` (`light`, `dark`, `kids`). Each line has its own in-memory navigation, with no router and no URLs: URLs mean nothing in an artifact or a native app, and during a study session the browser's back button would only get in the way.

Styles: `tokens.css` carries over the tokens from the design system (same names, three sets of values). Components use tokens only. The layout is fluid: the mockups were made for 1280×800 landscape, which is the target screen, but the same code also lays out in portrait on a phone (the navigation rail becomes a bottom bar and the mascot moves above the tiles).

## Content

- Deck: an `echo-deck` file (v1, or v2 with the fields `emoji`, `exPl`, `topics`, `unit`, `book`, `audience`). Unknown fields are ignored, so newer decks work in an older app.
- Book: an `echo-book` file with a list of units. The Kids line draws its map from it: each unit is an island, and units without a deck are shown as locked.
- `audience: "kids"` routes a deck to Echo Kids; everything else goes to Echo.
- Bundled decks are picked up by a Vite plugin from the `ECHO_CONTENT_DIR` directory (default `examples/`). The public repository and CI builds contain only the example decks written for the project. The private build (artifact) points at a directory with the real decks, which is not in the repository.
- Decks the user loads from a file go into the state and take precedence over bundled decks with the same `id`.

Progress is keyed by card `id`, so an `id` must never change between deck versions.

## Building and distribution

| Target | Command | Output |
| --- | --- | --- |
| web | `npm run build` | `app/dist` |
| Claude artifact | `ECHO_CONTENT_DIR=… npm run build:artifact` | a single file, `dist-artifact/echo-alpha.html` |
| Windows, macOS | `npx tauri build` | `.msi`/`.exe`, `.dmg` |
| Android | `npx tauri android build --apk --debug` | `.apk` |
| iOS | `npm run tauri ios dev` on a Mac with Xcode | runs on the phone |

The `.github/workflows/build.yml` workflow runs only the tests and the web build on every change in `app/` (about a minute on Linux). The Windows installer and the APK are built on demand (Run workflow with a platform choice). macOS and iOS are disabled in CI for now and will come back once there are users on those devices. The finished files are attached to the run as artifacts.

## Decisions for review

1. **React + TypeScript + Vite + Tauri 2.** As chosen on 2026-11-10 and confirmed by the spike. Flutter remains the alternative; `core/` and its tests limit the cost of a switch to the screen layer.
2. **One app, two lines, profiles at start.** Several adults and several children learn on one device (decided 2026-11-13), each with their own profile. Decks are shared, progress is not. Leaving Echo Kids requires holding a button for over a second. Alternative: two separate apps, i.e. twice the builds and releases.
3. **Adult and child progress are separate models.** Adults: SM-2 with review dates. Children: word level 0–3 and a sticker, with no dates and no "overdue", because a seven-year-old should not see a review backlog. Cost: when a child grows up, their progress does not carry over to SM-2 automatically.
4. **State as one JSON document.** Enough for thousands of cards and the easiest to move around (a backup is the same JSON). The native app writes it to `state.json` in the app data directory (temporary file + rename, so a crash never leaves half a file), because the WebView may clear `localStorage`. Once a day it also writes a backup and keeps the last five; they can be restored in Settings.
5. **Cross-device sync only in the artifact.** The Claude version stores state in the user's account and the newer save wins. Native apps have backup export and import; sync can wait (decided 2026-11-13). Our own sync is a separate decision (account, server, GDPR for children).
6. **Grade labels in Polish** ("Nie wiem", "Trudne", "Dobrze", "Łatwe"), as in the original app. The mockup had English Again/Hard/Good/Easy.
7. **Swiping a flashcard: right for "Dobrze" (Good), left for "Nie wiem" (Again).** "Trudne" (Hard) and "Łatwe" (Easy) are buttons only.
8. **Quiz as the fifth tab instead of "Import".** Loading decks lives in the Decks tab. The quiz icon and a few others (back, bin, magnifier, album) were drawn in the style of the set and are awaiting approval in the design system.
9. **Kids game: Echo speaks the word by itself**, and tapping the bat repeats it. The mockup required a tap before the first playback. The word is also written under the bat, so the game works without sound.
10. **Kids pictures are emoji from the deck.** Good enough for the alpha, but limited: country flags do not render on Windows, and some words share a picture (son, brother, grandson). The game never shows two identical pictures in one question. Target: an `img` field and custom illustrations.
11. **Fonts from Google Fonts.** Offline, the app falls back to system fonts. Font files will be bundled before release.
12. **The original `index.html` stays in the repository** until the alpha replaces it. The `spike-tauri` prototype is not carried over: its Tauri configuration and platform layer went into `app/`.

## Not in the alpha

- adding and editing your own words in the app,
- importing decks from a link, from Anki/CSV or from photos,
- illustrations and an animated mascot (Rive), 3D content,
- store releases (the APK is signed with a stable key, see [android-signing.md](android-signing.md); the Windows installer is not signed),
- manual testing on Windows, Android and iOS.
