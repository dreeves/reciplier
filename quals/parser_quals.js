/*
Parser quals runner.

Runs quals for reciparse.js (checkBraceSyntax, extractCells, parseInequalities, parseCell)

Usage:
  npm run quals           (runs all quals including this)
  node quals/parser_quals.js   (runs just this)
*/

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function loadScriptIntoContext(filePath, ctx) {
  const code = fs.readFileSync(filePath, 'utf8')
  vm.runInContext(code, ctx, { filename: filePath })
}

function makeContext() {
  const ctx = {
    console,
    Math,
    Number,
    String,
    Array,
    Object,
    Set,
    Map,
    isFinite,
    parseFloat,
    eval,
  }
  return vm.createContext(ctx)
}

function runParserQuals() {
  const ctx = makeContext()
  const root = path.join(__dirname, '..')

  // Load dependencies in order
  loadScriptIntoContext(path.join(root, 'matheval.js'), ctx)
  loadScriptIntoContext(path.join(root, 'reciplogic.js'), ctx)
  loadScriptIntoContext(path.join(root, 'reciparse.js'), ctx)

  const {
    checkBraceSyntax,
    extractCells,
    parseInequalities,
    parseCell,
  } = ctx

  const results = { passed: 0, failed: 0, errors: [] }

  function deepEqual(a, b) {
    if (a === b) return true
    if (a === null || b === null) return a === b
    if (typeof a !== typeof b) return false
    if (typeof a === 'number') {
      if (Number.isNaN(a) && Number.isNaN(b)) return true
      return Math.abs(a - b) < 1e-9
    }
    if (typeof a !== 'object') return a === b
    if (Array.isArray(a) !== Array.isArray(b)) return false
    if (Array.isArray(a)) {
      return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]))
    }
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) return false
    return keysA.every(k => deepEqual(a[k], b[k]))
  }

  function check(name, actual, expected) {
    const passed = deepEqual(actual, expected)
    if (passed) {
      console.log(`✓ ${name}`)
      results.passed++
    } else {
      console.log(`✗ ${name}`)
      console.log('  Expected:', JSON.stringify(expected))
      console.log('  Got:', JSON.stringify(actual))
      results.failed++
      results.errors.push(name)
    }
  }
  
  console.log("BEGIN PARSER QUALS")

  // ==========================================================================
  // checkBraceSyntax quals
  // ==========================================================================

  console.log('\n=== checkBraceSyntax quals ===')

  // Valid cases (should return empty array)
  check('checkBraceSyntax: empty string',
    checkBraceSyntax('').length, 0)
  check('checkBraceSyntax: no braces',
    checkBraceSyntax('hello world').length, 0)
  check('checkBraceSyntax: single cell',
    checkBraceSyntax('{x}').length, 0)
  check('checkBraceSyntax: multiple cells',
    checkBraceSyntax('{a} and {b} and {c}').length, 0)
  check('checkBraceSyntax: adjacent cells',
    checkBraceSyntax('{a}{b}{c}').length, 0)
  check('checkBraceSyntax: cell with expression',
    checkBraceSyntax('{x = 2y + 3}').length, 0)
  check('checkBraceSyntax: cell with inequality',
    checkBraceSyntax('{0 < x < 10}').length, 0)
  check('checkBraceSyntax: multiline',
    checkBraceSyntax('line 1 {a}\nline 2 {b}').length, 0)

  // Invalid cases (should return errors)
  check('checkBraceSyntax: nested braces',
    checkBraceSyntax('{{nested}}').length > 0, true)
  check('checkBraceSyntax: nested braces with content',
    checkBraceSyntax('{outer {inner} more}').length > 0, true)
  check('checkBraceSyntax: unclosed brace',
    checkBraceSyntax('{unclosed').length > 0, true)
  check('checkBraceSyntax: unclosed brace at end',
    checkBraceSyntax('text {').length > 0, true)
  check('checkBraceSyntax: stray closing brace',
    checkBraceSyntax('}stray').length > 0, true)
  check('checkBraceSyntax: stray closing brace mid-text',
    checkBraceSyntax('text } more').length > 0, true)
  check('checkBraceSyntax: unmatched closing',
    checkBraceSyntax('{a} } {b}').length > 0, true)
  check('checkBraceSyntax: multiple unclosed',
    checkBraceSyntax('{a {b').length > 0, true)

  // ==========================================================================
  // extractCells quals
  // ==========================================================================
  console.log('\n=== extractCells quals ===')

  check('extractCells: empty string',
    extractCells('').length, 0)
  check('extractCells: no cells',
    extractCells('just plain text').length, 0)
  check('extractCells: single cell',
    extractCells('{x}').length, 1)
  check('extractCells: single cell urtext',
    extractCells('{x}')[0]?.urtext, 'x')
  check('extractCells: multiple cells count',
    extractCells('{a} {b} {c}').length, 3)
  check('extractCells: multiple cells urtext',
    extractCells('{a} {b}').map(c => c.urtext), ['a', 'b'])
  check('extractCells: cell with spaces',
    extractCells('{ x = 2 }')[0]?.urtext, ' x = 2 ')
  check('extractCells: cell with expression',
    extractCells('{x = 2y + 3}')[0]?.urtext, 'x = 2y + 3')
  check('extractCells: adjacent cells',
    extractCells('{a}{b}').length, 2)
  check('extractCells: preserves indices',
    extractCells('pre {x} post')[0]?.startIndex, 4)
  check('extractCells: end index correct',
    extractCells('pre {x} post')[0]?.endIndex, 7)
  check('extractCells: empty cell',
    extractCells('{}')[0]?.urtext, '')
  check('extractCells: cell with newline',
    extractCells('{a\nb}')[0]?.urtext, 'a\nb')

  // ==========================================================================
  // parseInequalities quals
  // ==========================================================================
  console.log('\n=== parseInequalities quals ===')

  // Non-inequality cases
  check('parseInequalities: bare variable',
    parseInequalities('x'), { attempted: false, core: 'x', bounds: null, error: null })
  check('parseInequalities: expression',
    parseInequalities('2x + 3'), { attempted: false, core: '2x + 3', bounds: null, error: null })
  check('parseInequalities: equation (no inequality)',
    parseInequalities('x = 5').attempted, false)

  // Valid inequality cases
  check('parseInequalities: simple bounds',
    parseInequalities('0 < x < 10'), {
      attempted: true,
      core: 'x',
      bounds: { inf: 0, sup: 10, infStrict: true, supStrict: true },
      error: null
    })
  check('parseInequalities: non-strict lower',
    parseInequalities('0 <= x < 10'), {
      attempted: true,
      core: 'x',
      bounds: { inf: 0, sup: 10, infStrict: false, supStrict: true },
      error: null
    })
  check('parseInequalities: non-strict upper',
    parseInequalities('0 < x <= 10'), {
      attempted: true,
      core: 'x',
      bounds: { inf: 0, sup: 10, infStrict: true, supStrict: false },
      error: null
    })
  check('parseInequalities: both non-strict',
    parseInequalities('0 <= x <= 10'), {
      attempted: true,
      core: 'x',
      bounds: { inf: 0, sup: 10, infStrict: false, supStrict: false },
      error: null
    })
  check('parseInequalities: negative bounds',
    parseInequalities('-10 < x < -1'), {
      attempted: true,
      core: 'x',
      bounds: { inf: -10, sup: -1, infStrict: true, supStrict: true },
      error: null
    })
  check('parseInequalities: decimal bounds',
    parseInequalities('0.5 < x < 1.5'), {
      attempted: true,
      core: 'x',
      bounds: { inf: 0.5, sup: 1.5, infStrict: true, supStrict: true },
      error: null
    })
  check('parseInequalities: equal bounds non-strict',
    parseInequalities('5 <= x <= 5'), {
      attempted: true,
      core: 'x',
      bounds: { inf: 5, sup: 5, infStrict: false, supStrict: false },
      error: null
    })
  check('parseInequalities: expression bounds',
    parseInequalities('1+1 < x < 2*5').bounds, { inf: 2, sup: 10, infStrict: true, supStrict: true })

  // Invalid inequality cases
  check('parseInequalities: wrong direction (>)',
    parseInequalities('10 > x > 0').error, 'ineq')
  check('parseInequalities: missing upper bound',
    parseInequalities('0 < x').error, 'ineq')
  check('parseInequalities: missing lower bound',
    parseInequalities('x < 10').error, 'ineq')
  check('parseInequalities: inverted bounds',
    parseInequalities('10 < x < 0').error, 'ineq')
  check('parseInequalities: equal bounds with strict',
    parseInequalities('5 < x < 5').error, 'ineq')
  check('parseInequalities: triple angle',
    parseInequalities('0 < x < y < 10').error, 'ineq')

  // ==========================================================================
  // parseCell quals
  // ==========================================================================
  console.log('\n=== parseCell quals ===')

  function makeCell(content) {
    return { id: 'test', urtext: content, startIndex: 0, endIndex: content.length + 2 }
  }

  // Basic cases
  check('parseCell: bare variable',
    parseCell(makeCell('x')).ceqn, ['x'])
  check('parseCell: bare variable cval',
    parseCell(makeCell('x')).cval, null)
  check('parseCell: bare number',
    parseCell(makeCell('42')).cval, 42)
  check('parseCell: bare number ceqn',
    parseCell(makeCell('42')).ceqn, [])
  check('parseCell: negative number',
    parseCell(makeCell('-3.14')).cval, -3.14)

  // Equations
  check('parseCell: simple equation',
    parseCell(makeCell('x = 5')).ceqn, ['x'])
  check('parseCell: simple equation cval',
    parseCell(makeCell('x = 5')).cval, 5)
  check('parseCell: equation pegged (YN: constant + no colon)',
    parseCell(makeCell('x = 5')).pegged, true)
  check('parseCell: variable equation',
    parseCell(makeCell('x = y')).ceqn, ['x', 'y'])
  check('parseCell: variable equation cval',
    parseCell(makeCell('x = y')).cval, null)
  check('parseCell: variable equation not pegged (NN: no constant + no colon)',
    parseCell(makeCell('x = y')).pegged, false)
  check('parseCell: three-way equation',
    parseCell(makeCell('a = b = c')).ceqn, ['a', 'b', 'c'])
  check('parseCell: expression equation',
    parseCell(makeCell('y = 2x + 3')).ceqn, ['y', '2x + 3'])

  // Constraint with number
  check('parseCell: constraint ceqn',
    parseCell(makeCell('a = b = 5')).ceqn, ['a', 'b'])
  check('parseCell: constraint cval',
    parseCell(makeCell('a = b = 5')).cval, 5)

  // Colon syntax: colon acts as equals but makes cell unpegged
  check('parseCell: colon ceqn',
    parseCell(makeCell('x : 5')).ceqn, ['x'])
  check('parseCell: colon cval',
    parseCell(makeCell('x : 5')).cval, 5)
  check('parseCell: colon not pegged (YY: constant + colon)',
    parseCell(makeCell('x : 5')).pegged, false)
  check('parseCell: colon with expression ceqn',
    parseCell(makeCell('y = 2x : 10')).ceqn, ['y', '2x'])
  check('parseCell: colon with expression cval',
    parseCell(makeCell('y = 2x : 10')).cval, 10)
  check('parseCell: colon colonError null',
    parseCell(makeCell('x : 5')).colonError, null)

  // Colon errors
  check('parseCell: multiple colons',
    parseCell(makeCell('x : 5 : 6')).colonError, 'multi')
  check('parseCell: colon with rhs equation',
    parseCell(makeCell('x : y = 5')).colonError, 'rhs')
  check('parseCell: colon without constant (NY case)',
    parseCell(makeCell('x : y')).colonError, 'noconst')

  // Inequalities
  check('parseCell: inequality ineq',
    parseCell(makeCell('0 < x < 10')).ineq, { inf: 0, sup: 10, infStrict: true, supStrict: true, varName: 'x' })
  check('parseCell: inequality ceqn',
    parseCell(makeCell('0 < x < 10')).ceqn, ['x'])
  check('parseCell: inequality cval',
    parseCell(makeCell('0 < x < 10')).cval, null)

  // Error cases
  check('parseCell: multiple numbers error',
    parseCell(makeCell('5 = 6')).multipleNumbers, true)
  check('parseCell: inequality error flag',
    parseCell(makeCell('10 > x > 0')).ineqError, true)

  // Edge cases
  check('parseCell: whitespace handling',
    parseCell(makeCell('  x  =  5  ')).ceqn, ['x'])
  check('parseCell: expression with parens',
    parseCell(makeCell('y = (a + b) * c')).ceqn, ['y', '(a + b) * c'])
  check('parseCell: scientific notation',
    parseCell(makeCell('x = 1e-5')).cval, 1e-5)

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log('\n=== Parser Quals Summary ===')
  console.log(`Passed: ${results.passed}`)
  console.log(`Failed: ${results.failed}`)

  if (results.failed > 0) {
    console.log('Failures:', results.errors.join(', '))
    process.exitCode = 1
  }

  return results
}

runParserQuals()
