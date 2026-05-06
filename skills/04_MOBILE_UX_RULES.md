# Mobile UX Rules

This document defines mandatory UX behaviors for mobile (Android & iOS) in LinguistAI.
These rules ensure the app feels native, polished, and accessible on physical devices.

---

## 1. Android Back Button — Popups and Modals

**Rule: Every popup, modal, and bottom sheet MUST close when the user presses the Android physical back button.**

This is enforced by providing `onRequestClose` to every `<Modal>` component.
Never leave `onRequestClose` empty or undefined.

```tsx
// CORRECT — modal closes on Android back button
<Modal
  visible={isVisible}
  transparent
  animationType="slide"
  onRequestClose={() => setIsVisible(false)} // Required for Android back button
>
  {/* modal content */}
</Modal>
```

```tsx
// WRONG — back button does nothing, user is stuck
<Modal visible={isVisible} transparent>
  {/* no onRequestClose */}
</Modal>
```

**This rule applies to:**
- Standard React Native `<Modal>`
- Custom bottom sheets
- Confirmation dialogs
- Action sheets
- Full-screen overlays

---

## 2. Safe Area Handling

Always use `SafeAreaView` (from `react-native-safe-area-context`) as the root container
for every screen to avoid content being obscured by notches, punch holes, or system bars.

```tsx
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MyScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      {/* screen content */}
    </SafeAreaView>
  );
}
```

---

## 3. Keyboard Avoidance

Use `KeyboardAvoidingView` on all screens that contain text inputs (e.g., add card, search):

```tsx
import { KeyboardAvoidingView, Platform } from 'react-native';

<KeyboardAvoidingView
  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  style={{ flex: 1 }}
>
  {/* inputs */}
</KeyboardAvoidingView>
```

---

## 4. Haptic Feedback

Use haptic feedback for meaningful user interactions:

| Action | Haptic Type |
|---|---|
| Rating a card (Good / Hard) | `ImpactFeedbackStyle.Medium` |
| Completing a study session | `NotificationFeedbackType.Success` |
| Deleting a card or collection | `NotificationFeedbackType.Warning` |
| Marking a card as skipped | `ImpactFeedbackStyle.Light` |

```ts
import * as Haptics from 'expo-haptics';

// Example: on card rating
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
```

---

## 5. Touch Target Size

All interactive elements (buttons, icons, list items) must have a minimum touch target of **44x44px**.
Use `hitSlop` on small icons if needed:

```tsx
<TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
  <Icon size={18} />
</TouchableOpacity>
```

---

## 6. Loading States

Never show a blank screen while data is loading.
Use a skeleton loader or spinner for:
- Collection list loading
- Session initialization (calculating due cards)
- AI response loading

---

## 7. Empty States

Every list view must handle the empty case gracefully with:
- An illustrative icon
- A short, friendly message
- A call-to-action button (e.g., "Add your first card")

---

## 8. Scroll Behavior

- Use `FlatList` for all scrollable lists. Never use `ScrollView` for long or dynamic lists.
- Add `keyboardShouldPersistTaps="handled"` on scrollable containers that contain inputs.
- Always provide `keyExtractor` on `FlatList`.

---

## 9. Orientation

The app is locked to **portrait mode** only.
Set this in `app.json`:
```json
{
  "expo": {
    "orientation": "portrait"
  }
}
```

---

## 10. Navigation Transitions

- Use Expo Router's default stack transitions.
- Modals should use `presentation: 'modal'` in the route config for a native bottom-sheet feel.
- Avoid disabling animations — they make the app feel native.
