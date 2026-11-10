# A little countdown ♡

A simple, mobile-first countdown and editable trip checklist. Front-end only, no build step.

## Publish on GitHub Pages

1. Upload the contents of this folder (including `index.html`, `css/`, and `js/`) to the root of a GitHub repository.
2. Open the repository **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, `main`, and `/ (root)`.
3. Open your GitHub Pages link on your phone.

## Update arrival date

Edit `js/config.js`. The `arrival` value is the local clock time in Maine, and `arrivalZone` defaults to `America/New_York`. The date is intentionally still marked as tentative.

## Editing checklist

Tap **Add an idea** or **Edit list** in any section. Checkmarks and additions persist in the current browser using localStorage. **Share our list** sends a snapshot link another phone can import. This does **not** provide real-time two-way synchronization, which would require a backend.

The page uses no framework and is ready for static hosting. The fonts are optional Google Fonts; system fallbacks are included.
