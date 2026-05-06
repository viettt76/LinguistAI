# Intensive Learning Algorithm — Official Specification

This document is the single source of truth for the Intensive Algorithm.
All filtering, scheduling, and overdue logic must be implemented as pure functions in `/lib/algorithm.ts`.

---

## 1. Core Concepts

### Age
The number of full days elapsed since a card was created.
```ts
// Always use UTC midnight to avoid timezone drift
function getAge(createdAt: string): number {
  const created = new Date(createdAt);
  const today = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((today.getTime() - created.getTime()) / msPerDay);
}
```

### Day of Week
Sunday = 0, Monday = 1, ..., Saturday = 6.
```ts
const dayOfWeek = new Date().getDay(); // 0 = Sunday
const isSunday = dayOfWeek === 0;
```

---

## 2. Weekly Intensive Schedule

### Weekday Logic (Mon–Sat)
Cards are "due" today if their Age matches any of the following:

| Age | Label | Target Reps |
|---|---|---|
| `0` | New card | 3 |
| `1` | Review C1 | 1 |
| `2` | Review C2 | 1 |
| `5` | Review C3a | 1 |
| `6` | Review C3b | 1 |

**Rule:** Age `0` cards are NEVER added on Sunday.

### Sunday Logic (Grand Review)
On Sunday, ALL cards with `0 ≤ Age ≤ 6` are due.
This is the most critical checkpoint of the week.

---

## 3. Long-term Milestone Schedule

After the first week, a card only reappears on the Sunday of milestone weeks:

```ts
function isMilestoneWeek(age: number, isSunday: boolean): boolean {
  if (!isSunday) return false;
  return (age >= 14 && age <= 20) || (age >= 28 && age <= 34);
}
```

| Milestone | Age Range | Week |
|---|---|---|
| Milestone 1 | 14–20 | Week 3 (Sunday) |
| Milestone 2 | 28–34 | Week 5 (Sunday) |
| Graduated | Age > 34 | Removed from queue |

---

## 4. Overdue Logic (Persistence Engine)

This is the most critical part of the algorithm. Missed reviews must NOT be silently dropped.

### What triggers overdue?
A card becomes "overdue" if:
1. Today's `daily_reps` < the required `target_reps` for that card's slot.
2. AND `last_studied_at` was a date in the past (i.e., it belongs to a missed milestone).

### How overdue is computed
```ts
function isOverdue(card: Flashcard, today: Date): boolean {
  if (!card.last_studied_at) return false;
  const lastStudied = new Date(card.last_studied_at);
  const isTodayStudied = isSameDay(lastStudied, today);
  if (isTodayStudied) return false; // Already worked on today

  const age = getAge(card.created_at);
  const target = getTargetReps(age, today);
  return target > 0 && card.daily_reps < target;
}
```

### Priority in session queue
```
Priority 1: Overdue cards (sorted by age descending, oldest first)
Priority 2: Cards due today (sorted by age ascending)
```

---

## 5. Daily Reps Reset Rule

`daily_reps` must be reset to `0` at the start of each new calendar day.
This should be handled when the app loads or a session begins:
```ts
// Reset daily_reps if last_studied_at is from a previous day
if (card.last_studied_at && !isSameDay(new Date(card.last_studied_at), new Date())) {
  card.daily_reps = 0;
}
```

---

## 6. Session Completion Check

A card is considered "done for today" when:
```ts
function isDoneToday(card: Flashcard, today: Date): boolean {
  return card.daily_reps >= getTargetReps(getAge(card.created_at), today);
}
```

---

## 7. Implementation Location

All algorithm functions must live in **`/lib/algorithm.ts`**.
Never embed scheduling or filtering logic directly inside components or the Zustand store.
The store can call algorithm functions but must not contain the logic itself.
