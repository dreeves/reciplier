# Quals

`npm run quals` runs six suites:

- Utility quals (Node): `quals/util_quals.js`
- Parser quals (Node): `quals/parser_quals.js`
- Solver quals (Node): `quals/solver_quals.js`
- Browser/UI quals (Puppeteer): `quals/ui_quals.js`
- Layout quals (Puppeteer): `quals/layout_quals.js`
- Engine quals (Playwright, in WebKit and Firefox): `quals/engine_quals.js`

To run just one:

- `npm run quals:solver`
- `npm run quals:ui`
- `npm run quals:layout`
- `npm run quals:engines`

Setup, once per machine, after `npm install`: `npx playwright install webkit firefox`
downloads the two browsers the engine quals drive. (Puppeteer fetches its own
Chrome during `npm install`.)
