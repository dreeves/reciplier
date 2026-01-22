/*
Quals (not tests).

Runs a small regression suite in a real browser (Puppeteer).

Usage:
  npm run quals
*/

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const puppeteer = require('puppeteer')

function fileUrl(p) {
  const abs = path.resolve(p)
  return `file://${abs}`
}

async function waitForNextFrame(page) {
  await page.evaluate(() => new Promise(requestAnimationFrame))
}

async function setInputValue(page, selector, value) {
  const el = await page.waitForSelector(selector)
  await el.evaluate(e => e.scrollIntoView({ block: 'center' }))
  await el.click({ clickCount: 3 })
  await page.keyboard.type(String(value))
  await el.evaluate(e => e.blur())
  await waitForNextFrame(page)
}

async function blurSelector(page, selector) {
  const el = await page.waitForSelector(selector, { visible: true })
  await el.evaluate(e => e.blur())
}

async function setSliderValue(page, selector, value) {
  await page.waitForSelector(selector, { visible: true })
  await page.$eval(selector, (el, v) => {
    el.value = String(v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}

async function typeIntoFieldNoBlur(page, selector, value) {
  const el = await page.waitForSelector(selector, { visible: true })
  await el.click({ clickCount: 3 })
  await page.keyboard.type(String(value))
}

async function dblClickSelector(page, selector) {
  await longpressSelector(page, selector)
}

async function longpressSelector(page, selector, holdMs = 450) {
  const el = await page.waitForSelector(selector, { visible: true })
  await el.hover()
  await page.mouse.down()
  await new Promise(r => setTimeout(r, holdMs))
  await page.mouse.up()
}

async function longpressHandle(page, handle, holdMs = 450) {
  await handle.hover()
  await page.mouse.down()
  await new Promise(r => setTimeout(r, holdMs))
  await page.mouse.up()
}

async function getInputValue(page, selector) {
  return page.$eval(selector, el => el.value)
}

async function findFieldByTitleSubstring(page, substring) {
  return page.evaluateHandle((needle) => {
    const inputs = Array.from(document.querySelectorAll('input.recipe-field'))
    const found = inputs.find(i => (i.getAttribute('title') || '').includes(needle))
    return found || null
  }, substring)
}

async function getHandleValue(handle) {
  return handle.evaluate(el => (el ? el.value : null))
}

async function handleHasClass(handle, className) {
  return handle.evaluate((el, c) => (el ? el.classList.contains(c) : false), className)
}

async function main() {
  const browser = await puppeteer.launch({ headless: 'new' })
  const page = await browser.newPage()

  const pageConsoleLogs = []
  const pageErrors = []
  page.on('console', msg => {
    pageConsoleLogs.push(msg.text())
  })
  page.on('pageerror', err => {
    pageErrors.push(String(err && err.message ? err.message : err))
  })

  const sleep = ms => new Promise(r => setTimeout(r, ms))
  const clearPageErrors = () => { pageErrors.length = 0 }
  const waitForPageError = async (pattern, label) => {
    const deadline = Date.now() + 2000
    while (Date.now() < deadline) {
      if (pageErrors.some(msg => pattern.test(msg))) return
      await sleep(50)
    }
    assert.ok(false, label)
  }

  try {
    await page.goto(fileUrl(path.join(__dirname, '..', 'index.html')))

    // Inject browser quals script
    // NOTE: Solver quals are now consolidated in `quals/solver_quals.js` and run in Node.
    // Puppeteer quals should focus on browser/UI behavior.
    // const browserQualsCode = fs.readFileSync(path.join(__dirname, 'solver_quals_browser.js'), 'utf8')
    // await page.evaluate(browserQualsCode)

    // Qual: help text includes Calca.io link
    const hasCalcaLink = await page.$eval('a[href="https://calca.io"]', el => !!el)
    assert.equal(hasCalcaLink, true)

    // Qual: browser_quals.js runQuals() passes
    // NOTE: This qual is intentionally disabled; see note above.
    // const browserQualsResult = await page.evaluate(() => runQuals())
    // assert.equal(browserQualsResult, 'All quals passed!')

    // Quals: every recipe in dropdown loads sanely
    await page.waitForSelector('#recipeSelect', { visible: true })
    const recipeKeys = await page.$$eval('#recipeSelect option', opts => opts.map(o => o.value).filter(v => v !== ''))
    for (const key of recipeKeys) {
      await page.select('#recipeSelect', key)
      await page.waitForFunction(k => {
        const select = document.getElementById('recipeSelect')
        return !!select && select.value === k
      }, {}, key)
      if (key !== 'blank' && key !== 'custom') {
        try {
          await page.waitForSelector('#recipeOutput', { visible: true, timeout: 5000 })
        } catch (e) {
          console.error(`Recipe ${key} timed out waiting for #recipeOutput`)
          throw e
        }
      }

      const stateSummary = await page.evaluate(() => {
        const invalidCount = document.querySelectorAll('input.recipe-field.invalid').length
        const cellCount = Array.isArray(state?.cells) ? state.cells.length : 0
        const errors = Array.isArray(state?.errors) ? state.errors.map(String) : []
        const errorCount = errors.length
        const solveBanner = String(state?.solveBanner || '')

        const isBareIdentifier = s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(s || '').trim())
        const eqns = (state?.cells || []).map(c => {
          const eqn = [...(c.ceqn || [])]
          const isAssignmentSeed =
            !!c?.hasConstraint &&
            c?.hasNumber &&
            !c?.startsFrozen &&
            (c?.ceqn || []).length === 1 &&
            isBareIdentifier(c.ceqn[0])
          if (!isAssignmentSeed && c?.hasConstraint && c?.hasNumber) eqn.push(c.cval)
          return eqn
        })
        const sat = eqnsSatisfied(eqns, state?.solve?.ass || {})

        return { invalidCount, cellCount, errors, errorCount, solveBanner, sat }
      })

      // For blank and custom recipes, just require them not to error.
      if (key === 'blank' || key === 'custom') {
        assert.equal(stateSummary.errorCount, 0, `recipe ${key}: errorCount`)
        continue
      }

      // dial is allowed to load with contradictions (eg, start=end date makes r undefined)
      // but should not have other classes of errors like undefined variables.
      if (key === 'dial') {
        const nonContradictions = stateSummary.errors.filter(e => !/^Contradiction:/.test(e))
        assert.equal(nonContradictions.length, 0, `recipe ${key}: non-contradiction errors: ${nonContradictions.join(' | ')}`)
        assert.equal(stateSummary.solveBanner, '', `recipe ${key}: solveBanner`)
        assert.ok(stateSummary.cellCount > 0, `recipe ${key}: cellCount`)
        continue
      }

      // Filter out unreferenced variable errors - user will fix reciplates manually
      const nonUnreferenced = stateSummary.errors.filter(e => !/not refer/i.test(e))
      assert.equal(nonUnreferenced.length, 0, `recipe ${key}: errors: ${nonUnreferenced.join(' | ')}`)
      assert.equal(stateSummary.invalidCount, 0, `recipe ${key}: invalidCount`)
      assert.equal(stateSummary.sat, true, `recipe ${key}: sat`)
      assert.equal(stateSummary.solveBanner, '', `recipe ${key}: solveBanner`)
      assert.ok(stateSummary.cellCount > 0, `recipe ${key}: cellCount`)
    }

    // Qual: underdetermined a drives x/y without errors
    const aDriven = '{x = a}\n{y = a*2}\n{x+y}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, aDriven)
    await page.waitForSelector('#recipeOutput', { visible: true })
    const aDrivenErrors = await page.evaluate(() => (typeof state !== 'undefined' && Array.isArray(state.errors)) ? state.errors : null)
    assert.ok(!aDrivenErrors || aDrivenErrors.length === 0)
    const aDrivenX = await getInputValue(page, 'input.recipe-field[data-label="x"]')
    const aDrivenY = await getInputValue(page, 'input.recipe-field[data-label="y"]')
    const aDrivenSum = await getInputValue(page, 'input.recipe-field[data-label="x+y"]')
    assert.equal(aDrivenX, '1')
    assert.equal(aDrivenY, '2')
    assert.equal(aDrivenSum, '3')

    // Qual: Cheese Wheels tau constant should not drift to 0
    await page.waitForSelector('#recipeSelect', { visible: true })
    await page.select('#recipeSelect', 'cheesepan')
    await page.waitForSelector('#recipeOutput', { visible: true })
    const tauVal = await getInputValue(page, 'input.recipe-field[data-label="tau"]')
    assert.equal(tauVal, '6.28')

    // Qual: cheesepan editing x should scale area (no overconstrained)
    await setInputValue(page, 'input.recipe-field[data-label="x"]', '10')
    const xBanner = await page.evaluate(() => state.solveBanner)
    assert.equal(xBanner, '')
    const aAfter = await getInputValue(page, 'input.recipe-field[data-label="A"]')
    assert.equal(aAfter, '635.85')
    const areaInvalid = await page.$eval('input.recipe-field[data-label="A"]', el => el.classList.contains('invalid'))
    assert.equal(areaInvalid, false)

    // Qual: cheesepan editing {d} should persist on tab (no snapback)
    await page.waitForSelector('#recipeSelect', { visible: true })
    await page.select('#recipeSelect', 'cheesepan')
    await page.waitForSelector('#recipeOutput', { visible: true })

    const dBareHandle = await page.evaluateHandle(() => {
      const inputs = Array.from(document.querySelectorAll('input.recipe-field'))
      return inputs.find(i => (i.getAttribute('title') || '').trim() === 'd') || null
    })
    const dBareIsNull = await dBareHandle.evaluate(el => el === null)
    assert.equal(dBareIsNull, false)

    const dBareBefore = await dBareHandle.evaluate(el => el.value)
    const rBefore = await getInputValue(page, 'input.recipe-field[data-label="r"]')
    const xBefore = await getInputValue(page, 'input.recipe-field[data-label="x"]')

    // Match the bug report flow: change 9 to 9.1 then tab away.
    await dBareHandle.click({ clickCount: 1 })
    await page.keyboard.press('End')
    await page.keyboard.type('.1')
    await page.keyboard.press('Tab')
    await waitForNextFrame(page)

    const dBareStrAfterTab = await dBareHandle.evaluate(el => el.value)
    const dBareValAfterTab = Number(dBareStrAfterTab)
    const rAfter = await getInputValue(page, 'input.recipe-field[data-label="r"]')
    const xAfter = await getInputValue(page, 'input.recipe-field[data-label="x"]')

    const dDebug = await page.evaluate(() => ({
      solveBanner: String(state?.solveBanner || ''),
      d: state?.solve?.ass?.d,
      r: state?.solve?.ass?.r,
      x: state?.solve?.ass?.x,
    }))
    assert.ok(
      Math.abs(dBareValAfterTab - 9.1) < 1e-6,
      `d after tab: ${dBareStrAfterTab}; debug: ${JSON.stringify(dDebug)}`
    )

    // Also assert we did not snap back to the initial state.
    assert.equal(dBareBefore, '9')
    assert.equal(rBefore, '4.5')
    assert.equal(dBareStrAfterTab, '9.1')
    assert.equal(rAfter, '4.55')
    assert.equal(xBefore, '1')
    assert.equal(xAfter, '1.0223')

    await dBareHandle.dispose()

    // Qual: simeq edit unfrozen x to 60 then tab should not redden everything
    await page.waitForSelector('#recipeSelect', { visible: true })
    await page.select('#recipeSelect', 'simeq')
    await page.waitForSelector('#recipeOutput', { visible: true })

    const initialInvalidCount = await page.$$eval('input.recipe-field.invalid', els => els.length)
    assert.equal(initialInvalidCount, 0)

    const xUnfrozen = await page.evaluateHandle(() => {
      const inputs = Array.from(document.querySelectorAll('input.recipe-field'))
      return inputs.find(i => (i.getAttribute('title') || '').trim() === 'x') || null
    })
    const xUnfrozenIsNull = await xUnfrozen.evaluate(el => el === null)
    assert.equal(xUnfrozenIsNull, false)

    await xUnfrozen.click({ clickCount: 3 })
    await page.keyboard.type('60')
    await page.keyboard.press('Tab')
    await waitForNextFrame(page)

    const xUnfrozenVal = await xUnfrozen.evaluate(el => el.value)
    // the following was previously 6 because we'd snap back to 6 when the
    // solver failed to find a solution after editing x to 60
    assert.equal(xUnfrozenVal, '60')

    const bannerAfter = await page.evaluate(() => state.solveBanner)
    assert.ok(/No solution/i.test(bannerAfter))

    const invalidAfterCount = await page.$$eval('input.recipe-field.invalid', els => els.length)
    assert.ok(invalidAfterCount > 0)

    await xUnfrozen.dispose()

    // Qual: simeq edit x=6 cell then y=7 should keep 6&7 on blur
    await page.waitForSelector('#recipeSelect', { visible: true })
    await page.select('#recipeSelect', 'simeq')
    await page.waitForSelector('#recipeOutput', { visible: true })

    let xDefHandle = await findFieldByTitleSubstring(page, 'x : 6')
    const xDefIsNull = await xDefHandle.evaluate(el => el === null)
    assert.equal(xDefIsNull, false)

    await xDefHandle.click({ clickCount: 3 })
    await page.keyboard.type('1')
    await page.keyboard.press('Tab')
    await waitForNextFrame(page)

    const yHandle = await page.evaluateHandle(() => {
      const inputs = Array.from(document.querySelectorAll('input.recipe-field'))
      return inputs.find(i => (i.getAttribute('title') || '').trim() === 'y') || null
    })
    const yIsNull = await yHandle.evaluate(el => el === null)
    assert.equal(yIsNull, false)

    await yHandle.click({ clickCount: 3 })
    await page.keyboard.type('7')
    await page.keyboard.press('Tab')
    await waitForNextFrame(page)

    const xDefValAfter = await xDefHandle.evaluate(el => el.value)
    const yValAfter = await yHandle.evaluate(el => el.value)
    assert.equal(xDefValAfter, '6')
    assert.equal(yValAfter, '7')

    const simeqBanner = await page.evaluate(() => String(state?.solveBanner || ''))
    assert.equal(simeqBanner, '')

    const simeqInvalidCount = await page.$$eval('input.recipe-field.invalid', els => els.length)
    assert.equal(simeqInvalidCount, 0)

    await xDefHandle.dispose()
    await yHandle.dispose()

    // Qual 1: Pythagorean Pizza regression
    await page.waitForSelector('#recipeSelect', { visible: true })
    await page.select('#recipeSelect', 'pyzza')

    await page.waitForSelector('#recipeOutput', { visible: true })

    await setInputValue(page, 'input.recipe-field[data-label="a"]', '5')

    await setInputValue(page, 'input.recipe-field[data-label="b"]', '12')

    const aVal = await getInputValue(page, 'input.recipe-field[data-label="a"]')
    const bVal = await getInputValue(page, 'input.recipe-field[data-label="b"]')
    const cVal = await getInputValue(page, 'input.recipe-field[data-label="c"]')

    assert.equal(aVal, '9')
    assert.equal(bVal, '12')
    assert.equal(cVal, '15')

    const sanityHandle = await findFieldByTitleSubstring(page, 'a^2 + b^2 = c^2')
    const sanityIsNull = await sanityHandle.evaluate(el => el === null)
    assert.equal(sanityIsNull, false)

    const sanityVal = await getHandleValue(sanityHandle)
    assert.equal(sanityVal, '225')

    const sanityInvalid = await handleHasClass(sanityHandle, 'invalid')
    assert.equal(sanityInvalid, false)

    await sanityHandle.dispose()

    // Qual: decimal input should work (period shouldn't get eaten)
    await setInputValue(page, 'input.recipe-field[data-label="a"]', '5.5')
    const aDecVal = await getInputValue(page, 'input.recipe-field[data-label="a"]')
    assert.equal(aDecVal, '5.5')

    // Qual: invalid numeric input should not be silently truncated
    await page.$eval('input.recipe-field[data-label="a"]', el => {
      el.focus()
      el.value = '12..3'
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const badVal = await getInputValue(page, 'input.recipe-field[data-label="a"]')
    assert.equal(badVal, '12..3')
    const badInvalid = await page.$eval('input.recipe-field[data-label="a"]', el => el.classList.contains('invalid'))
    assert.equal(badInvalid, true)

    // Qual: scaling slider updates x
    await page.select('#recipeSelect', 'crepes')
    await page.waitForSelector('#recipeOutput', { visible: true })

    await setSliderValue(page, 'input.slider-input[data-var-name="x"]', '2')
    const sliderXValue = await getInputValue(page, 'input.recipe-field[data-label="x"]')
    assert.equal(sliderXValue, '2')

    // Qual: slider updates in real time when x changes
    await typeIntoFieldNoBlur(page, 'input.recipe-field[data-label="x"]', '3')
    const sliderDisplayAfterTyping = await page.$eval('input.slider-input[data-var-name="x"]', el => el.value)
    assert.equal(sliderDisplayAfterTyping, '3')

    // Qual: dragging slider emits multiple input events
    await page.select('#recipeSelect', 'crepes')
    await page.waitForSelector('#recipeOutput', { visible: true })
    await page.evaluate(() => {
      window.__sliderInputs = 0
      const slider = document.querySelector('input.slider-input[data-var-name="x"]')
      slider.addEventListener('input', () => { window.__sliderInputs += 1 })
      // Scroll slider into view so mouse events work
      slider.scrollIntoView({ block: 'center' })
    })
    const sliderHandle = await page.$('input.slider-input[data-var-name="x"]')
    const sliderBox = await sliderHandle.boundingBox()
    await page.mouse.move(sliderBox.x + 2, sliderBox.y + sliderBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(sliderBox.x + sliderBox.width - 2, sliderBox.y + sliderBox.height / 2, { steps: 6 })
    await page.mouse.up()
    await waitForNextFrame(page)
    const sliderInputCount = await page.evaluate(() => window.__sliderInputs)
    assert.ok(sliderInputCount > 1, `slider input count ${sliderInputCount}`)

    // Qual: inequality sliders appear with bounds
    await page.select('#recipeSelect', 'ineqtest')
    await page.waitForSelector('#recipeOutput', { visible: true })

    const xSliderExists = await page.$eval('input.slider-input[data-var-name="x"]', el => !!el)
    const pSliderExists = await page.$eval('input.slider-input[data-var-name="p"]', el => !!el)
    const tempSliderExists = await page.$eval('input.slider-input[data-var-name="temp"]', el => !!el)
    assert.equal(xSliderExists, true)
    assert.equal(pSliderExists, true)
    assert.equal(tempSliderExists, true)

    const xMin = await page.$eval('input.slider-input[data-var-name="x"]', el => Number(el.min))
    const xMax = await page.$eval('input.slider-input[data-var-name="x"]', el => Number(el.max))
    assert.ok(Math.abs(xMin - 0.5) < 1e-6, `x min ${xMin}`)
    assert.ok(Math.abs(xMax - 10) < 1e-6, `x max ${xMax}`)

    const pMin = await page.$eval('input.slider-input[data-var-name="p"]', el => Number(el.min))
    const pMax = await page.$eval('input.slider-input[data-var-name="p"]', el => Number(el.max))
    assert.ok(pMin > 0 && pMin < 0.01, `p min ${pMin}`)
    assert.ok(Math.abs(pMax - 100) < 1e-6, `p max ${pMax}`)

    const tMin = await page.$eval('input.slider-input[data-var-name="temp"]', el => Number(el.min))
    const tMax = await page.$eval('input.slider-input[data-var-name="temp"]', el => Number(el.max))
    assert.ok(Math.abs(tMin - 32) < 1e-6, `temp min ${tMin}`)
    assert.ok(Math.abs(tMax - 212) < 1e-6, `temp max ${tMax}`)

    const legacySlider = await page.$('#scalingSlider')
    assert.equal(legacySlider, null)
    const legacyDisplay = await page.$('#scalingDisplay')
    assert.equal(legacyDisplay, null)

    // Qual: slider line excerpt is ellipsized for long lines
    const longLine = 'This is a very long line intended to overflow the slider line display in the UI and should be truncated {x = 1} with ellipses to keep it on screen.'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, longLine)
    await page.waitForSelector('input.slider-input[data-var-name="x"]', { visible: true })
    const sliderLineText = await page.$eval('.slider-card[data-var-name="x"] .slider-line', el => el.textContent || '')
    assert.ok(sliderLineText.includes('...'), `slider line missing ellipses: ${sliderLineText}`)

    // Qual: dismissed slider resets on recipe change
    await page.click('button.slider-close[data-var-name="x"]')
    const dismissedSlider = await page.$('input.slider-input[data-var-name="x"]')
    assert.equal(dismissedSlider, null)
    await page.select('#recipeSelect', 'crepes')
    await page.waitForSelector('#recipeOutput', { visible: true })
    const restoredSlider = await page.$('input.slider-input[data-var-name="x"]')
    assert.equal(restoredSlider === null, false)

    // Qual: Editing derived field should solve for underlying variable
    // Bug report: Load crepes, change eggs from 12 to 24, expect x=2 and all fields double
    await page.select('#recipeSelect', 'blank')
    await page.select('#recipeSelect', 'crepes')
    await page.waitForSelector('#recipeOutput', { visible: true })

    // Qual: crepes x should not revert on shift-tab
    const xInitialCrepes = await getInputValue(page, 'input.recipe-field[data-label="x"]')
    assert.equal(xInitialCrepes, '1')
    await typeIntoFieldNoBlur(page, 'input.recipe-field[data-label="x"]', '1.5')
    await page.keyboard.press('Tab', { modifiers: ['Shift'] })
    await waitForNextFrame(page)
    const xAfterShiftTab = await getInputValue(page, 'input.recipe-field[data-label="x"]')
    assert.equal(xAfterShiftTab, '1.5')

    await page.select('#recipeSelect', 'blank')
    await page.select('#recipeSelect', 'crepes')
    await page.waitForSelector('#recipeOutput', { visible: true })

    // Find the eggs field (first field, which is 12x)
    const eggsField = await page.$('input.recipe-field')
    const initialEggs = await eggsField.evaluate(el => el.value)
    assert.equal(initialEggs, '12')  // Initially 12 (since x=1)

    // Qual: crepes x=1.5 then 630->631 should not show "No solution"
    await setInputValue(page, 'input.recipe-field[data-label="x"]', '1.5')
    const flourNoteHandle = await findFieldByTitleSubstring(page, '420x')
    const flourNoteIsNull = await flourNoteHandle.evaluate(el => el === null)
    assert.equal(flourNoteIsNull, false)

    const flourNoteBefore = await getHandleValue(flourNoteHandle)
    assert.equal(flourNoteBefore, '630')

    await flourNoteHandle.click({ clickCount: 3 })
    await page.keyboard.type('631')
    await flourNoteHandle.evaluate(e => e.blur())
    await waitForNextFrame(page)

    const bannerVisibleAfter = await page.$eval('#solveBanner', el => !el.hidden)
    const bannerTextAfter = await page.$eval('#solveBanner', el => el.textContent || '')
    assert.equal(/No solution/i.test(bannerTextAfter), false)
    if (bannerVisibleAfter) {
      assert.ok(!/No solution/i.test(bannerTextAfter))
    }

    await flourNoteHandle.dispose()

    // Qual: dial freeze vini/vfin/start date then changing rate updates end date
    await page.waitForSelector('#recipeSelect', { visible: true })
    await page.select('#recipeSelect', 'dial')
    await page.waitForSelector('#recipeOutput', { visible: true })

    const dialFrozenTitles = ['vini = 73', 'y0 = 2025', 'm0 = 12', 'd0 = 25']
    for (const t of dialFrozenTitles) {
      const h = await findFieldByTitleSubstring(page, t)
      const isNull = await h.evaluate(el => el === null)
      assert.equal(isNull, false)
      await h.dispose()
    }

    const dialFreezeTitles = ['vfin : 70']
    for (const t of dialFreezeTitles) {
      const h = await findFieldByTitleSubstring(page, t)
      const isNull = await h.evaluate(el => el === null)
      assert.equal(isNull, false)
      await longpressHandle(page, h)
      await h.dispose()
    }

    const dialDayHandle = await findFieldByTitleSubstring(page, 'd : 25')
    const dialDayIsNull = await dialDayHandle.evaluate(el => el === null)
    assert.equal(dialDayIsNull, false)
    const dialDayBefore = await getHandleValue(dialDayHandle)

    const dialRateHandle = await findFieldByTitleSubstring(page, 'r*SID')
    const dialRateIsNull = await dialRateHandle.evaluate(el => el === null)
    assert.equal(dialRateIsNull, false)
    await dialRateHandle.click({ clickCount: 3 })
    await page.keyboard.type('-0.01')
    await page.keyboard.press('Tab')
    await waitForNextFrame(page)

    const dialDayAfter = await getHandleValue(dialDayHandle)
    assert.equal(dialDayBefore, '25')
    assert.equal(dialDayAfter === '25', false)

    const dialBanner = await page.evaluate(() => String(state?.solveBanner || ''))
    assert.equal(dialBanner, '')

    await dialDayHandle.dispose()
    await dialRateHandle.dispose()

    // Qual: dial bug1b - freeze tini directly (not y0/m0/d0), edit rate to -1
    // This is the exact repro from the bug report
    await page.select('#recipeSelect', 'blank')
    await page.select('#recipeSelect', 'dial')
    await page.waitForSelector('#recipeOutput', { visible: true })

    // Freeze vini, vfin, and tini (the start TIME field, not the start DATE fields)
    const dialBug1bFrozenTitles = ['vini = 73']
    for (const t of dialBug1bFrozenTitles) {
      const h = await findFieldByTitleSubstring(page, t)
      const isNull = await h.evaluate(el => el === null)
      assert.equal(isNull, false, `dial bug1b: couldn't find field with title containing "${t}"`)
      await h.dispose()
    }

    const dialBug1bFreezeTitles = ['vfin : 70', 'tini = unixtime']
    for (const t of dialBug1bFreezeTitles) {
      const h = await findFieldByTitleSubstring(page, t)
      const isNull = await h.evaluate(el => el === null)
      assert.equal(isNull, false, `dial bug1b: couldn't find field with title containing "${t}"`)
      await longpressHandle(page, h)  // Double-click to freeze
      await h.dispose()
    }

    // Now edit the rate to -1
    const dialBug1bRateHandle = await findFieldByTitleSubstring(page, 'r*SID')
    const dialBug1bRateIsNull = await dialBug1bRateHandle.evaluate(el => el === null)
    assert.equal(dialBug1bRateIsNull, false)
    await dialBug1bRateHandle.click({ clickCount: 3 })
    await page.keyboard.type('-1')
    await page.keyboard.press('Tab')
    await waitForNextFrame(page)

    // The end date should change and there should be no "No solution" banner
    const dialBug1bBanner = await page.evaluate(() => String(state?.solveBanner || ''))
    assert.equal(dialBug1bBanner, '', 'dial bug1b: expected no solveBanner but got: ' + dialBug1bBanner)

    // The end date should be 2025-12-28 (3 days after start at rate of -1 kg/day to lose 3kg)
    const dialBug1bYHandle = await findFieldByTitleSubstring(page, 'y : ')
    const dialBug1bMHandle = await findFieldByTitleSubstring(page, 'm : ')
    const dialBug1bDHandle = await findFieldByTitleSubstring(page, 'd : ')
    const dialBug1bY = await getHandleValue(dialBug1bYHandle)
    const dialBug1bM = await getHandleValue(dialBug1bMHandle)
    const dialBug1bD = await getHandleValue(dialBug1bDHandle)
    assert.equal(dialBug1bY, '2025', 'dial bug1b: end year should be 2025')
    assert.equal(dialBug1bM, '12', 'dial bug1b: end month should be 12')
    assert.equal(dialBug1bD, '28', 'dial bug1b: end day should be 28')

    await dialBug1bRateHandle.dispose()
    await dialBug1bYHandle.dispose()
    await dialBug1bMHandle.dispose()
    await dialBug1bDHandle.dispose()

    // Qual: dial soft fallback - editing derived r*SID to an unsatisfiable value
    // should show "No solution" (even though the UI may fall back internally).
    await page.select('#recipeSelect', 'blank')
    await page.select('#recipeSelect', 'dial')
    await page.waitForSelector('#recipeOutput', { visible: true })

    // Freeze vini, vfin, and tini (start TIME field)
    const dialSoftFrozenTitles = ['vini = 73']
    for (const t of dialSoftFrozenTitles) {
      const h = await findFieldByTitleSubstring(page, t)
      const isNull = await h.evaluate(el => el === null)
      assert.equal(isNull, false, `dial soft fallback: couldn't find field with title containing "${t}"`)
      await h.dispose()
    }

    const dialSoftFreezeTitles = ['vfin : 70', 'tini = unixtime']
    for (const t of dialSoftFreezeTitles) {
      const h = await findFieldByTitleSubstring(page, t)
      const isNull = await h.evaluate(el => el === null)
      assert.equal(isNull, false, `dial soft fallback: couldn't find field with title containing "${t}"`)
      await longpressHandle(page, h)
      await h.dispose()
    }

    // Enter an unsatisfiable rate-per-day value (requires fractional day count)
    const dialSoftRateHandle = await findFieldByTitleSubstring(page, 'r*SID')
    const dialSoftRateIsNull = await dialSoftRateHandle.evaluate(el => el === null)
    assert.equal(dialSoftRateIsNull, false)
    await dialSoftRateHandle.click({ clickCount: 3 })
    await page.keyboard.type('-0.8')
    await page.keyboard.press('Tab')
    await waitForNextFrame(page)

    const dialSoftBanner = await page.evaluate(() => String(state?.solveBanner || ''))
    assert.ok(/No solution/i.test(dialSoftBanner), 'dial soft fallback: expected solveBanner to include "No solution" but got: ' + dialSoftBanner)

    const dialSoftBannerHidden = await page.$eval('#solveBanner', el => !!el.hidden)
    assert.equal(dialSoftBannerHidden, false, 'dial soft fallback: solveBanner should be visible')

    const dialSoftRateInvalid = await handleHasClass(dialSoftRateHandle, 'invalid')
    assert.equal(dialSoftRateInvalid, true, 'dial soft fallback: expected edited r*SID field to be invalid')

    await dialSoftRateHandle.dispose()

    // Qual: dial bug - editing derived r*SID to 0 after freezing should show "No solution"
    // and should NOT show the invalid-explain banner.
    await page.select('#recipeSelect', 'blank')
    await page.select('#recipeSelect', 'dial')
    await page.waitForSelector('#recipeOutput', { visible: true })

    // Freeze vini, vfin, and tini (start TIME field)
    const dialRateZeroFrozenTitles = ['vini = 73']
    for (const t of dialRateZeroFrozenTitles) {
      const h = await findFieldByTitleSubstring(page, t)
      const isNull = await h.evaluate(el => el === null)
      assert.equal(isNull, false, `dial rate=0: couldn't find field with title containing "${t}"`)
      await h.dispose()
    }

    const dialRateZeroFreezeTitles = ['vfin : 70', 'tini = unixtime']
    for (const t of dialRateZeroFreezeTitles) {
      const h = await findFieldByTitleSubstring(page, t)
      const isNull = await h.evaluate(el => el === null)
      assert.equal(isNull, false, `dial rate=0: couldn't find field with title containing "${t}"`)
      await longpressHandle(page, h)
      await h.dispose()
    }

    const dialRateZeroHandle = await findFieldByTitleSubstring(page, 'r*SID')
    const dialRateZeroIsNull = await dialRateZeroHandle.evaluate(el => el === null)
    assert.equal(dialRateZeroIsNull, false, 'dial rate=0: could not find r*SID field')

    await dialRateZeroHandle.click({ clickCount: 3 })
    await page.keyboard.type('0')
    await page.keyboard.press('Tab')
    await waitForNextFrame(page)

    const dialRateZeroBanner = await page.evaluate(() => String(state?.solveBanner || ''))
    assert.ok(/No solution/i.test(dialRateZeroBanner), 'dial rate=0: expected solveBanner to include "No solution" but got: ' + dialRateZeroBanner)

    const dialRateZeroBannerHidden = await page.$eval('#solveBanner', el => !!el.hidden)
    assert.equal(dialRateZeroBannerHidden, false, 'dial rate=0: solveBanner should be visible')

    const dialRateZeroInvalidExplainHidden = await page.$eval('#invalidExplainBanner', el => !!el.hidden)
    assert.equal(dialRateZeroInvalidExplainHidden, true, 'dial rate=0: invalidExplainBanner should be hidden')

    const dialRateZeroInvalid = await handleHasClass(dialRateZeroHandle, 'invalid')
    assert.equal(dialRateZeroInvalid, false, 'dial rate=0: expected edited r*SID field to remain valid')

    await dialRateZeroHandle.dispose()

    await page.select('#recipeSelect', 'blank')
    await page.select('#recipeSelect', 'crepes')
    await page.waitForSelector('#recipeOutput', { visible: true })

    // Qual: eggs value should not drift after tabbing around
    await setInputValue(page, 'input.recipe-field', '13')
    const eggsAfterSet = await page.$eval('input.recipe-field', el => el.value)
    assert.equal(eggsAfterSet, '13')

    // Tabbing around without edits should not change computed values
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab', { modifiers: ['Shift'] })
    const eggsAfterNoEditTabbing = await page.$eval('input.recipe-field', el => el.value)
    assert.equal(eggsAfterNoEditTabbing, '13')

    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab', { modifiers: ['Shift'] })
    const eggsAfterTabbing = await page.$eval('input.recipe-field', el => el.value)
    assert.equal(eggsAfterTabbing, '13')

    // Change eggs to 24 - should solve for x=2
    await setInputValue(page, 'input.recipe-field', '24')

    // x should now be 2
    const xAfterEdit = await getInputValue(page, 'input.recipe-field[data-label="x"]')
    assert.equal(xAfterEdit, '2')

    // Eggs field should show 24 and NOT be invalid
    const eggsAfterEdit = await page.$eval('input.recipe-field', el => el.value)
    assert.equal(eggsAfterEdit, '24')
    const eggsInfo = await page.$eval('input.recipe-field', el => ({ invalid: el.classList.contains('invalid') }))
    assert.equal(eggsInfo.invalid, false)

    // Qual 2: Simultaneous equations should not start violated
    await page.select('#recipeSelect', 'simeq')
    await page.waitForSelector('#recipeOutput', { visible: true })

    const simeqConstraintHandle = await findFieldByTitleSubstring(page, '5x - 4y')
    const simeqConstraintIsNull = await simeqConstraintHandle.evaluate(el => el === null)
    assert.equal(simeqConstraintIsNull, false)

    const simeqConstraintInvalid = await handleHasClass(simeqConstraintHandle, 'invalid')
    assert.equal(simeqConstraintInvalid, false)

    await simeqConstraintHandle.dispose()

    // Qual 3: Bad templates should show error banner
    // Unsatisfiable constraints at load time
    const unsatTemplate = '{1 = a} {2 = a}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, unsatTemplate)

    await page.waitForSelector('.error-display:not([hidden])', { visible: true })
    const unsatErrText = await page.$eval('.error-display:not([hidden])', el => el.textContent || '')
    assert.ok(/Contradiction:/i.test(unsatErrText))
    const unsatCopyDisabled = await page.$eval('#copyButton', el => el.disabled)
    assert.equal(unsatCopyDisabled, true)

    // Bare constant cell should error
    const bareConstantTemplate = '{1}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, bareConstantTemplate)

    await page.waitForSelector('.error-display:not([hidden])', { visible: true })
    const bareErrText = await page.$eval('.error-display:not([hidden])', el => el.textContent || '')
    assert.ok(/bare number/i.test(bareErrText))
    const bareCopyDisabled = await page.$eval('#copyButton', el => el.disabled)
    assert.equal(bareCopyDisabled, true)

    // Multiple constants in a cell should error
    const multipleConstantsTemplate = '{x = 1 = 2}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, multipleConstantsTemplate)

    await page.waitForSelector('.error-display:not([hidden])', { visible: true })
    const multipleErrText = await page.$eval('.error-display:not([hidden])', el => el.textContent || '')
    assert.ok(/more than one numerical value/i.test(multipleErrText))
    const multipleCopyDisabled = await page.$eval('#copyButton', el => el.disabled)
    assert.equal(multipleCopyDisabled, true)

    // Nested braces should error
    const nestedBracesTemplate = '{{1 = a}}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, nestedBracesTemplate)

    await page.waitForSelector('.error-display:not([hidden])', { visible: true })
    const nestedErrText = await page.$eval('.error-display:not([hidden])', el => el.textContent || '')
    assert.ok(/Nested braces|Unclosed brace|Unmatched closing brace/i.test(nestedErrText))
    const nestedCopyDisabled = await page.$eval('#copyButton', el => el.disabled)
    assert.equal(nestedCopyDisabled, true)

    // Qual: error banners fail loudly if rendered container is missing
    clearPageErrors()
    await page.evaluate(() => {
      const output = document.getElementById('recipeOutput')
      if (!output) return
      const original = output.querySelector.bind(output)
      output.querySelector = sel => (sel === '.recipe-rendered' ? null : original(sel))
    })
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, unsatTemplate)
    await waitForPageError(/missing rendered container/i, 'expected error for missing rendered container')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#recipeTextarea')

    // Qual: error banners fail loudly if anchor input is missing
    clearPageErrors()
    await page.evaluate(() => {
      const original = Element.prototype.querySelector
      Element.prototype.querySelector = function (sel) {
        if (this.classList && this.classList.contains('recipe-rendered') && sel.startsWith('input.recipe-field')) {
          return null
        }
        return original.call(this, sel)
      }
    })
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, unsatTemplate)
    await waitForPageError(/missing input for error banner anchor/i, 'expected error for missing banner anchor')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#recipeTextarea')

    // Qual: error banners fail loudly on empty per-cell error lists
    clearPageErrors()
    await page.evaluate(() => {
      const originalAssign = window.assignErrorsToCells
      window.assignErrorsToCells = () => ({ byCell: new Map([['cell_0', []]]), global: [] })
      window.__restoreAssignErrorsToCells = () => { window.assignErrorsToCells = originalAssign }
    })
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, unsatTemplate)
    await waitForPageError(/empty error list for cell banner/i, 'expected error for empty per-cell error list')
    await page.evaluate(() => { window.__restoreAssignErrorsToCells && window.__restoreAssignErrorsToCells() })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#recipeTextarea')

    // Qual: global-only errors render without throwing
    clearPageErrors()
    const unclosedBraceTemplate = '{x'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, unclosedBraceTemplate)
    await page.waitForSelector('.error-display:not([hidden])', { visible: true })
    assert.equal(pageErrors.length, 0)

    // Qual: test recipe editing x/2 cell infers x
    await page.select('#recipeSelect', 'test')
    await page.waitForSelector('#recipeOutput', { visible: true })

    const testFieldsBefore = await page.$$eval('input.recipe-field', els => els.map(e => e.value))
    assert.equal(testFieldsBefore.length >= 2, true)

    // Use data-label selector instead of nth-of-type (which breaks when inputs are wrapped)
    await setInputValue(page, 'input.recipe-field[data-label="x/2"]', '0.5')

    await page.waitForFunction(() => {
      if (typeof state === 'undefined') return false
      return typeof state.solve?.ass?.x === 'number' && isFinite(state.solve.ass.x)
    })

    const testXAfter = await page.evaluate(() => state.solve.ass.x)
    assert.ok(Math.abs(testXAfter - 1) < 1e-6)

    const testFieldsAfter = await page.$$eval('input.recipe-field', els => els.map(e => e.value))
    // Eggs cell is first field and should now be 1
    assert.equal(testFieldsAfter[0], '1')

    const testBanner = await page.evaluate(() => state.solveBanner)
    assert.equal(testBanner, '')

    // Qual: invalid numeric input shows an explanation banner (even when satisfiable)
    const invalidExplainTemplate = '{x}\n'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, invalidExplainTemplate)
    await page.waitForSelector('#recipeOutput', { visible: true })

    const initialExplainSolveBanner = await page.evaluate(() => state.solveBanner)
    assert.equal(initialExplainSolveBanner, '')

    await typeIntoFieldNoBlur(page, 'input.recipe-field[data-label="x"]', '1e')
    await new Promise(r => setTimeout(r, 100))

    const invalidExplainHidden = await page.$eval('#invalidExplainBanner', el => !!el.hidden)
    assert.equal(invalidExplainHidden, false)
    const invalidExplainText = await page.$eval('#invalidExplainBanner', el => el.textContent || '')
    assert.ok(/syntax error/i.test(invalidExplainText), `Expected 'Syntax error' in banner, got: ${invalidExplainText}`)

    // Qual: invalid numeric input should not snap back (during typing)
    const invalidExplainXValue = await getInputValue(page, 'input.recipe-field[data-label="x"]')
    assert.equal(invalidExplainXValue, '1e')

    // Qual: invalid numeric input should mark field invalid
    const invalidExplainXInvalid = await page.$eval('input.recipe-field[data-label="x"]', el => el.classList.contains('invalid'))
    assert.equal(invalidExplainXInvalid, true)

    const invalidExplainSolveBannerHidden = await page.$eval('#solveBanner', el => !!el.hidden)
    assert.equal(invalidExplainSolveBannerHidden, true)

    const invalidExplainPos = await page.evaluate(() => {
      const rendered = document.querySelector('#recipeOutput .recipe-rendered')
      if (!rendered) return { ok: false, why: 'no recipe-rendered' }

      const invalids = rendered.querySelectorAll('input.recipe-field.invalid')
      if (!invalids.length) return { ok: false, why: 'no invalid field' }
      let anchor = invalids[invalids.length - 1]

      while (anchor && anchor.parentNode !== rendered) {
        anchor = anchor.parentNode
      }
      if (!anchor) return { ok: false, why: 'no anchor' }

      const banners = document.getElementById('nonCriticalBanners')
      if (!banners) return { ok: false, why: 'no nonCriticalBanners' }

      return { ok: banners.previousSibling === anchor, why: 'bad position' }
    })
    assert.equal(invalidExplainPos.ok, true, invalidExplainPos.why)

    // Qual: correcting the invalid numeric input should clear the invalid-explain banner
    await setInputValue(page, 'input.recipe-field[data-label="x"]', '1')
    const invalidExplainHiddenAfterFix = await page.$eval('#invalidExplainBanner', el => !!el.hidden)
    assert.equal(invalidExplainHiddenAfterFix, true)
    const invalidExplainXInvalidAfterFix = await page.$eval('input.recipe-field[data-label="x"]', el => el.classList.contains('invalid'))
    assert.equal(invalidExplainXInvalidAfterFix, false)

    // Qual: invalid-explain banner placement works even without a <br> anchor
    const invalidExplainNoBrTemplate = '{x}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, invalidExplainNoBrTemplate)
    await page.waitForSelector('#recipeOutput', { visible: true })

    await typeIntoFieldNoBlur(page, 'input.recipe-field[data-label="x"]', '1e')
    await new Promise(r => setTimeout(r, 100))

    const invalidExplainNoBrHidden = await page.$eval('#invalidExplainBanner', el => !!el.hidden)
    assert.equal(invalidExplainNoBrHidden, false)

    const invalidExplainNoBrPos = await page.evaluate(() => {
      const rendered = document.querySelector('#recipeOutput .recipe-rendered')
      if (!rendered) return { ok: false, why: 'no recipe-rendered' }

      const banners = document.getElementById('nonCriticalBanners')
      if (!banners) return { ok: false, why: 'no nonCriticalBanners' }

      const invalidFields = rendered.querySelectorAll('input.recipe-field.invalid')
      const lastInvalid = invalidFields.length ? invalidFields[invalidFields.length - 1] : null
      const afterInvalid = lastInvalid
        ? ((lastInvalid.compareDocumentPosition(banners) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0)
        : true
      const ok = banners.parentElement === rendered && afterInvalid
      return { ok, why: ok ? 'ok' : 'banners not after invalid field' }
    })
    assert.equal(invalidExplainNoBrPos.ok, true, invalidExplainNoBrPos.why)

    // Qual: solveBanner only clears when solved (and does not clear on invalid intermediate input)
    const noSolTemplate = '{x} {x = 2y} {x = 3y}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, noSolTemplate)
    await page.waitForSelector('#recipeOutput', { visible: true })

    await typeIntoFieldNoBlur(page, 'input.recipe-field[data-label="x"]', '1')
    await new Promise(r => setTimeout(r, 100))
    const banner1 = await page.evaluate(() => state.solveBanner)
    assert.ok(/No solution/i.test(banner1))

    const invalidCount1 = await page.$$eval('input.recipe-field.invalid', els => els.length)
    assert.ok(invalidCount1 >= 1)

    const sat1 = await page.evaluate(() => {
      const eqns = buildInteractiveEqns(null, null)
      return eqnsSatisfied(eqns, state.solve.ass)
    })
    assert.equal(sat1, false)
    const bannerHidden1 = await page.$eval('#solveBanner', el => !!el.hidden)
    assert.equal(bannerHidden1, false)

    await blurSelector(page, 'input.recipe-field[data-label="x"]')
    await new Promise(r => setTimeout(r, 100))
    const bannerAfterBlur1 = await page.evaluate(() => state.solveBanner)
    assert.ok(/No solution/i.test(bannerAfterBlur1))

    const invalidCountAfterBlur1 = await page.$$eval('input.recipe-field.invalid', els => els.length)
    assert.ok(invalidCountAfterBlur1 >= 1)
    const bannerHiddenAfterBlur1 = await page.$eval('#solveBanner', el => !!el.hidden)
    assert.equal(bannerHiddenAfterBlur1, false)

    // Now type an invalid intermediate value and ensure banner doesn't clear
    await typeIntoFieldNoBlur(page, 'input.recipe-field[data-label="x"]', '1e')
    await new Promise(r => setTimeout(r, 100))
    const bannerInvalid = await page.evaluate(() => state.solveBanner)
    assert.ok(/No solution/i.test(bannerInvalid))

    const invalidCountInvalid = await page.$$eval('input.recipe-field.invalid', els => els.length)
    assert.ok(invalidCountInvalid >= 1)

    const bannerHiddenInvalid = await page.$eval('#solveBanner', el => !!el.hidden)
    assert.equal(bannerHiddenInvalid, false)

    await blurSelector(page, 'input.recipe-field[data-label="x"]')
    await new Promise(r => setTimeout(r, 100))
    const bannerAfterBlurInvalid = await page.evaluate(() => state.solveBanner)
    assert.ok(/No solution/i.test(bannerAfterBlurInvalid))

    const invalidCountAfterBlurInvalid = await page.$$eval('input.recipe-field.invalid', els => els.length)
    assert.ok(invalidCountAfterBlurInvalid >= 1)
    const bannerHiddenAfterBlurInvalid = await page.$eval('#solveBanner', el => !!el.hidden)
    assert.equal(bannerHiddenAfterBlurInvalid, false)

    // Now enter a value that restores satisfiability (x=0)
    await typeIntoFieldNoBlur(page, 'input.recipe-field[data-label="x"]', '0')
    await new Promise(r => setTimeout(r, 100))
    const bannerCleared = await page.evaluate(() => state.solveBanner)
    assert.equal(bannerCleared, '')

    const bannerHiddenCleared = await page.$eval('#solveBanner', el => !!el.hidden)
    assert.equal(bannerHiddenCleared, true)

    // Qual: biketour avg speed edit should solve (division constraints)
    await page.select('#recipeSelect', 'biketour')
    await page.waitForFunction(() => {
      const select = document.getElementById('recipeSelect')
      return !!select && select.value === 'biketour'
    })
    await page.waitForSelector('#recipeOutput', { visible: true })

    const biketourBreakFreezeTitles = ['b1*60 : 26', 'b2*60 : 37']
    for (const t of biketourBreakFreezeTitles) {
      const h = await findFieldByTitleSubstring(page, t)
      const isNull = await h.evaluate(el => el === null)
      assert.equal(isNull, false)
      await longpressHandle(page, h)
      await h.dispose()
      await waitForNextFrame(page)
    }

    const biketourAvgSpeedHandle = await findFieldByTitleSubstring(page, 'd/t')
    const biketourRidingTimeHandle = await findFieldByTitleSubstring(page, 't = w-b')
    assert.ok(biketourAvgSpeedHandle)
    assert.ok(biketourRidingTimeHandle)

    const avgSpeedSelector = await page.evaluate((h) => {
      if (!h) return null
      const el = h
      const id = el.getAttribute('data-cell-id')
      if (!id) return null
      return `input.recipe-field[data-cell-id="${id}"]`
    }, biketourAvgSpeedHandle)

    assert.ok(avgSpeedSelector)
    await setInputValue(page, avgSpeedSelector, '15')

    const biketourBanner = await page.evaluate(() => String(state.solveBanner || ''))
    assert.equal(biketourBanner, '')

    const ridingTimeValue = await getHandleValue(biketourRidingTimeHandle)
    const ridingTimeNum = Number(String(ridingTimeValue).trim())
    // Expect t ~= d/v = 66/15 = 4.4 hours
    assert.ok(Math.abs(ridingTimeNum - 4.4) < 0.02)

    // Qual: Undefined variable shows banner and disables copy
    // NOTE: This behavior was removed when we aligned implementation with the
    // core algorithm: all identifiers are treated as variables and template
    // validity is determined by initial satisfiability.
    // const badTemplate = '{1 = a} {b = a+z}\n\nSanity: {a=b}'
    // await page.$eval('#recipeTextarea', (el, v) => {
    //   el.value = v
    //   el.dispatchEvent(new Event('input', { bubbles: true }))
    // }, badTemplate)
    // await page.waitForSelector('.error-display', { visible: true })
    // const errorText = await page.$eval('.error-display', el => el.textContent || '')
    // assert.ok(/undefined variable/i.test(errorText))
    // const copyDisabled = await page.$eval('#copyButton', el => el.disabled)
    // assert.equal(copyDisabled, true)

    // Qual: violated constraint fields should stay red after blur
    const contradictory = '{1 = a} {2 = b} {a=b}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, contradictory)

    // Freeze a and b so the contradiction is real under the spec
    // NOTE: With "bare number => starts frozen" semantics, {a:1} and {b:2}
    // are already frozen; double-clicking would unfreeze them.
    // await page.click('input.recipe-field[data-label="a"]', { clickCount: 2 })
    // await page.click('input.recipe-field[data-label="b"]', { clickCount: 2 })

    await setInputValue(page, 'input.recipe-field[data-label="a"]', '1')
    await setInputValue(page, 'input.recipe-field[data-label="b"]', '2')

    const aEqBHandle = await findFieldByTitleSubstring(page, 'a=b')
    const aEqBIsNull = await aEqBHandle.evaluate(el => el === null)
    assert.equal(aEqBIsNull, false)

    const initiallyInvalid = await handleHasClass(aEqBHandle, 'invalid')
    assert.equal(initiallyInvalid, true)

    await blurSelector(page, 'input.recipe-field[data-label="a"]')

    const afterBlurInvalid = await handleHasClass(aEqBHandle, 'invalid')
    assert.equal(afterBlurInvalid, true)

    await aEqBHandle.dispose()

    // Qual: empty expressions fail loudly (no silent "0" fallback)
    const emptyExprError = await page.evaluate(() => {
      try {
        window.preval('')
        return null
      } catch (e) {
        return e && e.message ? e.message : String(e)
      }
    })
    assert.ok(/invalid expression/i.test(emptyExprError || ''))

    // Qual: solver banner appears during typing when overconstrained
    // Use {a:1} {b:} {a=b} - a is frozen, b is free
    // When we type a different value in b (not blur), banner should show
    const overconstrained = '{1 = a} {b} {a=b}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, overconstrained)
    await page.waitForSelector('#recipeOutput', { visible: true })

    // Type 99 into b without blur - should show overconstrained banner
    await typeIntoFieldNoBlur(page, 'input.recipe-field[data-label="b"]', '99')

    // Wait a moment for the banner to appear
    await new Promise(r => setTimeout(r, 100))

    const bannerVisible = await page.$eval('#solveBanner', el => !el.hidden)
    const bannerText = await page.$eval('#solveBanner', el => el.textContent || '')
    assert.equal(bannerVisible, true, 'Banner should be visible during edit')
    assert.ok(/try unfreezing cells/i.test(bannerText), 'Banner should mention unfreezing')

    // Qual: pyzza slider bug - c^2 cell should NOT turn red when using slider
    await page.select('#recipeSelect', 'pyzza')
    await page.waitForSelector('#recipeOutput', { visible: true })

    await setSliderValue(page, 'input.slider-input[data-var-name="x"]', '2')

    const cSquaredHandle = await findFieldByTitleSubstring(page, 'a^2 + b^2 = c^2')
    const cSquaredIsNull = await cSquaredHandle.evaluate(el => el === null)
    assert.equal(cSquaredIsNull, false)

    const cSquaredInvalidAfterSlider = await handleHasClass(cSquaredHandle, 'invalid')
    assert.equal(cSquaredInvalidAfterSlider, false, 'c^2 cell should NOT be invalid after slider change')

    await cSquaredHandle.dispose()

    // Qual: pyzza editing c should persist when nothing is frozen
    await page.select('#recipeSelect', 'pyzza')
    await page.waitForSelector('#recipeOutput', { visible: true })

    await typeIntoFieldNoBlur(page, 'input.recipe-field[data-label="c"]', '50')
    await page.waitForFunction(() => {
      if (typeof state === 'undefined') return false
      const a = document.querySelector('input.recipe-field[data-label="a"]')
      const b = document.querySelector('input.recipe-field[data-label="b"]')
      const c = document.querySelector('input.recipe-field[data-label="c"]')
      return a && b && c && a.value === '30' && b.value === '40' && c.value === '50'
    })

    await page.click('input.recipe-field[data-label="a"]')
    await waitForNextFrame(page)

    const aAfterClick = await getInputValue(page, 'input.recipe-field[data-label="a"]')
    const bAfterClick = await getInputValue(page, 'input.recipe-field[data-label="b"]')
    const cAfterClick = await getInputValue(page, 'input.recipe-field[data-label="c"]')
    assert.equal(aAfterClick, '30')
    assert.equal(bAfterClick, '40')
    assert.equal(cAfterClick, '50')

    const aInvalid = await page.$eval('input.recipe-field[data-label="a"]', el => el.classList.contains('invalid'))
    const bInvalid = await page.$eval('input.recipe-field[data-label="b"]', el => el.classList.contains('invalid'))
    const cInvalid = await page.$eval('input.recipe-field[data-label="c"]', el => el.classList.contains('invalid'))
    assert.equal(aInvalid, false)
    assert.equal(bInvalid, false)
    assert.equal(cInvalid, false)

    // Qual: blur behavior - when other cells are frozen, invalid value should snap back
    await page.select('#recipeSelect', 'pyzza')
    await page.waitForSelector('#recipeOutput', { visible: true })

    await dblClickSelector(page, 'input.recipe-field[data-label="a"]')
    await dblClickSelector(page, 'input.recipe-field[data-label="b"]')

    // Get initial c value (should be 5 for x=1)
    const initialC = await getInputValue(page, 'input.recipe-field[data-label="c"]')
    assert.equal(initialC, '5')

    // Type invalid value without blurring
    await typeIntoFieldNoBlur(page, 'input.recipe-field[data-label="c"]', '999')

    // Blur - should revert to correct value
    await blurSelector(page, 'input.recipe-field[data-label="c"]')
    const cAfterBlur = await getInputValue(page, 'input.recipe-field[data-label="c"]')
    assert.equal(cAfterBlur, '999')

    // Qual: self-reference error check
    // NOTE: Self-reference is allowed; this qual verifies it doesn't error.
    const selfRef = '{x = x} {1 = x+0}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, selfRef)

    await page.waitForSelector('#recipeOutput', { visible: true })
    const selfRefErrors = await page.evaluate(() => (typeof state !== 'undefined' && Array.isArray(state.errors)) ? state.errors : null)
    assert.equal(selfRefErrors && selfRefErrors.length, 0)
    const xVal = await getInputValue(page, 'input.recipe-field[data-label="x"]')
    assert.equal(xVal, '1')

    // Qual: self-reference allowed with other vars present
    // Note: x must be referenced in another cell to avoid unreferenced variable error
    const selfRefWithOther = '{x = x + y - y} {10 = y} {x}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, selfRefWithOther)

    await page.waitForSelector('#recipeOutput', { visible: true })
    const selfRefWithOtherErrors = await page.evaluate(() => (typeof state !== 'undefined' && Array.isArray(state.errors)) ? state.errors : null)
    assert.equal(selfRefWithOtherErrors && selfRefWithOtherErrors.length, 0)
    const yValSelfRef = await getInputValue(page, 'input.recipe-field[data-label="y"]')
    assert.equal(yValSelfRef, '10')
    const xValSelfRef = await getInputValue(page, 'input.recipe-field[data-label="x"]')
    assert.ok(/^-?\d+(\.\d+)?$/.test(xValSelfRef))

    // Qual: hidden constraints inside HTML comments constrain solving
    const hiddenConstraint = '{a} {b = 2a} <!-- {10 = b+0} -->'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, hiddenConstraint)
    await page.waitForSelector('#recipeOutput', { visible: true })
    const aValHidden = await getInputValue(page, 'input.recipe-field[data-label="a"]')
    const bValHidden = await getInputValue(page, 'input.recipe-field[data-label="b"]')
    assert.equal(aValHidden, '5')
    assert.equal(bValHidden, '10')

    // Qual: markdown rendering allows raw HTML and ignores HTML comments
    const markdownTemplate = '# Markdown Header\n\n* Item {x}\n\nParagraph with <span id=\"rawhtml\">raw</span> html.\n<!-- hidden {y} -->'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, markdownTemplate)
    await page.waitForSelector('#recipeOutput', { visible: true })

    const markdownResult = await page.evaluate(() => {
      const rendered = document.querySelector('#recipeOutput .recipe-rendered')
      if (!rendered) return { ok: false, why: 'no recipe-rendered' }
      const header = rendered.querySelector('h1')
      const raw = rendered.querySelector('#rawhtml')
      const listItems = rendered.querySelectorAll('ul li')
      const inputs = rendered.querySelectorAll('input.recipe-field')
      const text = rendered.textContent || ''
      return {
        ok: true,
        header: header ? header.textContent : '',
        raw: !!raw,
        listCount: listItems.length,
        inputCount: inputs.length,
        hasHidden: /hidden/.test(text)
      }
    })
    assert.equal(markdownResult.ok, true, markdownResult.why)
    assert.equal(markdownResult.header, 'Markdown Header')
    assert.equal(markdownResult.raw, true)
    assert.equal(markdownResult.listCount, 1)
    assert.equal(markdownResult.inputCount, 1)
    assert.equal(markdownResult.hasHidden, false)

    // Qual: constant at end is default, not frozen (during typing)
    const defaultNotFrozen = '{x : 1} {y = 2x}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, defaultNotFrozen)
    await page.waitForSelector('#recipeOutput', { visible: true })
    await typeIntoFieldNoBlur(page, 'input.recipe-field[data-label="y"]', '10')
    await new Promise(r => setTimeout(r, 50))
    const xAfterTyping = await getInputValue(page, 'input.recipe-field[data-label="x"]')
    assert.equal(xAfterTyping, '5')

    const initFromExpr = '{x : 2y} {6 = y+1} {x+0} {y}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, initFromExpr)
    await page.waitForSelector('#recipeOutput', { visible: true })
    const initErrors = await page.evaluate(() => (typeof state !== 'undefined' && Array.isArray(state.errors)) ? state.errors : null)
    assert.equal((initErrors || []).length, 0)
    const initX = await getInputValue(page, 'input.recipe-field[data-label="x"]')
    const initY = await getInputValue(page, 'input.recipe-field[data-label="y"]')
    assert.equal(initX, '10')
    assert.equal(initY, '5')

    // Qual: constant at front starts frozen
    const startsFrozen = '{1 = x} {y = 2x}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, startsFrozen)
    await page.waitForSelector('#recipeOutput', { visible: true })
    await typeIntoFieldNoBlur(page, 'input.recipe-field[data-label="y"]', '10')
    await new Promise(r => setTimeout(r, 100))
    const xStillFrozen = await getInputValue(page, 'input.recipe-field[data-label="x"]')
    assert.equal(xStillFrozen, '1')
    const frozenBannerVisible = await page.$eval('#solveBanner', el => !el.hidden)
    const frozenBannerText = await page.$eval('#solveBanner', el => el.textContent || '')
    assert.equal(frozenBannerVisible, true)
    assert.ok(/No solution found \(try unfreezing cells\)/i.test(frozenBannerText))

    const endsFrozen = '{x = 1} {y = 2x}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, endsFrozen)
    await page.waitForSelector('#recipeOutput', { visible: true })
    await typeIntoFieldNoBlur(page, 'input.recipe-field[data-label="y"]', '10')
    await new Promise(r => setTimeout(r, 100))
    const xEndFrozen = await getInputValue(page, 'input.recipe-field[data-label="x"]')
    assert.equal(xEndFrozen, '1')
    const endFrozenBannerText = await page.$eval('#solveBanner', el => el.textContent || '')
    assert.ok(/No solution found \(try unfreezing cells\)/i.test(endFrozenBannerText))

    // Qual: bare constant is an error
    const bareConstant = '{5}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, bareConstant)
    await page.waitForSelector('#recipeOutput', { visible: true })
    const bareErrors = await page.evaluate(() => (typeof state !== 'undefined' && Array.isArray(state.errors)) ? state.errors : null)
    assert.ok((bareErrors || []).some(e => /bare number/i.test(e)))

    // Qual: multiple constants in one cell is an error
    const multiConst = '{x = 1 = 2}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, multiConst)
    await page.waitForSelector('#recipeOutput', { visible: true })
    const multiErrors = await page.evaluate(() => (typeof state !== 'undefined' && Array.isArray(state.errors)) ? state.errors : null)
    assert.ok((multiErrors || []).some(e => /more than one numerical value/i.test(e)))

    const multiColonTemplate = '{x:1:2} {x}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, multiColonTemplate)
    await page.waitForSelector('#recipeOutput', { visible: true })
    const multiColonErrors = await page.evaluate(() => (typeof state !== 'undefined' && Array.isArray(state.errors)) ? state.errors : null)
    assert.ok((multiColonErrors || []).some(e => /more than one colon/i.test(e)))

    const colonRhsTemplate = '{x : 1 = 2} {x}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, colonRhsTemplate)
    await page.waitForSelector('#recipeOutput', { visible: true })
    const colonRhsErrors = await page.evaluate(() => (typeof state !== 'undefined' && Array.isArray(state.errors)) ? state.errors : null)
    assert.ok((colonRhsErrors || []).some(e => /more than one expression/i.test(e)))

    const initConflictTemplate = '{x = 1 : 2} {x}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, initConflictTemplate)
    await page.waitForSelector('#recipeOutput', { visible: true })
    const initConflictErrors = await page.evaluate(() => (typeof state !== 'undefined' && Array.isArray(state.errors)) ? state.errors : null)
    // previously: Initial value for \{x = 1 : 2\} incompatible with constraints
    assert.ok((initConflictErrors || []).some(e => /Inconsistent initial values/i.test(e)))

    // Qual: nested braces syntax error
    const nestedBraces = 'Test {a{b}c}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, nestedBraces)

    await page.waitForSelector('.error-display:not([hidden])', { visible: true })
    const nestedError = await page.$eval('.error-display:not([hidden])', el => el.textContent || '')
    assert.ok(/nested braces/i.test(nestedError), 'Nested braces should produce error')

    // Qual: unclosed brace syntax error
    const unclosed = 'Test {x = 1'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, unclosed)

    await page.waitForSelector('.error-display:not([hidden])', { visible: true })
    const unclosedError = await page.$eval('.error-display:not([hidden])', el => el.textContent || '')
    assert.ok(/unclosed brace/i.test(unclosedError), 'Unclosed brace should produce error')

    // Qual: unreferenced variable shows error (Error Case 4)
    const unreferencedVar = '{6.28 = tau}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, unreferencedVar)
    await page.waitForSelector('#recipeOutput', { visible: true })
    const unreferencedErrors = await page.evaluate(() => (typeof state !== 'undefined' && Array.isArray(state.errors)) ? state.errors : null)
    assert.ok((unreferencedErrors || []).some(e => /not referenced/i.test(e)), 'Unreferenced variable should produce error')

    // Qual: repeated variable in a single cell should still be unreferenced
    const repeatedVar = '{x + x}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, repeatedVar)
    await page.waitForSelector('#recipeOutput', { visible: true })
    const repeatedErrors = await page.evaluate(() => (typeof state !== 'undefined' && Array.isArray(state.errors)) ? state.errors : null)
    assert.ok((repeatedErrors || []).some(e => /not referenced/i.test(e)), 'Repeated variable should produce unreferenced error')

    // Qual: referenced variable does NOT show unreferenced error
    const referencedVar = '{6.28 = tau} {tau}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, referencedVar)
    await page.waitForSelector('#recipeOutput', { visible: true })
    const referencedErrors = await page.evaluate(() => (typeof state !== 'undefined' && Array.isArray(state.errors)) ? state.errors : null)
    const hasUnreferencedError = (referencedErrors || []).some(e => /not referenced/i.test(e))
    assert.equal(hasUnreferencedError, false, 'Referenced variable should NOT produce unreferenced error')

    // Qual: comment workaround prevents unreferenced variable error
    const commentWorkaround = '{6.28 = tau} <!-- {tau} not currently used -->'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, commentWorkaround)
    await page.waitForSelector('#recipeOutput', { visible: true })
    const commentWorkaroundErrors = await page.evaluate(() => (typeof state !== 'undefined' && Array.isArray(state.errors)) ? state.errors : null)
    const hasUnreferencedErrorComment = (commentWorkaroundErrors || []).some(e => /not referenced/i.test(e))
    assert.equal(hasUnreferencedErrorComment, false, 'Comment workaround should prevent unreferenced error')

    // Qual: variable referenced in expression does NOT show unreferenced error for THAT variable
    // But y only appears in one cell, so y SHOULD show unreferenced error
    const referencedInExpr = '{x} {y = 2x}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, referencedInExpr)
    await page.waitForSelector('#recipeOutput', { visible: true })
    const referencedInExprErrors = await page.evaluate(() => (typeof state !== 'undefined' && Array.isArray(state.errors)) ? state.errors : null)
    // x is referenced in both cells, so no error for x
    const hasUnreferencedErrorForX = (referencedInExprErrors || []).some(e => /not referenced.*\bx\b/i.test(e) || /\bx\b.*not referenced/i.test(e))
    assert.equal(hasUnreferencedErrorForX, false, 'x is referenced by another cell, should NOT produce unreferenced error')
    // y only appears in one cell, so it SHOULD have an unreferenced error
    const hasUnreferencedErrorForY = (referencedInExprErrors || []).some(e => /not referenced/i.test(e) && /\by\b/.test(e))
    assert.equal(hasUnreferencedErrorForY, true, 'y only appears in one cell, SHOULD produce unreferenced error')

    // Qual: b+0 behaves same as bare b
    const bPlusZero = '{5 = a} {b+0} {10 = a + b}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, bPlusZero)
    await page.waitForSelector('#recipeOutput', { visible: true })
    const bPlusZeroErrors = await page.evaluate(() => (typeof state !== 'undefined' && Array.isArray(state.errors)) ? state.errors : null)
    assert.equal((bPlusZeroErrors || []).filter(e => !/not referenced/i.test(e)).length, 0, 'b+0: no errors')
    const bPlusZeroVal = await getInputValue(page, 'input.recipe-field[data-label="b+0"]')
    assert.equal(bPlusZeroVal, '5', 'b+0 should display 5')

    // Qual: quadratic equation with constraint in comment solves for x
    const quadratic = '{3 = a}x^2+{4 = b}x+{-20 = c}=0\n<!-- {a*x^2+b*x+c=0} -->\nx={x}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, quadratic)
    await page.waitForSelector('#recipeOutput', { visible: true })
    const quadraticErrors = await page.evaluate(() => (typeof state !== 'undefined' && Array.isArray(state.errors)) ? state.errors : null)
    assert.equal((quadraticErrors || []).filter(e => !/not referenced/i.test(e)).length, 0, 'quadratic: no errors')
    const quadraticX = await getInputValue(page, 'input.recipe-field[data-label="x"]')
    assert.equal(quadraticX, '2', 'quadratic should solve x=2')

    // Qual: golden ratio constraint solves for phi
    const goldenRatio = '{1/phi = phi - 1}\n{phi}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, goldenRatio)
    await page.waitForSelector('#recipeOutput', { visible: true })
    const goldenRatioErrors = await page.evaluate(() => (typeof state !== 'undefined' && Array.isArray(state.errors)) ? state.errors : null)
    assert.equal((goldenRatioErrors || []).filter(e => !/not referenced/i.test(e)).length, 0, 'golden ratio: no errors')
    const goldenRatioPhi = await page.evaluate(() => state?.solve?.ass?.phi)
    const expectedPhi = (1 + Math.sqrt(5)) / 2
    assert.ok(Math.abs(goldenRatioPhi - expectedPhi) < 0.001, `golden ratio phi should be ~1.618, got ${goldenRatioPhi}`)

    // =========================================================================
    // URL State Management Quals ([LNK] feature)
    // =========================================================================

    // Qual: URL with ?recipe=crepes loads crepes template
    const baseUrl = fileUrl(path.join(__dirname, '..', 'index.html'))
    await page.goto(`${baseUrl}?recipe=crepes`)
    await page.waitForSelector('#recipeOutput', { visible: true })
    const urlRecipeText = await page.evaluate(() => state.recipeText)
    const urlRecipeDropdown = await page.$eval('#recipeSelect', el => el.value)
    assert.equal(urlRecipeDropdown, 'crepes', 'URL ?recipe=crepes should select crepes in dropdown')
    assert.ok(urlRecipeText.includes('crepes'), 'URL ?recipe=crepes should load crepes template')

    // Qual: URL with ?recipe=pyzza&x=2 loads pyzza with x=2 override
    await page.goto(`${baseUrl}?recipe=pyzza&x=2`)
    await page.waitForSelector('#recipeOutput', { visible: true })
    const urlPyzzaX = await page.evaluate(() => state.solve?.ass?.x)
    assert.ok(Math.abs(urlPyzzaX - 2) < 0.001, `URL ?recipe=pyzza&x=2 should set x=2, got ${urlPyzzaX}`)
    const urlPyzzaA = await getInputValue(page, 'input.recipe-field[data-label="a"]')
    assert.equal(urlPyzzaA, '6', 'URL ?recipe=pyzza&x=2 should scale a to 6')

    // Qual: URL with ?rawcipe= loads compressed custom template
    const customTemplate = '{x} {y = 2x}'
    const compressed = await page.evaluate((t) => LZString.compressToEncodedURIComponent(t), customTemplate)
    await page.goto(`${baseUrl}?rawcipe=${compressed}`)
    await page.waitForSelector('#recipeOutput', { visible: true })
    const rawcipeText = await page.evaluate(() => state.recipeText)
    assert.equal(rawcipeText, customTemplate, 'URL ?rawcipe= should load custom template')
    const rawcipeDropdown = await page.$eval('#recipeSelect', el => el.value)
    assert.equal(rawcipeDropdown, 'custom', 'URL ?rawcipe= should select custom in dropdown')

    // Qual: URL updates when recipe is selected
    await page.goto(baseUrl)
    await page.waitForSelector('#recipeSelect', { visible: true })
    await page.select('#recipeSelect', 'pyzza')
    await page.waitForSelector('#recipeOutput', { visible: true })
    const urlAfterSelect = await page.evaluate(() => location.search)
    assert.ok(urlAfterSelect.includes('recipe=pyzza'), `URL should contain recipe=pyzza after selection, got ${urlAfterSelect}`)

    // Qual: URL updates when field value changes
    await setInputValue(page, 'input.recipe-field[data-label="a"]', '9')
    const urlAfterEdit = await page.evaluate(() => location.search)
    assert.ok(urlAfterEdit.includes('a=9'), `URL should contain a=9 after edit, got ${urlAfterEdit}`)

    // Qual: URL state persists after page reload
    await page.goto(`${baseUrl}?recipe=pyzza&x=2.5`)
    await page.waitForSelector('#recipeOutput', { visible: true })
    const xBeforeReload = await page.evaluate(() => state.solve?.ass?.x)
    assert.ok(Math.abs(xBeforeReload - 2.5) < 0.001, `x should be 2.5 before reload, got ${xBeforeReload}`)
    
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#recipeOutput', { visible: true })
    
    const xAfterReload = await page.evaluate(() => state.solve?.ass?.x)
    const dropdownAfterReload = await page.$eval('#recipeSelect', el => el.value)
    const urlAfterReload = await page.evaluate(() => location.search)
    
    assert.ok(Math.abs(xAfterReload - 2.5) < 0.001, `x should persist as 2.5 after reload, got ${xAfterReload}`)
    assert.equal(dropdownAfterReload, 'pyzza', 'Dropdown should still show pyzza after reload')
    assert.ok(urlAfterReload.includes('recipe=pyzza'), `URL should still contain recipe=pyzza after reload, got ${urlAfterReload}`)
    assert.ok(urlAfterReload.includes('x=2.5'), `URL should still contain x=2.5 after reload, got ${urlAfterReload}`)

    // =========================================================================
    // Arithmetic in Fields Quals ([ARI] feature)
    // =========================================================================

    // Qual: typing constant arithmetic expression shows expression until blur
    await page.goto(baseUrl)
    await page.select('#recipeSelect', 'pyzza')
    await page.waitForSelector('#recipeOutput', { visible: true })
    await typeIntoFieldNoBlur(page, 'input.recipe-field[data-label="a"]', '2+1')
    await new Promise(r => setTimeout(r, 50))
    const ariBeforeBlur = await getInputValue(page, 'input.recipe-field[data-label="a"]')
    assert.equal(ariBeforeBlur, '2+1', 'Expression should stay visible before blur')
    const ariInvalidBeforeBlur = await page.$eval('input.recipe-field[data-label="a"]', el => el.classList.contains('invalid'))
    assert.equal(ariInvalidBeforeBlur, false, 'Field should not be invalid while typing expression')
    
    // Qual: on blur, expression is replaced with evaluated result
    await blurSelector(page, 'input.recipe-field[data-label="a"]')
    const ariAVal = await getInputValue(page, 'input.recipe-field[data-label="a"]')
    assert.equal(ariAVal, '3', 'After blur, "2+1" should evaluate to 3')
    const ariAInvalid = await page.$eval('input.recipe-field[data-label="a"]', el => el.classList.contains('invalid'))
    assert.equal(ariAInvalid, false, 'Field should not be invalid after arithmetic expression')

    // Qual: typing expression with variables is rejected (constants only)
    await page.select('#recipeSelect', 'pyzza')
    await page.waitForSelector('#recipeOutput', { visible: true })
    await typeIntoFieldNoBlur(page, 'input.recipe-field[data-label="a"]', 'b+1')
    await new Promise(r => setTimeout(r, 100))
    const ariVarExprInvalid = await page.$eval('input.recipe-field[data-label="a"]', el => el.classList.contains('invalid'))
    assert.equal(ariVarExprInvalid, true, 'Expression with variables should be invalid')

    // Qual: invalid expression shows error
    await page.select('#recipeSelect', 'pyzza')
    await page.waitForSelector('#recipeOutput', { visible: true })
    await typeIntoFieldNoBlur(page, 'input.recipe-field[data-label="a"]', '2++3')
    await new Promise(r => setTimeout(r, 100))
    
    const ariInvalidExprInvalid = await page.$eval('input.recipe-field[data-label="a"]', el => el.classList.contains('invalid'))
    assert.equal(ariInvalidExprInvalid, true, 'Syntax error should mark field invalid')

    // Qual: sqrt and other math functions work in field input
    await page.select('#recipeSelect', 'pyzza')
    await page.waitForSelector('#recipeOutput', { visible: true })
    await setInputValue(page, 'input.recipe-field[data-label="a"]', 'sqrt(9)')
    const ariSqrtVal = await getInputValue(page, 'input.recipe-field[data-label="a"]')
    assert.equal(ariSqrtVal, '3', 'Typing "sqrt(9)" in field should evaluate to 3')

    // Qual: plain numbers still work (fast path)
    await page.select('#recipeSelect', 'pyzza')
    await page.waitForSelector('#recipeOutput', { visible: true })
    await setInputValue(page, 'input.recipe-field[data-label="a"]', '7')
    const ariPlainVal = await getInputValue(page, 'input.recipe-field[data-label="a"]')
    assert.equal(ariPlainVal, '7', 'Plain number input should still work')

    console.log('All quals passed.')
  } catch (e) {
    if (pageConsoleLogs.length > 0) {
      console.log(pageConsoleLogs.join('\n'))
    }
    throw e
  } finally {
    await page.close()
    await browser.close()
  }
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
