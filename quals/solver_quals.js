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

function approxEqual(a, b, tol = 1e-3) {
  return Math.abs(a - b) <= tol
}

function runSolvemQuals(solvemImpl, label) {
  const cases = [
    {
      name: 'simple equation',
      eqns: [['x', 5]],
      vars: { x: 1 },
      expected: { x: 5 },
    },
    {
      name: 'derived value',
      eqns: [['x', 2], ['y', '3x']],
      vars: { x: 1, y: 1 },
      expected: { x: 2, y: 6 },
    },
    {
      name: 'simultaneous equations',
      eqns: [['2x+3y', 33], ['5x-4y', 2]],
      vars: { x: 6, y: 0 },
      expected: { x: 6, y: 7 },
    },
    {
      name: 'Pythagorean chain',
      eqns: [['x', 1], ['a', '3x'], ['b', '4x'], ['v1', 'a^2+b^2', 'c^2']],
      vars: { x: 1, a: 1, b: 1, c: 1, v1: 1 },
      expected: { x: 1, a: 3, b: 4, c: 5, v1: 25 },
    },
    {
      name: 'pyzza: A=30',
      eqns: [['a', 30], ['a', '3x'], ['b', '4x'], ['v1', 'a^2+b^2', 'c^2']],
      vars: { x: 1, a: 30, b: 1, c: 1, v1: 1 },
      expected: { x: 10, a: 30, b: 40, c: 50, v1: 2500 },
    },
    {
      name: 'pyzza: B=40',
      eqns: [['b', 40], ['a', '3x'], ['b', '4x'], ['v1', 'a^2+b^2', 'c^2']],
      vars: { x: 1, a: 1, b: 40, c: 1, v1: 1 },
      expected: { x: 10, a: 30, b: 40, c: 50, v1: 2500 },
    },
    {
      name: 'pyzza: C=50',
      eqns: [['c', 50], ['a', '3x'], ['b', '4x'], ['v1', 'a^2+b^2', 'c^2']],
      vars: { x: 1, a: 1, b: 1, c: 50, v1: 1 },
      expected: { x: 10, a: 30, b: 40, c: 50, v1: 2500 },
    },
    {
      name: 'chain propagation',
      eqns: [['a', 2], ['b', 'a+1'], ['c', 'b+1']],
      vars: { a: 1, b: 1, c: 1 },
      expected: { a: 2, b: 3, c: 4 },
    },
    {
      name: 'scaling factor',
      eqns: [['x', 2], ['scaled', '10x']],
      vars: { x: 1, scaled: 1 },
      expected: { x: 2, scaled: 20 },
    },
    {
      name: 'crepes eggs implies x',
      eqns: [['eggs', 24, '12x'], ['milk', '5.333x'], ['flour', '3x']],
      vars: { x: 1, eggs: 12, milk: 5.333, flour: 3 },
      expected: { x: 2, eggs: 24, milk: 10.666, flour: 6 },
    },
    {
      name: 'chain derivation from area to diameter',
      eqns: [
        ['A', 63.585],
        ['r', 'd/2'],
        ['_v', 'A', '1/2*6.28*r^2'],
      ],
      vars: { A: 63.585, r: 1, d: 1, _v: 1 },
      expected: { A: 63.585, r: 4.5, d: 9 },
    },
    {
      name: 'cheesepan r1 derivation',
      eqns: [
        ['d1', 9], ['r1', 'd1/2'], ['tau', 6.28], ['x', 1],
        ['r', 'd/2'],
        ['_v', 'A', '1/2*tau*r^2', '1/2*tau*r1^2*x'],
      ],
      vars: { d1: 9, r1: 1, tau: 6.28, x: 1, r: 1, d: 1, A: 1, _v: 1 },
      expected: { d1: 9, r1: 4.5, tau: 6.28, x: 1, r: 4.5, d: 9, A: 63.585 },
    },
    {
      name: 'cheesepan r1 with x frozen at 1',
      eqns: [
        ['d1', 9], ['r1', 'd1/2'], ['tau', 6.28], ['x', 1],
        ['r', 'd/2'],
        ['_v', 'A', '1/2*tau*r^2', '1/2*tau*r1^2*x'],
      ],
      vars: { d1: 9, r1: 1, tau: 6.28, x: 1, r: 1, d: 1, A: 1, _v: 1 },
      expected: { d1: 9, r1: 4.5, tau: 6.28, x: 1, r: 4.5, d: 9, A: 63.585 },
    },
    {
      name: 'r=d/2 derives r from d',
      eqns: [['d', 10], ['r', 'd/2']],
      vars: { d: 10, r: 1 },
      expected: { d: 10, r: 5 },
    },
    {
      name: 'd=2r derives d from r',
      eqns: [['r', 5], ['d', '2*r']],
      vars: { d: 1, r: 5 },
      expected: { d: 10, r: 5 },
    },
    {
      name: 'both r=d/2 and d=2r with d frozen',
      eqns: [['d', 10], ['r', 'd/2'], ['_v', 'd', '2*r']],
      vars: { d: 10, r: 1, _v: 1 },
      expected: { d: 10, r: 5 },
    },
    {
      name: 'both r=d/2 and d=2r with r frozen',
      eqns: [['r', 5], ['d', '2*r'], ['_v', 'd/2', 'r']],
      vars: { d: 1, r: 5, _v: 1 },
      expected: { d: 10, r: 5 },
    },
    {
      name: 'Mixed Nulls & Propagation (subset)',
      eqns: [
        ['var01', 'x'],
        ['var02', 'y'],
        ['var03', 33, '2*x + 3*y'],
        ['var04', 'x'],
        ['var05', 'y'],
        ['var06', 2, '5*x - 4*y'],
      ],
      vars: { var01: 6, var02: null, var03: 33, var04: null, var05: null, var06: 2, x: null, y: null },
      expected: { var01: 6, var02: 7, x: 6, y: 7 },
    },
    {
      name: 'Impossible Conflict (Pinned) (subset)',
      eqns: [['sum', 'x+y'], ['sum', 10], ['sum', 20]],
      vars: { x: 0, y: 0, sum: 0 },
      expected: { sum: 10 },
    },
    {
      name: 'bounds clamp negative seed',
      eqns: [['x']],
      vars: { x: 100 },
      inf: { x: -10 },
      sup: { x: -1 },
      expected: { x: -1 },
    },
    {
      name: 'bounds pick negative root',
      eqns: [['x^2', 9]],
      vars: { x: 1 },
      inf: { x: -10 },
      sup: { x: -1 },
      expected: { x: -3 },
    },
  ]

  const failures = []

  for (const tc of cases) {
    let res
    try {
      const result = solvemImpl(tc.eqns, tc.vars, tc.inf || {}, tc.sup || {})
      // solvem now returns {ass, zij, sat}, extract ass for backward compatibility
      res = result.ass || result
    } catch (e) {
      failures.push(`${tc.name}: threw ${e && e.message ? e.message : String(e)}`)
      continue
    }

    for (const [k, v] of Object.entries(tc.expected)) {
      const actual = res[k]
      if (!Number.isFinite(actual) || !approxEqual(actual, v, 1e-2)) {
        failures.push(`${tc.name}: ${k} expected ${v}, got ${actual}`)
      }
    }
  }

  if (failures.length) {
    const msg = `${label}: ${failures.length} failures\n- ${failures.join('\n- ')}`
    return { ok: false, message: msg }
  }

  return { ok: true, message: `${label}: all solvem quals passed` }
}

function runAllSolverQuals(ctx) {
  const results = { passed: 0, failed: 0, errors: [] }

  function check(name, actual, expected, tolerance = 0.001) {
    let passed = false
    if (typeof expected === 'object' && expected !== null) {
      const keys = Object.keys(expected)
      passed = keys.every(k => {
        if (actual[k] === undefined) return false
        if (typeof actual[k] === 'number' && typeof expected[k] === 'number') {
          return Math.abs(actual[k] - expected[k]) < tolerance
        }
        return actual[k] === expected[k]
      })
      if (passed) {
        console.log(`✓ ${name}`)
        results.passed++
      } else {
        console.log(`✗ ${name}`)
        console.log('  Expected:', expected)
        console.log('  Got:', actual)
        results.failed++
        results.errors.push(name)
      }
    } else {
      if (typeof actual === 'number' && typeof expected === 'number') {
        passed = Math.abs(actual - expected) < tolerance
      } else {
        passed = actual === expected
      }
      if (passed) {
        console.log(`✓ ${name}`)
        results.passed++
      } else {
        console.log(`✗ ${name}: expected ${expected}, got ${actual}`)
        results.failed++
        results.errors.push(name)
      }
    }
  }

  const { vareval, varparse, preval, deoctalize, solveFor, unixtime, solvem, eqnsSatisfied } = ctx

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

  check('solvem: README #1 (a=2b assignment)',
    solvem([['a', '2b']], {a: null, b: null}).ass,
    {a: 1, b: 0.5})
  check('solvem: README #1 (sat)',
    solvem([['a', '2b']], {a: null, b: null}).sat,
    true)

  check('solvem: README #2 (assignment)',
    solvem([['a+b', 8], ['a', 3], ['b', 4]], {a: null, b: null}).ass,
    {a: 3, b: 4})
  ;(() => {
    const eqns = [['a+b', 8], ['a', 3], ['b', 4]]
    const rep = solvem(eqns, {a: null, b: null})
    check('solvem: README #2 (sat)', rep.sat, false)
    check('solvem: README #2 (zij[0] nonzero)', rep.zij[0] > 0, true)
    check('solvem: README #2 (zij[1..] zero)', rep.zij.slice(1).every(z => z === 0), true)
  })()
  check('solvem: simple equation',
    solvem([['x', 5]], {x: 1}).ass,
    {x: 5})

  // Singleton equations are filtered out (not actual constraints)
  // solvem returns sat: true since no real constraints remain
  check('solvem: singleton filtered out (sat)',
    solvem([['x']], {x: 100}).sat,
    true)
  check('solvem: singleton filtered out (preserves seed)',
    solvem([['x']], {x: 100}).ass,
    {x: 100})

  check('solvem: bounds pick negative root',
    solvem([['x^2', 9]], {x: 1}, {x: -10}, {x: -1}).ass,
    {x: -3})

  check('solvem: bounds unsatisfied',
    solvem([['x', 5]], {x: 1}, {x: 0}, {x: 4}).sat,
    false)

  check('solvem: derived value',
    solvem([['x', 2], ['y', '3x']], {x: 1, y: 1}).ass,
    {x: 2, y: 6})

  ;(() => {
    const eqns = [['x', 'a'], ['y', 'a*2']]
    const rep = solvem(eqns, {x: 1, y: 1, a: 1})
    check('solvem: underdetermined a drives x/y (sat)', rep.sat, true)
    check('solvem: underdetermined a drives x/y (assignment)', rep.ass, {a: 1, x: 1, y: 2})
  })()

  check('solvem: simultaneous equations',
    solvem([['2x+3y', 33], ['5x-4y', 2]], {x: 6, y: 0}).ass,
    {x: 6, y: 7})

  check('solvem: README #3 (sat)',
    solvem([['2x+3y', 33], ['5x-4y', 2]], {x: 6, y: 0}).sat,
    true)

  check('solvem: Pythagorean triple propagation',
    solvem([['x', 1], ['a', '3x'], ['b', '4x'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 1, b: 1, c: 1, v1: 1}).ass,
    {x: 1, a: 3, b: 4, c: 5, v1: 25})

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
    check('solvem: sqrt(2) system #1 (sat)', rep.sat, true)
    check('solvem: sqrt(2) system #1 (C,c)', {C: rep.ass.C, c: rep.ass.c}, {C: Math.SQRT2, c: Math.SQRT2}, 1e-9)
  })()

  ;(() => {
    const eqns = [
      ['x', 1],
      ['A', 'a*x'],
      ['B', 'b*x'],
      ['C', 'c*x'],
      ['A^2 + B^2', 'C^2'],
    ]
    const rep = solvem(eqns, {x: 1, A: null, B: null, C: null, a: null, b: null, c: null})
    check('solvem: sqrt(2) system #2 (sat)', rep.sat, true)
    check('solvem: sqrt(2) system #2 (C,c)', {C: rep.ass.C, c: rep.ass.c}, {C: Math.SQRT2, c: Math.SQRT2}, 1e-9)
  })()

  check('solvem: README #4 (sat)',
    solvem([['x', 1], ['a', '3x'], ['b', '4x'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 1, b: 1, c: 1, v1: 1}).sat,
    true)

  check('solvem: pyzza change a to 30',
    solvem([['a', 30], ['a', '3x'], ['b', '4x'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 30, b: 1, c: 1, v1: 1}).ass,
    {x: 10, a: 30, b: 40, c: 50, v1: 2500})

  check('solvem: pyzza change b to 40',
    solvem([['b', 40], ['a', '3x'], ['b', '4x'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 1, b: 40, c: 1, v1: 1}).ass,
    {x: 10, a: 30, b: 40, c: 50, v1: 2500})

  check('solvem: pyzza change c to 50',
    solvem([['c', 50], ['a', '3x'], ['b', '4x'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 1, b: 1, c: 50, v1: 1}).ass,
    {x: 10, a: 30, b: 40, c: 50, v1: 2500})

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
    check('solvem: Pyzza UI-style c=50 (sat)', rep.sat, true)
    check('solvem: Pyzza UI-style c=50 (assignment)', rep.ass, {x: 10, a: 30, b: 40, c: 50}, 0.05)
  })()

  ;(() => {
    const eqns = [
      ['x', 2.5],
      ['a', '3x'],
      ['b', '4x'],
      ['_v', 'a^2+b^2', 'c^2'],
    ]
    const rep = solvem(eqns, {x: 2.5, a: 1, b: 1, c: 1, _v: 1})
    check('solvem: pyzza x=2.5 (sat)', rep.sat, true)
    check('solvem: pyzza x=2.5 (assignment)', rep.ass, {x: 2.5, a: 7.5, b: 10, c: 12.5, _v: 156.25}, 0.001)
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
    check('solvem: pyzza v1=625 (sat)', rep.sat, true)
    check('solvem: pyzza v1=625 (assignment)', rep.ass, {x: 5, a: 15, b: 20, c: 25, v1: 625}, 0.01)
  })()

  check('solvem: chain propagation',
    solvem([['a', 2], ['b', 'a+1'], ['c', 'b+1']], {a: 1, b: 1, c: 1}).ass,
    {a: 2, b: 3, c: 4})

  check('solvem: scaling factor',
    solvem([['x', 2], ['scaled', '10x']], {x: 1, scaled: 1}).ass,
    {x: 2, scaled: 20})

  check('solvem: crepes eggs implies x',
    solvem([
      ['eggs', 24, '12x'],
      ['milk', '5.333x'],
      ['flour', '3x'],
    ], {x: 1, eggs: 12, milk: 5.333, flour: 3}).ass,
    {x: 2, eggs: 24, milk: 10.666, flour: 6})

  check('solvem: frozen x makes eggs unsatisfiable',
    eqnsSatisfied(
      [['x', 1], ['eggs', '12x', 24]],
      solvem([['x', 1], ['eggs', '12x', 24]], {x: 1, eggs: 12}).ass
    ),
    false)

  check('solvem: chain derivation from area to diameter',
    solvem([
      ['A', 63.585],
      ['r', 'd/2'],
      ['_v', 'A', '1/2*6.28*r^2'],
    ], {A: 63.585, r: 1, d: 1, _v: 1}).ass,
    {A: 63.585, r: 4.5, d: 9})

  check('solvem: cheesepan r1 derivation',
    solvem([
      ['d1', 9], ['r1', 'd1/2'], ['tau', 6.28], ['x', 1],
      ['r', 'd/2'],
      ['_v', 'A', '1/2*tau*r^2', '1/2*tau*r1^2*x'],
    ], {d1: 9, r1: 1, tau: 6.28, x: 1, r: 1, d: 1, A: 1, _v: 1}).ass,
    {d1: 9, r1: 4.5, tau: 6.28, x: 1, r: 4.5, d: 9, A: 63.585, _v: 63.585})

  check('solvem: cheesepan r1 with x frozen at 1',
    solvem([
      ['d1', 9], ['r1', 'd1/2'], ['tau', 6.28], ['x', 1],
      ['r', 'd/2'],
      ['_v', 'A', '1/2*tau*r^2', '1/2*tau*r1^2*x'],
    ], {d1: 9, r1: 1, tau: 6.28, x: 1, r: 1, d: 1, A: 1, _v: 1}).ass,
    {d1: 9, r1: 4.5, tau: 6.28, x: 1, r: 4.5, d: 9, A: 63.585, _v: 63.585})

  check('solvem: r=d/2 derives r from d',
    solvem([['d', 10], ['r', 'd/2']], {d: 10, r: 1}).ass,
    {d: 10, r: 5})

  check('solvem: d=2r derives d from r',
    solvem([['r', 5], ['d', '2*r']], {d: 1, r: 5}).ass,
    {d: 10, r: 5})

  check('solvem: prefers explicit initial guess',
    solvem([['a+b', 8]], {a: 4, b: null}).ass,
    {a: 4, b: 4})

  check('solvem: missing initial vars throws',
    (() => {
      try {
        solvem([['a+b+c', 8]], {a: 4, b: null})
        return false
      } catch (e) {
        return true
      }
    })(),
    true)

  check('solvem: both r=d/2 and d=2r with d frozen',
    solvem([['d', 10], ['r', 'd/2'], ['_v', 'd', '2*r']], {d: 10, r: 1, _v: 1}).ass,
    {d: 10, r: 5})

  check('solvem: both r=d/2 and d=2r with r frozen',
    solvem([['r', 5], ['d', '2*r'], ['_v', 'd/2', 'r']], {d: 1, r: 5, _v: 1}).ass,
    {d: 10, r: 5})

  check('solvem: post anti-colon refactor',
    solvem([ ['var01', 'x'],
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
         y: null }).ass,
    { var01: 6,
      var02: 7,
      var03: 33,
      var04: 6,
      var05: 7,
      var06: 2,
      x: 6,
      y: 7 })

  check('solvem: Mixed Nulls & Propagation',
    solvem([ ['var01', 'x'],
             ['var02', 'y'],
             ['var03', 33, '2*x + 3*y'],
             ['var04', 'x'],
             ['var05', 'y'],
             ['var06', 2, '5*x - 4*y'] ],
      {var01: 6, var02: null, var03: 33, var04: null, var05: null, var06: 2, x: null, y: null}).ass,
    {var01: 6, var02: 7, x: 6, y: 7})

  check('solvem: Pythagorean Chain',
    solvem([['x', 1], ['a', '3x'], ['b', '4x'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 1, b: 1, c: 1, v1: 1}).ass,
    {x: 1, a: 3, b: 4, c: 5, v1: 25})

  check('solvem: Pyzza: A=30',
    solvem([['a', 30], ['a', '3x'], ['b', '4x'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 30, b: 1, c: 1, v1: 1}).ass,
    {x: 10, a: 30, b: 40, c: 50, v1: 2500})

  check('solvem: Pyzza: B=40',
    solvem([['b', 40], ['a', '3x'], ['b', '4x'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 1, b: 40, c: 1, v1: 1}).ass,
    {x: 10, a: 30, b: 40, c: 50, v1: 2500})

  check('solvem: Pyzza: C=50',
    solvem([['c', 50], ['a', '3x'], ['b', '4x'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 1, b: 1, c: 50, v1: 1}).ass,
    {x: 10, a: 30, b: 40, c: 50, v1: 2500})

  check('solvem: Impossible Conflict (Pinned)',
    solvem([['sum', 'x+y'], ['sum', 10], ['sum', 20]], {x: 0, y: 0, sum: 0}).ass,
    {sum: 10})

  // KNOWN FAILURE: This non-linear system has constraints w*h=A and w²+h²=z²
  // which together uniquely determine w=h≈7.97. Our current solver can't handle
  // this because it solves one equation at a time. Needs Newton solver.
  const cheesepanMathematica = solvem([
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
  }).ass

  check('solvem: cheesepan Mathematica system',
    cheesepanMathematica,
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
    0.05)

  check('solvem: cheesepan Mathematica positivity',
    cheesepanMathematica.z > 0 && cheesepanMathematica.r > 0 &&
      cheesepanMathematica.w > 0 && cheesepanMathematica.h > 0,
    true)

  ;(() => {
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

    const rep = solvem(eqns, {
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

    check('solvem: cheesepan x=10 (sat)', rep.sat, true)
    check('solvem: cheesepan x=10 scales A', rep.ass, {x: 10, A: 635.85}, 0.05)
  })()

  ;(() => {
    // Date/value parameters are frozen, unixtime derives tini/tfin, then r is computed
    const eqns = [
      ['SID', 86400],
      ['y0', 2025], ['m0', 12], ['d0', 25],  // Freeze start date
      ['y', 2025], ['m', 12], ['d', 26],     // Freeze end date
      ['vini', 0], ['vfin', 100100],          // Freeze values
      ['tini', 'unixtime(y0, m0, d0)'],
      ['tfin', 'unixtime(y, m, d)'],
      ['r', '(vfin-vini)/(tfin-tini)'],
    ]

    const rep = solvem(eqns, {
      SID: 86400,
      y0: 2025, m0: 12, d0: 25,
      y: 2025, m: 12, d: 26,
      vini: 0, vfin: 100100,
      tini: 1, tfin: 1, r: 1,
    })

    check('solvem: dial-style unixtime-derived r (sat)', rep.sat, true)
    check('solvem: dial-style unixtime-derived r', rep.ass.r, 100100 / 86400, 1e-6)
    check('solvem: dial-style unixtime-derived r ~= 1.15856', rep.ass.r, 1.15856, 1e-5)

    const eqns2 = [
      ['SID', 86400],
      ['y0', 2025], ['m0', 12], ['d0', 25],
      ['y', 2026], ['m', 12], ['d', 25],
      ['vini', 73], ['vfin', 70],
      ['tini', 'unixtime(y0, m0, d0)'],
      ['tfin', 'unixtime(y, m, d)'],
      ['r', '(vfin-vini)/(tfin-tini)'],
    ]

    const repTiny = solvem(eqns2, {
      SID: 86400,
      y0: 2025, m0: 12, d0: 25,
      y: 2026, m: 12, d: 25,
      vini: 73, vfin: 70,
      tini: 1, tfin: 1, r: 1,
    })

    const expectedTiny = (70 - 73) / (unixtime(2026, 12, 25) - unixtime(2025, 12, 25))
    check('solvem: dial-style tiny r (sat)', repTiny.sat, true)
    check('solvem: dial-style tiny r', repTiny.ass.r, expectedTiny, 1e-9)
  })()

  ;(() => {
    const eqns = [
      ['milk', 5, '5.333x'],
      ['eggs', '12x'],
    ]

    const rep = solvem(eqns, {
      milk: 5.333,
      eggs: null,
      x: 1,
    })

    check('solvem: crepes milk=5 implies eggs (sat)', rep.sat, true)
    check('solvem: crepes milk=5 implies eggs', rep.ass.eggs, 11.250703168948059, 1e-12)
  })()

  ;(() => {
    const eqns = [
      ['376x', 752],
      ['200x', 400],
      ['2x', 4],
    ]

    const rep = solvem(eqns, { x: 1 })
    check('solvem: cookies x=2 via grams (sat)', rep.sat, true)
    check('solvem: cookies x=2 via grams', rep.ass.x, 2, 1e-9)
  })()

  ;(() => {
    const eqns = [
      ['2x', 4],
      ['1x', 2],
      ['1/2*x', 1],
      ['3/4*x', 1.5],
    ]

    const rep = solvem(eqns, { x: 1 })
    check('solvem: shortcake x=2 via flour (sat)', rep.sat, true)
    check('solvem: shortcake x=2 via flour', rep.ass.x, 2, 1e-9)
  })()

  ;(() => {
    const eqns = [
      ['x', 6],
      ['2x+3y', 33],
      ['5x-4y', 2],
    ]

    const rep = solvem(eqns, { x: 6, y: 1 })
    check('solvem: simeq x=6 implies y=7 (sat)', rep.sat, true)
    check('solvem: simeq x=6 implies y=7', rep.ass.y, 7, 1e-9)
  })()

  ;(() => {
    const eqns = [
      ['1x', 2],
      ['2x', 4],
      ['0.5x', 1],
      ['8x', 16],
    ]

    const rep = solvem(eqns, { x: 1 })
    check('solvem: pancakes x=2 via flour (sat)', rep.sat, true)
    check('solvem: pancakes x=2 via flour', rep.ass.x, 2, 1e-9)
  })()

  ;(() => {
    const eqns = [
      ['x/2', 0.5],
    ]
    const ass = solvem(eqns, { x: 16 }).ass
    check('solvem: x/2=0.5 from x=16 (sat)', eqnsSatisfied(eqns, ass), true)
    check('solvem: x/2=0.5 implies x=1', ass.x, 1, 1e-9)
  })()

  ;(() => {
    const eqns = [
      ['d', 66],
      ['w', 5.45],
      ['u', 'd/w'],
    ]
    const ass = solvem(eqns, { d: 66, w: 5.45, u: 10.56 }).ass
    check('solvem: u=d/w (sat)', eqnsSatisfied(eqns, ass), true)
    check('solvem: u tracks d/w', ass.u, 66 / 5.45, 1e-9)
  })()

  ;(() => {
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

    const rep = solvem(eqns, {
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

    check('solvem: breakaway pinned inputs (sat)', rep.sat, true)
    check('solvem: breakaway vp=42', rep.ass.vp, 42, 1e-6)
    check('solvem: breakaway gt=0.025', rep.ass.gt, 0.025, 1e-6)
    check('solvem: breakaway gd=1', rep.ass.gd, 1, 1e-6)
  })()

  ;(() => {
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

    const rep = solvem(eqns, {
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

    check('solvem: dial rate change updates end date (sat)', rep.sat, true)
    check('solvem: dial rate change end year', rep.ass.y, 2027, 0.01)
    check('solvem: dial rate change end month', rep.ass.m, 1, 0.01)
    check('solvem: dial rate change end day', rep.ass.d, 4, 0.01)
  })()

  ;(() => {
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

    const rep = solvem(eqns, {
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

    check('solvem: dial bug1b tini frozen (sat)', rep.sat, true)
    check('solvem: dial bug1b end year', rep.ass.y, 2025, 0.01)
    check('solvem: dial bug1b end month', rep.ass.m, 12, 0.01)
    check('solvem: dial bug1b end day', rep.ass.d, 28, 0.01)
  })()

  ;(() => {
    const k = 0.621371
    const eqns = [
      ['k', k],
      ['k*d', 12.4274],
    ]

    const rep = solvem(eqns, {
      k: k,
      d: 20,
    })

    check('solvem: breakaway k*d typing (sat)', rep.sat, true)
    check('solvem: breakaway k*d = 12.4274', rep.ass.k * rep.ass.d, 12.4274, 1e-9)
  })()

  // Singletons like {b+0} should be filtered out before calling solvem
  ;(() => {
    const eqns = [
      ['a', 5],
      ['a + b', 10],
    ]
    const rep = solvem(eqns, { a: 5, b: 1 })
    check('solvem: b derived from a+b=10, a=5 (sat)', rep.sat, true)
    check('solvem: b derived from a+b=10, a=5 (b=5)', rep.ass.b, 5, 1e-9)
  })()

  // Singletons like {b} should be filtered out before calling solvem
  // (same test as above, singleton removed)

  // Quadratic equation solving:
  // {a=3}x^2+{b=4}x+{c=-20}=0 with a*x^2+b*x+c=0 should solve for x=2
  ;(() => {
    const eqns = [
      ['a', 3],
      ['b', 4],
      ['c', -20],
      ['a*x^2+b*x+c', 0],
    ]
    const rep = solvem(eqns, { a: 3, b: 4, c: -20, x: 1 })
    check('solvem: quadratic equation (sat)', rep.sat, true)
    check('solvem: quadratic equation (x=2)', rep.ass.x, 2, 1e-6)
  })()

  // Golden ratio
  // {1/phi = phi - 1} should solve to phi ≈ 1.618
  ;(() => {
    const phi = (1 + Math.sqrt(5)) / 2
    const eqns = [
      ['1/phi', 'phi - 1'],
    ]
    const rep = solvem(eqns, { phi: 1 })
    check('solvem: golden ratio (sat)', rep.sat, true)
    check('solvem: golden ratio (phi)', rep.ass.phi, phi, 1e-6)
  })()

  // ==========================================================================
  // Gaussian elimination solver quals
  // ==========================================================================

  // Pure linear system: 2x + 3y = 13, x - y = 1 => x=4, y=3 (wait, let me check)
  // Actually: 2(2) + 3(3) = 4 + 9 = 13, 2 - 3 = -1. Let's use x=4, y=5/3... hmm
  // Let me pick: x + y = 7, x - y = 3 => x=5, y=2
  ;(() => {
    const eqns = [
      ['x + y', 7],
      ['x - y', 3],
    ]
    const rep = solvem(eqns, { x: 0, y: 0 })
    check('solvem: linear 2x2 system (sat)', rep.sat, true)
    check('solvem: linear 2x2 x=5', rep.ass.x, 5, 1e-9)
    check('solvem: linear 2x2 y=2', rep.ass.y, 2, 1e-9)
  })()

  // Linear system from README: 2x+3y=33, 5x-4y=2 => x=6, y=7
  ;(() => {
    const eqns = [
      ['2x+3y', 33],
      ['5x-4y', 2],
    ]
    const rep = solvem(eqns, { x: 0, y: 0 })
    check('solvem: linear README example (sat)', rep.sat, true)
    check('solvem: linear README x=6', rep.ass.x, 6, 1e-9)
    check('solvem: linear README y=7', rep.ass.y, 7, 1e-9)
  })()

  // Overdetermined but consistent linear system
  ;(() => {
    const eqns = [
      ['x', 5],
      ['y', 3],
      ['x + y', 8],
    ]
    const rep = solvem(eqns, { x: 0, y: 0 })
    check('solvem: overdetermined linear (sat)', rep.sat, true)
    check('solvem: overdetermined x=5', rep.ass.x, 5, 1e-9)
    check('solvem: overdetermined y=3', rep.ass.y, 3, 1e-9)
  })()

  // simeq reciplate: simultaneous equations (singletons filtered out before solvem)
  ;(() => {
    const eqns = [
      ['2x + 3y', 33], // constraint: 2x + 3y = 33
      ['5x - 4y', 2],  // constraint: 5x - 4y = 2
    ]
    const rep = solvem(eqns, { x: 1, y: 1 })
    check('solvem: simeq reciplate (sat)', rep.sat, true)
    check('solvem: simeq reciplate x=6', rep.ass.x, 6, 1e-9)
    check('solvem: simeq reciplate y=7', rep.ass.y, 7, 1e-9)
  })()

  // ==========================================================================
  // Additional linear system quals (3x3, 4x4, fractional coefficients)
  // ==========================================================================

  // 3x3 linear system: x + y + z = 6, 2x + y - z = 1, x - y + 2z = 5
  // Solution: x=1, y=2, z=3
  ;(() => {
    const eqns = [
      ['x + y + z', 6],
      ['2x + y - z', 1],
      ['x - y + 2z', 5],
    ]
    const rep = solvem(eqns, { x: 0, y: 0, z: 0 })
    check('solvem: 3x3 linear (sat)', rep.sat, true)
    check('solvem: 3x3 linear x=1', rep.ass.x, 1, 1e-9)
    check('solvem: 3x3 linear y=2', rep.ass.y, 2, 1e-9)
    check('solvem: 3x3 linear z=3', rep.ass.z, 3, 1e-9)
  })()

  // 3x3 with fractional solution: x + y = 5, y + z = 7, x + z = 6
  // Solution: x=2, y=3, z=4
  ;(() => {
    const eqns = [
      ['x + y', 5],
      ['y + z', 7],
      ['x + z', 6],
    ]
    const rep = solvem(eqns, { x: 0, y: 0, z: 0 })
    check('solvem: 3x3 symmetric (sat)', rep.sat, true)
    check('solvem: 3x3 symmetric x=2', rep.ass.x, 2, 1e-9)
    check('solvem: 3x3 symmetric y=3', rep.ass.y, 3, 1e-9)
    check('solvem: 3x3 symmetric z=4', rep.ass.z, 4, 1e-9)
  })()

  // 4x4 linear system
  // a + b + c + d = 10, a - b = 2, b - c = 1, c - d = 0
  // Solution: a=4, b=2, c=1, d=1 (wait, let me check: 4+2+1+1=8, not 10)
  // Let's use: a + b + c + d = 10, a = 4, b = 3, c = 2, d = 1
  ;(() => {
    const eqns = [
      ['a + b + c + d', 10],
      ['a', 4],
      ['b', 3],
      ['c', 2],
    ]
    const rep = solvem(eqns, { a: 0, b: 0, c: 0, d: 0 })
    check('solvem: 4x4 linear (sat)', rep.sat, true)
    check('solvem: 4x4 linear a=4', rep.ass.a, 4, 1e-9)
    check('solvem: 4x4 linear b=3', rep.ass.b, 3, 1e-9)
    check('solvem: 4x4 linear c=2', rep.ass.c, 2, 1e-9)
    check('solvem: 4x4 linear d=1', rep.ass.d, 1, 1e-9)
  })()

  // Linear system with fractional coefficients
  // 0.5x + 0.25y = 1.5, x - y = 2 => x=8/3, y=2/3
  ;(() => {
    const eqns = [
      ['0.5*x + 0.25*y', 1.5],
      ['x - y', 2],
    ]
    const rep = solvem(eqns, { x: 0, y: 0 })
    check('solvem: fractional coeffs (sat)', rep.sat, true)
    check('solvem: fractional coeffs x=8/3', rep.ass.x, 8/3, 1e-9)
    check('solvem: fractional coeffs y=2/3', rep.ass.y, 2/3, 1e-9)
  })()

  // Linear system with negative coefficients
  // -x + 2y = 5, 3x - y = 1 => x=1.4, y=3.2
  ;(() => {
    const eqns = [
      ['-x + 2y', 5],
      ['3x - y', 1],
    ]
    const rep = solvem(eqns, { x: 0, y: 0 })
    check('solvem: negative coeffs (sat)', rep.sat, true)
    check('solvem: negative coeffs x=1.4', rep.ass.x, 1.4, 1e-9)
    check('solvem: negative coeffs y=3.2', rep.ass.y, 3.2, 1e-9)
  })()

  // Linear system with zero in solution
  // x + y = 3, x - y = 3 => x=3, y=0
  ;(() => {
    const eqns = [
      ['x + y', 3],
      ['x - y', 3],
    ]
    const rep = solvem(eqns, { x: 1, y: 1 })
    check('solvem: zero solution (sat)', rep.sat, true)
    check('solvem: zero solution x=3', rep.ass.x, 3, 1e-9)
    check('solvem: zero solution y=0', rep.ass.y, 0, 1e-9)
  })()

  // Linear system with all negative solution
  // x + y = -5, x - y = -1 => x=-3, y=-2
  ;(() => {
    const eqns = [
      ['x + y', -5],
      ['x - y', -1],
    ]
    const rep = solvem(eqns, { x: 0, y: 0 })
    check('solvem: negative solution (sat)', rep.sat, true)
    check('solvem: negative solution x=-3', rep.ass.x, -3, 1e-9)
    check('solvem: negative solution y=-2', rep.ass.y, -2, 1e-9)
  })()

  // ==========================================================================
  // simeq variations (different orderings, mixed systems)
  // ==========================================================================

  // simeq with constraints first (display-only singletons filtered out)
  ;(() => {
    const eqns = [
      ['2x + 3y', 33],
      ['5x - 4y', 2],
    ]
    const rep = solvem(eqns, { x: 1, y: 1 })
    check('solvem: simeq constraints-first (sat)', rep.sat, true)
    check('solvem: simeq constraints-first x=6', rep.ass.x, 6, 1e-9)
    check('solvem: simeq constraints-first y=7', rep.ass.y, 7, 1e-9)
  })()

  // simeq (singletons filtered out, constraints only)
  ;(() => {
    const eqns = [
      ['2x + 3y', 33],
      ['5x - 4y', 2],
    ]
    const rep = solvem(eqns, { x: 1, y: 1 })
    check('solvem: simeq interleaved (sat)', rep.sat, true)
    check('solvem: simeq interleaved x=6', rep.ass.x, 6, 1e-9)
    check('solvem: simeq interleaved y=7', rep.ass.y, 7, 1e-9)
  })()

  // simeq (singletons including computed display filtered out)
  ;(() => {
    const eqns = [
      ['2x + 3y', 33],
      ['5x - 4y', 2],
    ]
    const rep = solvem(eqns, { x: 1, y: 1 })
    check('solvem: simeq with computed display (sat)', rep.sat, true)
    check('solvem: simeq computed display x=6', rep.ass.x, 6, 1e-9)
    check('solvem: simeq computed display y=7', rep.ass.y, 7, 1e-9)
  })()

  // 3x3 simeq style (singletons filtered out)
  // x + y + z = 6, x - y = 1, y - z = -1 => x=7/3, y=4/3, z=7/3
  ;(() => {
    const eqns = [
      ['x + y + z', 6],
      ['x - y', 1],
      ['y - z', -1],
    ]
    const rep = solvem(eqns, { x: 1, y: 1, z: 1 })
    check('solvem: 3x3 simeq style (sat)', rep.sat, true)
    check('solvem: 3x3 simeq x=7/3', rep.ass.x, 7/3, 1e-9)
    check('solvem: 3x3 simeq y=4/3', rep.ass.y, 4/3, 1e-9)
    check('solvem: 3x3 simeq z=7/3', rep.ass.z, 7/3, 1e-9)
  })()

  // ==========================================================================
  // Numerical precision edge cases
  // ==========================================================================

  // Very small numbers
  ;(() => {
    const eqns = [
      ['x', 1e-9],
      ['y', '1000*x'],
    ]
    const rep = solvem(eqns, { x: 0, y: 0 })
    check('solvem: very small x=1e-9 (sat)', rep.sat, true)
    check('solvem: very small x', rep.ass.x, 1e-9, 1e-15)
    check('solvem: very small y=1e-6', rep.ass.y, 1e-6, 1e-12)
  })()

  // Very large numbers
  ;(() => {
    const eqns = [
      ['x', 1e9],
      ['y', 'x/1000'],
    ]
    const rep = solvem(eqns, { x: 1, y: 1 })
    check('solvem: very large x=1e9 (sat)', rep.sat, true)
    check('solvem: very large x', rep.ass.x, 1e9, 1)
    check('solvem: very large y=1e6', rep.ass.y, 1e6, 1)
  })()

  // Mixed large and small
  ;(() => {
    const eqns = [
      ['big', 1000000],
      ['small', 0.000001],
      ['ratio', 'big/small'],
    ]
    const rep = solvem(eqns, { big: 1, small: 1, ratio: 1 })
    check('solvem: mixed scale (sat)', rep.sat, true)
    check('solvem: mixed scale ratio=1e12', rep.ass.ratio, 1e12, 1e6)
  })()

  // Decimal precision
  ;(() => {
    const eqns = [
      ['x', 3.14159265],
      ['y', '2*x'],
    ]
    const rep = solvem(eqns, { x: 1, y: 1 })
    check('solvem: decimal precision (sat)', rep.sat, true)
    check('solvem: decimal x=pi', rep.ass.x, 3.14159265, 1e-9)
    check('solvem: decimal y=2pi', rep.ass.y, 6.2831853, 1e-6)
  })()

  // ==========================================================================
  // Bounds edge cases
  // ==========================================================================

  // Solution exactly at lower bound
  ;(() => {
    const eqns = [['x + 5', 10]]
    const rep = solvem(eqns, { x: 0 }, { x: 5 }, { x: 100 })
    check('solvem: at lower bound (sat)', rep.sat, true)
    check('solvem: at lower bound x=5', rep.ass.x, 5, 1e-9)
  })()

  // Solution exactly at upper bound
  ;(() => {
    const eqns = [['x + 5', 15]]
    const rep = solvem(eqns, { x: 0 }, { x: 0 }, { x: 10 })
    check('solvem: at upper bound (sat)', rep.sat, true)
    check('solvem: at upper bound x=10', rep.ass.x, 10, 1e-9)
  })()

  // Solution outside bounds (unsat)
  ;(() => {
    const eqns = [['x', 100]]
    const rep = solvem(eqns, { x: 0 }, { x: 0 }, { x: 10 })
    check('solvem: outside bounds (unsat)', rep.sat, false)
  })()

  // One-sided lower bound only
  ;(() => {
    const eqns = [['x^2', 25]]
    const rep = solvem(eqns, { x: 1 }, { x: 0 }, {})
    check('solvem: lower bound only (sat)', rep.sat, true)
    check('solvem: lower bound only x=5', rep.ass.x, 5, 1e-9)
  })()

  // One-sided upper bound only
  ;(() => {
    const eqns = [['x^2', 25]]
    const rep = solvem(eqns, { x: -1 }, {}, { x: 0 })
    check('solvem: upper bound only (sat)', rep.sat, true)
    check('solvem: upper bound only x=-5', rep.ass.x, -5, 1e-9)
  })()

  // Tight bounds around solution
  ;(() => {
    const eqns = [['x', 5]]
    const rep = solvem(eqns, { x: 0 }, { x: 4.9 }, { x: 5.1 })
    check('solvem: tight bounds (sat)', rep.sat, true)
    check('solvem: tight bounds x=5', rep.ass.x, 5, 1e-9)
  })()

  // ==========================================================================
  // Nonlinear equation quals
  // ==========================================================================

  // Quadratic with positive root preferred
  ;(() => {
    const eqns = [['x^2', 16]]
    const rep = solvem(eqns, { x: 1 })
    check('solvem: quadratic x^2=16 (sat)', rep.sat, true)
    check('solvem: quadratic x=4', rep.ass.x, 4, 1e-9)
  })()

  // Quadratic with bounds forcing negative root
  ;(() => {
    const eqns = [['x^2', 16]]
    const rep = solvem(eqns, { x: -1 }, { x: -10 }, { x: 0 })
    check('solvem: quadratic negative via bounds (sat)', rep.sat, true)
    check('solvem: quadratic x=-4', rep.ass.x, -4, 1e-9)
  })()

  // Cubic root
  ;(() => {
    const eqns = [['x^3', 27]]
    const rep = solvem(eqns, { x: 1 })
    check('solvem: cubic x^3=27 (sat)', rep.sat, true)
    check('solvem: cubic x=3', rep.ass.x, 3, 1e-9)
  })()

  // Cubic with negative
  ;(() => {
    const eqns = [['x^3', -8]]
    const rep = solvem(eqns, { x: -1 })
    check('solvem: cubic x^3=-8 (sat)', rep.sat, true)
    check('solvem: cubic x=-2', rep.ass.x, -2, 1e-9)
  })()

  // Square root relationship
  ;(() => {
    const eqns = [
      ['y', 'sqrt(x)'],
      ['x', 16],
    ]
    const rep = solvem(eqns, { x: 16, y: 1 })
    check('solvem: sqrt relationship (sat)', rep.sat, true)
    check('solvem: sqrt y=4', rep.ass.y, 4, 1e-9)
  })()

  // Inverse relationship: xy = k
  ;(() => {
    const eqns = [
      ['x*y', 24],
      ['x', 6],
    ]
    const rep = solvem(eqns, { x: 6, y: 1 })
    check('solvem: inverse xy=24 (sat)', rep.sat, true)
    check('solvem: inverse y=4', rep.ass.y, 4, 1e-9)
  })()

  // Quadratic formula scenario: ax^2 + bx + c = 0
  // 2x^2 - 7x + 3 = 0 has roots x=3 and x=0.5
  ;(() => {
    const eqns = [
      ['a', 2],
      ['b', -7],
      ['c', 3],
      ['a*x^2 + b*x + c', 0],
    ]
    const rep = solvem(eqns, { a: 2, b: -7, c: 3, x: 2 })
    check('solvem: quadratic formula (sat)', rep.sat, true)
    // Should find x=3 or x=0.5 - either is valid
    const validRoot = Math.abs(rep.ass.x - 3) < 0.01 || Math.abs(rep.ass.x - 0.5) < 0.01
    check('solvem: quadratic formula valid root', validRoot, true)
  })()

  // e^x = y relationship
  ;(() => {
    const e = Math.E
    const eqns = [
      ['y', `${e}^x`],
      ['x', 2],
    ]
    const rep = solvem(eqns, { x: 2, y: 1 })
    check('solvem: exponential (sat)', rep.sat, true)
    check('solvem: exponential y=e^2', rep.ass.y, e * e, 1e-9)
  })()

  // ==========================================================================
  // Underdetermined and overdetermined system quals
  // ==========================================================================

  // Underdetermined: more variables than constraints (preserves seeds)
  ;(() => {
    const eqns = [
      ['x + y', 10],
    ]
    const rep = solvem(eqns, { x: 3, y: 7 })
    check('solvem: underdetermined (sat)', rep.sat, true)
    check('solvem: underdetermined sum=10', rep.ass.x + rep.ass.y, 10, 1e-9)
  })()

  // Underdetermined with definition: x = 2a, y = 3a, no constraint on a
  ;(() => {
    const eqns = [
      ['x', '2*a'],
      ['y', '3*a'],
    ]
    const rep = solvem(eqns, { a: 5, x: 1, y: 1 })
    check('solvem: underdetermined chain (sat)', rep.sat, true)
    check('solvem: underdetermined x=10', rep.ass.x, 10, 1e-9)
    check('solvem: underdetermined y=15', rep.ass.y, 15, 1e-9)
  })()

  // Overdetermined consistent: all equations agree
  ;(() => {
    const eqns = [
      ['x', 5],
      ['y', 3],
      ['x + y', 8],
      ['x - y', 2],
      ['2*x', 10],
    ]
    const rep = solvem(eqns, { x: 0, y: 0 })
    check('solvem: overdetermined consistent (sat)', rep.sat, true)
    check('solvem: overdetermined x=5', rep.ass.x, 5, 1e-9)
    check('solvem: overdetermined y=3', rep.ass.y, 3, 1e-9)
  })()

  // Overdetermined inconsistent: conflicting constraints
  ;(() => {
    const eqns = [
      ['x', 5],
      ['x', 10],
    ]
    const rep = solvem(eqns, { x: 0 })
    check('solvem: overdetermined inconsistent (unsat)', rep.sat, false)
  })()

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
    const rep = solvem(eqns, { flour: 1, sugar: 1, butter: 1, x: 1 })
    check('solvem: recipe scaling (sat)', rep.sat, true)
    check('solvem: recipe flour=6', rep.ass.flour, 6, 1e-9)
    check('solvem: recipe sugar=3', rep.ass.sugar, 3, 1e-9)
    check('solvem: recipe butter=1.5', rep.ass.butter, 1.5, 1e-9)
  })()

  // Recipe with unit conversion: cups to ml
  ;(() => {
    const mlPerCup = 236.588
    const eqns = [
      ['cups', 2],
      ['ml', `${mlPerCup}*cups`],
    ]
    const rep = solvem(eqns, { cups: 2, ml: 1 })
    check('solvem: cups to ml (sat)', rep.sat, true)
    check('solvem: cups to ml', rep.ass.ml, 2 * mlPerCup, 0.01)
  })()

  // Recipe reverse scaling: given flour, find scale
  ;(() => {
    const eqns = [
      ['flour', '2*x', 6],
      ['sugar', '1*x'],
      ['butter', '0.5*x'],
    ]
    const rep = solvem(eqns, { flour: 6, sugar: 1, butter: 1, x: 1 })
    check('solvem: reverse scaling (sat)', rep.sat, true)
    check('solvem: reverse x=3', rep.ass.x, 3, 1e-9)
    check('solvem: reverse sugar=3', rep.ass.sugar, 3, 1e-9)
  })()

  // Ratio-based recipe: a:b:c = 3:4:5 with total = 24
  ;(() => {
    const eqns = [
      ['a', '3*k'],
      ['b', '4*k'],
      ['c', '5*k'],
      ['a + b + c', 24],
    ]
    const rep = solvem(eqns, { a: 1, b: 1, c: 1, k: 1 })
    check('solvem: ratio recipe (sat)', rep.sat, true)
    check('solvem: ratio a=6', rep.ass.a, 6, 1e-9)
    check('solvem: ratio b=8', rep.ass.b, 8, 1e-9)
    check('solvem: ratio c=10', rep.ass.c, 10, 1e-9)
  })()

  // Pizza dough hydration: water/flour ratio
  ;(() => {
    const eqns = [
      ['flour', 500],
      ['hydration', 0.65],
      ['water', 'flour * hydration'],
    ]
    const rep = solvem(eqns, { flour: 500, hydration: 0.65, water: 1 })
    check('solvem: hydration (sat)', rep.sat, true)
    check('solvem: hydration water=325', rep.ass.water, 325, 1e-9)
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
    const rep = solvem(eqns, { total: 1000, flour: 1, water: 1, yeast: 1, salt: 1 })
    check('solvem: percentages (sat)', rep.sat, true)
    check('solvem: flour=600', rep.ass.flour, 600, 1e-9)
    check('solvem: water=350', rep.ass.water, 350, 1e-9)
    check('solvem: yeast=20', rep.ass.yeast, 20, 1e-9)
    check('solvem: salt=30', rep.ass.salt, 30, 1e-9)
  })()

  // ==========================================================================
  // Additional edge cases
  // ==========================================================================

  // Identity equation (always satisfied)
  ;(() => {
    const eqns = [
      ['x', 'x'],
    ]
    const rep = solvem(eqns, { x: 42 })
    check('solvem: identity (sat)', rep.sat, true)
    check('solvem: identity preserves x', rep.ass.x, 42, 1e-9)
  })()

  // Tautology: a + b = b + a
  ;(() => {
    const eqns = [
      ['a + b', 'b + a'],
      ['a', 3],
      ['b', 7],
    ]
    const rep = solvem(eqns, { a: 3, b: 7 })
    check('solvem: tautology (sat)', rep.sat, true)
  })()

  // Parenthesized expressions
  ;(() => {
    const eqns = [
      ['(x + 1) * (x - 1)', 'x^2 - 1'],
      ['x', 5],
    ]
    const rep = solvem(eqns, { x: 5 })
    check('solvem: parentheses (sat)', rep.sat, true)
  })()

  // Division equation
  ;(() => {
    const eqns = [
      ['x / y', 4],
      ['y', 5],
    ]
    const rep = solvem(eqns, { x: 1, y: 5 })
    check('solvem: division (sat)', rep.sat, true)
    check('solvem: division x=20', rep.ass.x, 20, 1e-9)
  })()

  // Multiple equivalent forms
  ;(() => {
    const eqns = [
      ['2*x', 'x + x'],
      ['x', 7],
    ]
    const rep = solvem(eqns, { x: 7 })
    check('solvem: equivalent forms (sat)', rep.sat, true)
  })()

  // Circular reference that resolves
  ;(() => {
    const eqns = [
      ['x', 'y + 1'],
      ['y', 'x - 1'],
      ['x', 5],
    ]
    const rep = solvem(eqns, { x: 5, y: 1 })
    check('solvem: circular resolves (sat)', rep.sat, true)
    check('solvem: circular x=5', rep.ass.x, 5, 1e-9)
    check('solvem: circular y=4', rep.ass.y, 4, 1e-9)
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
    const rep = solvem(eqns, { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1 })
    check('solvem: long chain (sat)', rep.sat, true)
    check('solvem: chain f=6', rep.ass.f, 6, 1e-9)
  })()

  // Power of 2 chain
  ;(() => {
    const eqns = [
      ['a', 1],
      ['b', '2*a'],
      ['c', '2*b'],
      ['d', '2*c'],
    ]
    const rep = solvem(eqns, { a: 1, b: 1, c: 1, d: 1 })
    check('solvem: power chain (sat)', rep.sat, true)
    check('solvem: power d=8', rep.ass.d, 8, 1e-9)
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
    const rep = solvem(eqns, { a: 2, r: 3, b: 1, c: 1, d: 1 })
    check('solvem: geometric (sat)', rep.sat, true)
    check('solvem: geometric b=6', rep.ass.b, 6, 1e-6)
    check('solvem: geometric c=18', rep.ass.c, 18, 1e-6)
    check('solvem: geometric d=54', rep.ass.d, 54, 1e-6)
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
    const rep = solvem(eqns, { f1: 1, f2: 1, f3: 1, f4: 1, f5: 1 })
    check('solvem: fibonacci (sat)', rep.sat, true)
    check('solvem: fib f3=2', rep.ass.f3, 2, 1e-9)
    check('solvem: fib f4=3', rep.ass.f4, 3, 1e-9)
    check('solvem: fib f5=5', rep.ass.f5, 5, 1e-9)
  })()

  // Area/perimeter problem
  ;(() => {
    const eqns = [
      ['length', 10],
      ['width', 5],
      ['area', 'length * width'],
      ['perimeter', '2*length + 2*width'],
    ]
    const rep = solvem(eqns, { length: 10, width: 5, area: 1, perimeter: 1 })
    check('solvem: area/perimeter (sat)', rep.sat, true)
    check('solvem: area=50', rep.ass.area, 50, 1e-6)
    check('solvem: perimeter=30', rep.ass.perimeter, 30, 1e-6)
  })()

  // Distance/rate/time problem
  ;(() => {
    const eqns = [
      ['distance', 100],
      ['rate', 25],
      ['time', 'distance / rate'],
    ]
    const rep = solvem(eqns, { distance: 100, rate: 25, time: 1 })
    check('solvem: d/r/t problem (sat)', rep.sat, true)
    check('solvem: time=4', rep.ass.time, 4, 1e-9)
  })()

  // Compound interest simplified: A = P(1+r)^n
  ;(() => {
    const eqns = [
      ['P', 1000],
      ['r', 0.05],
      ['n', 2],
      ['A', 'P * (1+r)^n'],
    ]
    const rep = solvem(eqns, { P: 1000, r: 0.05, n: 2, A: 1 })
    check('solvem: compound interest (sat)', rep.sat, true)
    check('solvem: A=1102.5', rep.ass.A, 1102.5, 1e-9)
  })()

  // ==========================================================================
  // Multi-term equations and expression equality
  // ==========================================================================

  // Multi-equals: a = b = c = 5
  ;(() => {
    const eqns = [
      ['a', 'b', 'c', 5],
    ]
    const rep = solvem(eqns, { a: 1, b: 1, c: 1 })
    check('solvem: multi-equals (sat)', rep.sat, true)
    check('solvem: multi-equals a=5', rep.ass.a, 5, 1e-9)
    check('solvem: multi-equals b=5', rep.ass.b, 5, 1e-9)
    check('solvem: multi-equals c=5', rep.ass.c, 5, 1e-9)
  })()

  // Expression-to-expression equality: 2a = 3b
  ;(() => {
    const eqns = [
      ['2*a', '3*b'],
      ['a', 6],
    ]
    const rep = solvem(eqns, { a: 6, b: 1 })
    check('solvem: expr=expr (sat)', rep.sat, true)
    check('solvem: expr=expr b=4', rep.ass.b, 4, 1e-9)
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
    const rep = solvem(eqns, { flour: 500, water: 1, salt: 1, yeast: 1, total: 1 })
    check('solvem: baker pct (sat)', rep.sat, true)
    check('solvem: baker water=325', rep.ass.water, 325, 1e-9)
    check('solvem: baker salt=10', rep.ass.salt, 10, 1e-9)
    check('solvem: baker yeast=5', rep.ass.yeast, 5, 1e-9)
    check('solvem: baker total=840', rep.ass.total, 840, 1e-9)
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
    const rep = solvem(eqns, { a: 1, b: 1, c: 1, k: 2 })
    check('solvem: pythagorean scale (sat)', rep.sat, true)
    check('solvem: pythagorean a=6', rep.ass.a, 6, 1e-9)
    check('solvem: pythagorean b=8', rep.ass.b, 8, 1e-9)
    check('solvem: pythagorean c=10', rep.ass.c, 10, 1e-9)
  })()

  // Three-way equality chain: a = b = c with a pinned
  ;(() => {
    const eqns = [
      ['a', 'b'],
      ['b', 'c'],
      ['a', 7],
    ]
    const rep = solvem(eqns, { a: 7, b: 1, c: 1 })
    check('solvem: equality chain (sat)', rep.sat, true)
    check('solvem: equality chain a=7', rep.ass.a, 7, 1e-9)
    check('solvem: equality chain b=7', rep.ass.b, 7, 1e-9)
    check('solvem: equality chain c=7', rep.ass.c, 7, 1e-9)
  })()

  // Temperature conversion: C = (F - 32) * 5/9
  ;(() => {
    const eqns = [
      ['F', 212],
      ['C', '(F - 32) * 5/9'],
    ]
    const rep = solvem(eqns, { F: 212, C: 1 })
    check('solvem: temp conversion (sat)', rep.sat, true)
    check('solvem: temp C=100', rep.ass.C, 100, 1e-9)
  })()

  // Reverse temperature conversion
  ;(() => {
    const eqns = [
      ['C', 0],
      ['F', 'C * 9/5 + 32'],
    ]
    const rep = solvem(eqns, { C: 0, F: 1 })
    check('solvem: reverse temp (sat)', rep.sat, true)
    check('solvem: reverse temp F=32', rep.ass.F, 32, 1e-9)
  })()

  // BMI calculation: BMI = weight / height^2 (metric)
  ;(() => {
    const eqns = [
      ['weight', 70],
      ['height', 1.75],
      ['bmi', 'weight / height^2'],
    ]
    const rep = solvem(eqns, { weight: 70, height: 1.75, bmi: 1 })
    check('solvem: bmi calc (sat)', rep.sat, true)
    check('solvem: bmi=22.86', rep.ass.bmi, 70 / (1.75 * 1.75), 0.01)
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
    const rep = solvem(eqns, { x: 4, y: 1 })
    check('solvem: reciprocal (sat)', rep.sat, true)
    check('solvem: reciprocal y=0.25', rep.ass.y, 0.25, 1e-9)
  })()

  // Logarithmic relationship (implicit via exp)
  ;(() => {
    const eqns = [
      ['x', 2],
      ['y', 'exp(x)'],
    ]
    const rep = solvem(eqns, { x: 2, y: 1 })
    check('solvem: exp (sat)', rep.sat, true)
    check('solvem: exp y=e^2', rep.ass.y, Math.exp(2), 1e-6)
  })()

  // Multiple sqrt relationships
  ;(() => {
    const eqns = [
      ['a', 16],
      ['b', 'sqrt(a)'],
      ['c', 'sqrt(b)'],
    ]
    const rep = solvem(eqns, { a: 16, b: 1, c: 1 })
    check('solvem: nested sqrt (sat)', rep.sat, true)
    check('solvem: nested sqrt b=4', rep.ass.b, 4, 1e-9)
    check('solvem: nested sqrt c=2', rep.ass.c, 2, 1e-9)
  })()

  // Absolute value constraint
  ;(() => {
    const eqns = [
      ['x', -5],
      ['y', 'abs(x)'],
    ]
    const rep = solvem(eqns, { x: -5, y: 1 })
    check('solvem: abs (sat)', rep.sat, true)
    check('solvem: abs y=5', rep.ass.y, 5, 1e-9)
  })()

  // Floor function
  ;(() => {
    const eqns = [
      ['x', 3.7],
      ['y', 'floor(x)'],
    ]
    const rep = solvem(eqns, { x: 3.7, y: 1 })
    check('solvem: floor (sat)', rep.sat, true)
    check('solvem: floor y=3', rep.ass.y, 3, 1e-9)
  })()

  // Ceiling function
  ;(() => {
    const eqns = [
      ['x', 3.2],
      ['y', 'ceil(x)'],
    ]
    const rep = solvem(eqns, { x: 3.2, y: 1 })
    check('solvem: ceil (sat)', rep.sat, true)
    check('solvem: ceil y=4', rep.ass.y, 4, 1e-9)
  })()

  // Round function
  ;(() => {
    const eqns = [
      ['x', 3.5],
      ['y', 'round(x)'],
    ]
    const rep = solvem(eqns, { x: 3.5, y: 1 })
    check('solvem: round (sat)', rep.sat, true)
    check('solvem: round y=4', rep.ass.y, 4, 1e-9)
  })()

  // Min/max functions
  ;(() => {
    const eqns = [
      ['a', 3],
      ['b', 7],
      ['c', 'min(a, b)'],
      ['d', 'max(a, b)'],
    ]
    const rep = solvem(eqns, { a: 3, b: 7, c: 1, d: 1 })
    check('solvem: min/max (sat)', rep.sat, true)
    check('solvem: min c=3', rep.ass.c, 3, 1e-6)
    check('solvem: max d=7', rep.ass.d, 7, 1e-6)
  })()

  // Circular dependency with solution
  ;(() => {
    const eqns = [
      ['a', 'b + 1'],
      ['b', 'c + 1'],
      ['c', 0],
    ]
    const rep = solvem(eqns, { a: 1, b: 1, c: 0 })
    check('solvem: circular chain (sat)', rep.sat, true)
    check('solvem: circular a=2', rep.ass.a, 2, 1e-9)
    check('solvem: circular b=1', rep.ass.b, 1, 1e-9)
  })()

  // System with negative numbers
  ;(() => {
    const eqns = [
      ['x', -3],
      ['y', '-2*x'],
      ['z', 'x + y'],
    ]
    const rep = solvem(eqns, { x: -3, y: 1, z: 1 })
    check('solvem: negatives (sat)', rep.sat, true)
    check('solvem: negatives y=6', rep.ass.y, 6, 1e-9)
    check('solvem: negatives z=3', rep.ass.z, 3, 1e-9)
  })()

  // Implicit mult with parens: 2(x+1) = 10
  ;(() => {
    const eqns = [
      ['2(x+1)', 10],
    ]
    const rep = solvem(eqns, { x: 1 })
    check('solvem: implicit paren mult (sat)', rep.sat, true)
    check('solvem: implicit paren x=4', rep.ass.x, 4, 1e-9)
  })()

  // Area/circumference of circle
  ;(() => {
    const eqns = [
      ['r', 5],
      ['area', '3.14159 * r^2'],
      ['circ', '2 * 3.14159 * r'],
    ]
    const rep = solvem(eqns, { r: 5, area: 1, circ: 1 })
    check('solvem: circle (sat)', rep.sat, true)
    check('solvem: circle area', rep.ass.area, Math.PI * 25, 0.01)
    check('solvem: circle circ', rep.ass.circ, Math.PI * 10, 0.01)
  })()

  // Compound interest: A = P(1 + r)^t
  ;(() => {
    const eqns = [
      ['P', 1000],
      ['r', 0.05],
      ['t', 3],
      ['A', 'P * (1 + r)^t'],
    ]
    const rep = solvem(eqns, { P: 1000, r: 0.05, t: 3, A: 1 })
    check('solvem: compound interest (sat)', rep.sat, true)
    check('solvem: compound A=1157.625', rep.ass.A, 1000 * Math.pow(1.05, 3), 0.01)
  })()

  // Speed/distance/time with derived values
  ;(() => {
    const eqns = [
      ['d', 100],
      ['t', 2],
      ['s', 'd/t'],
      ['d2', 's*3'],  // how far in 3 hours at same speed
    ]
    const rep = solvem(eqns, { d: 100, t: 2, s: 1, d2: 1 })
    check('solvem: speed/dist/time (sat)', rep.sat, true)
    check('solvem: speed s=50', rep.ass.s, 50, 1e-5)
    check('solvem: speed d2=150', rep.ass.d2, 150, 1e-5)
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
    const rep = solvem(eqns, { f1: 1, f2: 1, f3: 1, f4: 1, f5: 1 })
    check('solvem: fib chain (sat)', rep.sat, true)
    check('solvem: fib f3=2', rep.ass.f3, 2, 1e-9)
    check('solvem: fib f4=3', rep.ass.f4, 3, 1e-9)
    check('solvem: fib f5=5', rep.ass.f5, 5, 1e-9)
  })()

  // Harmonic mean
  ;(() => {
    const eqns = [
      ['a', 2],
      ['b', 6],
      ['h', '2*a*b/(a+b)'],
    ]
    const rep = solvem(eqns, { a: 2, b: 6, h: 1 })
    check('solvem: harmonic mean (sat)', rep.sat, true)
    check('solvem: harmonic h=3', rep.ass.h, 3, 1e-9)
  })()

  // Geometric mean
  ;(() => {
    const eqns = [
      ['a', 4],
      ['b', 9],
      ['g', 'sqrt(a*b)'],
    ]
    const rep = solvem(eqns, { a: 4, b: 9, g: 1 })
    check('solvem: geometric mean (sat)', rep.sat, true)
    check('solvem: geometric g=6', rep.ass.g, 6, 1e-9)
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
    const rep = solvem(eqns, { a: 1, b: -5, c: 6, disc: 1, r1: 1, r2: 1 })
    check('solvem: quadratic formula (sat)', rep.sat, true)
    check('solvem: quadratic disc=1', rep.ass.disc, 1, 1e-9)
    check('solvem: quadratic r1=3', rep.ass.r1, 3, 1e-9)
    check('solvem: quadratic r2=2', rep.ass.r2, 2, 1e-9)
  })()

  // System with zero values
  ;(() => {
    const eqns = [
      ['x', 0],
      ['y', 'x + 5'],
      ['z', 'x * y'],
    ]
    const rep = solvem(eqns, { x: 0, y: 1, z: 1 })
    check('solvem: zero values (sat)', rep.sat, true)
    check('solvem: zero y=5', rep.ass.y, 5, 1e-9)
    check('solvem: zero z=0', rep.ass.z, 0, 1e-9)
  })()

  // Unit conversion chain: km -> m -> cm
  ;(() => {
    const eqns = [
      ['km', 2],
      ['m', 'km * 1000'],
      ['cm', 'm * 100'],
    ]
    const rep = solvem(eqns, { km: 2, m: 1, cm: 1 })
    check('solvem: unit chain (sat)', rep.sat, true)
    check('solvem: unit m=2000', rep.ass.m, 2000, 1e-9)
    check('solvem: unit cm=200000', rep.ass.cm, 200000, 1e-9)
  })()

  // ==========================================================================
  // Product constraints (w*h pattern)
  // ==========================================================================

  // Product from zero: Anti-Postel says fail loudly, don't silently guess
  // When w=0 and h=0, solving w*h=100 requires dividing by zero - we can't
  ;(() => {
    const eqns = [
      ['w*h', 'A'],
      ['A', 100],
    ]
    const rep = solvem(eqns, { w: 0, h: 0, A: 100 })
    check('solvem: product from zero fails (sat=false)', rep.sat, false)
  })()

  // Product without explicit aspect constraint: Newton finds a solution
  // that satisfies w*h=200 but aspect ratio is NOT preserved (was h/w=2).
  ;(() => {
    const eqns = [
      ['w*h', 'A'],
      ['A', 200],
    ]
    const rep = solvem(eqns, { w: 5, h: 10, A: 200 })
    check('solvem: product (sat)', rep.sat, true)
    check('solvem: product w*h=200', rep.ass.w * rep.ass.h, 200, 1e-6)
    // Aspect ratio changes from original h/w=2 - any valid solution is fine
    check('solvem: product aspect ratio not original', rep.ass.h / rep.ass.w !== 2, true)
  })()

  // Product with one variable pinned
  ;(() => {
    const eqns = [
      ['w', 8],
      ['w*h', 'A'],
      ['A', 40],
    ]
    const rep = solvem(eqns, { w: 8, h: 1, A: 40 })
    check('solvem: product one pinned (sat)', rep.sat, true)
    check('solvem: product one pinned h=5', rep.ass.h, 5, 1e-9)
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
    const rep = solvem(eqns, { a: 10, b: 1, c: 1, d: 1 })
    check('solvem: diamond dependency (sat)', rep.sat, true)
    check('solvem: diamond b=20', rep.ass.b, 20, 1e-9)
    check('solvem: diamond c=30', rep.ass.c, 30, 1e-9)
    check('solvem: diamond d=50', rep.ass.d, 50, 1e-9)
  })()

  // Diamond with constraint at bottom (singleton filtered out)
  ;(() => {
    const eqns = [
      ['b', '2*a'],
      ['c', '3*a'],
      ['d', 'b + c', 100],
    ]
    const rep = solvem(eqns, { a: 1, b: 1, c: 1, d: 100 })
    check('solvem: diamond reverse (sat)', rep.sat, true)
    check('solvem: diamond reverse a=20', rep.ass.a, 20, 1e-9)
    check('solvem: diamond reverse b=40', rep.ass.b, 40, 1e-9)
    check('solvem: diamond reverse c=60', rep.ass.c, 60, 1e-9)
  })()

  // ==========================================================================
  // Discontinuity detection (functions with jumps/asymptotes)
  // ==========================================================================

  // Division approaching zero (1/x near x=0)
  ;(() => {
    const eqns = [
      ['1/x', 100],
    ]
    const rep = solvem(eqns, { x: 1 })
    check('solvem: 1/x=100 (sat)', rep.sat, true)
    check('solvem: 1/x=100 x=0.01', rep.ass.x, 0.01, 1e-9)
  })()

  // Finding root across discontinuity
  ;(() => {
    const eqns = [
      ['x', 2],
      ['y', '1/x'],
    ]
    const rep = solvem(eqns, { x: 2, y: 1 })
    check('solvem: y=1/x (sat)', rep.sat, true)
    check('solvem: y=1/x y=0.5', rep.ass.y, 0.5, 1e-9)
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
    const rep = solvem(eqns, { x: 3, y: 7 })
    check('solvem: dependent eqns (sat)', rep.sat, true)
    check('solvem: dependent eqns sum=10', rep.ass.x + rep.ass.y, 10, 1e-6)
  })()

  // Nearly singular (ill-conditioned) - coefficients very close
  ;(() => {
    const eqns = [
      ['x + y', 10],
      ['x + 1.0001*y', 10.0005],
    ]
    const rep = solvem(eqns, { x: 5, y: 5 })
    check('solvem: ill-conditioned (sat)', rep.sat, true)
    check('solvem: ill-conditioned x+y=10', rep.ass.x + rep.ass.y, 10, 0.01)
  })()

  // Three equations, two dependent
  ;(() => {
    const eqns = [
      ['x', 5],
      ['y', 3],
      ['x + y', 8],  // Redundant but consistent
    ]
    const rep = solvem(eqns, { x: 0, y: 0 })
    check('solvem: redundant constraint (sat)', rep.sat, true)
    check('solvem: redundant x=5', rep.ass.x, 5, 1e-9)
    check('solvem: redundant y=3', rep.ass.y, 3, 1e-9)
  })()

  // ==========================================================================
  // Strict bounds with epsilon handling
  // ==========================================================================

  // Strict lower bound: x > 0, solve x^2 = 0.0001
  ;(() => {
    const eqns = [['x^2', 0.0001]]
    const rep = solvem(eqns, { x: 0.5 }, { x: 0 }, {})  // x > 0 (strict via epsilon)
    check('solvem: strict lower bound (sat)', rep.sat, true)
    check('solvem: strict lower x=0.01', rep.ass.x, 0.01, 1e-6)
  })()

  // Strict upper bound: x < 0, solve x^2 = 4
  ;(() => {
    const eqns = [['x^2', 4]]
    const rep = solvem(eqns, { x: -1 }, {}, { x: 0 })  // x < 0
    check('solvem: strict upper bound (sat)', rep.sat, true)
    check('solvem: strict upper x=-2', rep.ass.x, -2, 1e-9)
  })()

  console.log('\n=== Summary ===')
  console.log(`${results.passed} passed, ${results.failed} failed`)
  if (results.failed > 0) {
    console.log('Failed:', results.errors.join(', '))
  }

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

  // NOTE: The solvem-only qual subset remains above, but we run the full
  // consolidated solver qual suite here.
  const res = runAllSolverQuals(ctx)
  if (res.failed > 0) process.exitCode = 1
}

main()
