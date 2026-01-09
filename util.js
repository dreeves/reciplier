// Maybe call this as part of preval?
function deoctalize(s) { return s.replace(/(?<![\w_\.])0+(\d)/g, '$1') }

// Preprocess a math expression string so we can eval it as JavaScript.
// This includes implicit multiplication, like "2x" -> "2*x", exponentiation 
// with ^, and all the standard functions like sqrt, sin, cos, etc, which 
// JavaScript needs to have "Math." prepended to.
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
  //js = js.replace(/\bpi\b/gi, 'Math.PI')

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

// Eval a math expression (after preprocessing with preval) using the given 
// assignments of variables. E.g., vareval('2x+y', {x: 3, y: 1}) returns 7.
// If the eval fails to return a number, it returns null. TODO
function vareval(expr, vars) {
  try {
    const jsExpr = deoctalize(preval(expr))

    // Build variable assignments
    const assignments = Object.entries(vars)
      .map(([name, val]) => {
        // Important: null/undefined should behave like unknowns, not like 0.
        // In JS arithmetic, null coerces to 0 (eg, 3*null === 0), which can
        // silently collapse solutions during interactive edits.
        const jsVal = (val === null || val === undefined) ? 'NaN' : String(val)
        return `const ${name} = ${jsVal};`
      })
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

// TODO: DRY this up vs preval
const RESERVED_WORDS = new Set(['sqrt', 'floor', 'ceil', 'round', 'min', 'max',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'exp', 'abs'])

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
// initial numerical assignments and tries to find a satisfying assignment of
// numeric values to the variables.
// * An equation is a list of one or more expressions taken to all be equal.
// * An expression is a string that can be eval'd in JavaScript to a number, if 
// prefaced by an assignment of numbers to the variables it references. 
// (The vareval function does that eval. Also expressions support richer syntax
// than JavaScript and are passed through a preprocessor, preval, that converts
// them to valid JavaScript.)
// * The variables are strings that are valid identifiers in JavaScript-like 
// langages, like "x" or "a1" or "some_var".
// This function returns an object with 3 fields:
// * ass: A hash of variable names with their solved numeric values (an 
// assignment)
// * zij: (Pronounced "zidge") An array of sum-of-squared-residual-errors, 
// corresponding to each equation. If we say that, using assignment ass, the 
// expressions in an equation eval to values [v1, ..., vn] and that m is the
// mean of those values, then the differences between the vi's and m are the 
// residuals. Square the residuals and sum them and that's the zij entry for
// that equation. If zij is all zeros then ass is a valid assignment satisfying
// all the constraints.
// * sat: A boolean saying whether every entry in zij is zero, i.e., whether ass
// is a satisfying assignment.
// Examples:
// 1. solvem([['a', '2b']], {a: null, b: null})
// returns {ass: {a: 1, b: 0.5}, zij: [0], sat: true}
// 2. solvem([['a+b', 8], ['a', 3], ['b', 4], ['c']], {a: null, b: null, c: 0})
// returns {ass: {a: 3, b: 4, c: 0}, zij: [1, 0, 0, 0], sat: false}
// 3. solvem([['2x+3y', 33], ['5x-4y', 2]], {x: 6, y: 0}) returns 
// {ass: {x: 6, y: 7}, zij: [0, 0], sat: true}
// 4. solvem([['x', 1], ['a', '3x'], ['b', '4x'], ['v1', 'a^2+b^2', 'c^2']],
// returns {x: 1, a: 1, b: 1, c: 1, v1: 1}) returns 
// {ass: {x: 1, a: 3, b: 4, c: 5, v1: 25}, zij: [0, 0], sat: true}
// See also: Gaussian elimination, Mathematica's NSolve and NMinimize.
function solvem(eqns, vars) {
  const required = new Set()
  for (const eqn of eqns) {
    for (const term of eqn) {
      if (typeof term === 'number') continue
      if (typeof term !== 'string') continue
      const t = term.trim()
      if (t === '') continue
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t)) {
        required.add(t)
      }
      for (const v of findVariables(t)) required.add(v)
    }
  }
  const missing = [...required].filter(v => !Object.prototype.hasOwnProperty.call(vars, v))
  if (missing.length > 0) {
    throw new Error(`solvem: missing initial vars: ${missing.sort().join(', ')}`)
  }

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

  // Literal pins: if a variable appears in an equation with a number, treat it
  // as pinned to the first such literal encountered.
  const literalPinned = new Map() // var -> pinned numeric value
  for (const eqn of eqns) {
    const n = eqn.find(e => typeof e === 'number')
    if (typeof n !== 'number') continue
    for (const e of eqn) {
      if (isSimpleVar(e) && !literalPinned.has(e)) {
        literalPinned.set(e, n)
      }
    }
  }
  for (const [v, n] of literalPinned) {
    values[v] = n
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
    // Fourth: simple variables with known values (not trustworthy)
    for (const expr of eqn) {
      if (typeof expr === 'string' && isSimpleVar(expr) && isKnown(expr)) {
        return { value: values[expr], isTrustworthy: false, stableNonSingleton: false }
      }
    }
    // Fifth: any evaluable complex expression (not trustworthy)
    for (const expr of eqn) {
      if (typeof expr === 'string' && !isSimpleVar(expr)) {
        const r = evalExpr(expr)
        if (!r.error && isFinite(r.value) && r.value !== null) {
          return { value: r.value, isTrustworthy: false, stableNonSingleton: false }
        }
      }
    }

    // Last resort: totally underconstrained equation with no evaluable target.
    // Pick a conventional target of 1 to allow propagation (eg, a = 2b).
    if (constrained.size === 0 && eqn.some(e => typeof e === 'string' && isSimpleVar(e))) {
      return { value: 1, isTrustworthy: false, stableNonSingleton: false }
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

      const eqnHasLiteral = eqn.some(e => typeof e === 'number')

      const targetResult = findTarget(eqn)
      if (targetResult === null) continue
      const { value: target, isTrustworthy, isStable: targetIsStable, stableNonSingleton: targetStableNonSingleton = false } = targetResult

      for (const expr of eqn) {
        if (typeof expr === 'number') continue

        // Simple variable: just set it to target (unless just solved)
        if (isSimpleVar(expr)) {
          if (literalPinned.has(expr)) continue
          if (!eqnHasLiteral && constrained.has(expr) && isKnown(expr) && values[expr] !== target) {
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
          // Special-case: if the expression is a simple product of two free variables (like w*h),
          // scale both together to preserve their ratio.
          if (exprVars.size === 2) {
            const vars2 = [...exprVars]
            const a = vars2[0]
            const b = vars2[1]
            const compact = expr.replace(/\s+/g, '')
            if (compact === `${a}*${b}` || compact === `${b}*${a}`) {
              if (!constrained.has(a) && !constrained.has(b) &&
                  !solvedThisPass.has(a) && !solvedThisPass.has(b) &&
                  !trustworthy.has(a) && !trustworthy.has(b)) {
                const aVal = values[a]
                const bVal = values[b]
                if (isFinite(aVal) && isFinite(bVal) && isFinite(target) && target > 0) {
                  const current = aVal * bVal
                  let newA = null
                  let newB = null

                  if (current === 0) {
                    const root = Math.sqrt(target)
                    newA = root
                    newB = root
                  } else {
                    const scale = Math.sqrt(target / current)
                    if (isFinite(scale) && scale > 0) {
                      newA = aVal * scale
                      newB = bVal * scale
                    }
                  }

                  if (newA !== null && newB !== null) {
                    values[a] = newA
                    values[b] = newB
                    changed = true
                    solvedThisPass.add(a)
                    solvedThisPass.add(b)
                    if (isTrustworthy) {
                      trustworthy.add(a)
                      trustworthy.add(b)
                    }
                    if (targetIsStable && (isTrustworthy || targetStableNonSingleton || constrained.size === 0)) {
                      stableDerived.add(a)
                      stableDerived.add(b)
                    }
                    continue
                  }
                }
              }
            }
          }

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
    const copies = []            // list of [dest, src] for simple-var aliases like ['_var001','a']
    for (const eqn of eqns) {
      if (eqn.length === 2) {
        const [e1, e2] = eqn
        // Pattern: ['_var001', 'a'] where both are simple vars.
        // Treat as a definition in the given direction (e1 follows e2).
        if (isSimpleVar(e1) && isSimpleVar(e2)) {
          copies.push([e1, e2])
        }
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

        // Propagate simple-var aliases (eg, _var001 = a)
        for (const [dest, src] of copies) {
          const v = testValues[src]
          if (isFinite(v)) {
            testValues[dest] = v
          }
        }

        // Propagate equation heads: if eqn[0] is a (non-root, non-constrained)
        // simple var, set it to any finite RHS value we can evaluate.
        for (const eqn of eqns) {
          if (eqn.length < 2) continue
          const head = eqn[0]
          if (typeof head !== 'string' || !isSimpleVar(head)) continue
          if (head === root) continue
          if (constrained.has(head)) continue

          let bestVal = null
          let bestScore = -1
          for (let i = 1; i < eqn.length; i++) {
            const e = eqn[i]
            if (typeof e === 'number') {
              bestVal = e
              bestScore = 2
              break
            }

            const r = vareval(e, testValues)
            if (r.error || !isFinite(r.value)) continue

            const vars = findVariables(e)
            const constrainedOnly = [...vars].every(v => constrained.has(v))
            const score = constrainedOnly ? 1 : 0

            if (score > bestScore) {
              bestScore = score
              bestVal = r.value
            }
          }
          if (bestVal !== null) {
            testValues[head] = bestVal
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

        // Mirror the same propagation we do for testValues
        for (const [dest, src] of copies) {
          const v = testHi[src]
          if (isFinite(v)) {
            testHi[dest] = v
          }
        }
        for (const eqn of eqns) {
          if (eqn.length < 2) continue
          const head = eqn[0]
          if (typeof head !== 'string' || !isSimpleVar(head)) continue
          if (head === root) continue
          if (constrained.has(head)) continue

          let bestVal = null
          let bestScore = -1
          for (let i = 1; i < eqn.length; i++) {
            const e = eqn[i]
            if (typeof e === 'number') {
              bestVal = e
              bestScore = 2
              break
            }

            const r = vareval(e, testHi)
            if (r.error || !isFinite(r.value)) continue

            const vars = findVariables(e)
            const constrainedOnly = [...vars].every(v => constrained.has(v))
            const score = constrainedOnly ? 1 : 0

            if (score > bestScore) {
              bestScore = score
              bestVal = r.value
            }
          }
          if (bestVal !== null) {
            testHi[head] = bestVal
          }
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
  //check('vareval: pi constant', vareval('2pi', {}).value, 2 * Math.PI)
  check('vareval: complex expression', vareval('a^2 + b^2', {a: 3, b: 4}).value, 25)

  console.log('\n=== preval quals ===')
  check('toJS: implicit mult', preval('2x'), '2*x')
  check('toJS: keeps var3 intact', preval('var3'), 'var3')
  check('toJS: power', preval('x^2').includes('Math.pow'), true)
  //check('toJS: pi', preval('2pi'), '2*Math.PI')
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

  function zidge(eqns, ass) {
    return eqns.map(eqn => {
      if (eqn.length < 2) return 0
      const vals = eqn.map(e => {
        if (typeof e === 'number') return e
        const r = vareval(e, ass)
        return (r.error || !isFinite(r.value)) ? NaN : r.value
      })
      if (vals.some(v => !isFinite(v))) return NaN
      const m = vals.reduce((a, b) => a + b, 0) / vals.length
      return vals.reduce((s, v) => s + (v - m) ** 2, 0)
    })
  }

  function solvemReport(eqns, init) {
    const ass = solvem(eqns, init)
    return { ass, zij: zidge(eqns, ass), sat: eqnsSatisfied(eqns, ass) }
  }

  // README example 1
  check('solvem: README #1 (a=2b assignment)',
    solvem([['a', '2b']], {a: null, b: null}),
    {a: 1, b: 0.5})
  check('solvem: README #1 (sat)',
    solvemReport([['a', '2b']], {a: null, b: null}).sat,
    true)

  // README example 2
  check('solvem: README #2 (assignment)',
    solvem([['a+b', 8], ['a', 3], ['b', 4], ['c']], {a: null, b: null, c: 0}),
    {a: 3, b: 4, c: 0})
  ;(() => {
    const eqns = [['a+b', 8], ['a', 3], ['b', 4], ['c']]
    const rep = solvemReport(eqns, {a: null, b: null, c: 0})
    check('solvem: README #2 (sat)', rep.sat, false)
    check('solvem: README #2 (zij[0] nonzero)', rep.zij[0] > 0, true)
    check('solvem: README #2 (zij[1..] zero)', rep.zij.slice(1).every(z => z === 0), true)
  })()
  check('solvem: simple equation',
    solvem([['x', 5]], {x: 1}),
    {x: 5})

  check('solvem: derived value',
    solvem([['x', 2], ['y', '3x']], {x: 1, y: 1}),
    {x: 2, y: 6})

  check('solvem: simultaneous equations',
    solvem([['2x+3y', 33], ['5x-4y', 2]], {x: 6, y: 0}),
    {x: 6, y: 7})

  // README example 3
  check('solvem: README #3 (sat)',
    solvemReport([['2x+3y', 33], ['5x-4y', 2]], {x: 6, y: 0}).sat,
    true)

  check('solvem: Pythagorean triple propagation',
    solvem([['x', 1], ['a', '3x'], ['b', '4x'], ['c'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 1, b: 1, c: 1, v1: 1}),
    {x: 1, a: 3, b: 4, c: 5, v1: 25})

  // README example 4
  check('solvem: README #4 (sat)',
    solvemReport([['x', 1], ['a', '3x'], ['b', '4x'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 1, b: 1, c: 1, v1: 1}).sat,
    true)

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

  // UI-style Pyzza system: includes nonce variables for display-only cells.
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
    const rep = solvemReport(eqns, {
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

  check('solvem: prefers explicit initial guess',
    solvem([['a+b', 8]], {a: 4, b: null}),
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

  check('solvem: Mixed Nulls & Propagation',
    solvem([ ['var01', 'x'],
             ['var02', 'y'],
             ['var03', 33, '2*x + 3*y'],
             ['var04', 'x'],
             ['var05', 'y'],
             ['var06', 2, '5*x - 4*y'] ],
      {var01: 6, var02: null, var03: 33, var04: null, var05: null, var06: 2, x: null, y: null}),
    {var01: 6, var02: 7, x: 6, y: 7})

  check('solvem: Pythagorean Chain',
    solvem([['x', 1], ['a', '3x'], ['b', '4x'], ['c'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 1, b: 1, c: 1, v1: 1}),
    {x: 1, a: 3, b: 4, c: 5, v1: 25})

  check('solvem: Pyzza: A=30',
    solvem([['a', 30], ['a', '3x'], ['b', '4x'], ['c'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 30, b: 1, c: 1, v1: 1}),
    {x: 10, a: 30, b: 40, c: 50, v1: 2500})

  check('solvem: Pyzza: B=40',
    solvem([['b', 40], ['a', '3x'], ['b', '4x'], ['c'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 1, b: 40, c: 1, v1: 1}),
    {x: 10, a: 30, b: 40, c: 50, v1: 2500})

  check('solvem: Pyzza: C=50',
    solvem([['c', 50], ['a', '3x'], ['b', '4x'], ['c'], ['v1', 'a^2+b^2', 'c^2']],
      {x: 1, a: 1, b: 1, c: 50, v1: 1}),
    {x: 10, a: 30, b: 40, c: 50, v1: 2500})

  check('solvem: Impossible Conflict (Pinned)',
    solvem([['sum', 'x+y'], ['sum', 10], ['sum', 20]], {x: 0, y: 0, sum: 0}),
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
  })

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


  console.log('\n=== Summary ===')
  console.log(`${results.passed} passed, ${results.failed} failed`)
  if (results.failed > 0) {
    console.log('Failed:', results.errors.join(', '))
  }

  return results.failed === 0 ? 'All quals passed!' : 'Some quals failed'
}

// Backward compatibility alias
const testSolvem = runQuals