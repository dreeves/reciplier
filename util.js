// TODO: call this as part of toJavaScript (need a better name for that)
function deoctalize(s) {
  return s.replace(/(?<![\w_\.])0+(\d)/g, '$1')
}

// Maybe call this preval because it's a preprocessing stage before eval that 
// handles syntax beyond what JavaScript handles. 
// Convert Mathematica-style expression syntax to JavaScript
// Supports: implicit multiplication (2x -> 2*x), ^ for exponentiation, math functions, pi
function toJavaScript(expr) {
  if (typeof expr !== 'string' || expr.trim() === '') {
    throw new Error(`Invalid expression: ${String(expr)}`)
  }

  let js = expr

  // Implicit multiplication: number followed by letter (but not inside identifiers)
  // We need to be careful: 2x -> 2*x, but b3h stays b3h
  // Strategy: only match when digit is NOT preceded by a letter
  js = js.replace(/(?<![a-zA-Z_])(\d+\.?\d*)([a-zA-Z_])/g, '$1*$2')

  // Math functions
  js = js.replace(/\b(sqrt|floor|ceil|round|min|max|sin|cos|tan|asin|acos|atan|log|exp|abs)\s*\(/g, 'Math.$1(')
  js = js.replace(/\bpi\b/gi, 'Math.PI')

  // Exponentiation: x^2 -> Math.pow(x,2)
  for (let i = 0; i < 10; i++) {
    const before = js
    js = js.replace(/(\w+|\d+\.?\d*|\))\s*\^\s*(\w+|\d+\.?\d*|\([^()]*\))/g,
      (_, base, exp) => `Math.pow(${base},${exp})`)
    if (js === before) break
  }

  return js
}

// Evaluate an expression with given variable values. E.g., 
// vareval('2x+y', {x: 3, y: 1}) returns {value: 7, error: null}.
function vareval(expr, vars) {
  try {
    const jsExpr = deoctalize(toJavaScript(expr))

    // Build variable assignments
    const assignments = Object.entries(vars)
      .map(([name, val]) => `const ${name} = ${val};`)
      .join('\n')

    // Use Function constructor to evaluate in isolated scope
    const fn = new Function(`
      "use strict";
      ${assignments}
      return (${jsExpr});
    `)
    const result = fn()
    return { value: result, error: null }
  } catch (e) {
    return { value: null, error: e.message }
  }
}

// =============================================================================
// Helper: Find all variable names referenced in an expression
// =============================================================================

const RESERVED_WORDS = new Set(['sqrt', 'floor', 'ceil', 'round', 'min', 'max',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'exp', 'abs', 'pi'])

function findVariables(expr) {
  if (typeof expr !== 'string' || expr.trim() === '') return new Set()
  const matches = expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || []
  return new Set(matches.filter(v => !RESERVED_WORDS.has(v)))
}

// =============================================================================
// Helper: Solve for a single variable
// Find value of varName such that expr evaluates to target
// Tries smart guesses first (handles non-monotonic cases), then binary search
// =============================================================================

function solveFor(expr, varName, target, values) {
  const test = { ...values }
  const tol = Math.abs(target) * 1e-9 + 1e-9

  function tryGuess(guess) {
    if (!isFinite(guess)) return null
    test[varName] = guess
    const r = vareval(expr, test)
    if (!r.error && isFinite(r.value) && Math.abs(r.value - target) < tol) {
      return guess
    }
    return null
  }

  // Smart guesses - handles non-monotonic cases like x^2 = 25 -> try sqrt(25) = 5
  const guesses = [
    target,                              // direct
    Math.sqrt(Math.abs(target)),         // for squared expressions
    -Math.sqrt(Math.abs(target)),        // negative root
    Math.cbrt(target),                   // for cubed expressions
    1, 0, -1,                            // common values
    target / 2, target * 2,              // nearby
  ]

  // Prefer positive solutions
  for (const g of guesses) {
    if (g >= 0) {
      const result = tryGuess(g)
      if (result !== null) return result
    }
  }
  for (const g of guesses) {
    if (g < 0) {
      const result = tryGuess(g)
      if (result !== null) return result
    }
  }

  // Binary search as fallback
  let lo = 0, hi = 1000

  // Find valid bounds
  for (let scale = 1; scale < 1e10; scale *= 10) {
    test[varName] = scale
    const hiRes = vareval(expr, test)
    test[varName] = -scale
    const loRes = vareval(expr, test)

    if (!hiRes.error && !loRes.error) {
      if ((hiRes.value - target) * (loRes.value - target) <= 0) {
        lo = -scale
        hi = scale
        break
      }
    }

    test[varName] = 0
    const zeroRes = vareval(expr, test)
    if (!hiRes.error && !zeroRes.error) {
      if ((hiRes.value - target) * (zeroRes.value - target) <= 0) {
        lo = 0
        hi = scale
        break
      }
    }
  }

  // Binary search
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    test[varName] = mid
    const r = vareval(expr, test)
    if (r.error) return null

    if (Math.abs(r.value - target) < tol) return mid

    test[varName] = lo
    const loRes = vareval(expr, test)
    if (loRes.error) return null

    if ((loRes.value - target) * (r.value - target) > 0) {
      lo = mid
    } else {
      hi = mid
    }
  }

  // Verify the result is actually close to target before returning
  const finalVal = (lo + hi) / 2
  test[varName] = finalVal
  const finalRes = vareval(expr, test)
  if (finalRes.error || Math.abs(finalRes.value - target) > Math.abs(target) * 0.01 + 0.01) {
    return null
  }
  return finalVal
}

// =============================================================================
// solvem: Main constraint solver
// =============================================================================
//
// This function takes a list of equations and a hash of variables with initial
// numerical assignments and returns a satisfying assignment of numeric values
// to the variables. 
// (An equation is a list of expressions taken to all be equal.)
// Examples:
// solvem([['2x+3y', 33], ['5x-4y', 2]], {x: 6, y: 0}) returns {x: 6, y: 7}. 
// It does this by trying each variable one at a time and doing a binary search
// for a value that satisfies the equations. So in this example, it only works
// because one of the variables was already correct. If initial values of 
// {x: 0, y: 0} were passed in, it would fail to find a satisfying assignment.
// solvem([['x', 1], ['a', '3x'], ['b', '4x'], ['c'], ['v1', 'a^2+b^2', 'c^2']],
//        {x: 1, a: 1, b: 1, c: 1, v1: 1}) returns 
// {x: 1, a: 3, b: 4, c: 5, v1: 25}. 
// In this case we fail to find a satisfying value for x so we continue to a. We
// also fail to find a satisfying value for a but since the equation with a on
// the lefthand side only includes variable x elsewhere in the equation, we 
// tentatively set a to what '3x' evaluates to using the current value of x. In
// other words, we let the constraints propagate. I'm not sure the elegant 
// algorithm for this yet...
// 
// (In the future if we have a use case for solving simultaneous equations we
// can extend this. For linear equations it's perfectly doable with Gaussian
// elimination. And we could get arbitrarily fancy, like calling out to
// something like Mathematica's NMinimize or whatever.)

// TODO: ugh, i don't think there should be a frozenVars argument here. the idea
// is to freeze a cvar by simply including the cval in the ceqn that's passed in
// here to solvem. the spec makes this clear.

// TODO: how should we handle the case where solvem doesn't find a satisfying 
// assignment? we could just return best-effort assignments and it's up to the 
// client of these utils to check whether and which constraints are satisfied.
// but it seems like it would be more efficient for solvem to keep track and 
// return that directly.

function solvem(eqns, vars, frozenVars = new Set()) {
  const values = { ...vars }
  const tol = 1e-6  // Looser tolerance for practical floating-point comparisons
  const frozen = frozenVars  // Variables that should not be adjusted

  // Helper to check if a variable name is a simple identifier
  function isSimpleVar(expr) {
    if (typeof expr !== 'string') return false
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(expr.trim())
  }

  // Helper: evaluate an expression or return the number directly
  function evalExprIn(expr, env) {
    if (typeof expr === 'number') return { value: expr, error: null }
    return vareval(expr, env)
  }

  function evalExpr(expr) {
    return evalExprIn(expr, values)
  }

  // Helper: check if all expressions in an equation evaluate to the same value
  function checkEquationIn(eqn, env) {
    if (eqn.length < 2) return { satisfied: true, target: null }

    const results = eqn.map(e => evalExprIn(e, env))
    if (results.some(r => r.error || !isFinite(r.value))) {
      return { satisfied: false, target: null }
    }

    const first = results[0].value
    const tolerance = Math.abs(first) * tol + tol
    const satisfied = results.every(r => Math.abs(r.value - first) < tolerance)
    return { satisfied, target: first }
  }

  function checkEquation(eqn) {
    return checkEquationIn(eqn, values)
  }

  // Helper: count total number of violated equations
  function countViolationsIn(env) {
    let count = 0
    for (const eqn of eqns) {
      if (!checkEquationIn(eqn, env).satisfied) count++
    }
    return count
  }

  function countViolations() {
    return countViolationsIn(values)
  }

  // directlyPinned: variables that appear in equations with literal numbers (truly frozen)
  const directlyPinned = new Set()
  for (const eq of eqns) {
    const hasNumber = eq.some(e => typeof e === 'number')
    if (hasNumber) {
      for (const e of eq) {
        if (isSimpleVar(e)) directlyPinned.add(e)
      }
    }
  }

  // pinnedVars: trustworthy values (includes transitive derivations from frozen vars)
  // Used for target selection in solving, not for preventing updates
  const pinnedVars = new Set(directlyPinned)
  for (let i = 0; i < 10; i++) {
    let added = false
    for (const eq of eqns) {
      if (eq.length !== 2) continue
      const [e0, e1] = eq
      for (const { simple, expr } of [{simple: e0, expr: e1}, {simple: e1, expr: e0}]) {
        if (!isSimpleVar(simple) || pinnedVars.has(simple)) continue
        if (typeof expr === 'number') { pinnedVars.add(simple); added = true; continue }
        if (typeof expr !== 'string') continue
        const vars = findVariables(expr)
        if (vars.size > 0 && [...vars].every(v => pinnedVars.has(v))) {
          pinnedVars.add(simple)
          added = true
        }
      }
    }
    if (!added) break
  }

  // protected: vars that were just solved and shouldn't be overwritten
  function propagateDerivedIn(env, protected = new Set()) {
    let changed = false
    // Only directly pinned vars (frozen) and protected vars prevent overwrites
    const effectivelyPinned = new Set([...directlyPinned, ...protected])

    for (const eqn of eqns) {
      if (eqn.length !== 2) continue

      const [e0, e1] = eqn

      const pairs = [
        { simpleVar: e0, expr: e1 },
        { simpleVar: e1, expr: e0 },
      ]

      for (const { simpleVar, expr } of pairs) {
        if (!isSimpleVar(simpleVar)) continue
        if (typeof expr !== 'string' && typeof expr !== 'number') continue

        const exprVars = typeof expr === 'string' ? findVariables(expr) : new Set()
        const allExprVarsKnown = [...exprVars].every(v => env[v] !== undefined)

        if (allExprVarsKnown) {
          const exprResult = typeof expr === 'number'
            ? { value: expr, error: null }
            : vareval(expr, env)
          if (exprResult.error || !isFinite(exprResult.value)) continue

          const oldVal = env[simpleVar]
          if (oldVal === undefined) {
            env[simpleVar] = exprResult.value
            changed = true
          } else if (Math.abs(exprResult.value - oldVal) > tol) {
            // Conflict: try solving for unpinned vars in expr instead of overwriting
            const unpinned = [...exprVars].filter(v => !effectivelyPinned.has(v))
            if (effectivelyPinned.has(simpleVar) && unpinned.length > 0) {
              for (const v of unpinned) {
                const solved = solveFor(expr, v, oldVal, env)
                if (solved !== null) {
                  env[v] = solved
                  changed = true
                  break
                }
              }
            } else if (!effectivelyPinned.has(simpleVar)) {
              env[simpleVar] = exprResult.value
              changed = true
            }
          }
        } else if (typeof expr === 'string' && isSimpleVar(simpleVar) &&
                   env[simpleVar] !== undefined) {
          const unknowns = [...exprVars].filter(v => env[v] === undefined)
          if (unknowns.length === 1) {
            const varToSolve = unknowns[0]
            const solved = solveFor(expr, varToSolve, env[simpleVar], env)
            if (solved !== null) {
              env[varToSolve] = solved
              changed = true
            }
          }
        }
      }
    }

    return changed
  }

  // Helper: find ALL candidate variables we could solve for in this equation
  function findSolvableCandidates(eqn) {
    const candidates = []

    // Collect all evaluable expressions with their values
    const evaluable = []
    for (const expr of eqn) {
      if (typeof expr === 'number') {
        evaluable.push({ expr, value: expr, isNumber: true, isSimple: false })
      } else {
        const vars = findVariables(expr)
        const allKnown = [...vars].every(v => values[v] !== undefined)
        if (allKnown) {
          const r = evalExpr(expr)
          if (!r.error && isFinite(r.value)) {
            evaluable.push({
              expr,
              value: r.value,
              isNumber: false,
              isSimple: isSimpleVar(expr),
              vars
            })
          }
        }
      }
    }

    if (evaluable.length === 0) return candidates

    // Sort to prefer as target: numbers > pinned simple > fully-pinned complex > other complex > unpinned simple
    evaluable.sort((a, b) => {
      if (a.isNumber !== b.isNumber) return a.isNumber ? -1 : 1
      const aPinnedSimple = a.isSimple && pinnedVars.has(a.expr)
      const bPinnedSimple = b.isSimple && pinnedVars.has(b.expr)
      if (aPinnedSimple !== bPinnedSimple) return aPinnedSimple ? -1 : 1
      const aFullyPinned = !a.isSimple && a.vars && [...a.vars].every(v => pinnedVars.has(v))
      const bFullyPinned = !b.isSimple && b.vars && [...b.vars].every(v => pinnedVars.has(v))
      if (aFullyPinned !== bFullyPinned) return aFullyPinned ? -1 : 1
      if (a.isSimple !== b.isSimple) return a.isSimple ? 1 : -1
      return 0
    })

    // Use the first (best) expression as target
    const target = evaluable[0]

    // Find expressions we could solve for
    for (const e of evaluable) {
      if (e === target) continue
      if (e.isNumber) continue

      const unknowns = [...e.vars].filter(v => values[v] === undefined)

      // If this expression has exactly one unknown, we can solve for it
      if (unknowns.length === 1 && !frozen.has(unknowns[0])) {
        candidates.push({ varName: unknowns[0], expr: e.expr, target: target.value })
      }

      // Also try to solve if all vars are known but equation isn't satisfied
      if (unknowns.length === 0 && e.vars.size > 0) {
        // Add non-frozen variables as candidates
        for (const v of e.vars) {
          if (!frozen.has(v)) {
            candidates.push({ varName: v, expr: e.expr, target: target.value })
          }
        }
      }
    }

    return candidates
  }

  // Multiple passes to propagate constraints
  const maxPasses = 20
  let lastViolationCount = countViolations()

  for (let pass = 0; pass < maxPasses; pass++) {
    let madeAnyChange = false

    for (let p = 0; p < 10; p++) {
      if (!propagateDerivedIn(values)) break
    }

    for (const eqn of eqns) {
      const { satisfied } = checkEquation(eqn)
      if (satisfied) continue

      const candidates = findSolvableCandidates(eqn)
      if (candidates.length === 0) continue

      // Group candidates by expression (can solve one var per distinct expr)
      const byExpr = new Map()
      for (const cand of candidates) {
        if (!byExpr.has(cand.expr)) byExpr.set(cand.expr, [])
        byExpr.get(cand.expr).push(cand)
      }

      // For each expression group, find best candidate (least violations)
      const violationsBefore = countViolations()
      const bestCandidates = []
      for (const [, group] of byExpr) {
        let bestCand = null
        let bestViolations = Infinity
        for (const cand of group) {
          const trial = { ...values }
          const newVal = solveFor(cand.expr, cand.varName, cand.target, trial)
          if (newVal === null) continue
          trial[cand.varName] = newVal
          const v = countViolationsIn(trial)
          if (v < bestViolations) {
            bestViolations = v
            bestCand = { ...cand, newVal }
          }
        }
        if (bestCand) bestCandidates.push(bestCand)
      }

      // Apply all best candidates together
      const temp = { ...values }
      for (const cand of bestCandidates) {
        temp[cand.varName] = cand.newVal
      }

      // Propagate consequences, protecting the vars we just solved
      const solvedVars = new Set(bestCandidates.map(c => c.varName))
      for (let p = 0; p < 10; p++) {
        if (!propagateDerivedIn(temp, solvedVars)) break
      }

      // Accept if this satisfies the equation or doesn't increase violations
      const satisfiesCurrentEqn = checkEquationIn(eqn, temp).satisfied
      const violationsAfter = countViolationsIn(temp)

      if (satisfiesCurrentEqn || violationsAfter <= violationsBefore) {
        Object.assign(values, temp)
        madeAnyChange = true
      }
    }

    // Check if we're making overall progress
    const currentViolations = countViolations()
    if (currentViolations === 0) break  // All satisfied!
    if (!madeAnyChange) break  // No changes possible
    // if (currentViolations >= lastViolationCount && pass > 0) break  // Stuck
    lastViolationCount = currentViolations
  }

  return values
}

function eqnsSatisfied(eqns, values, tol = 1e-6) {
  for (const eqn of eqns) {
    if (eqn.length < 2) continue

    const results = eqn.map(e => {
      if (typeof e === 'number') return { value: e, error: null }
      return vareval(e, values)
    })

    if (results.some(r => r.error || !isFinite(r.value))) return false

    const first = results[0].value
    const tolerance = Math.abs(first) * tol + tol
    if (!results.every(r => Math.abs(r.value - first) < tolerance)) return false
  }

  return true
}

// =============================================================================
// Quals for solvem and friends (call from browser console: runQuals())
// =============================================================================

function runQuals() {
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

  console.log('=== vareval quals ===')
  check('vareval: simple arithmetic', vareval('2+3', {}).value, 5)
  check('vareval: implicit multiplication', vareval('2x', {x: 5}).value, 10)
  check('vareval: exponentiation', vareval('x^2', {x: 3}).value, 9)
  check('vareval: sqrt function', vareval('sqrt(16)', {}).value, 4)
  check('vareval: pi constant', vareval('2pi', {}).value, 2 * Math.PI)
  check('vareval: complex expression', vareval('a^2 + b^2', {a: 3, b: 4}).value, 25)

  console.log('\n=== toJavaScript quals ===')
  check('toJS: implicit mult', toJavaScript('2x'), '2*x')
  check('toJS: keeps var3 intact', toJavaScript('var3'), 'var3')
  check('toJS: power', toJavaScript('x^2').includes('Math.pow'), true)
  check('toJS: pi', toJavaScript('2pi'), '2*Math.PI')

  console.log('\n=== deoctalize quals ===')
  check('deoctalize: preserves 10', deoctalize('10'), '10')
  check('deoctalize: strips leading 0', deoctalize('010'), '10')
  check('deoctalize: preserves 100', deoctalize('100'), '100')
  check('deoctalize: preserves 1.05', deoctalize('1.05'), '1.05')

  console.log('\n=== solveFor quals ===')
  check('solveFor: linear', solveFor('2x', 'x', 10, {}), 5)
  check('solveFor: squared', solveFor('x^2', 'x', 25, {}), 5)
  check('solveFor: with other vars', solveFor('x + y', 'x', 10, {y: 3}), 7)

  console.log('\n=== solvem quals ===')
  check('solvem: simple equation',
    solvem([['x', 5]], {x: 1}),
    {x: 5})

  check('solvem: derived value',
    solvem([['x', 2], ['y', '3x']], {x: 1, y: 1}),
    {x: 2, y: 6})

  check('solvem: simultaneous equations',
    solvem([['2x+3y', 33], ['5x-4y', 2]], {x: 6, y: 0}),
    {x: 6, y: 7})

  check('solvem: Pythagorean triple propagation',
    solvem([['x', 1], ['a', '3x'], ['b', '4x'], ['c'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 1, b: 1, c: 1, v1: 1}),
    {x: 1, a: 3, b: 4, c: 5, v1: 25})

  check('solvem: chain propagation',
    solvem([['a', 2], ['b', 'a+1'], ['c', 'b+1']], {a: 1, b: 1, c: 1}),
    {a: 2, b: 3, c: 4})

  check('solvem: scaling factor',
    solvem([['x', 2], ['scaled', '10x']], {x: 1, scaled: 1}),
    {x: 2, scaled: 20})

  check('solvem: crepes eggs implies x',
    solvem([
      ['eggs', 24, '12x'],
      ['milk', '5.333x'],
      ['flour', '3x'],
    ], {x: 1, eggs: 12, milk: 5.333, flour: 3}),
    {x: 2, eggs: 24, milk: 10.666, flour: 6})

  check('solvem: frozen x makes eggs unsatisfiable',
    eqnsSatisfied(
      [['x', 1], ['eggs', '12x', 24]],
      solvem([['x', 1], ['eggs', '12x', 24]], {x: 1, eggs: 12})
    ),
    false)

  // Cheesepan-style constraint chain: A frozen, derive r and d
  // A = 1/2*tau*r^2 with A=63.585 => r=4.5
  // r = d/2 => d=9
  check('solvem: chain derivation from area to diameter',
    solvem([
      ['A', 63.585],                    // A frozen at 63.585
      ['r', 'd/2'],                     // r = d/2
      ['d'],                            // d is free
      ['_v', 'A', '1/2*6.28*r^2'],      // constraint: A = 1/2*tau*r^2
    ], {A: 63.585, r: 1, d: 1, _v: 1}, new Set(['A'])),
    {A: 63.585, r: 4.5, d: 9})

  // Cheesepan r1: transitive pinning with multi-expression constraint
  check('solvem: cheesepan r1 transitive derivation',
    solvem([
      ['d1', 9], ['r1', 'd1/2'], ['tau', 6.28], ['x', 1],
      ['r', 'd/2'], ['d'], ['A'],
      ['_v', 'A', '1/2*tau*r^2', '1/2*tau*r1^2*x'],
    ], {d1: 9, r1: 1, tau: 6.28, x: 1, r: 1, d: 1, A: 1, _v: 1}, new Set(['d1', 'tau', 'x'])),
    {d1: 9, r1: 4.5, tau: 6.28, x: 1, r: 4.5, d: 9, A: 63.585, _v: 63.585})

  console.log('\n=== Summary ===')
  console.log(`${results.passed} passed, ${results.failed} failed`)
  if (results.failed > 0) {
    console.log('Failed:', results.errors.join(', '))
  }

  return results.failed === 0 ? 'All quals passed!' : 'Some quals failed'
}

// Backward compatibility alias
const testSolvem = runQuals