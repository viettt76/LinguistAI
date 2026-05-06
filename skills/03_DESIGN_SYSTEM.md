# Design System

LinguistAI uses a clean, modern, and premium interface aesthetic.
All UI components must follow this system for visual consistency.

---

## 1. Color Palette

| Token | Hex | Usage |
|---|---|---|
| `primary` | `#0052CC` | Brand color — primary buttons, progress bars, active states |
| `primary-light` | `#F0F4FF` | Card backgrounds, badge fills |
| `danger` | `#CC0000` | Delete actions, "Overdue" warnings |
| `danger-light` | `#FFF0F0` | Overdue card background tint |
| `warning` | `#E87722` | "Due today" highlights, soft alerts |
| `success` | `#00875A` | Mastered state, completion indicators |
| `success-light` | `#F0FFF8` | Mastered card background tint |
| `background` | `#FAFAFA` | App-wide background |
| `surface` | `#FFFFFF` | Card and modal surfaces |
| `text-primary` | `#1A1A1A` | Headings and key content |
| `text-secondary` | `#666666` | Subtitles, captions, hints |
| `text-muted` | `#AAAAAA` | Placeholder and disabled text |
| `border` | `#EBEBEB` | Subtle dividers and outlines |

---

## 2. Typography

| Role | Font | Weight | Size |
|---|---|---|---|
| Screen Title | Outfit | Bold (700) | 28–32px |
| Section Heading | Outfit | SemiBold (600) | 20–24px |
| Card Word | Outfit | Bold (700) | 22–28px |
| Body Text | Inter | Regular (400) | 14–16px |
| Label / Badge | Inter | Medium (500) | 12–13px |
| Caption / Note | Inter | Regular (400) | 11–12px |

**Load fonts via `expo-font` in the root layout.**

---

## 3. Spacing Scale

Use multiples of 4px for all spacing and sizing:
`4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64`

---

## 4. Border Radius

| Component | Radius |
|---|---|
| Full-screen cards / modals | `32px` |
| Regular cards / panels | `16px` |
| Buttons | `12px` |
| Badges / tags | `8px` |
| Input fields | `12px` |

---

## 5. Shadows

Shadows should be very soft to give depth without visual noise:
```ts
const shadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 3, // Android
};
```

---

## 6. Progress Bar

- Height: `6px`
- Border radius: fully rounded (`3px`)
- Color: `primary` (`#0052CC`)
- Background track: `border` (`#EBEBEB`)
- Animate with `react-native-reanimated` using `withTiming`.

---

## 7. Icons

- Library: `lucide-react-native`
- Navigation icons: `24px`
- Action/inline icons: `18px`
- Overdue warning icon: use `AlertCircle` in `danger` color.

---

## 8. Status Badges

| Status | Background | Text Color | Label |
|---|---|---|---|
| Due Today | `#FFF3E0` | `#E87722` | "Due Today" |
| New | `#F0F4FF` | `#0052CC` | "New" |
| Overdue | `#FFF0F0` | `#CC0000` | "Overdue" |
| Mastered | `#F0FFF8` | `#00875A` | "Graduated" |

---

## 9. Micro-animations

- **Card flip:** Use `react-native-reanimated` rotateY interpolation.
- **Progress bar fill:** Use `withTiming` with `duration: 400ms`.
- **Session complete celebration:** Use a scale + opacity pulse animation.
- **Button press:** Scale down to `0.96` on press using `withSpring`.
