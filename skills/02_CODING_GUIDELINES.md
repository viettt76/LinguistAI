# Coding Guidelines

These are the mandatory coding standards for all contributors to the LinguistAI project.

---

## 1. Language Rules

- **Comments:** All code comments must be written in **English**.
- **UI Text:** All strings rendered to the user (labels, buttons, messages, toasts) must be in **English**.
- **Documentation:** Developer-facing markdown files may use any language.

---

## 2. Component Architecture

- **Functional Components only:** Never use class-based components.
- **React Hooks:** Use `useState`, `useEffect`, `useCallback`, `useMemo` appropriately.
- **Atomic Design:** Break UI into small, reusable pieces:
  - `/components/ui/` — Primitive elements (Button, Badge, Input, Card).
  - `/components/flashcard/` — Domain-specific components (FlashcardItem, CollectionCard).
  - `/components/session/` — Study session components (SessionProgress, ReviewCard).
- **Props Interface:** Every component must have an explicitly typed `Props` interface.

---

## 3. Algorithm Separation

- **Never** embed Age calculation, scheduling, or filtering logic directly in a component or store.
- All algorithm logic lives in **`/lib/algorithm.ts`** as pure, testable functions.
- The Zustand store (`useFlashcardStore`) may call functions from `algorithm.ts` but must not contain the logic itself.

---

## 4. State Management (Zustand)

- One central store: `useFlashcardStore`.
- Keep store actions focused: each action does one thing.
- Derive computed values (e.g., today's due cards) inside selectors, not inside components.
- Reset `daily_reps` within the store action that initializes a session, not on the DB layer.

---

## 5. Database (SQLite)

- All raw SQL queries are encapsulated in **`/lib/db.ts`**.
- Components and stores must never write SQL directly.
- Use parameterized queries always — never string-concatenate SQL.
- Schema migrations must be handled in `db.ts` using `CREATE TABLE IF NOT EXISTS`.

---

## 6. TypeScript Standards

- Enable strict mode. No implicit `any`.
- Define shared types in **`/types/index.ts`** (e.g., `Flashcard`, `Collection`, `StudySession`).
- Prefer `type` over `interface` for data shapes; use `interface` only for extensible contracts.

---

## 7. Error Handling

- All async functions (DB calls, AI calls) must be wrapped in `try/catch`.
- Never silently swallow errors. Log with `console.error()` and show user-facing feedback.
- AI-related failures should display a graceful fallback message, not crash the app.

---

## 8. Performance

- Avoid re-rendering: memoize callbacks with `useCallback`, heavy computations with `useMemo`.
- Use `FlatList` (never `ScrollView`) for rendering lists of cards or collections.
- Lazy-load heavy screens using Expo Router's lazy loading support.
