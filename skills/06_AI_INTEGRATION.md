# AI Integration — Gemini Guidelines

This document defines how to integrate and use the Google Gemini AI API in LinguistAI.
All AI logic must be encapsulated in `/lib/gemini.ts`.

---

## 1. Model & Quota

- **Model:** `gemini-1.5-flash` (fastest, best for real-time responses)
- **Free tier:** 15 requests per minute, 1 million tokens per day
- **API Key:** Stored in `.env` as `EXPO_PUBLIC_GEMINI_API_KEY`. Never hardcode it.

```ts
// lib/gemini.ts
const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;
```

---

## 2. Core AI Features

### 2.1 Card Auto-Generation
When the user types a word or phrase, Gemini generates a complete flashcard:

**Prompt template:**
```
Analyze the English word or phrase: "{input}"

Return a JSON object with these exact fields:
- english: the word/phrase as given
- vietnamese: Vietnamese translation
- phonetic: IPA pronunciation (e.g., /wɜːrd/)
- word_type: one of [noun, verb, adjective, adverb, phrase, idiom]
- grammar_note: a brief grammar tip in English (1 sentence max)
- example_en: a natural example sentence in English
- example_vi: the Vietnamese translation of that example sentence

Return ONLY the JSON object. No explanation.
```

**Expected response shape:**
```ts
interface GeneratedCard {
  english: string;
  vietnamese: string;
  phonetic: string;
  word_type: string;
  grammar_note: string;
  example_en: string;
  example_vi: string;
}
```

---

### 2.2 AI Tutor Chat
The AI Tutor answers questions about English grammar, vocabulary usage, and examples.

**System prompt:**
```
You are an English language tutor helping a Vietnamese learner improve their vocabulary and grammar.
Always respond in English. Keep explanations simple and practical.
When giving examples, also provide their Vietnamese translations.
```

---

## 3. API Call Pattern

All Gemini calls must follow this structure:

```ts
async function callGemini(prompt: string): Promise<string> {
  const response = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,       // Low for factual card generation
        maxOutputTokens: 512,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}
```

---

## 4. JSON Parsing Safety

Gemini may wrap JSON in markdown code fences. Always strip them:

```ts
function extractJSON(raw: string): string {
  // Remove ```json ... ``` or ``` ... ``` wrappers if present
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

async function generateCard(word: string): Promise<GeneratedCard> {
  const raw = await callGemini(buildCardPrompt(word));
  const cleaned = extractJSON(raw);
  return JSON.parse(cleaned) as GeneratedCard;
}
```

---

## 5. Error Handling & Fallback

- Wrap all AI calls in `try/catch`.
- On failure, show the user a friendly message: `"AI is unavailable. You can still add the card manually."`
- Never block card creation because AI failed — allow manual entry as fallback.
- Implement a loading indicator while waiting for the AI response.

```ts
try {
  const card = await generateCard(word);
  setFormData(card);
} catch (error) {
  console.error('[Gemini] Card generation failed:', error);
  showToast('AI unavailable. Please fill in the details manually.');
}
```

---

## 6. Rate Limiting

- Do not call Gemini on every keystroke. Trigger generation only on:
  1. User taps the "Generate" button, OR
  2. User finishes typing and presses the submit/enter key.
- Add a debounce of at least `800ms` if using auto-trigger mode.
- Show a disabled/loading state on the button while a request is in-flight.

---

## 7. Privacy

- Never send sensitive personal information to the Gemini API.
- Only send the word/phrase the user is asking about, not their study history or personal data.
