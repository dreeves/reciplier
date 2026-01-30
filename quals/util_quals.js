/*
Utility quals runner.

Runs quals for:
- matheval.js (preval, vareval, varparse, deoctalize, isbarevar, isconstant, unixtime)
- reciplogic.js utilities (toNum, formatNum, isFiniteNumber)

Usage:
  npm run quals           (runs all quals including this)
  node quals/util_quals.js    (runs just this)
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
    isNaN,
    parseFloat,
    parseInt,
    eval,
    Date,
    Function,
    NaN,
    Infinity,
    undefined,
  }
  return vm.createContext(ctx)
}

function runUtilQuals() {
  const ctx = makeContext()
  const root = path.join(__dirname, '..')

  loadScriptIntoContext(path.join(root, 'matheval.js'), ctx)
  loadScriptIntoContext(path.join(root, 'reciplogic.js'), ctx)

  const {
    preval,
    deoctalize,
    vareval,
    varparse,
    isbarevar,
    isconstant,
    unixtime,
    tolerance,
    toNum,
    formatNum,
    isFiniteNumber,
    isCellViolated,
  } = ctx

  const results = { passed: 0, failed: 0, errors: [] }

  function check(name, actual, expected, tolerance = null) {
    let passed = false

    if (tolerance !== null && typeof actual === 'number' && typeof expected === 'number') {
      passed = Math.abs(actual - expected) <= tolerance
    } else if (expected === null) {
      passed = actual === null
    } else if (expected === undefined) {
      passed = actual === undefined
    } else if (Number.isNaN(expected)) {
      passed = Number.isNaN(actual)
    } else if (typeof expected === 'object' && expected !== null) {
      if (expected instanceof Set) {
        passed = actual instanceof Set &&
          actual.size === expected.size &&
          [...expected].every(v => actual.has(v))
      } else if (Array.isArray(expected)) {
        passed = Array.isArray(actual) &&
          actual.length === expected.length &&
          expected.every((v, i) => actual[i] === v)
      } else {
        const keys = Object.keys(expected)
        passed = keys.every(k => actual?.[k] === expected[k])
      }
    } else {
      passed = actual === expected
    }

    if (passed) {
      console.log(`✓ ${name}`)
      results.passed++
    } else {
      const expStr = expected instanceof Set ? `Set{${[...expected].join(', ')}}` : JSON.stringify(expected)
      const actStr = actual instanceof Set ? `Set{${[...actual].join(', ')}}` : JSON.stringify(actual)
      console.log(`✗ ${name}: expected ${expStr}, got ${actStr}`)
      results.failed++
      results.errors.push(name)
    }
  }

  // ==========================================================================
  // deoctalize quals
  // ==========================================================================
  console.log('\n=== deoctalize quals ===')

  check('deoctalize: preserves plain number', deoctalize('42'), '42')
  check('deoctalize: preserves zero', deoctalize('0'), '0')
  check('deoctalize: strips single leading zero', deoctalize('010'), '10')
  check('deoctalize: strips multiple leading zeros', deoctalize('007'), '7')
  check('deoctalize: strips triple zeros', deoctalize('000123'), '123')
  check('deoctalize: preserves 10', deoctalize('10'), '10')
  check('deoctalize: preserves 100', deoctalize('100'), '100')
  check('deoctalize: preserves decimal', deoctalize('1.05'), '1.05')
  check('deoctalize: preserves 0.something', deoctalize('0.5'), '0.5')
  check('deoctalize: handles 00.5', deoctalize('00.5'), '0.5')
  check('deoctalize: preserves negative', deoctalize('-42'), '-42')
  check('deoctalize: expression with leading zero', deoctalize('010 + 020'), '10 + 20')
  check('deoctalize: preserves var names with digits', deoctalize('var01'), 'var01')
  check('deoctalize: preserves scientific notation', deoctalize('1e07'), '1e07')

  // ==========================================================================
  // preval quals
  // ==========================================================================
  console.log('\n=== preval quals ===')

  // Implicit multiplication: number followed by variable
  check('preval: number-variable', preval('2x'), '2*x')
  check('preval: number-variable with space', preval('2 x'), '2*x')
  check('preval: float-variable', preval('3.5y'), '3.5*y')
  check('preval: number-underscore var', preval('2_foo'), '2*_foo')
  check('preval: preserves x2 (identifier)', preval('x2'), 'x2')
  check('preval: preserves var2a', preval('var2a'), 'var2a')
  check('preval: 2x + 3y', preval('2x + 3y'), '2*x + 3*y')
  check('preval: multiple implicit', preval('2x3y'), '2*x3y')  // x3y is one identifier

  // Implicit multiplication: number followed by parenthesis
  check('preval: number-paren', preval('2(x+1)'), '2*(x+1)')
  check('preval: number-paren with space', preval('2 (x+1)'), '2*(x+1)')
  check('preval: float-paren', preval('3.5(x)'), '3.5*(x)')
  check('preval: number-paren-nested', preval('2((a+b))'), '2*((a+b))')
  check('preval: number-paren in expr', preval('1 + 2(x+1) + 3'), '1 + 2*(x+1) + 3')
  check('preval: multiple number-parens', preval('2(a) + 3(b)'), '2*(a) + 3*(b)')
  // NOTE: closing-paren-before-letter doesn't get implicit mult (would need separate regex)
  check('preval: number-paren-var', preval('2(x+1)y'), '2*(x+1)y')
  check('preval: complex implicit', preval('2x + 3(y+1) + 4z'), '2*x + 3*(y+1) + 4*z')

  // Exponentiation
  check('preval: simple power', preval('x^2'), 'x**2')
  check('preval: chained power', preval('x^2^3'), 'x**2**3')
  check('preval: power with parens', preval('(x+1)^2'), '(x+1)**2')
  check('preval: implicit mult + power', preval('2x^2'), '2*x**2')

  // Math functions
  check('preval: sqrt', preval('sqrt(x)'), 'Math.sqrt(x)')
  check('preval: sin', preval('sin(x)'), 'Math.sin(x)')
  check('preval: cos', preval('cos(x)'), 'Math.cos(x)')
  check('preval: tan', preval('tan(x)'), 'Math.tan(x)')
  check('preval: log', preval('log(x)'), 'Math.log(x)')
  check('preval: exp', preval('exp(x)'), 'Math.exp(x)')
  check('preval: abs', preval('abs(x)'), 'Math.abs(x)')
  check('preval: floor', preval('floor(x)'), 'Math.floor(x)')
  check('preval: ceil', preval('ceil(x)'), 'Math.ceil(x)')
  check('preval: round', preval('round(x)'), 'Math.round(x)')
  check('preval: min', preval('min(a, b)'), 'Math.min(a, b)')
  check('preval: max', preval('max(a, b)'), 'Math.max(a, b)')
  check('preval: asin', preval('asin(x)'), 'Math.asin(x)')
  check('preval: acos', preval('acos(x)'), 'Math.acos(x)')
  check('preval: atan', preval('atan(x)'), 'Math.atan(x)')
  check('preval: nested functions', preval('sqrt(abs(x))'), 'Math.sqrt(Math.abs(x))')

  // Combined
  check('preval: 2sqrt(x)', preval('2sqrt(x)'), '2*Math.sqrt(x)')
  check('preval: sqrt(2x)', preval('sqrt(2x)'), 'Math.sqrt(2*x)')
  check('preval: complex', preval('2x^2 + 3sqrt(y)'), '2*x**2 + 3*Math.sqrt(y)')

  // Error cases
  try {
    preval('')
    check('preval: empty throws', false, true)
  } catch (e) {
    check('preval: empty throws', true, true)
  }

  try {
    preval('   ')
    check('preval: whitespace throws', false, true)
  } catch (e) {
    check('preval: whitespace throws', true, true)
  }

  // ==========================================================================
  // vareval quals
  // ==========================================================================
  console.log('\n=== vareval quals ===')

  // Basic arithmetic
  check('vareval: addition', vareval('2+3', {}).value, 5)
  check('vareval: subtraction', vareval('10-3', {}).value, 7)
  check('vareval: multiplication', vareval('4*5', {}).value, 20)
  check('vareval: division', vareval('20/4', {}).value, 5)
  check('vareval: negative', vareval('-5', {}).value, -5)
  check('vareval: parentheses', vareval('(2+3)*4', {}).value, 20)

  // Implicit multiplication
  check('vareval: implicit 2x', vareval('2x', {x: 5}).value, 10)
  check('vareval: implicit 3ab', vareval('3a*b', {a: 2, b: 4}).value, 24)

  // Exponentiation
  check('vareval: x^2', vareval('x^2', {x: 3}).value, 9)
  check('vareval: x^3', vareval('x^3', {x: 2}).value, 8)
  check('vareval: x^0', vareval('x^0', {x: 5}).value, 1)
  check('vareval: x^-1', vareval('x^(-1)', {x: 2}).value, 0.5)

  // Math functions
  check('vareval: sqrt', vareval('sqrt(16)', {}).value, 4)
  check('vareval: sqrt variable', vareval('sqrt(x)', {x: 25}).value, 5)
  check('vareval: abs negative', vareval('abs(-5)', {}).value, 5)
  check('vareval: abs positive', vareval('abs(5)', {}).value, 5)
  check('vareval: floor', vareval('floor(3.7)', {}).value, 3)
  check('vareval: ceil', vareval('ceil(3.2)', {}).value, 4)
  check('vareval: round down', vareval('round(3.4)', {}).value, 3)
  check('vareval: round up', vareval('round(3.6)', {}).value, 4)
  check('vareval: min', vareval('min(3, 7)', {}).value, 3)
  check('vareval: max', vareval('max(3, 7)', {}).value, 7)
  check('vareval: sin(0)', vareval('sin(0)', {}).value, 0)
  check('vareval: cos(0)', vareval('cos(0)', {}).value, 1)

  // Complex expressions
  check('vareval: quadratic', vareval('a*x^2 + b*x + c', {a: 1, b: 2, c: 1, x: 3}).value, 16)
  check('vareval: Pythagorean', vareval('a^2 + b^2', {a: 3, b: 4}).value, 25)
  check('vareval: fraction', vareval('(a+b)/(c-d)', {a: 10, b: 5, c: 5, d: 2}).value, 5)

  // Edge cases
  check('vareval: division by zero', vareval('1/0', {}).value, Infinity)
  check('vareval: negative div zero', vareval('-1/0', {}).value, -Infinity)
  check('vareval: 0/0 is NaN', Number.isNaN(vareval('0/0', {}).value), true)
  check('vareval: undefined var is NaN', Number.isNaN(vareval('x', {x: null}).value), true)
  check('vareval: sqrt negative is NaN', Number.isNaN(vareval('sqrt(-1)', {}).value), true)

  // Error handling
  check('vareval: syntax error has error', vareval('2+', {}).error !== null, true)
  check('vareval: undefined identifier has error', vareval('unknownVar', {}).error !== null, true)

  // Leading zeros (deoctalize integration)
  check('vareval: leading zero 010', vareval('010', {}).value, 10)
  check('vareval: leading zero 007', vareval('007', {}).value, 7)

  // ==========================================================================
  // varparse quals
  // ==========================================================================
  console.log('\n=== varparse quals ===')

  check('varparse: empty string', varparse(''), new Set())
  check('varparse: whitespace', varparse('   '), new Set())
  check('varparse: single var', varparse('x'), new Set(['x']))
  check('varparse: two vars', varparse('x + y'), new Set(['x', 'y']))
  check('varparse: duplicate vars', varparse('x + x'), new Set(['x']))
  check('varparse: underscore var', varparse('_foo'), new Set(['_foo']))
  check('varparse: var with digits', varparse('var01'), new Set(['var01']))
  check('varparse: complex expr', varparse('2x + 3y - z'), new Set(['x', 'y', 'z']))

  // Reserved words should NOT be extracted as variables
  check('varparse: sqrt not a var', varparse('sqrt(x)'), new Set(['x']))
  check('varparse: sin not a var', varparse('sin(x)'), new Set(['x']))
  check('varparse: cos not a var', varparse('cos(x)'), new Set(['x']))
  check('varparse: log not a var', varparse('log(x)'), new Set(['x']))
  check('varparse: abs not a var', varparse('abs(x)'), new Set(['x']))
  check('varparse: floor not a var', varparse('floor(x)'), new Set(['x']))
  check('varparse: ceil not a var', varparse('ceil(x)'), new Set(['x']))
  check('varparse: round not a var', varparse('round(x)'), new Set(['x']))
  check('varparse: min not a var', varparse('min(a,b)'), new Set(['a', 'b']))
  check('varparse: max not a var', varparse('max(a,b)'), new Set(['a', 'b']))
  check('varparse: exp not a var', varparse('exp(x)'), new Set(['x']))
  check('varparse: unixtime not a var', varparse('unixtime(y,m,d)'), new Set(['y', 'm', 'd']))
  check('varparse: asin/acos/atan not vars', varparse('asin(x)+acos(y)+atan(z)'), new Set(['x', 'y', 'z']))

  // Complex cases
  check('varparse: nested funcs', varparse('sqrt(a^2 + b^2)'), new Set(['a', 'b']))
  check('varparse: numbers ignored', varparse('2x + 3'), new Set(['x']))

  // ==========================================================================
  // isbarevar quals
  // ==========================================================================
  console.log('\n=== isbarevar quals ===')

  check('isbarevar: simple var', isbarevar('x'), true)
  check('isbarevar: underscore start', isbarevar('_foo'), true)
  check('isbarevar: with digits', isbarevar('var01'), true)
  check('isbarevar: all caps', isbarevar('ABC'), true)
  check('isbarevar: mixed case', isbarevar('myVar'), true)

  check('isbarevar: number', isbarevar('42'), false)
  check('isbarevar: starts with digit', isbarevar('2x'), false)
  check('isbarevar: expression', isbarevar('x+1'), false)
  check('isbarevar: with trailing space (trimmed)', isbarevar('x '), true)
  check('isbarevar: empty', isbarevar(''), false)
  check('isbarevar: null', isbarevar(null), false)
  check('isbarevar: number type', isbarevar(42), false)

  // Whitespace handling (trimmed)
  check('isbarevar: padded var', isbarevar('  x  '), true)

  // ==========================================================================
  // isconstant quals
  // ==========================================================================
  console.log('\n=== isconstant quals ===')

  check('isconstant: number literal', isconstant('42'), true)
  check('isconstant: negative', isconstant('-5'), true)
  check('isconstant: decimal', isconstant('3.14'), true)
  check('isconstant: expression', isconstant('2+3'), true)
  check('isconstant: sqrt constant', isconstant('sqrt(4)'), true)
  check('isconstant: power constant', isconstant('2^3'), true)
  check('isconstant: complex constant', isconstant('(2+3)*4'), true)

  check('isconstant: variable', isconstant('x'), false)
  check('isconstant: expr with var', isconstant('2x'), false)
  check('isconstant: infinity', isconstant('1/0'), false)  // Infinity is not finite
  check('isconstant: NaN', isconstant('0/0'), false)

  // ==========================================================================
  // unixtime quals
  // ==========================================================================
  console.log('\n=== unixtime quals ===')

  check('unixtime: epoch', unixtime(1970, 1, 1), 0)
  check('unixtime: day after epoch', unixtime(1970, 1, 2), 86400)
  check('unixtime: year 2000', unixtime(2000, 1, 1), 946684800)
  check('unixtime: 2025-12-25', unixtime(2025, 12, 25), 1766620800)
  check('unixtime: leap year 2024-02-29', unixtime(2024, 2, 29), 1709164800)

  // Difference calculations
  const day1 = unixtime(2025, 1, 1)
  const day2 = unixtime(2025, 1, 2)
  check('unixtime: day difference', day2 - day1, 86400)

  const year1 = unixtime(2025, 1, 1)
  const year2 = unixtime(2026, 1, 1)
  check('unixtime: year difference (non-leap)', year2 - year1, 365 * 86400)

  // String coercion
  check('unixtime: string args', unixtime('2025', '12', '25'), 1766620800)

  // Error cases
  try {
    unixtime(2025, 0, 1)
    check('unixtime: month 0 throws', false, true)
  } catch (e) {
    check('unixtime: month 0 throws', true, true)
  }

  try {
    unixtime(2025, 13, 1)
    check('unixtime: month 13 throws', false, true)
  } catch (e) {
    check('unixtime: month 13 throws', true, true)
  }

  try {
    unixtime(2025, 1, 0)
    check('unixtime: day 0 throws', false, true)
  } catch (e) {
    check('unixtime: day 0 throws', true, true)
  }

  try {
    unixtime(2025, 1, 32)
    check('unixtime: day 32 throws', false, true)
  } catch (e) {
    check('unixtime: day 32 throws', true, true)
  }

  try {
    unixtime('foo', 1, 1)
    check('unixtime: invalid year throws', false, true)
  } catch (e) {
    check('unixtime: invalid year throws', true, true)
  }

  // ==========================================================================
  // toNum quals (from reciplogic.js)
  // ==========================================================================
  console.log('\n=== toNum quals ===')

  check('toNum: integer', toNum('42'), 42)
  check('toNum: negative', toNum('-5'), -5)
  check('toNum: decimal', toNum('3.14'), 3.14)
  check('toNum: leading decimal', toNum('.5'), 0.5)
  check('toNum: trailing decimal', toNum('5.'), 5)
  check('toNum: scientific positive', toNum('1e5'), 1e5)
  check('toNum: scientific negative', toNum('1e-5'), 1e-5)
  check('toNum: scientific with plus', toNum('1e+5'), 1e5)
  check('toNum: scientific capital E', toNum('1E5'), 1e5)
  check('toNum: zero', toNum('0'), 0)
  check('toNum: negative zero', toNum('-0'), 0)  // JS treats -0 as 0

  // Whitespace handling
  check('toNum: leading space', toNum(' 42'), 42)
  check('toNum: trailing space', toNum('42 '), 42)
  check('toNum: both spaces', toNum('  42  '), 42)

  // Invalid inputs
  check('toNum: empty string', toNum(''), null)
  check('toNum: whitespace only', toNum('   '), null)
  check('toNum: not a number', toNum('abc'), null)
  check('toNum: mixed', toNum('12abc'), null)
  check('toNum: double decimal', toNum('1.2.3'), null)
  check('toNum: expression', toNum('1+2'), null)
  check('toNum: Infinity string', toNum('Infinity'), null)
  check('toNum: NaN string', toNum('NaN'), null)
  check('toNum: non-string null', toNum(null), null)
  check('toNum: non-string number', toNum(42), null)
  check('toNum: non-string object', toNum({}), null)

  // ==========================================================================
  // formatNum quals (from reciplogic.js)
  // ==========================================================================
  console.log('\n=== formatNum quals ===')

  check('formatNum: integer', formatNum(42), '42')
  check('formatNum: negative', formatNum(-5), '-5')
  check('formatNum: zero', formatNum(0), '0')
  check('formatNum: negative zero', formatNum(-0), '0')
  check('formatNum: decimal', formatNum(3.14), '3.14')
  check('formatNum: trailing zeros trimmed', formatNum(3.10), '3.1')
  check('formatNum: four decimals', formatNum(3.1415), '3.1415')
  check('formatNum: more than four decimals truncated', formatNum(3.14159), '3.1416')

  // Snapping near integers
  check('formatNum: near integer snaps', formatNum(2.99999), '3')
  check('formatNum: near integer snaps 2', formatNum(3.00001), '3')
  check('formatNum: not close enough', formatNum(2.999), '2.999')

  // Edge cases
  check('formatNum: NaN', formatNum(NaN), '?')
  check('formatNum: Infinity', formatNum(Infinity), '?')
  check('formatNum: -Infinity', formatNum(-Infinity), '?')
  check('formatNum: null', formatNum(null), '')   // [NOQ] blank for no value
  check('formatNum: undefined', formatNum(undefined), '')  // [NOQ] blank for no value
  check('formatNum: string', formatNum('42'), '?')

  // Large/small numbers
  check('formatNum: large int', formatNum(1000000), '1000000')
  check('formatNum: small decimal', formatNum(0.0001), '0.0001')
  check('formatNum: very small', formatNum(0.00001), '0')  // Below precision

  // ==========================================================================
  // isFiniteNumber quals (from reciplogic.js)
  // ==========================================================================
  console.log('\n=== isFiniteNumber quals ===')

  check('isFiniteNumber: positive int', isFiniteNumber(42), true)
  check('isFiniteNumber: negative int', isFiniteNumber(-42), true)
  check('isFiniteNumber: zero', isFiniteNumber(0), true)
  check('isFiniteNumber: decimal', isFiniteNumber(3.14), true)
  check('isFiniteNumber: negative decimal', isFiniteNumber(-3.14), true)

  check('isFiniteNumber: NaN', isFiniteNumber(NaN), false)
  check('isFiniteNumber: Infinity', isFiniteNumber(Infinity), false)
  check('isFiniteNumber: -Infinity', isFiniteNumber(-Infinity), false)
  check('isFiniteNumber: null', isFiniteNumber(null), false)
  check('isFiniteNumber: undefined', isFiniteNumber(undefined), false)
  check('isFiniteNumber: string', isFiniteNumber('42'), false)
  check('isFiniteNumber: object', isFiniteNumber({}), false)
  check('isFiniteNumber: array', isFiniteNumber([42]), false)

  // ==========================================================================
  // tolerance quals
  // ==========================================================================
  console.log('\n=== tolerance quals ===')

  check('tolerance: zero value', tolerance(0, 1e-9), 1e-9)
  check('tolerance: positive value', tolerance(100, 1e-9), 100 * 1e-9 + 1e-9)
  check('tolerance: negative value', tolerance(-100, 1e-9), 100 * 1e-9 + 1e-9)
  check('tolerance: default absTol', tolerance(1000, 1e-6), 1000 * 1e-6 + 1e-6)
  check('tolerance: custom absTol', tolerance(1000, 1e-6, 1e-12), 1000 * 1e-6 + 1e-12)
  check('tolerance: large value', tolerance(1e9, 1e-9), 1e9 * 1e-9 + 1e-9)
  check('tolerance: small value', tolerance(1e-9, 1e-9), 1e-9 * 1e-9 + 1e-9)

  // ==========================================================================
  // Additional edge case quals
  // ==========================================================================
  console.log('\n=== Additional edge cases ===')

  // vareval with all math functions
  check('vareval: log(e)', vareval('log(exp(1))', {}).value, 1, 1e-9)
  check('vareval: exp(0)', vareval('exp(0)', {}).value, 1, 1e-9)
  check('vareval: sin(pi/2)', vareval('sin(3.14159/2)', {}).value, 1, 0.001)
  check('vareval: cos(pi)', vareval('cos(3.14159)', {}).value, -1, 0.001)
  check('vareval: tan(0)', vareval('tan(0)', {}).value, 0, 1e-9)
  check('vareval: asin(1)', vareval('asin(1)', {}).value, Math.PI/2, 0.001)
  check('vareval: acos(0)', vareval('acos(0)', {}).value, Math.PI/2, 0.001)
  check('vareval: atan(1)', vareval('atan(1)', {}).value, Math.PI/4, 0.001)

  // Complex nested expressions
  check('vareval: nested', vareval('sqrt(abs(-16))', {}).value, 4)
  check('vareval: chain', vareval('floor(ceil(3.5))', {}).value, 4)
  check('vareval: min of 3', vareval('min(5, min(3, 7))', {}).value, 3)
  check('vareval: max of 3', vareval('max(1, max(4, 2))', {}).value, 4)

  // preval edge cases
  // NOTE: scientific notation gets mangled (1e5 -> 1*e5) - known limitation
  // Use vareval directly for expressions with scientific notation
  check('preval: scientific notation mangled', preval('1e5'), '1*e5')
  check('preval: negative number', preval('-5'), '-5')
  check('preval: decimal only', preval('.5'), '.5')
  check('preval: leading zero', preval('0.5'), '0.5')
  check('preval: multiple operators', preval('a+b-c*d/e'), 'a+b-c*d/e')
  check('preval: nested parens', preval('((a+b))'), '((a+b))')
  check('preval: power of power', preval('a^b^c'), 'a**b**c')
  check('preval: negative exponent', preval('x^-2'), 'x**-2')

  // toNum edge cases
  check('toNum: plus sign', toNum('+42'), 42)
  check('toNum: very large', toNum('1e308'), 1e308)
  check('toNum: very small positive', toNum('1e-308'), 1e-308)
  check('toNum: hex not supported', toNum('0x10'), null)
  check('toNum: binary not supported', toNum('0b10'), null)

  // formatNum edge cases
  check('formatNum: small negative', formatNum(-0.0001), '-0.0001')
  check('formatNum: exactly 4 decimals', formatNum(1.2345), '1.2345')
  check('formatNum: integer from rounding', formatNum(0.99995), '1')

  // isbarevar edge cases
  check('isbarevar: single letter', isbarevar('a'), true)
  check('isbarevar: long name', isbarevar('thisIsAVeryLongVariableName'), true)
  check('isbarevar: with numbers in middle', isbarevar('a1b2c3'), true)
  check('isbarevar: special chars', isbarevar('a$b'), false)
  check('isbarevar: hyphen', isbarevar('a-b'), false)

  // varparse edge cases
  check('varparse: only numbers', varparse('123'), new Set())
  check('varparse: only operators', varparse('+ - * /'), new Set())
  check('varparse: mixed', varparse('a + 1 + b'), new Set(['a', 'b']))
  check('varparse: function call vars', varparse('sqrt(a) + log(b)'), new Set(['a', 'b']))
  check('varparse: complex nesting', varparse('a*(b+c)/(d-e)'), new Set(['a', 'b', 'c', 'd', 'e']))

  // isconstant edge cases
  check('isconstant: negative expression', isconstant('-5'), true)
  check('isconstant: complex arithmetic', isconstant('(2+3)*(4-1)'), true)
  check('isconstant: nested functions', isconstant('sqrt(abs(-16))'), true)
  check('isconstant: exp(0)', isconstant('exp(0)'), true)
  check('isconstant: undefined result', isconstant('sqrt(-1)'), false)

  // ==========================================================================
  // isCellViolated quals [NOQ]
  // ==========================================================================
  console.log('\n=== isCellViolated quals [NOQ] ===')

  // [NOQ]: null cval means "no value determined", not violated
  check('isCellViolated: null cval not violated',
    isCellViolated({ cval: null, ceqn: ['2x'] }, {}), false)
  check('isCellViolated: undefined cval not violated',
    isCellViolated({ cval: undefined, ceqn: ['2x'] }, {}), false)
  // NaN cval IS violated (computation error)
  check('isCellViolated: NaN cval is violated',
    isCellViolated({ cval: NaN, ceqn: ['x'] }, { x: 1 }), true)
  // Finite cval matching constraint is not violated
  check('isCellViolated: matching cval not violated',
    isCellViolated({ cval: 6, ceqn: ['2x'] }, { x: 3 }), false)
  // Finite cval NOT matching constraint IS violated
  check('isCellViolated: mismatched cval violated',
    isCellViolated({ cval: 5, ceqn: ['2x'] }, { x: 3 }), true)

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log('\n=== Utility Quals Summary ===')
  console.log(`Passed: ${results.passed}`)
  console.log(`Failed: ${results.failed}`)

  if (results.failed > 0) {
    console.log('Failures:', results.errors.join(', '))
    process.exitCode = 1
  }

  return results
}

runUtilQuals()
