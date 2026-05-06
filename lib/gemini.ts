import { Flashcard, ApiKey } from '../types';
import * as db from './db';

/**
 * Gemini AI Integration with API Key Rotation and Batch Processing.
 * Models: gemini-1.5-flash-latest
 */

const MODEL_NAME = 'gemini-flash-latest';

interface GeminiResponse {
  candidates: {
    content: {
      parts: { text: string }[];
    };
  }[];
}

/**
 * Strips markdown and extracts the JSON block from a string.
 * Includes basic repair for truncated responses.
 */
function cleanJsonResponse(text: string): string {
  if (!text) return '{}';
  const cleaned = text.replace(/```json|```/g, '').trim();
  return cleaned;
}

/**
 * Fetches active API keys with smart recovery.
 */
async function getNextApiKey(): Promise<ApiKey | { api_key: string; id: -1 }> {
  const keys = await db.getApiKeys();
  const activeKeys = keys.filter(k => k.is_active);

  if (activeKeys.length === 0) {
    const envKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    if (!envKey) throw new Error('No Gemini API key available. Please add one in Settings.');
    return { api_key: envKey, id: -1 };
  }

  const ONE_HOUR = 60 * 60 * 1000;
  const now = Date.now();

  const sortedKeys = [...activeKeys].sort((a, b) => {
    const aLastFail = a.last_failed_at ? new Date(a.last_failed_at).getTime() : 0;
    const bLastFail = b.last_failed_at ? new Date(b.last_failed_at).getTime() : 0;
    const aIsRecentFail = (now - aLastFail) < ONE_HOUR;
    const bIsRecentFail = (now - bLastFail) < ONE_HOUR;

    if (!aIsRecentFail && bIsRecentFail) return -1;
    if (aIsRecentFail && !bIsRecentFail) return 1;
    return a.fail_count - b.fail_count;
  });

  return sortedKeys[0];
}

/**
 * Executes a prompt with automatic key rotation and retry logic.
 */
async function generateContent(
  prompt: string,
  imageData?: { mimeType: string, base64: string },
  attempt = 0
): Promise<string> {
  const keyObj = await getNextApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${keyObj.api_key}`;

  const parts: any[] = [{ text: prompt }];
  if (imageData) {
    parts.push({
      inline_data: {
        mime_type: imageData.mimeType,
        data: imageData.base64
      }
    });
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] }),
    });

    if (!response.ok) {
      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        if (keyObj.id !== -1) await db.recordApiKeyFailure(keyObj.id);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return await generateContent(prompt, imageData, attempt + 1);
      }
      throw new Error(`Gemini API Error: ${response.status}`);
    }

    const data: GeminiResponse = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('AI returned an empty response.');
    return text;
  } catch (error) {
    if (attempt < 2) return await generateContent(prompt, imageData, attempt + 1);
    throw error;
  }
}

const WORD_TYPE_VALUES = 'noun | verb | adjective | adverb | phrase | idiom | conjunction | preposition | pronoun | other';

// Detects if input is a single word/phrase or a longer paragraph
function isSingleWordOrPhrase(text: string): boolean {
  const trimmed = text.trim();
  // If there are no sentence-ending punctuations, treat as a single phrase regardless of length
  return !/[.!?]/.test(trimmed) || trimmed.split(/\s+/).length <= 8;
}

const COLLECTION_SUGGESTION_RULES = `
Rules for "suggested_collection":
1. Categorize the word into a specific thematic category (e.g., "Technology", "Medical", "Emotions").
2. For very common or general words (like "have", "go", "see"), use systematic categories such as "Core Verbs", "Basic Vocabulary", or "Common Phrases".
3. Check "Existing collections" below. If the word fits one of them LOGICALLY (e.g., "flight" fits "Travel"), use it. 
4. CRITICAL: If an existing collection name is non-descriptive (like "T", "A", "New") or doesn't fit, IGNORE it and suggest a NEW specific thematic name.
5. Avoid "Inbox" or "General". Keep names concise (1-3 words).`;

const SINGLE_WORD_PROMPT = (input: string, existingCollections?: string[]) => `
You are a vocabulary flashcard creator.
The user typed: "${input}"
 
Rules:
1. ONLY analyze this exact word/phrase. Do NOT add synonyms or related words.
2. If there is a spelling or grammar mistake, fix it and use the corrected form as "english".
3. Provide: Vietnamese translation, IPA phonetics, brief grammar note, and one example sentence.
4. Word type: ${WORD_TYPE_VALUES}.
5. ${COLLECTION_SUGGESTION_RULES}
 
${existingCollections?.length ? `Existing collections: ${existingCollections.map(d => `"${d}"`).join(', ')}.` : ''}
 
Output ONLY this exact JSON (one card only):
{
  "flashcards": [
    {
      "english": "word",
      "phonetic": "IPA",
      "vietnamese": "translation",
      "grammar_note": "note",
      "example_en": "example",
      "example_vi": "dịch",
      "word_type": "noun",
      "suggested_collection": "Specific Topic"
    }
  ]
}`;

const LIST_PROMPT = (items: string[], existingCollections?: string[]) => `
You are a vocabulary flashcard creator.
Task: Create exactly one flashcard for EACH of the following items provided in the list:
List: ${items.map((item, i) => `${i+1}. "${item.trim()}"`).join('\n')}
 
Rules:
1. DO NOT split these items further. Even if an item is a long phrase or sentence, treat it as ONE single card.
2. For each: Vietnamese translation, IPA phonetics, grammar note, and example.
3. Word type: ${WORD_TYPE_VALUES}.
4. ${COLLECTION_SUGGESTION_RULES}
 
${existingCollections?.length ? `Existing collections: ${existingCollections.map(d => `"${d}"`).join(', ')}.` : ''}
 
Output ONLY valid JSON:
{
  "flashcards": [
    {
      "english": "the exact phrase from the list",
      "phonetic": "IPA",
      "vietnamese": "translation",
      "grammar_note": "note",
      "example_en": "example",
      "example_vi": "dịch",
      "word_type": "noun",
      "suggested_collection": "Specific Topic"
    }
  ]
} (Array must contain exactly ${items.length} items)`;

const PARAGRAPH_PROMPT = (input: string, existingCollections?: string[]) => `
You are a vocabulary flashcard creator.
Analyze this text and extract the most important English words/phrases: "${input}"
 
Rules:
1. Extract up to 10 key vocabulary items worth learning.
2. For each: Vietnamese translation, IPA phonetics, grammar note, and example.
3. Word type: ${WORD_TYPE_VALUES}.
4. ${COLLECTION_SUGGESTION_RULES}
 
${existingCollections?.length ? `Existing collections: ${existingCollections.map(d => `"${d}"`).join(', ')}.` : ''}
 
Output ONLY valid JSON:
{
  "flashcards": [
    {
      "english": "word",
      "phonetic": "IPA",
      "vietnamese": "translation",
      "grammar_note": "note",
      "example_en": "example",
      "example_vi": "dịch",
      "word_type": "noun",
      "suggested_collection": "Specific Topic"
    }
  ]
}`;

export async function analyzeInput(input: string, context?: string, existingCollections?: string[]) {
  const trimmedInput = input.trim();
  let prompt = '';
 
  if (trimmedInput.includes(';')) {
    // Semicolon-separated list
    const items = trimmedInput.split(';').filter(i => i.trim().length > 0);
    prompt = LIST_PROMPT(items, existingCollections);
  } else {
    prompt = isSingleWordOrPhrase(trimmedInput)
      ? SINGLE_WORD_PROMPT(trimmedInput, existingCollections)
      : PARAGRAPH_PROMPT(trimmedInput, existingCollections);
  }

  const raw = await generateContent(prompt);
  try {
    return JSON.parse(cleanJsonResponse(raw));
  } catch (e) {
    throw new Error("AI output was invalid. Please try a shorter text.");
  }
}

export async function extractFromImage(base64: string, mimeType: string, existingCollections?: string[]) {
  const prompt = `This is a photo of a vocabulary list (printed table or handwriting). 
Task:
1. Identify all English words/phrases in the image.
2. For each word: provide Vietnamese translation, fix spelling, find IPA phonetics, provide grammar notes, and create usage examples.
3. Determine word_type: ${WORD_TYPE_VALUES}.
4. ${COLLECTION_SUGGESTION_RULES}

${existingCollections?.length ? `Existing collections: ${existingCollections.map(d => `"${d}"`).join(', ')}.` : ''}
 
Output as a JSON object (NO extra explanation):
{
  "flashcards": [
    {
      "english": "English word",
      "phonetic": "IPA phonetics",
      "vietnamese": "Vietnamese translation",
      "grammar_note": "brief note",
      "example_en": "English example",
      "example_vi": "Vietnamese translation of example",
      "word_type": "noun",
      "suggested_collection": "Specific Topic"
    }
  ]
}`;

  const raw = await generateContent(prompt, { mimeType, base64 });
  try {
    return JSON.parse(cleanJsonResponse(raw));
  } catch (e) {
    throw new Error("Failed to scan image. Please take a clearer photo.");
  }
}

export async function reanalyzeCard(english: string, context?: string): Promise<Partial<Flashcard>> {
  const prompt = `Analyze "${english}". ${context ? `Context: "${context}".` : ''}
    Output ONLY JSON: {"flashcards": [{"english": "...", "phonetic": "...", "vietnamese": "...", "grammar_note": "...", "example_en": "...", "example_vi": "...", "word_type": "..."}]}`;
  const raw = await generateContent(prompt);
  const res = JSON.parse(cleanJsonResponse(raw));
  const card = res.flashcards[0] ?? {};
  if (typeof card.english === 'string' && card.english.trim()) {
    card.english = card.english.trim().charAt(0).toUpperCase() + card.english.trim().slice(1);
  }
  return card;
}

/**
 * Validates and enriches import data (Smart Batch Processing)
 */
export async function validateAndEnrichImportData(
  cards: any[],
  onProgress?: (current: number, total: number) => void
): Promise<{ enriched: any[]; issues: string[] }> {
  const issues: string[] = [];
  const enriched: any[] = [];

  const complete = cards.filter(c => c.english && c.vietnamese && c.phonetic);
  const needsEnrichment = cards.filter(c => c.english && (!c.vietnamese || !c.phonetic));

  enriched.push(...complete);
  const total = needsEnrichment.length;
  const BATCH_SIZE = 10;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = needsEnrichment.slice(i, i + BATCH_SIZE);
    onProgress?.(i, total);

    try {
      const batchText = batch.map(c => c.english).join(', ');
      const resultObj = await analyzeInput(batchText);

      if (resultObj && resultObj.flashcards) {
        batch.forEach(card => {
          const ai = resultObj.flashcards.find((c: any) => c.english.toLowerCase() === card.english.toLowerCase());
          if (ai) {
            enriched.push({ ...card, ...ai });
          } else {
            enriched.push(card);
            issues.push(`Skipped "${card.english}"`);
          }
        });
      }
    } catch (e) {
      issues.push(`Failed batch at index ${i}`);
      enriched.push(...batch);
    }
  }
  onProgress?.(total, total);
  return { enriched, issues };
}

export async function tutorChat(message: string, context?: string): Promise<string> {
  const prompt = `You are an English tutor for Vietnamese. Use English. keep it simple. ${context ? `Context: ${context}` : ''} User: ${message}`;
  return await generateContent(prompt);
}
