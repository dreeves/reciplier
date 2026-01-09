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

    // Qual 3: Undefined variable shows banner and disables copy
    const badTemplate = '{1 = a} {b = a+z}\n\nSanity: {a=b}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, badTemplate)

    await page.waitForSelector('.error-display', { visible: true })

    const errorText = await page.$eval('.error-display', el => el.textContent || '')
    assert.ok(/undefined variable/i.test(errorText))

    const copyDisabled = await page.$eval('#copyButton', el => el.disabled)
    assert.equal(copyDisabled, true)

    // Still renders fields (we only add banners; rest of UI remains)
    const hasAnyField = await page.$eval('#recipeOutput', el => !!el.querySelector('input.recipe-field'))
    assert.equal(hasAnyField, true)

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
    assert.ok(/Overconstrained/i.test(bannerText), 'Banner should say Overconstrained')

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
    assert.ok(/Overconstrained/i.test(frozenBannerText))

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
