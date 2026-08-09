# vinyl-vault

A Netflix-style music collection app.

## Mobile-friendly deploy

This repo is set up to deploy the Vite app from [vite-project](vite-project) to Netlify.

Netlify settings:
- Base directory: `vite-project`
- Build command: `npm run build`
- Publish directory: `dist`

Notes:
- SPA routing is configured so direct links like `/artists/...` resolve correctly on Netlify.
- The app can be installed on phones and tablets as a PWA.
- Current collection and memory data are stored in each device browser's local storage, so data does not sync across devices yet.
