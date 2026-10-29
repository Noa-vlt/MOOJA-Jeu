# MOOJA Surf

A browser-based Three.js surf game built with Vite. The production build is a
static site and can be served from the root of a domain or a subdirectory.
The low-poly beach includes three beach shops, plentiful towels, loungers,
beachgoers, and a locally rendered welcome sign for Saint-Gilles-Croix-de-Vie.
Three autonomous surfer NPCs paddle into position, catch waves, ride their
surface, and fall when a wave loses its energy.

## Run locally

```sh
npm ci
npm run dev
```

## Mobile browsers

The game runs in current Android and iPhone browsers without an app install.
Touch controls are shown on touch devices, and the interface accounts for
notched-screen safe areas. For publishing, deploy the contents of `dist/` after
building; Three.js, styles, audio, and character portraits are served with the
site, with no third-party runtime downloads.

## Main menu and progression

Choose Noa for free, or unlock Emilio (100 coins), Malou (350 coins), and Léo
(1,000 coins) from the main menu. Coin balance, unlocked surfers, and the
selected surfer are saved in the browser. The sound toggle and volume control
are available only in the main menu.

Character portrait PNGs can be added to `assets/characters/` as `noa.png`,
`emilio.png`, `malou.png`, and `leo.png`. Missing or invalid portraits use the
colored avatar fallback.

## Build and host

```sh
npm run build
```

Upload the contents of `dist/` to any static web host, such as GitHub Pages,
Netlify, or Cloudflare Pages. No server-side runtime is required.

## Create a QR code

After publishing the site, encode its public HTTPS address:

```sh
npm run qr -- https://your-public-game-url.example
```

The command writes `dist/qr.svg`. This build-time utility does not add QR
generation code to the game's browser bundle. The QR code is generated locally;
the public URL is not sent to a third-party service.
