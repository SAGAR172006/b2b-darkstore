# Design System — B2B Darkstore: Cyan Tech
**Source:** Google Stitch UI Prototypes  
**Mode:** Light only (no dark mode in MVP)

---

## 1. Visual Narrative

**Cyan Tech** is a luminous, high-energy light-mode dashboard environment. It maintains a sharp, technical edge through angular geometry while using a vibrant cyan-centric palette to communicate precision, innovation, and clarity. The interface feels like a high-end digital dashboard under bright clinical lighting — surgical, fast, zero-friction.

**Personality keywords:** Precision · Autonomy · Industrial Clarity · Zero Ambiguity

---

## 2. Color Palette

All colors are applied via Tailwind CSS tokens. The values below are the source-of-truth hex codes.

### Core Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `primary` | `#00647d` | Nav links, secondary text accents |
| `primary-fixed` / `primary-container` | `#02cbfc` | **The Brand Cyan** — borders, CTAs, active states, bin outlines |
| `on-primary-container` | `#003e4f` | Text on cyan backgrounds |
| `secondary` | `#006287` | Supporting interactive elements |
| `secondary-container` | `#9cd9ff` | Hover states, secondary chips |
| `tertiary` | `#3754b7` | Badges, notification indicators, depth accents |
| `tertiary-container` | `#99acff` | Tertiary fills |

### Surface / Background System

| Token | Hex | Usage |
|-------|-----|-------|
| `background` | `#eff8ff` | Page background |
| `surface` | `#eff8ff` | Default surface |
| `surface-container-lowest` | `#ffffff` | Cards, modals, elevated panels |
| `surface-container-low` | `#e3f3ff` | Secondary panels |
| `surface-container` | `#d1ecff` | Mid-tone surfaces |
| `surface-container-high` | `#c4e7ff` | Dividers, subtle backgrounds |
| `surface-container-highest` | `#b7e3ff` | Highest contrast surfaces, grid cells |
| `surface-dim` | `#a3dcff` | Muted fills |

### Text

| Token | Hex | Usage |
|-------|-----|-------|
| `on-background` / `on-surface` | `#003347` | Primary body text |
| `on-surface-variant` | `#356078` | Secondary text, labels |
| `outline` | `#527c95` | Muted labels, metadata text |
| `outline-variant` | `#88b3cd` | Borders, dividers |

### Semantic

| Token | Hex | Usage |
|-------|-----|-------|
| `error` | `#b31b25` | "Item Missing" button, ghost alert borders |
| `error-container` | `#fb5151` | Error background fills |
| `on-error` | `#ffefee` | Text on error backgrounds |

---

## 3. Typography

### Font Families

| Role | Font | Weights Used |
|------|------|-------------|
| Headlines & UI Labels | **Space Grotesk** | 400, 500, 600, 700, 900 |
| Body Copy & Metadata | **Inter** | 300, 400, 500, 600, 700 |
| Monospace data (SKU IDs, timestamps) | `font-mono` (system) | 400, 700 |

**Load via Google Fonts:**
```html
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
```

### Type Scale

| Element | Font | Size | Weight | Transform |
|---------|------|------|--------|-----------|
| Brand name "B2B DARKSTORE" | Space Grotesk | 20px | 900 (Black) | UPPERCASE, Italic |
| Page title / bin label | Space Grotesk | 72px | 900 | — |
| Section headers | Space Grotesk | 14px | 700 | UPPERCASE, tracking-widest |
| Nav labels | Space Grotesk | 10px | 700 | UPPERCASE, tracking-widest |
| Body text | Inter | 16px | 400 | — |
| Metadata / captions | Inter | 12–13px | 400–500 | — |
| Operator ID | Inter | 14px | 700 | — |
| SKU / bin codes | font-mono | 12–14px | 700 | — |
| Log timestamps | font-mono | 10px | 400 | — |

---

## 4. Geometry & Spatial Rhythm

### Border Radius
**ALL elements use 0px border-radius** (90-degree hard corners).  
The only exception: `border-radius: 9999px` for pill badges/chips.

```js
// tailwind.config.js
borderRadius: {
  DEFAULT: '0px',
  lg: '0px', 
  xl: '0px',
  full: '9999px'  // only for pills
}
```

This is the single most important visual rule of the system. Never use `rounded-md`, `rounded-lg`, etc.

### Spacing

Normal density. Not cramped. Use the standard Tailwind spacing scale:
- Component internal padding: 16–24px (p-4 to p-6)
- Gap between sections: 16px (gap-4)
- Gap between cards: 16px
- Button padding: py-3 px-4 minimum; large tap targets py-4 or h-14

### Borders
- Primary borders: `border-2 border-primary-fixed` (2px cyan — active, task card, buttons)
- Secondary borders: `border-2 border-outline-variant` (2px muted — map containers, dividers)
- Subtle borders: `border border-outline-variant/50` (1px faint)
- Error state: `border-2 border-error`

---

## 5. Component Specifications

### Task Card (Picker App)
```
┌──────────────────────────────────────────┐ ← border-2 border-primary-fixed
│                                ACTIVE TASK│ ← bg-primary-fixed, top-right badge
│ LOCATION BIN                              │ ← 10px Space Grotesk uppercase outline
│ A-402-B                                   │ ← 72px Space Grotesk 900 primary-container
│ 📦 Industrial Valve Gasket (X-4)          │ ← 18px Inter, on-surface-variant
│                                           │
│         [192×192 product image]           │ ← grayscale, border-4 surface-container-highest
│                                           │
├───────────────────┬───────────────────────┤ ← border-t-2 surface-container-high
│ SKU ID            │ TARGET QTY            │
│ 99823-TECH-01     │ 04 UNITS              │ ← 24px Space Grotesk 900 primary
└──────────────────────────────────────────┘
```

### Action Buttons (Picker App)
```
┌──────────────────┐  ┌──────────────────┐
│  ✓               │  │  ⚠               │
│  (filled icon)   │  │  (outline icon)  │
│                  │  │                  │
│   ITEM FOUND     │  │  ITEM MISSING    │
└──────────────────┘  └──────────────────┘
  bg-primary-container   bg-white
  border-2               border-2 border-error
  border-on-primary-cont text-error
  h-48, font-black 20px  h-48, font-black 20px
```

### Manager Grid Cell States
```
Normal bin:          Ghost bin (alert):      Picker active:
┌────────────┐       ┌────────────┐          ┌────────────┐
│            │       │ ⚠          │          │    ●       │
│  A-001     │       │  A-023     │          │  (cyan     │
│            │       │  (pulsing  │          │   pulse)   │
└────────────┘       │   red)     │          └────────────┘
border-primary-fixed/30  └────────────┘   border-primary-fixed
bg-surface-container  border-error          bg-surface-container
                      bg-error/10           picker dot: bg-primary-fixed
                      animate-pulse-red
```

### Agent Reasoning Log Entries
```
● 14:02:11  [ROUTING_OPTIMIZER] Recalculating Picker P-04 path...
↑ cyan dot  ↑ monospace   ↑ Space Grotesk label  ↑ Inter body

▲ 14:01:55  [INV_AUDIT_BOT] Bin B1-42 discrepancy detected...
↑ amber     

■ 14:01:32  [SAFETY_PROTOCOL] Congestion alert Zone C...
↑ red border-left
```

### Bottom Navigation Bar (Picker App)
```
├──────────────────────────────────────────┤ ← border-t-2 slate-200
│  📦        🛒        🚛        ⚙         │
│ INVENTORY  ORDERS   ROUTES   ADMIN       │ ← 10px Space Grotesk uppercase
│ (cyan,     (gray)   (gray)   (gray)      │
│  border-t-2 cyan)                        │
└──────────────────────────────────────────┘ h-16, fixed bottom
```

---

## 6. Animation Specifications

### pulse-red (Ghost Bin Alert)
```css
@keyframes pulse-red {
  0%, 100% { box-shadow: 0 0 0 0 rgba(179, 27, 37, 0.5); }
  50%       { box-shadow: 0 0 0 8px rgba(179, 27, 37, 0); }
}
/* Duration: 1.4s, easing: ease-in-out, iteration: infinite */
```

### Picker Position Dot
- Tailwind `animate-pulse` on the cyan circle overlay
- The dot should pulse at 1s interval to indicate live position

### Connection Status
- "LIVE" indicator: `animate-pulse` on the green dot
- Log entries: fade-in via `transition-opacity` on mount

---

## 7. Icons

All icons from **Lucide React** (preferred) or **Material Symbols Outlined** (Stitch prototype used Material).

| Use case | Lucide Icon | Material Symbol |
|----------|-------------|-----------------|
| App brand | `LayoutGrid` | `grid_view` |
| Person/Picker | `User` | `person` |
| Bin/Inventory | `Package` | `inventory_2` |
| Item Found / Check | `CheckCircle2` | `check_circle` |
| Item Missing / Alert | `AlertTriangle` | `report_problem` |
| Snake Path | `Route` | `route` |
| Realtime / Live | `Activity` | — |
| Ghost/Warn | `Zap` | — |
| Critical Alert | `AlertTriangle` | — |
| Shipping | `Truck` | `local_shipping` |
| Settings | `Settings` | `settings` |
| Cart/Orders | `ShoppingCart` | `shopping_cart` |

**Use Lucide for all new code.** Material Symbols only referenced for matching the Stitch prototype HTML exactly.

---

## 8. Responsive Breakpoints

| Screen | Context | Behavior |
|--------|---------|----------|
| < 480px | Picker App | Single column, max-w-[480px] centered |
| 480–768px | Picker App | Same, slightly more breathing room |
| 768px+ | Manager Dashboard | 3-column layout (sidebar + grid + log) |
| 1280px+ | Manager Dashboard | Optimal viewport |

The Manager Dashboard is **not designed for mobile**. It requires a minimum 768px width. Display a warning if viewport is < 768px (post-MVP).
