# Built-in word pictures

Decks name a picture in the card field `pic`; the app looks it up here by file name without the extension
(`pic: "arasaac-2246"` → `arasaac-2246.png`). Cards keep their `emoji` as a fallback for words without a
picture and for older app versions.

## Source and license

All `arasaac-*.png` files are pictograms from [ARASAAC](https://arasaac.org), by Sergio Palao, owned by the
Government of Aragón (Spain), licensed under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). They are **not** covered by the MIT
license of the code: they may not be used commercially, and changed versions must keep the same license.
The files here were scaled down to 256 px and reduced to a 128-colour palette; that is the only change.

## Adding pictures

1. Find the pictogram on arasaac.org (or `https://api.arasaac.org/v1/pictograms/en/search/<word>`) and note its id.
2. Download `https://static.arasaac.org/pictograms/<id>/<id>_300.png`.
3. Scale it to fit 256×256, save it as a palette PNG named `arasaac-<id>.png` in this folder.
4. Set `"pic": "arasaac-<id>"` on the card in the deck.

Pictures from other sources need a license that allows redistribution in this public repository; list them
here and in `NOTICE.md`.
