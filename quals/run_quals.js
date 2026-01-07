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
    await page.select('#recipeSelect', 'crepes')
    await page.waitForSelector('#recipeOutput', { visible: true })

    // Find the eggs field (first field, which is 12x)
    const eggsField = await page.$('input.recipe-field')
    const initialEggs = await eggsField.evaluate(el => el.value)
    assert.equal(initialEggs, '12')  // Initially 12 (since x=1)

    // Change eggs to 24 - should solve for x=2
    await setInputValue(page, 'input.recipe-field', '24')

    // x should now be 2
    const xAfterEdit = await getInputValue(page, 'input.recipe-field[data-label="x"]')
    assert.equal(xAfterEdit, '2')

    // Eggs field should show 24 and NOT be invalid
    const eggsAfterEdit = await page.$eval('input.recipe-field', el => el.value)
    assert.equal(eggsAfterEdit, '24')
    const eggsInvalid = await page.$eval('input.recipe-field', el => el.classList.contains('invalid'))
    assert.equal(eggsInvalid, false)

    // Qual 2: Simultaneous equations should not start violated
    await page.select('#recipeSelect', 'simeq')
    await page.waitForSelector('#recipeOutput', { visible: true })

    const simeqConstraintHandle = await findFieldByTitleSubstring(page, '5x - 4y = 2')
    const simeqConstraintIsNull = await simeqConstraintHandle.evaluate(el => el === null)
    assert.equal(simeqConstraintIsNull, false)

    const simeqConstraintInvalid = await handleHasClass(simeqConstraintHandle, 'invalid')
    assert.equal(simeqConstraintInvalid, false)

    await simeqConstraintHandle.dispose()

    // Qual 3: Undefined variable shows banner and disables copy
    const badTemplate = '{a:1} {b: a+z}\n\nSanity: {a=b}'
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
    const contradictory = '{a:1} {b:2} {a=b}'
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
        window.toJavaScript('')
        return null
      } catch (e) {
        return e && e.message ? e.message : String(e)
      }
    })
    assert.ok(/invalid expression/i.test(emptyExprError || ''))

    // Qual: solver banner appears during typing when overconstrained
    // Use {a:1} {b:} {a=b} - a is frozen, b is free
    // When we type a different value in b (not blur), banner should show
    const overconstrained = '{a:1} {b:} {a=b}'
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

    // Qual: blur behavior - invalid value should revert to constraint-satisfying value
    await page.select('#recipeSelect', 'pyzza')
    await page.waitForSelector('#recipeOutput', { visible: true })

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
    const selfRef = '{x: x}'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, selfRef)

    await page.waitForSelector('.error-display', { visible: true })
    const selfRefError = await page.$eval('.error-display', el => el.textContent || '')
    assert.ok(/references only itself/i.test(selfRefError), 'Self-reference should produce error')

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
    const unclosed = 'Test {x: 1'
    await page.$eval('#recipeTextarea', (el, v) => {
      el.value = v
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, unclosed)

    await page.waitForSelector('.error-display', { visible: true })
    const unclosedError = await page.$eval('.error-display', el => el.textContent || '')
    assert.ok(/unclosed brace/i.test(unclosedError), 'Unclosed brace should produce error')

    console.log('All quals passed.')
  } finally {
    await page.close()
    await browser.close()
  }
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
