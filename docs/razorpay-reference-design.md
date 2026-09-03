# Razorpay visual reference

## Source

- URL: https://razorpay.com/
- Captured: 2026-09-03
- Evidence: Firecrawl branding extraction, image inventory, and screenshot.
- Local screenshot: [`.firecrawl/razorpay-screenshot.png`](../.firecrawl/razorpay-screenshot.png)

## Observed system

- Light, high-trust product surface with large white areas and pale blue/lilac atmospheric fields.
- Primary cobalt `#305EFF`; dark navy `#192839`; white ground.
- TASA Orbiter Display SemiBold headings and Inter body copy. Vowgate should use an obtainable heading alternative rather than copying a proprietary font.
- Roughly 56px primary heading, 48px section heading, 14px body, four-pixel spacing base, and four-pixel control corners.
- White top navigation, compact text links, outlined secondary controls, and solid cobalt primary actions.
- Hero compositions pair direct business copy with layered product UI and geometric blue forms.
- Soft, broad blue shadows and pale atmospheric color create depth; most content surfaces remain white.

## Vowgate translation

- Preserve Vowgate's own name, mark, copy, merchant, and task flow.
- Use Razorpay's observed cobalt/navy/light-field rhythm so the submission feels native to the ecosystem.
- Keep the conformance lab denser and more operational than Razorpay's marketing homepage.
- Use Manrope for display and Inter for body as open, available alternatives.
- Never use Razorpay's logo, proprietary illustrations, or imply that Vowgate is an official Razorpay product.

## Rerun inputs

```yaml
workflow: firecrawl-website-design-clone
source_url: https://razorpay.com/
target_stack: vanilla HTML/CSS/JavaScript
output: docs/razorpay-reference-design.md + implementation
```
