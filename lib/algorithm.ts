import { Flashcard } from '../types';

/**
 * Intensive Learning Algorithm implementation.
 * Pure functions for scheduling and filtering.
 */

/**
 * Calculates the Age of a card in days.
 */
export function getAge(createdAt: string, referenceDate: Date = new Date()): number {
  const created = new Date(createdAt);
  
  // Use local timezone for consistent day calculation
  const createdDay = Date.UTC(created.getFullYear(), created.getMonth(), created.getDate());
  const todayDay = Date.UTC(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((todayDay - createdDay) / msPerDay);
}

/**
 * Determines the target reps for a card based on its age and today's day of week.
 */
export function getTargetReps(age: number, dayOfWeek: number): number {
  // Sunday (Day 0): Grand Review
  if (dayOfWeek === 0) {
    if ((age >= 0 && age <= 6) || (age >= 14 && age <= 20) || (age >= 28 && age <= 34)) {
      return 1;
    }
    return 0;
  }

  // Weekdays (Day 1-6)
  if (age === 0) return 3; // New cards always target 3 reps on weekdays

  switch (dayOfWeek) {
    case 1: // Monday: Age 0 only
      return 0;
    case 2: // Tuesday: Age 0, 1
      return age === 1 ? 1 : 0;
    case 3: // Wednesday: Age 0, 1, 2
    case 4: // Thursday: Age 0, 1, 2 (Age 3 rests)
    case 5: // Friday: Age 0, 1, 2 (Age 4 rests)
      return (age === 1 || age === 2) ? 1 : 0;
    case 6: // Saturday: Age 0, 1, 2, 5
      return (age === 1 || age === 2 || age === 5) ? 1 : 0;
    default:
      return 0;
  }
}

/**
 * Checks if a card is overdue (missed a previous milestone).
 */
export function isOverdue(card: Flashcard, today: Date = new Date()): boolean {
  const age = getAge(card.created_at);
  if (age > 35) return false; // Already graduated
  
  const lastStudied = card.last_studied_at ? new Date(card.last_studied_at) : null;
  const isTodayStudied = lastStudied && 
    lastStudied.getDate() === today.getDate() &&
    lastStudied.getMonth() === today.getMonth() &&
    lastStudied.getFullYear() === today.getFullYear();
    
  if (isTodayStudied) return false;

  // A card is overdue if it's NOT Day 0, and it hasn't reached a minimal threshold of reps
  // or if it was due on a previous day. 
  // Simplified: If it was active on a previous day but daily_reps < target of THAT day.
  // Since we reset daily_reps, we should check if it finished yesterday's target.
  // Actually, let's just use the simpler logic in review.tsx for the stats.
  const target = getTargetReps(age, today.getDay());
  return target > 0 && card.daily_reps < target;
}

/**
 * Checks if a card is "done" for today.
 */
export function isDoneToday(card: Flashcard, today: Date = new Date()): boolean {
  const age = getAge(card.created_at);
  const target = getTargetReps(age, today.getDay());
  return card.daily_reps >= target;
}

/**
 * Filters and sorts flashcards for a study session.
 */
export function buildStudyQueue(cards: Flashcard[]): Flashcard[] {
  const now = new Date();
  const dayOfWeek = now.getDay();
  
  const dueCards = cards.filter(card => {
    const age = getAge(card.created_at);
    const target = getTargetReps(age, dayOfWeek);
    
    // EXCLUDE Age 0 from "Intensive Review" unless it's Sunday
    if (age === 0 && dayOfWeek !== 0) return false;

    // Include if it's due today and not finished, or if it's overdue
    const isDueToday = target > 0 && card.daily_reps < target;
    return isDueToday || isOverdue(card, now);
  });

  // Priority: Overdue (missed in past days) -> Due Today
  return dueCards.sort((a, b) => {
    const overdueA = isOverdue(a, now);
    const overdueB = isOverdue(b, now);

    if (overdueA && !overdueB) return -1;
    if (!overdueA && overdueB) return 1;

    // Within same group, use shuffle logic
    return Math.random() - 0.5;
  });
}
