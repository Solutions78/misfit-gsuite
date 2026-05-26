# Repository Guidelines

## Project Structure & Module Organization
Misfit GSuite is a Tauri 2 desktop app with a React/TypeScript frontend and Rust backend.
- `src/` contains frontend code. Key areas are `components/` (UI by feature), `store/` (Zustand state), `lib/` (Tauri bridge/helpers), `types/`, and global styles (`App.css`, `mm-themes.css`). Use the `@/` alias for imports from `src`.
- `src-tauri/src/` contains backend Rust modules: `api/` for Google/Gemini clients, `auth/` for OAuth and keychain handling, `commands/` for Tauri invoke handlers, `db/` for SQLite schema/queries, and `background/` for sync tasks.
- `public/` and `src/assets/` hold frontend assets; `src-tauri/icons/` holds bundle icons. `dist/`, `node_modules/`, and `src-tauri/target/` are generated outputs.

## Build, Test, and Development Commands
- `npm install` installs Node dependencies from `package-lock.json`.
- `npm run dev` starts the Vite frontend at the Tauri dev URL.
- `npm run tauri -- dev` runs the full desktop app locally.
- `npm run build` runs TypeScript checks and builds the frontend into `dist/`.
- `npm run preview` previews the built frontend.
- `npm run tauri -- build` creates a packaged desktop build.
- `cd src-tauri && cargo check` validates Rust backend changes quickly.

## Coding Style & Naming Conventions
Use strict TypeScript with React functional components where possible. Name React components and component files in `PascalCase` (for example, `MailView.tsx`), hooks/stores/helpers in `camelCase`, and Rust modules/files in `snake_case`. Keep imports ordered by external packages first, then `@/` project imports, then local styles. Use two-space indentation in TSX/JSON and standard `rustfmt` formatting for Rust.

## Testing Guidelines
No dedicated frontend test runner is configured yet. Before opening a PR, run `npm run build` and `cargo check`; use `cargo test` when adding Rust unit tests. Place Rust tests beside the module under `#[cfg(test)]`. If a JS test framework is introduced, colocate tests as `*.test.ts(x)` near the code under test.

## Commit & Pull Request Guidelines
History currently uses Conventional Commits such as `feat: initial Misfit GSuite...` and `fix: mail selection and rendering issues`; keep using `feat:`, `fix:`, `docs:`, `refactor:`, or `chore:` with a short imperative summary. PRs should describe the change, list verification commands run, link related issues, and include screenshots or short recordings for UI changes.

## Security & Configuration Tips
Copy `.env.example` to `.env` for local Google credentials and Pub/Sub IDs. Never commit `.env`, OAuth secrets, tokens, SQLite caches, or generated build artifacts. Review `src-tauri/tauri.conf.json` when changing external network access or app permissions.
