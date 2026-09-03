---
name: Vowgate
description: The mandate firewall for agentic commerce.
colors:
  trust-cobalt: "#305eff"
  cobalt-deep: "#1738c6"
  boundary-navy: "#192839"
  evidence-ink: "#182538"
  evidence-muted: "#526176"
  field-blue: "#edf2ff"
  canvas: "#f6f8fd"
  surface: "#ffffff"
  rule: "#d9e1ee"
  verified: "#13865d"
  verified-soft: "#e7f7ef"
  refused: "#b82f49"
  refused-soft: "#fff0f2"
typography:
  display:
    fontFamily: "Manrope, sans-serif"
    fontSize: "clamp(3.35rem, 5.4vw, 5.4rem)"
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "-0.04em"
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "0.08em"
rounded:
  verdict: "3px"
  control: "4px"
  compact: "8px"
  surface: "12px"
  console: "14px"
spacing:
  compact: "8px"
  control: "16px"
  section: "42px"
components:
  button-primary:
    backgroundColor: "{colors.trust-cobalt}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    height: "56px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.evidence-ink}"
    rounded: "{rounded.console}"
---

# Design System: Vowgate

## Overview

**Creative North Star: "The Assurance Layer"**

Vowgate looks like calm financial infrastructure with every policy boundary visible. Its open cobalt gate and dark verification tick express the core mechanism: authority is bounded, then proven. The product borrows Razorpay's cobalt confidence, navy depth, bright atmospheric field, and compact financial-product clarity without copying its identity or implying affiliation.

**Key Characteristics:**
- Large, direct product theses over pale atmospheric fields.
- One shared evidence console rather than floating card collections.
- Written verdicts paired with strict semantic color.
- An original open-gate check mark used at compact scale.

## Colors

A restrained cobalt-and-navy system keeps evidence calm while making consequential actions unmistakable.

### Primary
- **Trust Cobalt:** Brand signal, active navigation, primary commands, and selected evidence.
- **Cobalt Deep:** Hovered commands and high-contrast focus treatment.

### Secondary
- **Verified:** Signed, valid, and ready states; always paired with written status.
- **Refused:** Blocked and unsafe states; always paired with a refusal reason.

### Neutral
- **Boundary Navy:** Primary display type and deterministic policy authority.
- **Evidence Ink / Muted:** Body copy, metadata, and supporting evidence.
- **Canvas / Surface / Rule:** Page field, inspectable surfaces, and shared structural dividers.

**The Cobalt Means Consequential Rule.** Blue marks brand, active command, selection, or progress—not arbitrary decoration.

## Typography

**Display Font:** Manrope (sans-serif fallback)  
**Body Font:** Inter (sans-serif fallback)  
**Label Font:** Inter

**Character:** Manrope gives the product a confident, open financial voice; Inter carries dense evidence without competing with the verdict.

### Hierarchy
- **Display** (700, fluid 3.35–5.4rem, 0.98): Hero and section theses.
- **Title** (700, 12–26px): Product mark, panel names, metrics, and consequential states.
- **Body** (400–600, 11–16px, 1.55): Intent, explanations, catalog data, and trace detail.
- **Label** (700, 8–10px, tracked uppercase): Machine state, measurement, and metadata.

**The Two-Voice Rule.** Manrope states the promise; Inter proves it.

## Layout

Desktop uses a 72px navigation bar, a 48px status strip, a two-column hero, and a three-column shared console. Below 1180px the recorder spans the console; below 760px modules stack in purchase-decision order and navigation labels collapse to accessible icons. Tables retain their evidence width and scroll rather than compressing into illegibility. Spacing follows an 8/16px control rhythm with 42px section gutters and generous separation between major regions.

## Elevation & Depth

The system is flat by default. Pale tonal fields and one-pixel rules establish structure; soft, downward shadows are reserved for the hero action surface, complete evidence console, and catalog table.

### Shadow Vocabulary
- **Console Ambient** (`0 28px 70px rgba(25, 40, 57, .12)`): Separates the complete decision surface from the page.
- **Command Lift** (`0 10px 28px rgba(48, 94, 255, .24)`): Marks the pressure-suite action as consequential.

**The One-Plane Rule.** Adjacent mandate, scenario, and trace evidence shares one frame; never nest elevated cards inside it.

## Shapes

Controls use precise 3–4px corners, while major surfaces use restrained 8–14px radii. Circular forms are reserved for trace nodes, presence lamps, and numbered transaction stages. The logo's open ring is the only large circular brand silhouette.

## Components

### Buttons
- **Primary:** Full-width cobalt control, white text, 4px corners, and a directional SVG arrow.
- **Hover / Focus:** Deep cobalt hover with slight vertical lift; visible external deep-cobalt focus ring.
- **Secondary:** White field with a cobalt rule for reversible interpretation.

### Chips
- **Style:** Compact uppercase copy, 3px corners, tinted background, and semantic border.
- **State:** Green `PASS`, red `BLOCKED`, or neutral `READY`; color never appears without the word.

### Cards / Containers
- **Corner Style:** 12–14px only for page-level surfaces.
- **Background:** White over atmospheric canvas.
- **Shadow Strategy:** One ambient shadow for the complete surface, none for internal modules.
- **Border:** One-pixel blue-gray structural rule.

### Inputs / Fields
- **Style:** Pale paper field, one-pixel blue-gray stroke, 4px corners, and brand-colored caret.
- **Focus:** External cobalt ring with preserved border contrast.
- **Error / Disabled:** Written recovery state and neutral disabled surface.

### Navigation
- White fixed product rail with the Vowgate mark, authored line icons, and a cobalt active underline. Mobile hides redundant text labels while retaining accessible names.

### Commerce Flight Recorder
- A single vertical evidence line joins written `VERIFIED`, `READY`, and `BLOCKED` steps. Nodes animate once in sequence; reduced-motion users receive immediate state.

## Do's and Don'ts

### Do:
- **Do** expose refusal reasons in the same viewport as the tested action.
- **Do** preserve tabular numerals, written state, and keyboard focus.
- **Do** keep the original Vowgate mark distinct from Razorpay's identity.
- **Do** label synthetic merchant data and evaluation outcomes.

### Don't:
- **Don't** turn the console into rounded card soup.
- **Don't** use Razorpay's logo, proprietary illustrations, or affiliation claims.
- **Don't** use green or red without a written verdict.
- **Don't** hide exceptions behind aggregate scores.
