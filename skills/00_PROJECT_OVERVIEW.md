# LinguistAI — Project Overview

This document defines the core philosophy, product rules, and non-negotiable constraints for the LinguistAI project.
Every code contribution (logic, UI, database) must strictly follow these principles.

---

## 1. Product Philosophy

- **Model:** Intensive Learning (high-frequency, age-based repetition).
- **Anti-Pattern:** No Spaced Repetition System (SRS), no SM-2 algorithm, no flexible intervals.
- **Fixed Schedule:** Every vocabulary card follows a fixed time matrix derived from its **creation date** (`created_at`).
- **Goal:** Help users deeply absorb vocabulary through consistent, structured repetition within a 7-day cycle.

---

## 2. Vocabulary State Management

A card's status is **never hardcoded** in the database (e.g., `status = 'learning'`).
Instead, it is **dynamically computed at runtime** using:

| Field | Description |
|---|---|
| `created_at` | The date the card was added |
| `today` | Current date at runtime |
| `daily_reps` | Number of reps completed today |
| `last_studied_at` | Timestamp of the last study session |

**Age formula:**
```ts
const age = Math.floor((today - created_at) / (24 * 60 * 60 * 1000));
```

---

## 3. The 7-Day Intensive Matrix

| Age | Status | Schedule | Target Reps |
|---|---|---|---|
| `0` | New | Mon–Sat (no new cards on Sunday) | 3 reps |
| `1` | Review C1 | Day after addition | 1 rep |
| `2` | Review C2 | 2 days after addition | 1 rep |
| `5–6` | Review C3 | Saturday / Sunday | 1 rep |
| `≤6` | Grand Review | Every Sunday | 1 rep |

**Gap Principle:** Thursday and Friday are rest days for cards added on Monday–Tuesday.
This focuses the learner on newer cards while older ones rest.

---

## 4. Long-term Graduation Milestones

After the first week, cards appear only on the Sunday of specific milestone weeks:

| Milestone | Age Range | Schedule |
|---|---|---|
| Milestone 1 | `14 ≤ Age ≤ 20` | Sunday of Week 3 |
| Milestone 2 | `28 ≤ Age ≤ 34` | Sunday of Week 5 |
| **Graduated** | `Age > 34` | Removed from daily queue |

---

## 5. Overdue Persistence Rule (Critical)

The system must be "stubborn" — missed reviews do not disappear silently.

- **Persistence:** If the user misses a **Grand Review Sunday** or a **Milestone**, those cards carry over into the next days' "Focus Review" list.
- **Accumulation:** Today's session = (Cards due today) + (Overdue cards from missed milestones).
- **Completion:** A card only exits the overdue list when `daily_reps >= target_reps`.
- **Priority:** Overdue cards are always shown **before** today's regular cards.

---

## 6. Language & Text Rules

- **All code comments must be in English.**
- **All UI text, labels, and messages displayed to users must be in English.**
- Vietnamese text is only allowed in documentation (like this file) and developer notes.

---

## 7. Core Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native (Expo) |
| Routing | Expo Router |
| AI | Google Gemini 1.5 Flash |
| Database | SQLite (expo-sqlite) |
| State | Zustand (`useFlashcardStore`) |
| Styling | NativeWind (Tailwind CSS) |
| Animations | react-native-reanimated |
| Icons | lucide-react-native |
