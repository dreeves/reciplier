/*
Engine quals (not tests).

The other browser quals all run in Chrome. These run the layout quals' sweep,
plus the main things a person does on the page, in the two other browser
engines: WebKit (Safari's, and every browser's on an iPhone) and Gecko
(Firefox's). "Engine" (jargon): the part of a browser that lays out and runs
a page. The three engines disagree about plenty, form controls most of all,
so passing in one says little about the others.

The sweep and its thresholds are the layout quals' own (see
quals/layout_quals.js), so nothing here pins wording, fonts, or positions
either. The things a person does are done with Playwright, since Puppeteer
(which the other quals use) can't drive WebKit.

Setup, once per machine: npx playwright install webkit firefox

Usage:
  npm run quals:engines
*/

const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const playwright = require('playwright')
const { K, VIEWPORTS, STRESS, SLIDES, installProbes, ck, group, during, summarize,
        slideXs, slideChecks, stayedLong, readable } = require('./layout_quals.js')

const ENGINES = ['webkit', 'firefox']

// Serve the working tree over HTTP, the way the real site is served. A page
// opened from a file has no origin, which makes WebKit refuse to fetch the
// manifest and log an error about it.
const ROOT = path.resolve(__dirname, '..')
const CONTENT_TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
}
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://localhost').pathname))
  const found = file.startsWith(ROOT) && fs.existsSync(file) && fs.statSync(file).isFile()
  res.writeHead(found ? 200 : 404, { 'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream' })
  found ? fs.createReadStream(file).pipe(res) : res.end()
})

const NO_MOTION = '*, *::before, *::after { transition: none !important; animation: none !important; }'
const fieldSel = label => `input.recipe-field[data-label="${label}"]`

// Everything the quals do in one engine at one screen size
async function visit(engine, vp, baseUrl) {
  // The name the reports go under, e.g. "webkit phone-390"
  const at = { ...vp, name: `${engine} ${vp.name}` }
  const browser = await playwright[engine].launch()
  console.log(`=== ${at.name} (${engine} ${browser.version()}) ===`)
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.density, hasTouch: vp.touch,
    // Playwright's Firefox has no phone mode; it still gets the touch screen
    ...(engine === 'firefox' ? {} : { isMobile: vp.touch }),
  })
  const page = await context.newPage()
  // Everything the page throws, logs as an error, or fails to fetch
  const thrown = []
  page.on('pageerror', err => thrown.push(err.message))
  page.on('console', msg => thrown.push(...[msg].filter(m => m.type() === 'error').map(m => m.text())))
  page.on('requestfailed', req => thrown.push(`request failed: ${req.url()} (${req.failure()?.errorText})`))
  await page.goto(baseUrl)
  await page.waitForSelector('#recipeOutput', { state: 'visible' })
  // As in the layout quals: styles in mid-transition would make looks depend
  // on timing
  await page.addStyleTag({ content: NO_MOTION })
  await page.evaluate(installProbes, K)

  const nextFrame = () => page.evaluate(() => new Promise(requestAnimationFrame))
  // Whether the engine itself takes this for a touch screen decides how big
  // it draws slider thumbs, so that's what the sweep's tap checks go by
  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches)
  const sweep = () => page.evaluate(opts => window.__probe.sweep(opts),
    { touch: coarse, within: 'body', vw: vp.width })
  const how = vp.touch ? 'tap' : 'click'
  const poke = selector => vp.touch ? page.tap(selector) : page.click(selector)
  const setTemplate = async text => {
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, text)
    await nextFrame()
  }
  const choose = async key => {
    await page.selectOption('#recipeSelect', key)
    await nextFrame()
  }
  // Park the pointer and the focus somewhere neutral so no control is hovered
  // or focused (as neutral() does in the layout quals): a field that's hovered
  // shows its pin, and on a touch screen the hover stays wherever the last tap
  // was, whatever has since moved under it
  const neutral = async () => {
    await page.evaluate(() => document.activeElement && document.activeElement.blur())
    await (vp.touch ? page.tap('h1') : page.mouse.move(1, 1))
    await nextFrame()
  }
  // Drag the first slider on the page through some stops by mouse, noting the
  // moment before the press, every moment while it's held, and the moment
  // after it's let go (as slide() does in the layout quals)
  const slide = async stops => {
    const slider = page.locator('input.recipe-slider').first()
    const s = await slider.evaluate(el => {
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
      const r = el.getBoundingClientRect()
      return { left: r.left, y: r.top + r.height / 2, width: r.width }
    })
    const moment = () => slider.evaluate(el => window.__probe.slideMoment(el))
    const before = await moment()
    const held = []
    const [x0, ...xs] = slideXs(stops, s.left, s.width)
    await page.mouse.move(x0, s.y)
    await page.mouse.down()
    await nextFrame()
    held.push(await moment())
    for (const x of xs) {
      await page.mouse.move(x, s.y)
      await nextFrame()
      held.push(await moment())
    }
    await page.mouse.up()
    await nextFrame()
    return { before, held, after: await moment() }
  }

  const keys = await page.evaluate(() => Object.keys(recipeDropdown))
  for (const key of keys) {
    await group(at, `reciplate "${key}"`, `choose "${key}" from the dropdown`, async () => {
      await choose(key)
      const loaded = await page.evaluate(k =>
        document.getElementById('recipeTextarea').value === reciplates[k], key)
      return [
        ck('choosing a reciplate loads its template', loaded,
          'the template text area holds the chosen reciplate', `holds it: ${loaded}`),
        ...await sweep(),
      ]
    })
  }
  for (const [name, text] of Object.entries(STRESS)) {
    await group(at, `stress template "${name}"`,
      `set the template to ${JSON.stringify(text.length > 90 ? text.slice(0, 90) + '…' : text)}`,
      async () => {
        await setTemplate(text)
        return sweep()
      })
  }

  await group(at, 'editing a field',
    `choose "crepes", ${how} the scale-factor field, and type 2.5 over it`,
    async () => {
      await choose('crepes')
      await poke(fieldSel('x'))
      // Asked right away: the tooltip takes itself down after a couple of seconds
      const tip = await page.evaluate(() => {
        const t = document.getElementById('tooltip')
        return { shown: !t.hidden, text: t.textContent }
      })
      await page.$eval(fieldSel('x'), el => el.select())
      await page.keyboard.type('2.5')
      await nextFrame()
      const eggs = await page.inputValue(fieldSel('12x'))
      const ring = await page.$eval(fieldSel('x'), el => {
        const cs = getComputedStyle(el)
        return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) }
      })
      return [
        ck('the other fields follow', eggs === '30',
          'the eggs field (12x) shows 30', `the eggs field shows "${eggs}"`),
        ck('the field shows its tooltip', tip.shown && tip.text.length > 0,
          'a tooltip with text in it is showing', `showing: ${tip.shown}, text: "${tip.text}"`),
        ck('the field shows it has the focus', ring.style !== 'none' && ring.width > 0,
          'the focused field has an outline', `outline: ${ring.style} ${ring.width}px`),
        ...during('with the field focused', await sweep()),
      ]
    })

  await group(at, 'pegging a field with its pin',
    `with the scale-factor field focused, ${how} its pin`,
    async () => {
      const pinOf = () => page.evaluateHandle(sel =>
        document.querySelector(sel).closest('.field-wrapper').querySelector('.corner-pin'), fieldSel('x'))
      const pin = await (await pinOf()).evaluate(el =>
        ({ opacity: parseFloat(getComputedStyle(el).opacity), text: el.textContent.trim() }))
      const handle = (await pinOf()).asElement()
      await (vp.touch ? handle.tap() : handle.click())
      await nextFrame()
      const pegged = await page.$eval(fieldSel('x'), el => el.classList.contains('pegged'))
      const blues = await page.evaluate(([a, b]) => ({
        pegged: window.__probe.bluesOf(document.querySelector(a)),
        unpegged: window.__probe.bluesOf(document.querySelector(b)),
      }), [fieldSel('x'), fieldSel('3x')])
      return [
        ck('the pin shows for the focused field, with its mark', pin.opacity > 0.3 && pin.text.length > 0,
          'the pin is visible and has a mark on it', `opacity ${pin.opacity}, mark "${pin.text}"`),
        ck('the pin pegs the field', pegged === true,
          'the scale-factor field is pegged', `pegged: ${pegged}`),
        ck('a pegged field is blue and an unpegged one is not',
          blues.pegged.length > 0 && blues.unpegged.length === 0,
          'the pegged scale-factor field has blue in it and the unpegged flour field has none',
          `blue parts of the pegged field: ${blues.pegged.join(', ') || 'none'}; ` +
          `of the unpegged one: ${blues.unpegged.join(', ') || 'none'}`),
      ]
    })

  await group(at, 'the slider',
    'choose "crepes", focus the slider, press the right arrow key three times' +
    (vp.touch ? '' : ', then drag from the middle of the track to three quarters'),
    async () => {
      await choose('crepes')
      await page.focus('input.recipe-slider')
      const before = Number(await page.inputValue('input.recipe-slider'))
      for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
      await nextFrame()
      const afterKeys = Number(await page.inputValue('input.recipe-slider'))
      const fill = await page.$eval('input.recipe-slider', el => el.style.background)
      const checks = [
        ck('arrow keys move the slider', afterKeys > before,
          `the slider ends up above where it started (${before})`, `the slider is at ${afterKeys}`),
        ck('the slider paints how far along it is', fill.includes('gradient'),
          'the slider has its fill painted on', `its inline background is "${fill.slice(0, 80)}"`),
      ]
      // Playwright has taps but no touch drags, so the drag is by mouse only
      if (!vp.touch) {
        const s = await page.$eval('input.recipe-slider', el => {
          el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
          const r = el.getBoundingClientRect()
          return { left: r.left, y: r.top + r.height / 2, width: r.width, mid: (Number(el.min) + Number(el.max)) / 2 }
        })
        await page.mouse.move(s.left + s.width * 0.5, s.y)
        await page.mouse.down()
        await page.mouse.move(s.left + s.width * 0.75, s.y, { steps: 8 })
        await page.mouse.up()
        await nextFrame()
        const dragged = Number(await page.inputValue('input.recipe-slider'))
        const x = Number(await page.inputValue(fieldSel('x')))
        checks.push(
          ck('the slider follows the drag', dragged > s.mid,
            `the slider ends up past its midpoint (${s.mid})`, `the slider is at ${dragged}`),
          ck('the scale factor follows the slider', Math.abs(x - dragged) < 0.01,
            `the scale-factor field shows the slider's value (${dragged})`, `it shows ${x}`))
      }
      return checks
    })

  // By mouse only, for the same reason as above
  if (!vp.touch) {
    for (const [name, { stops, told }] of Object.entries(SLIDES)) {
      await group(at, `holding a slider that makes numbers long (${name})`,
        'set the template to one where every number is 0 until the slider moves and long from then on, ' +
        `then, on its slider, ${told}`,
        async () => {
          await setTemplate(STRESS['numbers that stay long'])
          const slid = await slide(stops)
          await neutral()
          return [...slideChecks(slid), stayedLong(slid),
                  ...during('once the slider is let go', await sweep())]
        })
    }
  }

  await group(at, 'making numbers long from the keyboard',
    'set the template to one where every number is 0 until the slider moves and long from then on, ' +
    'focus its slider, and press the right arrow key',
    async () => {
      await setTemplate(STRESS['numbers that stay long'])
      const moment = () => page.$eval('input.recipe-slider', el => window.__probe.slideMoment(el))
      const before = await moment()
      await page.focus('input.recipe-slider')
      await page.keyboard.press('ArrowRight')
      await nextFrame()
      const after = await moment()
      await neutral()
      return [stayedLong({ before, after }), readable(after, 'as soon as the key is pressed'),
              ...during('after the key press', await sweep())]
    })

  await group(at, 'the editor',
    `${how} the editor toggle, put a plain recipe in the template, and ${how} Reciplify`,
    async () => {
      await poke('#recipeSource > summary')
      await nextFrame()
      const opened = await page.isVisible('#recipeTextarea')
      const swept = await sweep()
      await page.fill('#recipeTextarea', 'Mix 2 eggs and 3 cups flour')
      await nextFrame()
      await poke('#reciplifyButton')
      await nextFrame()
      const fields = await page.locator('input.recipe-field').count()
      await poke('#recipeSource > summary')
      return [
        ck('the editor opens', opened, 'the template text area is showing', `showing: ${opened}`),
        ...during('with the editor open', swept),
        ck('Reciplify turns the numbers into fields', fields === 3,
          'the recipe has 3 fields (eggs, flour, and the scale factor)', `it has ${fields}`),
      ]
    })

  await group(at, 'the help popover',
    `choose "crepes", ${how} the ? button, then press Escape`,
    async () => {
      await choose('crepes')
      await poke('#helpButton')
      await nextFrame()
      const open = await page.$eval('#helpPopover', (el, [vw, vh]) => {
        const r = el.getBoundingClientRect()
        return { shown: !el.hidden && r.width > 0,
                 fits: r.left >= -0.5 && r.right <= vw + 0.5 && r.top >= -0.5 && r.bottom <= vh + 0.5,
                 span: `x=${r.left} to ${r.right}, y=${r.top} to ${r.bottom}` }
      }, [vp.width, vp.height])
      await page.keyboard.press('Escape')
      await nextFrame()
      const closed = await page.$eval('#helpPopover', el => el.hidden)
      return [
        ck('the popover opens', open.shown, 'the popover is showing', `showing: ${open.shown}`),
        ck('the popover fits on the screen', open.fits,
          `the popover lies within the ${vp.width}x${vp.height} screen`, open.span),
        ck('Escape closes the popover', closed, 'the popover is hidden', `hidden: ${closed}`),
      ]
    })

  await group(at, 'copying a snapshot',
    `${how} the copy button`,
    async () => {
      // A stand-in clipboard: a real one needs permissions these browsers
      // don't grant a script. And the page itself notes the confirmation
      // appearing: it's only up for two seconds, which a busy machine can let
      // slip by before the next question gets asked from out here.
      await page.evaluate(() => {
        window.__copied = null
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: { writeText: text => { window.__copied = text; return Promise.resolve() } },
        })
        window.__confirmed = false
        const n = document.getElementById('notification')
        new MutationObserver(() => {
          window.__confirmed = window.__confirmed || (n.checkVisibility() && n.textContent.trim().length > 0)
        }).observe(n, { attributes: true, childList: true, characterData: true, subtree: true })
      })
      await poke('#copyButton')
      await nextFrame()
      const after = await page.evaluate(() => ({
        copied: window.__copied !== null && window.__copied === scaledRecipeText(),
        confirmed: window.__confirmed,
      }))
      return [
        ck('the snapshot is copied', after.copied,
          'the clipboard gets the recipe with its current values', `copied it: ${after.copied}`),
        ck('a confirmation shows up', after.confirmed,
          'the confirmation is showing', `showing: ${after.confirmed}`),
      ]
    })

  await group(at, 'a template with a contradiction',
    'set the template to one with a pegged field, a slider, and a contradiction',
    async () => {
      await setTemplate('Pegged {a = 3} and free {b : 4} make {a + b}\n\n' +
        'Slider {.1 <= x <= 10} with {x : 1} and {2x} eggs\n\nContradiction: {1 = z} {2 = z}')
      return sweep()
    })

  await group(at, 'the whole visit', 'do all of the above', async () => [
    ck('nothing on the page threw, logged an error, or failed to load', thrown.length === 0,
      'no uncaught errors, no console errors, and no failed requests',
      `${thrown.length} of them, the first: ${thrown[0]}`),
  ])
  await browser.close()
}

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const baseUrl = `http://127.0.0.1:${server.address().port}/index.html`
  // Every engine at every screen size, all at once, each in a browser of its
  // own. (Sharing one browser per engine is lighter, but Firefox then ignores
  // a mouse drag on a slider in every window but one.)
  await Promise.all(ENGINES.flatMap(engine => VIEWPORTS.map(vp => visit(engine, vp, baseUrl))))
  return summarize('Engine')
}

main().then(code => process.exit(code), err => {
  console.error(err)
  process.exit(1)
})
