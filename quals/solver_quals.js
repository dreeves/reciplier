/*
Solver quals runner.

Runs the solvem-focused qual set against the main solver in csolver.js

Usage:
  npm run quals           (runs this + browser quals)
  node quals/solver_quals.js   (runs just this)
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
    Int8Array,
    Float64Array,
    isFinite,
    parseFloat,
    eval,
    Date,
  }
  return vm.createContext(ctx)
}

function runAllSolverQuals(ctx) {
  const results = { passed: 0, failed: 0, errors: [] }

  const { vareval, varparse, preval, deoctalize, solveFor, unixtime, solvem, eqnsSatisfied, tolerance } = ctx

  function check(name, actual, expected, relTol = 0.001, replicata = null, expectata = null, resultata = null) {
    let passed = false
    if (typeof expected === 'object' && expected !== null) {
      const keys = Object.keys(expected)
      passed = keys.every(k => {
        if (actual[k] === undefined) return false
        if (typeof actual[k] === 'number' && typeof expected[k] === 'number') {
          // Use relative + absolute tolerance for numerical comparisons
          const tol = tolerance(expected[k], relTol, 1e-12)
          return Math.abs(actual[k] - expected[k]) < tol
        }
        return actual[k] === expected[k]
      })
      if (passed) {
        console.log(`✓ ${name}`)
        results.passed++
      } else {
        console.log(`✗ ${name}`)
        if (replicata) console.log('  Replicata:', replicata)
        if (expectata) console.log('  Expectata:', expectata)
        if (resultata) console.log('  Resultata:', resultata)
        if (!expectata || !resultata) {
          console.log('  Expected:', expected)
          console.log('  Got:', actual)
        }
        results.failed++
        results.errors.push(name)
      }
    } else {
      if (typeof actual === 'number' && typeof expected === 'number') {
        // Use relative + absolute tolerance for numerical comparisons
        const tol = tolerance(expected, relTol, 1e-12)
        passed = Math.abs(actual - expected) < tol
      } else {
        passed = actual === expected
      }
      if (passed) {
        console.log(`✓ ${name}`)
        results.passed++
      } else {
        console.log(`✗ ${name}: expected ${expected}, got ${actual}`)
        if (replicata) console.log('  Replicata:', replicata)
        if (expectata) console.log('  Expectata:', expectata)
        if (resultata) console.log('  Resultata:', resultata)
        results.failed++
        results.errors.push(name)
      }
    }
  }

  console.log('=== vareval quals ===')
  check('vareval: simple arithmetic', vareval('2+3', {}).value, 5)
  check('vareval: implicit multiplication', vareval('2x', {x: 5}).value, 10)
  check('vareval: exponentiation', vareval('x^2', {x: 3}).value, 9)
  check('vareval: sqrt function', vareval('sqrt(16)', {}).value, 4)
  check('vareval: unixtime epoch', vareval('unixtime(1970,1,1)', {}).value, 0)
  check('vareval: unixtime next day', vareval('unixtime(1970,1,2)', {}).value, 86400)
  check('vareval: complex expression', vareval('a^2 + b^2', {a: 3, b: 4}).value, 25)

  check('varparse: unixtime not a variable', varparse('unixtime(y,m,d)').has('unixtime'), false)

  console.log('\n=== preval quals ===')
  check('toJS: implicit mult', preval('2x'), '2*x')
  check('toJS: keeps var3 intact', preval('var3'), 'var3')
  check('toJS: power', preval('x^2').includes('**'), true)

  console.log('\n=== deoctalize quals ===')
  check('deoctalize: preserves 10', deoctalize('10'), '10')
  check('deoctalize: strips leading 0', deoctalize('010'), '10')
  check('deoctalize: preserves 100', deoctalize('100'), '100')
  check('deoctalize: preserves 1.05', deoctalize('1.05'), '1.05')

  console.log('\n=== solveFor quals ===')
  check('solveFor: linear', solveFor('2x', 'x', 10, {}), 5)
  check('solveFor: squared', solveFor('x^2', 'x', 25, {}), 5)
  check('solveFor: with other vars', solveFor('x + y', 'x', 10, {y: 3}), 7)
  check('solveFor: division d/t=15 finds t=4.4', solveFor('d/t', 't', 15, {d: 66}), 4.4, 1e-9)
  // Roots at 0.5 and 60: same sign at both ends of a wide bracket, so this
  // catches bracket searches that skip the narrow scales
  const rBracket = solveFor('(x-0.5)*(x-60)', 'x', 0, {x: 1000})
  check('solveFor: brackets small root despite far seed',
    rBracket, 0.5, 1e-6,
    "solveFor('(x-0.5)*(x-60)', 'x', 0, {x: 1000})",
    'should find the root 0.5 rather than fail to bracket',
    `solveFor returned ${rBracket}`)
  // Negative seed steers to the negative root (minimal-change principle)
  const rNegSeed = solveFor('x^2', 'x', 25, {x: -1})
  check('solveFor: negative seed finds negative root',
    rNegSeed, -5, 1e-9,
    "solveFor('x^2', 'x', 25, {x: -1})",
    'seed x=-1 should give -5, not +5',
    `solveFor returned ${rNegSeed}`)

  ;(() => {
    const tini = unixtime(2025, 12, 25)
    const tfin0 = unixtime(2026, 12, 25)
    const r = -1 / 86400
    const expectedTfin = tini + 259200
    const result = solveFor('(vfin-vini)/(tfin-tini)', 'tfin', r, {
      vfin: 70,
      vini: 73,
      tfin: tfin0,
      tini: tini
    })
    check('solveFor: dial rate eq finds tfin (tiny r)', result, expectedTfin, 1)
  })()

  ;(() => {
    const tini = unixtime(2025, 12, 25)
    const tfin0 = unixtime(2026, 12, 25)
    const r = -0.01 / 86400
    const expectedTfin = tini + 300 * 86400
    const result = solveFor('(vfin-vini)/(tfin-tini)', 'tfin', r, {
      vfin: 70,
      vini: 73,
      tfin: tfin0,
      tini: tini
    })
    check('solveFor: dial rate eq finds tfin (larger r)', result, expectedTfin, 1)
  })()

  console.log('\n=== solvem quals ===')

  // With seeding, both vars get seeded to 1, then solver finds a=2b
  const r1 = solvem([['a', '2b']], {a: null, b: null})
  check(
    'solvem: unconstrained a=2b equation true',
    r1.ass.a,
    2 * r1.ass.b,
    1e-9,
    'solvem([["a", "2b"]], {a: null, b: null})',
    'r.ass.a should equal 2*r.ass.b (within tolerance)',
    `r = ${JSON.stringify(r1)}`)
  check('solvem a=2b sat:true',
    r1.sat,
    true,
    0.001,
    'solvem([["a", "2b"]], {a: null, b: null})',
    'r1.sat should be true',
    `r1 = ${JSON.stringify(r1)}`)

  const r3 = solvem([['a+b', 8], ['a', 3], ['b', 4]], {a: null, b: null})
  check('solvem: README #2 (assignment)',
    r3.ass,
    {a: 3, b: 4},
    0.001,
    'solvem([["a+b", 8], ["a", 3], ["b", 4]], {a: null, b: null})',
    'r3.ass should equal {a: 3, b: 4}',
    `r3 = ${JSON.stringify(r3)}`)
  ;(() => {
    const eqns = [['a+b', 8], ['a', 3], ['b', 4]]
    const rep = solvem(eqns, {a: null, b: null})
    check('solvem: README #2 (sat)', rep.sat, false, 0.001,
      'solvem([["a+b", 8], ["a", 3], ["b", 4]], {a: null, b: null})',
      'rep.sat should be false',
      `rep = ${JSON.stringify(rep)}`)
    check('solvem: README #2 (zij[0] nonzero)', rep.zij[0] > 0, true, 0.001,
      'solvem([["a+b", 8], ["a", 3], ["b", 4]], {a: null, b: null})',
      'rep.zij[0] should be > 0',
      `rep = ${JSON.stringify(rep)}`)
    check('solvem: README #2 (zij[1..] zero)', rep.zij.slice(1).every(z => z === 0), true, 0.001,
      'solvem([["a+b", 8], ["a", 3], ["b", 4]], {a: null, b: null})',
      'rep.zij[1..] should all be zero',
      `rep = ${JSON.stringify(rep)}`)
  })()
  const r4 = solvem([['x', 5]], {x: 1})
  check('solvem: simple equation',
    r4.ass,
    {x: 5},
    0.001,
    'solvem([["x", 5]], {x: 1})',
    'r4.ass should equal {x: 5}',
    `r4 = ${JSON.stringify(r4)}`)

  // Note: solvem now throws if singletons are passed (anti-robustness).
  // Callers (initEqns, interactiveEqns) filter singletons before calling solvem.

  const r5 = solvem([['x^2', 9]], {x: 1})
  check('solvem: x^2=9 seeded with x=1 finds positive root',
    r5.ass,
    {x: 3},
    0.001,
    'solvem([["x^2", 9]], {x: 1})',
    'r5.ass should equal {x: 3}',
    `r5 = ${JSON.stringify(r5)}`)

  const r6 = solvem([['x', 5]], {x: 1})
  check('solvem: x=5 satisfied regardless of seed',
    r6.sat,
    true,
    0.001,
    'solvem([["x", 5]], {x: 1})',
    'r6.sat should be true',
    `r6 = ${JSON.stringify(r6)}`)

  const r7 = solvem([['x', 2], ['y', '3x']], {x: 1, y: 1})
  check('solvem: derived value',
    r7.ass,
    {x: 2, y: 6},
    0.001,
    'solvem([["x", 2], ["y", "3x"]], {x: 1, y: 1})',
    'r7.ass should equal {x: 2, y: 6}',
    `r7 = ${JSON.stringify(r7)}`)

  ;(() => {
    const eqns = [['x', 'a'], ['y', 'a*2']]
    const rep = solvem(eqns, {x: 1, y: 1, a: 1})
    check('solvem: underdetermined a drives x/y (sat)', rep.sat, true, 0.001,
      'solvem([["x", "a"], ["y", "a*2"]], {x: 1, y: 1, a: 1})',
      'rep.sat should be true',
      `rep = ${JSON.stringify(rep)}`)
    check('solvem: underdetermined a drives x/y (assignment)', rep.ass, {a: 1, x: 1, y: 2}, 0.001,
      'solvem([["x", "a"], ["y", "a*2"]], {x: 1, y: 1, a: 1})',
      'rep.ass should equal {a: 1, x: 1, y: 2}',
      `rep = ${JSON.stringify(rep)}`)
  })()

  const r8 = solvem([['2x+3y', 33], ['5x-4y', 2]], {x: 6, y: 0})
  check('solvem: simultaneous equations',
    r8.ass,
    {x: 6, y: 7},
    0.001,
    'solvem([["2x+3y", 33], ["5x-4y", 2]], {x: 6, y: 0})',
    'r8.ass should equal {x: 6, y: 7}',
    `r8 = ${JSON.stringify(r8)}`)

  const r9 = solvem([['2x+3y', 33], ['5x-4y', 2]], {x: 6, y: 0})
  check('solvem: README #3 (sat)',
    r9.sat,
    true,
    0.001,
    'solvem([["2x+3y", 33], ["5x-4y", 2]], {x: 6, y: 0})',
    'r9.sat should be true',
    `r9 = ${JSON.stringify(r9)}`)

  const r10 = solvem([['x', 1], ['a', '3x'], ['b', '4x'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 1, b: 1, c: 1, v1: 1})
  check('solvem: Pythagorean triple propagation',
    r10.ass,
    {x: 1, a: 3, b: 4, c: 5, v1: 25},
    0.001,
    'solvem([["x", 1], ["a", "3x"], ["b", "4x"], ["v1", "a^2+b^2", "c^2"]], {x: 1, a: 1, b: 1, c: 1, v1: 1})',
    'r10.ass should equal {x: 1, a: 3, b: 4, c: 5, v1: 25}',
    `r10 = ${JSON.stringify(r10)}`)

  ;(() => {
    const eqns = [
      ['x', 1],
      ['A', 'a*x'],
      ['B', 'b*x'],
      ['C', 'c*x'],
      ['A^2', 1],
      ['B^2', 1],
      ['A^2 + B^2', 'C^2'],
    ]
    const rep = solvem(eqns, {x: 1, A: 1, a: 1, B: 1, b: 1, C: 1, c: 1})
    check('solvem: sqrt(2) system #1 (sat)', rep.sat, true, 0.001,
      'solvem([["x", 1], ["A", "a*x"], ["B", "b*x"], ["C", "c*x"], ["A^2", 1], ["B^2", 1], ["A^2 + B^2", "C^2"]], {x: 1, A: 1, a: 1, B: 1, b: 1, C: 1, c: 1})',
      'rep.sat should be true',
      `rep = ${JSON.stringify(rep)}`)
    check('solvem: sqrt(2) system #1 (C,c)', {C: rep.ass.C, c: rep.ass.c}, {C: Math.SQRT2, c: Math.SQRT2}, 1e-9,
      'solvem([["x", 1], ["A", "a*x"], ["B", "b*x"], ["C", "c*x"], ["A^2", 1], ["B^2", 1], ["A^2 + B^2", "C^2"]], {x: 1, A: 1, a: 1, B: 1, b: 1, C: 1, c: 1})',
      'rep.ass.C and rep.ass.c should equal Math.SQRT2',
      `rep = ${JSON.stringify(rep)}`)
  })()

  // sqrt(2) system #2: no seeds (all null) - trivial solution is valid
  ;(() => {
    const eqns = [
      ['x', 1],
      ['A', 'a*x'],
      ['B', 'b*x'],
      ['C', 'c*x'],
      ['A^2 + B^2', 'C^2'],
    ]
    const rep = solvem(eqns, {x: 1, A: null, B: null, C: null, a: null, b: null, c: null})
    check('solvem: sqrt(2) system #2 (sat)', rep.sat, true, 0.001,
      'solvem([["x", 1], ["A", "a*x"], ["B", "b*x"], ["C", "c*x"], ["A^2 + B^2", "C^2"]], {x: 1, A: null, B: null, C: null, a: null, b: null, c: null})',
      'rep.sat should be true',
      `rep = ${JSON.stringify(rep)}`)
    // With no seeds, trivial solution (all zeros) is valid
    check('solvem: sqrt(2) system #2 Pythagorean',
      Math.abs(rep.ass.A**2 + rep.ass.B**2 - rep.ass.C**2) < 1e-9, true, 0.001,
      'solvem([["x", 1], ["A", "a*x"], ["B", "b*x"], ["C", "c*x"], ["A^2 + B^2", "C^2"]], {x: 1, A: null, B: null, C: null, a: null, b: null, c: null})',
      'Pythagorean equation should be satisfied',
      `rep = ${JSON.stringify(rep)}`)
  })()

  // sqrt(2) system: seed a=1 only
  ;(() => {
    const eqns = [
      ['x', 1],
      ['A', 'a*x'],
      ['B', 'b*x'],
      ['C', 'c*x'],
      ['A^2 + B^2', 'C^2'],
    ]
    const rep = solvem(eqns, {x: 1, a: 1, A: null, B: null, C: null, b: null, c: null})
    check('solvem: sqrt(2) seed a=1 (sat)', rep.sat, true, 0.001,
      'solvem([["x", 1], ["A", "a*x"], ["B", "b*x"], ["C", "c*x"], ["A^2 + B^2", "C^2"]], {x: 1, a: 1, A: null, B: null, C: null, b: null, c: null})',
      'rep.sat should be true',
      `rep = ${JSON.stringify(rep)}`)
    check('solvem: sqrt(2) seed a=1 preserves', rep.ass.a, 1, 1e-9,
      'solvem([["x", 1], ["A", "a*x"], ["B", "b*x"], ["C", "c*x"], ["A^2 + B^2", "C^2"]], {x: 1, a: 1, A: null, B: null, C: null, b: null, c: null})',
      'rep.ass.a should equal 1',
      `rep = ${JSON.stringify(rep)}`)
    check('solvem: sqrt(2) seed a=1 Pythagorean',
      Math.abs(rep.ass.A**2 + rep.ass.B**2 - rep.ass.C**2) < 1e-9, true, 0.001,
      'solvem([["x", 1], ["A", "a*x"], ["B", "b*x"], ["C", "c*x"], ["A^2 + B^2", "C^2"]], {x: 1, a: 1, A: null, B: null, C: null, b: null, c: null})',
      'Pythagorean equation should be satisfied',
      `rep = ${JSON.stringify(rep)}`)
  })()

  // sqrt(2) system: seed b=1 only
  ;(() => {
    const eqns = [
      ['x', 1],
      ['A', 'a*x'],
      ['B', 'b*x'],
      ['C', 'c*x'],
      ['A^2 + B^2', 'C^2'],
    ]
    const rep = solvem(eqns, {x: 1, b: 1, A: null, B: null, C: null, a: null, c: null})
    check('solvem: sqrt(2) seed b=1 (sat)', rep.sat, true, 0.001,
      'solvem([["x", 1], ["A", "a*x"], ["B", "b*x"], ["C", "c*x"], ["A^2 + B^2", "C^2"]], {x: 1, b: 1, A: null, B: null, C: null, a: null, c: null})',
      'rep.sat should be true',
      `rep = ${JSON.stringify(rep)}`)
    check('solvem: sqrt(2) seed b=1 preserves', rep.ass.b, 1, 1e-9,
      'solvem([["x", 1], ["A", "a*x"], ["B", "b*x"], ["C", "c*x"], ["A^2 + B^2", "C^2"]], {x: 1, b: 1, A: null, B: null, C: null, a: null, c: null})',
      'rep.ass.b should equal 1',
      `rep = ${JSON.stringify(rep)}`)
    check('solvem: sqrt(2) seed b=1 Pythagorean',
      Math.abs(rep.ass.A**2 + rep.ass.B**2 - rep.ass.C**2) < 1e-9, true, 0.001,
      'solvem([["x", 1], ["A", "a*x"], ["B", "b*x"], ["C", "c*x"], ["A^2 + B^2", "C^2"]], {x: 1, b: 1, A: null, B: null, C: null, a: null, c: null})',
      'Pythagorean equation should be satisfied',
      `rep = ${JSON.stringify(rep)}`)
  })()

  // sqrt(2) system: seed a=1, b=1 (should give c=√2)
  ;(() => {
    const eqns = [
      ['x', 1],
      ['A', 'a*x'],
      ['B', 'b*x'],
      ['C', 'c*x'],
      ['A^2 + B^2', 'C^2'],
    ]
    const rep = solvem(eqns, {x: 1, a: 1, b: 1, A: null, B: null, C: null, c: null})
    check('solvem: sqrt(2) seed a=1,b=1 (sat)', rep.sat, true, 0.001,
      'solvem([["x", 1], ["A", "a*x"], ["B", "b*x"], ["C", "c*x"], ["A^2 + B^2", "C^2"]], {x: 1, a: 1, b: 1, A: null, B: null, C: null, c: null})',
      'rep.sat should be true',
      `rep = ${JSON.stringify(rep)}`)
    check('solvem: sqrt(2) seed a=1,b=1 preserves a', rep.ass.a, 1, 1e-9,
      'solvem([["x", 1], ["A", "a*x"], ["B", "b*x"], ["C", "c*x"], ["A^2 + B^2", "C^2"]], {x: 1, a: 1, b: 1, A: null, B: null, C: null, c: null})',
      'rep.ass.a should equal 1',
      `rep = ${JSON.stringify(rep)}`)
    check('solvem: sqrt(2) seed a=1,b=1 preserves b', rep.ass.b, 1, 1e-9,
      'solvem([["x", 1], ["A", "a*x"], ["B", "b*x"], ["C", "c*x"], ["A^2 + B^2", "C^2"]], {x: 1, a: 1, b: 1, A: null, B: null, C: null, c: null})',
      'rep.ass.b should equal 1',
      `rep = ${JSON.stringify(rep)}`)
    check('solvem: sqrt(2) seed a=1,b=1 gives c=√2', rep.ass.c, Math.SQRT2, 1e-9,
      'solvem([["x", 1], ["A", "a*x"], ["B", "b*x"], ["C", "c*x"], ["A^2 + B^2", "C^2"]], {x: 1, a: 1, b: 1, A: null, B: null, C: null, c: null})',
      'rep.ass.c should equal Math.SQRT2',
      `rep = ${JSON.stringify(rep)}`)
  })()

  // sqrt(2) system: seed a=3, b=4 (3-4-5 triple)
  ;(() => {
    const eqns = [
      ['x', 1],
      ['A', 'a*x'],
      ['B', 'b*x'],
      ['C', 'c*x'],
      ['A^2 + B^2', 'C^2'],
    ]
    const rep = solvem(eqns, {x: 1, a: 3, b: 4, A: null, B: null, C: null, c: null})
    check('solvem: 3-4-5 seed a=3,b=4 (sat)', rep.sat, true, 0.001,
      'solvem([["x", 1], ["A", "a*x"], ["B", "b*x"], ["C", "c*x"], ["A^2 + B^2", "C^2"]], {x: 1, a: 3, b: 4, A: null, B: null, C: null, c: null})',
      'rep.sat should be true',
      `rep = ${JSON.stringify(rep)}`)
    check('solvem: 3-4-5 seed a=3,b=4 preserves a', rep.ass.a, 3, 1e-9,
      'solvem([["x", 1], ["A", "a*x"], ["B", "b*x"], ["C", "c*x"], ["A^2 + B^2", "C^2"]], {x: 1, a: 3, b: 4, A: null, B: null, C: null, c: null})',
      'rep.ass.a should equal 3',
      `rep = ${JSON.stringify(rep)}`)
    check('solvem: 3-4-5 seed a=3,b=4 preserves b', rep.ass.b, 4, 1e-9,
      'solvem([["x", 1], ["A", "a*x"], ["B", "b*x"], ["C", "c*x"], ["A^2 + B^2", "C^2"]], {x: 1, a: 3, b: 4, A: null, B: null, C: null, c: null})',
      'rep.ass.b should equal 4',
      `rep = ${JSON.stringify(rep)}`)
    check('solvem: 3-4-5 seed a=3,b=4 gives c=5', rep.ass.c, 5, 1e-9,
      'solvem([["x", 1], ["A", "a*x"], ["B", "b*x"], ["C", "c*x"], ["A^2 + B^2", "C^2"]], {x: 1, a: 3, b: 4, A: null, B: null, C: null, c: null})',
      'rep.ass.c should equal 5',
      `rep = ${JSON.stringify(rep)}`)
  })()

  // sqrt(2) system: seed A=1, B=1 (should give C=√2)
  ;(() => {
    const eqns = [
      ['x', 1],
      ['A', 'a*x'],
      ['B', 'b*x'],
      ['C', 'c*x'],
      ['A^2 + B^2', 'C^2'],
    ]
    const rep = solvem(eqns, {x: 1, A: 1, B: 1, a: null, b: null, C: null, c: null})
    check('solvem: sqrt(2) seed A=1,B=1 (sat)', rep.sat, true, 0.001,
      'solvem([["x", 1], ["A", "a*x"], ["B", "b*x"], ["C", "c*x"], ["A^2 + B^2", "C^2"]], {x: 1, A: 1, B: 1, a: null, b: null, C: null, c: null})',
      'rep.sat should be true',
      `rep = ${JSON.stringify(rep)}`)
    check('solvem: sqrt(2) seed A=1,B=1 preserves A', rep.ass.A, 1, 1e-9,
      'solvem([["x", 1], ["A", "a*x"], ["B", "b*x"], ["C", "c*x"], ["A^2 + B^2", "C^2"]], {x: 1, A: 1, B: 1, a: null, b: null, C: null, c: null})',
      'rep.ass.A should equal 1',
      `rep = ${JSON.stringify(rep)}`)
    check('solvem: sqrt(2) seed A=1,B=1 preserves B', rep.ass.B, 1, 1e-9,
      'solvem([["x", 1], ["A", "a*x"], ["B", "b*x"], ["C", "c*x"], ["A^2 + B^2", "C^2"]], {x: 1, A: 1, B: 1, a: null, b: null, C: null, c: null})',
      'rep.ass.B should equal 1',
      `rep = ${JSON.stringify(rep)}`)
    check('solvem: sqrt(2) seed A=1,B=1 gives C=√2', rep.ass.C, Math.SQRT2, 1e-9,
      'solvem([["x", 1], ["A", "a*x"], ["B", "b*x"], ["C", "c*x"], ["A^2 + B^2", "C^2"]], {x: 1, A: 1, B: 1, a: null, b: null, C: null, c: null})',
      'rep.ass.C should equal Math.SQRT2',
      `rep = ${JSON.stringify(rep)}`)
  })()

  // sqrt(2) system: seed c=5 (underdetermined, should preserve c)
  ;(() => {
    const eqns = [
      ['x', 1],
      ['A', 'a*x'],
      ['B', 'b*x'],
      ['C', 'c*x'],
      ['A^2 + B^2', 'C^2'],
    ]
    const rep = solvem(eqns, {x: 1, c: 5, A: null, B: null, C: null, a: null, b: null})
    check('solvem: sqrt(2) seed c=5 (sat)', rep.sat, true, 0.001,
      'solvem([["x", 1], ["A", "a*x"], ["B", "b*x"], ["C", "c*x"], ["A^2 + B^2", "C^2"]], {x: 1, c: 5, A: null, B: null, C: null, a: null, b: null})',
      'rep.sat should be true',
      `rep = ${JSON.stringify(rep)}`)
    check('solvem: sqrt(2) seed c=5 preserves', rep.ass.c, 5, 1e-9,
      'solvem([["x", 1], ["A", "a*x"], ["B", "b*x"], ["C", "c*x"], ["A^2 + B^2", "C^2"]], {x: 1, c: 5, A: null, B: null, C: null, a: null, b: null})',
      'rep.ass.c should equal 5',
      `rep = ${JSON.stringify(rep)}`)
    check('solvem: sqrt(2) seed c=5 Pythagorean',
      Math.abs(rep.ass.A**2 + rep.ass.B**2 - rep.ass.C**2) < 1e-9, true, 0.001,
      'solvem([["x", 1], ["A", "a*x"], ["B", "b*x"], ["C", "c*x"], ["A^2 + B^2", "C^2"]], {x: 1, c: 5, A: null, B: null, C: null, a: null, b: null})',
      'Pythagorean equation should be satisfied',
      `rep = ${JSON.stringify(rep)}`)
  })()

  // sqrt(2) system: seed a=5, c=13 (5-12-13 triple)
  ;(() => {
    const eqns = [
      ['x', 1],
      ['A', 'a*x'],
      ['B', 'b*x'],
      ['C', 'c*x'],
      ['A^2 + B^2', 'C^2'],
    ]
    const rep = solvem(eqns, {x: 1, a: 5, c: 13, A: null, B: null, C: null, b: null})
    check('solvem: 5-12-13 seed a=5,c=13 (sat)', rep.sat, true, 0.001,
      'solvem([["x", 1], ["A", "a*x"], ["B", "b*x"], ["C", "c*x"], ["A^2 + B^2", "C^2"]], {x: 1, a: 5, c: 13, A: null, B: null, C: null, b: null})',
      'rep.sat should be true',
      `rep = ${JSON.stringify(rep)}`)
    check('solvem: 5-12-13 seed a=5,c=13 preserves a', rep.ass.a, 5, 1e-9,
      'solvem([["x", 1], ["A", "a*x"], ["B", "b*x"], ["C", "c*x"], ["A^2 + B^2", "C^2"]], {x: 1, a: 5, c: 13, A: null, B: null, C: null, b: null})',
      'rep.ass.a should equal 5',
      `rep = ${JSON.stringify(rep)}`)
    check('solvem: 5-12-13 seed a=5,c=13 preserves c', rep.ass.c, 13, 1e-9,
      'solvem([["x", 1], ["A", "a*x"], ["B", "b*x"], ["C", "c*x"], ["A^2 + B^2", "C^2"]], {x: 1, a: 5, c: 13, A: null, B: null, C: null, b: null})',
      'rep.ass.c should equal 13',
      `rep = ${JSON.stringify(rep)}`)
    check('solvem: 5-12-13 seed a=5,c=13 gives b=12', rep.ass.b, 12, 1e-9,
      'solvem([["x", 1], ["A", "a*x"], ["B", "b*x"], ["C", "c*x"], ["A^2 + B^2", "C^2"]], {x: 1, a: 5, c: 13, A: null, B: null, C: null, b: null})',
      'rep.ass.b should equal 12',
      `rep = ${JSON.stringify(rep)}`)
  })()

  const r11 = solvem([['x', 1], ['a', '3x'], ['b', '4x'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 1, b: 1, c: 1, v1: 1})
  check('solvem: README #4 (sat)',
    r11.sat,
    true,
    0.001,
    'solvem([["x", 1], ["a", "3x"], ["b", "4x"], ["v1", "a^2+b^2", "c^2"]], {x: 1, a: 1, b: 1, c: 1, v1: 1})',
    'r11.sat should be true',
    `r11 = ${JSON.stringify(r11)}`)

  const r12 = solvem([['a', 30], ['a', '3x'], ['b', '4x'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 30, b: 1, c: 1, v1: 1})
  check('solvem: pyzza change a to 30',
    r12.ass,
    {x: 10, a: 30, b: 40, c: 50, v1: 2500},
    0.001,
    'solvem([["a", 30], ["a", "3x"], ["b", "4x"], ["v1", "a^2+b^2", "c^2"]], {x: 1, a: 30, b: 1, c: 1, v1: 1})',
    'r12.ass should equal {x: 10, a: 30, b: 40, c: 50, v1: 2500}',
    `r12 = ${JSON.stringify(r12)}`)

  const r13 = solvem([['b', 40], ['a', '3x'], ['b', '4x'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 1, b: 40, c: 1, v1: 1})
  check('solvem: pyzza change b to 40',
    r13.ass,
    {x: 10, a: 30, b: 40, c: 50, v1: 2500},
    0.001,
    'solvem([["b", 40], ["a", "3x"], ["b", "4x"], ["v1", "a^2+b^2", "c^2"]], {x: 1, a: 1, b: 40, c: 1, v1: 1})',
    'r13.ass should equal {x: 10, a: 30, b: 40, c: 50, v1: 2500}',
    `r13 = ${JSON.stringify(r13)}`)

  const r14 = solvem([['c', 50], ['a', '3x'], ['b', '4x'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 1, b: 1, c: 50, v1: 1})
  check('solvem: pyzza change c to 50',
    r14.ass,
    {x: 10, a: 30, b: 40, c: 50, v1: 2500},
    0.001,
    'solvem([["c", 50], ["a", "3x"], ["b", "4x"], ["v1", "a^2+b^2", "c^2"]], {x: 1, a: 1, b: 1, c: 50, v1: 1})',
    'r14.ass should equal {x: 10, a: 30, b: 40, c: 50, v1: 2500}',
    `r14 = ${JSON.stringify(r14)}`)

  ;(() => {
    // UI-style test: singletons like ['x'] for display-only cells should be
    // filtered out before calling solvem. This test omits them.
    const eqns = [
      ['a', '3x'],
      ['b', '4x'],
      ['c', 50],
      ['_var001', 'a'],
      ['_var002', 'b'],
      ['_var003', 'a^2'],
      ['_var004', 'b^2'],
      ['_var005', 'a^2 + b^2', 'c^2'],
    ]
    const rep = solvem(eqns, {
      x: 1,
      a: 1,
      b: 1,
      c: 50,
      _var001: null,
      _var002: null,
      _var003: null,
      _var004: null,
      _var005: null,
    })
    check('solvem: Pyzza UI-style c=50 (sat)', rep.sat, true, 0.001,
      'solvem([["a", "3x"], ["b", "4x"], ["c", 50], ["_var001", "a"], ["_var002", "b"], ["_var003", "a^2"], ["_var004", "b^2"], ["_var005", "a^2 + b^2", "c^2"]], {x: 1, a: 1, b: 1, c: 50, _var001: null, _var002: null, _var003: null, _var004: null, _var005: null})',
      'rep.sat should be true',
      `rep = ${JSON.stringify(rep)}`)
    check('solvem: Pyzza UI-style c=50 (assignment)', rep.ass, {x: 10, a: 30, b: 40, c: 50}, 0.05,
      'solvem([["a", "3x"], ["b", "4x"], ["c", 50], ["_var001", "a"], ["_var002", "b"], ["_var003", "a^2"], ["_var004", "b^2"], ["_var005", "a^2 + b^2", "c^2"]], {x: 1, a: 1, b: 1, c: 50, _var001: null, _var002: null, _var003: null, _var004: null, _var005: null})',
      'rep.ass should approximately equal {x: 10, a: 30, b: 40, c: 50}',
      `rep = ${JSON.stringify(rep)}`)
  })()

  ;(() => {
    const eqns = [
      ['C', 5],
      ['A^2 + B^2', 'C^2'],
    ]
    const rep = solvem(eqns, {A: 6, B: 6, C: null})
    check('solvem: literal pin without seed (sat)', rep.sat, true, 0.001,
      'solvem([["C", 5], ["A^2 + B^2", "C^2"]], {A: 6, B: 6, C: null})',
      'rep.sat should be true',
      `rep = ${JSON.stringify(rep)}`)
    check('solvem: literal pin without seed (C=5)', rep.ass.C, 5, 1e-9,
      'solvem([["C", 5], ["A^2 + B^2", "C^2"]], {A: 6, B: 6, C: null})',
      'rep.ass.C should equal 5',
      `rep = ${JSON.stringify(rep)}`)
    check('solvem: literal pin without seed (eqnsSatisfied)', eqnsSatisfied(eqns, rep.ass), true, 0.001,
      'solvem([["C", 5], ["A^2 + B^2", "C^2"]], {A: 6, B: 6, C: null})',
      'eqnsSatisfied should be true',
      `rep = ${JSON.stringify(rep)}`)
  })()

  ;(() => {
    const eqns = [
      ['C', 5],
      ['A^2 + B^2', 'C^2'],
    ]
    const cases = [
      { name: 'seed A=10 B=10 C=null', vars: { A: 10, B: 10, C: null } },
      { name: 'seed A=10 B=10 C=5', vars: { A: 10, B: 10, C: 5 } },
      { name: 'seed A=6 B=6 C=null', vars: { A: 6, B: 6, C: null } },
      { name: 'seed A=6 B=6 C=5', vars: { A: 6, B: 6, C: 5 } },
      { name: 'seed A=1 B=1 C=null', vars: { A: 1, B: 1, C: null } },
      { name: 'seed A=1 B=1 C=5', vars: { A: 1, B: 1, C: 5 } },
    ]
    for (const tc of cases) {
      const rep = solvem(eqns, tc.vars)
      check(`solvem: C pin from pyzza-ish ${tc.name} (sat)`, rep.sat, true, 0.001,
        `solvem([["C", 5], ["A^2 + B^2", "C^2"]], ${JSON.stringify(tc.vars)})`,
        'rep.sat should be true',
        `rep = ${JSON.stringify(rep)}`)
      check(`solvem: C pin from pyzza-ish ${tc.name} (C=5)`, rep.ass.C, 5, 1e-9,
        `solvem([["C", 5], ["A^2 + B^2", "C^2"]], ${JSON.stringify(tc.vars)})`,
        'rep.ass.C should equal 5',
        `rep = ${JSON.stringify(rep)}`)
      check(`solvem: C pin from pyzza-ish ${tc.name} (eqnsSatisfied)`, eqnsSatisfied(eqns, rep.ass), true, 0.001,
        `solvem([["C", 5], ["A^2 + B^2", "C^2"]], ${JSON.stringify(tc.vars)})`,
        'eqnsSatisfied should be true',
        `rep = ${JSON.stringify(rep)}`)
    }
  })()

  ;(() => {
    const eqns = [
      ['a', '3x'],
      ['b', '4x'],
      ['a^2 + b^2', 'c^2'],
      ['C', 5],
      ['A^2 + B^2', 'C^2'],
    ]
    const cases = [
      { name: 'seed C from A=B=10', vars: { x: 1, a: 3, b: 4, c: 5, A: 10, B: 10, C: 14.142135623730951 } },
      { name: 'seed C pinned already', vars: { x: 1, a: 3, b: 4, c: 5, A: 10, B: 10, C: 5 } },
      { name: 'seed C from A=B=6', vars: { x: 1, a: 3, b: 4, c: 5, A: 6, B: 6, C: 8.48528137423857 } },
      { name: 'seed C from A=B=1', vars: { x: 1, a: 3, b: 4, c: 5, A: 1, B: 1, C: 1.4142135623730951 } },
    ]
    for (const tc of cases) {
      const rep = solvem(eqns, tc.vars)
      check(`solvem: pyzza seed shift ${tc.name} (sat)`, rep.sat, true, 0.001,
        `solvem([["a", "3x"], ["b", "4x"], ["a^2 + b^2", "c^2"], ["C", 5], ["A^2 + B^2", "C^2"]], ${JSON.stringify(tc.vars)})`,
        'rep.sat should be true',
        `rep = ${JSON.stringify(rep)}`)
      check(`solvem: pyzza seed shift ${tc.name} (C=5)`, rep.ass.C, 5, 1e-9,
        `solvem([["a", "3x"], ["b", "4x"], ["a^2 + b^2", "c^2"], ["C", 5], ["A^2 + B^2", "C^2"]], ${JSON.stringify(tc.vars)})`,
        'rep.ass.C should equal 5',
        `rep = ${JSON.stringify(rep)}`)
      check(`solvem: pyzza seed shift ${tc.name} (eqnsSatisfied)`, eqnsSatisfied(eqns, rep.ass), true, 0.001,
        `solvem([["a", "3x"], ["b", "4x"], ["a^2 + b^2", "c^2"], ["C", 5], ["A^2 + B^2", "C^2"]], ${JSON.stringify(tc.vars)})`,
        'eqnsSatisfied should be true',
        `rep = ${JSON.stringify(rep)}`)
    }
  })()

  ;(() => {
    const eqns = [
      ['x', 2.5],
      ['a', '3x'],
      ['b', '4x'],
      ['_v', 'a^2+b^2', 'c^2'],
    ]
    const rep = solvem(eqns, {x: 2.5, a: 1, b: 1, c: 1, _v: 1})
    check('solvem: pyzza x=2.5 (sat)', rep.sat, true, 0.001,
      'solvem([["x", 2.5], ["a", "3x"], ["b", "4x"], ["_v", "a^2+b^2", "c^2"]], {x: 2.5, a: 1, b: 1, c: 1, _v: 1})',
      'rep.sat should be true',
      `rep = ${JSON.stringify(rep)}`)
    check('solvem: pyzza x=2.5 (assignment)', rep.ass, {x: 2.5, a: 7.5, b: 10, c: 12.5, _v: 156.25}, 0.001,
      'solvem([["x", 2.5], ["a", "3x"], ["b", "4x"], ["_v", "a^2+b^2", "c^2"]], {x: 2.5, a: 1, b: 1, c: 1, _v: 1})',
      'rep.ass should equal {x: 2.5, a: 7.5, b: 10, c: 12.5, _v: 156.25}',
      `rep = ${JSON.stringify(rep)}`)
  })()

  ;(() => {
    const eqns = [
      ['v1', 625],
      ['a', '3x'],
      ['b', '4x'],
      ['_v', 'a^2+b^2', 'v1'],
      ['_w', 'c^2', 'v1'],
    ]
    const rep = solvem(eqns, {x: 1, a: 1, b: 1, c: 1, v1: 1, _v: 1, _w: 1})
    check('solvem: pyzza v1=625 (sat)', rep.sat, true, 0.001,
      'solvem([["v1", 625], ["a", "3x"], ["b", "4x"], ["_v", "a^2+b^2", "v1"], ["_w", "c^2", "v1"]], {x: 1, a: 1, b: 1, c: 1, v1: 1, _v: 1, _w: 1})',
      'rep.sat should be true',
      `rep = ${JSON.stringify(rep)}`)
    check('solvem: pyzza v1=625 (assignment)', rep.ass, {x: 5, a: 15, b: 20, c: 25, v1: 625}, 0.01,
      'solvem([["v1", 625], ["a", "3x"], ["b", "4x"], ["_v", "a^2+b^2", "v1"], ["_w", "c^2", "v1"]], {x: 1, a: 1, b: 1, c: 1, v1: 1, _v: 1, _w: 1})',
      'rep.ass should approximately equal {x: 5, a: 15, b: 20, c: 25, v1: 625}',
      `rep = ${JSON.stringify(rep)}`)
  })()

  const r15 = solvem([['a', 2], ['b', 'a+1'], ['c', 'b+1']], {a: 1, b: 1, c: 1})
  check('solvem: chain propagation',
    r15.ass,
    {a: 2, b: 3, c: 4},
    0.001,
    'solvem([["a", 2], ["b", "a+1"], ["c", "b+1"]], {a: 1, b: 1, c: 1})',
    'r15.ass should equal {a: 2, b: 3, c: 4}',
    `r15 = ${JSON.stringify(r15)}`)

  const r16 = solvem([['x', 2], ['scaled', '10x']], {x: 1, scaled: 1})
  check('solvem: scaling factor',
    r16.ass,
    {x: 2, scaled: 20},
    0.001,
    'solvem([["x", 2], ["scaled", "10x"]], {x: 1, scaled: 1})',
    'r16.ass should equal {x: 2, scaled: 20}',
    `r16 = ${JSON.stringify(r16)}`)

  const r17 = solvem([
      ['eggs', 24, '12x'],
      ['milk', '5.333x'],
      ['flour', '3x'],
    ], {x: 1, eggs: 12, milk: 5.333, flour: 3})
  check('solvem: crepes eggs implies x',
    r17.ass,
    {x: 2, eggs: 24, milk: 10.666, flour: 6},
    0.001,
    'solvem([["eggs", 24, "12x"], ["milk", "5.333x"], ["flour", "3x"]], {x: 1, eggs: 12, milk: 5.333, flour: 3})',
    'r17.ass should equal {x: 2, eggs: 24, milk: 10.666, flour: 6}',
    `r17 = ${JSON.stringify(r17)}`)

  const r18 = solvem([['x', 1], ['eggs', '12x', 24]], {x: 1, eggs: 12})
  check('solvem: pegged x makes eggs unsatisfiable',
    eqnsSatisfied(
      [['x', 1], ['eggs', '12x', 24]],
      r18.ass
    ),
    false,
    0.001,
    'solvem([["x", 1], ["eggs", "12x", 24]], {x: 1, eggs: 12})',
    'eqnsSatisfied should be false',
    `r18 = ${JSON.stringify(r18)}`)

  const r19 = solvem([
      ['A', 63.585],
      ['r', 'd/2'],
      ['_v', 'A', '1/2*6.28*r^2'],
    ], {A: 63.585, r: 1, d: 1, _v: 1})
  check('solvem: chain derivation from area to diameter',
    r19.ass,
    {A: 63.585, r: 4.5, d: 9},
    0.001,
    'solvem([["A", 63.585], ["r", "d/2"], ["_v", "A", "1/2*6.28*r^2"]], {A: 63.585, r: 1, d: 1, _v: 1})',
    'r19.ass should equal {A: 63.585, r: 4.5, d: 9}',
    `r19 = ${JSON.stringify(r19)}`)

  const r20 = solvem([
      ['d1', 9], ['r1', 'd1/2'], ['tau', 6.28], ['x', 1],
      ['r', 'd/2'],
      ['_v', 'A', '1/2*tau*r^2', '1/2*tau*r1^2*x'],
    ], {d1: 9, r1: 1, tau: 6.28, x: 1, r: 1, d: 1, A: 1, _v: 1})
  check('solvem: cheesepan r1 derivation',
    r20.ass,
    {d1: 9, r1: 4.5, tau: 6.28, x: 1, r: 4.5, d: 9, A: 63.585, _v: 63.585},
    0.001,
    'solvem([["d1", 9], ["r1", "d1/2"], ["tau", 6.28], ["x", 1], ["r", "d/2"], ["_v", "A", "1/2*tau*r^2", "1/2*tau*r1^2*x"]], {d1: 9, r1: 1, tau: 6.28, x: 1, r: 1, d: 1, A: 1, _v: 1})',
    'r20.ass should equal {d1: 9, r1: 4.5, tau: 6.28, x: 1, r: 4.5, d: 9, A: 63.585, _v: 63.585}',
    `r20 = ${JSON.stringify(r20)}`)

  const r21 = solvem([
      ['d1', 9], ['r1', 'd1/2'], ['tau', 6.28], ['x', 1],
      ['r', 'd/2'],
      ['_v', 'A', '1/2*tau*r^2', '1/2*tau*r1^2*x'],
    ], {d1: 9, r1: 1, tau: 6.28, x: 1, r: 1, d: 1, A: 1, _v: 1})
  check('solvem: cheesepan r1 with x pegged at 1',
    r21.ass,
    {d1: 9, r1: 4.5, tau: 6.28, x: 1, r: 4.5, d: 9, A: 63.585, _v: 63.585},
    0.001,
    'solvem([["d1", 9], ["r1", "d1/2"], ["tau", 6.28], ["x", 1], ["r", "d/2"], ["_v", "A", "1/2*tau*r^2", "1/2*tau*r1^2*x"]], {d1: 9, r1: 1, tau: 6.28, x: 1, r: 1, d: 1, A: 1, _v: 1})',
    'r21.ass should equal {d1: 9, r1: 4.5, tau: 6.28, x: 1, r: 4.5, d: 9, A: 63.585, _v: 63.585}',
    `r21 = ${JSON.stringify(r21)}`)

  const r22 = solvem([['d', 10], ['r', 'd/2']], {d: 10, r: 1})
  check('solvem: r=d/2 derives r from d',
    r22.ass,
    {d: 10, r: 5},
    0.001,
    'solvem([["d", 10], ["r", "d/2"]], {d: 10, r: 1})',
    'r22.ass should equal {d: 10, r: 5}',
    `r22 = ${JSON.stringify(r22)}`)

  const r23 = solvem([['r', 5], ['d', '2*r']], {d: 1, r: 5})
  check('solvem: d=2r derives d from r',
    r23.ass,
    {d: 10, r: 5},
    0.001,
    'solvem([["r", 5], ["d", "2*r"]], {d: 1, r: 5})',
    'r23.ass should equal {d: 10, r: 5}',
    `r23 = ${JSON.stringify(r23)}`)

  const r24 = solvem([['a+b', 8]], {a: 4, b: null})
  check('solvem: prefers explicit initial guess',
    r24.ass,
    {a: 4, b: 4},
    0.001,
    'solvem([["a+b", 8]], {a: 4, b: null})',
    'r24.ass should equal {a: 4, b: 4}',
    `r24 = ${JSON.stringify(r24)}`)

  // solvem throws if non-empty init is missing required variables (anti-robustness)
  check('solvem: throws on partial init',
    (() => {
      let threw = false
      try {
        solvem([['a+b+c', 8]], {a: 4, b: null})  // c is missing
      } catch (e) {
        threw = e.message.includes('"c"')
      }
      return threw
    })(),
    true,
    0.001,
    'try { solvem([["a+b+c", 8]], {a: 4, b: null}) } catch (e) { ... }',
    'Should throw error mentioning "c"',
    'threw = true')

  // Seeding from bounds: both bounds → midpoint
  // No seeds → defaults to 1
  check('solvem: defaults to 1 without seeds',
    (() => {
      const result = solvem([['x', 'y']], {})
      return result.ass.x === 1 && result.ass.y === 1
    })(),
    true,
    0.001,
    'solvem([["x", "y"]], {})',
    'result.ass.x and result.ass.y should both equal 1',
    'result.ass.x === 1 && result.ass.y === 1')

  // Equation satisfied regardless of seed value
  check('solvem: equation satisfied regardless of seed',
    (() => {
      const result = solvem([['x', 'y']], {})
      return result.sat && result.ass.x === result.ass.y
    })(),
    true,
    0.001,
    'solvem([["x", "y"]], {})',
    'result.sat should be true and result.ass.x should equal result.ass.y',
    'result.sat && result.ass.x === result.ass.y')

  // Seeding with no bounds → default to 1
  check('solvem: seeds to 1 without explicit init',
    (() => {
      const result = solvem([['x', 'y']], {})
      return result.ass.x === 1 && result.ass.y === 1
    })(),
    true,
    0.001,
    'solvem([["x", "y"]], {})',
    'result.ass.x and result.ass.y should both equal 1',
    'result.ass.x === 1 && result.ass.y === 1')

  // Explicit seed x=3 → progressive relaxation tries x=3 as constraint
  check('solvem: explicit seed x=3, satisfies x=y',
    (() => {
      const result = solvem([['x', 'y']], {x: 3, y: null})
      // x=3 seeded, solver should find y=3 to satisfy x=y
      return result.sat && result.ass.x === 3 && result.ass.y === 3
    })(),
    true,
    0.001,
    'solvem([["x", "y"]], {x: 3, y: null})',
    'result.sat should be true and x=3, y=3',
    'result.sat && result.ass.x === 3 && result.ass.y === 3')

  // Explicit seed x=5, y=5 → both seeds satisfy x=y
  check('solvem: explicit seeds x=5, y=5 satisfy x=y',
    (() => {
      const result = solvem([['x', 'y']], {x: 5, y: 5})
      return result.sat && result.ass.x === 5 && result.ass.y === 5
    })(),
    true,
    0.001,
    'solvem([["x", "y"]], {x: 5, y: 5})',
    'result.sat should be true and x=5, y=5',
    'result.sat && result.ass.x === 5 && result.ass.y === 5')

  // Conflicting seeds x=3, y=7 → progressive relaxation resolves
  check('solvem: conflicting seeds x=3, y=7',
    (() => {
      const result = solvem([['x', 'y']], {x: 3, y: 7})
      // Ordered seeds: [x, y] alphabetically. Remove x first, try with y=7 → finds x=7, y=7
      return result.sat && result.ass.x === 7 && result.ass.y === 7
    })(),
    true,
    0.001,
    'solvem([["x", "y"]], {x: 3, y: 7})',
    'result.sat should be true and x=7, y=7',
    'result.sat && result.ass.x === 7 && result.ass.y === 7')

  // Seed x=2 satisfies equation x=y
  check('solvem: seed x=2 satisfies x=y',
    (() => {
      const result = solvem([['x', 'y']], {x: 2, y: null})
      return result.sat && result.ass.x === 2 && result.ass.y === 2
    })(),
    true,
    0.001,
    'solvem([["x", "y"]], {x: 2, y: null})',
    'result.sat should be true and x=2, y=2',
    'result.sat && result.ass.x === 2 && result.ass.y === 2')

  // Seed x=10 → progressive relaxation keeps it if it satisfies equations
  check('solvem: seed x=10 satisfies x=y',
    (() => {
      const result = solvem([['x', 'y']], {x: 10, y: null})
      return result.sat && result.ass.x === 10 && result.ass.y === 10
    })(),
    true,
    0.001,
    'solvem([["x", "y"]], {x: 10, y: null})',
    'result.sat should be true and x=10, y=10',
    'result.sat && result.ass.x === 10 && result.ass.y === 10')

  // Three variables: x=y=z with seed x=4
  check('solvem: three vars x=y=z with seed x=4',
    (() => {
      const result = solvem([['x', 'y'], ['y', 'z']], {x: 4, y: null, z: null}, {}, {})
      return result.sat && result.ass.x === 4 && result.ass.y === 4 && result.ass.z === 4
    })(),
    true,
    0.001,
    'solvem([["x", "y"], ["y", "z"]], {x: 4, y: null, z: null}, {}, {})',
    'result.sat should be true and x=4, y=4, z=4',
    'result.sat && result.ass.x === 4 && result.ass.y === 4 && result.ass.z === 4')

  // Three variables: x=y=z with conflicting seeds x=2, z=8
  check('solvem: three vars x=y=z with conflicting seeds x=2, z=8',
    (() => {
      const result = solvem([['x', 'y'], ['y', 'z']], {x: 2, y: null, z: 8}, {}, {})
      // Ordered seeds: [x, z] alphabetically. Remove x first, try with z=8 → finds x=8, y=8, z=8
      return result.sat && result.ass.x === 8 && result.ass.y === 8 && result.ass.z === 8
    })(),
    true,
    0.001,
    'solvem([["x", "y"], ["y", "z"]], {x: 2, y: null, z: 8}, {}, {})',
    'result.sat should be true and x=8, y=8, z=8',
    'result.sat && result.ass.x === 8 && result.ass.y === 8 && result.ass.z === 8')

  // Pythagorean with seed a=6 (should find x=2, b=8, c=10)
  check('solvem: Pythagorean seed a=6',
    (() => {
      const eqns = [
        ['a', '3x'],
        ['b', '4x'],
        ['_v', 'a^2+b^2', 'c^2'],
      ]
      const result = solvem(eqns, {x: null, a: 6, b: null, c: null, _v: null}, {}, {})
      // Seed a=6 implies x=2, so b=8, c=10
      return result.sat && Math.abs(result.ass.x - 2) < 1e-9 &&
             Math.abs(result.ass.a - 6) < 1e-9 &&
             Math.abs(result.ass.b - 8) < 1e-9 &&
             Math.abs(result.ass.c - 10) < 1e-9
    })(),
    true,
    0.001,
    'solvem([["a", "3x"], ["b", "4x"], ["_v", "a^2+b^2", "c^2"]], {x: null, a: 6, b: null, c: null, _v: null}, {}, {})',
    'result should have x=2, a=6, b=8, c=10',
    'result.sat && x≈2 && a≈6 && b≈8 && c≈10')

  // Pythagorean with seed c=5 (should find a=3, b=4)
  check('solvem: Pythagorean seed c=5',
    (() => {
      const eqns = [
        ['x', 1],
        ['a', '3x'],
        ['b', '4x'],
        ['_v', 'a^2+b^2', 'c^2'],
      ]
      const result = solvem(eqns, {x: 1, a: 1, b: 1, c: 5, _v: 1}, {}, {})
      return result.sat && Math.abs(result.ass.a - 3) < 1e-9 &&
             Math.abs(result.ass.b - 4) < 1e-9 &&
             Math.abs(result.ass.c - 5) < 1e-9
    })(),
    true,
    0.001,
    'solvem([["x", 1], ["a", "3x"], ["b", "4x"], ["_v", "a^2+b^2", "c^2"]], {x: 1, a: 1, b: 1, c: 5, _v: 1}, {}, {})',
    'result should have a=3, b=4, c=5',
    'result.sat && a≈3 && b≈4 && c≈5')

  // [ZSR] Pythagorean with c=5 in equations, null seeds
  // Regression test for README.md [ZSR] bug
  check('solvem: [ZSR] Pythagorean c=5 in eqns, null seeds should find 3-4-5',
    (() => {
      const eqns = [
        ['a', '3x'],
        ['b', '4x'],
        ['c', 5],
        ['a^2 + b^2', 'c^2'],
      ]
      const result = solvem(eqns, {x: null, a: null, b: null, c: null}, {}, {})
      return result.sat &&
             Math.abs(result.ass.x - 1) < 1e-9 &&
             Math.abs(result.ass.a - 3) < 1e-9 &&
             Math.abs(result.ass.b - 4) < 1e-9 &&
             Math.abs(result.ass.c - 5) < 1e-9
    })(),
    true,
    0.001,
    'solvem([["a", "3x"], ["b", "4x"], ["c", 5], ["a^2 + b^2", "c^2"]], {x: null, a: null, b: null, c: null}, {}, {})',
    'result should have x=1, a=3, b=4, c=5',
    'result.sat && x≈1 && a≈3 && b≈4 && c≈5')

  // Pythagorean with conflicting seeds a=5, c=5
  check('solvem: Pythagorean conflicting seeds a=5, c=5',
    (() => {
      const eqns = [
        ['x', 1],
        ['a', '3x'],
        ['b', '4x'],
        ['_v', 'a^2+b^2', 'c^2'],
      ]
      const result = solvem(eqns, {x: 1, a: 5, b: 1, c: 5, _v: 1}, {}, {})
      // a=5 implies x=5/3, c=25/3; c=5 implies x=1, a=3
      // These conflict, so progressive relaxation removes them
      return result.sat && Math.abs(result.ass.x - 1) < 1e-9
    })(),
    true,
    0.001,
    'solvem([["x", 1], ["a", "3x"], ["b", "4x"], ["_v", "a^2+b^2", "c^2"]], {x: 1, a: 5, b: 1, c: 5, _v: 1}, {}, {})',
    'result should have x=1 after progressive relaxation',
    'result.sat && x≈1')

  // Bounds not enforced: equation satisfied regardless of bound
  // Null seeds are filtered out, solver finds solution to x=y
  const rNullSeed = solvem([['x', 'y']], {x: null, y: null})
  check('solvem: null seeds are ignored, equation still satisfied',
    rNullSeed.sat && Math.abs(rNullSeed.ass.x - rNullSeed.ass.y) < 1e-6,
    true,
    0.001,
    'solvem([["x", "y"]], {x: null, y: null})',
    'result.sat should be true and x should equal y (within tolerance)',
    `result = ${JSON.stringify(rNullSeed)}`)

  // More zero seed scenarios
  ;(() => {
    const result = solvem([['x/y', 5]], {x: 0, y: 0})
    check('solvem: zero seeds with division x/y=5 (sat)', result.sat, true, 0.001,
      'solvem([["x/y", 5]], {x: 0, y: 0})',
      'result.sat should be true',
      `result = ${JSON.stringify(result)}`)
    check('solvem: zero seeds with division x/y=5 (ratio)', result.ass.x / result.ass.y, 5, 1e-6,
      'solvem([["x/y", 5]], {x: 0, y: 0})',
      'result.ass.x / result.ass.y should equal 5',
      `result = ${JSON.stringify(result)}`)
  })()

  check('solvem: zero seeds with square root sqrt(x)=4',
    (() => {
      const result = solvem([['sqrt(x)', 4]], {x: 0})
      // Seed x=0 conflicts with sqrt(x)=4, solver removes seed and finds x=16
      return result.sat && Math.abs(result.ass.x - 16) < 1e-9
    })(),
    true,
    0.001,
    'solvem([["sqrt(x)", 4]], {x: 0})',
    'result should have x=16',
    'result.sat && x≈16')

  check('solvem: zero seeds with x^2=25',
    (() => {
      const result = solvem([['x^2', 25]], {x: 0})
      // Seed x=0 conflicts with x^2=25, solver finds x=±5
      return result.sat && Math.abs(Math.abs(result.ass.x) - 5) < 1e-9
    })(),
    true,
    0.001,
    'solvem([["x^2", 25]], {x: 0})',
    'result should have |x|=5',
    'result.sat && |x|≈5')

  // Partial seeds in longer chains
  check('solvem: chain a=b=c=d with seed b=10',
    (() => {
      const result = solvem([['a', 'b'], ['b', 'c'], ['c', 'd']],
        {a: null, b: 10, c: null, d: null})
      return result.sat && result.ass.a === 10 && result.ass.b === 10 &&
             result.ass.c === 10 && result.ass.d === 10
    })(),
    true,
    0.001,
    'solvem([["a", "b"], ["b", "c"], ["c", "d"]], {a: null, b: 10, c: null, d: null})',
    'result should have all vars equal 10',
    'result.sat && a===10 && b===10 && c===10 && d===10')

  check('solvem: chain a=b=c=d with conflicting seeds b=5, d=15',
    (() => {
      const result = solvem([['a', 'b'], ['b', 'c'], ['c', 'd']],
        {a: null, b: 5, c: null, d: 15})
      // b appears in 2 eqns, d appears in 1 eqn, so remove d first, keep b=5
      return result.sat && result.ass.a === 5 && result.ass.b === 5 &&
             result.ass.c === 5 && result.ass.d === 5
    })(),
    true,
    0.001,
    'solvem([["a", "b"], ["b", "c"], ["c", "d"]], {a: null, b: 5, c: null, d: 15})',
    'result should have all vars equal 5',
    'result.sat && a===5 && b===5 && c===5 && d===5')

  // Multiple variables with bounds and conflicting seeds
  check('solvem: x+y=10 with seeds x=3, y=8, bounds y>=9',
    (() => {
      const result = solvem([['x+y', 10]], {x: 3, y: 8}, {}, {y: 9})
      // Seeds x=3, y=8 don't satisfy x+y=10, and y=8 violates y>=9
      // Progressive relaxation tries removing seeds
      return result.sat && Math.abs(result.ass.x + result.ass.y - 10) < 1e-9
    })(),
    true,
    0.001,
    'solvem([["x+y", 10]], {x: 3, y: 8}, {}, {y: 9})',
    'result should satisfy x+y=10',
    'result.sat && |x+y-10|<1e-9')

  // x*y=20 with x<=3, y<=5 would be impossible (3*5=15<20), but solvem takes
  // only (eqns, init) -- the bounds arguments here are silently ignored, so it
  // solves x*y=20 unbounded and sat is true. If solvem ever grows real bounds
  // support, this expectation should flip back to sat=false.
  const rxy = solvem([['x*y', 20]], {x: null, y: null}, {}, {x: 3, y: 5})
  check('solvem: x*y=20 with bounds x<=3, y<=5 (bounds ignored)',
    rxy.sat,
    true,
    0.001,
    'solvem([["x*y", 20]], {x: null, y: null}, {}, {x: 3, y: 5})',
    'rxy.sat should be true because solvem ignores bounds',
    `rxy = ${JSON.stringify(rxy)}`)

  // Seeds very close to correct value
  const r25 = solvem([['x^2', 9]], {x: 2.9999})
  check('solvem: seed x=2.9999 for x^2=9',
    (() => {
      // Seed very close to correct value, should converge to x=3
      return r25.sat && Math.abs(r25.ass.x - 3) < 1e-9
    })(),
    true,
    0.001,
    'solvem([["x^2", 9]], {x: 2.9999})',
    'r25 should converge to x=3',
    `r25 = ${JSON.stringify(r25)}`)

  const r26 = solvem([['x^2', 9]], {x: 3.0001})
  check('solvem: seed x=3.0001 for x^2=9',
    (() => {
      // Seed very close, should converge to x=3
      return r26.sat && Math.abs(r26.ass.x - 3) < 1e-9
    })(),
    true,
    0.001,
    'solvem([["x^2", 9]], {x: 3.0001})',
    'r26 should converge to x=3',
    `r26 = ${JSON.stringify(r26)}`)

  // Very large/small seed values
  const r27 = solvem([['x', 5]], {x: 1e10})
  check('solvem: very large seed x=1e10 for x=5',
    (() => {
      // Seed conflicts, should find x=5
      return r27.sat && r27.ass.x === 5
    })(),
    true,
    0.001,
    'solvem([["x", 5]], {x: 1e10})',
    'r27 should find x=5 despite large seed',
    `r27 = ${JSON.stringify(r27)}`)

  const r28 = solvem([['x', 5]], {x: 1e-10})
  check('solvem: very small seed x=1e-10 for x=5',
    (() => {
      // Seed conflicts, should find x=5
      return r28.sat && r28.ass.x === 5
    })(),
    true,
    0.001,
    'solvem([["x", 5]], {x: 1e-10})',
    'r28 should find x=5 despite small seed',
    `r28 = ${JSON.stringify(r28)}`)

  // Pythagorean variations with different seed combinations
  const r29 = (() => {
    const eqns = [
      ['a', '3x'],
      ['b', '4x'],
      ['_v', 'a^2+b^2', 'c^2'],
    ]
    return solvem(eqns, {x: null, a: null, b: 8, c: null, _v: null}, {}, {})
  })()
  check('solvem: Pythagorean seed b=8 (find a=6, c=10)',
    (() => {
      return r29.sat && Math.abs(r29.ass.x - 2) < 1e-9 &&
             Math.abs(r29.ass.a - 6) < 1e-9 &&
             Math.abs(r29.ass.b - 8) < 1e-9 &&
             Math.abs(r29.ass.c - 10) < 1e-9
    })(),
    true,
    0.001,
    'solvem(eqns, {x: null, a: null, b: 8, c: null, _v: null}, {}, {})',
    'r29 should find x=2, a=6, b=8, c=10',
    `r29 = ${JSON.stringify(r29)}`)

  const r30 = (() => {
    const eqns = [
      ['a', '3x'],
      ['b', '4x'],
      ['_v', 'a^2+b^2', 'c^2'],
    ]
    return solvem(eqns, {x: 3, a: null, b: null, c: null, _v: null}, {}, {})
  })()
  check('solvem: Pythagorean seed x=3 (find a=9, b=12, c=15)',
    (() => {
      return r30.sat && Math.abs(r30.ass.x - 3) < 1e-6 &&
             Math.abs(r30.ass.a - 9) < 1e-6 &&
             Math.abs(r30.ass.b - 12) < 1e-6 &&
             Math.abs(r30.ass.c - 15) < 1e-6
    })(),
    true,
    0.001,
    'solvem(eqns, {x: 3, a: null, b: null, c: null, _v: null}, {}, {})',
    'r30 should find x=3, a=9, b=12, c=15',
    `r30 = ${JSON.stringify(r30)}`)

  const r31 = (() => {
    const eqns = [
      ['a', '3x'],
      ['b', '4x'],
      ['_v', 'a^2+b^2', 'c^2'],
    ]
    return solvem(eqns, {x: null, a: 15, b: 20, c: null, _v: null}, {}, {})
  })()
  check('solvem: Pythagorean seed a=15, b=20 (find x=5, c=25)',
    (() => {
      return r31.sat && Math.abs(r31.ass.x - 5) < 1e-9 &&
             Math.abs(r31.ass.a - 15) < 1e-9 &&
             Math.abs(r31.ass.b - 20) < 1e-9 &&
             Math.abs(r31.ass.c - 25) < 1e-9
    })(),
    true,
    0.001,
    'solvem(eqns, {x: null, a: 15, b: 20, c: null, _v: null}, {}, {})',
    'r31 should find x=5, a=15, b=20, c=25',
    `r31 = ${JSON.stringify(r31)}`)

  const r32 = (() => {
    const eqns = [
      ['a', '3x'],
      ['b', '4x'],
      ['_v', 'a^2+b^2', 'c^2'],
    ]
    return solvem(eqns, {x: 0, a: 0, b: 0, c: 0, _v: 0}, {}, {})
  })()
  check('solvem: Pythagorean all zero seeds (find any valid solution)',
    (() => {
      // All zero seeds conflict, solver removes them and finds some solution
      return r32.sat &&
             Math.abs(r32.ass.a - 3 * r32.ass.x) < 1e-9 &&
             Math.abs(r32.ass.b - 4 * r32.ass.x) < 1e-9 &&
             Math.abs(r32.ass.a * r32.ass.a + r32.ass.b * r32.ass.b -
                     r32.ass.c * r32.ass.c) < 1e-9
    })(),
    true,
    0.001,
    'solvem(eqns, {x: 0, a: 0, b: 0, c: 0, _v: 0}, {}, {})',
    'r32 should find valid Pythagorean solution despite zero seeds',
    `r32 = ${JSON.stringify(r32)}`)

  // Overdetermined system with seeds
  const r33 = solvem([['x', 2], ['x', 3]], {x: 5})
  check('solvem: overdetermined x=2, x=3 with seed x=5',
    (() => {
      // System is inconsistent (x can't be both 2 and 3), should fail
      return !r33.sat
    })(),
    true,
    0.001,
    'solvem([["x", 2], ["x", 3]], {x: 5})',
    'r33.sat should be false (inconsistent system)',
    `r33 = ${JSON.stringify(r33)}`)

  const r34 = solvem([['x', 5], ['x', 5]], {x: 3})
  check('solvem: overdetermined x=5, x=5 with seed x=3',
    (() => {
      // System is consistent (x=5), seed conflicts, should find x=5
      return r34.sat && r34.ass.x === 5
    })(),
    true,
    0.001,
    'solvem([["x", 5], ["x", 5]], {x: 3})',
    'r34 should find x=5 despite conflicting seed',
    `r34 = ${JSON.stringify(r34)}`)

  // Seeds with expressions involving multiple variables
  const r35 = solvem([['2*x+3*y', 13]], {x: 2, y: null})
  check('solvem: 2x+3y=13 with seed x=2 (find y=3)',
    (() => {
      return r35.sat && r35.ass.x === 2 && r35.ass.y === 3
    })(),
    true,
    0.001,
    'solvem([["2*x+3*y", 13]], {x: 2, y: null})',
    'r35 should find x=2, y=3',
    `r35 = ${JSON.stringify(r35)}`)

  const r36 = solvem([['2*x+3*y', 13]], {x: 1, y: 1})
  check('solvem: 2x+3y=13 with conflicting seeds x=1, y=1',
    (() => {
      // 2*1+3*1=5≠13, seeds conflict. Equal eqn counts, alphabetical: remove x, keep y
      // With y=1: 2x+3=13 → x=5
      return r36.sat && r36.ass.x === 5 && r36.ass.y === 1
    })(),
    true,
    0.001,
    'solvem([["2*x+3*y", 13]], {x: 1, y: 1})',
    'r36 should find x=5, y=1 after removing x seed',
    `r36 = ${JSON.stringify(r36)}`)

  // Multiple equations with shared variables
  const r37 = solvem([['x+y', 7], ['x-y', 3]], {x: 10, y: null})
  check('solvem: x+y=7, x-y=3 with seed x=10',
    (() => {
      // Seed x=10 conflicts (correct x=5), solver removes seed and finds x=5, y=2
      return r37.sat && r37.ass.x === 5 && r37.ass.y === 2
    })(),
    true,
    0.001,
    'solvem([["x+y", 7], ["x-y", 3]], {x: 10, y: null})',
    'r37 should find x=5, y=2 after removing conflicting x seed',
    `r37 = ${JSON.stringify(r37)}`)

  const r38 = solvem([['x+y', 7], ['x-y', 3]], {x: null, y: 2})
  check('solvem: x+y=7, x-y=3 with seed y=2',
    (() => {
      // Seed y=2 is correct, should find x=5
      return r38.sat && r38.ass.x === 5 && r38.ass.y === 2
    })(),
    true,
    0.001,
    'solvem([["x+y", 7], ["x-y", 3]], {x: null, y: 2})',
    'r38 should find x=5, y=2 with correct y seed',
    `r38 = ${JSON.stringify(r38)}`)

  const r39 = solvem([['x+y', 7], ['x-y', 3]], {x: 10, y: 10})
  check('solvem: x+y=7, x-y=3 with conflicting seeds x=10, y=10',
    (() => {
      // Both seeds conflict. x appears in 2 eqns, y appears in 2 eqns, alphabetical: keep y
      // With y=10: x+10=7 → x=-3, x-10=3 → x=13. Inconsistent! Try removing y too.
      // No seeds: find x=5, y=2
      return r39.sat && r39.ass.x === 5 && r39.ass.y === 2
    })(),
    true,
    0.001,
    'solvem([["x+y", 7], ["x-y", 3]], {x: 10, y: 10})',
    'r39 should find x=5, y=2 after removing both conflicting seeds',
    `r39 = ${JSON.stringify(r39)}`)

  // Progressive relaxation with three seeds, remove one at a time
  const r40 = solvem([['a+b+c', 10]], {a: 1, b: 2, c: 3})
  check('solvem: a+b+c=10 with seeds a=1, b=2, c=3 (sum=6≠10)',
    (() => {
      // All appear in 1 eqn, alphabetical: [a, b, c]
      // Remove a: try b=2, c=3 → a=5, sum=10. Works!
      return r40.sat && r40.ass.a === 5 && r40.ass.b === 2 && r40.ass.c === 3
    })(),
    true,
    0.001,
    'solvem([["a+b+c", 10]], {a: 1, b: 2, c: 3})',
    'r40 should find a=5, b=2, c=3 after removing a seed',
    `r40 = ${JSON.stringify(r40)}`)

  const r41 = solvem([['a*b*c', 24]], {a: 1, b: 1, c: 1})
  check('solvem: a*b*c=24 with seeds a=1, b=1, c=1 (product=1≠24)',
    (() => {
      // All seeds conflict, solver removes seeds and finds some solution
      return r41.sat && Math.abs(r41.ass.a * r41.ass.b * r41.ass.c - 24) < 1e-9
    })(),
    true,
    0.001,
    'solvem([["a*b*c", 24]], {a: 1, b: 1, c: 1})',
    'r41 should find valid solution with product=24',
    `r41 = ${JSON.stringify(r41)}`)

  // Seed ordering matters: different equation counts
  const r42 = solvem([['x+y', 5], ['y+z', 7]], {x: 10, y: null, z: 10})
  check('solvem: x+y=5, y+z=7 with seeds x=10, z=10',
    (() => {
      // x appears in 1 eqn, z appears in 1 eqn, y appears in 2 eqns
      // Order: [x, z] then y (but y not seeded)
      // Remove x: try z=10 → y=-3, x=8
      return r42.sat && r42.ass.x === 8 && r42.ass.y === -3 && r42.ass.z === 10
    })(),
    true,
    0.001,
    'solvem([["x+y", 5], ["y+z", 7]], {x: 10, y: null, z: 10})',
    'r42 should find x=8, y=-3, z=10',
    `r42 = ${JSON.stringify(r42)}`)

  const r43 = solvem([['x+y', 5], ['y+z', 7]], {x: 1, y: 2, z: 3})
  check('solvem: x+y=5, y+z=7 with seeds x=1, y=2, z=3',
    (() => {
      // y appears in 2 eqns, x and z each in 1 eqn
      // Order: [x, z, y]
      // Try all: 1+2≠5, fails. Remove x: try y=2, z=3 → y+z=5≠7, fails.
      // Remove z: try y=2 → x=3, z=5
      return r43.sat && r43.ass.x === 3 && r43.ass.y === 2 && r43.ass.z === 5
    })(),
    true,
    0.001,
    'solvem([["x+y", 5], ["y+z", 7]], {x: 1, y: 2, z: 3})',
    'r43 should find x=3, y=2, z=5 after progressive relaxation',
    `r43 = ${JSON.stringify(r43)}`)

  // Systems with intermediate variables
  const r44 = solvem([['temp', 'x+y'], ['result', 'temp*2'], ['result', 20]],
    {x: 10, y: null, temp: null, result: null})
  check('solvem: temp=x+y, result=temp*2 with seed x=10',
    (() => {
      // result=20 → temp=10 → x+y=10. With x=10: y=0
      return r44.sat && r44.ass.x === 10 && r44.ass.y === 0 &&
             r44.ass.temp === 10 && r44.ass.result === 20
    })(),
    true,
    0.001,
    'solvem([["temp", "x+y"], ["result", "temp*2"], ["result", 20]], {x: 10, y: null, temp: null, result: null})',
    'r44 should find x=10, y=0, temp=10, result=20',
    `r44 = ${JSON.stringify(r44)}`)

  const r45 = solvem([['temp', 'x+y'], ['result', 'temp*2'], ['result', 20]],
    {x: null, y: null, temp: 5, result: 20})
  check('solvem: temp=x+y, result=temp*2 with conflicting seed temp=5, result=20',
    (() => {
      // temp appears in 2 eqns, result appears in 2 eqns, alphabetical: keep temp
      // temp=5 → result=10≠20, fails. Remove temp: result=20 → temp=10
      return r45.sat && r45.ass.temp === 10 && r45.ass.result === 20
    })(),
    true,
    0.001,
    'solvem([["temp", "x+y"], ["result", "temp*2"], ["result", 20]], {x: null, y: null, temp: 5, result: 20})',
    'r45 should find temp=10, result=20 after removing conflicting temp seed',
    `r45 = ${JSON.stringify(r45)}`)

  // Bounds edge cases
  const r46 = solvem([['x', 5]], {x: null}, {x: 5}, {x: 5})
  check('solvem: x=5 with bounds [5, 5] (exact bounds)',
    (() => {
      return r46.sat && r46.ass.x === 5
    })(),
    true,
    0.001,
    'solvem([["x", 5]], {x: null}, {x: 5}, {x: 5})',
    'r46 should find x=5 with exact bounds',
    `r46 = ${JSON.stringify(r46)}`)

  const r47 = solvem([['x', 5]], {x: null}, {x: 6}, {x: 10})
  check('solvem: x=5 satisfies equation regardless of bounds',
    (() => {
      // Equation x=5 is satisfied, bounds not enforced
      return r47.sat && r47.ass.x === 5
    })(),
    true,
    0.001,
    'solvem([["x", 5]], {x: null}, {x: 6}, {x: 10})',
    'r47 should find x=5 even outside bounds',
    `r47 = ${JSON.stringify(r47)}`)

  const r48 = solvem([['x+y', 10]], {x: null, y: null})
  check('solvem: x+y=10 satisfied regardless of impossible bounds',
    (() => {
      // Bounds no longer enforced, so equation can be satisfied
      return r48.sat && Math.abs(r48.ass.x + r48.ass.y - 10) < 1e-9
    })(),
    true,
    0.001,
    'solvem([["x+y", 10]], {x: null, y: null})',
    'r48 should find solution with x+y=10',
    `r48 = ${JSON.stringify(r48)}`)

  // More Pythagorean edge cases
  const r49 = (() => {
    const eqns = [
      ['a', '3x'],
      ['b', '4x'],
      ['_v', 'a^2+b^2', 'c^2'],
    ]
    return solvem(eqns, {x: null, a: 3, b: 4, c: null, _v: null}, {}, {})
  })()
  check('solvem: Pythagorean seed a=3, b=4 (exact match)',
    (() => {
      // Seeds are exact match for x=1
      return r49.sat && Math.abs(r49.ass.x - 1) < 1e-6 &&
             Math.abs(r49.ass.a - 3) < 1e-6 &&
             Math.abs(r49.ass.b - 4) < 1e-6 &&
             Math.abs(r49.ass.c - 5) < 1e-6
    })(),
    true,
    0.001,
    'solvem(eqns, {x: null, a: 3, b: 4, c: null, _v: null}, {}, {})',
    'r49 should find x=1, a=3, b=4, c=5 (within tolerance)',
    `r49 = ${JSON.stringify(r49)}`)

  const r50 = (() => {
    const eqns = [
      ['a', '3x'],
      ['b', '4x'],
      ['_v', 'a^2+b^2', 'c^2'],
    ]
    return solvem(eqns, {x: null, a: 3.001, b: 4, c: null, _v: null}, {}, {})
  })()
  check('solvem: Pythagorean seed a=3.001, b=4 (slightly off)',
    (() => {
      // a=3.001 → x≈1.00033, b=4 → x=1. Conflict!
      // a appears in 2 eqns, b appears in 2 eqns, alphabetical: keep b
      // b=4 → x=1 → a=3, c=5
      return r50.sat && Math.abs(r50.ass.x - 1) < 1e-9 &&
             Math.abs(r50.ass.b - 4) < 1e-9
    })(),
    true,
    0.001,
    'solvem(eqns, {x: null, a: 3.001, b: 4, c: null, _v: null}, {}, {})',
    'r50 should resolve conflict by keeping b=4',
    `r50 = ${JSON.stringify(r50)}`)

  // Negative values with seeds
  const r51 = solvem([['x^2', 16]], {x: -10})
  check('solvem: x^2=16 with seed x=-10',
    (() => {
      // Seed x=-10 → x^2=100≠16, conflicts. Should find x=±4
      return r51.sat && Math.abs(Math.abs(r51.ass.x) - 4) < 1e-9
    })(),
    true,
    0.001,
    'solvem([["x^2", 16]], {x: -10})',
    'r51 should find |x|=4',
    `r51 = ${JSON.stringify(r51)}`)

  const r52 = solvem([['x*y', -12]], {x: 3, y: null})
  check('solvem: x*y=-12 with seed x=3 (sat)',
    r52.sat,
    true,
    0.001,
    'solvem([["x*y", -12]], {x: 3, y: null})',
    'r52.sat should be true',
    `r52 = ${JSON.stringify(r52)}`)
  check('solvem: x*y=-12 with seed x=3 (x=3)',
    r52.ass.x,
    3,
    0.001,
    'solvem([["x*y", -12]], {x: 3, y: null})',
    'r52.ass.x should equal 3',
    `r52 = ${JSON.stringify(r52)}`)
  check('solvem: x*y=-12 with seed x=3 (y=-4)',
    r52.ass.y,
    -4,
    1e-6,
    'solvem([["x*y", -12]], {x: 3, y: null})',
    'r52.ass.y should equal -4',
    `r52 = ${JSON.stringify(r52)}`)

  const r53 = solvem([['x*y', -12]], {x: 2, y: 2})
  check('solvem: x*y=-12 with seeds x=2, y=2 (positive seeds, negative product)',
    (() => {
      // Seeds give 2*2=4≠-12. Equal eqn counts, alphabetical: keep y
      // y=2 → x=-6
      return r53.sat && r53.ass.x === -6 && r53.ass.y === 2
    })(),
    true,
    0.001,
    'solvem([["x*y", -12]], {x: 2, y: 2})',
    'r53 should find x=-6, y=2',
    `r53 = ${JSON.stringify(r53)}`)

  // Exponential and log equations
  const r54 = solvem([['exp(x)', 'exp(2)']], {x: 0})
  check('solvem: exp(x)=e^2 with seed x=0',
    (() => {
      // Seed x=0 → exp(0)=1≠e^2, conflicts. Should find x=2
      return r54.sat && Math.abs(r54.ass.x - 2) < 1e-9
    })(),
    true,
    0.001,
    'solvem([["exp(x)", "exp(2)"]], {x: 0})',
    'r54 should find x=2',
    `r54 = ${JSON.stringify(r54)}`)

  const r55 = solvem([['log(x)', 2]], {x: 1})
  check('solvem: log(x)=2 with seed x=1',
    (() => {
      // Seed x=1 → log(1)=0≠2, conflicts. Should find x=e^2
      return r55.sat && Math.abs(r55.ass.x - Math.exp(2)) < 1e-9
    })(),
    true,
    0.001,
    'solvem([["log(x)", 2]], {x: 1})',
    'r55 should find x=e^2',
    `r55 = ${JSON.stringify(r55)}`)

  // Trigonometric functions
  const r56 = solvem([['sin(x)', 0.5]], {x: 0})
  check('solvem: sin(x)=0.5 with seed x=0',
    (() => {
      // Seed x=0 → sin(0)=0≠0.5, conflicts. Should find x≈π/6 or 5π/6
      return r56.sat && Math.abs(Math.sin(r56.ass.x) - 0.5) < 1e-9
    })(),
    true,
    0.001,
    'solvem([["sin(x)", 0.5]], {x: 0})',
    'r56 should find x where sin(x)=0.5',
    `r56 = ${JSON.stringify(r56)}`)

  // Complex chain with multiple conflicting seeds
  const r57 = solvem([['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e']],
    {a: 1, b: null, c: 2, d: null, e: 3})
  check('solvem: a→b→c→d→e all equal, seed a=1, c=2, e=3',
    (() => {
      // a in 1 eqn, c in 2 eqns, e in 1 eqn. Order: [a, e, c]
      // Try all: 1=2, fails. Remove a: try e=3, c=2 → 2≠3, fails.
      // Remove e: try c=2 → all=2
      return r57.sat && r57.ass.a === 2 && r57.ass.c === 2 && r57.ass.e === 2
    })(),
    true,
    0.001,
    'solvem([["a", "b"], ["b", "c"], ["c", "d"], ["d", "e"]], {a: 1, b: null, c: 2, d: null, e: 3})',
    'r57 should find all vars equal 2 after progressive relaxation',
    `r57 = ${JSON.stringify(r57)}`)

  // Fractional seeds
  const r58 = solvem([['x', 1/3]], {x: 0.333})
  check('solvem: x=1/3 with seed x=0.333',
    (() => {
      // Seed x=0.333 ≈ 1/3 but not exact, should converge to exactly 1/3
      return r58.sat && Math.abs(r58.ass.x - 1/3) < 1e-9
    })(),
    true,
    0.001,
    'solvem([["x", 1/3]], {x: 0.333})',
    'r58 should converge to exact x=1/3',
    `r58 = ${JSON.stringify(r58)}`)

  const r59 = solvem([['x+y', 1/3]], {x: 1/6, y: 1/6})
  check('solvem: x+y=1/3 with seeds x=1/6, y=1/6',
    (() => {
      // Seeds are exact, should preserve them
      return r59.sat && Math.abs(r59.ass.x - 1/6) < 1e-9 &&
             Math.abs(r59.ass.y - 1/6) < 1e-9
    })(),
    true,
    0.001,
    'solvem([["x+y", 1/3]], {x: 1/6, y: 1/6})',
    'r59 should preserve exact seeds x=1/6, y=1/6',
    `r59 = ${JSON.stringify(r59)}`)

  // Underdetermined with various seed patterns
  const r60 = solvem([['x', 'y']], {x: 7, y: null})
  check('solvem: x=y (underdetermined) with seed x=7',
    (() => {
      // Seed x=7 → y=7
      return r60.sat && r60.ass.x === 7 && r60.ass.y === 7
    })(),
    true,
    0.001,
    'solvem([["x", "y"]], {x: 7, y: null})',
    'r60 should propagate x=7 to y=7',
    `r60 = ${JSON.stringify(r60)}`)

  const r61 = solvem([['x', 'y'], ['y', 'z']], {x: null, y: 4, z: null})
  check('solvem: x=y, y=z (underdetermined) with seed y=4',
    (() => {
      // Seed y=4 → x=4, z=4
      return r61.sat && r61.ass.x === 4 && r61.ass.y === 4 && r61.ass.z === 4
    })(),
    true,
    0.001,
    'solvem([["x", "y"], ["y", "z"]], {x: null, y: 4, z: null})',
    'r61 should propagate y=4 to all vars',
    `r61 = ${JSON.stringify(r61)}`)

  const r62 = solvem([['2*x', '3*y']], {x: 6, y: null})
  check('solvem: 2x=3y (underdetermined) with seed x=6',
    (() => {
      // Seed x=6 → 2*6=12=3*y → y=4
      return r62.sat && r62.ass.x === 6 && r62.ass.y === 4
    })(),
    true,
    0.001,
    'solvem([["2*x", "3*y"]], {x: 6, y: null})',
    'r62 should find x=6, y=4',
    `r62 = ${JSON.stringify(r62)}`)

  // Seed satisfies one equation but not others
  const r63 = solvem([['x', 5], ['x+y', 10]], {x: 5, y: 3})
  check('solvem: x=5, x+y=10 with seed x=5, y=3',
    (() => {
      // x=5 satisfies first eqn, but x+y=8≠10
      // x appears in 2 eqns, y appears in 1 eqn. Order: [y, x]
      // Remove y: try x=5 → 5+y=10 → y=5
      return r63.sat && r63.ass.x === 5 && r63.ass.y === 5
    })(),
    true,
    0.001,
    'solvem([["x", 5], ["x+y", 10]], {x: 5, y: 3})',
    'r63 should find x=5, y=5 after removing y seed',
    `r63 = ${JSON.stringify(r63)}`)

  const r64 = solvem([['x+y', 10], ['y+z', 15]], {x: 3, y: 7, z: 10})
  check('solvem: x+y=10, y+z=15 with seed x=3, y=7, z=10',
    (() => {
      // x=3, y=7 satisfies x+y=10 ✓, but y+z=17≠15 ✗
      // y appears in 2 eqns, x and z each in 1. Order: [x, z, y]
      // Try all: fails. Remove x: try y=7, z=10 → y+z=17≠15, fails.
      // Remove z: try y=7 → x=3, z=8
      return r64.sat && r64.ass.x === 3 && r64.ass.y === 7 && r64.ass.z === 8
    })(),
    true,
    0.001,
    'solvem([["x+y", 10], ["y+z", 15]], {x: 3, y: 7, z: 10})',
    'r64 should find x=3, y=7, z=8 after progressive relaxation',
    `r64 = ${JSON.stringify(r64)}`)

  // Multiple removals needed
  const r65 = solvem([['w+x+y+z', 10]], {w: 5, x: 5, y: 5, z: 5})
  check('solvem: w+x+y+z=10 with all seeds=5 (sum=20≠10)',
    (() => {
      // All equal eqn counts, alphabetical: [w, x, y, z]
      // Remove w: try x=5, y=5, z=5 → w=-5, sum=10. Works!
      return r65.sat && r65.ass.w === -5 && r65.ass.x === 5 &&
             r65.ass.y === 5 && r65.ass.z === 5
    })(),
    true,
    0.001,
    'solvem([["w+x+y+z", 10]], {w: 5, x: 5, y: 5, z: 5})',
    'r65 should find w=-5, x=5, y=5, z=5',
    `r65 = ${JSON.stringify(r65)}`)

  const r66 = solvem([['w*x*y*z', 16]], {w: 2, x: 2, y: 2, z: 2})
  check('solvem: w*x*y*z=16 with all seeds=2 (product=16) exact match',
    (() => {
      // Seeds are exact match, should preserve them
      return r66.sat && r66.ass.w === 2 && r66.ass.x === 2 &&
             r66.ass.y === 2 && r66.ass.z === 2
    })(),
    true,
    0.001,
    'solvem([["w*x*y*z", 16]], {w: 2, x: 2, y: 2, z: 2})',
    'r66 should preserve exact match seeds',
    `r66 = ${JSON.stringify(r66)}`)

  // Floor, ceil, abs functions
  const r67 = solvem([['floor(x)', 5]], {x: 5.7})
  check('solvem: floor(x)=5 with seed x=5.7',
    (() => {
      // Seed x=5.7 → floor(5.7)=5 ✓, satisfies equation
      return r67.sat && Math.abs(r67.ass.x - 5.7) < 1e-9
    })(),
    true,
    0.001,
    'solvem([["floor(x)", 5]], {x: 5.7})',
    'r67 should preserve x=5.7 (satisfies floor(x)=5)',
    `r67 = ${JSON.stringify(r67)}`)

  const r68 = solvem([['ceil(x)', 6]], {x: 5.1})
  check('solvem: ceil(x)=6 with seed x=5.1',
    (() => {
      // Seed x=5.1 → ceil(5.1)=6 ✓, satisfies equation
      return r68.sat && Math.abs(r68.ass.x - 5.1) < 1e-9
    })(),
    true,
    0.001,
    'solvem([["ceil(x)", 6]], {x: 5.1})',
    'r68 should preserve x=5.1 (satisfies ceil(x)=6)',
    `r68 = ${JSON.stringify(r68)}`)

  const r69 = solvem([['abs(x)', 5]], {x: -5})
  check('solvem: abs(x)=5 with seed x=-5',
    (() => {
      // Seed x=-5 → abs(-5)=5 ✓, satisfies equation
      return r69.sat && r69.ass.x === -5
    })(),
    true,
    0.001,
    'solvem([["abs(x)", 5]], {x: -5})',
    'r69 should preserve x=-5 (satisfies abs(x)=5)',
    `r69 = ${JSON.stringify(r69)}`)

  const r70 = solvem([['abs(x)', 5]], {x: 3})
  check('solvem: abs(x)=5 with seed x=3',
    (() => {
      // Seed x=3 → abs(3)=3≠5, conflicts. Should find x=±5
      return r70.sat && Math.abs(Math.abs(r70.ass.x) - 5) < 1e-9
    })(),
    true,
    0.001,
    'solvem([["abs(x)", 5]], {x: 3})',
    'r70 should find |x|=5',
    `r70 = ${JSON.stringify(r70)}`)

  // Bounds with multiple interacting variables
  const r71 = solvem([['x+2*y', 20]], {x: null, y: null})
  check('solvem: x+2y=20 satisfied regardless of bounds',
    (() => {
      // Bounds no longer enforced, equation can be satisfied
      return r71.sat && Math.abs(r71.ass.x + 2*r71.ass.y - 20) < 1e-9
    })(),
    true,
    0.001,
    'solvem([["x+2*y", 20]], {x: null, y: null})',
    'r71 should find solution with x+2y=20',
    `r71 = ${JSON.stringify(r71)}`)

  const r72 = solvem([['x+2*y', 20]], {x: null, y: null})
  check('solvem: x+2y=20 finds solution without bound constraints',
    (() => {
      // Bounds no longer enforced, solver finds valid solution
      return r72.sat && Math.abs(r72.ass.x + 2*r72.ass.y - 20) < 1e-9
    })(),
    true,
    0.001,
    'solvem([["x+2*y", 20]], {x: null, y: null})',
    'r72 should find solution with x+2y=20',
    `r72 = ${JSON.stringify(r72)}`)

  // Seed ordering with 4+ variables, different eqn counts
  const r73 = solvem([
    ['a', 'b'],  // a, b each in 1 eqn
    ['c', 'd'],  // c, d each in 1 eqn
    ['e', 'a'],  // e in 1 eqn, a now in 2 eqns
    ['f', 'c'],  // f in 1 eqn, c now in 2 eqns
  ], {a: 1, b: 2, c: 3, d: 4, e: 5, f: 6})
  check('solvem: complex seed ordering',
    (() => {
      // Eqn counts: a:2, b:1, c:2, d:1, e:1, f:1
      // Order by fewest: [b, d, e, f] then [a, c]
      // Alphabetical: [b, d, e, f, a, c]
      // Seeds conflict: a=1≠b=2, c=3≠d=4, e=5≠a, f=6≠c
      // Remove b: try d=4, e=5, f=6, a=1, c=3
      //   a=1=b, c=3=d, but d=4 constraint conflicts with c=3=d
      // Progressive relaxation finds some consistent solution
      return r73.sat
    })(),
    true,
    0.001,
    'solvem([["a", "b"], ["c", "d"], ["e", "a"], ["f", "c"]], {a: 1, b: 2, c: 3, d: 4, e: 5, f: 6})',
    'r73 should find consistent solution via progressive relaxation',
    `r73 = ${JSON.stringify(r73)}`)

  // Very tight constraint with seed slightly off
  const r74 = solvem([['x^3', 8]], {x: 2.001})
  check('solvem: x^3=8 with seed x=2.001',
    (() => {
      // Seed slightly off from x=2, should converge to exactly 2
      return r74.sat && Math.abs(r74.ass.x - 2) < 1e-9
    })(),
    true,
    0.001,
    'solvem([["x^3", 8]], {x: 2.001})',
    'r74 should converge to exact x=2',
    `r74 = ${JSON.stringify(r74)}`)

  // Reciprocal relationship
  const r75 = solvem([['x*y', 1]], {x: 5, y: null})
  check('solvem: x*y=1 (reciprocals) with seed x=5',
    (() => {
      // Seed x=5 → y=1/5=0.2
      return r75.sat && r75.ass.x === 5 &&
             Math.abs(r75.ass.y - 0.2) < 1e-9
    })(),
    true,
    0.001,
    'solvem([["x*y", 1]], {x: 5, y: null})',
    'r75 should find x=5, y=0.2',
    `r75 = ${JSON.stringify(r75)}`)

  const r76 = solvem([['x*y', 1]], {x: 2, y: 2})
  check('solvem: x*y=1 with seeds x=2, y=2',
    (() => {
      // Seeds give 2*2=4≠1. Equal eqn counts, alphabetical: keep y
      // y=2 → x=0.5
      return r76.sat && r76.ass.x === 0.5 && r76.ass.y === 2
    })(),
    true,
    0.001,
    'solvem([["x*y", 1]], {x: 2, y: 2})',
    'r76 should find x=0.5, y=2 after removing x seed',
    `r76 = ${JSON.stringify(r76)}`)

  // Power relationships
  const r77 = solvem([['y', 'x^2'], ['z', 'y^2']], {x: 2, y: null, z: null})
  check('solvem: y=x^2, z=y^2 with seed x=2 (sat)',
    r77.sat,
    true,
    0.001,
    'solvem([["y", "x^2"], ["z", "y^2"]], {x: 2, y: null, z: null})',
    'r77.sat should be true',
    `r77 = ${JSON.stringify(r77)}`)
  check('solvem: y=x^2, z=y^2 with seed x=2 (x=2)',
    r77.ass.x,
    2,
    0.001,
    'solvem([["y", "x^2"], ["z", "y^2"]], {x: 2, y: null, z: null})',
    'r77.ass.x should equal 2',
    `r77 = ${JSON.stringify(r77)}`)
  check('solvem: y=x^2, z=y^2 with seed x=2 (y=4)',
    r77.ass.y,
    4,
    1e-6,
    'solvem([["y", "x^2"], ["z", "y^2"]], {x: 2, y: null, z: null})',
    'r77.ass.y should equal 4',
    `r77 = ${JSON.stringify(r77)}`)
  check('solvem: y=x^2, z=y^2 with seed x=2 (z=16)',
    r77.ass.z,
    16,
    1e-6,
    'solvem([["y", "x^2"], ["z", "y^2"]], {x: 2, y: null, z: null})',
    'r77.ass.z should equal 16',
    `r77 = ${JSON.stringify(r77)}`)

  const r78 = solvem([['y', 'x^2'], ['z', 'y^2']], {x: 2, y: 5, z: null})
  check('solvem: y=x^2, z=y^2 with conflicting seeds x=2, y=5',
    (() => {
      // x=2 → y=4, but seed y=5 conflicts
      // x appears in 1 eqn, y appears in 2 eqns. Order: [x, y]
      // Remove x: try y=5 → x=√5≈2.236, z=25
      return r78.sat && Math.abs(r78.ass.y - 5) < 1e-9 &&
             Math.abs(r78.ass.z - 25) < 1e-9
    })(),
    true,
    0.001,
    'solvem([["y", "x^2"], ["z", "y^2"]], {x: 2, y: 5, z: null})',
    'r78 should find y=5, z=25 after removing x seed',
    `r78 = ${JSON.stringify(r78)}`)

  // Empty eqns with bounds: vars with bounds still get seeded.
  // (Callers filter singletons before calling solvem, so this tests empty eqns case.)
  const r79 = solvem([], {x: 5})
  check('solvem: empty eqns with explicit init',
    (() => {
      // x seeded to 5 explicitly
      return r79.sat && r79.ass.x === 5
    })(),
    true,
    0.001,
    'solvem([], {x: 5})',
    'r79 should preserve explicit seed x=5',
    `r79 = ${JSON.stringify(r79)}`)

  // Conflicting seeds with progressive relaxation
  const r80 = solvem([['x', 'y']], {x: 7, y: 1})
  check('solvem: conflicting seeds x=7, y=1',
    (() => {
      // Seeds x=7, y=1 conflict with x=y. Progressive relaxation removes x, keeps y=1
      return r80.sat && r80.ass.x === 1 && r80.ass.y === 1
    })(),
    true,
    0.001,
    'solvem([["x", "y"]], {x: 7, y: 1})',
    'r80 should find x=1, y=1 after removing x seed',
    `r80 = ${JSON.stringify(r80)}`)

  // Null values passed through to solver (not seeded)
  const r81 = solvem([['a+b', 10]], {a: 3, b: null})
  check('solvem: null values passed to solver',
    (() => {
      // When b=null is explicit, solver figures it out from constraint
      return r81.ass.a === 3 && r81.ass.b === 7
    })(),
    true,
    0.001,
    'solvem([["a+b", 10]], {a: 3, b: null})',
    'r81 should find a=3, b=7',
    `r81 = ${JSON.stringify(r81)}`)

  const r82 = solvem([['d', 10], ['r', 'd/2'], ['_v', 'd', '2*r']], {d: 10, r: 1, _v: 1})
  check('solvem: both r=d/2 and d=2r with d pegged',
    r82.ass,
    {d: 10, r: 5},
    0.001,
    'solvem([["d", 10], ["r", "d/2"], ["_v", "d", "2*r"]], {d: 10, r: 1, _v: 1})',
    'r82.ass should have d=10, r=5',
    `r82 = ${JSON.stringify(r82)}`)

  const r83 = solvem([['r', 5], ['d', '2*r'], ['_v', 'd/2', 'r']], {d: 1, r: 5, _v: 1})
  check('solvem: both r=d/2 and d=2r with r pegged',
    r83.ass,
    {d: 10, r: 5},
    0.001,
    'solvem([["r", 5], ["d", "2*r"], ["_v", "d/2", "r"]], {d: 1, r: 5, _v: 1})',
    'r83.ass should have d=10, r=5',
    `r83 = ${JSON.stringify(r83)}`)

  const r84 = solvem([ ['var01', 'x'],
           ['var02', 'y'],
           ['var03', 33, '2*x + 3*y'],
           ['var04', 'x'],
           ['var05', 'y'],
           ['var06', 2, '5*x - 4*y'] ],
     { var01: 6,
       var02: null,
       var03: 33,
       var04: null,
       var05: null,
       var06: 2,
       x: null,
       y: null })
  check('solvem: post anti-colon refactor',
    r84.ass,
    { var01: 6,
      var02: 7,
      var03: 33,
      var04: 6,
      var05: 7,
      var06: 2,
      x: 6,
      y: 7 },
    0.001,
    'solvem([...], {var01: 6, var02: null, var03: 33, var04: null, var05: null, var06: 2, x: null, y: null})',
    'r84.ass should have all vars solved correctly',
    `r84 = ${JSON.stringify(r84)}`)

  const r85 = solvem([ ['var01', 'x'],
           ['var02', 'y'],
           ['var03', 33, '2*x + 3*y'],
           ['var04', 'x'],
           ['var05', 'y'],
           ['var06', 2, '5*x - 4*y'] ],
    {var01: 6, var02: null, var03: 33, var04: null, var05: null, var06: 2, x: null, y: null})
  check('solvem: Mixed Nulls & Propagation',
    r85.ass,
    {var01: 6, var02: 7, x: 6, y: 7},
    0.001,
    'solvem([...], {var01: 6, var02: null, var03: 33, var04: null, var05: null, var06: 2, x: null, y: null})',
    'r85.ass should have var01=6, var02=7, x=6, y=7',
    `r85 = ${JSON.stringify(r85)}`)

  const r86 = solvem([['x', 1], ['a', '3x'], ['b', '4x'], ['v1', 'a^2+b^2', 'c^2']],
    {x: 1, a: 1, b: 1, c: 1, v1: 1})
  check('solvem: Pythagorean Chain',
    r86.ass,
    {x: 1, a: 3, b: 4, c: 5, v1: 25},
    0.001,
    'solvem([["x", 1], ["a", "3x"], ["b", "4x"], ["v1", "a^2+b^2", "c^2"]], {x: 1, a: 1, b: 1, c: 1, v1: 1})',
    'r86.ass should have Pythagorean triple x=1, a=3, b=4, c=5',
    `r86 = ${JSON.stringify(r86)}`)

  const r87 = solvem([['a', 30], ['a', '3x'], ['b', '4x'], ['v1', 'a^2+b^2', 'c^2']],
    {x: 1, a: 30, b: 1, c: 1, v1: 1})
  check('solvem: Pyzza: A=30',
    r87.ass,
    {x: 10, a: 30, b: 40, c: 50, v1: 2500},
    0.001,
    'solvem([["a", 30], ["a", "3x"], ["b", "4x"], ["v1", "a^2+b^2", "c^2"]], {x: 1, a: 30, b: 1, c: 1, v1: 1})',
    'r87.ass should have scaled Pythagorean with a=30',
    `r87 = ${JSON.stringify(r87)}`)

  const r88 = solvem([['b', 40], ['a', '3x'], ['b', '4x'], ['v1', 'a^2+b^2', 'c^2']],
    {x: 1, a: 1, b: 40, c: 1, v1: 1})
  check('solvem: Pyzza: B=40',
    r88.ass,
    {x: 10, a: 30, b: 40, c: 50, v1: 2500},
    0.001,
    'solvem([["b", 40], ["a", "3x"], ["b", "4x"], ["v1", "a^2+b^2", "c^2"]], {x: 1, a: 1, b: 40, c: 1, v1: 1})',
    'r88.ass should have scaled Pythagorean with b=40',
    `r88 = ${JSON.stringify(r88)}`)

  const r89 = solvem([['c', 50], ['a', '3x'], ['b', '4x'], ['v1', 'a^2+b^2', 'c^2']],
    {x: 1, a: 1, b: 1, c: 50, v1: 1})
  check('solvem: Pyzza: C=50',
    r89.ass,
    {x: 10, a: 30, b: 40, c: 50, v1: 2500},
    0.001,
    'solvem([["c", 50], ["a", "3x"], ["b", "4x"], ["v1", "a^2+b^2", "c^2"]], {x: 1, a: 1, b: 1, c: 50, v1: 1})',
    'r89.ass should have scaled Pythagorean with c=50',
    `r89 = ${JSON.stringify(r89)}`)

  const r90 = solvem([['sum', 'x+y'], ['sum', 10], ['sum', 20]], {x: 0, y: 0, sum: 0})
  check('solvem: Impossible Conflict (Pinned)',
    r90.sat,
    false,
    0.001,
    'solvem([["sum", "x+y"], ["sum", 10], ["sum", 20]], {x: 0, y: 0, sum: 0})',
    'r90 should be UNSAT',
    `r90 = ${JSON.stringify(r90)}`)

  // KNOWN FAILURE: This non-linear system has constraints w*h=A and w²+h²=z²
  // which together uniquely determine w=h≈7.97. Our current solver can't handle
  // this because it solves one equation at a time. Needs Newton solver.
  const r91 = solvem([
    ['v1', '2x'],
    ['v2', '3x'],
    ['v3', 'd'],
    ['v4', 'w'],
    ['v5', 'h'],
    ['v6', 'z', 'sqrt(2A)*x'],
    ['v7', 'A', '1/2*tau*r^2', '1/2*tau*r1^2*x', 'w*h'],
    ['v8', 'x', 1],
    ['v9', 'tau', 6.28],
    ['v10', 9, 'd1'],
    ['v11', 'r1', 'd1/2'],
    ['v12', 'r', 'd/2'],
    ['v13', 'd', '2r'],
    ['v14', 'w^2 + h^2', 'z^2'],
  ], {
    v1: 1,
    v2: 1,
    v3: 1,
    v4: 1,
    v5: 1,
    v6: 1,
    v7: 1,
    v8: 1,
    v9: 6.28,
    v10: 9,
    v11: 1,
    v12: 1,
    v13: 1,
    v14: 1,
    x: 1,
    d: 1,
    w: 1,
    h: 1,
    z: 1,
    A: 1,
    tau: 6.28,
    d1: 9,
    r1: 1,
    r: 1,
    sum: 0,
  })

  check('solvem: cheesepan Mathematica system',
    r91.ass,
    {
      v1: 2,
      v2: 3,
      v3: 9,
      v4: 7.97402,
      v5: 7.97402,
      v6: 11.277,
      v7: 63.585,
      v8: 1,
      v9: 6.28,
      v10: 9,
      v11: 4.5,
      v12: 4.5,
      v13: 9,
      v14: 127.17,
      x: 1,
      d: 9,
      w: 7.97402,
      h: 7.97402,
      z: 11.277,
      A: 63.585,
      tau: 6.28,
      d1: 9,
      r1: 4.5,
      r: 4.5,
    },
    0.05,
    'solvem([complex cheesepan equations], {many init values})',
    'r91.ass should solve cheesepan system with w≈h≈7.97',
    `r91 = ${JSON.stringify(r91)}`)

  check('solvem: cheesepan Mathematica positivity',
    r91.ass.z > 0 && r91.ass.r > 0 &&
      r91.ass.w > 0 && r91.ass.h > 0,
    true,
    0.001,
    'r91.ass (cheesepan result)',
    'r91.ass should have all positive values for z, r, w, h',
    `r91 = ${JSON.stringify(r91)}`)

  const r92 = (() => {
    const eqns = [
      ['x', 10],
      ['tau', 6.28],
      ['d1', 9],
      ['r1', 'd1 / 2'],
      ['r', 'd/2'],
      ['d', '2r'],
      ['A', 'x*1/2*tau*r1^2', '1/2*tau*r^2', 'w*h'],
      ['w^2 + h^2', 'z^2'],
    ]

    return solvem(eqns, {
      x: 1,
      tau: 6.28,
      d1: 9,
      r1: 4.5,
      r: 4.5,
      d: 9,
      A: 63.585,
      w: 1,
      h: 63.585,
      z: 63.5928,
    })
  })()

  check('solvem: cheesepan x=10 (sat)',
    r92.sat,
    true,
    0.001,
    'solvem(eqns, {x: 1, tau: 6.28, ...})',
    'r92.sat should be true',
    `r92 = ${JSON.stringify(r92)}`)
  check('solvem: cheesepan x=10 scales A',
    r92.ass,
    {x: 10, A: 635.85},
    0.05,
    'solvem(eqns, {x: 1, tau: 6.28, ...})',
    'r92.ass should have x=10, A=635.85',
    `r92 = ${JSON.stringify(r92)}`)

  const r93 = (() => {
    // Date/value parameters are pegged, unixtime derives tini/tfin, then r is computed
    const eqns = [
      ['SID', 86400],
      ['y0', 2025], ['m0', 12], ['d0', 25],  // Peg start date
      ['y', 2025], ['m', 12], ['d', 26],     // Peg end date
      ['vini', 0], ['vfin', 100100],          // Peg values
      ['tini', 'unixtime(y0, m0, d0)'],
      ['tfin', 'unixtime(y, m, d)'],
      ['r', '(vfin-vini)/(tfin-tini)'],
    ]

    return solvem(eqns, {
      SID: 86400,
      y0: 2025, m0: 12, d0: 25,
      y: 2025, m: 12, d: 26,
      vini: 0, vfin: 100100,
      tini: 1, tfin: 1, r: 1,
    })
  })()

  check('solvem: dial-style unixtime-derived r (sat)',
    r93.sat,
    true,
    0.001,
    'solvem([unixtime equations], {SID: 86400, ...})',
    'r93.sat should be true',
    `r93 = ${JSON.stringify(r93)}`)
  check('solvem: dial-style unixtime-derived r',
    r93.ass.r,
    100100 / 86400,
    1e-6,
    'solvem([unixtime equations], {SID: 86400, ...})',
    'r93.ass.r should equal 100100/86400',
    `r93 = ${JSON.stringify(r93)}`)
  check('solvem: dial-style unixtime-derived r ~= 1.15856',
    r93.ass.r,
    1.15856,
    1e-5,
    'solvem([unixtime equations], {SID: 86400, ...})',
    'r93.ass.r should be approximately 1.15856',
    `r93 = ${JSON.stringify(r93)}`)

  const r94 = (() => {
    const eqns2 = [
      ['SID', 86400],
      ['y0', 2025], ['m0', 12], ['d0', 25],
      ['y', 2026], ['m', 12], ['d', 25],
      ['vini', 73], ['vfin', 70],
      ['tini', 'unixtime(y0, m0, d0)'],
      ['tfin', 'unixtime(y, m, d)'],
      ['r', '(vfin-vini)/(tfin-tini)'],
    ]

    return solvem(eqns2, {
      SID: 86400,
      y0: 2025, m0: 12, d0: 25,
      y: 2026, m: 12, d: 25,
      vini: 73, vfin: 70,
      tini: 1, tfin: 1, r: 1,
    })
  })()

  const expectedTiny = (70 - 73) / (unixtime(2026, 12, 25) - unixtime(2025, 12, 25))
  check('solvem: dial-style tiny r (sat)',
    r94.sat,
    true,
    0.001,
    'solvem(eqns2, {SID: 86400, ...})',
    'r94.sat should be true',
    `r94 = ${JSON.stringify(r94)}`)
  check('solvem: dial-style tiny r',
    r94.ass.r,
    expectedTiny,
    1e-9,
    'solvem(eqns2, {SID: 86400, ...})',
    'r94.ass.r should equal tiny expectedTiny',
    `r94 = ${JSON.stringify(r94)}`)

  const r95 = (() => {
    const eqns = [
      ['milk', 5, '5.333x'],
      ['eggs', '12x'],
    ]

    return solvem(eqns, {
      milk: 5.333,
      eggs: null,
      x: 1,
    })
  })()

  check('solvem: crepes milk=5 implies eggs (sat)',
    r95.sat,
    true,
    0.001,
    'solvem([["milk", 5, "5.333x"], ["eggs", "12x"]], {milk: 5.333, eggs: null, x: 1})',
    'r95.sat should be true',
    `r95 = ${JSON.stringify(r95)}`)
  check('solvem: crepes milk=5 implies eggs',
    r95.ass.eggs,
    11.250703168948059,
    1e-12,
    'solvem([["milk", 5, "5.333x"], ["eggs", "12x"]], {milk: 5.333, eggs: null, x: 1})',
    'r95.ass.eggs should equal 11.250703168948059',
    `r95 = ${JSON.stringify(r95)}`)

  const r96 = (() => {
    const eqns = [
      ['376x', 752],
      ['200x', 400],
      ['2x', 4],
    ]

    return solvem(eqns, { x: 1 })
  })()

  check('solvem: cookies x=2 via grams (sat)',
    r96.sat,
    true,
    0.001,
    'solvem([["376x", 752], ["200x", 400], ["2x", 4]], {x: 1})',
    'r96.sat should be true',
    `r96 = ${JSON.stringify(r96)}`)
  check('solvem: cookies x=2 via grams',
    r96.ass.x,
    2,
    1e-9,
    'solvem([["376x", 752], ["200x", 400], ["2x", 4]], {x: 1})',
    'r96.ass.x should equal 2',
    `r96 = ${JSON.stringify(r96)}`)

  const r97 = (() => {
    const eqns = [
      ['2x', 4],
      ['1x', 2],
      ['1/2*x', 1],
      ['3/4*x', 1.5],
    ]

    return solvem(eqns, { x: 1 })
  })()

  check('solvem: shortcake x=2 via flour (sat)',
    r97.sat,
    true,
    0.001,
    'solvem([["2x", 4], ["1x", 2], ["1/2*x", 1], ["3/4*x", 1.5]], {x: 1})',
    'r97.sat should be true',
    `r97 = ${JSON.stringify(r97)}`)
  check('solvem: shortcake x=2 via flour',
    r97.ass.x,
    2,
    1e-9,
    'solvem([["2x", 4], ["1x", 2], ["1/2*x", 1], ["3/4*x", 1.5]], {x: 1})',
    'r97.ass.x should equal 2',
    `r97 = ${JSON.stringify(r97)}`)

  const r98 = (() => {
    const eqns = [
      ['x', 6],
      ['2x+3y', 33],
      ['5x-4y', 2],
    ]

    return solvem(eqns, { x: 6, y: 1 })
  })()

  check('solvem: simeq x=6 implies y=7 (sat)',
    r98.sat,
    true,
    0.001,
    'solvem([["x", 6], ["2x+3y", 33], ["5x-4y", 2]], {x: 6, y: 1})',
    'r98.sat should be true',
    `r98 = ${JSON.stringify(r98)}`)
  check('solvem: simeq x=6 implies y=7',
    r98.ass.y,
    7,
    1e-9,
    'solvem([["x", 6], ["2x+3y", 33], ["5x-4y", 2]], {x: 6, y: 1})',
    'r98.ass.y should equal 7',
    `r98 = ${JSON.stringify(r98)}`)

  const r99 = (() => {
    const eqns = [
      ['1x', 2],
      ['2x', 4],
      ['0.5x', 1],
      ['8x', 16],
    ]

    return solvem(eqns, { x: 1 })
  })()

  check('solvem: pancakes x=2 via flour (sat)',
    r99.sat,
    true,
    0.001,
    'solvem([["1x", 2], ["2x", 4], ["0.5x", 1], ["8x", 16]], {x: 1})',
    'r99.sat should be true',
    `r99 = ${JSON.stringify(r99)}`)
  check('solvem: pancakes x=2 via flour',
    r99.ass.x,
    2,
    1e-9,
    'solvem([["1x", 2], ["2x", 4], ["0.5x", 1], ["8x", 16]], {x: 1})',
    'r99.ass.x should equal 2',
    `r99 = ${JSON.stringify(r99)}`)

  const r100 = (() => {
    const eqns = [
      ['x/2', 0.5],
    ]
    return solvem(eqns, { x: 16 })
  })()

  check('solvem: x/2=0.5 from x=16 (sat)',
    eqnsSatisfied([['x/2', 0.5]], r100.ass),
    true,
    0.001,
    'solvem([["x/2", 0.5]], {x: 16})',
    'r100 should satisfy equations',
    `r100 = ${JSON.stringify(r100)}`)
  check('solvem: x/2=0.5 implies x=1',
    r100.ass.x,
    1,
    1e-9,
    'solvem([["x/2", 0.5]], {x: 16})',
    'r100.ass.x should equal 1',
    `r100 = ${JSON.stringify(r100)}`)

  const r101 = (() => {
    const eqns = [
      ['d', 66],
      ['w', 5.45],
      ['u', 'd/w'],
    ]
    return solvem(eqns, { d: 66, w: 5.45, u: 10.56 })
  })()

  check('solvem: u=d/w (sat)',
    eqnsSatisfied([['d', 66], ['w', 5.45], ['u', 'd/w']], r101.ass),
    true,
    0.001,
    'solvem([["d", 66], ["w", 5.45], ["u", "d/w"]], {d: 66, w: 5.45, u: 10.56})',
    'r101 should satisfy equations',
    `r101 = ${JSON.stringify(r101)}`)
  check('solvem: u tracks d/w',
    r101.ass.u,
    66 / 5.45,
    1e-9,
    'solvem([["d", 66], ["w", 5.45], ["u", "d/w"]], {d: 66, w: 5.45, u: 10.56})',
    'r101.ass.u should equal 66/5.45',
    `r101 = ${JSON.stringify(r101)}`)

  const r102 = (() => {
    const eqns = [
      ['m', 1],
      ['s', 30],
      ['d', 20],
      ['vb', 40],
      ['k', 0.621371],
      ['gt', 'm/60+s/3600'],
      ['gd', 'vb*gt'],
      ['t', 'd/vb'],
      ['pd', 'd+gd'],
      ['vp', 'pd/t'],
    ]

    return solvem(eqns, {
      m: 1,
      s: 30,
      d: 20,
      vb: 40,
      k: 0.621371,
      gt: 1,
      gd: 1,
      t: 1,
      pd: 1,
      vp: 1,
    })
  })()

  check('solvem: breakaway pinned inputs (sat)',
    r102.sat,
    true,
    0.001,
    'solvem(breakaway equations, {m: 1, s: 30, ...})',
    'r102.sat should be true',
    `r102 = ${JSON.stringify(r102)}`)
  check('solvem: breakaway vp=42',
    r102.ass.vp,
    42,
    1e-6,
    'solvem(breakaway equations, {m: 1, s: 30, ...})',
    'r102.ass.vp should equal 42',
    `r102 = ${JSON.stringify(r102)}`)
  check('solvem: breakaway gt=0.025',
    r102.ass.gt,
    0.025,
    1e-6,
    'solvem(breakaway equations, {m: 1, s: 30, ...})',
    'r102.ass.gt should equal 0.025',
    `r102 = ${JSON.stringify(r102)}`)
  check('solvem: breakaway gd=1',
    r102.ass.gd,
    1,
    1e-6,
    'solvem(breakaway equations, {m: 1, s: 30, ...})',
    'r102.ass.gd should equal 1',
    `r102 = ${JSON.stringify(r102)}`)

  const r103 = (() => {
    const tini = unixtime(2025, 12, 25)
    const tfin0 = unixtime(2026, 12, 25)
    const r0 = -3 / (tfin0 - tini)
    // Singletons removed: ['y'], ['m'], ['d'], ['(tfin-tini)/SID'], ['r*SIW'], ['r*SIM'],
    // ['tfin - tini'], ['(tfin - tini)/SID'], ['(tfin - tini)/SIW'], ['(tfin - tini)/SIM']
    const eqns = [
      ['y0', 2025],
      ['m0', 12],
      ['d0', 25],
      ['vini', 73],
      ['vfin', 70],
      ['r*SID', -0.008],
      ['tini', 'unixtime(y0, m0, d0)'],
      ['tfin', 'unixtime(y, m, d)'],
      ['r', '(vfin-vini)/(tfin-tini)'],
      ['SID', 86400],
      ['SIW', 'SID*7'],
      ['SIM', 'SID*365.25/12'],
    ]

    return solvem(eqns, {
      SID: 86400,
      SIW: 86400 * 7,
      SIM: 86400 * 365.25 / 12,
      y0: 2025,
      m0: 12,
      d0: 25,
      y: 2026,
      m: 12,
      d: 25,
      vini: 73,
      vfin: 70,
      tini: tini,
      tfin: tfin0,
      r: r0,
    })
  })()

  check('solvem: dial rate change updates end date (sat)',
    r103.sat,
    true,
    0.001,
    'solvem(dial rate equations, {SID: 86400, ...})',
    'r103.sat should be true',
    `r103 = ${JSON.stringify(r103)}`)
  check('solvem: dial rate change end year',
    r103.ass.y,
    2027,
    0.01,
    'solvem(dial rate equations, {SID: 86400, ...})',
    'r103.ass.y should equal 2027',
    `r103 = ${JSON.stringify(r103)}`)
  check('solvem: dial rate change end month',
    r103.ass.m,
    1,
    0.01,
    'solvem(dial rate equations, {SID: 86400, ...})',
    'r103.ass.m should equal 1',
    `r103 = ${JSON.stringify(r103)}`)
  check('solvem: dial rate change end day',
    r103.ass.d,
    4,
    0.01,
    'solvem(dial rate equations, {SID: 86400, ...})',
    'r103.ass.d should equal 4',
    `r103 = ${JSON.stringify(r103)}`)

  const r104 = (() => {
    const tiniVal = unixtime(2025, 12, 25)
    const tfin0 = unixtime(2026, 12, 25)
    const r0 = (70 - 73) / (tfin0 - tiniVal)

    // Singletons removed (display-only cells)
    const eqns = [
      ['y0', 2025],
      ['m0', 12],
      ['d0', 25],
      ['vini', 73, 73],
      ['vfin', 70, 70],
      ['r*SID', -1],
      ['tini', 'unixtime(y0, m0, d0)', tiniVal],
      ['tfin', 'unixtime(y, m, d)'],
      ['r', '(vfin-vini)/(tfin-tini)'],
      ['SID', 86400],
      ['SIW', 'SID*7'],
      ['SIM', 'SID*365.25/12'],
    ]

    return solvem(eqns, {
      SID: 86400,
      SIW: 86400 * 7,
      SIM: 86400 * 365.25 / 12,
      y0: 2025,
      m0: 12,
      d0: 25,
      y: 2026,
      m: 12,
      d: 25,
      vini: 73,
      vfin: 70,
      tini: tiniVal,
      tfin: tfin0,
      r: r0,
    })
  })()

  check('solvem: dial bug1b tini pegged (sat)',
    r104.sat,
    true,
    0.001,
    'solvem(dial bug1b equations, {SID: 86400, ...})',
    'r104.sat should be true',
    `r104 = ${JSON.stringify(r104)}`)
  check('solvem: dial bug1b end year',
    r104.ass.y,
    2025,
    0.01,
    'solvem(dial bug1b equations, {SID: 86400, ...})',
    'r104.ass.y should equal 2025',
    `r104 = ${JSON.stringify(r104)}`)
  check('solvem: dial bug1b end month',
    r104.ass.m,
    12,
    0.01,
    'solvem(dial bug1b equations, {SID: 86400, ...})',
    'r104.ass.m should equal 12',
    `r104 = ${JSON.stringify(r104)}`)
  check('solvem: dial bug1b end day',
    r104.ass.d,
    28,
    0.01,
    'solvem(dial bug1b equations, {SID: 86400, ...})',
    'r104.ass.d should equal 28',
    `r104 = ${JSON.stringify(r104)}`)

  const r105 = (() => {
    const k = 0.621371
    const eqns = [
      ['k', k],
      ['k*d', 12.4274],
    ]

    return solvem(eqns, {
      k: k,
      d: 20,
    })
  })()

  check('solvem: breakaway k*d typing (sat)',
    r105.sat,
    true,
    0.001,
    'solvem([["k", k], ["k*d", 12.4274]], {k: k, d: 20})',
    'r105.sat should be true',
    `r105 = ${JSON.stringify(r105)}`)
  check('solvem: breakaway k*d = 12.4274',
    r105.ass.k * r105.ass.d,
    12.4274,
    1e-9,
    'solvem([["k", k], ["k*d", 12.4274]], {k: k, d: 20})',
    'r105.ass.k * r105.ass.d should equal 12.4274',
    `r105 = ${JSON.stringify(r105)}`)

  // Singletons like {b+0} should be filtered out before calling solvem
  const r106 = (() => {
    const eqns = [
      ['a', 5],
      ['a + b', 10],
    ]
    return solvem(eqns, { a: 5, b: 1 })
  })()

  check('solvem: b derived from a+b=10, a=5 (sat)',
    r106.sat,
    true,
    0.001,
    'solvem([["a", 5], ["a + b", 10]], {a: 5, b: 1})',
    'r106.sat should be true',
    `r106 = ${JSON.stringify(r106)}`)
  check('solvem: b derived from a+b=10, a=5 (b=5)',
    r106.ass.b,
    5,
    1e-9,
    'solvem([["a", 5], ["a + b", 10]], {a: 5, b: 1})',
    'r106.ass.b should equal 5',
    `r106 = ${JSON.stringify(r106)}`)

  // Singletons like {b} should be filtered out before calling solvem
  // (same test as above, singleton removed)

  // Quadratic equation solving:
  // {a=3}x^2+{b=4}x+{c=-20}=0 with a*x^2+b*x+c=0 should solve for x=2
  const r107 = (() => {
    const eqns = [
      ['a', 3],
      ['b', 4],
      ['c', -20],
      ['a*x^2+b*x+c', 0],
    ]
    return solvem(eqns, { a: 3, b: 4, c: -20, x: 1 })
  })()

  check('solvem: quadratic equation (sat)',
    r107.sat,
    true,
    0.001,
    'solvem([["a", 3], ["b", 4], ["c", -20], ["a*x^2+b*x+c", 0]], {a: 3, b: 4, c: -20, x: 1})',
    'r107.sat should be true',
    `r107 = ${JSON.stringify(r107)}`)
  check('solvem: quadratic equation (x=2)',
    r107.ass.x,
    2,
    1e-6,
    'solvem([["a", 3], ["b", 4], ["c", -20], ["a*x^2+b*x+c", 0]], {a: 3, b: 4, c: -20, x: 1})',
    'r107.ass.x should equal 2',
    `r107 = ${JSON.stringify(r107)}`)

  // Golden ratio
  // {1/phi = phi - 1} should solve to phi ≈ 1.618
  const r108 = (() => {
    const phi = (1 + Math.sqrt(5)) / 2
    const eqns = [
      ['1/phi', 'phi - 1'],
    ]
    return solvem(eqns, { phi: 1 })
  })()

  check('solvem: golden ratio (sat)',
    r108.sat,
    true,
    0.001,
    'solvem([["1/phi", "phi - 1"]], {phi: 1})',
    'r108.sat should be true',
    `r108 = ${JSON.stringify(r108)}`)
  check('solvem: golden ratio (phi)',
    r108.ass.phi,
    (1 + Math.sqrt(5)) / 2,
    1e-6,
    'solvem([["1/phi", "phi - 1"]], {phi: 1})',
    'r108.ass.phi should equal golden ratio',
    `r108 = ${JSON.stringify(r108)}`)

  // ==========================================================================
  // Gaussian elimination solver quals
  // ==========================================================================

  // Pure linear system: 2x + 3y = 13, x - y = 1 => x=4, y=3 (wait, let me check)
  // Actually: 2(2) + 3(3) = 4 + 9 = 13, 2 - 3 = -1. Let's use x=4, y=5/3... hmm
  // Let me pick: x + y = 7, x - y = 3 => x=5, y=2
  const r109 = (() => {
    const eqns = [
      ['x + y', 7],
      ['x - y', 3],
    ]
    return solvem(eqns, { x: 0, y: 0 })
  })()

  check('solvem: linear 2x2 system (sat)',
    r109.sat,
    true,
    0.001,
    'solvem([["x + y", 7], ["x - y", 3]], {x: 0, y: 0})',
    'r109.sat should be true',
    `r109 = ${JSON.stringify(r109)}`)
  check('solvem: linear 2x2 x=5',
    r109.ass.x,
    5,
    1e-9,
    'solvem([["x + y", 7], ["x - y", 3]], {x: 0, y: 0})',
    'r109.ass.x should equal 5',
    `r109 = ${JSON.stringify(r109)}`)
  check('solvem: linear 2x2 y=2',
    r109.ass.y,
    2,
    1e-9,
    'solvem([["x + y", 7], ["x - y", 3]], {x: 0, y: 0})',
    'r109.ass.y should equal 2',
    `r109 = ${JSON.stringify(r109)}`)

  // Linear system from README: 2x+3y=33, 5x-4y=2 => x=6, y=7
  const r110 = (() => {
    const eqns = [
      ['2x+3y', 33],
      ['5x-4y', 2],
    ]
    return solvem(eqns, { x: 0, y: 0 })
  })()

  check('solvem: linear README example (sat)',
    r110.sat,
    true,
    0.001,
    'solvem([["2x+3y", 33], ["5x-4y", 2]], {x: 0, y: 0})',
    'r110.sat should be true',
    `r110 = ${JSON.stringify(r110)}`)
  check('solvem: linear README x=6',
    r110.ass.x,
    6,
    1e-9,
    'solvem([["2x+3y", 33], ["5x-4y", 2]], {x: 0, y: 0})',
    'r110.ass.x should equal 6',
    `r110 = ${JSON.stringify(r110)}`)
  check('solvem: linear README y=7',
    r110.ass.y,
    7,
    1e-9,
    'solvem([["2x+3y", 33], ["5x-4y", 2]], {x: 0, y: 0})',
    'r110.ass.y should equal 7',
    `r110 = ${JSON.stringify(r110)}`)

  // Overdetermined but consistent linear system
  const r111 = (() => {
    const eqns = [
      ['x', 5],
      ['y', 3],
      ['x + y', 8],
    ]
    return solvem(eqns, { x: 0, y: 0 })
  })()

  check('solvem: overdetermined linear (sat)',
    r111.sat,
    true,
    0.001,
    'solvem([["x", 5], ["y", 3], ["x + y", 8]], {x: 0, y: 0})',
    'r111.sat should be true',
    `r111 = ${JSON.stringify(r111)}`)
  check('solvem: overdetermined x=5',
    r111.ass.x,
    5,
    1e-9,
    'solvem([["x", 5], ["y", 3], ["x + y", 8]], {x: 0, y: 0})',
    'r111.ass.x should equal 5',
    `r111 = ${JSON.stringify(r111)}`)
  check('solvem: overdetermined y=3',
    r111.ass.y,
    3,
    1e-9,
    'solvem([["x", 5], ["y", 3], ["x + y", 8]], {x: 0, y: 0})',
    'r111.ass.y should equal 3',
    `r111 = ${JSON.stringify(r111)}`)

  // simeq reciplate: simultaneous equations (singletons filtered out before solvem)
  const r112 = (() => {
    const eqns = [
      ['2x + 3y', 33], // constraint: 2x + 3y = 33
      ['5x - 4y', 2],  // constraint: 5x - 4y = 2
    ]
    return solvem(eqns, { x: 1, y: 1 })
  })()

  check('solvem: simeq reciplate (sat)',
    r112.sat,
    true,
    0.001,
    'solvem([["2x + 3y", 33], ["5x - 4y", 2]], {x: 1, y: 1})',
    'r112.sat should be true',
    `r112 = ${JSON.stringify(r112)}`)
  check('solvem: simeq reciplate x=6',
    r112.ass.x,
    6,
    1e-9,
    'solvem([["2x + 3y", 33], ["5x - 4y", 2]], {x: 1, y: 1})',
    'r112.ass.x should equal 6',
    `r112 = ${JSON.stringify(r112)}`)
  check('solvem: simeq reciplate y=7',
    r112.ass.y,
    7,
    1e-9,
    'solvem([["2x + 3y", 33], ["5x - 4y", 2]], {x: 1, y: 1})',
    'r112.ass.y should equal 7',
    `r112 = ${JSON.stringify(r112)}`)

  // ==========================================================================
  // Additional linear system quals (3x3, 4x4, fractional coefficients)
  // ==========================================================================

  // 3x3 linear system: x + y + z = 6, 2x + y - z = 1, x - y + 2z = 5
  // Solution: x=1, y=2, z=3
  const r113 = (() => {
    const eqns = [
      ['x + y + z', 6],
      ['2x + y - z', 1],
      ['x - y + 2z', 5],
    ]
    return solvem(eqns, { x: 0, y: 0, z: 0 })
  })()

  check('solvem: 3x3 linear (sat)', r113.sat, true, 0.001, 'solvem 3x3', 'r113.sat should be true', `r113 = ${JSON.stringify(r113)}`)
  check('solvem: 3x3 linear x=1', r113.ass.x, 1, 1e-9, 'solvem 3x3', 'r113.ass.x should equal 1', `r113 = ${JSON.stringify(r113)}`)
  check('solvem: 3x3 linear y=2', r113.ass.y, 2, 1e-9, 'solvem 3x3', 'r113.ass.y should equal 2', `r113 = ${JSON.stringify(r113)}`)
  check('solvem: 3x3 linear z=3', r113.ass.z, 3, 1e-9, 'solvem 3x3', 'r113.ass.z should equal 3', `r113 = ${JSON.stringify(r113)}`)

  // 3x3 with fractional solution: x + y = 5, y + z = 7, x + z = 6
  // Solution: x=2, y=3, z=4
  const r114 = (() => {
    const eqns = [
      ['x + y', 5],
      ['y + z', 7],
      ['x + z', 6],
    ]
    return solvem(eqns, { x: 0, y: 0, z: 0 })
  })()

  check('solvem: 3x3 symmetric (sat)', r114.sat, true, 0.001, 'solvem 3x3 symmetric', 'r114.sat should be true', `r114 = ${JSON.stringify(r114)}`)
  check('solvem: 3x3 symmetric x=2', r114.ass.x, 2, 1e-9, 'solvem 3x3 symmetric', 'r114.ass.x should equal 2', `r114 = ${JSON.stringify(r114)}`)
  check('solvem: 3x3 symmetric y=3', r114.ass.y, 3, 1e-9, 'solvem 3x3 symmetric', 'r114.ass.y should equal 3', `r114 = ${JSON.stringify(r114)}`)
  check('solvem: 3x3 symmetric z=4', r114.ass.z, 4, 1e-9, 'solvem 3x3 symmetric', 'r114.ass.z should equal 4', `r114 = ${JSON.stringify(r114)}`)

  // 4x4 linear system
  // a + b + c + d = 10, a - b = 2, b - c = 1, c - d = 0
  // Solution: a=4, b=2, c=1, d=1 (wait, let me check: 4+2+1+1=8, not 10)
  // Let's use: a + b + c + d = 10, a = 4, b = 3, c = 2, d = 1
  const r115 = (() => {
    const eqns = [
      ['a + b + c + d', 10],
      ['a', 4],
      ['b', 3],
      ['c', 2],
    ]
    return solvem(eqns, { a: 0, b: 0, c: 0, d: 0 })
  })()

  check('solvem: 4x4 linear (sat)', r115.sat, true, 0.001, 'solvem 4x4', 'r115.sat should be true', `r115 = ${JSON.stringify(r115)}`)
  check('solvem: 4x4 linear a=4', r115.ass.a, 4, 1e-9, 'solvem 4x4', 'r115.ass.a should equal 4', `r115 = ${JSON.stringify(r115)}`)
  check('solvem: 4x4 linear b=3', r115.ass.b, 3, 1e-9, 'solvem 4x4', 'r115.ass.b should equal 3', `r115 = ${JSON.stringify(r115)}`)
  check('solvem: 4x4 linear c=2', r115.ass.c, 2, 1e-9, 'solvem 4x4', 'r115.ass.c should equal 2', `r115 = ${JSON.stringify(r115)}`)
  check('solvem: 4x4 linear d=1', r115.ass.d, 1, 1e-9, 'solvem 4x4', 'r115.ass.d should equal 1', `r115 = ${JSON.stringify(r115)}`)

  // Linear system with fractional coefficients
  // 0.5x + 0.25y = 1.5, x - y = 2 => x=8/3, y=2/3
  const r116 = (() => {
    const eqns = [
      ['0.5*x + 0.25*y', 1.5],
      ['x - y', 2],
    ]
    return solvem(eqns, { x: 0, y: 0 })
  })()

  check('solvem: fractional coeffs (sat)', r116.sat, true, 0.001, 'solvem fractional', 'r116.sat should be true', `r116 = ${JSON.stringify(r116)}`)
  check('solvem: fractional coeffs x=8/3', r116.ass.x, 8/3, 1e-9, 'solvem fractional', 'r116.ass.x should equal 8/3', `r116 = ${JSON.stringify(r116)}`)
  check('solvem: fractional coeffs y=2/3', r116.ass.y, 2/3, 1e-9, 'solvem fractional', 'r116.ass.y should equal 2/3', `r116 = ${JSON.stringify(r116)}`)

  // Linear system with negative coefficients
  // -x + 2y = 5, 3x - y = 1 => x=1.4, y=3.2
  const r117 = (() => {
    const eqns = [
      ['-x + 2y', 5],
      ['3x - y', 1],
    ]
    return solvem(eqns, { x: 0, y: 0 })
  })()

  check('solvem: negative coeffs (sat)', r117.sat, true, 0.001, 'solvem negative', 'r117.sat should be true', `r117 = ${JSON.stringify(r117)}`)
  check('solvem: negative coeffs x=1.4', r117.ass.x, 1.4, 1e-9, 'solvem negative', 'r117.ass.x should equal 1.4', `r117 = ${JSON.stringify(r117)}`)
  check('solvem: negative coeffs y=3.2', r117.ass.y, 3.2, 1e-9, 'solvem negative', 'r117.ass.y should equal 3.2', `r117 = ${JSON.stringify(r117)}`)

  // Linear system with zero in solution
  // x + y = 3, x - y = 3 => x=3, y=0
  const r118 = (() => {
    const eqns = [
      ['x + y', 3],
      ['x - y', 3],
    ]
    return solvem(eqns, { x: 1, y: 1 })
  })()

  check('solvem: zero solution (sat)', r118.sat, true, 0.001, 'solvem zero', 'r118.sat should be true', `r118 = ${JSON.stringify(r118)}`)
  check('solvem: zero solution x=3', r118.ass.x, 3, 1e-9, 'solvem zero', 'r118.ass.x should equal 3', `r118 = ${JSON.stringify(r118)}`)
  check('solvem: zero solution y=0', r118.ass.y, 0, 1e-9, 'solvem zero', 'r118.ass.y should equal 0', `r118 = ${JSON.stringify(r118)}`)

  // Linear system with all negative solution
  // x + y = -5, x - y = -1 => x=-3, y=-2
  const r119 = (() => {
    const eqns = [
      ['x + y', -5],
      ['x - y', -1],
    ]
    return solvem(eqns, { x: 0, y: 0 })
  })()

  check('solvem: negative solution (sat)', r119.sat, true, 0.001, 'solvem negative solution', 'r119.sat should be true', `r119 = ${JSON.stringify(r119)}`)
  check('solvem: negative solution x=-3', r119.ass.x, -3, 1e-9, 'solvem negative solution', 'r119.ass.x should equal -3', `r119 = ${JSON.stringify(r119)}`)
  check('solvem: negative solution y=-2', r119.ass.y, -2, 1e-9, 'solvem negative solution', 'r119.ass.y should equal -2', `r119 = ${JSON.stringify(r119)}`)

  // ==========================================================================
  // simeq variations (different orderings, mixed systems)
  // ==========================================================================

  // simeq with constraints first (display-only singletons filtered out)
  const r120 = solvem([['2x + 3y', 33], ['5x - 4y', 2]], { x: 1, y: 1 })
  check('solvem: simeq constraints-first (sat)', r120.sat, true, 0.001, 'solvem simeq', 'r120.sat', `r120 = ${JSON.stringify(r120)}`)
  check('solvem: simeq constraints-first x=6', r120.ass.x, 6, 1e-9, 'solvem simeq', 'r120.ass.x=6', `r120 = ${JSON.stringify(r120)}`)
  check('solvem: simeq constraints-first y=7', r120.ass.y, 7, 1e-9, 'solvem simeq', 'r120.ass.y=7', `r120 = ${JSON.stringify(r120)}`)

  // simeq (singletons filtered out, constraints only)
  const r121 = solvem([['2x + 3y', 33], ['5x - 4y', 2]], { x: 1, y: 1 })
  check('solvem: simeq interleaved (sat)', r121.sat, true, 0.001, 'solvem simeq', 'r121.sat', `r121 = ${JSON.stringify(r121)}`)
  check('solvem: simeq interleaved x=6', r121.ass.x, 6, 1e-9, 'solvem simeq', 'r121.ass.x=6', `r121 = ${JSON.stringify(r121)}`)
  check('solvem: simeq interleaved y=7', r121.ass.y, 7, 1e-9, 'solvem simeq', 'r121.ass.y=7', `r121 = ${JSON.stringify(r121)}`)

  // simeq (singletons including computed display filtered out)
  const r122 = solvem([['2x + 3y', 33], ['5x - 4y', 2]], { x: 1, y: 1 })
  check('solvem: simeq with computed display (sat)', r122.sat, true, 0.001, 'solvem simeq', 'r122.sat', `r122 = ${JSON.stringify(r122)}`)
  check('solvem: simeq computed display x=6', r122.ass.x, 6, 1e-9, 'solvem simeq', 'r122.ass.x=6', `r122 = ${JSON.stringify(r122)}`)
  check('solvem: simeq computed display y=7', r122.ass.y, 7, 1e-9, 'solvem simeq', 'r122.ass.y=7', `r122 = ${JSON.stringify(r122)}`)

  // 3x3 simeq style (singletons filtered out)
  // x + y + z = 6, x - y = 1, y - z = -1 => x=7/3, y=4/3, z=7/3
  const r123 = solvem([['x + y + z', 6], ['x - y', 1], ['y - z', -1]], { x: 1, y: 1, z: 1 })
  check('solvem: 3x3 simeq style (sat)', r123.sat, true, 0.001, 'solvem 3x3 simeq', 'r123.sat', `r123 = ${JSON.stringify(r123)}`)
  check('solvem: 3x3 simeq x=7/3', r123.ass.x, 7/3, 1e-9, 'solvem 3x3 simeq', 'r123.ass.x=7/3', `r123 = ${JSON.stringify(r123)}`)
  check('solvem: 3x3 simeq y=4/3', r123.ass.y, 4/3, 1e-9, 'solvem 3x3 simeq', 'r123.ass.y=4/3', `r123 = ${JSON.stringify(r123)}`)
  check('solvem: 3x3 simeq z=7/3', r123.ass.z, 7/3, 1e-9, 'solvem 3x3 simeq', 'r123.ass.z=7/3', `r123 = ${JSON.stringify(r123)}`)

  // ==========================================================================
  // Numerical precision edge cases
  // ==========================================================================

  // Very small numbers
  const r124 = solvem([['x', 1e-9], ['y', '1000*x']], { x: 0, y: 0 })
  check('solvem: very small x=1e-9 (sat)', r124.sat, true, 0.001, 'solvem small', 'r124.sat', `r124 = ${JSON.stringify(r124)}`)
  check('solvem: very small x', r124.ass.x, 1e-9, 1e-15, 'solvem small', 'r124.ass.x', `r124 = ${JSON.stringify(r124)}`)
  check('solvem: very small y=1e-6', r124.ass.y, 1e-6, 1e-12, 'solvem small', 'r124.ass.y', `r124 = ${JSON.stringify(r124)}`)

  // Very large numbers
  const r125 = solvem([['x', 1e9], ['y', 'x/1000']], { x: 1, y: 1 })
  check('solvem: very large x=1e9 (sat)', r125.sat, true, 0.001, 'solvem large', 'r125.sat', `r125 = ${JSON.stringify(r125)}`)
  check('solvem: very large x', r125.ass.x, 1e9, 1, 'solvem large', 'r125.ass.x', `r125 = ${JSON.stringify(r125)}`)
  check('solvem: very large y=1e6', r125.ass.y, 1e6, 1, 'solvem large', 'r125.ass.y', `r125 = ${JSON.stringify(r125)}`)

  // Mixed large and small
  const r126 = solvem([['big', 1000000], ['small', 0.000001], ['ratio', 'big/small']], { big: 1, small: 1, ratio: 1 })
  check('solvem: mixed scale (sat)', r126.sat, true, 0.001, 'solvem mixed', 'r126.sat', `r126 = ${JSON.stringify(r126)}`)
  check('solvem: mixed scale ratio=1e12', r126.ass.ratio, 1e12, 1e6, 'solvem mixed', 'r126.ass.ratio', `r126 = ${JSON.stringify(r126)}`)

  // Decimal precision
  const r127 = solvem([['x', 3.14159265], ['y', '2*x']], { x: 1, y: 1 })
  check('solvem: decimal precision (sat)', r127.sat, true, 0.001, 'solvem decimal', 'r127.sat', `r127 = ${JSON.stringify(r127)}`)
  check('solvem: decimal x=pi', r127.ass.x, 3.14159265, 1e-9, 'solvem decimal', 'r127.ass.x', `r127 = ${JSON.stringify(r127)}`)
  check('solvem: decimal y=2pi', r127.ass.y, 6.2831853, 1e-6, 'solvem decimal', 'r127.ass.y', `r127 = ${JSON.stringify(r127)}`)

  // ==========================================================================
  // Bounds edge cases
  // ==========================================================================

  // Solution exactly at lower bound
  ;(() => {
    const eqns = [['x + 5', 10]]
    const r230 = solvem(eqns, { x: 0 }, { x: 5 }, { x: 100 })
    check('solvem: at lower bound (sat)',
      r230.sat,
      true,
      0.001,
      'solvem([["x + 5", 10]], { x: 0 }, { x: 5 }, { x: 100 })',
      'r230.sat should be true',
      `r230 = ${JSON.stringify(r230)}`)
    check('solvem: at lower bound x=5',
      r230.ass.x,
      5,
      1e-9,
      'solvem([["x + 5", 10]], { x: 0 }, { x: 5 }, { x: 100 })',
      'r230.ass.x should equal 5',
      `r230 = ${JSON.stringify(r230)}`)
  })()

  // Solution exactly at upper bound
  ;(() => {
    const eqns = [['x + 5', 15]]
    const r231 = solvem(eqns, { x: 0 }, { x: 0 }, { x: 10 })
    check('solvem: at upper bound (sat)',
      r231.sat,
      true,
      0.001,
      'solvem([["x + 5", 15]], { x: 0 }, { x: 0 }, { x: 10 })',
      'r231.sat should be true',
      `r231 = ${JSON.stringify(r231)}`)
    check('solvem: at upper bound x=10',
      r231.ass.x,
      10,
      1e-9,
      'solvem([["x + 5", 15]], { x: 0 }, { x: 0 }, { x: 10 })',
      'r231.ass.x should equal 10',
      `r231 = ${JSON.stringify(r231)}`)
  })()

  // Bounds not enforced: equation satisfied
  ;(() => {
    const eqns = [['x', 100]]
    const r232 = solvem(eqns, { x: 0 }, { x: 0 }, { x: 10 })
    check('solvem: equation satisfied regardless of bounds',
      r232.sat,
      true,
      0.001,
      'solvem([["x", 100]], { x: 0 }, { x: 0 }, { x: 10 })',
      'r232.sat should be true',
      `r232 = ${JSON.stringify(r232)}`)
    check('solvem: solution x=100',
      r232.ass.x,
      100,
      0.001,
      'solvem([["x", 100]], { x: 0 }, { x: 0 }, { x: 10 })',
      'r232.ass.x should equal 100',
      `r232 = ${JSON.stringify(r232)}`)
  })()

  // One-sided lower bound only
  ;(() => {
    const eqns = [['x^2', 25]]
    const r233 = solvem(eqns, { x: 1 }, { x: 0 }, {})
    check('solvem: lower bound only (sat)',
      r233.sat,
      true,
      0.001,
      'solvem([["x^2", 25]], { x: 1 }, { x: 0 }, {})',
      'r233.sat should be true',
      `r233 = ${JSON.stringify(r233)}`)
    check('solvem: lower bound only x=5',
      r233.ass.x,
      5,
      1e-9,
      'solvem([["x^2", 25]], { x: 1 }, { x: 0 }, {})',
      'r233.ass.x should equal 5',
      `r233 = ${JSON.stringify(r233)}`)
  })()

  // One-sided upper bound only
  ;(() => {
    const eqns = [['x^2', 25]]
    const r234 = solvem(eqns, { x: -1 }, {}, { x: 0 })
    check('solvem: upper bound only (sat)',
      r234.sat,
      true,
      0.001,
      'solvem([["x^2", 25]], { x: -1 }, {}, { x: 0 })',
      'r234.sat should be true',
      `r234 = ${JSON.stringify(r234)}`)
    check('solvem: upper bound only x=-5',
      r234.ass.x,
      -5,
      1e-9,
      'solvem([["x^2", 25]], { x: -1 }, {}, { x: 0 })',
      'r234.ass.x should equal -5',
      `r234 = ${JSON.stringify(r234)}`)
  })()

  // Tight bounds around solution
  ;(() => {
    const eqns = [['x', 5]]
    const r235 = solvem(eqns, { x: 0 }, { x: 4.9 }, { x: 5.1 })
    check('solvem: tight bounds (sat)',
      r235.sat,
      true,
      0.001,
      'solvem([["x", 5]], { x: 0 }, { x: 4.9 }, { x: 5.1 })',
      'r235.sat should be true',
      `r235 = ${JSON.stringify(r235)}`)
    check('solvem: tight bounds x=5',
      r235.ass.x,
      5,
      1e-9,
      'solvem([["x", 5]], { x: 0 }, { x: 4.9 }, { x: 5.1 })',
      'r235.ass.x should equal 5',
      `r235 = ${JSON.stringify(r235)}`)
  })()

  // ==========================================================================
  // Nonlinear equation quals
  // ==========================================================================

  // Quadratic with positive root preferred
  ;(() => {
    const eqns = [['x^2', 16]]
    const r236 = solvem(eqns, { x: 1 })
    check('solvem: quadratic x^2=16 (sat)',
      r236.sat,
      true,
      0.001,
      'solvem([["x^2", 16]], { x: 1 })',
      'r236.sat should be true',
      `r236 = ${JSON.stringify(r236)}`)
    check('solvem: quadratic x=4',
      r236.ass.x,
      4,
      1e-9,
      'solvem([["x^2", 16]], { x: 1 })',
      'r236.ass.x should equal 4',
      `r236 = ${JSON.stringify(r236)}`)
  })()

  // Quadratic with bounds forcing negative root
  ;(() => {
    const eqns = [['x^2', 16]]
    const r237 = solvem(eqns, { x: -1 }, { x: -10 }, { x: 0 })
    check('solvem: quadratic negative via bounds (sat)',
      r237.sat,
      true,
      0.001,
      'solvem([["x^2", 16]], { x: -1 }, { x: -10 }, { x: 0 })',
      'r237.sat should be true',
      `r237 = ${JSON.stringify(r237)}`)
    check('solvem: quadratic x=-4',
      r237.ass.x,
      -4,
      1e-9,
      'solvem([["x^2", 16]], { x: -1 }, { x: -10 }, { x: 0 })',
      'r237.ass.x should equal -4',
      `r237 = ${JSON.stringify(r237)}`)
  })()

  // Cubic root
  ;(() => {
    const eqns = [['x^3', 27]]
    const r238 = solvem(eqns, { x: 1 })
    check('solvem: cubic x^3=27 (sat)',
      r238.sat,
      true,
      0.001,
      'solvem([["x^3", 27]], { x: 1 })',
      'r238.sat should be true',
      `r238 = ${JSON.stringify(r238)}`)
    check('solvem: cubic x=3',
      r238.ass.x,
      3,
      1e-9,
      'solvem([["x^3", 27]], { x: 1 })',
      'r238.ass.x should equal 3',
      `r238 = ${JSON.stringify(r238)}`)
  })()

  // Cubic with negative
  ;(() => {
    const eqns = [['x^3', -8]]
    const r239 = solvem(eqns, { x: -1 })
    check('solvem: cubic x^3=-8 (sat)',
      r239.sat,
      true,
      0.001,
      'solvem([["x^3", -8]], { x: -1 })',
      'r239.sat should be true',
      `r239 = ${JSON.stringify(r239)}`)
    check('solvem: cubic x=-2', r239.ass.x, -2, 1e-9)
  })()

  // Square root relationship
  ;(() => {
    const eqns = [
      ['y', 'sqrt(x)'],
      ['x', 16],
    ]
    const r240 = solvem(eqns, { x: 16, y: 1 })
    check('solvem: sqrt relationship (sat)',
      r240.sat,
      true,
      0.001,
      'solvem([["y", "sqrt(x)"], ["x", 16]], { x: 16, y: 1 })',
      'r240.sat should be true',
      `r240 = ${JSON.stringify(r240)}`)
    check('solvem: sqrt y=4', r240.ass.y, 4, 1e-9)
  })()

  // Inverse relationship: xy = k
  const r128 = solvem([['x*y', 24], ['x', 6]], { x: 6, y: 1 })
  check('solvem: inverse xy=24 (sat)', r128.sat, true, 0.001, 'solvem inverse', 'r128.sat', `r128 = ${JSON.stringify(r128)}`)
  check('solvem: inverse y=4', r128.ass.y, 4, 1e-9, 'solvem inverse', 'r128.ass.y=4', `r128 = ${JSON.stringify(r128)}`)

  // Quadratic formula scenario: ax^2 + bx + c = 0
  // 2x^2 - 7x + 3 = 0 has roots x=3 and x=0.5
  const r129 = solvem([['a', 2], ['b', -7], ['c', 3], ['a*x^2 + b*x + c', 0]], { a: 2, b: -7, c: 3, x: 2 })
  check('solvem: quadratic formula (sat)', r129.sat, true, 0.001, 'solvem quadratic', 'r129.sat', `r129 = ${JSON.stringify(r129)}`)
  // Should find x=3 or x=0.5 - either is valid
  const validRoot = Math.abs(r129.ass.x - 3) < 0.01 || Math.abs(r129.ass.x - 0.5) < 0.01
  check('solvem: quadratic formula valid root', validRoot, true, 0.001, 'solvem quadratic', 'valid root', `r129 = ${JSON.stringify(r129)}`)

  // e^x = y relationship
  const r130 = (() => {
    const e = Math.E
    return solvem([['y', `${e}^x`], ['x', 2]], { x: 2, y: 1 })
  })()
  check('solvem: exponential (sat)', r130.sat, true, 0.001, 'solvem exp', 'r130.sat', `r130 = ${JSON.stringify(r130)}`)
  check('solvem: exponential y=e^2', r130.ass.y, Math.E * Math.E, 1e-9, 'solvem exp', 'r130.ass.y=e^2', `r130 = ${JSON.stringify(r130)}`)

  // ==========================================================================
  // Underdetermined and overdetermined system quals
  // ==========================================================================

  // Underdetermined: more variables than constraints (preserves seeds)
  const r131 = solvem([['x + y', 10]], { x: 3, y: 7 })
  check('solvem: underdetermined (sat)', r131.sat, true, 0.001, 'solvem underdetermined', 'r131.sat', `r131 = ${JSON.stringify(r131)}`)
  check('solvem: underdetermined sum=10', r131.ass.x + r131.ass.y, 10, 1e-9, 'solvem underdetermined', 'sum=10', `r131 = ${JSON.stringify(r131)}`)

  // Underdetermined with definition: x = 2a, y = 3a, no constraint on a
  const r132 = solvem([['x', '2*a'], ['y', '3*a']], { a: 5, x: 1, y: 1 })
  check('solvem: underdetermined chain (sat)', r132.sat, true, 0.001, 'solvem chain', 'r132.sat', `r132 = ${JSON.stringify(r132)}`)
  check('solvem: underdetermined x=10', r132.ass.x, 10, 1e-9, 'solvem chain', 'r132.ass.x=10', `r132 = ${JSON.stringify(r132)}`)
  check('solvem: underdetermined y=15', r132.ass.y, 15, 1e-9, 'solvem chain', 'r132.ass.y=15', `r132 = ${JSON.stringify(r132)}`)

  // Overdetermined consistent: all equations agree
  const r133 = solvem([['x', 5], ['y', 3], ['x + y', 8], ['x - y', 2], ['2*x', 10]], { x: 0, y: 0 })
  check('solvem: overdetermined consistent (sat)', r133.sat, true, 0.001, 'solvem overdetermined', 'r133.sat', `r133 = ${JSON.stringify(r133)}`)
  check('solvem: overdetermined x=5', r133.ass.x, 5, 1e-9, 'solvem overdetermined', 'r133.ass.x=5', `r133 = ${JSON.stringify(r133)}`)
  check('solvem: overdetermined y=3', r133.ass.y, 3, 1e-9, 'solvem overdetermined', 'r133.ass.y=3', `r133 = ${JSON.stringify(r133)}`)

  // Overdetermined inconsistent: conflicting constraints
  const r134 = solvem([['x', 5], ['x', 10]], { x: 0 })
  check('solvem: overdetermined inconsistent (unsat)', r134.sat, false, 0.001, 'solvem inconsistent', 'r134.sat=false', `r134 = ${JSON.stringify(r134)}`)

  // ==========================================================================
  // Real-world recipe scaling quals
  // ==========================================================================

  // Basic recipe scaling: scale factor x
  ;(() => {
    const eqns = [
      ['flour', '2*x'],
      ['sugar', '1*x'],
      ['butter', '0.5*x'],
      ['x', 3],
    ]
    const r241 = solvem(eqns, { flour: 1, sugar: 1, butter: 1, x: 1 })
    check('solvem: recipe scaling (sat)',
      r241.sat,
      true,
      0.001,
      'solvem([["flour", "2*x"], ["sugar", "1*x"], ["butter", "0.5*x"], ["x", 3]], { flour: 1, sugar: 1, butter: 1, x: 1 })',
      'r241.sat should be true',
      `r241 = ${JSON.stringify(r241)}`)
    check('solvem: recipe flour=6', r241.ass.flour, 6, 1e-9)
    check('solvem: recipe sugar=3', r241.ass.sugar, 3, 1e-9)
    check('solvem: recipe butter=1.5', r241.ass.butter, 1.5, 1e-9)
  })()

  // Recipe with unit conversion: cups to ml
  ;(() => {
    const mlPerCup = 236.588
    const eqns = [
      ['cups', 2],
      ['ml', `${mlPerCup}*cups`],
    ]
    const r242 = solvem(eqns, { cups: 2, ml: 1 })
    check('solvem: cups to ml (sat)',
      r242.sat,
      true,
      0.001,
      'solvem([["cups", 2], ["ml", "236.588*cups"]], { cups: 2, ml: 1 })',
      'r242.sat should be true',
      `r242 = ${JSON.stringify(r242)}`)
    check('solvem: cups to ml', r242.ass.ml, 2 * mlPerCup, 0.01)
  })()

  // Recipe reverse scaling: given flour, find scale
  ;(() => {
    const eqns = [
      ['flour', '2*x', 6],
      ['sugar', '1*x'],
      ['butter', '0.5*x'],
    ]
    const r243 = solvem(eqns, { flour: 6, sugar: 1, butter: 1, x: 1 })
    check('solvem: reverse scaling (sat)',
      r243.sat,
      true,
      0.001,
      'solvem([["flour", "2*x", 6], ["sugar", "1*x"], ["butter", "0.5*x"]], { flour: 6, sugar: 1, butter: 1, x: 1 })',
      'r243.sat should be true',
      `r243 = ${JSON.stringify(r243)}`)
    check('solvem: reverse x=3', r243.ass.x, 3, 1e-9)
    check('solvem: reverse sugar=3', r243.ass.sugar, 3, 1e-9)
  })()

  // Ratio-based recipe: a:b:c = 3:4:5 with total = 24
  ;(() => {
    const eqns = [
      ['a', '3*k'],
      ['b', '4*k'],
      ['c', '5*k'],
      ['a + b + c', 24],
    ]
    const r135 = solvem(eqns, { a: 1, b: 1, c: 1, k: 1 })
    check('solvem: ratio recipe (sat)',
      r135.sat,
      true,
      0.001,
      'solvem([["a", "3*k"], ["b", "4*k"], ["c", "5*k"], ["a + b + c", 24]], { a: 1, b: 1, c: 1, k: 1 })',
      'r135.sat should be true',
      `r135 = ${JSON.stringify(r135)}`)
    check('solvem: ratio a=6',
      r135.ass.a,
      6,
      1e-9,
      'solvem([["a", "3*k"], ["b", "4*k"], ["c", "5*k"], ["a + b + c", 24]], { a: 1, b: 1, c: 1, k: 1 })',
      'r135.ass.a should equal 6',
      `r135 = ${JSON.stringify(r135)}`)
    check('solvem: ratio b=8',
      r135.ass.b,
      8,
      1e-9,
      'solvem([["a", "3*k"], ["b", "4*k"], ["c", "5*k"], ["a + b + c", 24]], { a: 1, b: 1, c: 1, k: 1 })',
      'r135.ass.b should equal 8',
      `r135 = ${JSON.stringify(r135)}`)
    check('solvem: ratio c=10',
      r135.ass.c,
      10,
      1e-9,
      'solvem([["a", "3*k"], ["b", "4*k"], ["c", "5*k"], ["a + b + c", 24]], { a: 1, b: 1, c: 1, k: 1 })',
      'r135.ass.c should equal 10',
      `r135 = ${JSON.stringify(r135)}`)
  })()

  // Pizza dough hydration: water/flour ratio
  ;(() => {
    const eqns = [
      ['flour', 500],
      ['hydration', 0.65],
      ['water', 'flour * hydration'],
    ]
    const r136 = solvem(eqns, { flour: 500, hydration: 0.65, water: 1 })
    check('solvem: hydration (sat)',
      r136.sat,
      true,
      0.001,
      'solvem([["flour", 500], ["hydration", 0.65], ["water", "flour * hydration"]], { flour: 500, hydration: 0.65, water: 1 })',
      'r136.sat should be true',
      `r136 = ${JSON.stringify(r136)}`)
    check('solvem: hydration water=325',
      r136.ass.water,
      325,
      1e-9,
      'solvem([["flour", 500], ["hydration", 0.65], ["water", "flour * hydration"]], { flour: 500, hydration: 0.65, water: 1 })',
      'r136.ass.water should equal 325',
      `r136 = ${JSON.stringify(r136)}`)
  })()

  // Multi-ingredient with percentages
  ;(() => {
    const eqns = [
      ['total', 1000],
      ['flour', '0.6 * total'],
      ['water', '0.35 * total'],
      ['yeast', '0.02 * total'],
      ['salt', '0.03 * total'],
    ]
    const r137 = solvem(eqns, { total: 1000, flour: 1, water: 1, yeast: 1, salt: 1 })
    check('solvem: percentages (sat)',
      r137.sat,
      true,
      0.001,
      'solvem([["total", 1000], ["flour", "0.6 * total"], ["water", "0.35 * total"], ["yeast", "0.02 * total"], ["salt", "0.03 * total"]], { total: 1000, flour: 1, water: 1, yeast: 1, salt: 1 })',
      'r137.sat should be true',
      `r137 = ${JSON.stringify(r137)}`)
    check('solvem: flour=600',
      r137.ass.flour,
      600,
      1e-9,
      'solvem([["total", 1000], ["flour", "0.6 * total"], ["water", "0.35 * total"], ["yeast", "0.02 * total"], ["salt", "0.03 * total"]], { total: 1000, flour: 1, water: 1, yeast: 1, salt: 1 })',
      'r137.ass.flour should equal 600',
      `r137 = ${JSON.stringify(r137)}`)
    check('solvem: water=350',
      r137.ass.water,
      350,
      1e-9,
      'solvem([["total", 1000], ["flour", "0.6 * total"], ["water", "0.35 * total"], ["yeast", "0.02 * total"], ["salt", "0.03 * total"]], { total: 1000, flour: 1, water: 1, yeast: 1, salt: 1 })',
      'r137.ass.water should equal 350',
      `r137 = ${JSON.stringify(r137)}`)
    check('solvem: yeast=20',
      r137.ass.yeast,
      20,
      1e-9,
      'solvem([["total", 1000], ["flour", "0.6 * total"], ["water", "0.35 * total"], ["yeast", "0.02 * total"], ["salt", "0.03 * total"]], { total: 1000, flour: 1, water: 1, yeast: 1, salt: 1 })',
      'r137.ass.yeast should equal 20',
      `r137 = ${JSON.stringify(r137)}`)
    check('solvem: salt=30',
      r137.ass.salt,
      30,
      1e-9,
      'solvem([["total", 1000], ["flour", "0.6 * total"], ["water", "0.35 * total"], ["yeast", "0.02 * total"], ["salt", "0.03 * total"]], { total: 1000, flour: 1, water: 1, yeast: 1, salt: 1 })',
      'r137.ass.salt should equal 30',
      `r137 = ${JSON.stringify(r137)}`)
  })()

  // ==========================================================================
  // Additional edge cases
  // ==========================================================================

  // Identity equation (always satisfied)
  ;(() => {
    const eqns = [
      ['x', 'x'],
    ]
    const r138 = solvem(eqns, { x: 42 })
    check('solvem: identity (sat)',
      r138.sat,
      true,
      0.001,
      'solvem([["x", "x"]], { x: 42 })',
      'r138.sat should be true',
      `r138 = ${JSON.stringify(r138)}`)
    check('solvem: identity preserves x',
      r138.ass.x,
      42,
      1e-9,
      'solvem([["x", "x"]], { x: 42 })',
      'r138.ass.x should equal 42',
      `r138 = ${JSON.stringify(r138)}`)
  })()

  // Tautology: a + b = b + a
  ;(() => {
    const eqns = [
      ['a + b', 'b + a'],
      ['a', 3],
      ['b', 7],
    ]
    const r139 = solvem(eqns, { a: 3, b: 7 })
    check('solvem: tautology (sat)',
      r139.sat,
      true,
      0.001,
      'solvem([["a + b", "b + a"], ["a", 3], ["b", 7]], { a: 3, b: 7 })',
      'r139.sat should be true',
      `r139 = ${JSON.stringify(r139)}`)
  })()

  // Parenthesized expressions
  ;(() => {
    const eqns = [
      ['(x + 1) * (x - 1)', 'x^2 - 1'],
      ['x', 5],
    ]
    const r140 = solvem(eqns, { x: 5 })
    check('solvem: parentheses (sat)',
      r140.sat,
      true,
      0.001,
      'solvem([["(x + 1) * (x - 1)", "x^2 - 1"], ["x", 5]], { x: 5 })',
      'r140.sat should be true',
      `r140 = ${JSON.stringify(r140)}`)
  })()

  // Division equation
  ;(() => {
    const eqns = [
      ['x / y', 4],
      ['y', 5],
    ]
    const r141 = solvem(eqns, { x: 1, y: 5 })
    check('solvem: division (sat)',
      r141.sat,
      true,
      0.001,
      'solvem([["x / y", 4], ["y", 5]], { x: 1, y: 5 })',
      'r141.sat should be true',
      `r141 = ${JSON.stringify(r141)}`)
    check('solvem: division x=20',
      r141.ass.x,
      20,
      1e-9,
      'solvem([["x / y", 4], ["y", 5]], { x: 1, y: 5 })',
      'r141.ass.x should equal 20',
      `r141 = ${JSON.stringify(r141)}`)
  })()

  // Multiple equivalent forms
  ;(() => {
    const eqns = [
      ['2*x', 'x + x'],
      ['x', 7],
    ]
    const r142 = solvem(eqns, { x: 7 })
    check('solvem: equivalent forms (sat)',
      r142.sat,
      true,
      0.001,
      'solvem([["2*x", "x + x"], ["x", 7]], { x: 7 })',
      'r142.sat should be true',
      `r142 = ${JSON.stringify(r142)}`)
  })()

  // Circular reference that resolves
  ;(() => {
    const eqns = [
      ['x', 'y + 1'],
      ['y', 'x - 1'],
      ['x', 5],
    ]
    const r143 = solvem(eqns, { x: 5, y: 1 })
    check('solvem: circular resolves (sat)',
      r143.sat,
      true,
      0.001,
      'solvem([["x", "y + 1"], ["y", "x - 1"], ["x", 5]], { x: 5, y: 1 })',
      'r143.sat should be true',
      `r143 = ${JSON.stringify(r143)}`)
    check('solvem: circular x=5',
      r143.ass.x,
      5,
      1e-9,
      'solvem([["x", "y + 1"], ["y", "x - 1"], ["x", 5]], { x: 5, y: 1 })',
      'r143.ass.x should equal 5',
      `r143 = ${JSON.stringify(r143)}`)
    check('solvem: circular y=4',
      r143.ass.y,
      4,
      1e-9,
      'solvem([["x", "y + 1"], ["y", "x - 1"], ["x", 5]], { x: 5, y: 1 })',
      'r143.ass.y should equal 4',
      `r143 = ${JSON.stringify(r143)}`)
  })()

  // Long chain propagation
  ;(() => {
    const eqns = [
      ['a', 1],
      ['b', 'a + 1'],
      ['c', 'b + 1'],
      ['d', 'c + 1'],
      ['e', 'd + 1'],
      ['f', 'e + 1'],
    ]
    const r144 = solvem(eqns, { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1 })
    check('solvem: long chain (sat)',
      r144.sat,
      true,
      0.001,
      'solvem([["a", 1], ["b", "a + 1"], ["c", "b + 1"], ["d", "c + 1"], ["e", "d + 1"], ["f", "e + 1"]], { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1 })',
      'r144.sat should be true',
      `r144 = ${JSON.stringify(r144)}`)
    check('solvem: chain f=6',
      r144.ass.f,
      6,
      1e-9,
      'solvem([["a", 1], ["b", "a + 1"], ["c", "b + 1"], ["d", "c + 1"], ["e", "d + 1"], ["f", "e + 1"]], { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1 })',
      'r144.ass.f should equal 6',
      `r144 = ${JSON.stringify(r144)}`)
  })()

  // Power of 2 chain
  ;(() => {
    const eqns = [
      ['a', 1],
      ['b', '2*a'],
      ['c', '2*b'],
      ['d', '2*c'],
    ]
    const r145 = solvem(eqns, { a: 1, b: 1, c: 1, d: 1 })
    check('solvem: power chain (sat)',
      r145.sat,
      true,
      0.001,
      'solvem([["a", 1], ["b", "2*a"], ["c", "2*b"], ["d", "2*c"]], { a: 1, b: 1, c: 1, d: 1 })',
      'r145.sat should be true',
      `r145 = ${JSON.stringify(r145)}`)
    check('solvem: power d=8',
      r145.ass.d,
      8,
      1e-9,
      'solvem([["a", 1], ["b", "2*a"], ["c", "2*b"], ["d", "2*c"]], { a: 1, b: 1, c: 1, d: 1 })',
      'r145.ass.d should equal 8',
      `r145 = ${JSON.stringify(r145)}`)
  })()

  // Geometric sequence
  ;(() => {
    const eqns = [
      ['a', 2],
      ['r', 3],
      ['b', 'a*r'],
      ['c', 'b*r'],
      ['d', 'c*r'],
    ]
    const r146 = solvem(eqns, { a: 2, r: 3, b: 1, c: 1, d: 1 })
    check('solvem: geometric (sat)',
      r146.sat,
      true,
      0.001,
      'solvem([["a", 2], ["r", 3], ["b", "a*r"], ["c", "b*r"], ["d", "c*r"]], { a: 2, r: 3, b: 1, c: 1, d: 1 })',
      'r146.sat should be true',
      `r146 = ${JSON.stringify(r146)}`)
    check('solvem: geometric b=6',
      r146.ass.b,
      6,
      1e-6,
      'solvem([["a", 2], ["r", 3], ["b", "a*r"], ["c", "b*r"], ["d", "c*r"]], { a: 2, r: 3, b: 1, c: 1, d: 1 })',
      'r146.ass.b should equal 6',
      `r146 = ${JSON.stringify(r146)}`)
    check('solvem: geometric c=18',
      r146.ass.c,
      18,
      1e-6,
      'solvem([["a", 2], ["r", 3], ["b", "a*r"], ["c", "b*r"], ["d", "c*r"]], { a: 2, r: 3, b: 1, c: 1, d: 1 })',
      'r146.ass.c should equal 18',
      `r146 = ${JSON.stringify(r146)}`)
    check('solvem: geometric d=54',
      r146.ass.d,
      54,
      1e-6,
      'solvem([["a", 2], ["r", 3], ["b", "a*r"], ["c", "b*r"], ["d", "c*r"]], { a: 2, r: 3, b: 1, c: 1, d: 1 })',
      'r146.ass.d should equal 54',
      `r146 = ${JSON.stringify(r146)}`)
  })()

  // Fibonacci-like: f3 = f1 + f2
  ;(() => {
    const eqns = [
      ['f1', 1],
      ['f2', 1],
      ['f3', 'f1 + f2'],
      ['f4', 'f2 + f3'],
      ['f5', 'f3 + f4'],
    ]
    const r147 = solvem(eqns, { f1: 1, f2: 1, f3: 1, f4: 1, f5: 1 })
    check('solvem: fibonacci (sat)',
      r147.sat,
      true,
      0.001,
      'solvem([["f1", 1], ["f2", 1], ["f3", "f1 + f2"], ["f4", "f2 + f3"], ["f5", "f3 + f4"]], { f1: 1, f2: 1, f3: 1, f4: 1, f5: 1 })',
      'r147.sat should be true',
      `r147 = ${JSON.stringify(r147)}`)
    check('solvem: fib f3=2',
      r147.ass.f3,
      2,
      1e-9,
      'solvem([["f1", 1], ["f2", 1], ["f3", "f1 + f2"], ["f4", "f2 + f3"], ["f5", "f3 + f4"]], { f1: 1, f2: 1, f3: 1, f4: 1, f5: 1 })',
      'r147.ass.f3 should equal 2',
      `r147 = ${JSON.stringify(r147)}`)
    check('solvem: fib f4=3',
      r147.ass.f4,
      3,
      1e-9,
      'solvem([["f1", 1], ["f2", 1], ["f3", "f1 + f2"], ["f4", "f2 + f3"], ["f5", "f3 + f4"]], { f1: 1, f2: 1, f3: 1, f4: 1, f5: 1 })',
      'r147.ass.f4 should equal 3',
      `r147 = ${JSON.stringify(r147)}`)
    check('solvem: fib f5=5',
      r147.ass.f5,
      5,
      1e-9,
      'solvem([["f1", 1], ["f2", 1], ["f3", "f1 + f2"], ["f4", "f2 + f3"], ["f5", "f3 + f4"]], { f1: 1, f2: 1, f3: 1, f4: 1, f5: 1 })',
      'r147.ass.f5 should equal 5',
      `r147 = ${JSON.stringify(r147)}`)
  })()

  // Area/perimeter problem
  ;(() => {
    const eqns = [
      ['length', 10],
      ['width', 5],
      ['area', 'length * width'],
      ['perimeter', '2*length + 2*width'],
    ]
    const r148 = solvem(eqns, { length: 10, width: 5, area: 1, perimeter: 1 })
    check('solvem: area/perimeter (sat)',
      r148.sat,
      true,
      0.001,
      'solvem([["length", 10], ["width", 5], ["area", "length * width"], ["perimeter", "2*length + 2*width"]], { length: 10, width: 5, area: 1, perimeter: 1 })',
      'r148.sat should be true',
      `r148 = ${JSON.stringify(r148)}`)
    check('solvem: area=50',
      r148.ass.area,
      50,
      1e-6,
      'solvem([["length", 10], ["width", 5], ["area", "length * width"], ["perimeter", "2*length + 2*width"]], { length: 10, width: 5, area: 1, perimeter: 1 })',
      'r148.ass.area should equal 50',
      `r148 = ${JSON.stringify(r148)}`)
    check('solvem: perimeter=30',
      r148.ass.perimeter,
      30,
      1e-6,
      'solvem([["length", 10], ["width", 5], ["area", "length * width"], ["perimeter", "2*length + 2*width"]], { length: 10, width: 5, area: 1, perimeter: 1 })',
      'r148.ass.perimeter should equal 30',
      `r148 = ${JSON.stringify(r148)}`)
  })()

  // Distance/rate/time problem
  ;(() => {
    const eqns = [
      ['distance', 100],
      ['rate', 25],
      ['time', 'distance / rate'],
    ]
    const r149 = solvem(eqns, { distance: 100, rate: 25, time: 1 })
    check('solvem: d/r/t problem (sat)',
      r149.sat,
      true,
      0.001,
      'solvem([["distance", 100], ["rate", 25], ["time", "distance / rate"]], { distance: 100, rate: 25, time: 1 })',
      'r149.sat should be true',
      `r149 = ${JSON.stringify(r149)}`)
    check('solvem: time=4',
      r149.ass.time,
      4,
      1e-9,
      'solvem([["distance", 100], ["rate", 25], ["time", "distance / rate"]], { distance: 100, rate: 25, time: 1 })',
      'r149.ass.time should equal 4',
      `r149 = ${JSON.stringify(r149)}`)
  })()

  // Compound interest simplified: A = P(1+r)^n
  ;(() => {
    const eqns = [
      ['P', 1000],
      ['r', 0.05],
      ['n', 2],
      ['A', 'P * (1+r)^n'],
    ]
    const r150 = solvem(eqns, { P: 1000, r: 0.05, n: 2, A: 1 })
    check('solvem: compound interest (sat)',
      r150.sat,
      true,
      0.001,
      'solvem([["P", 1000], ["r", 0.05], ["n", 2], ["A", "P * (1+r)^n"]], { P: 1000, r: 0.05, n: 2, A: 1 })',
      'r150.sat should be true',
      `r150 = ${JSON.stringify(r150)}`)
    check('solvem: A=1102.5',
      r150.ass.A,
      1102.5,
      1e-9,
      'solvem([["P", 1000], ["r", 0.05], ["n", 2], ["A", "P * (1+r)^n"]], { P: 1000, r: 0.05, n: 2, A: 1 })',
      'r150.ass.A should equal 1102.5',
      `r150 = ${JSON.stringify(r150)}`)
  })()

  // ==========================================================================
  // Multi-term equations and expression equality
  // ==========================================================================

  // Multi-equals: a = b = c = 5
  ;(() => {
    const eqns = [
      ['a', 'b', 'c', 5],
    ]
    const r151 = solvem(eqns, { a: 1, b: 1, c: 1 })
    check('solvem: multi-equals (sat)',
      r151.sat,
      true,
      0.001,
      'solvem([["a", "b", "c", 5]], { a: 1, b: 1, c: 1 })',
      'r151.sat should be true',
      `r151 = ${JSON.stringify(r151)}`)
    check('solvem: multi-equals a=5',
      r151.ass.a,
      5,
      1e-9,
      'solvem([["a", "b", "c", 5]], { a: 1, b: 1, c: 1 })',
      'r151.ass.a should equal 5',
      `r151 = ${JSON.stringify(r151)}`)
    check('solvem: multi-equals b=5',
      r151.ass.b,
      5,
      1e-9,
      'solvem([["a", "b", "c", 5]], { a: 1, b: 1, c: 1 })',
      'r151.ass.b should equal 5',
      `r151 = ${JSON.stringify(r151)}`)
    check('solvem: multi-equals c=5',
      r151.ass.c,
      5,
      1e-9,
      'solvem([["a", "b", "c", 5]], { a: 1, b: 1, c: 1 })',
      'r151.ass.c should equal 5',
      `r151 = ${JSON.stringify(r151)}`)
  })()

  // Expression-to-expression equality: 2a = 3b
  ;(() => {
    const eqns = [
      ['2*a', '3*b'],
      ['a', 6],
    ]
    const r152 = solvem(eqns, { a: 6, b: 1 })
    check('solvem: expr=expr (sat)',
      r152.sat,
      true,
      0.001,
      'solvem([["2*a", "3*b"], ["a", 6]], { a: 6, b: 1 })',
      'r152.sat should be true',
      `r152 = ${JSON.stringify(r152)}`)
    check('solvem: expr=expr b=4',
      r152.ass.b,
      4,
      1e-9,
      'solvem([["2*a", "3*b"], ["a", 6]], { a: 6, b: 1 })',
      'r152.ass.b should equal 4',
      `r152 = ${JSON.stringify(r152)}`)
  })()

  // Baker's percentages: flour=100%, water=65%, salt=2%, yeast=1%
  ;(() => {
    const eqns = [
      ['flour', 500],
      ['water', '0.65 * flour'],
      ['salt', '0.02 * flour'],
      ['yeast', '0.01 * flour'],
      ['total', 'flour + water + salt + yeast'],
    ]
    const r153 = solvem(eqns, { flour: 500, water: 1, salt: 1, yeast: 1, total: 1 })
    check('solvem: baker pct (sat)',
      r153.sat,
      true,
      0.001,
      'solvem([["flour", 500], ["water", "0.65 * flour"], ["salt", "0.02 * flour"], ["yeast", "0.01 * flour"], ["total", "flour + water + salt + yeast"]], { flour: 500, water: 1, salt: 1, yeast: 1, total: 1 })',
      'r153.sat should be true',
      `r153 = ${JSON.stringify(r153)}`)
    check('solvem: baker water=325',
      r153.ass.water,
      325,
      1e-9,
      'solvem([["flour", 500], ["water", "0.65 * flour"], ["salt", "0.02 * flour"], ["yeast", "0.01 * flour"], ["total", "flour + water + salt + yeast"]], { flour: 500, water: 1, salt: 1, yeast: 1, total: 1 })',
      'r153.ass.water should equal 325',
      `r153 = ${JSON.stringify(r153)}`)
    check('solvem: baker salt=10',
      r153.ass.salt,
      10,
      1e-9,
      'solvem([["flour", 500], ["water", "0.65 * flour"], ["salt", "0.02 * flour"], ["yeast", "0.01 * flour"], ["total", "flour + water + salt + yeast"]], { flour: 500, water: 1, salt: 1, yeast: 1, total: 1 })',
      'r153.ass.salt should equal 10',
      `r153 = ${JSON.stringify(r153)}`)
    check('solvem: baker yeast=5',
      r153.ass.yeast,
      5,
      1e-9,
      'solvem([["flour", 500], ["water", "0.65 * flour"], ["salt", "0.02 * flour"], ["yeast", "0.01 * flour"], ["total", "flour + water + salt + yeast"]], { flour: 500, water: 1, salt: 1, yeast: 1, total: 1 })',
      'r153.ass.yeast should equal 5',
      `r153 = ${JSON.stringify(r153)}`)
    check('solvem: baker total=840',
      r153.ass.total,
      840,
      1e-9,
      'solvem([["flour", 500], ["water", "0.65 * flour"], ["salt", "0.02 * flour"], ["yeast", "0.01 * flour"], ["total", "flour + water + salt + yeast"]], { flour: 500, water: 1, salt: 1, yeast: 1, total: 1 })',
      'r153.ass.total should equal 840',
      `r153 = ${JSON.stringify(r153)}`)
  })()

  // Pythagorean 3-4-5 scaling
  ;(() => {
    const eqns = [
      ['a', '3*k'],
      ['b', '4*k'],
      ['c', '5*k'],
      ['a^2 + b^2', 'c^2'],
      ['k', 2],
    ]
    const r154 = solvem(eqns, { a: 1, b: 1, c: 1, k: 2 })
    check('solvem: pythagorean scale (sat)',
      r154.sat,
      true,
      0.001,
      'solvem([["a", "3*k"], ["b", "4*k"], ["c", "5*k"], ["a^2 + b^2", "c^2"], ["k", 2]], { a: 1, b: 1, c: 1, k: 2 })',
      'r154.sat should be true',
      `r154 = ${JSON.stringify(r154)}`)
    check('solvem: pythagorean a=6',
      r154.ass.a,
      6,
      1e-9,
      'solvem([["a", "3*k"], ["b", "4*k"], ["c", "5*k"], ["a^2 + b^2", "c^2"], ["k", 2]], { a: 1, b: 1, c: 1, k: 2 })',
      'r154.ass.a should equal 6',
      `r154 = ${JSON.stringify(r154)}`)
    check('solvem: pythagorean b=8',
      r154.ass.b,
      8,
      1e-9,
      'solvem([["a", "3*k"], ["b", "4*k"], ["c", "5*k"], ["a^2 + b^2", "c^2"], ["k", 2]], { a: 1, b: 1, c: 1, k: 2 })',
      'r154.ass.b should equal 8',
      `r154 = ${JSON.stringify(r154)}`)
    check('solvem: pythagorean c=10',
      r154.ass.c,
      10,
      1e-9,
      'solvem([["a", "3*k"], ["b", "4*k"], ["c", "5*k"], ["a^2 + b^2", "c^2"], ["k", 2]], { a: 1, b: 1, c: 1, k: 2 })',
      'r154.ass.c should equal 10',
      `r154 = ${JSON.stringify(r154)}`)
  })()

  // Three-way equality chain: a = b = c with a pinned
  ;(() => {
    const eqns = [
      ['a', 'b'],
      ['b', 'c'],
      ['a', 7],
    ]
    const r155 = solvem(eqns, { a: 7, b: 1, c: 1 })
    check('solvem: equality chain (sat)',
      r155.sat,
      true,
      0.001,
      'solvem([["a", "b"], ["b", "c"], ["a", 7]], { a: 7, b: 1, c: 1 })',
      'r155.sat should be true',
      `r155 = ${JSON.stringify(r155)}`)
    check('solvem: equality chain a=7',
      r155.ass.a,
      7,
      1e-9,
      'solvem([["a", "b"], ["b", "c"], ["a", 7]], { a: 7, b: 1, c: 1 })',
      'r155.ass.a should equal 7',
      `r155 = ${JSON.stringify(r155)}`)
    check('solvem: equality chain b=7',
      r155.ass.b,
      7,
      1e-9,
      'solvem([["a", "b"], ["b", "c"], ["a", 7]], { a: 7, b: 1, c: 1 })',
      'r155.ass.b should equal 7',
      `r155 = ${JSON.stringify(r155)}`)
    check('solvem: equality chain c=7',
      r155.ass.c,
      7,
      1e-9,
      'solvem([["a", "b"], ["b", "c"], ["a", 7]], { a: 7, b: 1, c: 1 })',
      'r155.ass.c should equal 7',
      `r155 = ${JSON.stringify(r155)}`)
  })()

  // Temperature conversion: C = (F - 32) * 5/9
  ;(() => {
    const eqns = [
      ['F', 212],
      ['C', '(F - 32) * 5/9'],
    ]
    const r156 = solvem(eqns, { F: 212, C: 1 })
    check('solvem: temp conversion (sat)',
      r156.sat,
      true,
      0.001,
      'solvem([["F", 212], ["C", "(F - 32) * 5/9"]], { F: 212, C: 1 })',
      'r156.sat should be true',
      `r156 = ${JSON.stringify(r156)}`)
    check('solvem: temp C=100',
      r156.ass.C,
      100,
      1e-9,
      'solvem([["F", 212], ["C", "(F - 32) * 5/9"]], { F: 212, C: 1 })',
      'r156.ass.C should equal 100',
      `r156 = ${JSON.stringify(r156)}`)
  })()

  // Reverse temperature conversion
  ;(() => {
    const eqns = [
      ['C', 0],
      ['F', 'C * 9/5 + 32'],
    ]
    const r157 = solvem(eqns, { C: 0, F: 1 })
    check('solvem: reverse temp (sat)',
      r157.sat,
      true,
      0.001,
      'solvem([["C", 0], ["F", "C * 9/5 + 32"]], { C: 0, F: 1 })',
      'r157.sat should be true',
      `r157 = ${JSON.stringify(r157)}`)
    check('solvem: reverse temp F=32',
      r157.ass.F,
      32,
      1e-9,
      'solvem([["C", 0], ["F", "C * 9/5 + 32"]], { C: 0, F: 1 })',
      'r157.ass.F should equal 32',
      `r157 = ${JSON.stringify(r157)}`)
  })()

  // BMI calculation: BMI = weight / height^2 (metric)
  ;(() => {
    const eqns = [
      ['weight', 70],
      ['height', 1.75],
      ['bmi', 'weight / height^2'],
    ]
    const r158 = solvem(eqns, { weight: 70, height: 1.75, bmi: 1 })
    check('solvem: bmi calc (sat)',
      r158.sat,
      true,
      0.001,
      'solvem([["weight", 70], ["height", 1.75], ["bmi", "weight / height^2"]], { weight: 70, height: 1.75, bmi: 1 })',
      'r158.sat should be true',
      `r158 = ${JSON.stringify(r158)}`)
    check('solvem: bmi=22.86',
      r158.ass.bmi,
      70 / (1.75 * 1.75),
      0.01,
      'solvem([["weight", 70], ["height", 1.75], ["bmi", "weight / height^2"]], { weight: 70, height: 1.75, bmi: 1 })',
      'r158.ass.bmi should equal 22.86',
      `r158 = ${JSON.stringify(r158)}`)
  })()

  // ==========================================================================
  // Additional edge case quals
  // ==========================================================================

  // Reciprocal relationship: xy = 1
  ;(() => {
    const eqns = [
      ['x', 4],
      ['x*y', 1],
    ]
    const r159 = solvem(eqns, { x: 4, y: 1 })
    check('solvem: reciprocal (sat)',
      r159.sat,
      true,
      0.001,
      'solvem([["x", 4], ["x*y", 1]], { x: 4, y: 1 })',
      'r159.sat should be true',
      `r159 = ${JSON.stringify(r159)}`)
    check('solvem: reciprocal y=0.25',
      r159.ass.y,
      0.25,
      1e-9,
      'solvem([["x", 4], ["x*y", 1]], { x: 4, y: 1 })',
      'r159.ass.y should equal 0.25',
      `r159 = ${JSON.stringify(r159)}`)
  })()

  // Logarithmic relationship (implicit via exp)
  ;(() => {
    const eqns = [
      ['x', 2],
      ['y', 'exp(x)'],
    ]
    const r160 = solvem(eqns, { x: 2, y: 1 })
    check('solvem: exp (sat)',
      r160.sat,
      true,
      0.001,
      'solvem([["x", 2], ["y", "exp(x)"]], { x: 2, y: 1 })',
      'r160.sat should be true',
      `r160 = ${JSON.stringify(r160)}`)
    check('solvem: exp y=e^2',
      r160.ass.y,
      Math.exp(2),
      1e-6,
      'solvem([["x", 2], ["y", "exp(x)"]], { x: 2, y: 1 })',
      'r160.ass.y should equal e^2',
      `r160 = ${JSON.stringify(r160)}`)
  })()

  // Multiple sqrt relationships
  ;(() => {
    const eqns = [
      ['a', 16],
      ['b', 'sqrt(a)'],
      ['c', 'sqrt(b)'],
    ]
    const r161 = solvem(eqns, { a: 16, b: 1, c: 1 })
    check('solvem: nested sqrt (sat)',
      r161.sat,
      true,
      0.001,
      'solvem([["a", 16], ["b", "sqrt(a)"], ["c", "sqrt(b)"]], { a: 16, b: 1, c: 1 })',
      'r161.sat should be true',
      `r161 = ${JSON.stringify(r161)}`)
    check('solvem: nested sqrt b=4',
      r161.ass.b,
      4,
      1e-9,
      'solvem([["a", 16], ["b", "sqrt(a)"], ["c", "sqrt(b)"]], { a: 16, b: 1, c: 1 })',
      'r161.ass.b should equal 4',
      `r161 = ${JSON.stringify(r161)}`)
    check('solvem: nested sqrt c=2',
      r161.ass.c,
      2,
      1e-9,
      'solvem([["a", 16], ["b", "sqrt(a)"], ["c", "sqrt(b)"]], { a: 16, b: 1, c: 1 })',
      'r161.ass.c should equal 2',
      `r161 = ${JSON.stringify(r161)}`)
  })()

  // Absolute value constraint
  ;(() => {
    const eqns = [
      ['x', -5],
      ['y', 'abs(x)'],
    ]
    const r162 = solvem(eqns, { x: -5, y: 1 })
    check('solvem: abs (sat)',
      r162.sat,
      true,
      0.001,
      'solvem([["x", -5], ["y", "abs(x)"]], { x: -5, y: 1 })',
      'r162.sat should be true',
      `r162 = ${JSON.stringify(r162)}`)
    check('solvem: abs y=5',
      r162.ass.y,
      5,
      1e-9,
      'solvem([["x", -5], ["y", "abs(x)"]], { x: -5, y: 1 })',
      'r162.ass.y should equal 5',
      `r162 = ${JSON.stringify(r162)}`)
  })()

  // Floor function
  ;(() => {
    const eqns = [
      ['x', 3.7],
      ['y', 'floor(x)'],
    ]
    const r163 = solvem(eqns, { x: 3.7, y: 1 })
    check('solvem: floor (sat)',
      r163.sat,
      true,
      0.001,
      'solvem([["x", 3.7], ["y", "floor(x)"]], { x: 3.7, y: 1 })',
      'r163.sat should be true',
      `r163 = ${JSON.stringify(r163)}`)
    check('solvem: floor y=3',
      r163.ass.y,
      3,
      1e-9,
      'solvem([["x", 3.7], ["y", "floor(x)"]], { x: 3.7, y: 1 })',
      'r163.ass.y should equal 3',
      `r163 = ${JSON.stringify(r163)}`)
  })()

  // Ceiling function
  ;(() => {
    const eqns = [
      ['x', 3.2],
      ['y', 'ceil(x)'],
    ]
    const r164 = solvem(eqns, { x: 3.2, y: 1 })
    check('solvem: ceil (sat)',
      r164.sat,
      true,
      0.001,
      'solvem([["x", 3.2], ["y", "ceil(x)"]], { x: 3.2, y: 1 })',
      'r164.sat should be true',
      `r164 = ${JSON.stringify(r164)}`)
    check('solvem: ceil y=4',
      r164.ass.y,
      4,
      1e-9,
      'solvem([["x", 3.2], ["y", "ceil(x)"]], { x: 3.2, y: 1 })',
      'r164.ass.y should equal 4',
      `r164 = ${JSON.stringify(r164)}`)
  })()

  // Round function
  ;(() => {
    const eqns = [
      ['x', 3.5],
      ['y', 'round(x)'],
    ]
    const r165 = solvem(eqns, { x: 3.5, y: 1 })
    check('solvem: round (sat)',
      r165.sat,
      true,
      0.001,
      'solvem([["x", 3.5], ["y", "round(x)"]], { x: 3.5, y: 1 })',
      'r165.sat should be true',
      `r165 = ${JSON.stringify(r165)}`)
    check('solvem: round y=4',
      r165.ass.y,
      4,
      1e-9,
      'solvem([["x", 3.5], ["y", "round(x)"]], { x: 3.5, y: 1 })',
      'r165.ass.y should equal 4',
      `r165 = ${JSON.stringify(r165)}`)
  })()

  // Min/max functions
  ;(() => {
    const eqns = [
      ['a', 3],
      ['b', 7],
      ['c', 'min(a, b)'],
      ['d', 'max(a, b)'],
    ]
    const r166 = solvem(eqns, { a: 3, b: 7, c: 1, d: 1 })
    check('solvem: min/max (sat)',
      r166.sat,
      true,
      0.001,
      'solvem([["a", 3], ["b", 7], ["c", "min(a, b)"], ["d", "max(a, b)"]], { a: 3, b: 7, c: 1, d: 1 })',
      'r166.sat should be true',
      `r166 = ${JSON.stringify(r166)}`)
    check('solvem: min c=3',
      r166.ass.c,
      3,
      1e-6,
      'solvem([["a", 3], ["b", 7], ["c", "min(a, b)"], ["d", "max(a, b)"]], { a: 3, b: 7, c: 1, d: 1 })',
      'r166.ass.c should equal 3',
      `r166 = ${JSON.stringify(r166)}`)
    check('solvem: max d=7',
      r166.ass.d,
      7,
      1e-6,
      'solvem([["a", 3], ["b", 7], ["c", "min(a, b)"], ["d", "max(a, b)"]], { a: 3, b: 7, c: 1, d: 1 })',
      'r166.ass.d should equal 7',
      `r166 = ${JSON.stringify(r166)}`)
  })()

  // Circular dependency with solution
  ;(() => {
    const eqns = [
      ['a', 'b + 1'],
      ['b', 'c + 1'],
      ['c', 0],
    ]
    const r167 = solvem(eqns, { a: 1, b: 1, c: 0 })
    check('solvem: circular chain (sat)',
      r167.sat,
      true,
      0.001,
      'solvem([["a", "b + 1"], ["b", "c + 1"], ["c", 0]], { a: 1, b: 1, c: 0 })',
      'r167.sat should be true',
      `r167 = ${JSON.stringify(r167)}`)
    check('solvem: circular a=2',
      r167.ass.a,
      2,
      1e-9,
      'solvem([["a", "b + 1"], ["b", "c + 1"], ["c", 0]], { a: 1, b: 1, c: 0 })',
      'r167.ass.a should equal 2',
      `r167 = ${JSON.stringify(r167)}`)
    check('solvem: circular b=1',
      r167.ass.b,
      1,
      1e-9,
      'solvem([["a", "b + 1"], ["b", "c + 1"], ["c", 0]], { a: 1, b: 1, c: 0 })',
      'r167.ass.b should equal 1',
      `r167 = ${JSON.stringify(r167)}`)
  })()

  // System with negative numbers
  ;(() => {
    const eqns = [
      ['x', -3],
      ['y', '-2*x'],
      ['z', 'x + y'],
    ]
    const r168 = solvem(eqns, { x: -3, y: 1, z: 1 })
    check('solvem: negatives (sat)',
      r168.sat,
      true,
      0.001,
      'solvem([["x", -3], ["y", "-2*x"], ["z", "x + y"]], { x: -3, y: 1, z: 1 })',
      'r168.sat should be true',
      `r168 = ${JSON.stringify(r168)}`)
    check('solvem: negatives y=6',
      r168.ass.y,
      6,
      1e-9,
      'solvem([["x", -3], ["y", "-2*x"], ["z", "x + y"]], { x: -3, y: 1, z: 1 })',
      'r168.ass.y should equal 6',
      `r168 = ${JSON.stringify(r168)}`)
    check('solvem: negatives z=3',
      r168.ass.z,
      3,
      1e-9,
      'solvem([["x", -3], ["y", "-2*x"], ["z", "x + y"]], { x: -3, y: 1, z: 1 })',
      'r168.ass.z should equal 3',
      `r168 = ${JSON.stringify(r168)}`)
  })()

  // Implicit mult with parens: 2(x+1) = 10
  ;(() => {
    const eqns = [
      ['2(x+1)', 10],
    ]
    const r169 = solvem(eqns, { x: 1 })
    check('solvem: implicit paren mult (sat)',
      r169.sat,
      true,
      0.001,
      'solvem([["2(x+1)", 10]], { x: 1 })',
      'r169.sat should be true',
      `r169 = ${JSON.stringify(r169)}`)
    check('solvem: implicit paren x=4',
      r169.ass.x,
      4,
      1e-9,
      'solvem([["2(x+1)", 10]], { x: 1 })',
      'r169.ass.x should equal 4',
      `r169 = ${JSON.stringify(r169)}`)
  })()

  // Area/circumference of circle
  ;(() => {
    const eqns = [
      ['r', 5],
      ['area', '3.14159 * r^2'],
      ['circ', '2 * 3.14159 * r'],
    ]
    const r170 = solvem(eqns, { r: 5, area: 1, circ: 1 })
    check('solvem: circle (sat)',
      r170.sat,
      true,
      0.001,
      'solvem([["r", 5], ["area", "3.14159 * r^2"], ["circ", "2 * 3.14159 * r"]], { r: 5, area: 1, circ: 1 })',
      'r170.sat should be true',
      `r170 = ${JSON.stringify(r170)}`)
    check('solvem: circle area',
      r170.ass.area,
      Math.PI * 25,
      0.01,
      'solvem([["r", 5], ["area", "3.14159 * r^2"], ["circ", "2 * 3.14159 * r"]], { r: 5, area: 1, circ: 1 })',
      'r170.ass.area should equal Math.PI * 25',
      `r170 = ${JSON.stringify(r170)}`)
    check('solvem: circle circ',
      r170.ass.circ,
      Math.PI * 10,
      0.01,
      'solvem([["r", 5], ["area", "3.14159 * r^2"], ["circ", "2 * 3.14159 * r"]], { r: 5, area: 1, circ: 1 })',
      'r170.ass.circ should equal Math.PI * 10',
      `r170 = ${JSON.stringify(r170)}`)
  })()

  // Compound interest: A = P(1 + r)^t
  ;(() => {
    const eqns = [
      ['P', 1000],
      ['r', 0.05],
      ['t', 3],
      ['A', 'P * (1 + r)^t'],
    ]
    const r171 = solvem(eqns, { P: 1000, r: 0.05, t: 3, A: 1 })
    check('solvem: compound interest (sat)',
      r171.sat,
      true,
      0.001,
      'solvem([["P", 1000], ["r", 0.05], ["t", 3], ["A", "P * (1 + r)^t"]], { P: 1000, r: 0.05, t: 3, A: 1 })',
      'r171.sat should be true',
      `r171 = ${JSON.stringify(r171)}`)
    check('solvem: compound A=1157.625',
      r171.ass.A,
      1000 * Math.pow(1.05, 3),
      0.01,
      'solvem([["P", 1000], ["r", 0.05], ["t", 3], ["A", "P * (1 + r)^t"]], { P: 1000, r: 0.05, t: 3, A: 1 })',
      'r171.ass.A should equal 1157.625',
      `r171 = ${JSON.stringify(r171)}`)
  })()

  // Speed/distance/time with derived values
  ;(() => {
    const eqns = [
      ['d', 100],
      ['t', 2],
      ['s', 'd/t'],
      ['d2', 's*3'],  // how far in 3 hours at same speed
    ]
    const r172 = solvem(eqns, { d: 100, t: 2, s: 1, d2: 1 })
    check('solvem: speed/dist/time (sat)',
      r172.sat,
      true,
      0.001,
      'solvem([["d", 100], ["t", 2], ["s", "d/t"], ["d2", "s*3"]], { d: 100, t: 2, s: 1, d2: 1 })',
      'r172.sat should be true',
      `r172 = ${JSON.stringify(r172)}`)
    check('solvem: speed s=50',
      r172.ass.s,
      50,
      1e-5,
      'solvem([["d", 100], ["t", 2], ["s", "d/t"], ["d2", "s*3"]], { d: 100, t: 2, s: 1, d2: 1 })',
      'r172.ass.s should equal 50',
      `r172 = ${JSON.stringify(r172)}`)
    check('solvem: speed d2=150',
      r172.ass.d2,
      150,
      1e-5,
      'solvem([["d", 100], ["t", 2], ["s", "d/t"], ["d2", "s*3"]], { d: 100, t: 2, s: 1, d2: 1 })',
      'r172.ass.d2 should equal 150',
      `r172 = ${JSON.stringify(r172)}`)
  })()

  // Fibonacci-like: f3 = f1 + f2
  ;(() => {
    const eqns = [
      ['f1', 1],
      ['f2', 1],
      ['f3', 'f1 + f2'],
      ['f4', 'f2 + f3'],
      ['f5', 'f3 + f4'],
    ]
    const r173 = solvem(eqns, { f1: 1, f2: 1, f3: 1, f4: 1, f5: 1 })
    check('solvem: fib chain (sat)',
      r173.sat,
      true,
      0.001,
      'solvem([["f1", 1], ["f2", 1], ["f3", "f1 + f2"], ["f4", "f2 + f3"], ["f5", "f3 + f4"]], { f1: 1, f2: 1, f3: 1, f4: 1, f5: 1 })',
      'r173.sat should be true',
      `r173 = ${JSON.stringify(r173)}`)
    check('solvem: fib f3=2',
      r173.ass.f3,
      2,
      1e-9,
      'solvem([["f1", 1], ["f2", 1], ["f3", "f1 + f2"], ["f4", "f2 + f3"], ["f5", "f3 + f4"]], { f1: 1, f2: 1, f3: 1, f4: 1, f5: 1 })',
      'r173.ass.f3 should equal 2',
      `r173 = ${JSON.stringify(r173)}`)
    check('solvem: fib f4=3',
      r173.ass.f4,
      3,
      1e-9,
      'solvem([["f1", 1], ["f2", 1], ["f3", "f1 + f2"], ["f4", "f2 + f3"], ["f5", "f3 + f4"]], { f1: 1, f2: 1, f3: 1, f4: 1, f5: 1 })',
      'r173.ass.f4 should equal 3',
      `r173 = ${JSON.stringify(r173)}`)
    check('solvem: fib f5=5',
      r173.ass.f5,
      5,
      1e-9,
      'solvem([["f1", 1], ["f2", 1], ["f3", "f1 + f2"], ["f4", "f2 + f3"], ["f5", "f3 + f4"]], { f1: 1, f2: 1, f3: 1, f4: 1, f5: 1 })',
      'r173.ass.f5 should equal 5',
      `r173 = ${JSON.stringify(r173)}`)
  })()

  // Harmonic mean
  ;(() => {
    const eqns = [
      ['a', 2],
      ['b', 6],
      ['h', '2*a*b/(a+b)'],
    ]
    const r174 = solvem(eqns, { a: 2, b: 6, h: 1 })
    check('solvem: harmonic mean (sat)',
      r174.sat,
      true,
      0.001,
      'solvem([["a", 2], ["b", 6], ["h", "2*a*b/(a+b)"]], { a: 2, b: 6, h: 1 })',
      'r174.sat should be true',
      `r174 = ${JSON.stringify(r174)}`)
    check('solvem: harmonic h=3',
      r174.ass.h,
      3,
      1e-9,
      'solvem([["a", 2], ["b", 6], ["h", "2*a*b/(a+b)"]], { a: 2, b: 6, h: 1 })',
      'r174.ass.h should equal 3',
      `r174 = ${JSON.stringify(r174)}`)
  })()

  // Geometric mean
  ;(() => {
    const eqns = [
      ['a', 4],
      ['b', 9],
      ['g', 'sqrt(a*b)'],
    ]
    const r175 = solvem(eqns, { a: 4, b: 9, g: 1 })
    check('solvem: geometric mean (sat)',
      r175.sat,
      true,
      0.001,
      'solvem([["a", 4], ["b", 9], ["g", "sqrt(a*b)"]], { a: 4, b: 9, g: 1 })',
      'r175.sat should be true',
      `r175 = ${JSON.stringify(r175)}`)
    check('solvem: geometric g=6',
      r175.ass.g,
      6,
      1e-9,
      'solvem([["a", 4], ["b", 9], ["g", "sqrt(a*b)"]], { a: 4, b: 9, g: 1 })',
      'r175.ass.g should equal 6',
      `r175 = ${JSON.stringify(r175)}`)
  })()

  // Quadratic formula verification: roots of x^2 - 5x + 6 = 0
  ;(() => {
    const eqns = [
      ['a', 1],
      ['b', -5],
      ['c', 6],
      ['disc', 'b^2 - 4*a*c'],
      ['r1', '(-b + sqrt(disc))/(2*a)'],
      ['r2', '(-b - sqrt(disc))/(2*a)'],
    ]
    const r176 = solvem(eqns, { a: 1, b: -5, c: 6, disc: 1, r1: 1, r2: 1 })
    check('solvem: quadratic formula (sat)',
      r176.sat,
      true,
      0.001,
      'solvem([["a", 1], ["b", -5], ["c", 6], ["disc", "b^2 - 4*a*c"], ["r1", "(-b + sqrt(disc))/(2*a)"], ["r2", "(-b - sqrt(disc))/(2*a)"]], { a: 1, b: -5, c: 6, disc: 1, r1: 1, r2: 1 })',
      'r176.sat should be true',
      `r176 = ${JSON.stringify(r176)}`)
    check('solvem: quadratic disc=1',
      r176.ass.disc,
      1,
      1e-9,
      'solvem([["a", 1], ["b", -5], ["c", 6], ["disc", "b^2 - 4*a*c"], ["r1", "(-b + sqrt(disc))/(2*a)"], ["r2", "(-b - sqrt(disc))/(2*a)"]], { a: 1, b: -5, c: 6, disc: 1, r1: 1, r2: 1 })',
      'r176.ass.disc should equal 1',
      `r176 = ${JSON.stringify(r176)}`)
    check('solvem: quadratic r1=3',
      r176.ass.r1,
      3,
      1e-9,
      'solvem([["a", 1], ["b", -5], ["c", 6], ["disc", "b^2 - 4*a*c"], ["r1", "(-b + sqrt(disc))/(2*a)"], ["r2", "(-b - sqrt(disc))/(2*a)"]], { a: 1, b: -5, c: 6, disc: 1, r1: 1, r2: 1 })',
      'r176.ass.r1 should equal 3',
      `r176 = ${JSON.stringify(r176)}`)
    check('solvem: quadratic r2=2',
      r176.ass.r2,
      2,
      1e-9,
      'solvem([["a", 1], ["b", -5], ["c", 6], ["disc", "b^2 - 4*a*c"], ["r1", "(-b + sqrt(disc))/(2*a)"], ["r2", "(-b - sqrt(disc))/(2*a)"]], { a: 1, b: -5, c: 6, disc: 1, r1: 1, r2: 1 })',
      'r176.ass.r2 should equal 2',
      `r176 = ${JSON.stringify(r176)}`)
  })()

  // System with zero values
  ;(() => {
    const eqns = [
      ['x', 0],
      ['y', 'x + 5'],
      ['z', 'x * y'],
    ]
    const r177 = solvem(eqns, { x: 0, y: 1, z: 1 })
    check('solvem: zero values (sat)',
      r177.sat,
      true,
      0.001,
      'solvem([["x", 0], ["y", "x + 5"], ["z", "x * y"]], { x: 0, y: 1, z: 1 })',
      'r177.sat should be true',
      `r177 = ${JSON.stringify(r177)}`)
    check('solvem: zero y=5',
      r177.ass.y,
      5,
      1e-9,
      'solvem([["x", 0], ["y", "x + 5"], ["z", "x * y"]], { x: 0, y: 1, z: 1 })',
      'r177.ass.y should equal 5',
      `r177 = ${JSON.stringify(r177)}`)
    check('solvem: zero z=0',
      r177.ass.z,
      0,
      1e-9,
      'solvem([["x", 0], ["y", "x + 5"], ["z", "x * y"]], { x: 0, y: 1, z: 1 })',
      'r177.ass.z should equal 0',
      `r177 = ${JSON.stringify(r177)}`)
  })()

  // Unit conversion chain: km -> m -> cm
  ;(() => {
    const eqns = [
      ['km', 2],
      ['m', 'km * 1000'],
      ['cm', 'm * 100'],
    ]
    const r178 = solvem(eqns, { km: 2, m: 1, cm: 1 })
    check('solvem: unit chain (sat)',
      r178.sat,
      true,
      0.001,
      'solvem([["km", 2], ["m", "km * 1000"], ["cm", "m * 100"]], { km: 2, m: 1, cm: 1 })',
      'r178.sat should be true',
      `r178 = ${JSON.stringify(r178)}`)
    check('solvem: unit m=2000',
      r178.ass.m,
      2000,
      1e-9,
      'solvem([["km", 2], ["m", "km * 1000"], ["cm", "m * 100"]], { km: 2, m: 1, cm: 1 })',
      'r178.ass.m should equal 2000',
      `r178 = ${JSON.stringify(r178)}`)
    check('solvem: unit cm=200000',
      r178.ass.cm,
      200000,
      1e-9,
      'solvem([["km", 2], ["m", "km * 1000"], ["cm", "m * 100"]], { km: 2, m: 1, cm: 1 })',
      'r178.ass.cm should equal 200000',
      `r178 = ${JSON.stringify(r178)}`)
  })()

  // ==========================================================================
  // Product constraints (w*h pattern)
  // ==========================================================================

  // Product from zero: Progressive relaxation removes conflicting zero seeds
  // Seeds w=0, h=0, A=100 conflict with w*h=A. Solver removes seeds and finds solution.
  ;(() => {
    const eqns = [
      ['w*h', 'A'],
      ['A', 100],
    ]
    const r179 = solvem(eqns, { w: 0, h: 0, A: 100 })
    // Progressive relaxation removes conflicting zero seeds, finds valid solution
    check('solvem: product from zero finds solution',
      r179.sat,
      true,
      0.001,
      'solvem([["w*h", "A"], ["A", 100]], { w: 0, h: 0, A: 100 })',
      'r179.sat should be true',
      `r179 = ${JSON.stringify(r179)}`)
    check('solvem: product from zero w*h=100',
      Math.abs(r179.ass.w * r179.ass.h - 100) < 1e-9,
      true,
      0.001,
      'solvem([["w*h", "A"], ["A", 100]], { w: 0, h: 0, A: 100 })',
      'w*h should equal 100 within tolerance',
      `r179 = ${JSON.stringify(r179)}`)
  })()

  // Product without explicit aspect constraint: Newton finds a solution
  // that satisfies w*h=200 but aspect ratio is NOT preserved (was h/w=2).
  ;(() => {
    const eqns = [
      ['w*h', 'A'],
      ['A', 200],
    ]
    const r180 = solvem(eqns, { w: 5, h: 10, A: 200 })
    check('solvem: product (sat)',
      r180.sat,
      true,
      0.001,
      'solvem([["w*h", "A"], ["A", 200]], { w: 5, h: 10, A: 200 })',
      'r180.sat should be true',
      `r180 = ${JSON.stringify(r180)}`)
    check('solvem: product w*h=200',
      r180.ass.w * r180.ass.h,
      200,
      1e-6,
      'solvem([["w*h", "A"], ["A", 200]], { w: 5, h: 10, A: 200 })',
      'w*h should equal 200',
      `r180 = ${JSON.stringify(r180)}`)
    // Aspect ratio changes from original h/w=2 - any valid solution is fine
    check('solvem: product aspect ratio not original',
      r180.ass.h / r180.ass.w !== 2,
      true,
      0.001,
      'solvem([["w*h", "A"], ["A", 200]], { w: 5, h: 10, A: 200 })',
      'aspect ratio should not be original h/w=2',
      `r180 = ${JSON.stringify(r180)}`)
  })()

  // Product with one variable pinned
  ;(() => {
    const eqns = [
      ['w', 8],
      ['w*h', 'A'],
      ['A', 40],
    ]
    const r181 = solvem(eqns, { w: 8, h: 1, A: 40 })
    check('solvem: product one pinned (sat)',
      r181.sat,
      true,
      0.001,
      'solvem([["w", 8], ["w*h", "A"], ["A", 40]], { w: 8, h: 1, A: 40 })',
      'r181.sat should be true',
      `r181 = ${JSON.stringify(r181)}`)
    check('solvem: product one pinned h=5',
      r181.ass.h,
      5,
      1e-9,
      'solvem([["w", 8], ["w*h", "A"], ["A", 40]], { w: 8, h: 1, A: 40 })',
      'r181.ass.h should equal 5',
      `r181 = ${JSON.stringify(r181)}`)
  })()

  // ==========================================================================
  // Diamond dependency propagation (a→b, a→c, b→d, c→d)
  // ==========================================================================

  ;(() => {
    const eqns = [
      ['a', 10],
      ['b', '2*a'],
      ['c', '3*a'],
      ['d', 'b + c'],
    ]
    const r182 = solvem(eqns, { a: 10, b: 1, c: 1, d: 1 })
    check('solvem: diamond dependency (sat)',
      r182.sat,
      true,
      0.001,
      'solvem([["a", 10], ["b", "2*a"], ["c", "3*a"], ["d", "b + c"]], { a: 10, b: 1, c: 1, d: 1 })',
      'r182.sat should be true',
      `r182 = ${JSON.stringify(r182)}`)
    check('solvem: diamond b=20',
      r182.ass.b,
      20,
      1e-9,
      'solvem([["a", 10], ["b", "2*a"], ["c", "3*a"], ["d", "b + c"]], { a: 10, b: 1, c: 1, d: 1 })',
      'r182.ass.b should equal 20',
      `r182 = ${JSON.stringify(r182)}`)
    check('solvem: diamond c=30',
      r182.ass.c,
      30,
      1e-9,
      'solvem([["a", 10], ["b", "2*a"], ["c", "3*a"], ["d", "b + c"]], { a: 10, b: 1, c: 1, d: 1 })',
      'r182.ass.c should equal 30',
      `r182 = ${JSON.stringify(r182)}`)
    check('solvem: diamond d=50',
      r182.ass.d,
      50,
      1e-9,
      'solvem([["a", 10], ["b", "2*a"], ["c", "3*a"], ["d", "b + c"]], { a: 10, b: 1, c: 1, d: 1 })',
      'r182.ass.d should equal 50',
      `r182 = ${JSON.stringify(r182)}`)
  })()

  // Diamond with constraint at bottom (singleton filtered out)
  ;(() => {
    const eqns = [
      ['b', '2*a'],
      ['c', '3*a'],
      ['d', 'b + c', 100],
    ]
    const r183 = solvem(eqns, { a: 1, b: 1, c: 1, d: 100 })
    check('solvem: diamond reverse (sat)',
      r183.sat,
      true,
      0.001,
      'solvem([["b", "2*a"], ["c", "3*a"], ["d", "b + c", 100]], { a: 1, b: 1, c: 1, d: 100 })',
      'r183.sat should be true',
      `r183 = ${JSON.stringify(r183)}`)
    check('solvem: diamond reverse a=20',
      r183.ass.a,
      20,
      1e-9,
      'solvem([["b", "2*a"], ["c", "3*a"], ["d", "b + c", 100]], { a: 1, b: 1, c: 1, d: 100 })',
      'r183.ass.a should equal 20',
      `r183 = ${JSON.stringify(r183)}`)
    check('solvem: diamond reverse b=40',
      r183.ass.b,
      40,
      1e-9,
      'solvem([["b", "2*a"], ["c", "3*a"], ["d", "b + c", 100]], { a: 1, b: 1, c: 1, d: 100 })',
      'r183.ass.b should equal 40',
      `r183 = ${JSON.stringify(r183)}`)
    check('solvem: diamond reverse c=60',
      r183.ass.c,
      60,
      1e-9,
      'solvem([["b", "2*a"], ["c", "3*a"], ["d", "b + c", 100]], { a: 1, b: 1, c: 1, d: 100 })',
      'r183.ass.c should equal 60',
      `r183 = ${JSON.stringify(r183)}`)
  })()

  // ==========================================================================
  // Discontinuity detection (functions with jumps/asymptotes)
  // ==========================================================================

  // Division approaching zero (1/x near x=0)
  ;(() => {
    const eqns = [
      ['1/x', 100],
    ]
    const r184 = solvem(eqns, { x: 1 })
    check('solvem: 1/x=100 (sat)',
      r184.sat,
      true,
      0.001,
      'solvem([["1/x", 100]], { x: 1 })',
      'r184.sat should be true',
      `r184 = ${JSON.stringify(r184)}`)
    check('solvem: 1/x=100 x=0.01',
      r184.ass.x,
      0.01,
      1e-9,
      'solvem([["1/x", 100]], { x: 1 })',
      'r184.ass.x should equal 0.01',
      `r184 = ${JSON.stringify(r184)}`)
  })()

  // Finding root across discontinuity
  ;(() => {
    const eqns = [
      ['x', 2],
      ['y', '1/x'],
    ]
    const r185 = solvem(eqns, { x: 2, y: 1 })
    check('solvem: y=1/x (sat)',
      r185.sat,
      true,
      0.001,
      'solvem([["x", 2], ["y", "1/x"]], { x: 2, y: 1 })',
      'r185.sat should be true',
      `r185 = ${JSON.stringify(r185)}`)
    check('solvem: y=1/x y=0.5',
      r185.ass.y,
      0.5,
      1e-9,
      'solvem([["x", 2], ["y", "1/x"]], { x: 2, y: 1 })',
      'r185.ass.y should equal 0.5',
      `r185 = ${JSON.stringify(r185)}`)
  })()

  // ==========================================================================
  // Singular/near-singular matrix handling (gaussianElim edge cases)
  // ==========================================================================

  // Linearly dependent equations (infinite solutions - underdetermined)
  ;(() => {
    const eqns = [
      ['x + y', 10],
      ['2*x + 2*y', 20],  // Same constraint, just doubled
    ]
    const r186 = solvem(eqns, { x: 3, y: 7 })
    check('solvem: dependent eqns (sat)',
      r186.sat,
      true,
      0.001,
      'solvem([["x + y", 10], ["2*x + 2*y", 20]], { x: 3, y: 7 })',
      'r186.sat should be true',
      `r186 = ${JSON.stringify(r186)}`)
    check('solvem: dependent eqns sum=10',
      r186.ass.x + r186.ass.y,
      10,
      1e-6,
      'solvem([["x + y", 10], ["2*x + 2*y", 20]], { x: 3, y: 7 })',
      'x + y should equal 10',
      `r186 = ${JSON.stringify(r186)}`)
  })()

  // Nearly singular (ill-conditioned) - coefficients very close
  ;(() => {
    const eqns = [
      ['x + y', 10],
      ['x + 1.0001*y', 10.0005],
    ]
    const r187 = solvem(eqns, { x: 5, y: 5 })
    check('solvem: ill-conditioned (sat)',
      r187.sat,
      true,
      0.001,
      'solvem([["x + y", 10], ["x + 1.0001*y", 10.0005]], { x: 5, y: 5 })',
      'r187.sat should be true',
      `r187 = ${JSON.stringify(r187)}`)
    check('solvem: ill-conditioned x+y=10',
      r187.ass.x + r187.ass.y,
      10,
      0.01,
      'solvem([["x + y", 10], ["x + 1.0001*y", 10.0005]], { x: 5, y: 5 })',
      'x + y should equal 10 within tolerance',
      `r187 = ${JSON.stringify(r187)}`)
  })()

  // Three equations, two dependent
  ;(() => {
    const eqns = [
      ['x', 5],
      ['y', 3],
      ['x + y', 8],  // Redundant but consistent
    ]
    const r188 = solvem(eqns, { x: 0, y: 0 })
    check('solvem: redundant constraint (sat)',
      r188.sat,
      true,
      0.001,
      'solvem([["x", 5], ["y", 3], ["x + y", 8]], { x: 0, y: 0 })',
      'r188.sat should be true',
      `r188 = ${JSON.stringify(r188)}`)
    check('solvem: redundant x=5',
      r188.ass.x,
      5,
      1e-9,
      'solvem([["x", 5], ["y", 3], ["x + y", 8]], { x: 0, y: 0 })',
      'r188.ass.x should equal 5',
      `r188 = ${JSON.stringify(r188)}`)
    check('solvem: redundant y=3',
      r188.ass.y,
      3,
      1e-9,
      'solvem([["x", 5], ["y", 3], ["x + y", 8]], { x: 0, y: 0 })',
      'r188.ass.y should equal 3',
      `r188 = ${JSON.stringify(r188)}`)
  })()

  // ==========================================================================
  // Strict bounds with epsilon handling
  // ==========================================================================

  // Strict lower bound: x > 0, solve x^2 = 0.0001
  ;(() => {
    const eqns = [['x^2', 0.0001]]
    const r189 = solvem(eqns, { x: 0.5 }, { x: 0 }, {})  // x > 0 (strict via epsilon)
    check('solvem: strict lower bound (sat)',
      r189.sat,
      true,
      0.001,
      'solvem([["x^2", 0.0001]], { x: 0.5 }, { x: 0 }, {})',
      'r189.sat should be true',
      `r189 = ${JSON.stringify(r189)}`)
    check('solvem: strict lower x=0.01',
      r189.ass.x,
      0.01,
      1e-6,
      'solvem([["x^2", 0.0001]], { x: 0.5 }, { x: 0 }, {})',
      'r189.ass.x should equal 0.01',
      `r189 = ${JSON.stringify(r189)}`)
  })()

  // Strict upper bound: x < 0, solve x^2 = 4
  ;(() => {
    const eqns = [['x^2', 4]]
    const r190 = solvem(eqns, { x: -1 }, {}, { x: 0 })  // x < 0
    check('solvem: strict upper bound (sat)',
      r190.sat,
      true,
      0.001,
      'solvem([["x^2", 4]], { x: -1 }, {}, { x: 0 })',
      'r190.sat should be true',
      `r190 = ${JSON.stringify(r190)}`)
    check('solvem: strict upper x=-2',
      r190.ass.x,
      -2,
      1e-9,
      'solvem([["x^2", 4]], { x: -1 }, {}, { x: 0 })',
      'r190.ass.x should equal -2',
      `r190 = ${JSON.stringify(r190)}`)
  })()

  // ==========================================================================
  // Expression with init value (regression test for {2x : 6} bug)
  // ==========================================================================

  // {2x : 6} means 2x = 6, so x = 3 (not x = 6!)
  ;(() => {
    const eqns = [
      ['2*x', 6],   // from {2x : 6}
      ['a', 'x'],   // from {a = x}
    ]
    const r191 = solvem(eqns, { x: 1, a: 1, z: 1 })
    check('solvem: {2x : 6} finds x=3 (sat)',
      r191.sat,
      true,
      0.001,
      'solvem([["2*x", 6], ["a", "x"]], { x: 1, a: 1, z: 1 })',
      'r191.sat should be true',
      `r191 = ${JSON.stringify(r191)}`)
    check('solvem: {2x : 6} x=3',
      r191.ass.x,
      3,
      1e-6,
      'solvem([["2*x", 6], ["a", "x"]], { x: 1, a: 1, z: 1 })',
      'r191.ass.x should equal 3',
      `r191 = ${JSON.stringify(r191)}`)
    check('solvem: {2x : 6} a=x=3',
      r191.ass.a,
      3,
      1e-6,
      'solvem([["2*x", 6], ["a", "x"]], { x: 1, a: 1, z: 1 })',
      'r191.ass.a should equal 3',
      `r191 = ${JSON.stringify(r191)}`)
    check('solvem: {2x : 6} z unchanged',
      r191.ass.z,
      1,
      1e-9,
      'solvem([["2*x", 6], ["a", "x"]], { x: 1, a: 1, z: 1 })',
      'r191.ass.z should remain unchanged',
      `r191 = ${JSON.stringify(r191)}`)
  })()

  // ==========================================================================
  // knownVars / seed propagation (tests that solvem works with minimal seeds)
  // ==========================================================================

  // Chain propagation with bad seeds but no knownVars — solver must still find it
  ;(() => {
    const eqns = [
      ['x', 5],
      ['y', '2*x'],
    ]
    const r192 = solvem(eqns, { x: 1, y: 1 })
    check('solvem: chain no knownVars (sat)',
      r192.sat,
      true,
      0.001,
      'solvem([["x", 5], ["y", "2*x"]], { x: 1, y: 1 })',
      'r192.sat should be true',
      `r192 = ${JSON.stringify(r192)}`)
    check('solvem: chain no knownVars x=5',
      r192.ass.x,
      5,
      1e-9,
      'solvem([["x", 5], ["y", "2*x"]], { x: 1, y: 1 })',
      'r192.ass.x should equal 5',
      `r192 = ${JSON.stringify(r192)}`)
    check('solvem: chain no knownVars y=10',
      r192.ass.y,
      10,
      1e-9,
      'solvem([["x", 5], ["y", "2*x"]], { x: 1, y: 1 })',
      'r192.ass.y should equal 10',
      `r192 = ${JSON.stringify(r192)}`)
  })()

  // Chain with knownVars — same result expected
  ;(() => {
    const eqns = [
      ['x', 5],
      ['y', '2*x'],
    ]
    const r193 = solvem(eqns, { x: 1, y: 1 }, {}, {}, new Set(['x']))
    check('solvem: chain with knownVars (sat)',
      r193.sat,
      true,
      0.001,
      'solvem([["x", 5], ["y", "2*x"]], { x: 1, y: 1 }, {}, {}, new Set(["x"]))',
      'r193.sat should be true',
      `r193 = ${JSON.stringify(r193)}`)
    check('solvem: chain with knownVars x=5',
      r193.ass.x,
      5,
      1e-9,
      'solvem([["x", 5], ["y", "2*x"]], { x: 1, y: 1 }, {}, {}, new Set(["x"]))',
      'r193.ass.x should equal 5',
      `r193 = ${JSON.stringify(r193)}`)
    check('solvem: chain with knownVars y=10',
      r193.ass.y,
      10,
      1e-9,
      'solvem([["x", 5], ["y", "2*x"]], { x: 1, y: 1 }, {}, {}, new Set(["x"]))',
      'r193.ass.y should equal 10',
      `r193 = ${JSON.stringify(r193)}`)
  })()

  // Nonlinear chain with bad seeds and no knownVars
  ;(() => {
    const eqns = [
      ['x', 3],
      ['y', 'x^2'],
    ]
    const r194 = solvem(eqns, { x: 1, y: 1 })
    check('solvem: nonlinear chain no knownVars (sat)',
      r194.sat,
      true,
      0.001,
      'solvem([["x", 3], ["y", "x^2"]], { x: 1, y: 1 })',
      'r194.sat should be true',
      `r194 = ${JSON.stringify(r194)}`)
    check('solvem: nonlinear chain x=3',
      r194.ass.x,
      3,
      1e-9,
      'solvem([["x", 3], ["y", "x^2"]], { x: 1, y: 1 })',
      'r194.ass.x should equal 3',
      `r194 = ${JSON.stringify(r194)}`)
    check('solvem: nonlinear chain y=9',
      r194.ass.y,
      9,
      1e-6,
      'solvem([["x", 3], ["y", "x^2"]], { x: 1, y: 1 })',
      'r194.ass.y should equal 9',
      `r194 = ${JSON.stringify(r194)}`)
  })()

  // Underdetermined system with and without knownVars
  ;(() => {
    const eqns = [
      ['x', 'y'],  // x = y, but which value?
    ]
    // Without knownVars: solver picks some solution
    const r195 = solvem(eqns, { x: 7, y: 1 })
    check('solvem: underdetermined (sat)',
      r195.sat,
      true,
      0.001,
      'solvem([["x", "y"]], { x: 7, y: 1 })',
      'r195.sat should be true',
      `r195 = ${JSON.stringify(r195)}`)
    check('solvem: underdetermined x=y',
      r195.ass.x,
      r195.ass.y,
      1e-9,
      'solvem([["x", "y"]], { x: 7, y: 1 })',
      'x should equal y',
      `r195 = ${JSON.stringify(r195)}`)
    // With knownVars: solver should prefer the known value
    const r196 = solvem(eqns, { x: 7, y: 1 }, {}, {}, new Set(['x']))
    check('solvem: underdetermined knownVars (sat)',
      r196.sat,
      true,
      0.001,
      'solvem([["x", "y"]], { x: 7, y: 1 }, {}, {}, new Set(["x"]))',
      'r196.sat should be true',
      `r196 = ${JSON.stringify(r196)}`)
    check('solvem: underdetermined knownVars x=y',
      r196.ass.x,
      r196.ass.y,
      1e-9,
      'solvem([["x", "y"]], { x: 7, y: 1 }, {}, {}, new Set(["x"]))',
      'x should equal y',
      `r196 = ${JSON.stringify(r196)}`)
  })()

  // {A = B} {B = A} reciplate pattern - two cells each saying A=B
  // This is underdetermined (A=B is the only constraint) so solver uses seeds
  ;(() => {
    const eqns = [
      ['A', 'B'],  // Cell 1: A = B
      ['B', 'A'],  // Cell 2: B = A (redundant, same constraint)
    ]
    const r197 = solvem(eqns, { A: 1, B: 1 })
    check('solvem: A=B B=A (sat)',
      r197.sat,
      true,
      0.001,
      'solvem([["A", "B"], ["B", "A"]], { A: 1, B: 1 })',
      'r197.sat should be true',
      `r197 = ${JSON.stringify(r197)}`)
    check('solvem: A=B B=A values equal',
      r197.ass.A,
      r197.ass.B,
      1e-9,
      'solvem([["A", "B"], ["B", "A"]], { A: 1, B: 1 })',
      'A should equal B',
      `r197 = ${JSON.stringify(r197)}`)
    check('solvem: A=B B=A preserves seed',
      r197.ass.A,
      1,
      1e-9,
      'solvem([["A", "B"], ["B", "A"]], { A: 1, B: 1 })',
      'A should preserve seed value 1',
      `r197 = ${JSON.stringify(r197)}`)
  })()

  // Same pattern with different seeds - should preserve those seeds
  ;(() => {
    const eqns = [
      ['A', 'B'],
      ['B', 'A'],
    ]
    const r198 = solvem(eqns, { A: 5, B: 5 })
    check('solvem: A=B B=A seed=5 (sat)',
      r198.sat,
      true,
      0.001,
      'solvem([["A", "B"], ["B", "A"]], { A: 5, B: 5 })',
      'r198.sat should be true',
      `r198 = ${JSON.stringify(r198)}`)
    check('solvem: A=B B=A seed=5 values equal',
      r198.ass.A,
      r198.ass.B,
      1e-9,
      'solvem([["A", "B"], ["B", "A"]], { A: 5, B: 5 })',
      'A should equal B',
      `r198 = ${JSON.stringify(r198)}`)
    check('solvem: A=B B=A seed=5 preserves seed',
      r198.ass.A,
      5,
      1e-9,
      'solvem([["A", "B"], ["B", "A"]], { A: 5, B: 5 })',
      'A should preserve seed value 5',
      `r198 = ${JSON.stringify(r198)}`)
  })()

  // Expression-based equations: {x/2+1 = 5} solves to x=8
  ;(() => {
    const eqns = [
      ['x/2+1', 5],
    ]
    const r199 = solvem(eqns, { x: 1 })
    check('solvem: x/2+1=5 (sat)',
      r199.sat,
      true,
      0.001,
      'solvem([["x/2+1", 5]], { x: 1 })',
      'r199.sat should be true',
      `r199 = ${JSON.stringify(r199)}`)
    check('solvem: x/2+1=5 gives x=8',
      r199.ass.x,
      8,
      1e-9,
      'solvem([["x/2+1", 5]], { x: 1 })',
      'r199.ass.x should equal 8',
      `r199 = ${JSON.stringify(r199)}`)
  })()

  // Two expression-based equations that share a variable
  // {x/2+1} {1-3x} both pinned to same value would constrain x
  ;(() => {
    // x/2+1 = 1-3x  →  x/2 + 3x = 0  →  3.5x = 0  →  x = 0
    // If both expressions equal the same value v: x/2+1=v and 1-3x=v
    // From first: x = 2(v-1) = 2v-2
    // From second: x = (1-v)/3
    // 2v-2 = (1-v)/3  →  6v-6 = 1-v  →  7v = 7  →  v = 1, x = 0
    const eqns = [
      ['x/2+1', '1-3x'],  // These must be equal
    ]
    const r200 = solvem(eqns, { x: 1 })
    check('solvem: x/2+1=1-3x (sat)',
      r200.sat,
      true,
      0.001,
      'solvem([["x/2+1", "1-3x"]], { x: 1 })',
      'r200.sat should be true',
      `r200 = ${JSON.stringify(r200)}`)
    check('solvem: x/2+1=1-3x gives x=0',
      r200.ass.x,
      0,
      1e-9,
      'solvem([["x/2+1", "1-3x"]], { x: 1 })',
      'r200.ass.x should equal 0',
      `r200 = ${JSON.stringify(r200)}`)
  })()

  // Messier expression: (2a-b)/3 = b+1
  ;(() => {
    // (2a-b)/3 = b+1  →  2a-b = 3b+3  →  2a = 4b+3  →  a = 2b + 1.5
    // With b=2: a = 5.5
    const eqns = [
      ['b', 2],
      ['(2*a-b)/3', 'b+1'],
    ]
    const r201 = solvem(eqns, { a: 1, b: 2 })
    check('solvem: messy expr (sat)',
      r201.sat,
      true,
      0.001,
      'solvem([["b", 2], ["(2*a-b)/3", "b+1"]], { a: 1, b: 2 })',
      'r201.sat should be true',
      `r201 = ${JSON.stringify(r201)}`)
    check('solvem: messy expr b=2',
      r201.ass.b,
      2,
      1e-9,
      'solvem([["b", 2], ["(2*a-b)/3", "b+1"]], { a: 1, b: 2 })',
      'r201.ass.b should equal 2',
      `r201 = ${JSON.stringify(r201)}`)
    check('solvem: messy expr a=5.5',
      r201.ass.a,
      5.5,
      1e-9,
      'solvem([["b", 2], ["(2*a-b)/3", "b+1"]], { a: 1, b: 2 })',
      'r201.ass.a should equal 5.5',
      `r201 = ${JSON.stringify(r201)}`)
  })()

  // Bounds + constants together
  ;(() => {
    const eqns = [
      ['x', 5],
      ['y', '2*x'],
    ]
    const r202 = solvem(eqns, { x: 3, y: 3 }, { x: 0 }, { x: 10 }, new Set(['x']))
    check('solvem: bounds+const (sat)',
      r202.sat,
      true,
      0.001,
      'solvem([["x", 5], ["y", "2*x"]], { x: 3, y: 3 }, { x: 0 }, { x: 10 }, new Set(["x"]))',
      'r202.sat should be true',
      `r202 = ${JSON.stringify(r202)}`)
    check('solvem: bounds+const x=5',
      r202.ass.x,
      5,
      1e-9,
      'solvem([["x", 5], ["y", "2*x"]], { x: 3, y: 3 }, { x: 0 }, { x: 10 }, new Set(["x"]))',
      'r202.ass.x should equal 5',
      `r202 = ${JSON.stringify(r202)}`)
    check('solvem: bounds+const y=10',
      r202.ass.y,
      10,
      1e-9,
      'solvem([["x", 5], ["y", "2*x"]], { x: 3, y: 3 }, { x: 0 }, { x: 10 }, new Set(["x"]))',
      'r202.ass.y should equal 10',
      `r202 = ${JSON.stringify(r202)}`)
  })()

  // ==========================================================================
  // solvem contract: expects only constraint equations (callers filter singletons)
  // ==========================================================================

  // Empty equations list (all singletons were filtered by caller)
  ;(() => {
    const eqns = []
    const r203 = solvem(eqns, { x: 42 })
    check('solvem: empty eqns (sat)',
      r203.sat,
      true,
      0.001,
      'solvem([], { x: 42 })',
      'r203.sat should be true',
      `r203 = ${JSON.stringify(r203)}`)
    check('solvem: empty eqns preserves init',
      r203.ass.x,
      42,
      0.001,
      'solvem([], { x: 42 })',
      'r203.ass.x should equal 42',
      `r203 = ${JSON.stringify(r203)}`)
    check('solvem: empty eqns zij length',
      r203.zij.length,
      0,
      0.001,
      'solvem([], { x: 42 })',
      'zij length should be 0',
      `r203 = ${JSON.stringify(r203)}`)
  })()

  // zij is parallel to eqns (no internal expansion since callers handle it)
  ;(() => {
    const eqns = [
      ['x', 5],
      ['y', '2*x'],
      ['z', 'x+y'],
    ]
    const r204 = solvem(eqns, { x: 1, y: 1, z: 1 })
    check('solvem: zij parallel to eqns (sat)',
      r204.sat,
      true,
      0.001,
      'solvem([["x", 5], ["y", "2*x"], ["z", "x+y"]], { x: 1, y: 1, z: 1 })',
      'r204.sat should be true',
      `r204 = ${JSON.stringify(r204)}`)
    check('solvem: zij length matches eqns',
      r204.zij.length,
      eqns.length,
      0.001,
      'solvem([["x", 5], ["y", "2*x"], ["z", "x+y"]], { x: 1, y: 1, z: 1 })',
      'zij length should match eqns length',
      `r204 = ${JSON.stringify(r204)}`)
    check('solvem: satisfied zij all zero',
      r204.zij.every(z => z === 0),
      true,
      0.001,
      'solvem([["x", 5], ["y", "2*x"], ["z", "x+y"]], { x: 1, y: 1, z: 1 })',
      'all zij should be zero',
      `r204 = ${JSON.stringify(r204)}`)
  })()

  // Impossible constraint produces nonzero zij
  ;(() => {
    // x=5 AND x=10 is impossible - use different approach to force conflict
    const eqns = [
      ['x', 5],   // eqn 0: x = 5
      ['x', 10],  // eqn 1: x = 10 (conflict!)
    ]
    const r205 = solvem(eqns, { x: 1 })
    check('solvem: impossible conflict (unsat)',
      r205.sat,
      false,
      0.001,
      'solvem([["x", 5], ["x", 10]], { x: 1 })',
      'r205.sat should be false (conflict)',
      `r205 = ${JSON.stringify(r205)}`)
    // At least one zij should be nonzero since constraints conflict
    const hasNonzero = r205.zij.some(z => z !== 0)
    check('solvem: impossible has nonzero zij',
      hasNonzero,
      true,
      0.001,
      'solvem([["x", 5], ["x", 10]], { x: 1 })',
      'should have at least one nonzero zij',
      `r205 = ${JSON.stringify(r205)}`)
  })()

  // Multiple constraints with different satisfaction states
  ;(() => {
    const eqns = [
      ['a', 10],         // satisfied
      ['b', 'a + 5'],    // satisfied: b = 15
      ['c', 'a * 2'],    // satisfied: c = 20
    ]
    const r206 = solvem(eqns, { a: 10, b: 1, c: 1 })
    check('solvem: multi-constraint (sat)',
      r206.sat,
      true,
      0.001,
      'solvem([["a", 10], ["b", "a + 5"], ["c", "a * 2"]], { a: 10, b: 1, c: 1 })',
      'r206.sat should be true',
      `r206 = ${JSON.stringify(r206)}`)
    check('solvem: multi-constraint a=10',
      r206.ass.a,
      10,
      0.001,
      'solvem([["a", 10], ["b", "a + 5"], ["c", "a * 2"]], { a: 10, b: 1, c: 1 })',
      'r206.ass.a should equal 10',
      `r206 = ${JSON.stringify(r206)}`)
    check('solvem: multi-constraint b=15',
      r206.ass.b,
      15,
      0.001,
      'solvem([["a", 10], ["b", "a + 5"], ["c", "a * 2"]], { a: 10, b: 1, c: 1 })',
      'r206.ass.b should equal 15',
      `r206 = ${JSON.stringify(r206)}`)
    check('solvem: multi-constraint c=20',
      r206.ass.c,
      20,
      0.001,
      'solvem([["a", 10], ["b", "a + 5"], ["c", "a * 2"]], { a: 10, b: 1, c: 1 })',
      'r206.ass.c should equal 20',
      `r206 = ${JSON.stringify(r206)}`)
    check('solvem: multi-constraint all zij zero',
      r206.zij.every(z => z === 0),
      true,
      0.001,
      'solvem([["a", 10], ["b", "a + 5"], ["c", "a * 2"]], { a: 10, b: 1, c: 1 })',
      'all zij should be zero',
      `r206 = ${JSON.stringify(r206)}`)
  })()

  // Verify vars from equations must all be in init (anti-robustness)
  ;(() => {
    const eqns = [
      ['x', 'y + 1'],  // x depends on y
    ]
    // y is in equation but not in init - should throw
    let threw = false
    try {
      solvem(eqns, { x: 1 })
    } catch (e) {
      threw = e.message.includes('"y"')
    }
    check('solvem: missing var throws',
      threw,
      true,
      0.001,
      'solvem([["x", "y + 1"]], { x: 1 }) // missing y in init',
      'should throw error mentioning "y"',
      `threw = ${threw}`)
  })()

  // Verify vars in init but not in equations appear in result
  ;(() => {
    const eqns = [
      ['x', 5],  // only x in equations
    ]
    // y is in init but not in any equation
    const r207 = solvem(eqns, { x: 1, y: 5 })
    check('solvem: init-only var preserved (sat)',
      r207.sat,
      true,
      0.001,
      'solvem([["x", 5]], { x: 1, y: 5 })',
      'r207.sat should be true',
      `r207 = ${JSON.stringify(r207)}`)
    check('solvem: init-only y exists',
      typeof r207.ass.y,
      'number',
      0.001,
      'solvem([["x", 5]], { x: 1, y: 5 })',
      'y should exist in result',
      `r207 = ${JSON.stringify(r207)}`)
    check('solvem: init-only y value preserved',
      r207.ass.y,
      5,
      0.001,
      'solvem([["x", 5]], { x: 1, y: 5 })',
      'y value should be preserved as 5',
      `r207 = ${JSON.stringify(r207)}`)
  })()

  // Three-way equality constraint
  ;(() => {
    const eqns = [
      ['a', 'b', 'c'],  // a = b = c
      ['a', 7],         // a = 7
    ]
    const r208 = solvem(eqns, { a: 1, b: 1, c: 1 })
    check('solvem: 3-way equality (sat)',
      r208.sat,
      true,
      0.001,
      'solvem([["a", "b", "c"], ["a", 7]], { a: 1, b: 1, c: 1 })',
      'r208.sat should be true',
      `r208 = ${JSON.stringify(r208)}`)
    check('solvem: 3-way a=7',
      r208.ass.a,
      7,
      0.001,
      'solvem([["a", "b", "c"], ["a", 7]], { a: 1, b: 1, c: 1 })',
      'r208.ass.a should equal 7',
      `r208 = ${JSON.stringify(r208)}`)
    check('solvem: 3-way b=7',
      r208.ass.b,
      7,
      0.001,
      'solvem([["a", "b", "c"], ["a", 7]], { a: 1, b: 1, c: 1 })',
      'r208.ass.b should equal 7',
      `r208 = ${JSON.stringify(r208)}`)
    check('solvem: 3-way c=7',
      r208.ass.c,
      7,
      0.001,
      'solvem([["a", "b", "c"], ["a", 7]], { a: 1, b: 1, c: 1 })',
      'r208.ass.c should equal 7',
      `r208 = ${JSON.stringify(r208)}`)
  })()

  // Four-way equality from single equation
  ;(() => {
    const eqns = [
      ['w', 'x', 'y', 'z', 5],  // w = x = y = z = 5
    ]
    const r209 = solvem(eqns, { w: 1, x: 1, y: 1, z: 1 })
    check('solvem: 4-way equality (sat)',
      r209.sat,
      true,
      0.001,
      'solvem([["w", "x", "y", "z", 5]], { w: 1, x: 1, y: 1, z: 1 })',
      'r209.sat should be true',
      `r209 = ${JSON.stringify(r209)}`)
    check('solvem: 4-way w=5',
      r209.ass.w,
      5,
      0.001,
      'solvem([["w", "x", "y", "z", 5]], { w: 1, x: 1, y: 1, z: 1 })',
      'r209.ass.w should equal 5',
      `r209 = ${JSON.stringify(r209)}`)
    check('solvem: 4-way x=5',
      r209.ass.x,
      5,
      0.001,
      'solvem([["w", "x", "y", "z", 5]], { w: 1, x: 1, y: 1, z: 1 })',
      'r209.ass.x should equal 5',
      `r209 = ${JSON.stringify(r209)}`)
    check('solvem: 4-way y=5',
      r209.ass.y,
      5,
      0.001,
      'solvem([["w", "x", "y", "z", 5]], { w: 1, x: 1, y: 1, z: 1 })',
      'r209.ass.y should equal 5',
      `r209 = ${JSON.stringify(r209)}`)
    check('solvem: 4-way z=5',
      r209.ass.z,
      5,
      0.001,
      'solvem([["w", "x", "y", "z", 5]], { w: 1, x: 1, y: 1, z: 1 })',
      'r209.ass.z should equal 5',
      `r209 = ${JSON.stringify(r209)}`)
  })()

  // ==========================================================================
  // Anti-robustness: solvem throws if given singletons (contract violation)
  // ==========================================================================

  // solvem must throw if given a singleton (length < 2)
  ;(() => {
    let threw = false
    let errorMsg = ''
    try {
      solvem([['x']], { x: 5 })  // singleton - should throw
    } catch (e) {
      threw = true
      errorMsg = e.message
    }
    check('solvem: throws on singleton',
      threw,
      true,
      0.001,
      'solvem([["x"]], { x: 5 }) // should throw',
      'should throw error for singleton',
      `threw = ${threw}`)
    check('solvem: singleton error mentions equation index',
      errorMsg.includes('equation 0'),
      true,
      0.001,
      'error message check',
      'error should mention "equation 0"',
      `errorMsg = ${errorMsg}`)
    check('solvem: singleton error mentions length',
      errorMsg.includes('length 1'),
      true,
      0.001,
      'error message check',
      'error should mention "length 1"',
      `errorMsg = ${errorMsg}`)
  })()

  // solvem throws if any equation is a singleton (not just first)
  ;(() => {
    let threw = false
    let errorMsg = ''
    try {
      solvem([['x', 5], ['y']], { x: 1, y: 1 })  // second eqn is singleton
    } catch (e) {
      threw = true
      errorMsg = e.message
    }
    check('solvem: throws on singleton in middle',
      threw,
      true,
      0.001,
      'solvem([["x", 5], ["y"]], { x: 1, y: 1 }) // should throw on second eqn',
      'should throw error for singleton in middle',
      `threw = ${threw}`)
    check('solvem: middle singleton error mentions equation 1',
      errorMsg.includes('equation 1'),
      true,
      0.001,
      'error message check',
      'error should mention "equation 1"',
      `errorMsg = ${errorMsg}`)
  })()

  // solvem throws if non-empty init is missing required variables
  ;(() => {
    let threw = false
    let errorMsg = ''
    try {
      solvem([['x', 'y']], { x: 1 })  // y is missing from init
    } catch (e) {
      threw = true
      errorMsg = e.message
    }
    check('solvem: throws on missing var in non-empty init',
      threw,
      true,
      0.001,
      'solvem([["x", "y"]], { x: 1 }) // y missing from init',
      'should throw error for missing variable',
      `threw = ${threw}`)
    check('solvem: missing var error mentions variable name',
      errorMsg.includes('"y"'),
      true,
      0.001,
      'error message check',
      'error should mention "y"',
      `errorMsg = ${errorMsg}`)
  })()

  // solvem does NOT throw if init is empty (initial load case - seeds everything)
  ;(() => {
    let threw = false
    try {
      solvem([['x', 'y']], {})  // empty init - solvem seeds both vars
    } catch (e) {
      threw = true
    }
    check('solvem: empty init does not throw',
      threw,
      false,
      0.001,
      'solvem([["x", "y"]], {})',
      'should not throw with empty init',
      `threw = ${threw}`)
  })()

  // solvem accepts empty array (no equations to violate)
  ;(() => {
    let threw = false
    try {
      solvem([], { x: 5 })
    } catch (e) {
      threw = true
    }
    check('solvem: empty eqns does not throw',
      threw,
      false,
      0.001,
      'solvem([], { x: 5 })',
      'should not throw with empty equations',
      `threw = ${threw}`)
  })()

  // solvem accepts length-2 equations (minimum valid)
  ;(() => {
    let threw = false
    try {
      solvem([['x', 5]], { x: 1 })
    } catch (e) {
      threw = true
    }
    check('solvem: length-2 eqn does not throw',
      threw,
      false,
      0.001,
      'solvem([["x", 5]], { x: 1 })',
      'should not throw with length-2 equation',
      `threw = ${threw}`)
  })()

  // =========================================================================
  // Additional edge case quals
  // =========================================================================

  // Negative numbers in equations
  ;(() => {
    const r210 = solvem([['x', -5]], { x: 1 })
    check('solvem: negative constant (sat)',
      r210.sat,
      true,
      0.001,
      'solvem([["x", -5]], { x: 1 })',
      'r210.sat should be true',
      `r210 = ${JSON.stringify(r210)}`)
    check('solvem: negative constant x=-5',
      r210.ass.x,
      -5,
      1e-9,
      'solvem([["x", -5]], { x: 1 })',
      'r210.ass.x should equal -5',
      `r210 = ${JSON.stringify(r210)}`)
  })()

  // Negative coefficients
  ;(() => {
    const r211 = solvem([['-x', 5]], { x: 1 })
    check('solvem: negative coef (sat)',
      r211.sat,
      true,
      0.001,
      'solvem([["-x", 5]], { x: 1 })',
      'r211.sat should be true',
      `r211 = ${JSON.stringify(r211)}`)
    check('solvem: negative coef x=-5',
      r211.ass.x,
      -5,
      1e-9,
      'solvem([["-x", 5]], { x: 1 })',
      'r211.ass.x should equal -5',
      `r211 = ${JSON.stringify(r211)}`)
  })()

  // Decimal precision
  ;(() => {
    const r212 = solvem([['x', 0.001]], { x: 1 })
    check('solvem: small decimal (sat)',
      r212.sat,
      true,
      0.001,
      'solvem([["x", 0.001]], { x: 1 })',
      'r212.sat should be true',
      `r212 = ${JSON.stringify(r212)}`)
    check('solvem: small decimal x=0.001',
      r212.ass.x,
      0.001,
      1e-9,
      'solvem([["x", 0.001]], { x: 1 })',
      'r212.ass.x should equal 0.001',
      `r212 = ${JSON.stringify(r212)}`)
  })()

  // Large numbers
  ;(() => {
    const r213 = solvem([['x', 1e6]], { x: 1 })
    check('solvem: large number (sat)',
      r213.sat,
      true,
      0.001,
      'solvem([["x", 1e6]], { x: 1 })',
      'r213.sat should be true',
      `r213 = ${JSON.stringify(r213)}`)
    check('solvem: large number x=1e6',
      r213.ass.x,
      1e6,
      1,
      'solvem([["x", 1e6]], { x: 1 })',
      'r213.ass.x should equal 1e6',
      `r213 = ${JSON.stringify(r213)}`)
  })()

  // Division in expression
  ;(() => {
    const r214 = solvem([['x/2', 5]], { x: 1 })
    check('solvem: division (sat)',
      r214.sat,
      true,
      0.001,
      'solvem([["x/2", 5]], { x: 1 })',
      'r214.sat should be true',
      `r214 = ${JSON.stringify(r214)}`)
    check('solvem: division x=10',
      r214.ass.x,
      10,
      1e-9,
      'solvem([["x/2", 5]], { x: 1 })',
      'r214.ass.x should equal 10',
      `r214 = ${JSON.stringify(r214)}`)
  })()

  // Nested parentheses
  ;(() => {
    const r215 = solvem([['((x+1)*2)', 10]], { x: 1 })
    check('solvem: nested parens (sat)',
      r215.sat,
      true,
      0.001,
      'solvem([["((x+1)*2)", 10]], { x: 1 })',
      'r215.sat should be true',
      `r215 = ${JSON.stringify(r215)}`)
    check('solvem: nested parens x=4',
      r215.ass.x,
      4,
      1e-9,
      'solvem([["((x+1)*2)", 10]], { x: 1 })',
      'r215.ass.x should equal 4',
      `r215 = ${JSON.stringify(r215)}`)
  })()

  // Multiple variables, one pinned
  ;(() => {
    const r244 = solvem([['x+y', 10], ['x', 3]], { x: 1, y: 1 })
    check('solvem: multi-var pinned (sat)',
      r244.sat,
      true,
      0.001,
      'solvem([["x+y", 10], ["x", 3]], { x: 1, y: 1 })',
      'r244.sat should be true',
      `r244 = ${JSON.stringify(r244)}`)
    check('solvem: multi-var x=3', r244.ass.x, 3, 1e-9)
    check('solvem: multi-var y=7', r244.ass.y, 7, 1e-9)
  })()

  // Redundant equations (same constraint twice)
  ;(() => {
    const r216 = solvem([['x', 5], ['x', 5]], { x: 1 })
    check('solvem: redundant eqns (sat)',
      r216.sat,
      true,
      0.001,
      'solvem([["x", 5], ["x", 5]], { x: 1 })',
      'r216.sat should be true',
      `r216 = ${JSON.stringify(r216)}`)
    check('solvem: redundant eqns x=5',
      r216.ass.x,
      5,
      1e-9,
      'solvem([["x", 5], ["x", 5]], { x: 1 })',
      'r216.ass.x should equal 5',
      `r216 = ${JSON.stringify(r216)}`)
  })()

  // Zero value
  ;(() => {
    const r217 = solvem([['x', 0]], { x: 1 })
    check('solvem: zero value (sat)',
      r217.sat,
      true,
      0.001,
      'solvem([["x", 0]], { x: 1 })',
      'r217.sat should be true',
      `r217 = ${JSON.stringify(r217)}`)
    check('solvem: zero value x=0',
      r217.ass.x,
      0,
      1e-9,
      'solvem([["x", 0]], { x: 1 })',
      'r217.ass.x should equal 0',
      `r217 = ${JSON.stringify(r217)}`)
  })()

  // Variable equals itself (tautology)
  ;(() => {
    const r218 = solvem([['x', 'x']], { x: 7 })
    check('solvem: tautology (sat)',
      r218.sat,
      true,
      0.001,
      'solvem([["x", "x"]], { x: 7 })',
      'r218.sat should be true',
      `r218 = ${JSON.stringify(r218)}`)
    check('solvem: tautology preserves seed',
      r218.ass.x,
      7,
      1e-9,
      'solvem([["x", "x"]], { x: 7 })',
      'r218.ass.x should preserve seed value 7',
      `r218 = ${JSON.stringify(r218)}`)
  })()

  // Scaling with fractions
  ;(() => {
    const r219 = solvem([['x', 1], ['y', 'x/3']], { x: 1, y: 1 })
    check('solvem: fraction scale (sat)',
      r219.sat,
      true,
      0.001,
      'solvem([["x", 1], ["y", "x/3"]], { x: 1, y: 1 })',
      'r219.sat should be true',
      `r219 = ${JSON.stringify(r219)}`)
    check('solvem: fraction scale y=1/3',
      r219.ass.y,
      1/3,
      1e-9,
      'solvem([["x", 1], ["y", "x/3"]], { x: 1, y: 1 })',
      'r219.ass.y should equal 1/3',
      `r219 = ${JSON.stringify(r219)}`)
  })()

  // Three-variable linear system
  ;(() => {
    const r220 = solvem([
      ['x+y+z', 6],
      ['x', 1],
      ['y', 2],
    ], { x: 1, y: 1, z: 1 })
    check('solvem: 3-var linear (sat)',
      r220.sat,
      true,
      0.001,
      'solvem([["x+y+z", 6], ["x", 1], ["y", 2]], { x: 1, y: 1, z: 1 })',
      'r220.sat should be true',
      `r220 = ${JSON.stringify(r220)}`)
    check('solvem: 3-var x=1',
      r220.ass.x,
      1,
      1e-9,
      'solvem([["x+y+z", 6], ["x", 1], ["y", 2]], { x: 1, y: 1, z: 1 })',
      'r220.ass.x should equal 1',
      `r220 = ${JSON.stringify(r220)}`)
    check('solvem: 3-var y=2',
      r220.ass.y,
      2,
      1e-9,
      'solvem([["x+y+z", 6], ["x", 1], ["y", 2]], { x: 1, y: 1, z: 1 })',
      'r220.ass.y should equal 2',
      `r220 = ${JSON.stringify(r220)}`)
    check('solvem: 3-var z=3',
      r220.ass.z,
      3,
      1e-9,
      'solvem([["x+y+z", 6], ["x", 1], ["y", 2]], { x: 1, y: 1, z: 1 })',
      'r220.ass.z should equal 3',
      `r220 = ${JSON.stringify(r220)}`)
  })()

  // Power expressions
  ;(() => {
    const r221 = solvem([['x^2', 16]], { x: 4 })
    check('solvem: power expr (sat)',
      r221.sat,
      true,
      0.001,
      'solvem([["x^2", 16]], { x: 4 })',
      'r221.sat should be true',
      `r221 = ${JSON.stringify(r221)}`)
    check('solvem: power expr x=4',
      r221.ass.x,
      4,
      1e-9,
      'solvem([["x^2", 16]], { x: 4 })',
      'r221.ass.x should equal 4',
      `r221 = ${JSON.stringify(r221)}`)
  })()

  // Negative power root (seed guides sign)
  ;(() => {
    const r222 = solvem([['x^2', 16]], { x: -4 })
    check('solvem: negative root (sat)',
      r222.sat,
      true,
      0.001,
      'solvem([["x^2", 16]], { x: -4 })',
      'r222.sat should be true',
      `r222 = ${JSON.stringify(r222)}`)
    check('solvem: negative root x=-4',
      r222.ass.x,
      -4,
      1e-9,
      'solvem([["x^2", 16]], { x: -4 })',
      'r222.ass.x should equal -4',
      `r222 = ${JSON.stringify(r222)}`)
  })()

  // Expression on both sides
  ;(() => {
    const r223 = solvem([['2*x', 'x+5']], { x: 1 })
    check('solvem: expr both sides (sat)',
      r223.sat,
      true,
      0.001,
      'solvem([["2*x", "x+5"]], { x: 1 })',
      'r223.sat should be true',
      `r223 = ${JSON.stringify(r223)}`)
    check('solvem: expr both sides x=5',
      r223.ass.x,
      5,
      1e-9,
      'solvem([["2*x", "x+5"]], { x: 1 })',
      'r223.ass.x should equal 5',
      `r223 = ${JSON.stringify(r223)}`)
  })()

  // Constants that simplify
  ;(() => {
    const r224 = solvem([['x', '2+3']], { x: 1 })
    check('solvem: const simplify (sat)',
      r224.sat,
      true,
      0.001,
      'solvem([["x", "2+3"]], { x: 1 })',
      'r224.sat should be true',
      `r224 = ${JSON.stringify(r224)}`)
    check('solvem: const simplify x=5',
      r224.ass.x,
      5,
      1e-9,
      'solvem([["x", "2+3"]], { x: 1 })',
      'r224.ass.x should equal 5',
      `r224 = ${JSON.stringify(r224)}`)
  })()

  // Very tight tolerance
  ;(() => {
    const r225 = solvem([['x', 1.0000001]], { x: 1 })
    check('solvem: tight tolerance (sat)',
      r225.sat,
      true,
      0.001,
      'solvem([["x", 1.0000001]], { x: 1 })',
      'r225.sat should be true',
      `r225 = ${JSON.stringify(r225)}`)
    // Should be very close to 1.0000001
    check('solvem: tight tolerance value',
      Math.abs(r225.ass.x - 1.0000001) < 1e-6,
      true,
      0.001,
      'solvem([["x", 1.0000001]], { x: 1 })',
      'x should be very close to 1.0000001',
      `r225 = ${JSON.stringify(r225)}`)
  })()

  // Protective quals for TOL_NEAR_ZERO edge cases (Phase 3.2)
  // These verify tolerance-based zero checks prevent NaN/crashes
  ;(() => {
    // Test homogeneous expression with reasonable starting point
    const r226 = solvem([['x*x', '4']], { x: 0.1 })
    check('solvem: homogeneous scaling from 0.1 (sat)',
      r226.sat,
      true,
      0.001,
      'solvem([["x*x", "4"]], { x: 0.1 })',
      'r226.sat should be true',
      `r226 = ${JSON.stringify(r226)}`)
    check('solvem: homogeneous scaling reaches target',
      Math.abs(r226.ass.x - 2) < 1e-6,
      true,
      0.001,
      'solvem([["x*x", "4"]], { x: 0.1 })',
      'x should reach target value ~2',
      `r226 = ${JSON.stringify(r226)}`)

    // Test homogeneous expression with small target value
    const r227 = solvem([['x*x', 1e-8]], { x: 1 })
    check('solvem: small target (sat)',
      r227.sat,
      true,
      0.001,
      'solvem([["x*x", 1e-8]], { x: 1 })',
      'r227.sat should be true',
      `r227 = ${JSON.stringify(r227)}`)
    check('solvem: small target scales down',
      Math.abs(r227.ass.x - 1e-4) < 1e-5,
      true,
      0.001,
      'solvem([["x*x", 1e-8]], { x: 1 })',
      'x should scale down to ~1e-4',
      `r227 = ${JSON.stringify(r227)}`)

    // Test that very small ratio doesn't cause NaN or crash
    const r228 = solvem([['x*x*x', 1e-20]], { x: 100 })
    check('solvem: very small ratio (sat)',
      r228.sat,
      true,
      0.001,
      'solvem([["x*x*x", 1e-20]], { x: 100 })',
      'r228.sat should be true',
      `r228 = ${JSON.stringify(r228)}`)
    check('solvem: very small ratio result is finite',
      Number.isFinite(r228.ass.x),
      true,
      0.001,
      'solvem([["x*x*x", 1e-20]], { x: 100 })',
      'result should be finite',
      `r228 = ${JSON.stringify(r228)}`)
    check('solvem: very small ratio gives small value',
      Math.abs(r228.ass.x) < 1e-6,
      true,
      0.001,
      'solvem([["x*x*x", 1e-20]], { x: 100 })',
      'x should be very small',
      `r228 = ${JSON.stringify(r228)}`)

    // Test that exact zero in expression doesn't crash
    const r229 = solvem([['x', '5'], ['y', '0']], { x: 1, y: 1 })
    check('solvem: zero constant (sat)',
      r229.sat,
      true,
      0.001,
      'solvem([["x", "5"], ["y", "0"]], { x: 1, y: 1 })',
      'r229.sat should be true',
      `r229 = ${JSON.stringify(r229)}`)
    check('solvem: zero constant y=0',
      r229.ass.y,
      0,
      1e-9,
      'solvem([["x", "5"], ["y", "0"]], { x: 1, y: 1 })',
      'r229.ass.y should equal 0',
      `r229 = ${JSON.stringify(r229)}`)
  })()

  console.log('\n=== Summary ===')
  console.log(`${results.passed} passed, ${results.failed} failed`)
  if (results.failed > 0) {
    console.log('Failed:', results.errors.join(', '))
  }
  console.log('\n')

  return results
}

function main() {
  const root = path.resolve(__dirname, '..')
  const mathevalPath = path.join(root, 'matheval.js')
  const csolverPath = path.join(root, 'csolver.js')

  const ctx = makeContext()
  loadScriptIntoContext(mathevalPath, ctx)
  loadScriptIntoContext(csolverPath, ctx)

  assert.equal(typeof ctx.solvem, 'function', 'csolver.js should define solvem')

  const res = runAllSolverQuals(ctx)
  if (res.failed > 0) process.exitCode = 1
}

main()
