/*
Quals (not tests).

Runs a small regression suite in a real browser (Puppeteer).

Usage:
  npm run quals
*/

const assert = require('node:assert/strict')
const path = require('node:path')
const puppeteer = require('puppeteer')

function fileUrl(p) {
  const abs = path.resolve(p)
  return `file://${abs}`
}

async function setInputValue(page, selector, value) {
  const el = await page.waitForSelector(selector, { visible: true })
  await el.click({ clickCount: 3 })
  await page.keyboard.type(String(value))
  await el.evaluate(e => e.blur())
  await page.waitForFunction(() => (typeof state !== 'undefined') && state.currentEditCellId === null)
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
  const el = await page.waitForSelector(selector, { visible: true })
  await el.click({ clickCount: 2 })
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
  page.on('console', msg => {
    pageConsoleLogs.push(msg.text())
  })

  try {
    await page.goto(fileUrl(path.join(__dirname, '..', 'index.html')))

    // Qual: help text includes Calca.io link
    const hasCalcaLink = await page.$eval('a[href="https://calca.io"]', el => !!el)
    assert.equal(hasCalcaLink, true)

    // Qual: util.js runQuals() passes
    const utilQualsResult = await page.evaluate(() => runQuals())
    assert.equal(utilQualsResult, 'All quals passed!')

    // Quals: every recipe in dropdown loads sanely
    await page.waitForSelector('#recipeSelect', { visible: true })
    const recipeKeys = await page.$$eval('#recipeSelect option', opts => opts.map(o => o.value).filter(v => v !== ''))
    for (const key of recipeKeys) {
      await page.select('#recipeSelect', key)
      await page.waitForFunction(k => (typeof state !== 'undefined') && state.currentRecipeKey === k, {}, key)
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
        const sat = eqnsSatisfied(eqns, state?.values || {})

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

      assert.equal(stateSummary.errorCount, 0, `recipe ${key}: errorCount`)
      assert.equal(stateSummary.invalidCount, 0, `recipe ${key}: invalidCount`)
      assert.equal(stateSummary.sat, true, `recipe ${key}: sat`)
      assert.equal(stateSummary.solveBanner, '', `recipe ${key}: solveBanner`)
      assert.ok(stateSummary.cellCount > 0, `recipe ${key}: cellCount`)
    }

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
    await page.waitForFunction(() => (typeof state !== 'undefined') && state.currentEditCellId === null)

    const dBareStrAfterTab = await dBareHandle.evaluate(el => el.value)
    const dBareValAfterTab = Number(dBareStrAfterTab)
    const rAfter = await getInputValue(page, 'input.recipe-field[data-label="r"]')
    const xAfter = await getInputValue(page, 'input.recipe-field[data-label="x"]')

    const dDebug = await page.evaluate(() => ({
      solveBanner: String(state?.solveBanner || ''),
      d: state?.values?.d,
      r: state?.values?.r,
      x: state?.values?.x,
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
    await page.waitForFunction(() => (typeof state !== 'undefined') && state.currentEditCellId === null)

    const xUnfrozenVal = await xUnfrozen.evaluate(el => el.value)
    assert.equal(xUnfrozenVal, '6')

    const bannerAfter = await page.evaluate(() => state.solveBanner)
    assert.equal(bannerAfter, '')

    const invalidAfterCount = await page.$$eval('input.recipe-field.invalid', els => els.length)
    assert.equal(invalidAfterCount, 0)

    await xUnfrozen.dispose()

    // Qual: simeq edit x=6 cell then y=7 should keep 6&7 on blur
    await page.waitForSelector('#recipeSelect', { visible: true })
    await page.select('#recipeSelect', 'simeq')
    await page.waitForSelector('#recipeOutput', { visible: true })

    const xDefHandle = await findFieldByTitleSubstring(page, 'x = 6')
    const xDefIsNull = await xDefHandle.evaluate(el => el === null)
    assert.equal(xDefIsNull, false)

    await xDefHandle.click({ clickCount: 3 })
    await page.keyboard.type('1')
    await page.keyboard.press('Tab')
    await page.waitForFunction(() => (typeof state !== 'undefined') && state.currentEditCellId === null)

    const yHandle = await page.evaluateHandle(() => {
      const inputs = Array.from(document.querySelectorAll('input.recipe-field'))
      return inputs.find(i => (i.getAttribute('title') || '').trim() === 'y') || null
    })
    const yIsNull = await yHandle.evaluate(el => el === null)
    assert.equal(yIsNull, false)

    await yHandle.click({ clickCount: 3 })
    await page.keyboard.type('7')
    await page.keyboard.press('Tab')
    await page.waitForFunction(() => (typeof state !== 'undefined') && state.currentEditCellId === null)

    const xDefValAfter = await xDefHandle.evaluate(el => el.value)
    const yValAfter = await yHandle.evaluate(el => el.value)
    assert.equal(xDefValAfter, '6')
    assert.equal(yValAfter, '7')

    const simeqSolved = await page.evaluate(() => ({ x: state?.values?.x, y: state?.values?.y }))
    assert.ok(Math.abs(simeqSolved.x - 6) < 1e-9)
    assert.ok(Math.abs(simeqSolved.y - 7) < 1e-9)

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

    await setSliderValue(page, '#scalingSlider', '2')
    const sliderDisplay = await page.$eval('#scalingDisplay', el => el.textContent || '')
    assert.equal(sliderDisplay, '2')

    // Qual: slider updates in real time when x changes
    await typeIntoFieldNoBlur(page, 'input.recipe-field[data-label="x"]', '3')
    const sliderDisplayAfterTyping = await page.$eval('#scalingDisplay', el => el.textContent || '')
    assert.equal(sliderDisplayAfterTyping, '3')

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
    await page.waitForFunction(() => (typeof state !== 'undefined') && state.currentEditCellId === null)
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
    await page.waitForFunction(() => (typeof state !== 'undefined') && state.currentEditCellId === null)

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

    const dialFreezeTitles = ['vini = 73', 'vfin = 70', 'y0 = 2025', 'm0 = 12', 'd0 = 25']
    for (const t of dialFreezeTitles) {
      const h = await findFieldByTitleSubstring(page, t)
      const isNull = await h.evaluate(el => el === null)
      assert.equal(isNull, false)
      await h.click({ clickCount: 2 })
      await h.dispose()
    }

    const dialDayHandle = await findFieldByTitleSubstring(page, 'd = 25')
    const dialDayIsNull = await dialDayHandle.evaluate(el => el === null)
    assert.equal(dialDayIsNull, false)
    const dialDayBefore = await getHandleValue(dialDayHandle)

    const dialRateHandle = await findFieldByTitleSubstring(page, 'r*SID')
    const dialRateIsNull = await dialRateHandle.evaluate(el => el === null)
    assert.equal(dialRateIsNull, false)
    await dialRateHandle.click({ clickCount: 3 })
    await page.keyboard.type('-0.01')
    await page.keyboard.press('Tab')
    await page.waitForFunction(() => (typeof state !== 'undefined') && state.currentEditCellId === null)

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
    const dialBug1bFreezeTitles = ['vini = 73', 'vfin = 70', 'tini = unixtime']
    for (const t of dialBug1bFreezeTitles) {
      const h = await findFieldByTitleSubstring(page, t)
      const isNull = await h.evaluate(el => el === null)
      assert.equal(isNull, false, `dial bug1b: couldn't find field with title containing "${t}"`)
      await h.click({ clickCount: 2 })  // Double-click to freeze
      await h.dispose()
    }

    // Now edit the rate to -1
    const dialBug1bRateHandle = await findFieldByTitleSubstring(page, 'r*SID')
    const dialBug1bRateIsNull = await dialBug1bRateHandle.evaluate(el => el === null)
    assert.equal(dialBug1bRateIsNull, false)
    await dialBug1bRateHandle.click({ clickCount: 3 })
    await page.keyboard.type('-1')
    await page.keyboard.press('Tab')
    await page.waitForFunction(() => (typeof state !== 'undefined') && state.currentEditCellId === null)

    // The end date should change and there should be no "No solution" banner
    const dialBug1bBanner = await page.evaluate(() => String(state?.solveBanner || ''))
    assert.equal(dialBug1bBanner, '', 'dial bug1b: expected no solveBanner but got: ' + dialBug1bBanner)

    // The end date should be 2025-12-28 (3 days after start at rate of -1 kg/day to lose 3kg)
    const dialBug1bYHandle = await findFieldByTitleSubstring(page, 'y = ')
    const dialBug1bMHandle = await findFieldByTitleSubstring(page, 'm = ')
    const dialBug1bDHandle = await findFieldByTitleSubstring(page, 'd = ')
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
    // should not show "No solution"; it should just leave the field invalid/red.
    await page.select('#recipeSelect', 'blank')
    await page.select('#recipeSelect', 'dial')
    await page.waitForSelector('#recipeOutput', { visible: true })

    // Freeze vini, vfin, and tini (start TIME field)
    const dialSoftFreezeTitles = ['vini = 73', 'vfin = 70', 'tini = unixtime']
    for (const t of dialSoftFreezeTitles) {
      const h = await findFieldByTitleSubstring(page, t)
      const isNull = await h.evaluate(el => el === null)
      assert.equal(isNull, false, `dial soft fallback: couldn't find field with title containing "${t}"`)
      await h.click({ clickCount: 2 })
      await h.dispose()
    }

    // Enter an unsatisfiable rate-per-day value (requires fractional day count)
    const dialSoftRateHandle = await findFieldByTitleSubstring(page, 'r*SID')
    const dialSoftRateIsNull = await dialSoftRateHandle.evaluate(el => el === null)
    assert.equal(dialSoftRateIsNull, false)
    await dialSoftRateHandle.click({ clickCount: 3 })
    await page.keyboard.type('-0.8')
    await page.keyboard.press('Tab')
    await page.waitForFunction(() => (typeof state !== 'undefined') && state.currentEditCellId === null)

    const dialSoftBanner = await page.evaluate(() => String(state?.solveBanner || ''))
    assert.equal(dialSoftBanner, '', 'dial soft fallback: expected no solveBanner but got: ' + dialSoftBanner)

    const dialSoftRateInvalid = await handleHasClass(dialSoftRateHandle, 'invalid')
    assert.equal(dialSoftRateInvalid, true, 'dial soft fallback: expected edited r*SID field to be invalid')

    await dialSoftRateHandle.dispose()

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

    await page.waitForSelector('.error-display', { visible: true })
    const unsatErrText = await page.$eval('.error-display', el => el.textContent || '')
    assert.ok(/Contradiction:/i.test(unsatErrText))
    const unsatCopyDisabled = await page.$eval('#copyButton', el => el.disabled)
    assert.equal(unsatCopyDisabled, true)

    // Bare constant cell should error
    const bareConstantTemplate = '{1}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, bareConstantTemplate)

    await page.waitForSelector('.error-display', { visible: true })
    const bareErrText = await page.$eval('.error-display', el => el.textContent || '')
    assert.ok(/bare number/i.test(bareErrText))
    const bareCopyDisabled = await page.$eval('#copyButton', el => el.disabled)
    assert.equal(bareCopyDisabled, true)

    // Multiple constants in a cell should error
    const multipleConstantsTemplate = '{x = 1 = 2}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, multipleConstantsTemplate)

    await page.waitForSelector('.error-display', { visible: true })
    const multipleErrText = await page.$eval('.error-display', el => el.textContent || '')
    assert.ok(/more than one numerical value/i.test(multipleErrText))
    const multipleCopyDisabled = await page.$eval('#copyButton', el => el.disabled)
    assert.equal(multipleCopyDisabled, true)

    // Nested braces should error
    const nestedBracesTemplate = '{{1 = a}}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, nestedBracesTemplate)

    await page.waitForSelector('.error-display', { visible: true })
    const nestedErrText = await page.$eval('.error-display', el => el.textContent || '')
    assert.ok(/Nested braces|Unclosed brace|Unmatched closing brace/i.test(nestedErrText))
    const nestedCopyDisabled = await page.$eval('#copyButton', el => el.disabled)
    assert.equal(nestedCopyDisabled, true)

    // Qual: test recipe editing x/2 cell infers x
    await page.select('#recipeSelect', 'test')
    await page.waitForSelector('#recipeOutput', { visible: true })

    const testFieldsBefore = await page.$$eval('input.recipe-field', els => els.map(e => e.value))
    assert.equal(testFieldsBefore.length >= 2, true)

    await setInputValue(page, 'input.recipe-field:nth-of-type(2)', '0.5')

    await page.waitForFunction(() => {
      if (typeof state === 'undefined') return false
      return typeof state.values?.x === 'number' && isFinite(state.values.x)
    })

    const testXAfter = await page.evaluate(() => state.values.x)
    assert.ok(Math.abs(testXAfter - 1) < 1e-6)

    const testFieldsAfter = await page.$$eval('input.recipe-field', els => els.map(e => e.value))
    // Eggs cell is first field and should now be 1
    assert.equal(testFieldsAfter[0], '1')

    const testBanner = await page.evaluate(() => state.solveBanner)
    assert.equal(testBanner, '')

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
      return eqnsSatisfied(eqns, state.values)
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
    await page.waitForFunction(() => (typeof state !== 'undefined') && state.currentRecipeKey === 'biketour')
    await page.waitForSelector('#recipeOutput', { visible: true })

    const biketourAvgSpeedHandle = await findFieldByTitleSubstring(page, 'v = d/t')
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

    await setSliderValue(page, '#scalingSlider', '2')

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
    await page.waitForFunction(() => (typeof state !== 'undefined') && state.currentEditCellId === null)

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
    assert.equal(cAfterBlur, '5', 'c should revert to 5 on blur')

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
    const selfRefWithOther = '{x = x + y - y} {10 = y}'
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

    // Qual: constant at end is default, not frozen (during typing)
    const defaultNotFrozen = '{x = 1} {y = 2x}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, defaultNotFrozen)
    await page.waitForSelector('#recipeOutput', { visible: true })
    await typeIntoFieldNoBlur(page, 'input.recipe-field[data-label="y"]', '10')
    await new Promise(r => setTimeout(r, 50))
    const xAfterTyping = await getInputValue(page, 'input.recipe-field[data-label="x"]')
    assert.equal(xAfterTyping, '5')

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

    // Qual: nested braces syntax error
    const nestedBraces = 'Test {a{b}c}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, nestedBraces)

    await page.waitForSelector('.error-display', { visible: true })
    const nestedError = await page.$eval('.error-display', el => el.textContent || '')
    assert.ok(/nested braces/i.test(nestedError), 'Nested braces should produce error')

    // Qual: unclosed brace syntax error
    const unclosed = 'Test {x = 1'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, unclosed)

    await page.waitForSelector('.error-display', { visible: true })
    const unclosedError = await page.$eval('.error-display', el => el.textContent || '')
    assert.ok(/unclosed brace/i.test(unclosedError), 'Unclosed brace should produce error')

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
