// Maybe call this as part of preval?
function deoctalize(s) { return s.replace(/(?<![\w_\.])0+(\d)/g, '$1') }

// Convert Mathematica-style expression syntax to JavaScript.
// Supports: implicit multiplication (2x -> 2*x), ^ for exponentiation, math 
// functions, pi, etc.
function preval(expr) {
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
  // Does it not work to just do ^ -> ** ?
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
    const jsExpr = deoctalize(preval(expr))

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
// The solvem function takes a list of equations and a hash of variables with
// initial numerical assignments and returns a satisfying assignment of numeric
// values to the variables (or as close to one as it can get).
// An equation is a list of expressions taken to all be equal.
// An expression is a string that can be eval'd in JavaScript as a number, if 
// prefaced by an assignment of numbers to the variables it references. (See the
// vareval function, which does that. Also expressions support richer syntax
// than JavaScript and are passed through a preprocessor, preval, that converts
// them to valid JavaScript.)
// The variables are valid identifiers in JavaScript-like langages, like "x" or
// "a1" or "some_var".
// (There's a companion function, solved(), that takes the same arguments and 
// returns 0 if all the equations are satisfied by the given assignments. More
// generally it returns the residual -- a measure of how far the assignments are
// from satisfying the equations.)
// (Or maybe solvem should return both the closest solution it could find and
// the residual? Or maybe we don't ever need the residual and should rather
// return a list of booleans corresponding to which equations are satisfied?)
// Examples:
// solvem([['2x+3y', 33], ['5x-4y', 2]], {x: 6, y: 0}) returns {x: 6, y: 7}. 
// solvem([['x', 1], ['a', '3x'], ['b', '4x'], ['c'], ['v1', 'a^2+b^2', 'c^2']],
//        {x: 1, a: 1, b: 1, c: 1, v1: 1}) returns 
// {x: 1, a: 3, b: 4, c: 5, v1: 25}. 
// See also: Gaussian elimination, Mathematica's NSolve and NMinimize.
function solvem(eqns, vars) {
  const values = { ...vars }
  const tol = 1e-6

  function isSimpleVar(expr) {
    if (typeof expr !== 'string') return false
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(expr.trim())
  }

  function evalExpr(expr) {
    if (typeof expr === 'number') return { value: expr, error: null }
    return vareval(expr, values)
  }

  function isKnown(v) {
    return values[v] !== null && values[v] !== undefined
  }

  // Variables appearing with literal numbers are constrained
  const constrained = new Set()
  for (const eqn of eqns) {
    if (eqn.some(e => typeof e === 'number')) {
      for (const e of eqn) {
        if (isSimpleVar(e)) constrained.add(e)
      }
    }
  }

  // Singletons: variables with singleton equations like ['x']
  // Track their initial values - they're "stable" (usable in expressions) if unchanged
  const singletons = new Map()  // var -> initial value
  for (const eqn of eqns) {
    if (eqn.length === 1 && isSimpleVar(eqn[0]) && isKnown(eqn[0])) {
      singletons.set(eqn[0], values[eqn[0]])
    }
  }

  // Variables whose current values were derived from stable targets.
  // This is weaker than "trustworthy" (which is reserved for literal-constrained vars)
  // but strong enough to enable multi-step propagation.
  const stableDerived = new Set()

  // Helper: is a variable's value stable (trustworthy or unchanged singleton)?
  function isStable(v) {
    if (trustworthy.has(v)) return true
    if (stableDerived.has(v)) return true
    if (constrained.size === 0 && solvedThisPass.has(v)) return true
    if (singletons.has(v) && values[v] === singletons.get(v)) return true
    return false
  }

  function checkEquation(eqn) {
    if (eqn.length < 2) return true
    const results = eqn.map(evalExpr)
    if (results.some(r => r.error || !isFinite(r.value))) return false
    const first = results[0].value
    const tolerance = Math.abs(first) * tol + tol
    return results.every(r => Math.abs(r.value - first) < tolerance)
  }

  // trustworthy: variables with reliable values (derived from constraints)
  // solvedThisPass: variables solved during the current pass (for within-pass protection)
  const trustworthy = new Set(constrained)
  let solvedThisPass = new Set()

  // Find target value for an equation
  // Returns {value, isTrustworthy} or null if no target found
  // Priority: literals > trustworthy vars > trustworthy exprs > other exprs > simple vars
  function findTarget(eqn) {
    // First: literal numbers (always trustworthy)
    for (const expr of eqn) {
      if (typeof expr === 'number') return { value: expr, isTrustworthy: true, isStable: true, stableNonSingleton: true }
    }
    // Second: trustworthy, derived-stable, or just-solved simple variables
    for (const expr of eqn) {
      if (typeof expr === 'string' && isSimpleVar(expr) &&
          (trustworthy.has(expr) || stableDerived.has(expr) || solvedThisPass.has(expr))) {
        return { value: values[expr], isTrustworthy: trustworthy.has(expr), isStable: true, stableNonSingleton: true }
      }
    }
    // Third: expressions where ALL variables are stable (trustworthy, derived-stable, or unchanged singletons)
    // Prefer the most trustworthy stable expression rather than the first.
    let bestStable = null
    let bestStableScore = -1
    for (const expr of eqn) {
      if (typeof expr !== 'string' || isSimpleVar(expr)) continue

      const vars = findVariables(expr)
      if (vars.size === 0) continue
      if (![...vars].every(v => isStable(v))) continue

      // Avoid using targets that are only stable because of unchanged singleton seeds.
      // Those are useful as guesses but shouldn't drive other variables.
      const hasNonSingletonStable = [...vars].some(v => trustworthy.has(v) || stableDerived.has(v) || solvedThisPass.has(v))
      if (eqn.length > 2 && !hasNonSingletonStable) continue

      const r = evalExpr(expr)
      if (r.error || !isFinite(r.value) || r.value === null) continue

      const allTrustworthy = [...vars].every(v => trustworthy.has(v))
      const trustworthyCount = [...vars].filter(v => trustworthy.has(v)).length
      const score = (allTrustworthy ? 1000 : 0) + trustworthyCount

      if (score > bestStableScore) {
        bestStableScore = score
        bestStable = { value: r.value, isTrustworthy: allTrustworthy, isStable: true, stableNonSingleton: hasNonSingletonStable }
      }
    }
    if (bestStable !== null) return bestStable
    // Fourth: any evaluable complex expression (not trustworthy)
    for (const expr of eqn) {
      if (typeof expr === 'string' && !isSimpleVar(expr)) {
        const r = evalExpr(expr)
        if (!r.error && isFinite(r.value) && r.value !== null) {
          return { value: r.value, isTrustworthy: false, stableNonSingleton: false }
        }
      }
    }
    // Fifth: simple variables with known values (not trustworthy)
    for (const expr of eqn) {
      if (typeof expr === 'string' && isSimpleVar(expr) && isKnown(expr)) {
        return { value: values[expr], isTrustworthy: false, stableNonSingleton: false }
      }
    }
    return null
  }

  // Sort equations: literals first, then multi-element, then 2-element
  // Shorter equations first (after literals) to enable forward propagation.
  const sortedEqns = [...eqns].sort((a, b) => {
    const aHasLiteral = a.some(e => typeof e === 'number')
    const bHasLiteral = b.some(e => typeof e === 'number')
    if (aHasLiteral !== bHasLiteral) return aHasLiteral ? -1 : 1
    if (a.length !== b.length) return a.length - b.length
    return 0
  })

  // Main solving loop
  for (let pass = 0; pass < 20; pass++) {
    let changed = false
    solvedThisPass = new Set()  // Reset for this pass

    for (const eqn of sortedEqns) {
      if (checkEquation(eqn)) continue

      const targetResult = findTarget(eqn)
      if (targetResult === null) continue
      const { value: target, isTrustworthy, isStable: targetIsStable, stableNonSingleton: targetStableNonSingleton = false } = targetResult

      for (const expr of eqn) {
        if (typeof expr === 'number') continue

        // Simple variable: just set it to target (unless just solved)
        if (isSimpleVar(expr)) {
          if (constrained.has(expr) && isKnown(expr) && values[expr] !== target) {
            continue
          }
          if (!solvedThisPass.has(expr) && (!isKnown(expr) || values[expr] !== target)) {
            values[expr] = target
            changed = true
            solvedThisPass.add(expr)
            if (isTrustworthy) trustworthy.add(expr)
            if (targetIsStable && (isTrustworthy || targetStableNonSingleton || constrained.size === 0)) stableDerived.add(expr)
          }
          if (!solvedThisPass.has(expr) && targetIsStable && isKnown(expr) && values[expr] === target) {
            if (!stableDerived.has(expr)) {
              if (isTrustworthy || targetStableNonSingleton || constrained.size === 0) {
                stableDerived.add(expr)
                changed = true
              }
            }
          }
          continue
        }

        // Complex expression: find unknowns and solve
        const exprVars = findVariables(expr)
        const unknowns = [...exprVars].filter(v => !isKnown(v) && !constrained.has(v) && !solvedThisPass.has(v))

        if (unknowns.length === 1) {
          const solvedVal = solveFor(expr, unknowns[0], target, values)
          if (solvedVal !== null) {
            values[unknowns[0]] = solvedVal
            changed = true
            solvedThisPass.add(unknowns[0])
            if (isTrustworthy) trustworthy.add(unknowns[0])
            if (targetIsStable && (isTrustworthy || targetStableNonSingleton || constrained.size === 0)) stableDerived.add(unknowns[0])
          }
        } else if (unknowns.length === 0 && (isTrustworthy || targetIsStable)) {
          // All known but doesn't match - adjust if target is trustworthy or stable
          // Try each variable and pick the one that changes the least (preserves good initial guesses)
          let bestVar = null
          let bestVal = null
          let bestChange = Infinity
          for (const v of exprVars) {
            if (constrained.has(v) || solvedThisPass.has(v) || trustworthy.has(v)) continue
            const solvedVal = solveFor(expr, v, target, values)
            if (solvedVal !== null) {
              const change = Math.abs(solvedVal - values[v])
              if (change < bestChange) {
                bestChange = change
                bestVar = v
                bestVal = solvedVal
              }
            }
          }
          if (bestVar !== null) {
            values[bestVar] = bestVal
            changed = true
            solvedThisPass.add(bestVar)
            if (isTrustworthy) trustworthy.add(bestVar)
            if (targetIsStable && (isTrustworthy || targetStableNonSingleton || constrained.size === 0)) stableDerived.add(bestVar)
          }
        }
      }
    }

    if (!changed) break
  }

  // Fallback: if constraints not satisfied, try 1D search on "root" variables
  // Root variables: those that appear in 2-element "definition" equations like ['a', '3x']
  // where the other element is a simple var that's constrained or trustworthy
  const needsFallback = !eqnsSatisfied(eqns, values, tol)
  console.log('DEBUG: needsFallback:', needsFallback)
  if (needsFallback) {
    // Find root variables: appear in expressions but not constrained
    const definedBy = new Map()  // var -> expression that defines it
    for (const eqn of eqns) {
      if (eqn.length === 2) {
        const [e1, e2] = eqn
        // Pattern: ['a', '3x'] where a is simple var, 3x is expression
        if (isSimpleVar(e1) && typeof e2 === 'string' && !isSimpleVar(e2)) {
          const vars = findVariables(e2)
          console.log('DEBUG: checking', e1, '=', e2, '-> vars:', [...vars], 'constrained:', constrained.has(e1))
          if (vars.size === 1) {
            const root = [...vars][0]
            if (!constrained.has(root) && !constrained.has(e1)) {
              definedBy.set(e1, { expr: e2, root })
              console.log('DEBUG: added', e1, 'defined by', e2, 'root:', root)
            }
          }
        }
        if (isSimpleVar(e2) && typeof e1 === 'string' && !isSimpleVar(e1)) {
          const vars = findVariables(e1)
          if (vars.size === 1) {
            const root = [...vars][0]
            if (!constrained.has(root) && !constrained.has(e2)) {
              definedBy.set(e2, { expr: e1, root })
            }
          }
        }
      }
    }

    // Find root variables that multiple definitions depend on
    const rootCounts = new Map()
    for (const { root } of definedBy.values()) {
      rootCounts.set(root, (rootCounts.get(root) || 0) + 1)
    }
    console.log('DEBUG: rootCounts:', [...rootCounts.entries()])

    // Try binary search on roots that affect multiple variables
    for (const [root, count] of rootCounts) {
      console.log('DEBUG: trying root', root, 'count:', count)
      if (count < 2) continue  // Only search if root affects multiple vars

      // Binary search on root
      let lo = 0.001, hi = 1000
      for (let iter = 0; iter < 50; iter++) {
        const mid = (lo + hi) / 2
        const testValues = { ...values, [root]: mid }

        // Propagate through definitions
        for (const [v, { expr }] of definedBy) {
          const r = vareval(expr, testValues)
          if (!r.error && isFinite(r.value)) {
            testValues[v] = r.value
          }
        }

        if (iter < 3 || (mid > 9.9 && mid < 10.1)) console.log('DEBUG: iter', iter, 'mid:', mid.toFixed(4), 'test:', {x: testValues.x?.toFixed(2), a: testValues.a?.toFixed(2), b: testValues.b?.toFixed(2), c: testValues.c, v1: testValues.v1})

        // Check if constraints are satisfied
        if (eqnsSatisfied(eqns, testValues, tol)) {
          console.log('DEBUG: Found solution at iter', iter)
          Object.assign(values, testValues)
          break
        }

        // Compute residual to guide search
        let residual = 0
        for (const eqn of eqns) {
          if (eqn.length < 2) continue
          const results = eqn.map(e => {
            if (typeof e === 'number') return e
            const r = vareval(e, testValues)
            return r.error ? NaN : r.value
          })
          if (results.some(r => !isFinite(r))) continue
          const target = results.find(r => isFinite(r))
          for (const r of results) {
            residual += (r - target) ** 2
          }
        }

        // Try to determine search direction (this is a heuristic)
        // Use an additive probe so we don't jump across a nearby optimum.
        const probeDelta = (hi - lo) * 1e-4 + 1e-6
        const testHi = { ...values, [root]: mid + probeDelta }
        for (const [v, { expr }] of definedBy) {
          const r = vareval(expr, testHi)
          if (!r.error && isFinite(r.value)) testHi[v] = r.value
        }
        let residualHi = 0
        for (const eqn of eqns) {
          if (eqn.length < 2) continue
          const results = eqn.map(e => {
            if (typeof e === 'number') return e
            const r = vareval(e, testHi)
            return r.error ? NaN : r.value
          })
          if (results.some(r => !isFinite(r))) continue
          const target = results.find(r => isFinite(r))
          for (const r of results) residualHi += (r - target) ** 2
        }

        if (residualHi < residual) {
          lo = mid
        } else {
          hi = mid
        }
      }
    }
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

  console.log('\n=== preval quals ===')
  check('toJS: implicit mult', preval('2x'), '2*x')
  check('toJS: keeps var3 intact', preval('var3'), 'var3')
  check('toJS: power', preval('x^2').includes('Math.pow'), true)
  check('toJS: pi', preval('2pi'), '2*Math.PI')
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

  // Pyzza: scaling Pythagorean triple by changing one side
  check('solvem: pyzza change a to 30',
    solvem([['a', 30], ['a', '3x'], ['b', '4x'], ['c'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 30, b: 1, c: 1, v1: 1}),
    {x: 10, a: 30, b: 40, c: 50, v1: 2500})

  check('solvem: pyzza change b to 40',
    solvem([['b', 40], ['a', '3x'], ['b', '4x'], ['c'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 1, b: 40, c: 1, v1: 1}),
    {x: 10, a: 30, b: 40, c: 50, v1: 2500})

  check('solvem: pyzza change c to 50',
    solvem([['c', 50], ['a', '3x'], ['b', '4x'], ['c'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 1, b: 1, c: 50, v1: 1}),
    {x: 10, a: 30, b: 40, c: 50, v1: 2500})

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
    ], {A: 63.585, r: 1, d: 1, _v: 1}),
    {A: 63.585, r: 4.5, d: 9})

  // Cheesepan r1: multi-expression constraint
  check('solvem: cheesepan r1 derivation',
    solvem([
      ['d1', 9], ['r1', 'd1/2'], ['tau', 6.28], ['x', 1],
      ['r', 'd/2'], ['d'], ['A'],
      ['_v', 'A', '1/2*tau*r^2', '1/2*tau*r1^2*x'],
    ], {d1: 9, r1: 1, tau: 6.28, x: 1, r: 1, d: 1, A: 1, _v: 1}),
    {d1: 9, r1: 4.5, tau: 6.28, x: 1, r: 4.5, d: 9, A: 63.585, _v: 63.585})

  // Same but x has no literal in its equation
  check('solvem: cheesepan r1 with x not frozen',
    solvem([
      ['d1', 9], ['r1', 'd1/2'], ['tau', 6.28], ['x'],
      ['r', 'd/2'], ['d'], ['A'],
      ['_v', 'A', '1/2*tau*r^2', '1/2*tau*r1^2*x'],
    ], {d1: 9, r1: 1, tau: 6.28, x: 1, r: 1, d: 1, A: 1, _v: 1}),
    {d1: 9, r1: 4.5, tau: 6.28, x: 1, r: 4.5, d: 9, A: 63.585, _v: 63.585})

  // {d = 2r} and {r = d/2} should be equivalent
  check('solvem: r=d/2 derives r from d',
    solvem([['d', 10], ['r', 'd/2']], {d: 10, r: 1}),
    {d: 10, r: 5})

  check('solvem: d=2r derives d from r',
    solvem([['r', 5], ['d', '2*r']], {d: 1, r: 5}),
    {d: 10, r: 5})

  // Having BOTH should also work and be consistent
  check('solvem: both r=d/2 and d=2r with d frozen',
    solvem([['d', 10], ['r', 'd/2'], ['_v', 'd', '2*r']], {d: 10, r: 1, _v: 1}),
    {d: 10, r: 5})

  check('solvem: both r=d/2 and d=2r with r frozen',
    solvem([['r', 5], ['d', '2*r'], ['_v', 'd/2', 'r']], {d: 1, r: 5, _v: 1}),
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
         y: null }),
    { var01: 6,
      var02: 7,
      var03: 33,
      var04: 6,
      var05: 7,
      var06: 2,
      x: 6,
      y: 7 })


  console.log('\n=== Summary ===')
  console.log(`${results.passed} passed, ${results.failed} failed`)
  if (results.failed > 0) {
    console.log('Failed:', results.errors.join(', '))
  }

  return results.failed === 0 ? 'All quals passed!' : 'Some quals failed'
}

// Backward compatibility alias
const testSolvem = runQuals