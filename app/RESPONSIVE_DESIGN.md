# Responsive design update

The frontend now includes a responsive layout pass for:
- Phones (320px and wider)
- Tablet portrait and landscape
- Small laptops and standard desktop screens
- Wide desktop displays

The update adjusts the header/navigation, login split layout, dashboard cards, filters, forms, room cards, action cards, and footer at responsive breakpoints. Navigation becomes horizontally scrollable on compact screens instead of forcing items off-screen. Inputs use mobile-friendly sizing to avoid unwanted browser zoom on iOS.

## Verify locally
From `frontend/` run:

```bash
npm run build
npm run dev
```

In Chrome DevTools, test Responsive Design Mode at 360px, 390px, 768px, 1024px, and 1440px widths. Verify both the public sign-in page and authenticated pages. The CSS update does not repair backend authentication or database connectivity.
