/*
Solver quals runner.

Runs the solvem-focused qual set against:
- the main solver in util.js
- the experimental solver in gemini-solver.js

Usage:
  node quals/solver_quals.js
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
      res = solvemImpl(tc.eqns, tc.vars)
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

function main() {
  const root = path.resolve(__dirname, '..')
  const utilPath = path.join(root, 'util.js')
  const geminiPath = path.join(root, 'gemini-solver.js')

  const utilCtx = makeContext()
  loadScriptIntoContext(utilPath, utilCtx)

  assert.equal(typeof utilCtx.solvem, 'function', 'util.js should define solvem')

  const geminiCtx = makeContext()
  loadScriptIntoContext(geminiPath, geminiCtx)

  assert.equal(typeof geminiCtx.solvem, 'function', 'gemini-solver.js should define solvem')

  const utilRes = runSolvemQuals(utilCtx.solvem, 'util.js solvem')
  console.log(utilRes.message)

  const geminiRes = runSolvemQuals(geminiCtx.solvem, 'gemini-solver.js solvem')
  console.log(geminiRes.message)

  if (!utilRes.ok) process.exitCode = 1
  if (!geminiRes.ok) process.exitCode = 1
}

main()
