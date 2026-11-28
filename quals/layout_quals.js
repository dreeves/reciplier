/*
Layout quals (not tests).

Appearance-independent invariants for the page's layout, legibility, and touch
handling, swept across screen sizes and every reciplate in a real browser
(Puppeteer). Nothing here pins wording, colors, fonts, or pixel positions. The
quals say things like "nothing sticks out past the screen edge", "every field
shows its whole value", and "text has enough contrast to read", so a restyle
passes them and a breakage doesn't. Where a qual needs a number, the number is
a published standard (cited at the constant), not this design's own metrics.
One color is pinned, because the human asked for it by name: pegged fields are
blue and unpegged fields are not.
Text checks tell words from marks: a "mark" here is text with no letter or
digit in it (an emoji, a ●, a ×), which is an icon, not something to read.

Usage:
  npm run quals:layout
*/

const path = require('node:path')
const zlib = require('node:zlib')
const puppeteer = require('puppeteer')

// -----------------------------------------------------------------------------
// Thresholds
// -----------------------------------------------------------------------------

const K = {
  // iOS Safari zooms the whole page in when you focus a form control whose
  // font is smaller than this
  minControlFontPx: 16,
  // The size below which Lighthouse's font-size audit (retired in Lighthouse
  // 13) counted text as too small to read
  // https://developer.chrome.com/docs/lighthouse/seo/font-size
  minTextPx: 12,
  // WCAG 2.2 SC 1.4.3 (AA): contrast for body text, and for large text
  // (24px, or 18.66px bold)
  // https://www.w3.org/TR/WCAG22/#contrast-minimum
  minContrast: 4.5,
  minContrastLarge: 3,
  // WCAG 2.2 SC 1.4.11 (AA): contrast for marks and other non-text
  // https://www.w3.org/TR/WCAG22/#non-text-contrast
  minContrastMark: 3,
  // WCAG 2.2 SC 2.5.8 (AA): smallest tap target, which is also what a field
  // sitting inline in a sentence has to meet, and a slider's thumb
  // https://www.w3.org/TR/WCAG22/#target-size-minimum
  minTapInlinePx: 24,
  // WCAG 2.2 SC 2.5.5 (AAA): tap target for a control that stands on its own
  // (buttons, the dropdown, the editor toggle)
  // https://www.w3.org/TR/WCAG22/#target-size-enhanced
  minTapStandalonePx: 44,
  // Not a standard, a judgment call: a slider narrower than this is too
  // coarse to set by finger
  minSliderPx: 120,
  // WCAG 2.2 SC 1.4.4 (AA): text can be enlarged to 200% without loss
  // https://www.w3.org/TR/WCAG22/#resize-text
  textEnlargePct: 200,
}

// Screen sizes to sweep. 320 is the narrowest phone still in use and also
// WCAG 2.2 SC 1.4.10's reflow width (https://www.w3.org/TR/WCAG22/#reflow).
// density: device pixels per CSS pixel, as on the kind of device each stands
// for (it changes how borders and line boxes round).
const VIEWPORTS = [
  { name: 'phone-320',       width: 320,  height: 568,  touch: true,  density: 2 },
  { name: 'phone-360',       width: 360,  height: 740,  touch: true,  density: 3 },
  { name: 'phone-390',       width: 390,  height: 844,  touch: true,  density: 3 },
  { name: 'phone-430',       width: 430,  height: 932,  touch: true,  density: 3 },
  { name: 'phone-landscape', width: 844,  height: 390,  touch: true,  density: 3 },
  { name: 'tablet-768',      width: 768,  height: 1024, touch: true,  density: 2 },
  { name: 'laptop-1280',     width: 1280, height: 800,  touch: false, density: 2 },
  { name: 'desktop-1920',    width: 1920, height: 1080, touch: false, density: 1 },
]

// Stand-ins for whatever typeface a device ends up showing: the page asks for
// system fonts by name and falls back down a list, so every platform renders
// it in a different face. CSS's generic families each resolve to some
// installed font with its own metrics.
const TYPEFACES = ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy']

// Values to drop into fields: long, negative, tiny, and nothing at all
const ODD_VALUES = ['-12345.678', '0.0001', '987654321', '']

// Templates that stress the layout in ways the reciplates don't
const STRESS = {
  'long values':
    'Big {a = 1234567890123} small {b = 0.0001} negative {c = -98765.4321} ' +
    'unixtime {t = 1766620800} sum {a + b + c + t}',
  'unbroken text':
    `${'W'.repeat(70)} then a URL https://example.com/${'path/'.repeat(20)} ` +
    'and {2x} fields{3x}glued{4x}together, scaled by {x:1}',
  'many fields':
    Array.from({ length: 30 }, (_, i) => `{${i + 1}x}`).join(' ') +
    '\n\nScaled by {x:1}',
  'markdown': [
    '# Heading one', '## Heading two', '### Heading three', '#### Heading four',
    'A paragraph with **bold**, *italic*, `code`, and a [link](https://example.com) plus {2x} cups.',
    '> A blockquote with {3x} tsp of something.',
    '1. First {1x}\n2. Second {2x}\n   * Nested {3x}\n     * Deeper {4x}',
    '---',
    '| Thing | Amount | Notes that run fairly long to push the table wide |\n' +
    '|---|---|---|\n' +
    '| Flour | {5x} | cups of the all-purpose kind |\n' +
    '| Sugar | {6x} | tablespoons |',
    '```\n' + 'a long line of preformatted text that does not wrap on its own '.repeat(3) + '\n```',
    `<img alt="a picture wider than any screen" width="3000" height="40" src="data:image/svg+xml,` +
    `%3Csvg xmlns='http://www.w3.org/2000/svg' width='3000' height='40'%3E%3Crect width='3000' height='40' fill='gray'/%3E%3C/svg%3E">`,
    'Scaled by {x:1}',
  ].join('\n\n'),
  'sliders':
    'Solo slider\n{0 <= a <= 100}\n\n' +
    'In a sentence: set {0 <= b <= 1} to taste, then {a : 50} and {b : 0.5}.\n\n' +
    'Two on a line {1 <= c <= 9} and {1 <= d <= 9} with {c : 2} and {d : 3}',
  'errors':
    'Contradiction {1 = z} {2 = z}\n\nBare {5}\n\nUnclosed {q\n\n' +
    `Lonely {l${'o'.repeat(50)}ngname : 5}`,
  'celless with numbers': 'Fry 2 eggs in 1/2 tbsp butter.\nServe hot.',
  'celless without numbers': 'Fry eggs in butter.',
  'empty': '',
  'blank fields': 'Blank {a} plus blank {b} is {a + b}',
}

// -----------------------------------------------------------------------------
// Reporting
// -----------------------------------------------------------------------------

const results = { passed: 0, failed: 0, byQual: new Map() }

const describeViewport = vp =>
  `${vp.width}x${vp.height} ${vp.touch ? 'touch screen' : 'screen with a mouse'}`

// One check: a named expectation and whether it held
const ck = (name, ok, expectata, resultata) =>
  ({ name, ok: !!ok, expectata, resultata: String(resultata) })

// Report a group of checks made in one place (a viewport plus the steps to
// get there). One ✓ line if they all held, else a ✗ block per failure.
function report(vp, what, replicata, checks) {
  const bad = checks.filter(c => !c.ok)
  results.passed += checks.length - bad.length
  results.failed += bad.length
  const head = `${vp.name} · ${what}`
  if (bad.length === 0) console.log(`✓ ${head} (${checks.length} checks)`)
  for (const c of bad) {
    console.log(`✗ ${head}: ${c.name}`)
    console.log(`  Replicata: ${describeViewport(vp)}; ${replicata}`)
    console.log(`  Expectata: ${c.expectata}`)
    console.log(`  Resultata: ${c.resultata}`)
    results.byQual.set(c.name, (results.byQual.get(c.name) ?? 0) + 1)
  }
}

// Run a group of checks, turning a crash in the steps (a missing element, a
// timeout) into a failed check so the rest of the sweep still runs
async function group(vp, what, replicata, body) {
  let checks
  try {
    checks = await body()
  } catch (err) {
    checks = [ck('the steps can be carried out', false,
      'every step of the replicata works', err && err.message ? err.message : err)]
  }
  report(vp, what, replicata, checks)
}

// -----------------------------------------------------------------------------
// In-page probes (this function is serialized and run inside the page)
// -----------------------------------------------------------------------------

function installProbes(K) {
  const SLACK = 0.5  // sub-pixel rounding slack, in px
  const all = sel => [...document.querySelectorAll(sel)]
  const shown = el => el.checkVisibility({ checkVisibilityCSS: true })
  const rect = el => el.getBoundingClientRect()
  const px = x => Math.round(x * 10) / 10
  const few = list => list.slice(0, 4).join('; ') +
    (list.length > 4 ? `; and ${list.length - 4} more` : '')

  const nameOf = el =>
    el.id ? `#${el.id}` :
    el.matches('input.recipe-field') ? `field {${el.dataset.tip}}` :
    el.matches('input.recipe-slider') ? `slider {${el.dataset.tip}}` :
    `<${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\s+/).join('.') : ''}>`

  const fields = () => all('input.recipe-field').filter(shown)
  const sliders = () => all('input.recipe-slider').filter(shown)
  const standalone = () => all('button, select, summary').filter(shown)
  const controls = () => [...fields(), ...sliders(), ...standalone()]

  // Where a control visibly is. A <summary> is a full-width block, so its
  // footprint is its label, not its box.
  const footprint = el => {
    if (el.tagName !== 'SUMMARY') return rect(el)
    const range = document.createRange()
    range.selectNodeContents(el)
    return range.getBoundingClientRect()
  }

  // The nearest ancestor that clips or scrolls its contents sideways
  const clipper = el => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (getComputedStyle(p).overflowX !== 'visible') return p
    }
    return null
  }

  // Does a tap at this element's point land on it (or on a part of it, or on
  // its own pin)?
  const lands = (el, hit) => {
    if (!hit) return false
    if (hit === el || el.contains(hit)) return true
    const wrap = el.closest('.field-wrapper')
    return wrap !== null && wrap === hit.closest('.field-wrapper')
  }

  // ---- color math (WCAG relative luminance and contrast ratio) ----
  const parseColor = s => {
    let m = s.match(/^rgba?\(([^)]+)\)$/)
    if (m) {
      const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number)
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
    }
    m = s.match(/^color\(srgb ([^)]+)\)$/)
    if (m) {
      const p = m[1].split(/[\s\/]+/).filter(Boolean).map(Number)
      return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 }
    }
    throw new Error(`layout quals can't parse the color "${s}"`)
  }
  const over = (top, under) => ({
    r: top.a * top.r + (1 - top.a) * under.r,
    g: top.a * top.g + (1 - top.a) * under.g,
    b: top.a * top.b + (1 - top.a) * under.b,
    a: 1,
  })
  const luminance = c => {
    const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
    return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
  }
  const contrast = (c1, c2) => {
    const [hi, lo] = [luminance(c1), luminance(c2)].sort((a, b) => b - a)
    return (hi + 0.05) / (lo + 0.05)
  }
  // Is a color blue to the eye? Its hue is in the blues, and it's neither
  // washed out to gray nor so dark it reads as black. (A judgment call, made
  // so that a blue-gray ink or a cool off-white doesn't count.)
  const isBlue = s => {
    const c = parseColor(s)
    const [r, g, b] = [c.r / 255, c.g / 255, c.b / 255]
    const hi = Math.max(r, g, b), lo = Math.min(r, g, b)
    const lightness = (hi + lo) / 2
    const saturation = hi === lo ? 0 : (hi - lo) / (1 - Math.abs(2 * lightness - 1))
    const hue = hi === lo ? 0 : 60 * (hi === r ? ((g - b) / (hi - lo) + 6) % 6
                                    : hi === g ? (b - r) / (hi - lo) + 2
                                    : (r - g) / (hi - lo) + 4)
    return c.a > 0 && hue >= 190 && hue <= 270 && saturation >= 0.25 && lightness >= 0.2
  }
  // The colors a field is drawn in (fill, border, and text) that are blue
  const bluesOf = el => {
    const cs = getComputedStyle(el)
    return Object.entries({ fill: cs.backgroundColor, border: cs.borderTopColor, text: cs.color })
      .filter(([part, color]) => isBlue(color) &&
                                 (part !== 'border' || parseFloat(cs.borderTopWidth) > 0))
      .map(([part]) => part)
  }

  // The color actually behind an element: every ancestor's background,
  // composited from the page canvas (white) on down. null if a background
  // image is involved, since then the color can't be known from styles.
  const backdrop = el => {
    const chain = []
    for (let p = el; p; p = p.parentElement) chain.unshift(p)
    let acc = { r: 255, g: 255, b: 255, a: 1 }
    for (const p of chain) {
      const cs = getComputedStyle(p)
      if (cs.backgroundImage !== 'none') return null
      acc = over(parseColor(cs.backgroundColor), acc)
    }
    return acc
  }
  // How see-through an element is, counting its ancestors' opacity
  const opacity = el => {
    let o = 1
    for (let p = el; p; p = p.parentElement) o *= parseFloat(getComputedStyle(p).opacity)
    return o
  }
  // Elements holding visible text of their own, plus form controls that show
  // a value
  const textBearers = () => {
    const out = new Set()
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue.trim()) continue
      const el = n.parentElement
      if (el.closest('script, style, noscript, option, textarea, [hidden]')) continue
      if (!shown(el)) continue
      const range = document.createRange()
      range.selectNodeContents(n)
      if (range.getClientRects().length === 0) continue
      out.add(el)
    }
    for (const el of all('input[type="text"], textarea, select')) {
      if (shown(el)) out.add(el)
    }
    return [...out]
  }
  const textOf = el => (el.matches('input, textarea, select')
    ? (el.matches('select') ? el.selectedOptions[0]?.textContent ?? '' : el.value)
    : el.textContent).trim().replace(/\s+/g, ' ').slice(0, 24)
  // Words are for reading; a mark (no letter or digit in it) is an icon
  const wordy = el => /[\p{L}\p{N}]/u.test(textOf(el))
  // Contrast of a color against what's behind an element
  const contrastOn = (color, el) => contrast(over(parseColor(color), backdrop(el)), backdrop(el))

  // ---------------------------------------------------------------------------
  // The sweep: every invariant that should hold no matter what's on the page.
  // Returns a list of { name, ok, expectata, resultata }.
  // ---------------------------------------------------------------------------
  function sweep(opts) {
    const out = []
    const add = (name, expectata, bad) => out.push({
      name, ok: bad.length === 0, expectata, resultata: few(bad),
    })
    const de = document.documentElement
    const vw = opts.vw  // the screen's width
    // With something modal open (the help popover), only the controls inside
    // it are expected to be reachable
    const reachable = () => controls().filter(el => el.closest(opts.within) !== null)
    window.scrollTo(0, 0)

    add('the page does not scroll sideways',
      `the page is no wider than the ${vw}px screen`,
      [de.scrollWidth, document.body.scrollWidth].some(w => w > vw + SLACK)
        ? [`the page is ${de.scrollWidth}px wide (body ${document.body.scrollWidth}px)`] : [])

    add('nothing sticks out past the screen edges',
      `every visible element lies between x=0 and x=${vw}`,
      all('body *').filter(el => shown(el) && !el.closest('select') && !clipper(el))
        .map(el => [el, rect(el)])
        .filter(([, r]) => r.width > 0 && r.height > 0 &&
                           (r.left < -SLACK || r.right > vw + SLACK))
        .map(([el, r]) => `${nameOf(el)} spans x=${px(r.left)} to ${px(r.right)}`))

    add('nothing is silently clipped',
      'no element that hides its overflow has content wider than itself',
      all('body *').filter(el => shown(el) && !el.matches('input, textarea, select') &&
                                 ['hidden', 'clip'].includes(getComputedStyle(el).overflowX) &&
                                 el.scrollWidth > el.clientWidth + 1)
        .map(el => `${nameOf(el)} holds ${el.scrollWidth}px of content in ${el.clientWidth}px`))

    add('every field shows its whole value',
      'no field value is cut off by the edge of its field',
      fields().filter(f => f.scrollWidth > f.clientWidth + 1 || f.scrollHeight > f.clientHeight + 1)
        .map(f => `${nameOf(f)} showing "${f.value}" needs ` +
                  `${f.scrollWidth}x${f.scrollHeight}px but has ${f.clientWidth}x${f.clientHeight}px`))

    const card = rect(document.getElementById('recipeOutput'))
    add('fields and sliders stay inside the recipe card',
      'every field and slider lies within the output section (or within something in it that scrolls)',
      [...fields(), ...sliders()].filter(el => !clipper(el)).map(el => [el, rect(el)])
        .filter(([, r]) => r.left < card.left - SLACK || r.right > card.right + SLACK ||
                           r.top < card.top - SLACK || r.bottom > card.bottom + SLACK)
        .map(([el, r]) => `${nameOf(el)} spans x=${px(r.left)} to ${px(r.right)} ` +
                          `but the card spans x=${px(card.left)} to ${px(card.right)}`))

    const spots = reachable().map(el => [el, footprint(el)])
    const overlaps = []
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const [a, ra] = spots[i], [b, rb] = spots[j]
        const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)
        const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)
        if (w > SLACK && h > SLACK) {
          overlaps.push(`${nameOf(a)} and ${nameOf(b)} overlap by ${px(w)}x${px(h)}px`)
        }
      }
    }
    add('no two controls overlap',
      'fields, sliders, buttons, the dropdown, and the editor toggle each have their own space',
      overlaps)

    // Scrolled to the middle, top, and bottom of the screen, so anything
    // pinned to a screen edge that covers a control gets caught
    const covered = []
    for (const el of reachable()) {
      for (const block of ['center', 'start', 'end']) {
        el.scrollIntoView({ block, inline: 'nearest', behavior: 'instant' })
        const r = footprint(el)
        const y = r.top + r.height / 2
        for (const x of [r.left + r.width / 2, r.left + 3, r.right - 3]) {
          const hit = document.elementFromPoint(x, y)
          if (!lands(el, hit)) {
            covered.push(`${nameOf(el)} at (${px(x)}, ${px(y)}) when scrolled to the screen's ` +
                         `${block} is covered by ${hit ? nameOf(hit) : 'nothing (off screen)'}`)
          }
        }
      }
    }
    window.scrollTo(0, 0)
    add('every control can be reached',
      'a tap or click at the middle or either end of each control lands on that control',
      [...new Set(covered)])

    add('controls have text big enough to avoid focus zoom',
      `every text field, text area, and dropdown uses at least ${K.minControlFontPx}px text`,
      all('input[type="text"], textarea, select')
        .filter(el => parseFloat(getComputedStyle(el).fontSize) < K.minControlFontPx)
        .map(el => `${nameOf(el)} uses ${getComputedStyle(el).fontSize} text`))

    const bearers = textBearers()
    add('text is big enough to read',
      `all visible words are at least ${K.minTextPx}px`,
      bearers.filter(el => wordy(el) && opacity(el) > 0.05 &&
                           parseFloat(getComputedStyle(el).fontSize) < K.minTextPx)
        .map(el => `${nameOf(el)} "${textOf(el)}" is ${getComputedStyle(el).fontSize}`))

    const faint = []
    for (const el of bearers) {
      if (el.closest(':disabled')) continue
      const o = opacity(el)
      if (o <= 0.05) continue
      const bg = backdrop(el)
      if (bg === null) continue
      const cs = getComputedStyle(el)
      const ink = parseColor(cs.color)
      const fg = over({ ...ink, a: ink.a * o }, bg)
      const size = parseFloat(cs.fontSize)
      const large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight, 10) >= 700)
      const need = !wordy(el) ? K.minContrastMark : large ? K.minContrastLarge : K.minContrast
      const got = contrast(fg, bg)
      if (got < need) {
        faint.push(`${nameOf(el)} "${textOf(el)}" has contrast ${got.toFixed(2)}:1, needs ${need}:1`)
      }
    }
    add('text has enough contrast to read',
      `words contrast with their background by at least ${K.minContrast}:1 ` +
      `(${K.minContrastLarge}:1 for large text, ${K.minContrastMark}:1 for marks), ` +
      `not counting disabled controls`,
      faint)

    add('buttons say what they are',
      'every button has text or an accessible name',
      all('button').filter(b => shown(b) && !(b.textContent.trim() || b.getAttribute('aria-label')))
        .map(b => `${nameOf(b)} has neither text nor an aria-label`))

    const column = document.getElementById('recipeSelect').parentElement
    const columnStyle = getComputedStyle(column)
    const columnWidth = column.clientWidth - parseFloat(columnStyle.paddingLeft) - parseFloat(columnStyle.paddingRight)
    add('the dropdown has the whole column for recipe names',
      'the dropdown is as wide as the column it sits in',
      rect(document.getElementById('recipeSelect')).width < columnWidth - 1
        ? [`the dropdown is ${px(rect(document.getElementById('recipeSelect')).width)}px wide ` +
           `in a ${px(columnWidth)}px column`] : [])

    add('hidden elements are hidden',
      'every element with the hidden attribute takes up no space',
      all('[hidden]').filter(el => getComputedStyle(el).display !== 'none')
        .map(el => `${nameOf(el)} has the hidden attribute but display: ${getComputedStyle(el).display}`))

    add('sliders are wide enough to set',
      `every slider is at least ${K.minSliderPx}px wide`,
      sliders().filter(s => rect(s).width < K.minSliderPx)
        .map(s => `${nameOf(s)} is ${px(rect(s).width)}px wide`))

    if (opts.touch) {
      // The area that actually responds to a tap, which can be bigger than the
      // element's box (an invisible border of extra tap area) or smaller
      // (something on top of it). Measured by walking outward from the middle.
      const reach = (el, cx, cy, dx, dy) => {
        let n = 0
        while (n < 60 && lands(el, document.elementFromPoint(cx + dx * (n + 1), cy + dy * (n + 1)))) n++
        return n
      }
      const tapArea = el => {
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
        const r = rect(el)
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2
        return { w: 1 + reach(el, cx, cy, -1, 0) + reach(el, cx, cy, 1, 0),
                 h: 1 + reach(el, cx, cy, 0, -1) + reach(el, cx, cy, 0, 1) }
      }
      const small = (els, min) => els.filter(el => el.closest(opts.within) !== null)
        .map(el => [el, tapArea(el)])
        .filter(([, t]) => t.w < min || t.h < min)
        .map(([el, t]) => `${nameOf(el)} has a ${t.w}x${t.h}px tap area, needs ${min}x${min}px`)
      // A slider's tap target is its thumb: the tallest stretch of the slider
      // that takes a tap, found by sampling along its length. (The track is
      // deliberately not a big target; see "a tap that just misses a slider".)
      // (Some browsers make the whole track take taps for as tall as the thumb
      // is, others only the round thumb itself. So: look along the slider in
      // coarse steps, then pixel by pixel around the tallest spot found, then
      // measure that spot to a quarter of a pixel.)
      const thumbHeight = s => {
        s.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
        const r = rect(s)
        const cy = r.top + r.height / 2
        const tall = x => 1 + reach(s, x, cy, 0, -1) + reach(s, x, cy, 0, 1)
        const tallest = xs => xs.reduce((best, x) => tall(x) > tall(best) ? x : best)
        const SAMPLES = 40
        const step = r.width / SAMPLES
        const coarse = tallest(Array.from({ length: SAMPLES - 1 }, (_, i) => r.left + step * (i + 1)))
        const peak = tallest(Array.from({ length: 2 * Math.ceil(step) + 1 }, (_, i) => coarse - Math.ceil(step) + i))
        const FINE = 0.25
        const fine = dy => {
          let n = 0
          while (n < 240 && lands(s, document.elementFromPoint(peak, cy + dy * FINE * (n + 1)))) n++
          return n * FINE
        }
        return FINE + fine(-1) + fine(1)
      }
      const smallThumbs = sliders().filter(el => el.closest(opts.within) !== null)
        .map(s => [s, thumbHeight(s)])
        .filter(([, h]) => h < K.minTapInlinePx - SLACK)
        .map(([s, h]) => `${nameOf(s)} has a thumb ${h}px tall to tap, needs ${K.minTapInlinePx}px`)
      const tooSmall = [...small(fields(), K.minTapInlinePx),
                        ...small(standalone(), K.minTapStandalonePx),
                        ...smallThumbs]
      window.scrollTo(0, 0)
      add('tap targets are big enough for a finger',
        `fields in running text and slider thumbs have at least a ${K.minTapInlinePx}px tap area; ` +
        `buttons, the dropdown, and the editor toggle at least ${K.minTapStandalonePx}px`,
        tooSmall)
    }

    return out
  }

  // Style properties that can make one state of a control look different
  // from another
  const LOOK = ['color', 'backgroundColor', 'backgroundImage', 'fontWeight', 'boxShadow',
                'outlineStyle', 'outlineWidth', 'outlineColor', 'opacity', 'textDecorationLine',
                'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
                'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
                'borderTopStyle', 'borderBottomStyle']
  const look = el => {
    const cs = getComputedStyle(el)
    return Object.fromEntries(LOOK.map(p => [p, cs[p]]))
  }
  // Which of those properties differ between two looks
  const lookDiff = (a, b) => LOOK.filter(p => a[p] !== b[p])

  window.__probe = { sweep, look, lookDiff, nameOf, contrastOn, backdrop, bluesOf }
}

// -----------------------------------------------------------------------------
// Driving the page
// -----------------------------------------------------------------------------

const BASE_URL = 'file://' + path.resolve(__dirname, '..', 'index.html')

const nextFrame = page => page.evaluate(() => new Promise(requestAnimationFrame))
const sleep = ms => new Promise(r => setTimeout(r, ms))

// within: a selector for the part of the page whose controls should be
// reachable (everything, unless something modal is open). vw: the screen's
// width right now (it changes when the screen is rotated).
const sweep = (page, vp, within = 'body', vw = vp.width) =>
  page.evaluate((touch, within, vw) => window.__probe.sweep({ touch, within, vw }), vp.touch, within, vw)

// A sweep's checks, renamed to say what state the page was in
const during = (state, checks) => checks.map(c => ({ ...c, name: `${state}, ${c.name}` }))

// Tap on touch screens, click otherwise
async function poke(page, vp, target) {
  const handle = typeof target === 'string'
    ? await page.waitForSelector(target, { visible: true, timeout: 3000 }) : target
  await (vp.touch ? handle.tap() : handle.click())
  await nextFrame(page)
}

// Replace the template the way the quals in ui_quals.js do
async function setTemplate(page, text) {
  await page.$eval('#recipeTextarea', (el, v) => {
    el.value = v
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, text)
  await nextFrame(page)
}

async function selectReciplate(page, key) {
  await page.select('#recipeSelect', key)
  await nextFrame(page)
}

// Tap or click into a field, select what's there, and type over it
async function retype(page, vp, selector, text) {
  await poke(page, vp, selector)
  await page.$eval(selector, el => el.select())
  await page.keyboard.type(text)
  await nextFrame(page)
}

const fieldSel = label => `input.recipe-field[data-label="${label}"]`
const valueOf = (page, selector) => page.$eval(selector, el => el.value)

// Park the pointer and the focus somewhere neutral so no control is hovered
// or focused. On a touch screen the hover stays on whatever was tapped last,
// so the way to move it is to tap something inert: the title.
async function neutral(page, vp) {
  await page.evaluate(() => document.activeElement && document.activeElement.blur())
  await (vp.touch ? page.tap('h1') : page.mouse.move(1, 1))
  await nextFrame(page)
}

// Press at one point of the screen and drag to another, by finger or mouse
async function drag(page, vp, x0, y, x1) {
  const STEPS = 8
  const xs = Array.from({ length: STEPS }, (_, i) => x0 + (x1 - x0) * (i + 1) / STEPS)
  if (vp.touch) {
    await page.touchscreen.touchStart(x0, y)
    for (const x of xs) await page.touchscreen.touchMove(x, y)
    await page.touchscreen.touchEnd()
  } else {
    await page.mouse.move(x0, y)
    await page.mouse.down()
    for (const x of xs) await page.mouse.move(x, y)
    await page.mouse.up()
  }
  await nextFrame(page)
}

// Press and hold a point of the screen
async function hold(page, vp, x, y, ms) {
  if (vp.touch) {
    await page.touchscreen.touchStart(x, y)
    await sleep(ms)
    await page.touchscreen.touchEnd()
  } else {
    await page.mouse.move(x, y)
    await page.mouse.down()
    await sleep(ms)
    await page.mouse.up()
  }
  await nextFrame(page)
}

// The middle of an element, in screen coordinates, after scrolling it into view
const middleOf = (page, selector) => page.$eval(selector, el => {
  el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2,
           left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width }
})

// The colors actually painted down a one-pixel-wide strip of the page (in page
// coordinates), read off a screenshot: one color per CSS pixel of height.
// Chrome's screenshots are 8-bit RGB or RGBA PNGs, not interlaced, which is
// all this reads.
const PNG_CHANNELS = { 2: 3, 6: 4 }  // PNG color type -> bytes per pixel
const paeth = (a, b, c) => {
  const p = a + b - c
  const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)]
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}
// PNG's five row filters: x is the stored byte, a/b/c the decoded bytes to
// the left, above, and above-left
const PNG_UNFILTER = [
  x => x,
  (x, a) => x + a,
  (x, a, b) => x + b,
  (x, a, b) => x + ((a + b) >> 1),
  (x, a, b, c) => x + paeth(a, b, c),
]
// The first pixel of each row of a PNG, as { r, g, b }
function pngFirstColumn(png) {
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20)
  const bpp = PNG_CHANNELS[png[25]]
  if (png[24] !== 8 || bpp === undefined || png[28] !== 0) {
    throw new Error(`layout quals can't read this kind of PNG (depth ${png[24]}, color type ${png[25]})`)
  }
  const idat = []
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at)
    if (png.toString('latin1', at + 4, at + 8) === 'IDAT') idat.push(png.subarray(at + 8, at + 8 + length))
    at += 12 + length
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * bpp
  const column = []
  let above = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const at = y * (stride + 1)
    const unfilter = PNG_UNFILTER[raw[at]]
    const row = Buffer.alloc(stride)
    for (let i = 0; i < stride; i++) {
      row[i] = unfilter(raw[at + 1 + i], i >= bpp ? row[i - bpp] : 0, above[i], i >= bpp ? above[i - bpp] : 0) & 255
    }
    column.push({ r: row[0], g: row[1], b: row[2] })
    above = row
  }
  return column
}
async function colorsDown(page, x, y, height) {
  const png = Buffer.from(await page.screenshot({ clip: { x, y, width: 1, height } }))
  const column = pngFirstColumn(png)
  // A high-density screen has several device pixels per CSS pixel
  const density = column.length / height
  return Array.from({ length: height }, (_, i) => column[Math.floor(i * density)])
}
// Are two colors the same to the eye (allowing for rounding in the rendering)?
const sameColor = (c1, c2) => ['r', 'g', 'b'].every(k => Math.abs(c1[k] - c2[k]) <= 3)

// -----------------------------------------------------------------------------
// Interaction quals: things a person does, done by finger on the touch screens
// and by mouse and keyboard on the others
// -----------------------------------------------------------------------------

async function interactions(page, vp) {
  const how = vp.touch ? 'tap' : 'click'

  await group(vp, 'editing a field',
    `choose "crepes", ${how} the scale-factor field, and type 2 over it`,
    async () => {
      await selectReciplate(page, 'crepes')
      await retype(page, vp, fieldSel('x'), '2')
      const eggs = await valueOf(page, fieldSel('12x'))
      const focused = await page.evaluate(sel =>
        document.activeElement === document.querySelector(sel), fieldSel('x'))
      return [
        ck('the field takes the focus', focused,
          'the scale-factor field is the focused element', `focused: ${focused}`),
        ck('the other fields follow', eggs === '24',
          'the eggs field (12x) shows 24', `the eggs field shows "${eggs}"`),
        ...await sweep(page, vp),
      ]
    })

  await group(vp, 'values that outgrow their fields',
    'choose "crepes" and type 123.456 over the scale-factor field',
    async () => {
      await selectReciplate(page, 'crepes')
      await retype(page, vp, fieldSel('x'), '123.456')
      await neutral(page, vp)
      return sweep(page, vp)
    })

  await group(vp, 'emptied fields',
    'choose "crepes" and clear the scale-factor field',
    async () => {
      await selectReciplate(page, 'crepes')
      await poke(page, vp, fieldSel('x'))
      await page.$eval(fieldSel('x'), el => el.select())
      await page.keyboard.press('Backspace')
      await neutral(page, vp)
      return sweep(page, vp)
    })

  await group(vp, 'dragging a slider',
    `choose "crepes", then press the slider's track at its midpoint and drag to three quarters`,
    async () => {
      await selectReciplate(page, 'crepes')
      const atBase = await page.$eval('input.recipe-slider', el => window.__probe.look(el))
      const s = await middleOf(page, 'input.recipe-slider')
      await drag(page, vp, s.left + s.width * 0.5, s.y, s.left + s.width * 0.75)
      const now = await page.$eval('input.recipe-slider', el => ({
        value: Number(el.value), min: Number(el.min), max: Number(el.max),
        look: window.__probe.look(el),
      }))
      const x = Number(await valueOf(page, fieldSel('x')))
      const eggs = Number(await valueOf(page, fieldSel('12x')))
      const mid = (now.min + now.max) / 2
      const changed = await page.evaluate((a, b) => window.__probe.lookDiff(a, b), atBase, now.look)
      return [
        ck('the slider follows the drag', now.value > mid,
          `the slider ends up past its midpoint (${mid})`, `the slider is at ${now.value}`),
        ck('the scale factor follows the slider', Math.abs(x - now.value) < 0.01,
          `the scale-factor field shows the slider's value (${now.value})`, `it shows ${x}`),
        ck('the other fields follow the slider', Math.abs(eggs - 12 * now.value) < 0.01,
          `the eggs field shows 12 times the slider's value (${12 * now.value})`, `it shows ${eggs}`),
        ck('a slider at its starting value looks different from one moved off it', changed.length > 0,
          'the slider at its starting value differs visibly from the slider after the drag',
          `style properties that differ: ${changed.join(', ') || 'none'}`),
      ]
    })

  await group(vp, 'where a slider takes taps',
    'choose "crepes" and set the slider to the middle of its range',
    async () => {
      await selectReciplate(page, 'crepes')
      await neutral(page, vp)
      const REACH = 60  // how far from the track to look, in px
      const s = await page.$eval('input.recipe-slider', (el, REACH) => {
        // With the thumb at the middle of the track, the quarter mark is well
        // clear of it
        el.value = (Number(el.min) + Number(el.max)) / 2
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
        const r = el.getBoundingClientRect()
        const middle = r.top + r.height / 2
        const quarter = r.left + r.width / 4
        const reach = dy => {
          let n = 0
          while (n < REACH && document.elementFromPoint(quarter, middle + dy * (n + 1)) === el) n++
          return n
        }
        return { thumbX: r.left + r.width / 2, middle, tapsAbove: reach(-1), tapsBelow: reach(1),
                 scrollX: window.scrollX, scrollY: window.scrollY,
                 behind: window.__probe.backdrop(el.parentElement) }
      }, REACH)
      // What's drawn down the middle of the thumb: every spot whose color
      // isn't the bare card's
      const strip = await colorsDown(page, s.thumbX + s.scrollX, s.middle - REACH + s.scrollY, 2 * REACH)
      const drawn = strip.map((color, i) => [i - REACH, color])
        .filter(([, color]) => !sameColor(color, s.behind)).map(([dy]) => dy)
      const thumbAbove = -Math.min(...drawn), thumbBelow = Math.max(...drawn)
      await selectReciplate(page, 'crepes')
      return [
        ck('the slider\'s thumb can be seen', drawn.length > 0,
          'something is drawn where the thumb is', `${drawn.length}px of the strip through the thumb are drawn on`),
        // The track takes taps along its whole length for as tall as the
        // thumb is (that's how browsers build sliders). Any taller than the
        // thumb looks, and a near miss by eye would rescale the recipe.
        ck('a slider takes taps no farther from its track than its thumb reaches',
          s.tapsAbove <= thumbAbove + 1 && s.tapsBelow <= thumbBelow + 1,
          'away from the thumb, the stretch above and below the track that takes a tap is no taller than the thumb looks',
          `taps land up to ${s.tapsAbove}px above and ${s.tapsBelow}px below the middle of the track; ` +
          `the thumb shows from ${thumbAbove}px above to ${thumbBelow}px below`),
      ]
    })

  await group(vp, 'pegging a field with its pin',
    `choose "crepes", ${vp.touch ? 'tap' : 'point at'} the eggs field, then ${how} its pin, then ${how} the pin again`,
    async () => {
      await selectReciplate(page, 'crepes')
      await neutral(page, vp)
      const eggs = fieldSel('12x')
      // What the eggs field's pin is showing: how visible it is, whether a
      // tap would land on it, and its mark (text, or an image of some kind)
      const pinState = () => page.$eval(eggs, el => {
        const pin = el.closest('.field-wrapper').querySelector('.corner-pin')
        pin.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
        const r = pin.getBoundingClientRect()
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        const cs = getComputedStyle(pin)
        const drawn = [cs.backgroundImage, cs.maskImage, getComputedStyle(pin, '::before').content]
          .some(v => !['none', 'normal'].includes(v)) || pin.children.length > 0
        return { opacity: parseFloat(cs.opacity), hittable: hit === pin,
                 text: pin.textContent.trim(), drawn, look: window.__probe.look(pin) }
      })
      const pinOf = () => page.evaluateHandle(sel =>
        document.querySelector(sel).closest('.field-wrapper').querySelector('.corner-pin'), eggs)
      const isPegged = () => page.$eval(eggs, el => el.classList.contains('pegged'))
      const pointAt = () => vp.touch ? poke(page, vp, eggs) : page.hover(eggs)
      const quiet = await pinState()
      await pointAt()
      const pin = await pinState()
      await poke(page, vp, await pinOf())
      const peggedAfterFirst = await isPegged()
      await neutral(page, vp)
      const changed = await page.evaluate((a, b) => window.__probe.lookDiff(
        window.__probe.look(document.querySelector(a)),
        window.__probe.look(document.querySelector(b))), eggs, fieldSel('3x'))
      const blues = await page.evaluate((a, b) => ({
        pegged: window.__probe.bluesOf(document.querySelector(a)),
        unpegged: window.__probe.bluesOf(document.querySelector(b)),
      }), eggs, fieldSel('3x'))
      await pointAt()
      const peggedPin = await pinState()
      await poke(page, vp, await pinOf())
      const peggedAfterSecond = await isPegged()
      await neutral(page, vp)
      const pinChanged = await page.evaluate((a, b) => window.__probe.lookDiff(a, b), pin.look, peggedPin.look)
      return [
        ck('the pin stays out of the way until its field is pointed at or focused',
          quiet.opacity <= 0.05 && !quiet.hittable,
          'with nothing pointed at or focused, the pin is invisible and takes no taps',
          `pin opacity ${quiet.opacity}, ${quiet.hittable ? 'takes taps' : 'takes no taps'}`),
        ck('the pin shows up', pin.opacity > 0.3 && pin.hittable,
          `the eggs field's pin is visible and nothing covers it`,
          `pin opacity ${pin.opacity}, ${pin.hittable ? 'reachable' : 'covered or not reachable'}`),
        ck('the pin has a mark on it', pin.text.length > 0 || pin.drawn,
          'the pin shows a mark: some text or an image',
          `text "${pin.text}", image: ${pin.drawn}`),
        ck('the pin pegs the field', peggedAfterFirst === true,
          'the eggs field is pegged', `pegged: ${peggedAfterFirst}`),
        ck('a pegged field looks different from an unpegged one', changed.length > 0,
          'the pegged eggs field differs visibly from the unpegged flour field',
          `style properties that differ: ${changed.join(', ') || 'none'}`),
        // The human's rule (2026-11-27): "pegged fields were blue and nonpegged
        // were not blue. let's keep that distinction"
        ck('a pegged field is blue', blues.pegged.length > 0,
          'the pegged eggs field has blue in its fill, border, or text',
          `blue parts: ${blues.pegged.join(', ') || 'none'}`),
        ck('an unpegged field is not blue', blues.unpegged.length === 0,
          'the unpegged flour field has no blue in its fill, border, or text',
          `blue parts: ${blues.unpegged.join(', ') || 'none'}`),
        ck('a pegged pin looks different from an unpegged one',
          peggedPin.text !== pin.text || pinChanged.length > 0,
          `the pin's mark or styling changes when its field is pegged`,
          `mark "${pin.text}" then "${peggedPin.text}"; style properties that differ: ${pinChanged.join(', ') || 'none'}`),
        ck('the pin unpegs the field', peggedAfterSecond === false,
          'the eggs field is unpegged again', `pegged: ${peggedAfterSecond}`),
      ]
    })

  await group(vp, 'pegging a field by holding it',
    'choose "crepes", press and hold the eggs field for most of a second, then do it again',
    async () => {
      await selectReciplate(page, 'crepes')
      await neutral(page, vp)
      const eggs = fieldSel('12x')
      const isPegged = () => page.$eval(eggs, el => el.classList.contains('pegged'))
      // Twice as long as the page waits before it counts a press as a hold, so
      // a busy machine running the page's clock late doesn't make it a tap
      const HOLD_MS = 800
      const a = await middleOf(page, eggs)
      await hold(page, vp, a.x, a.y, HOLD_MS)
      const first = await isPegged()
      const b = await middleOf(page, eggs)
      await hold(page, vp, b.x, b.y, HOLD_MS)
      const second = await isPegged()
      await neutral(page, vp)
      return [
        ck('holding pegs the field', first === true,
          'the eggs field is pegged after the first hold', `pegged: ${first}`),
        ck('holding again unpegs it', second === false,
          'the eggs field is unpegged after the second hold', `pegged: ${second}`),
      ]
    })

  await group(vp, 'typing something that is not a number',
    `choose "crepes", ${how} the eggs field, and type "1+" over it`,
    async () => {
      await selectReciplate(page, 'crepes')
      await retype(page, vp, fieldSel('12x'), '1+')
      await neutral(page, vp)
      const invalid = await page.$eval(fieldSel('12x'), el => el.classList.contains('invalid'))
      const changed = await page.evaluate((a, b) => window.__probe.lookDiff(
        window.__probe.look(document.querySelector(a)),
        window.__probe.look(document.querySelector(b))), fieldSel('12x'), fieldSel('3x'))
      const banner = await page.evaluate(() => {
        const b = [...document.querySelectorAll('#recipeOutput .error-display:not([hidden])')][0]
        const card = document.getElementById('recipeOutput').getBoundingClientRect()
        const r = b ? b.getBoundingClientRect() : null
        const msg = b ? b.querySelector('.error-message') : null
        // A mark that says "error" without needing the words: a symbol the
        // text leads with, or something drawn ahead of it
        const marked = !!msg && (/^[^\p{L}\p{N}\s]/u.test(msg.textContent.trim()) ||
          !['none', 'normal'].includes(getComputedStyle(msg, '::before').content) ||
          msg.querySelector('img, svg') !== null)
        return { exists: !!b, inside: !!b && r.left >= card.left - 0.5 && r.right <= card.right + 0.5,
                 marked, text: msg ? msg.textContent.trim().slice(0, 30) : '' }
      })
      return [
        ck('the field is marked invalid', invalid,
          'the eggs field is flagged invalid', `flagged: ${invalid}`),
        ck('an invalid field looks different from a valid one', changed.length > 0,
          'the invalid eggs field differs visibly from the valid flour field',
          `style properties that differ: ${changed.join(', ') || 'none'}`),
        ck('an error banner explains it', banner.exists && banner.inside,
          'an error banner shows inside the recipe card',
          `banner shown: ${banner.exists}, inside the card: ${banner.inside}`),
        ck('the error banner is flagged with a mark', banner.marked,
          'the banner leads with a symbol or has a mark drawn ahead of its text',
          `banner text starts "${banner.text}"`),
        ...await sweep(page, vp),
      ]
    })

  await group(vp, 'field tooltips',
    `choose "dial", then ${vp.touch ? 'tap' : 'point at'} the first field, the leftmost field, and the rightmost field in turn`,
    async () => {
      await selectReciplate(page, 'dial')
      await neutral(page, vp)
      const picks = await page.evaluate(() => {
        const fs = [...document.querySelectorAll('input.recipe-field')]
        fs.forEach((f, i) => { f.dataset.layoutQual = String(i) })
        const byLeft = [...fs].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
        const byRight = [...fs].sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)
        return [...new Set([fs[0], byLeft[0], byRight[0]].map(f => f.dataset.layoutQual))]
      })
      const checks = []
      for (const i of picks) {
        const sel = `input.recipe-field[data-layout-qual="${i}"]`
        if (vp.touch) await poke(page, vp, sel)
        else await page.hover(sel)
        const t = await page.$eval(sel, (el, vw) => {
          const tip = document.getElementById('tooltip')
          const r = tip.getBoundingClientRect()
          const f = el.getBoundingClientRect()
          return { name: window.__probe.nameOf(el), shown: !tip.hidden && r.width > 0,
                   onScreen: r.left >= -0.5 && r.right <= vw + 0.5 && r.top + window.scrollY >= 0,
                   clear: r.bottom <= f.top + 0.5 || r.top >= f.bottom - 0.5,
                   said: tip.textContent, tipSpan: `x=${r.left} to ${r.right}, y=${r.top} to ${r.bottom}` }
        }, vp.width)
        checks.push(
          ck(`the tooltip for ${t.name} shows up`, t.shown && t.said.length > 0,
            'a tooltip with text in it is showing', `showing: ${t.shown}, text: "${t.said}"`),
          ck(`the tooltip for ${t.name} is on screen`, t.onScreen,
            `the tooltip lies between x=0 and x=${vp.width} and below the top of the page`, t.tipSpan),
          ck(`the tooltip for ${t.name} leaves its field uncovered`, t.clear,
            'the tooltip sits entirely above or below its field', t.tipSpan))
      }
      await neutral(page, vp)
      return checks
    })

  await group(vp, 'the help popover',
    `${how} the ? button, read to the end, ${how} the page outside the popover, then ${how} ? twice`,
    async () => {
      await selectReciplate(page, 'crepes')
      await neutral(page, vp)
      await poke(page, vp, '#helpButton')
      const open = await page.evaluate((vw, vh) => {
        const p = document.getElementById('helpPopover')
        const r = p.getBoundingClientRect()
        p.scrollTop = p.scrollHeight
        const last = [...p.querySelectorAll('p, h3, a')].pop().getBoundingClientRect()
        const after = p.getBoundingClientRect()
        p.scrollTop = 0
        return { shown: !p.hidden && r.width > 0,
                 fits: r.left >= -0.5 && r.right <= vw + 0.5 && r.top >= -0.5 && r.bottom <= vh + 0.5,
                 span: `x=${r.left} to ${r.right}, y=${r.top} to ${r.bottom}`,
                 endReachable: last.bottom <= after.bottom + 0.5 && last.bottom <= vh + 0.5,
                 expanded: document.getElementById('helpButton').getAttribute('aria-expanded') }
      }, vp.width, vp.height)
      const swept = await sweep(page, vp, '.help-float')
      // A spot on the page that's outside the popover: the page's top-left corner
      await (vp.touch ? page.touchscreen.tap(4, 4) : page.mouse.click(4, 4))
      await nextFrame(page)
      const closedByOutside = await page.$eval('#helpPopover', el => el.hidden)
      await poke(page, vp, '#helpButton')
      const reopened = await page.$eval('#helpPopover', el => !el.hidden)
      await poke(page, vp, '#helpButton')
      const closedBySecond = await page.$eval('#helpPopover', el => el.hidden)
      await poke(page, vp, '#helpButton')
      await page.keyboard.press('Escape')
      await nextFrame(page)
      const closedByEscape = await page.$eval('#helpPopover', el => el.hidden)
      return [
        ck('the popover opens', open.shown && open.expanded === 'true',
          'the popover is showing and the ? button says it is expanded',
          `showing: ${open.shown}, aria-expanded: ${open.expanded}`),
        ck('the popover fits on the screen', open.fits,
          `the popover lies within the ${vp.width}x${vp.height} screen`, open.span),
        ck('the end of the popover can be read', open.endReachable,
          'scrolling the popover to its end brings its last line onto the screen',
          `last line reachable: ${open.endReachable}`),
        ...during('with the popover open', swept),
        ck(`a ${how} outside closes the popover`, closedByOutside,
          'the popover is hidden', `hidden: ${closedByOutside}`),
        ck(`a second ${how} on ? closes the popover`, reopened && closedBySecond,
          'the popover reopens, then hides', `reopened: ${reopened}, then hidden: ${closedBySecond}`),
        ck('Escape closes the popover', closedByEscape,
          'the popover is hidden', `hidden: ${closedByEscape}`),
      ]
    })

  await group(vp, 'the editor',
    `choose "crepes", ${how} the editor toggle, ${how} the template, type a plain recipe over it, ` +
    `${how} Reciplify, then ${how} the editor toggle again`,
    async () => {
      await selectReciplate(page, 'crepes')
      await neutral(page, vp)
      await poke(page, vp, '#recipeSource > summary')
      const opened = await page.$eval('#recipeTextarea', el => el.checkVisibility())
      const wraps = await page.$eval('#recipeTextarea', el => el.scrollWidth <= el.clientWidth + 1)
      const swept = await sweep(page, vp)
      await poke(page, vp, '#recipeTextarea')
      await page.$eval('#recipeTextarea', el => el.select())
      await page.keyboard.press('Backspace')
      await nextFrame(page)
      const placeholder = await page.$eval('#recipeTextarea', el => ({
        showing: el.value === '' && el.placeholder.length > 0,
        contrast: window.__probe.contrastOn(getComputedStyle(el, '::placeholder').color, el),
      }))
      await page.keyboard.type('Mix 2 eggs and 3 cups flour')
      await nextFrame(page)
      const typed = await page.$eval('#recipeOutput .recipe-rendered', el => el.textContent.trim())
      await poke(page, vp, '#reciplifyButton')
      const fieldCount = (await page.$$('input.recipe-field')).length
      const sweptAfter = await sweep(page, vp)
      await poke(page, vp, '#recipeSource > summary')
      const closed = await page.$eval('#recipeTextarea', el => !el.checkVisibility())
      return [
        ck('the editor opens', opened, 'the template text area is showing', `showing: ${opened}`),
        ck('the template wraps to the editor\'s width', wraps,
          'the template text area has nothing to scroll sideways', `fits its width: ${wraps}`),
        ...during('with the editor open', swept),
        ck('the emptied editor\'s placeholder can be read', placeholder.showing && placeholder.contrast >= K.minContrast,
          `the placeholder shows and contrasts with the text area by at least ${K.minContrast}:1`,
          `showing: ${placeholder.showing}, contrast ${placeholder.contrast.toFixed(2)}:1`),
        ck('typing in the editor updates the recipe', typed === 'Mix 2 eggs and 3 cups flour',
          'the recipe card shows the typed text', `the card shows "${typed}"`),
        ck('Reciplify turns the numbers into fields', fieldCount === 3,
          'the recipe has 3 fields (eggs, flour, and the scale factor)', `it has ${fieldCount}`),
        ...during('after Reciplify', sweptAfter),
        ck('the editor closes', closed, 'the template text area is hidden', `hidden: ${closed}`),
      ]
    })

  await group(vp, 'copying a snapshot',
    `choose "crepes" and ${how} the copy button`,
    async () => {
      await selectReciplate(page, 'crepes')
      await neutral(page, vp)
      // Headless Chrome has no clipboard to write to, so stand in for it. And
      // take the confirmation's measure the moment it appears, from inside
      // the page: it's only up for two seconds, which a busy machine can let
      // slip by before the next question gets asked from out here.
      await page.evaluate((vw, vh) => {
        window.__copied = null
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: text => { window.__copied = text; return Promise.resolve() } },
        })
        window.__confirmation = null
        const n = document.getElementById('notification')
        new MutationObserver(() => {
          const r = n.getBoundingClientRect()
          if (window.__confirmation || !n.checkVisibility() || r.width === 0 || !n.textContent.trim()) return
          const card = document.getElementById('recipeOutput').getBoundingClientRect()
          window.__confirmation = {
            onScreen: r.left >= -0.5 && r.right <= vw + 0.5 && r.bottom > 0 && r.top < vh,
            span: `x=${r.left} to ${r.right}, y=${r.top} to ${r.bottom}`,
            card: [card.left, card.top + window.scrollY, card.width, card.height].join(','),
          }
        }).observe(n, { attributes: true, childList: true, characterData: true, subtree: true })
      }, vp.width, vp.height)
      const cardBefore = await page.$eval('#recipeOutput', el => {
        const r = el.getBoundingClientRect()
        return [r.left, r.top + window.scrollY, r.width, r.height].join(',')
      })
      await poke(page, vp, '#copyButton')
      await nextFrame(page)
      const after = await page.evaluate(() => ({
        copied: window.__copied, expected: scaledRecipeText(),
        // What the page saw when the confirmation appeared (nothing, if it never did)
        ...(window.__confirmation ?? { onScreen: false, span: 'it never appeared', card: 'it never appeared' }),
        shown: window.__confirmation !== null,
      }))
      const swept = await sweep(page, vp)
      await page.evaluate(() => { window.__copied = null })
      await poke(page, vp, '#copyButton')
      const copiedAgain = await page.evaluate(() => window.__copied !== null)
      return [
        ck('the copy button still works while the confirmation shows', copiedAgain,
          `a second ${how} on the copy button copies again`, `copied again: ${copiedAgain}`),
        ck('the snapshot is copied', after.copied !== null && after.copied === after.expected,
          'the clipboard gets the recipe with its current values',
          after.copied === null ? 'nothing was copied' : 'something else was copied'),
        ck('a confirmation shows up where it can be seen', after.shown && after.onScreen,
          'a confirmation with text in it shows on the screen',
          `showing: ${after.shown}, on screen: ${after.onScreen} (${after.span})`),
        ck('the confirmation leaves the recipe where it was', after.card === cardBefore,
          'the recipe card has the same position and size as before',
          `before: ${cardBefore}; after: ${after.card}`),
        ...during('with the confirmation showing', swept),
      ]
    })

  await group(vp, 'the copy button with a broken template',
    'choose "crepes" and note the copy button, then set the template to "Contradiction {1 = z} {2 = z}"',
    async () => {
      await selectReciplate(page, 'crepes')
      await neutral(page, vp)
      const copyButton = () => page.$eval('#copyButton', el =>
        ({ disabled: el.disabled, look: window.__probe.look(el) }))
      const sound = await copyButton()
      await setTemplate(page, 'Contradiction {1 = z} {2 = z}')
      await neutral(page, vp)
      const broken = await copyButton()
      const changed = await page.evaluate((a, b) => window.__probe.lookDiff(a, b), sound.look, broken.look)
      return [
        ck('the copy button is on for a sound template and off for a broken one',
          sound.disabled === false && broken.disabled === true,
          'the copy button is enabled for crepes and disabled for the contradiction',
          `disabled for crepes: ${sound.disabled}; for the contradiction: ${broken.disabled}`),
        ck('a copy button that is off looks different from one that is on', changed.length > 0,
          'the disabled copy button differs visibly from the enabled one',
          `style properties that differ: ${changed.join(', ') || 'none'}`),
      ]
    })

  await group(vp, 'dismissing the headsup',
    `set the template to "Fry 2 eggs." and ${how} the headsup's dismiss button`,
    async () => {
      await setTemplate(page, 'Fry 2 eggs.')
      await neutral(page, vp)
      const showing = await page.$eval('#headsupBanner', el =>
        !el.hidden && el.getBoundingClientRect().height > 0)
      await poke(page, vp, '#headsupDismiss')
      const after = await page.evaluate(() => ({
        hidden: document.getElementById('headsupBanner').hidden,
        recipe: document.querySelector('#recipeOutput .recipe-rendered').textContent.trim(),
      }))
      return [
        ck('a template with no cells gets a headsup', showing,
          'the headsup is showing', `showing: ${showing}`),
        ck(`a ${how} on the dismiss button hides the headsup`, after.hidden,
          'the headsup is hidden', `hidden: ${after.hidden}`),
        ck('dismissing the headsup leaves the recipe alone', after.recipe === 'Fry 2 eggs.',
          'the recipe card still shows the template text', `the card shows "${after.recipe}"`),
      ]
    })

  await group(vp, 'finishing a field with Enter',
    `choose "crepes", ${how} the scale-factor field, type 3 over it, and press Enter`,
    async () => {
      await selectReciplate(page, 'crepes')
      await retype(page, vp, fieldSel('x'), '3')
      await page.keyboard.press('Enter')
      await nextFrame(page)
      const focused = await page.evaluate(sel =>
        document.activeElement === document.querySelector(sel), fieldSel('x'))
      const eggs = await valueOf(page, fieldSel('12x'))
      return [
        ck('Enter lets go of the field', !focused,
          'the scale-factor field no longer has the focus (which is what puts a phone keyboard away)',
          `still focused: ${focused}`),
        ck('the typed value sticks', eggs === '36',
          'the eggs field (12x) shows 36', `the eggs field shows "${eggs}"`),
      ]
    })

  await group(vp, 'typing an expression',
    `choose "crepes", ${how} the eggs field, and type "max(88, 99)" over it`,
    async () => {
      await selectReciplate(page, 'crepes')
      await retype(page, vp, fieldSel('12x'), 'max(88, 99)')
      const typed = await valueOf(page, fieldSel('12x'))
      // Swept with the expression still in the field: letters are wider than
      // digits, and the field has to show all of them
      const swept = await sweep(page, vp)
      await neutral(page, vp)
      const eggs = await valueOf(page, fieldSel('12x'))
      return [
        ck('the field keeps the expression while it has the focus', typed === 'max(88, 99)',
          'the eggs field holds what was typed', `it holds "${typed}"`),
        ...during('with the expression in the field', swept),
        ck('the expression counts as its value', eggs === '99',
          'after leaving the field, the eggs field shows 99', `it shows "${eggs}"`),
      ]
    })

  await group(vp, 'typing more than a field can show',
    `choose "crepes", ${how} the eggs field, and type a sum of sixty 1s over it`,
    async () => {
      await selectReciplate(page, 'crepes')
      const sum = Array(60).fill('1').join('+')
      await retype(page, vp, fieldSel('12x'), sum)
      const typed = await valueOf(page, fieldSel('12x'))
      const x = await valueOf(page, fieldSel('x'))
      // The one invariant that can't hold here: no screen is wide enough
      const swept = (await sweep(page, vp)).filter(c => c.name !== 'every field shows its whole value')
      await neutral(page, vp)
      return [
        ck('the field keeps what was typed', typed === sum,
          'the eggs field holds the whole sum', `it holds ${typed.length} of ${sum.length} characters`),
        ck('the sum counts as a number', Number(x) === 5,
          'the scale factor is 5 (60 eggs over 12)', `the scale factor shows "${x}"`),
        ...during('with the sum in the field', swept),
      ]
    })

  for (const face of TYPEFACES) {
    await group(vp, `set in a ${face} typeface`,
      `show the whole page in the device's ${face} font, then look at "dial", "crepes" scaled by 4.75, and long values`,
      async () => {
        const restyle = await page.addStyleTag({ content: `body, body * { font-family: ${face} !important; }` })
        const checks = []
        await selectReciplate(page, 'dial')
        await neutral(page, vp)
        checks.push(...during('for "dial"', await sweep(page, vp)))
        await selectReciplate(page, 'crepes')
        await retype(page, vp, fieldSel('x'), '4.75')
        await neutral(page, vp)
        checks.push(...during('for "crepes" scaled by 4.75', await sweep(page, vp)))
        await setTemplate(page, STRESS['long values'])
        await neutral(page, vp)
        checks.push(...during('for long values', await sweep(page, vp)))
        await restyle.evaluate(el => { el.textContent = '' })
        return checks
      })
  }

  await group(vp, 'odd values in fields',
    `for every reciplate, set its first, middle, and last fields in turn to one of ${ODD_VALUES.map(v => `"${v}"`).join(', ')}`,
    async () => {
      const keys = await page.evaluate(() => Object.keys(recipeDropdown))
      const checks = []
      for (const key of keys) {
        await selectReciplate(page, key)
        const count = (await page.$$('input.recipe-field')).length
        const picks = [...new Set([0, Math.floor(count / 2), count - 1])].filter(i => i >= 0 && i < count)
        for (const [n, i] of picks.entries()) {
          const value = ODD_VALUES[(n + keys.indexOf(key)) % ODD_VALUES.length]
          // The fields are rebuilt whenever the recipe re-renders, so find the
          // i-th one afresh each time
          const tip = await page.evaluate((i, value) => {
            const field = document.querySelectorAll('input.recipe-field')[i]
            field.value = value
            field.dispatchEvent(new Event('input', { bubbles: true }))
            field.blur()
            return field.dataset.tip
          }, i, value)
          await nextFrame(page)
          checks.push(...during(`"${key}" with {${tip}} set to "${value}"`, await sweep(page, vp)))
        }
      }
      return checks
    })

  if (vp.touch) {
    await group(vp, 'rotating the screen',
      'choose "dial", turn the screen on its side, then turn it back',
      async () => {
        await selectReciplate(page, 'dial')
        await neutral(page, vp)
        const turn = (width, height) => page.setViewport(
          { width, height, deviceScaleFactor: vp.density, isMobile: true, hasTouch: true })
        await turn(vp.height, vp.width)
        await nextFrame(page)
        const onItsSide = await sweep(page, vp, 'body', vp.height)
        await turn(vp.width, vp.height)
        await nextFrame(page)
        const turnedBack = await sweep(page, vp)
        return [...during('on its side', onItsSide), ...during('turned back', turnedBack)]
      })
  }

  if (!vp.touch) {
    await group(vp, 'keyboard focus',
      'choose "crepes", open the editor, focus the copy button, then press Tab fourteen times',
      async () => {
        await selectReciplate(page, 'crepes')
        await page.$eval('#recipeSource', el => { el.open = true })
        await neutral(page, vp)
        // Start from the last control on the page, so the first Tab leaves the
        // page and the next comes back in at the top
        await page.focus('#copyButton')
        await page.evaluate(() => { window.__stops = [] })
        for (let i = 0; i < 14; i++) {
          await page.keyboard.press('Tab')
          await page.evaluate(() => {
            const el = document.activeElement
            // Tabbing past the last control leaves the page (the body has the
            // focus), which isn't a stop
            if (el !== document.body) window.__stops.push({ el, focused: window.__probe.look(el) })
          })
        }
        await neutral(page, vp)
        const stops = await page.evaluate(() => window.__stops.map(s => ({
          name: window.__probe.nameOf(s.el),
          kind: s.el.matches('input.recipe-field') ? 'field' : s.el.tagName.toLowerCase(),
          isPin: s.el.matches('.corner-pin'),
          changed: window.__probe.lookDiff(s.focused, window.__probe.look(s.el)),
        })))
        await page.$eval('#recipeSource', el => { el.open = false })
        const kinds = new Set(stops.map(s => s.kind))
        const wanted = ['button', 'select', 'summary', 'textarea', 'field']
        return [
          ck('Tab reaches every kind of control', wanted.every(k => kinds.has(k)),
            `Tab stops include a ${wanted.join(', a ')}`, `Tab stopped at: ${[...kinds].join(', ')}`),
          ck('Tab goes from field to field without stopping at pins', !stops.some(s => s.isPin),
            'no Tab stop is a pin', `pins among the Tab stops: ${stops.filter(s => s.isPin).length}`),
          ...stops.map(s => ck(`${s.name} shows when it has the focus`, s.changed.length > 0,
            `${s.name} looks different focused than unfocused`,
            `style properties that differ: ${s.changed.join(', ') || 'none'}`)),
        ]
      })

    await group(vp, 'setting a slider from the keyboard',
      'choose "crepes", focus the slider, and press the right arrow key three times',
      async () => {
        await selectReciplate(page, 'crepes')
        await page.focus('input.recipe-slider')
        const before = Number(await valueOf(page, 'input.recipe-slider'))
        for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
        await nextFrame(page)
        const after = Number(await valueOf(page, 'input.recipe-slider'))
        const x = Number(await valueOf(page, fieldSel('x')))
        await neutral(page, vp)
        return [
          ck('arrow keys move the slider', after > before,
            `the slider ends up above where it started (${before})`, `the slider is at ${after}`),
          ck('the scale factor follows the arrow keys', Math.abs(x - after) < 0.01,
            `the scale-factor field shows the slider's value (${after})`, `it shows ${x}`),
        ]
      })

    await group(vp, 'enlarged text',
      `choose "dial" and enlarge all text to ${K.textEnlargePct}%`,
      async () => {
        await selectReciplate(page, 'dial')
        await neutral(page, vp)
        await page.evaluate(pct => { document.documentElement.style.fontSize = pct + '%' }, K.textEnlargePct)
        await nextFrame(page)
        const title = await page.$eval('h1', el => parseFloat(getComputedStyle(el).fontSize))
        const swept = await sweep(page, vp)
        await page.evaluate(() => { document.documentElement.style.fontSize = '' })
        await nextFrame(page)
        const titleNormal = await page.$eval('h1', el => parseFloat(getComputedStyle(el).fontSize))
        return [
          ck('text sizes follow the reader\'s font size', title > titleNormal * 1.5,
            'the title grows when the base font size is enlarged',
            `title is ${title}px enlarged, ${titleNormal}px normally`),
          ...swept,
        ]
      })
  }
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

// Everything the quals do at one screen size
async function visit(browser, vp) {
  console.log(`=== ${vp.name}: ${describeViewport(vp)} ===`)
  const page = await browser.newPage()
  await page.setViewport({ width: vp.width, height: vp.height,
    deviceScaleFactor: vp.density, isMobile: vp.touch, hasTouch: vp.touch })
  // Everything the page throws or logs as an error during the visit
  const thrown = []
  page.on('pageerror', err => thrown.push(String(err && err.message ? err.message : err)))
  page.on('console', msg => thrown.push(...[msg].filter(m => m.type() === 'error').map(m => m.text())))
  await page.goto(BASE_URL)
  await page.waitForSelector('#recipeOutput', { visible: true })
  // Styles in mid-transition would make the looks compared below depend on
  // timing, so transitions and animations finish instantly here
  await page.addStyleTag({ content:
    '*, *::before, *::after { transition: none !important; animation: none !important; }' })
  await page.evaluate(installProbes, K)

  await group(vp, 'page setup', 'load the page', async () => {
    const setup = await page.evaluate(() => ({
      viewport: document.querySelector('meta[name="viewport"]')?.content ?? '',
      coarse: matchMedia('(pointer: coarse)').matches,
    }))
    return [
      ck('the page fits itself to the device', /width=device-width/.test(setup.viewport),
        'the viewport meta tag sets width=device-width', `viewport: "${setup.viewport}"`),
      ck('pinch zoom is left alone', !/user-scalable\s*=\s*(no|0)|maximum-scale/.test(setup.viewport),
        'the viewport meta tag does not disable or limit zooming', `viewport: "${setup.viewport}"`),
      ck('the browser reports the right kind of pointer', setup.coarse === vp.touch,
        `(pointer: coarse) is ${vp.touch} on this screen`, `(pointer: coarse) is ${setup.coarse}`),
    ]
  })

  const keys = await page.evaluate(() => Object.keys(recipeDropdown))
  for (const key of keys) {
    await group(vp, `reciplate "${key}"`, `choose "${key}" from the dropdown`, async () => {
      await selectReciplate(page, key)
      return sweep(page, vp)
    })
    // Reciplates with a scale factor get swept again scaled up, since
    // that changes how long every number is
    if (await page.$(fieldSel('x')) !== null) {
      await group(vp, `reciplate "${key}" scaled`,
        `choose "${key}" from the dropdown and type 2.5 over its x field`, async () => {
          await retype(page, vp, fieldSel('x'), '2.5')
          await neutral(page, vp)
          return sweep(page, vp)
        })
    }
  }
  for (const [name, text] of Object.entries(STRESS)) {
    await group(vp, `stress template "${name}"`,
      `set the template to ${JSON.stringify(text.length > 90 ? text.slice(0, 90) + '…' : text)}`,
      async () => {
        await setTemplate(page, text)
        return sweep(page, vp)
      })
  }
  await interactions(page, vp)

  // Arriving by a direct link renders without any of the clicks above
  const rawcipe = await page.evaluate(text => LZString.compressToEncodedURIComponent(text), STRESS['long values'])
  for (const [what, query] of [['a link to a reciplate', '?recipe=dial'],
                               ['a link to a custom template', `?rawcipe=${rawcipe}`]]) {
    await group(vp, `arriving by ${what}`,
      `open the page at ${query.length > 60 ? query.slice(0, 60) + '…' : query}`, async () => {
        await page.goto(BASE_URL + query)
        await page.waitForSelector('#recipeOutput', { visible: true })
        await page.addStyleTag({ content:
          '*, *::before, *::after { transition: none !important; animation: none !important; }' })
        await page.evaluate(installProbes, K)
        const fields = (await page.$$('input.recipe-field')).length
        return [
          ck('the linked recipe shows up', fields > 0, 'the page shows fields', `it shows ${fields} fields`),
          ...await sweep(page, vp),
        ]
      })
  }

  await group(vp, 'the whole visit', 'do all of the above', async () => [
    ck('nothing on the page threw or logged an error', thrown.length === 0,
      'no uncaught errors and no console errors',
      `${thrown.length} errors, the first: ${thrown[0]}`),
  ])
}

// Every width, not just the eight above: layouts break at the widths nobody
// thought to try, like either side of a breakpoint
async function everyWidth(browser) {
  const vp = { name: 'every-width', width: 1280, height: 800, touch: false, density: 1 }
  console.log(`=== ${vp.name}: 240px to 1280px in 16px steps, plus every pixel from 536 to 552 ===`)
  const page = await browser.newPage()
  await page.setViewport({ width: vp.width, height: vp.height })
  await page.goto(BASE_URL)
  await page.waitForSelector('#recipeOutput', { visible: true })
  await page.addStyleTag({ content:
    '*, *::before, *::after { transition: none !important; animation: none !important; }' })
  await page.evaluate(installProbes, K)
  const widths = [...new Set([
    // from narrower than a folding phone's 280px cover screen on up
    ...Array.from({ length: 66 }, (_, i) => 240 + 16 * i),
    ...Array.from({ length: 17 }, (_, i) => 536 + i),  // around where the card changes shape
  ])].sort((a, b) => a - b)
  for (const key of ['crepes', 'dial']) {
    await selectReciplate(page, key)
    for (const width of widths) {
      await group(vp, `"${key}" at ${width}px`, `choose "${key}" and make the window ${width}px wide`, async () => {
        await page.setViewport({ width, height: vp.height })
        await nextFrame(page)
        return sweep(page, vp, 'body', width)
      })
    }
  }
}

// Run a job in a browser of its own
async function inOwnBrowser(job) {
  const browser = await puppeteer.launch({ headless: 'new' })
  try {
    await job(browser)
  } finally {
    // Killed, not closed: Chrome for Testing sometimes sits idle instead of
    // exiting when asked to close (seen on macOS, with every page already
    // closed), which hung the quals after they'd all run
    browser.process().kill('SIGKILL')
  }
}

async function main() {
  // Each screen size in its own browser, all at once. They don't depend on
  // each other, and a browser gives the keyboard focus to one page at a time,
  // so sharing one would make them wait their turn.
  await Promise.all([
    ...VIEWPORTS.map(vp => inOwnBrowser(browser => visit(browser, vp))),
    inOwnBrowser(everyWidth),
  ])

  return summarize('Layout')
}

// Print the tally of every check reported so far, and say how the run went:
// the exit code, 0 if nothing failed
function summarize(suite) {
  console.log(`\n=== ${suite} Quals Summary ===`)
  console.log(`Passed: ${results.passed}`)
  console.log(`Failed: ${results.failed}`)
  if (results.failed > 0) {
    console.log('Failures by qual:')
    for (const [name, n] of [...results.byQual].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n} x ${name}`)
    }
  }
  return results.failed > 0 ? 1 : 0
}

// The probes, the lists of what to sweep, and the reporting, for the engine
// quals (quals/engine_quals.js), which run the sweep in other browsers
module.exports = { K, VIEWPORTS, STRESS, installProbes, ck, group, during, summarize }

// Run the quals when this file is the script, not when it's require()d.
// process.exit, not exitCode: a browser that had to be killed can leave
// handles open that would keep Node from exiting on its own
if (require.main === module) {
  main().then(code => process.exit(code), err => {
    console.error(err)
    process.exit(1)
  })
}
