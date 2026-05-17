import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getAge, getTargetReps, isOverdue } from '../lib/algorithm';
import * as db from '../lib/db';
import { ApiKey, Collection, Flashcard } from '../types';

interface FlashcardState {
  // Data
  collections: Collection[];
  flashcards: Flashcard[];
  apiKeys: ApiKey[];
  inboxCollectionId: number | null;

  // Intensive counters
  newCramCount: number;
  newCramTotalCount: number;
  focusReviewCount: number;
  focusTotalCount: number;

  // Session State
  sessionQueue: Flashcard[];
  currentSessionIndex: number;
  sessionMode: 'new' | 'review' | 'all' | null;
  
  // Exam State
  examQueue: Flashcard[];
  examIndex: number;
  examResults: { remember: number; forget: number };
  isExamActive: boolean;

  // Loading & Global State
  isLoading: boolean;
  isInitialized: boolean;

  // Actions
  init: () => Promise<void>;
  activeCollectionId: number | null;
  setActiveCollectionId: (id: number | null) => void;
  refresh: () => Promise<void>;
  loadCollections: () => Promise<void>;
  addCollection: (name: string, icon: string) => Promise<number>;
  editCollection: (id: number, name: string, icon: string) => Promise<void>;
  removeCollection: (id: number) => Promise<void>;
  removeMultipleCollections: (ids: number[]) => Promise<void>;
  loadFlashcards: (collectionId?: number) => Promise<void>;
  searchFlashcards: (query: string) => Promise<(Flashcard & { collection_name: string; collection_icon: string })[]>;
  addFlashcard: (
    card: Omit<Flashcard, 'id' | 'daily_reps' | 'last_studied_at' | 'total_reps'>
  ) => Promise<{ action: 'added' | 'updated' | 'skipped' }>;
  addFlashcardsBulk: (
    cards: Array<Omit<Flashcard, 'id' | 'daily_reps' | 'last_studied_at' | 'total_reps'>>
  ) => Promise<{ added: number; updated: number; skipped: number }>;
  updateFlashcard: (card: Partial<Flashcard> & { id: number }) => Promise<void>;
  removeFlashcard: (id: number) => Promise<void>;
  removeMultipleFlashcards: (ids: number[]) => Promise<void>;
  moveFlashcard: (id: number, targetCollectionId: number) => Promise<void>;
  moveMultipleFlashcards: (ids: number[], targetCollectionId: number) => Promise<void>;
  findDuplicate: (english: string, wordType?: string) => Promise<Flashcard | null>;
  findDuplicateInCollection: (english: string, collectionId: number, wordType?: string) => Promise<Flashcard | null>;
  startSession: (collectionId?: number, mode?: 'new' | 'review' | 'all') => void;
  recordRep: (cardId: number, isSuccess: boolean) => Promise<void>;
  nextCard: () => void;
  startExam: () => void;
  recordExamRep: (isSuccess: boolean) => void;
  resetExam: () => void;
  loadApiKeys: () => Promise<void>;
  addApiKey: (key: string) => Promise<void>;
  removeApiKey: (id: number) => Promise<void>;
  toggleApiKey: (id: number, isActive: boolean) => Promise<void>;
  exportData: () => Promise<any>;
  importData: (collections: any[], cards: any[]) => Promise<void>;
  isAutoPlayEnabled: boolean;
  toggleAutoPlay: () => void;
  undoRep: (cardId: number, wasSuccess: boolean) => Promise<void>;
}

const computeIntensiveCounts = (cards: Flashcard[]) => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  
  let newCramTotal = 0;
  let newCramRemaining = 0;
  let focusTotal = 0;
  let focusRemaining = 0;

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const age = getAge(card.created_at);
    const target = getTargetReps(age, dayOfWeek);

    if (age === 0) {
      // New cards logic
      if (target > 0) {
        newCramTotal++;
        if (card.daily_reps < target) {
          newCramRemaining++;
        }
      }
    } else {
      // Review cards logic (Age > 0)
      if (target > 0) {
        focusTotal++;
        if (card.daily_reps < target) {
          focusRemaining++;
        }
      }
    }
  }

  return {
    newCramCount: newCramRemaining,
    newCramTotalCount: newCramTotal,
    focusReviewCount: focusRemaining,
    focusTotalCount: focusTotal,
  };
};

const norm = (s: string) => (s ?? '').trim().toLowerCase();
const capitalizeFirst = (s: string) => {
  const t = (s ?? '').trim();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export const useFlashcardStore = create<FlashcardState>()(
  persist(
    (set, get) => ({
      collections: [],
      flashcards: [],
      apiKeys: [],
      inboxCollectionId: null,
      newCramCount: 0,
      newCramTotalCount: 0,
      focusReviewCount: 0,
      focusTotalCount: 0,
      sessionQueue: [],
      currentSessionIndex: 0,
      sessionMode: null,
      examQueue: [],
      examIndex: 0,
      examResults: { remember: 0, forget: 0 },
      isExamActive: false,
      isLoading: false,
      isInitialized: false,
      activeCollectionId: null,
      isAutoPlayEnabled: false,
      toggleAutoPlay: () => set(state => ({ isAutoPlayEnabled: !state.isAutoPlayEnabled })),

      init: async () => {
        if (get().isInitialized) return;
        set({ isLoading: true });
        await db.initDb();
        const collections = await db.getAllCollections();
        const flashcards = await db.getAllFlashcards();
        const apiKeys = await db.getApiKeys();
        const inboxIdStr = await db.getSetting('inbox_collection_id');
        const inboxCollectionId = inboxIdStr ? Number(inboxIdStr) : null;
        const counts = computeIntensiveCounts(flashcards);
        set({ collections, flashcards, apiKeys, inboxCollectionId, ...counts, isLoading: false, isInitialized: true });
      },

      setActiveCollectionId: (id) => set({ activeCollectionId: id }),

      refresh: async () => {
        await db.resetDailyRepsIfNeeded();
        const collections = await db.getAllCollections();
        const flashcards = await db.getAllFlashcards();
        const counts = computeIntensiveCounts(flashcards);
        set({ collections, flashcards, ...counts });
      },

      loadCollections: async () => {
        const collections = await db.getAllCollections();
        set({ collections });
      },

      addCollection: async (name, icon) => {
        const id = await db.createCollection(name, icon);
        await get().refresh();
        return id;
      },

      editCollection: async (id, name, icon) => {
        await db.updateCollection(id, name, icon);
        await get().loadCollections();
      },

      removeCollection: async (id) => {
        await db.deleteCollection(id);
        await get().refresh();
      },

      removeMultipleCollections: async (ids) => {
        await db.deleteMultipleCollections(ids);
        await get().refresh();
      },

      loadFlashcards: async (collectionId) => {
        await db.resetDailyRepsIfNeeded();
        const flashcards = collectionId
          ? await db.getFlashcardsByCollection(collectionId)
          : await db.getAllFlashcards();
        const counts = computeIntensiveCounts(flashcards);
        set({ flashcards, ...counts });
      },

      searchFlashcards: async (query) => {
        return await db.searchFlashcards(query);
      },

      addFlashcard: async (cardData) => {
        const english = capitalizeFirst(cardData.english ?? '');
        if (!english) {
          return { action: 'skipped' };
        }

        const targetCollectionId = Number((cardData as any).collection_id);
        const hasValidTarget = Number.isFinite(targetCollectionId);

        // Prefer updating within target collection when possible.
        const dupInTarget = hasValidTarget
          ? await db.findDuplicateFlashcardInCollection(english, targetCollectionId)
          : null;

        const dup = dupInTarget ?? await db.findDuplicateFlashcard(english);

        if (!dup) {
          await db.createFlashcard({ ...cardData, english });
          await get().refresh();
          return { action: 'added' };
        }

        if (dupInTarget || (hasValidTarget && dup.collection_id === targetCollectionId)) {
          await db.updateFlashcard({
            id: dup.id,
            ...cardData,
            english,
          } as any);
          await get().refresh();
          return {
            action: 'updated',
          };
        }

        await db.createFlashcard({ ...cardData, english });
        await get().refresh();
        return {
          action: 'added',
        };
      },

      addFlashcardsBulk: async (cards) => {
        let added = 0;
        let updated = 0;
        let skipped = 0;

        // Merge duplicates inside the same batch by (english, target collection).
        // Last one wins. This avoids inflating counts and avoids "skipped" for normal duplicates.
        const merged = new Map<string, Omit<Flashcard, 'id' | 'daily_reps' | 'last_studied_at' | 'total_reps'>>();
        for (const raw of cards) {
          const english = capitalizeFirst(raw.english ?? '');
          const keyEnglish = norm(english);
          if (!keyEnglish) continue;
          const key = `${keyEnglish}::${String((raw as any).collection_id ?? '')}`;
          merged.set(key, { ...(raw as any), english });
        }

        // Count truly invalid cards (empty english)
        for (const raw of cards) {
          const english = capitalizeFirst(raw.english ?? '');
          if (!norm(english)) skipped++;
        }

        for (const raw of merged.values()) {
          const english = capitalizeFirst(raw.english ?? '');
          if (!norm(english)) continue;

          const targetCollectionId = Number((raw as any).collection_id);
          const hasValidTarget = Number.isFinite(targetCollectionId);

          // Prefer updating within the target collection (fixes miscount when multiple collections share the same english).
          const dupInTarget = hasValidTarget
            ? await db.findDuplicateFlashcardInCollection(english, targetCollectionId, raw.word_type)
            : null;

          const dup = dupInTarget ?? await db.findDuplicateFlashcard(english, raw.word_type);

          if (!dup) {
            await db.createFlashcard({ ...(raw as any), english });
            added++;
            continue;
          }

          if (dupInTarget || (hasValidTarget && dup.collection_id === targetCollectionId)) {
            await db.updateFlashcard({
              id: dup.id,
              ...(raw as any),
              english,
            });
            updated++;
          } else {
            await db.createFlashcard({ ...(raw as any), english });
            added++;
          }
        }

        await get().refresh();
        return { added, updated, skipped };
      },

      updateFlashcard: async (card) => {
        await db.updateFlashcard(card);
        const flashcards = await db.getAllFlashcards();
        const counts = computeIntensiveCounts(flashcards);
        set({ flashcards: flashcards, ...counts });
      },

      removeFlashcard: async (id) => {
        await db.deleteFlashcard(id);
        await get().refresh();
      },

      removeMultipleFlashcards: async (ids) => {
        await db.deleteMultipleFlashcards(ids);
        await get().refresh();
      },

      moveFlashcard: async (id, targetCollectionId) => {
        await db.moveFlashcard(id, targetCollectionId);
        await get().refresh();
      },

      moveMultipleFlashcards: async (ids, targetCollectionId) => {
        await db.moveMultipleFlashcards(ids, targetCollectionId);
        await get().refresh();
      },

      findDuplicate: async (english, wordType) => {
        return await db.findDuplicateFlashcard(english, wordType);
      },
      findDuplicateInCollection: async (english, collectionId, wordType) => {
        return await db.findDuplicateFlashcardInCollection(english, collectionId, wordType);
      },

      startSession: (collectionId, mode = 'review') => {
        const { flashcards, sessionQueue, sessionMode, activeCollectionId, currentSessionIndex } = get();
        
        // If there's an existing session for the same mode and collection, and it's not finished, resume it.
        if (sessionQueue.length > 0 && sessionMode === mode && activeCollectionId === (collectionId ?? null)) {
          if (currentSessionIndex < sessionQueue.length) {
            return;
          }
        }

        const now = new Date();
        const dayOfWeek = now.getDay();
        const filtered = collectionId ? flashcards.filter(c => c.collection_id === collectionId) : flashcards;
        let queue: Flashcard[] = [];
        if (mode === 'all') {
          queue = [...filtered].sort(() => Math.random() - 0.5);
        } else if (mode === 'new') {
          const todayCards = filtered.filter(c => {
            const age = getAge(c.created_at);
            const target = getTargetReps(age, dayOfWeek);
            return age === 0 && target > 0;
          });
          const due = todayCards.filter(c => c.daily_reps < 3).sort(() => Math.random() - 0.5);
          const done = todayCards.filter(c => c.daily_reps >= 3).sort(() => Math.random() - 0.5);
          queue = [...due, ...done];
        } else {
          const eligible = filtered.filter(c => {
            const age = getAge(c.created_at);
            const target = getTargetReps(age, dayOfWeek);
            return (age > 0 && target > 0) || (age > 0 && isOverdue(c, now));
          });
          const due = eligible.filter(c => {
            const age = getAge(c.created_at);
            const target = getTargetReps(age, dayOfWeek);
            return c.daily_reps < target || isOverdue(c, now);
          }).sort(() => Math.random() - 0.5);
          const done = eligible.filter(c => {
            const age = getAge(c.created_at);
            const target = getTargetReps(age, dayOfWeek);
            return c.daily_reps >= target && !isOverdue(c, now);
          }).sort(() => Math.random() - 0.5);
          queue = [...due, ...done];
        }
        set({ sessionQueue: queue, currentSessionIndex: 0, sessionMode: mode, activeCollectionId: collectionId ?? null });
      },

      recordRep: async (cardId, isSuccess) => {
        const { flashcards, sessionQueue, currentSessionIndex, sessionMode } = get();
        const cardIndex = flashcards.findIndex(c => c.id === cardId);
        if (cardIndex === -1) return;

        const card = flashcards[cardIndex];

        // Calculate target reps first
        const age = getAge(card.created_at);
        const dayOfWeek = new Date().getDay();
        let targetReps = getTargetReps(age, dayOfWeek);
        if (sessionMode === 'all') targetReps = 1; // Just 1 rep for 'all' mode
        
        // Ensure minimum 1 rep if targetReps is 0 (e.g. studying a card not due today)
        if (targetReps === 0) targetReps = 1;

        // Success sets reps immediately to target (completing it for today), forgot keeps current reps
        const newDailyReps = isSuccess ? targetReps : card.daily_reps;
        const newTotalReps = card.total_reps + 1;

        // Update DB in background
        db.updateFlashcardRep(cardId, newDailyReps, newTotalReps);

        // Update memory state immediately for performance
        const updatedCard = { ...card, daily_reps: newDailyReps, total_reps: newTotalReps, last_studied_at: new Date().toISOString() };
        const nextFlashcards = [...flashcards];
        nextFlashcards[cardIndex] = updatedCard;

        const isFinished = newDailyReps >= targetReps;

        let nextSessionQueue = sessionQueue;
        if (!isSuccess || !isFinished) {
          const sessionCard = sessionQueue[currentSessionIndex];
          if (sessionCard) {
            nextSessionQueue = [...sessionQueue, updatedCard];
          }
        }

        const counts = computeIntensiveCounts(nextFlashcards);
        set({ 
          flashcards: nextFlashcards, 
          sessionQueue: nextSessionQueue,
          ...counts 
        });
      },

      nextCard: () => set(state => ({ currentSessionIndex: state.currentSessionIndex + 1 })),

      startExam: () => {
        const { flashcards } = get();
        const studiedCards = flashcards.filter(c => c.total_reps > 0);
        if (studiedCards.length === 0) return;
        const shuffled = [...studiedCards].sort(() => Math.random() - 0.5);
        set({ examQueue: shuffled, examIndex: 0, examResults: { remember: 0, forget: 0 }, isExamActive: true });
      },

      recordExamRep: (isSuccess) => {
        set(state => ({
          examIndex: state.examIndex + 1,
          examResults: {
            remember: isSuccess ? state.examResults.remember + 1 : state.examResults.remember,
            forget: !isSuccess ? state.examResults.forget + 1 : state.examResults.forget,
          }
        }));
      },

      resetExam: () => {
        set({ examQueue: [], examIndex: 0, examResults: { remember: 0, forget: 0 }, isExamActive: false });
      },

      loadApiKeys: async () => {
        const apiKeys = await db.getApiKeys();
        set({ apiKeys });
      },

      addApiKey: async (key) => {
        await db.addApiKey(key);
        await get().loadApiKeys();
      },

      removeApiKey: async (id) => {
        await db.deleteApiKey(id);
        await get().loadApiKeys();
      },

      toggleApiKey: async (id, isActive) => {
        await db.updateApiKeyStatus(id, isActive);
        await get().loadApiKeys();
      },

      exportData: async () => await db.exportAllData(),

      importData: async (collections, cards) => {
        await db.importBackupData(collections, cards);
        await get().refresh();
      },

      undoRep: async (cardId, wasSuccess) => {
        const { flashcards, sessionQueue } = get();
        const cardIndex = flashcards.findIndex(c => c.id === cardId);
        if (cardIndex === -1) return;

        const card = flashcards[cardIndex];
        const newDailyReps = wasSuccess ? Math.max(0, card.daily_reps - 1) : card.daily_reps;
        const newTotalReps = Math.max(0, card.total_reps - 1);

        // Update DB
        await db.updateFlashcardRep(cardId, newDailyReps, newTotalReps);

        // Update state
        const updatedCard = { ...card, daily_reps: newDailyReps, total_reps: newTotalReps };
        const nextFlashcards = [...flashcards];
        nextFlashcards[cardIndex] = updatedCard;

        let nextSessionQueue = [...sessionQueue];
        if (!wasSuccess) {
          // If it was a failure, we added the card to the end. Remove it.
          if (nextSessionQueue[nextSessionQueue.length - 1]?.id === cardId) {
            nextSessionQueue.pop();
          }
        }

        const counts = computeIntensiveCounts(nextFlashcards);
        set({
          flashcards: nextFlashcards,
          sessionQueue: nextSessionQueue,
          ...counts
        });
      },
    }),
    {
      name: 'linguistai-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        // We only persist small, frequently changing state
        examIndex: state.examIndex,
        examResults: state.examResults,
        isExamActive: state.isExamActive,
        currentSessionIndex: state.currentSessionIndex,
        sessionMode: state.sessionMode,
        inboxCollectionId: state.inboxCollectionId,
        isAutoPlayEnabled: state.isAutoPlayEnabled,
        // Large arrays are moved to manual persistence or excluded to prevent lag
        examQueue: state.examQueue, 
        sessionQueue: state.sessionQueue,
      }),
    }
  )
);
