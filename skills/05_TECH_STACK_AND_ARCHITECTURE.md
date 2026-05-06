# Tech Stack & Architecture

This document defines the technology choices, folder structure, database schema,
and architectural patterns used in LinguistAI.

---

## 1. Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Framework | React Native (Expo SDK 51+) | Cross-platform, fast iteration |
| Routing | Expo Router (file-based) | Native navigation, deep linking |
| AI Engine | Google Gemini 1.5 Flash | Fast responses, free tier (15 req/min) |
| Database | SQLite via `expo-sqlite` | Fully offline, zero server cost |
| State Management | Zustand | Lightweight, minimal boilerplate |
| Styling | NativeWind (Tailwind CSS) | Rapid premium UI development |
| Animations | `react-native-reanimated` | Smooth 60fps card flip & transitions |
| Icons | `lucide-react-native` | Consistent, clean icon set |
| Fonts | `expo-font` (Outfit + Inter) | Premium typography |
| Haptics | `expo-haptics` | Native tactile feedback |

---

## 2. Folder Structure

```
/app                    → Screens (Expo Router file-based routing)
  /(tabs)/              → Bottom tab navigator
    index.tsx             → Collection management
    tutor.tsx             → AI Tutor chat
    settings.tsx          → App settings
  /collection/[id].tsx    → Collection detail screen
  /session/[id].tsx       → Active study session

/components
  /ui/                  → Primitive components (Button, Badge, Input, Card, Spinner)
  /flashcard/           → FlashcardItem, CollectionCard, CollectionList
  /session/             → ReviewCard, SessionProgress, RatingButtons
  /tutor/               → ChatBubble, TutorInput

/lib
  algorithm.ts          → All Intensive Algorithm logic (pure functions)
  db.ts                 → All SQLite queries (no raw SQL outside this file)
  gemini.ts             → Gemini API client and prompt builders
  utils.ts              → Date helpers, formatting, string utilities

/store
  useFlashcardStore.ts  → Zustand store (state + actions)

/types
  index.ts              → Shared TypeScript types (Flashcard, Collection, StudySession)

/constants
  colors.ts             → Design token values
  layout.ts             → Spacing, radius, shadow presets
```

---

## 3. Database Schema (SQLite)

### Table: `collections` (DB table: `collections`)
 
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PRIMARY KEY | Auto-increment |
| `name` | TEXT NOT NULL | Collection display name |
| `icon` | TEXT | Emoji or icon identifier |
| `created_at` | TEXT NOT NULL | ISO 8601 timestamp |

### Table: `flashcards`
 
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PRIMARY KEY | Auto-increment |
| `collection_id` | INTEGER NOT NULL | Foreign key (DB: `collection_id`) |
| `english` | TEXT NOT NULL | The word or phrase |
| `vietnamese` | TEXT NOT NULL | Translation |
| `phonetic` | TEXT | IPA pronunciation |
| `word_type` | TEXT | noun / verb / adj / adv / phrase |
| `grammar_note` | TEXT | Optional grammar explanation |
| `example_en` | TEXT | Example sentence (English) |
| `example_vi` | TEXT | Example sentence (Vietnamese) |
| `daily_reps` | INTEGER DEFAULT 0 | Reps completed today |
| `last_studied_at` | TEXT | ISO 8601 timestamp of last study |
| `total_reps` | INTEGER DEFAULT 0 | Cumulative rep count |
| `created_at` | TEXT NOT NULL | ISO 8601 — used for Age calculation |

> **Critical:** `created_at` is the foundation of the entire Intensive Algorithm.
> Never allow it to be updated after the card is first created.

---

## 4. Data Flow

```
User Action
    │
    ▼
Component (UI)
    │  calls store action
    ▼
useFlashcardStore (Zustand)
    │  calls algorithm functions
    │  calls db functions
    ▼
algorithm.ts ──────────────► Pure logic (no side effects)
    │
db.ts ─────────────────────► SQLite read/write
```

---

## 5. State Shape (`useFlashcardStore`)

```ts
interface FlashcardStore {
  // Data
  collections: Collection[];
  flashcards: Flashcard[];
  sessionQueue: Flashcard[];   // Today's ordered study queue
  currentSessionIndex: number;
 
  // UI state
  isLoading: boolean;
  isSessionActive: boolean;
 
  // Actions
  loadCollections: () => Promise<void>;
  loadFlashcards: (collectionId: number) => Promise<void>;
  buildSessionQueue: (collectionId?: number) => void; // Uses algorithm.ts
  recordRep: (cardId: number, isSuccess: boolean) => Promise<void>;
  addFlashcard: (data: Partial<Flashcard>) => Promise<void>;
  deleteFlashcard: (cardId: number) => Promise<void>;
  addCollection: (name: string, icon: string) => Promise<number>;
  removeCollection: (collectionId: number) => Promise<void>;
}
```

---

## 6. Key Architectural Rules

1. **No SQL outside `db.ts`** — All queries are centralized and parameterized.
2. **No algorithm logic outside `algorithm.ts`** — Keeps logic testable and isolated.
3. **No direct state mutation** — Always use store actions.
4. **Types in `/types/index.ts`** — Never define `Flashcard` or `Collection` inline in components.
5. **`created_at` is immutable** — Never update it after card creation.
