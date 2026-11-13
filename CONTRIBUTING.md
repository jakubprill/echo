# Contributing

Echo is a personal project and is not open to outside code contributions for now (see [LICENSE](LICENSE)). Bug reports and ideas are welcome as issues. These conventions apply to everyone working in the repository, including AI assistants.

## Language

- Everything in the repository is in **English**: file and directory names, code, comments, tests, documentation, commit messages, issues and pull requests.
- The only exception is the app's user-facing text, which is in **Polish** because the app is for Polish learners. Polish translations inside deck files (`"pl"`, `"note"`, …) are content, not documentation.

## Content and copyright

- Never commit vocabulary decks made from textbooks, courses or other copyrighted material. This repository is public.
- Only decks written for this project go into `examples/`. `.gitignore` excludes every other `.json` file outside the app's configuration.
- Private decks are bundled at build time with `ECHO_CONTENT_DIR` (see [docs/architecture.md](docs/architecture.md)).

## Branches and pull requests

- `main` is always releasable. Work on a short-lived branch and open a pull request.
- Pull requests are squash-merged. Keep the title short and imperative, e.g. "Add CSV deck import".
- Delete the branch after it is merged, both on GitHub and locally. Do not leave stale branches behind.

## Development

```sh
cd app
npm install
npm test     # must pass before merging
npm run dev
```

Keep the layering described in [docs/architecture.md](docs/architecture.md): `core/` stays free of browser, React and Tauri code, and platform access goes through `platform/`.
