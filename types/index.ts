/**
 * Core domain types for LinguistAI.
 */

export type WordType = 'noun' | 'verb' | 'adjective' | 'adverb' | 'phrase' | 'idiom';

export interface Collection {
  id: number;
  name: string;
  icon: string; // Emoji or Lucide icon name
  created_at: string; // ISO 8601
}

export interface Flashcard {
  id: number;
  collection_id: number;
  english: string;
  vietnamese: string;
  phonetic: string;
  word_type: WordType;
  grammar_note: string;
  example_en: string;
  example_vi: string;
  daily_reps: number;
  last_studied_at: string | null; // ISO 8601
  total_reps: number;
  created_at: string; // ISO 8601
}

export interface ApiKey {
  id: number;
  api_key: string;
  is_active: boolean; // 1 or 0 in DB
  fail_count: number;
  last_failed_at: string | null;
  created_at: string;
}

export interface AppSettings {
  key: string;
  value: string;
}

export interface StudySession {
  queue: Flashcard[];
  currentIndex: number;
  startTime: number;
}
