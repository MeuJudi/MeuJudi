# Design

## Color Strategy

Restrained — tinted neutrals with accent used sparingly for primary actions and state indicators. 7 tenant-selectable palettes (padrao, escuro, rosa, lavanda, esmeralda, oceano, ambar).

## Palette

Default (padrao):
- Background: warm paper (#f6f3ea)
- Sidebar: dark ink (#16233a)
- Accent: brass (#8c6425)
- Foreground: near-white (#fafaf8)
- Destructive: red (#dc2626)

All palettes defined in `src/lib/themes/palettes.ts` with 47 CSS variables each, applied via inline styles on the tenant shell.

## Typography

- Sans: IBM Plex Sans (primary), Geist, system-ui fallback
- Mono: IBM Plex Mono, Geist Mono fallback
- Display: Fraunces (serif, decorative only via `.font-display`)
- Scale: fixed rem, not fluid. Tight ratio (1.125–1.2)

## Spacing & Radius

- Base radius: 0.5rem (Tailwind default)
- Consistent 4px grid
- Cards: subtle border + shadow
- Sections: 1.5–2rem gaps

## Components

### Existing (src/components/ui/)
- Button (4 variants: default, outline, ghost, destructive)
- Card (CardHeader, CardTitle, CardDescription, CardContent)
- Input (with focus ring)
- Label
- Badge (4 variants)
- PasswordInput (with visibility toggle)
- Tabs (Radix-based)

### Missing (needed for modal standardization)
- Dialog (Radix) — for all modals
- AlertDialog — for confirmations
- Select — for dropdowns in modals
- Popover — for scope menu, tooltips

## Motion

- fade-in: 0.2s
- fade-in-up: 0.25s, 8px translateY
- scale-in: 0.2s, 0.95→1
- slide-in-right: 0.25s, 12px translateX
- stagger-in: 0.3s, 50ms per child
- All with prefers-reduced-motion fallback

## Layout

- Sidebar + top bar shell (TenantShell)
- Sidebar: tenant-themed, fixed width
- Top bar: search, scope toggle, user info
- Content area: scrollable, max-width constrained
