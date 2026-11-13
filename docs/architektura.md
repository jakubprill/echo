# Architektura Echo (wersja alfa)

Stan na 13.11.2026. Dokument opisuje, jak zbudowana jest aplikacja w katalogu `app/`, i zbiera decyzje, które podjąłem przy alfie. Każdą z nich da się zmienić; przy każdej jest powód i koszt zmiany.

## Cel

Jedna aplikacja na Androida, iOS, Windows i macOS, z dwiema liniami produktu:

- **Echo** dla dorosłych: fiszki z powtórkami w odstępach (SM-2), quiz, lektor.
- **Echo Kids** dla dzieci 7–9 lat: mapa wysp, gra ze słuchu, naklejki.

Słówka nie są częścią aplikacji. Aplikacja czyta talie w formacie `echo-deck`, a kod i treści żyją osobno.

## Obraz całości

```
┌────────────────────────── app/src ──────────────────────────┐
│  adult/  kids/        ekrany (React), osobne dla każdej linii│
│  ui/                  wspólne ikony i maskotka               │
│  styles/              tokeny design systemu + style linii    │
│        │                                                     │
│        ▼                                                     │
│  state/store.ts       jeden stan aplikacji, update(fn)       │
│        │                                                     │
│   ┌────┴─────┐                                               │
│   ▼          ▼                                               │
│  core/      platform/                                        │
│  czysta     porty: tts, storage, files                       │
│  logika     (przeglądarka | Tauri | artefakt Claude)         │
└──────────────────────────────────────────────────────────────┘
        ▲ w czasie budowania: virtual:echo-content (talie z ECHO_CONTENT_DIR)
```

Zależności idą tylko w dół. `core/` nie importuje niczego poza sobą, `platform/` nie zna Reacta, ekrany nie dotykają `localStorage` ani API Tauri.

### `core/`: logika bez platformy

Czysty TypeScript, bez DOM. Każda funkcja bierze stan i zwraca nowy stan, więc da się ją testować bez przeglądarki (`npm test`, 16 testów).

| Plik | Odpowiada za |
| --- | --- |
| `types.ts` | model: `Deck`, `Card`, `Book`, `AppState`, `Settings` |
| `deck.ts` | wczytanie i walidacja `echo-deck` v1/v2, kopia zapasowa, migracja stanu |
| `sm2.ts` | algorytm powtórek, cztery oceny, podgląd następnego odstępu |
| `session.ts` | kolejka nauki, dzienny limit nowych słówek, zapis oceny |
| `quiz.ts` | układanie pytań, sprawdzanie wpisanej odpowiedzi z tolerancją literówki |
| `kids.ts` | wyspy, runda gry, gwiazdki, naklejki, latarnie |
| `stats.ts` | seria dni, wykresy, podział słówek na etapy |

To jest część, która przeżyje każdą zmianę technologii interfejsu. Gdyby kiedyś zapadła decyzja o Flutterze, ten katalog jest specyfikacją do przepisania 1:1, razem z testami.

### `platform/`: porty

Trzy małe moduły, każdy z jedną odpowiedzialnością. Reszta aplikacji woła tylko je.

| Port | Przeglądarka | Tauri (desktop, mobile) | Artefakt Claude |
| --- | --- | --- | --- |
| `tts.ts` | Web Speech API | natywny lektor przez `tauri-plugin-tts` | Web Speech API |
| `storage.ts` | `localStorage` | `localStorage` w WebView | `localStorage` + kopia na koncie użytkownika |
| `files.ts` | `<input type=file>`, pobranie pliku | okno systemowe + `plugin-fs` | wczytanie pliku, eksport przez kopiowanie tekstu |

Android WebView nie ma Web Speech API, dlatego lektor musi iść przez port. Projekt próbny (spike) potwierdził natywny lektor na macOS. Polski Windows często nie ma żadnego angielskiego głosu; wtedy lektor milczy (nie czyta angielskiego polskim głosem), a aplikacja pokazuje, gdzie w ustawieniach systemu dodać głos English (UK).

### `state/store.ts`: jeden stan

Cały stan użytkownika to jeden obiekt `AppState` (talie wczytane przez użytkownika, postęp kart, dziennik dni, postęp dziecka, ustawienia). Zmiana to zawsze `update(s => funkcjaZCore(s, ...))`. Zapis dzieje się w tle, 250 ms po ostatniej zmianie. Bez biblioteki do stanu: 80 linii i `useSyncExternalStore`.

### Ekrany

`App.tsx` wybiera linię (`settings.line`) i ustawia `data-theme` (`light`, `dark`, `kids`). Każda linia ma własną nawigację w pamięci, bez routera i bez adresów URL: w artefakcie i w aplikacji natywnej adresy nie mają znaczenia, a w sesji nauki przycisk „wstecz” przeglądarki tylko by przeszkadzał.

Style: `tokens.css` przenosi tokeny z design systemu (te same nazwy, trzy zestawy wartości). Komponenty używają wyłącznie tokenów. Układ jest płynny: makiety powstały dla 1280×800 w poziomie i tak wygląda ekran docelowy, ale ten sam kod układa się też w pionie na telefonie (szyna nawigacji zamienia się w dolny pasek, maskotka przechodzi nad kafelki).

## Treści

- Talia: plik `echo-deck` (v1 albo v2 z polami `emoji`, `exPl`, `topics`, `unit`, `book`, `audience`). Nieznane pola są pomijane, więc nowsze talie działają w starszej aplikacji.
- Książka: plik `echo-book` z listą unitów. Linia Kids rysuje z niej mapę: każdy unit to wyspa, unity bez talii są widoczne jako zamknięte.
- `audience: "kids"` kieruje talię do Echo Kids, wszystko inne do Echo.
- Talie dołączone do builda bierze wtyczka Vite z katalogu `ECHO_CONTENT_DIR` (domyślnie `examples/`). Publiczne repozytorium i buildy z CI zawierają tylko talie przykładowe napisane dla projektu. Build prywatny (artefakt) wskazuje katalog z prawdziwymi taliami, który nie jest w repozytorium.
- Talie wczytane przez użytkownika z pliku trafiają do stanu i mają pierwszeństwo przed dołączonymi o tym samym `id`.

Postęp jest przypięty do `id` karty, dlatego `id` nie może się zmieniać między wersjami talii.

## Budowanie i dystrybucja

| Cel | Polecenie | Wynik |
| --- | --- | --- |
| web | `npm run build` | `app/dist` |
| artefakt Claude | `ECHO_CONTENT_DIR=… npm run build:artifact` | jeden plik `dist-artifact/echo-alfa.html` |
| Windows, macOS | `npx tauri build` | `.msi`/`.exe`, `.dmg` |
| Android | `npx tauri android build --apk --debug` | `.apk` |
| iOS | `npm run tauri ios dev` na Macu z Xcode | uruchomienie na telefonie |

Workflow `.github/workflows/build.yml` przy każdej zmianie w `app/` uruchamia tylko testy i build web (ok. minuty na Linuksie). Instalatory Windows i macOS oraz APK buduje się ręcznie (Run workflow z wyborem platformy), bo w repozytorium prywatnym minuty macOS liczą się 10x, a Windows 2x. Gotowe pliki są w artefaktach przebiegu.

## Decyzje do przeglądu

1. **React + TypeScript + Vite + Tauri 2.** Zgodnie z wyborem z 10.11 i wynikiem projektu próbnego. Flutter zostaje alternatywą; `core/` i testy ograniczają koszt ewentualnej zmiany do warstwy ekranów.
2. **Jedna aplikacja, dwie linie, wybór profilu na starcie.** Na jednym laptopie uczą się rodzic i dziecko. Wyjście z Echo Kids wymaga przytrzymania przycisku przez ponad sekundę. Alternatywa: dwie osobne aplikacje, czyli dwa razy więcej budowania i wydań.
3. **Postęp dorosłych i dzieci to osobne modele.** Dorośli: SM-2 z datami powtórek. Dzieci: poziom słowa 0–3 i naklejka, bez dat i bez „zaległości”, bo siedmiolatek nie powinien widzieć długu powtórek. Koszt: gdy dziecko dorośnie, jego postęp nie przenosi się automatycznie do SM-2.
4. **Stan jako jeden dokument JSON w `localStorage`.** Wystarcza na tysiące kart i jest najprostszy do przenoszenia (kopia zapasowa to ten sam JSON). Przed wydaniem poza alfę zamienię to na plik w katalogu danych aplikacji, bo WebView może wyczyścić `localStorage`. Zmiana dotyczy tylko `platform/storage.ts`.
5. **Synchronizacja między urządzeniami tylko w artefakcie.** Wersja w Claude zapisuje stan na koncie użytkownika i wygrywa nowszy zapis. W aplikacjach natywnych na razie jest eksport i import kopii. Własna synchronizacja to osobna decyzja (konto, serwer, RODO przy dzieciach).
6. **Etykiety ocen po polsku** („Nie wiem”, „Trudne”, „Dobrze”, „Łatwe”), jak w dotychczasowej aplikacji. Makieta miała angielskie Again/Hard/Good/Easy.
7. **Przesunięcie fiszki: w prawo „Dobrze”, w lewo „Nie wiem”.** „Trudne” i „Łatwe” tylko przyciskami.
8. **Quiz jako piąta zakładka zamiast „Import”.** Wczytywanie talii jest w zakładce Talie. Ikona quizu i kilka innych (wstecz, kosz, lupa, album) są dorysowane w stylu zestawu i czekają na akceptację w design systemie.
9. **Gra Kids: Echo sam wypowiada słowo**, a dotknięcie nietoperza je powtarza. Makieta wymagała dotknięcia przed pierwszym odsłuchem. Pod nietoperzem jest też słowo na piśmie, więc gra działa bez dźwięku.
10. **Obrazki w Kids to emoji z talii.** Wystarcza na alfę, ale ma granice: flagi krajów nie wyświetlają się na Windows, a kilka słów dzieli ten sam obrazek (son, brother, grandson). Gra nie pokazuje dwóch takich samych obrazków w jednym pytaniu. Docelowo pole `img` i własne ilustracje.
11. **Czcionki z Google Fonts.** Bez internetu aplikacja używa czcionek systemowych. Przed wydaniem dołączę pliki czcionek do aplikacji.
12. **Stary `index.html` zostaje w repozytorium** do czasu, aż alfa go zastąpi. Projekt próbny `spike-tauri` nie jest przenoszony: jego konfiguracja Tauri i warstwa platformy weszły do `app/`.

## Czego alfa nie ma

- dodawania i edycji własnych słówek w aplikacji,
- importu talii z linku, z Anki/CSV i ze zdjęć,
- ilustracji i animowanej maskotki (Rive), treści 3D,
- podpisanych instalatorów i wydań w sklepach,
- testu ręcznego na Windows, Androidzie i iOS.
