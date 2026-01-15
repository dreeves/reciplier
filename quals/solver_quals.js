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
      eqns: [['x', 1], ['a', '3x'], ['b', '4x'], ['c'], ['v1', 'a^2+b^2', 'c^2']],
      vars: { x: 1, a: 1, b: 1, c: 1, v1: 1 },
      expected: { x: 1, a: 3, b: 4, c: 5, v1: 25 },
    },
    {
      name: 'pyzza: A=30',
      eqns: [['a', 30], ['a', '3x'], ['b', '4x'], ['c'], ['v1', 'a^2+b^2', 'c^2']],
      vars: { x: 1, a: 30, b: 1, c: 1, v1: 1 },
      expected: { x: 10, a: 30, b: 40, c: 50, v1: 2500 },
    },
    {
      name: 'pyzza: B=40',
      eqns: [['b', 40], ['a', '3x'], ['b', '4x'], ['c'], ['v1', 'a^2+b^2', 'c^2']],
      vars: { x: 1, a: 1, b: 40, c: 1, v1: 1 },
      expected: { x: 10, a: 30, b: 40, c: 50, v1: 2500 },
    },
    {
      name: 'pyzza: C=50',
      eqns: [['c', 50], ['a', '3x'], ['b', '4x'], ['c'], ['v1', 'a^2+b^2', 'c^2']],
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
        ['d'],
        ['_v', 'A', '1/2*6.28*r^2'],
      ],
      vars: { A: 63.585, r: 1, d: 1, _v: 1 },
      expected: { A: 63.585, r: 4.5, d: 9 },
    },
    {
      name: 'cheesepan r1 derivation',
      eqns: [
        ['d1', 9], ['r1', 'd1/2'], ['tau', 6.28], ['x', 1],
        ['r', 'd/2'], ['d'], ['A'],
        ['_v', 'A', '1/2*tau*r^2', '1/2*tau*r1^2*x'],
      ],
      vars: { d1: 9, r1: 1, tau: 6.28, x: 1, r: 1, d: 1, A: 1, _v: 1 },
      expected: { d1: 9, r1: 4.5, tau: 6.28, x: 1, r: 4.5, d: 9, A: 63.585 },
    },
    {
      name: 'cheesepan r1 with x not frozen',
      eqns: [
        ['d1', 9], ['r1', 'd1/2'], ['tau', 6.28], ['x'],
        ['r', 'd/2'], ['d'], ['A'],
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
  ]

  const failures = []

  for (const tc of cases) {
    let res
    try {
      const result = solvemImpl(tc.eqns, tc.vars)
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
  check('toJS: power', preval('x^2').includes('Math.pow'), true)

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
    solvem([['a+b', 8], ['a', 3], ['b', 4], ['c']], {a: null, b: null, c: 0}).ass,
    {a: 3, b: 4, c: 0})
  ;(() => {
    const eqns = [['a+b', 8], ['a', 3], ['b', 4], ['c']]
    const rep = solvem(eqns, {a: null, b: null, c: 0})
    check('solvem: README #2 (sat)', rep.sat, false)
    check('solvem: README #2 (zij[0] nonzero)', rep.zij[0] > 0, true)
    check('solvem: README #2 (zij[1..] zero)', rep.zij.slice(1).every(z => z === 0), true)
  })()
  check('solvem: simple equation',
    solvem([['x', 5]], {x: 1}).ass,
    {x: 5})

  check('solvem: derived value',
    solvem([['x', 2], ['y', '3x']], {x: 1, y: 1}).ass,
    {x: 2, y: 6})

  check('solvem: simultaneous equations',
    solvem([['2x+3y', 33], ['5x-4y', 2]], {x: 6, y: 0}).ass,
    {x: 6, y: 7})

  check('solvem: README #3 (sat)',
    solvem([['2x+3y', 33], ['5x-4y', 2]], {x: 6, y: 0}).sat,
    true)

  check('solvem: Pythagorean triple propagation',
    solvem([['x', 1], ['a', '3x'], ['b', '4x'], ['c'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 1, b: 1, c: 1, v1: 1}).ass,
    {x: 1, a: 3, b: 4, c: 5, v1: 25})

  ;(() => {
    const eqns = [
      ['x', 1],
      ['A', 'a*x'],
      ['B', 'b*x'],
      ['C', 'c*x'],
      ['A'],
      ['B'],
      ['A^2'],
      ['B^2'],
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
    solvem([['a', 30], ['a', '3x'], ['b', '4x'], ['c'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 30, b: 1, c: 1, v1: 1}).ass,
    {x: 10, a: 30, b: 40, c: 50, v1: 2500})

  check('solvem: pyzza change b to 40',
    solvem([['b', 40], ['a', '3x'], ['b', '4x'], ['c'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 1, b: 40, c: 1, v1: 1}).ass,
    {x: 10, a: 30, b: 40, c: 50, v1: 2500})

  check('solvem: pyzza change c to 50',
    solvem([['c', 50], ['a', '3x'], ['b', '4x'], ['c'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 1, b: 1, c: 50, v1: 1}).ass,
    {x: 10, a: 30, b: 40, c: 50, v1: 2500})

  ;(() => {
    const eqns = [
      ['x'],
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
      ['c'],
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
      ['c'],
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
      ['d'],
      ['_v', 'A', '1/2*6.28*r^2'],
    ], {A: 63.585, r: 1, d: 1, _v: 1}).ass,
    {A: 63.585, r: 4.5, d: 9})

  check('solvem: cheesepan r1 derivation',
    solvem([
      ['d1', 9], ['r1', 'd1/2'], ['tau', 6.28], ['x', 1],
      ['r', 'd/2'], ['d'], ['A'],
      ['_v', 'A', '1/2*tau*r^2', '1/2*tau*r1^2*x'],
    ], {d1: 9, r1: 1, tau: 6.28, x: 1, r: 1, d: 1, A: 1, _v: 1}).ass,
    {d1: 9, r1: 4.5, tau: 6.28, x: 1, r: 4.5, d: 9, A: 63.585, _v: 63.585})

  check('solvem: cheesepan r1 with x not frozen',
    solvem([
      ['d1', 9], ['r1', 'd1/2'], ['tau', 6.28], ['x'],
      ['r', 'd/2'], ['d'], ['A'],
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
    solvem([['x', 1], ['a', '3x'], ['b', '4x'], ['c'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 1, b: 1, c: 1, v1: 1}).ass,
    {x: 1, a: 3, b: 4, c: 5, v1: 25})

  check('solvem: Pyzza: A=30',
    solvem([['a', 30], ['a', '3x'], ['b', '4x'], ['c'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 30, b: 1, c: 1, v1: 1}).ass,
    {x: 10, a: 30, b: 40, c: 50, v1: 2500})

  check('solvem: Pyzza: B=40',
    solvem([['b', 40], ['a', '3x'], ['b', '4x'], ['c'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 1, b: 40, c: 1, v1: 1}).ass,
    {x: 10, a: 30, b: 40, c: 50, v1: 2500})

  check('solvem: Pyzza: C=50',
    solvem([['c', 50], ['a', '3x'], ['b', '4x'], ['c'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 1, b: 1, c: 50, v1: 1}).ass,
    {x: 10, a: 30, b: 40, c: 50, v1: 2500})

  check('solvem: Impossible Conflict (Pinned)',
    solvem([['sum', 'x+y'], ['sum', 10], ['sum', 20]], {x: 0, y: 0, sum: 0}).ass,
    {sum: 10})

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
    const eqns = [
      ['SID', 86400],
      ['y0'],
      ['m0'],
      ['d0'],
      ['y'],
      ['m'],
      ['d'],
      ['vini'],
      ['vfin'],
      ['tini', 'unixtime(y0, m0, d0)'],
      ['tfin', 'unixtime(y, m, d)'],
      ['r', '(vfin-vini)/(tfin-tini)'],
    ]

    const rep = solvem(eqns, {
      SID: 86400,
      y0: 2025,
      m0: 12,
      d0: 25,
      y: 2025,
      m: 12,
      d: 26,
      vini: 0,
      vfin: 100100,
      tini: 1,
      tfin: 1,
      r: 1,
    })

    check('solvem: dial-style unixtime-derived r (sat)', rep.sat, true)
    check('solvem: dial-style unixtime-derived r', rep.ass.r, 100100 / 86400, 1e-6)
    check('solvem: dial-style unixtime-derived r ~= 1.15856', rep.ass.r, 1.15856, 1e-5)

    const repTiny = solvem(eqns, {
      SID: 86400,
      y0: 2025,
      m0: 12,
      d0: 25,
      y: 2026,
      m: 12,
      d: 25,
      vini: 73,
      vfin: 70,
      tini: 1,
      tfin: 1,
      r: 1,
    })

    const expectedTiny = (70 - 73) / (unixtime(2026, 12, 25) - unixtime(2025, 12, 25))
    check('solvem: dial-style tiny r (sat)', repTiny.sat, true)
    check('solvem: dial-style tiny r', repTiny.ass.r, expectedTiny, 1e-9)
  })()

  ;(() => {
    const eqns = [
      ['milk', 5, '5.333x'],
      ['eggs', '12x'],
      ['x'],
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
      ['x'],
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
      ['x'],
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
      ['y'],
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
      ['x'],
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
      ['k*vp'],
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
    check('solvem: breakaway vp=42', rep.ass.vp, 42, 1e-9)
    check('solvem: breakaway gt=0.025', rep.ass.gt, 0.025, 1e-12)
    check('solvem: breakaway gd=1', rep.ass.gd, 1, 1e-12)
  })()

  ;(() => {
    const tini = unixtime(2025, 12, 25)
    const tfin0 = unixtime(2026, 12, 25)
    const r0 = -3 / (tfin0 - tini)
    const eqns = [
      ['y0', 2025],
      ['m0', 12],
      ['d0', 25],
      ['vini', 73],
      ['y'],
      ['m'],
      ['d'],
      ['vfin', 70],
      ['(tfin-tini)/SID'],
      ['r*SID', -0.008],
      ['r*SIW'],
      ['r*SIM'],
      ['tini', 'unixtime(y0, m0, d0)'],
      ['tfin', 'unixtime(y, m, d)'],
      ['tfin - tini'],
      ['(tfin - tini)/SID'],
      ['(tfin - tini)/SIW'],
      ['(tfin - tini)/SIM'],
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

    const eqns = [
      ['y0', 2025],
      ['m0', 12],
      ['d0', 25],
      ['y'],
      ['m'],
      ['d'],
      ['vini', 73, 73],
      ['vfin', 70, 70],
      ['r*SID', -1],
      ['r*SIW'],
      ['r*SIM'],
      ['tini', 'unixtime(y0, m0, d0)', tiniVal],
      ['tfin', 'unixtime(y, m, d)'],
      ['tfin - tini'],
      ['(tfin - tini)/SID'],
      ['(tfin - tini)/SIW'],
      ['(tfin - tini)/SIM'],
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
      ['d'],
      ['k*d', 12.4274],
    ]

    const rep = solvem(eqns, {
      k: k,
      d: 20,
    })

    check('solvem: breakaway k*d typing (sat)', rep.sat, true)
    check('solvem: breakaway k*d = 12.4274', rep.ass.k * rep.ass.d, 12.4274, 1e-9)
  })()

  // TODO case 1: b vs b+0 should behave identically
  // {5 = a} {b+0} {10 = a + b} should solve to b=5
  ;(() => {
    const eqns = [
      ['a', 5],
      ['b+0'],
      ['a + b', 10],
    ]
    const rep = solvem(eqns, { a: 5, b: 1 })
    check('solvem: b+0 behaves same as b (sat)', rep.sat, true)
    check('solvem: b+0 behaves same as b (b=5)', rep.ass.b, 5, 1e-9)
  })()

  // Verify {b} also works the same way
  ;(() => {
    const eqns = [
      ['a', 5],
      ['b'],
      ['a + b', 10],
    ]
    const rep = solvem(eqns, { a: 5, b: 1 })
    check('solvem: bare b also works (sat)', rep.sat, true)
    check('solvem: bare b also works (b=5)', rep.ass.b, 5, 1e-9)
  })()

  // TODO case 2: quadratic equation solving
  // {a=3}x^2+{b=4}x+{c=-20}=0 with a*x^2+b*x+c=0 should solve for x=2
  ;(() => {
    const eqns = [
      ['a', 3],
      ['b', 4],
      ['c', -20],
      ['a*x^2+b*x+c', 0],
      ['x'],
    ]
    const rep = solvem(eqns, { a: 3, b: 4, c: -20, x: 1 })
    check('solvem: quadratic equation (sat)', rep.sat, true)
    check('solvem: quadratic equation (x=2)', rep.ass.x, 2, 1e-6)
  })()

  // TODO case 3: golden ratio
  // {1/phi = phi - 1} should solve to phi ≈ 1.618
  ;(() => {
    const phi = (1 + Math.sqrt(5)) / 2
    const eqns = [
      ['1/phi', 'phi - 1'],
      ['phi'],
    ]
    const rep = solvem(eqns, { phi: 1 })
    check('solvem: golden ratio (sat)', rep.sat, true)
    check('solvem: golden ratio (phi)', rep.ass.phi, phi, 1e-6)
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
  const csolverPath = path.join(root, 'csolver.js')

  const ctx = makeContext()
  loadScriptIntoContext(csolverPath, ctx)

  assert.equal(typeof ctx.solvem, 'function', 'csolver.js should define solvem')

  // NOTE: The solvem-only qual subset remains above, but we run the full
  // consolidated solver qual suite here.
  const res = runAllSolverQuals(ctx)
  if (res.failed > 0) process.exitCode = 1
}

main()
