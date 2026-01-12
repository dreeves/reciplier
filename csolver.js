// csolver.js - Constraint Solver for Reciplier
// See README.md for the spec of this interface.

// =============================================================================
// preval: Preprocess a math expression string so we can eval it as JavaScript
// =============================================================================
// Supports implicit multiplication (2x → 2*x), exponentiation (^), and
// standard math functions (sqrt, sin, cos, etc).

function deoctalize(s) { return s.replace(/(?<![\w_\.])0+(\d)/g, '$1') }

function preval(expr) {
  if (typeof expr !== 'string' || expr.trim() === '') {
    throw new Error(`Invalid expression: ${String(expr)}`)
  }

  let js = expr

  // Implicit multiplication: number followed by letter (but not inside identifiers)
  // 2x -> 2*x, but b3h stays b3h
  js = js.replace(/(?<![a-zA-Z_])(\d+\.?\d*)([a-zA-Z_])/g, '$1*$2')

  // Math functions
  js = js.replace(/\b(sqrt|floor|ceil|round|min|max|sin|cos|tan|asin|acos|atan|log|exp|abs)\s*\(/g, 'Math.$1(')

  // Exponentiation: x^2 -> Math.pow(x,2)
  for (let i = 0; i < 10; i++) {
    const before = js
    js = js.replace(/(\w+|\d+\.?\d*|\))\s*\^\s*(\w+|\d+\.?\d*|\([^()]*\))/g,
      (_, base, exp) => `Math.pow(${base},${exp})`)
    if (js === before) break
  }

  return js
}

// =============================================================================
// vareval: Evaluate a math expression with given variable assignments
// =============================================================================
// Returns {value, error} where value is the result or null on error.

function unixtime(y, m, d) {
  const yy = Number(y)
  const mm = Number(m)
  const dd = Number(d)

  if (!Number.isInteger(yy)) throw new Error(`unixtime: invalid year: ${String(y)}`)
  if (!Number.isInteger(mm) || mm < 1 || mm > 12) throw new Error(`unixtime: invalid month: ${String(m)}`)
  if (!Number.isInteger(dd) || dd < 1 || dd > 31) throw new Error(`unixtime: invalid day: ${String(d)}`)

  const ms = Date.UTC(yy, mm - 1, dd)
  if (!Number.isFinite(ms)) throw new Error(`unixtime: invalid date: ${yy}-${mm}-${dd}`)
  return ms / 1000
}

function vareval(expr, vars) {
  try {
    const jsExpr = deoctalize(preval(expr))

    // Build variable assignments
    const assignments = Object.entries(vars)
      .map(([name, val]) => {
        // null/undefined should behave like unknowns, not like 0.
        const jsVal = (val === null || val === undefined) ? 'NaN' : String(val)
        return `const ${name} = ${jsVal};`
      })
      .join('\n')

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
// varparse: Extract variable names from an expression
// =============================================================================

const RESERVED_WORDS = new Set(['sqrt', 'floor', 'ceil', 'round', 'min', 'max',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'exp', 'abs',
  'unixtime'])

function findVariables(expr) {
  if (typeof expr !== 'string' || expr.trim() === '') return new Set()
  const matches = expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || []
  return new Set(matches.filter(v => !RESERVED_WORDS.has(v)))
}

function varparse(expr) {
  return [...findVariables(expr)].sort()
}

// =============================================================================
// isconstant: Check if an expression evaluates to a number (no variables)
// =============================================================================

function isconstant(expr) {
  const r = vareval(expr, {})
  return !r.error && typeof r.value === 'number' && isFinite(r.value)
}

// =============================================================================
// solveFor: Solve for a single variable to make expr equal target
// =============================================================================

function solveFor(expr, varName, target, values) {
  const test = { ...values }
  const tol = Math.abs(target) * 1e-9 + 1e-9

  function evalAt(x) {
    test[varName] = x
    const r = vareval(expr, test)
    if (r.error || !isFinite(r.value)) return null
    return r.value
  }

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
    target,
    Math.sqrt(Math.abs(target)),
    -Math.sqrt(Math.abs(target)),
    Math.cbrt(target),
    1, 0, -1,
    target / 2, target * 2,
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
  let lo = null
  let hi = null

  function tryBracket(loCandidate, hiCandidate) {
    if (loCandidate < 0 && hiCandidate > 0) {
      const z = evalAt(0)
      if (z === null) return false
    }
    const loVal = evalAt(loCandidate)
    const hiVal = evalAt(hiCandidate)
    if (loVal === null || hiVal === null) return false
    const a = loVal - target
    const b = hiVal - target
    if (!isFinite(a) || !isFinite(b)) return false
    if (a === 0) { lo = loCandidate; hi = loCandidate; return true }
    if (b === 0) { lo = hiCandidate; hi = hiCandidate; return true }
    if (a * b <= 0) { lo = loCandidate; hi = hiCandidate; return true }
    return false
  }

  for (let scale = 1; scale < 1e10; scale *= 10) {
    if (tryBracket(1e-9, scale)) break
    if (tryBracket(-scale, -1e-9)) break
    if (tryBracket(-scale, scale)) break
  }

  // Expand bracket around current value for discontinuities
  if (lo === null || hi === null) {
    const x0 = values[varName]
    const y0 = (typeof x0 === 'number' && isFinite(x0)) ? evalAt(x0) : null
    if (y0 !== null) {
      const f0 = y0 - target
      const scales = []
      for (let decade = 1; decade < 1e12; decade *= 10) {
        for (const mult of [1, 1.5, 2, 3, 5, 7]) {
          scales.push(decade * mult)
        }
      }

      const lastValid = { [-1]: null, [1]: null }
      const discontinuityRanges = []

      for (const scale of scales) {
        let bestLo = null
        let bestHi = null
        for (const dir of [-1, 1]) {
          const x1 = x0 + dir * scale
          const y1 = evalAt(x1)
          if (y1 === null) continue
          const f1 = y1 - target
          if (!isFinite(f1)) continue

          if (f0 * f1 <= 0) {
            const candidateLo = Math.min(x0, x1)
            const candidateHi = Math.max(x0, x1)
            if (bestLo === null || (candidateHi - candidateLo) < (bestHi - bestLo)) {
              bestLo = candidateLo
              bestHi = candidateHi
            }
          }

          if (lastValid[dir] !== null && lastValid[dir].f * f1 < 0) {
            const candidateLo = Math.min(lastValid[dir].x, x1)
            const candidateHi = Math.max(lastValid[dir].x, x1)
            if (bestLo === null || (candidateHi - candidateLo) < (bestHi - bestLo)) {
              bestLo = candidateLo
              bestHi = candidateHi
            }
          }

          if (lastValid[dir] !== null && lastValid[dir].y * y1 < 0) {
            discontinuityRanges.push([lastValid[dir].x, x1])
          }

          lastValid[dir] = { x: x1, y: y1, f: f1 }
        }
        if (bestLo !== null) {
          lo = bestLo
          hi = bestHi
          break
        }
      }

      // Search finely near discontinuities
      if (lo === null && discontinuityRanges.length > 0) {
        for (const [rangeA, rangeB] of discontinuityRanges) {
          const rangeLo = Math.min(rangeA, rangeB)
          const rangeHi = Math.max(rangeA, rangeB)
          let searchLo = rangeLo
          let searchHi = rangeHi
          for (let i = 0; i < 30; i++) {
            const mid = (searchLo + searchHi) / 2
            const midVal = evalAt(mid)
            if (midVal === null || !isFinite(midVal)) {
              if (y0 < 0) searchHi = mid
              else searchLo = mid
              continue
            }
            const loVal = evalAt(searchLo)
            if (loVal === null || !isFinite(loVal)) {
              searchLo = mid
              continue
            }
            if (loVal * midVal < 0) searchHi = mid
            else searchLo = mid
          }
          const nearDiscont = (Math.abs(searchLo - x0) < Math.abs(searchHi - x0)) ? searchLo : searchHi
          const nearVal = evalAt(nearDiscont)
          if (nearVal !== null && isFinite(nearVal)) {
            const nearF = nearVal - target
            if (f0 * nearF <= 0) {
              lo = Math.min(x0, nearDiscont)
              hi = Math.max(x0, nearDiscont)
              break
            }
          }
        }
      }
    }
  }

  if (lo === null || hi === null) return null

  // Binary search
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    const midVal = evalAt(mid)
    if (midVal === null) return null
    const loVal = evalAt(lo)
    if (loVal === null) return null
    if ((loVal - target) * (midVal - target) > 0) lo = mid
    else hi = mid
  }

  const finalVal = (lo + hi) / 2
  const finalValRes = evalAt(finalVal)
  if (finalValRes === null || Math.abs(finalValRes - target) > Math.abs(target) * 0.01 + 0.01) {
    return null
  }
  const rounded = Math.round(finalVal)
  if (Math.abs(finalVal) >= 1 && Math.abs(finalVal - rounded) < 1e-4) {
    const roundedRes = evalAt(rounded)
    if (roundedRes !== null && Math.abs(roundedRes - target) < tol) {
      return rounded
    }
  }
  return finalVal
}

// =============================================================================
// eqnsSatisfied: Check if all equations are satisfied by given values
// =============================================================================

function eqnsSatisfied(eqns, values, tol = 1e-6) {
  const absTol = 1e-12
  for (const eqn of eqns) {
    if (eqn.length < 2) continue
    const results = eqn.map(e => {
      if (typeof e === 'number') return { value: e, error: null }
      return vareval(e, values)
    })
    if (results.some(r => r.error || !isFinite(r.value))) return false
    const first = results[0].value
    const tolerance = Math.abs(first) * tol + absTol
    if (!results.every(r => Math.abs(r.value - first) < tolerance)) return false
  }
  return true
}

// =============================================================================
// zidge: Compute sum-of-squared-residuals for each equation
// =============================================================================

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

// =============================================================================
// solvemPrimary: The main algebraic/propagation-based solver
// =============================================================================

function solvemPrimary(eqns, vars) {
  const required = new Set()
  for (const eqn of eqns) {
    for (const term of eqn) {
      if (typeof term === 'number') continue
      if (typeof term !== 'string') continue
      const t = term.trim()
      if (t === '') continue
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t)) required.add(t)
      for (const v of findVariables(t)) required.add(v)
    }
  }
  const missing = [...required].filter(v => !Object.prototype.hasOwnProperty.call(vars, v))
  if (missing.length > 0) {
    throw new Error(`solvem: missing initial vars: ${missing.sort().join(', ')}`)
  }

  const values = { ...vars }
  const tol = 1e-6
  const absTol = 1e-12

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

  const usesAsInput = new Map()
  for (const eqn of eqns) {
    for (let i = 0; i < eqn.length; i++) {
      const term = eqn[i]
      if (typeof term !== 'string') continue
      const t = term.trim()
      if (t === '') continue
      if (i === 0 && isSimpleVar(t)) continue
      for (const v of findVariables(t)) {
        usesAsInput.set(v, (usesAsInput.get(v) || 0) + 1)
      }
    }
  }

  // Literal pins
  const literalPinned = new Map()
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

  // Singletons
  const singletons = new Map()
  for (const eqn of eqns) {
    if (eqn.length === 1 && isSimpleVar(eqn[0]) && isKnown(eqn[0])) {
      singletons.set(eqn[0], values[eqn[0]])
    }
  }

  const stableDerived = new Set()

  const trustworthy = new Set(constrained)
  let solvedThisPass = new Set()
  let solvedFromStableThisPass = new Set()

  function isStable(v) {
    if (trustworthy.has(v)) return true
    if (stableDerived.has(v)) return true
    if (solvedFromStableThisPass.has(v)) return true
    if (singletons.has(v) && values[v] === singletons.get(v)) return true
    return false
  }

  function checkEquation(eqn) {
    if (eqn.length < 2) return true
    const results = eqn.map(evalExpr)
    if (results.some(r => r.error || !isFinite(r.value))) return false
    const first = results[0].value
    const tolerance = Math.abs(first) * tol + absTol
    return results.every(r => Math.abs(r.value - first) < tolerance)
  }

  function unixtimeArgs(expr) {
    if (typeof expr !== 'string') return null
    const m = expr.match(/\bunixtime\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*,\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*,\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)\s*$/)
    if (!m) return null
    return { y: m[1], mo: m[2], d: m[3] }
  }

  function invertUnixtimeSeconds(seconds) {
    if (typeof seconds !== 'number' || !isFinite(seconds)) return null
    const ms = seconds * 1000
    if (!Number.isFinite(ms)) return null
    const dt = new Date(ms)
    const y = dt.getUTCFullYear()
    const mo = dt.getUTCMonth() + 1
    const d = dt.getUTCDate()
    if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d)) return null
    return { y, mo, d }
  }

  function isDefinitionPair(eqn) {
    return eqn.length === 2 &&
      typeof eqn[0] === 'string' && isSimpleVar(eqn[0]) &&
      typeof eqn[1] === 'string' && !isSimpleVar(eqn[1])
  }

  const sortedEqns = [...eqns].sort((a, b) => {
    const aHasLiteral = a.some(e => typeof e === 'number')
    const bHasLiteral = b.some(e => typeof e === 'number')
    if (aHasLiteral !== bHasLiteral) return aHasLiteral ? -1 : 1
    return 0
  })

  function propagateSatisfiedDefinitions() {
    let changed = false
    for (const eqn of sortedEqns) {
      if (eqn.length !== 2) continue
      const [lhs, rhs] = eqn

      if (!isSimpleVar(lhs)) continue
      if (typeof rhs !== 'string' || isSimpleVar(rhs)) continue
      if (!isKnown(lhs)) continue

      const rhsVars = findVariables(rhs)
      if (rhsVars.size === 0) continue
      if (![...rhsVars].every(v => (trustworthy.has(v) || stableDerived.has(v)))) continue

      const r = evalExpr(rhs)
      if (r.error || !isFinite(r.value)) continue

      const tolerance = Math.abs(r.value) * tol + tol
      if (Math.abs(values[lhs] - r.value) >= tolerance) continue

      if (!stableDerived.has(lhs)) {
        stableDerived.add(lhs)
        changed = true
      }
    }
    return changed
  }

  function findTarget(eqn) {
    // Priority: literals > trustworthy vars > trustworthy exprs > other exprs > simple vars
    for (const expr of eqn) {
      if (typeof expr === 'number') return { value: expr, isTrustworthy: true, isStable: true, stableNonSingleton: true }
    }
    for (const expr of eqn) {
      if (typeof expr === 'string' && isSimpleVar(expr) && trustworthy.has(expr)) {
        return { value: values[expr], isTrustworthy: true, isStable: true, stableNonSingleton: true }
      }
    }
    if (eqn.length === 2) {
      for (const expr of eqn) {
        if (typeof expr === 'string' && isSimpleVar(expr) && (stableDerived.has(expr) || solvedFromStableThisPass.has(expr))) {
          return { value: values[expr], isTrustworthy: false, isStable: true, stableNonSingleton: true }
        }
      }
    }
    let bestStable = null
    let bestStableScore = -1
    for (const expr of eqn) {
      if (typeof expr !== 'string' || isSimpleVar(expr)) continue
      const vars = findVariables(expr)
      if (vars.size === 0) continue
      if (![...vars].every(v => isStable(v))) continue
      const hasNonSingletonStable = [...vars].some(v => trustworthy.has(v) || stableDerived.has(v) || solvedFromStableThisPass.has(v))
      if (eqn.length > 2 && !hasNonSingletonStable) continue
      const r = evalExpr(expr)
      if (r.error || !isFinite(r.value) || r.value === null) continue
      const allTrustworthy = [...vars].every(v => trustworthy.has(v))
      const trustworthyCount = [...vars].filter(v => trustworthy.has(v)).length
      const score = (allTrustworthy ? 1000 : 0) + trustworthyCount
      if (score > bestStableScore) {
        bestStableScore = score
        bestStable = { value: r.value, isTrustworthy: allTrustworthy, isStable: true, stableNonSingleton: (eqn.length === 2) ? true : hasNonSingletonStable }
      }
    }
    if (bestStable !== null) return bestStable
    for (const expr of eqn) {
      if (typeof expr === 'string' && isSimpleVar(expr) &&
          (trustworthy.has(expr) || stableDerived.has(expr) || solvedFromStableThisPass.has(expr))) {
        return { value: values[expr], isTrustworthy: trustworthy.has(expr), isStable: true, stableNonSingleton: true }
      }
    }
    for (const expr of eqn) {
      if (typeof expr === 'string' && isSimpleVar(expr) && isKnown(expr)) {
        return { value: values[expr], isTrustworthy: false, stableNonSingleton: false }
      }
    }
    for (const expr of eqn) {
      if (typeof expr === 'string' && !isSimpleVar(expr)) {
        const r = evalExpr(expr)
        if (!r.error && isFinite(r.value) && r.value !== null) {
          return { value: r.value, isTrustworthy: false, stableNonSingleton: false }
        }
      }
    }
    if (eqn.some(e => typeof e === 'string' && isSimpleVar(e))) {
      return { value: 1, isTrustworthy: false, isStable: false, stableNonSingleton: false }
    }
    return null
  }

  // Main solving loop
  for (let pass = 0; pass < 20; pass++) {
    let changed = false
    solvedThisPass = new Set()
    solvedFromStableThisPass = new Set()

    for (let i = 0; i < 10; i++) {
      if (!propagateSatisfiedDefinitions()) break
    }

    for (const eqn of sortedEqns) {
      const eqnSatisfiedNow = checkEquation(eqn)
      if (eqnSatisfiedNow) continue

      const eqnHasLiteral = eqn.some(e => typeof e === 'number')
      let targetResult = null
      if (isDefinitionPair(eqn) && !literalPinned.has(eqn[0]) && (usesAsInput.get(eqn[0]) || 0) === 0) {
        const rhs = eqn[1]
        const r = evalExpr(rhs)
        if (!r.error && isFinite(r.value)) {
          targetResult = { value: r.value, isTrustworthy: false, isStable: false, stableNonSingleton: false }
        }
      }

      if (targetResult === null) {
        targetResult = findTarget(eqn)
      }
      if (targetResult === null) continue
      const { value: target, isTrustworthy, isStable: targetIsStable, stableNonSingleton: targetStableNonSingleton = false } = targetResult

      for (const expr of eqn) {
        if (typeof expr === 'number') continue

        if (isSimpleVar(expr)) {
          if (literalPinned.has(expr)) continue
          if (!eqnHasLiteral && constrained.has(expr) && isKnown(expr) && values[expr] !== target) continue
          if (!isKnown(expr) || values[expr] !== target) {
            values[expr] = target
            changed = true
            solvedThisPass.add(expr)
            if (isTrustworthy || targetIsStable) solvedFromStableThisPass.add(expr)
            if (isTrustworthy) trustworthy.add(expr)
            if (targetIsStable && (isTrustworthy || (eqn.length === 2 && targetStableNonSingleton) || constrained.size === 0)) stableDerived.add(expr)
          }
          if (targetIsStable && isKnown(expr) && values[expr] === target) {
            if (!stableDerived.has(expr)) {
              if (isTrustworthy || (eqn.length === 2 && targetStableNonSingleton) || constrained.size === 0) {
                stableDerived.add(expr)
                changed = true
              }
            }
          }
          continue
        }

        // Complex expression
        const exprVars = findVariables(expr)
        const unknowns = [...exprVars].filter(v => !isKnown(v) && !constrained.has(v) && !solvedThisPass.has(v))

        if (unknowns.length === 1) {
          const solvedVal = solveFor(expr, unknowns[0], target, values)
          if (solvedVal !== null) {
            values[unknowns[0]] = solvedVal
            changed = true
            solvedThisPass.add(unknowns[0])
            if (isTrustworthy || targetIsStable) solvedFromStableThisPass.add(unknowns[0])
            if (isTrustworthy) trustworthy.add(unknowns[0])
            if (targetIsStable && (isTrustworthy || (eqn.length === 2 && targetStableNonSingleton) || constrained.size === 0)) stableDerived.add(unknowns[0])
          }
        } else if (unknowns.length === 0 && (isTrustworthy || targetIsStable || (eqn.length === 2 && !eqnSatisfiedNow))) {
          // Handle unixtime inversion
          const uargs = unixtimeArgs(expr)
          if (uargs) {
            const inv = invertUnixtimeSeconds(target)
            if (inv) {
              const yv = uargs.y
              const mov = uargs.mo
              const dv = uargs.d
              if (!constrained.has(yv) && !constrained.has(mov) && !constrained.has(dv) &&
                  !trustworthy.has(yv) && !trustworthy.has(mov) && !trustworthy.has(dv) &&
                  !solvedThisPass.has(yv) && !solvedThisPass.has(mov) && !solvedThisPass.has(dv)) {
                try {
                  const check = unixtime(inv.y, inv.mo, inv.d)
                  if (check === target) {
                    values[yv] = inv.y
                    values[mov] = inv.mo
                    values[dv] = inv.d
                    changed = true
                    solvedThisPass.add(yv)
                    solvedThisPass.add(mov)
                    solvedThisPass.add(dv)
                    if (isTrustworthy || targetIsStable) {
                      solvedFromStableThisPass.add(yv)
                      solvedFromStableThisPass.add(mov)
                      solvedFromStableThisPass.add(dv)
                    }
                    if (isTrustworthy) {
                      trustworthy.add(yv)
                      trustworthy.add(mov)
                      trustworthy.add(dv)
                    }
                    if (targetIsStable && (isTrustworthy || (eqn.length === 2 && targetStableNonSingleton) || constrained.size === 0)) {
                      stableDerived.add(yv)
                      stableDerived.add(mov)
                      stableDerived.add(dv)
                    }
                    continue
                  }
                } catch (e) {}
              }
            }
          }

          // Handle product scaling (w*h)
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
                    if (isTrustworthy || targetIsStable) {
                      solvedFromStableThisPass.add(a)
                      solvedFromStableThisPass.add(b)
                    }
                    if (isTrustworthy) {
                      trustworthy.add(a)
                      trustworthy.add(b)
                    }
                    if (targetIsStable && (isTrustworthy || (eqn.length === 2 && targetStableNonSingleton) || constrained.size === 0)) {
                      stableDerived.add(a)
                      stableDerived.add(b)
                    }
                    continue
                  }
                }
              }
            }
          }

          // Generic: try each variable
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
            if (isTrustworthy || targetIsStable) solvedFromStableThisPass.add(bestVar)
            if (isTrustworthy) trustworthy.add(bestVar)
            if (targetIsStable && (isTrustworthy || (eqn.length === 2 && targetStableNonSingleton) || constrained.size === 0)) stableDerived.add(bestVar)
          }
        }
      }
    }

    if (!changed) break
  }

  // Fallback: 1D search on root variables
  if (!eqnsSatisfied(eqns, values, tol)) {
    const definedBy = new Map()
    const copies = []
    for (const eqn of eqns) {
      if (eqn.length === 2) {
        const [e1, e2] = eqn
        if (isSimpleVar(e1) && isSimpleVar(e2)) {
          copies.push([e1, e2])
        }
        if (isSimpleVar(e1) && typeof e2 === 'string' && !isSimpleVar(e2)) {
          const vars = findVariables(e2)
          if (vars.size === 1) {
            const root = [...vars][0]
            if (!constrained.has(root) && !constrained.has(e1)) {
              definedBy.set(e1, { expr: e2, root })
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

    const rootCounts = new Map()
    for (const { root } of definedBy.values()) {
      rootCounts.set(root, (rootCounts.get(root) || 0) + 1)
    }

    for (const [root, count] of rootCounts) {
      if (count < 2) continue

      let lo = 0.001, hi = 1000
      for (let iter = 0; iter < 50; iter++) {
        const mid = (lo + hi) / 2
        const testValues = { ...values, [root]: mid }

        for (const [v, { expr }] of definedBy) {
          const r = vareval(expr, testValues)
          if (!r.error && isFinite(r.value)) {
            testValues[v] = r.value
          }
        }

        for (const [dest, src] of copies) {
          const v = testValues[src]
          if (isFinite(v)) testValues[dest] = v
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
            if (typeof e === 'number') { bestVal = e; bestScore = 2; break }
            const r = vareval(e, testValues)
            if (r.error || !isFinite(r.value)) continue
            const vars = findVariables(e)
            const constrainedOnly = [...vars].every(v => constrained.has(v))
            const score = constrainedOnly ? 1 : 0
            if (score > bestScore) { bestScore = score; bestVal = r.value }
          }
          if (bestVal !== null) testValues[head] = bestVal
        }

        if (eqnsSatisfied(eqns, testValues, tol)) {
          Object.assign(values, testValues)
          break
        }

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
          for (const r of results) residual += (r - target) ** 2
        }

        const probeDelta = (hi - lo) * 1e-4 + 1e-6
        const testHi = { ...values, [root]: mid + probeDelta }
        for (const [v, { expr }] of definedBy) {
          const r = vareval(expr, testHi)
          if (!r.error && isFinite(r.value)) testHi[v] = r.value
        }
        for (const [dest, src] of copies) {
          const v = testHi[src]
          if (isFinite(v)) testHi[dest] = v
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
            if (typeof e === 'number') { bestVal = e; bestScore = 2; break }
            const r = vareval(e, testHi)
            if (r.error || !isFinite(r.value)) continue
            const vars = findVariables(e)
            const constrainedOnly = [...vars].every(v => constrained.has(v))
            const score = constrainedOnly ? 1 : 0
            if (score > bestScore) { bestScore = score; bestVal = r.value }
          }
          if (bestVal !== null) testHi[head] = bestVal
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

        if (residualHi < residual) lo = mid
        else hi = mid
      }
    }
  }

  return values
}

// =============================================================================
// solvemGradient: Gradient descent based solver (from gemini-solver.js)
// =============================================================================

function solvemGradient(eqns, initialVars) {
  const MAX_ITERATIONS = 200000
  const LEARN_RATE = 0.005
  const DECAY = 0.95
  const EPSILON = 1e-10
  const STEP_CLIP = 1.0

  const varNames = Object.keys(initialVars)

  const prevalLocal = (s) => s.toString().replace(/(\d)([a-zA-Z_(])/g, '$1*$2').replace(/\^/g, '**')

  const compiledEqns = eqns.map(eqn =>
    eqn.map(expr => {
      try { return new Function(...varNames, `return ${prevalLocal(expr)};`) }
      catch (e) { return () => NaN }
    })
  )

  let values = varNames.map(k => {
    const v = initialVars[k]
    return (v === null || v === undefined) ? NaN : v
  })

  let strength = new Int8Array(varNames.length).fill(0)
  values.forEach((v, i) => { if (!isNaN(v)) strength[i] = 1 })

  let pinned = new Set()
  let dependencies = new Map()

  const getDeps = (expr) => {
    const m = expr.toString().match(/[a-zA-Z_$][\w$]*/g) || []
    return m.filter(v => varNames.includes(v))
  }

  // Logic & algebra pass
  for (let pass = 0; pass < varNames.length * 4; pass++) {
    let changed = false

    eqns.forEach((eqn, eqIdx) => {
      const funcs = compiledEqns[eqIdx]
      const currentVals = funcs.map(f => f(...values))

      let anchorVal = NaN
      let anchorH = 0

      for (let i = 0; i < eqn.length; i++) {
        const raw = eqn[i]
        const val = currentVals[i]

        if (typeof raw === 'number') {
          anchorVal = raw
          anchorH = 3
          break
        }

        if (Number.isFinite(val)) {
          let h = 1
          const deps = getDeps(raw)
          if (deps.length === 0) h = 3
          else {
            let minH = 3
            for (let d of deps) {
              const idx = varNames.indexOf(d)
              const dh = strength[idx] || 0
              if (dh < minH) minH = dh
            }
            h = minH
          }
          if (h > anchorH) { anchorH = h; anchorVal = val }
        }
      }

      eqn.forEach((term, termIdx) => {
        const deps = getDeps(term)

        if (deps.length === 1 && deps[0] === term) {
          const vIdx = varNames.indexOf(term)

          if (eqn.length === 2 && !dependencies.has(vIdx) && !pinned.has(vIdx)) {
            const otherIdx = (termIdx === 0) ? 1 : 0
            const otherRaw = eqn[otherIdx]
            const isBareVar = varNames.includes(otherRaw)
            if (typeof otherRaw !== 'number' && !isBareVar) {
              dependencies.set(vIdx, { eqIdx, termIdx: otherIdx })
            }
          }

          if (anchorH > 0 && !pinned.has(vIdx)) {
            const currH = strength[vIdx]
            if (isNaN(values[vIdx]) || anchorH > currH || (anchorH === currH && Math.abs(values[vIdx] - anchorVal) > 1e-9)) {
              values[vIdx] = anchorVal
              strength[vIdx] = anchorH
              changed = true
              if (anchorH === 3) {
                pinned.add(vIdx)
                dependencies.delete(vIdx)
              }
            }
          }
          return
        }

        if (anchorH === 0) return

        const nans = deps.filter(d => isNaN(values[varNames.indexOf(d)]))
        const weaks = deps.filter(d => {
          const i = varNames.indexOf(d)
          return !isNaN(values[i]) && strength[i] < anchorH
        })

        let targetVar = null
        if (nans.length === 1) {
          targetVar = nans[0]
        } else if (nans.length === 0 && weaks.length === 1) {
          targetVar = weaks[0]
        }

        if (targetVar) {
          const tIdx = varNames.indexOf(targetVar)

          if (dependencies.has(tIdx) || pinned.has(tIdx)) return

          let guess = isNaN(values[tIdx]) ? 0.1 : values[tIdx]
          if (Math.abs(guess) < 1e-9) guess = 0.1

          for (let n = 0; n < 10; n++) {
            values[tIdx] = guess
            const y1 = funcs[termIdx](...values)

            const d = 1e-5
            values[tIdx] = guess + d
            const y2 = funcs[termIdx](...values)

            const slope = (y2 - y1) / d
            if (Math.abs(slope) < 1e-9) break

            const next = guess - (y1 - anchorVal) / slope
            if (!Number.isFinite(next)) break
            if (Math.abs(next - guess) < 1e-9) { guess = next; break }
            guess = next
          }

          values[tIdx] = guess
          const check = funcs[termIdx](...values)
          if (Math.abs(check - anchorVal) < 1e-3) {
            strength[tIdx] = anchorH
            changed = true
            if (anchorH === 3) {
              pinned.add(tIdx)
              dependencies.delete(tIdx)
            }
          }
        }
      })
    })
    if (!changed) break
  }

  // Pre-optimization
  for (let i = 0; i < values.length; i++) if (isNaN(values[i])) values[i] = 0.5

  const enforceDeps = () => {
    for (let k = 0; k < 3; k++) {
      let passChange = false
      dependencies.forEach(({ eqIdx, termIdx }, vIdx) => {
        if (pinned.has(vIdx)) return
        const val = compiledEqns[eqIdx][termIdx](...values)
        if (Number.isFinite(val) && Math.abs(values[vIdx] - val) > 1e-9) {
          values[vIdx] = val
          passChange = true
        }
      })
      if (!passChange) break
    }
  }

  // Gradient descent
  let gradCache = new Float64Array(values.length).fill(0)
  const DELTA = 1e-6

  const computeError = () => {
    let totalError = 0
    const results = compiledEqns.map(funcs => funcs.map(f => f(...values)))
    for (let row of results) {
      for (let i = 0; i < row.length - 1; i++) {
        let diff = row[i] - row[i + 1]
        totalError += diff * diff
      }
    }
    return totalError
  }

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    enforceDeps()

    const totalError = computeError()
    if (totalError < EPSILON) break

    for (let i = 0; i < values.length; i++) {
      if (pinned.has(i) || dependencies.has(i)) continue

      const baseError = computeError()

      let original = values[i]
      values[i] = original + DELTA
      enforceDeps()

      const errorPlus = computeError()

      values[i] = original
      enforceDeps()

      let grad = (errorPlus - baseError) / DELTA

      gradCache[i] = DECAY * gradCache[i] + (1 - DECAY) * (grad * grad)
      let step = (LEARN_RATE * grad) / (Math.sqrt(gradCache[i]) + 1e-8)

      if (step > STEP_CLIP) step = STEP_CLIP
      if (step < -STEP_CLIP) step = -STEP_CLIP

      values[i] -= step
    }
  }
  enforceDeps()

  let result = {}
  varNames.forEach((k, i) => result[k] = values[i])
  return result
}

// =============================================================================
// solvem: Kitchen-sink solver - tries multiple solvers
// =============================================================================
// Per README future work item 13: Try as many solvers as we can. If any return
// a satisfying assignment, Bob's your uncle.

function solvem(eqns, init) {
  // Try primary solver first
  let ass = solvemPrimary(eqns, init)
  let zij = zidge(eqns, ass)
  let sat = eqnsSatisfied(eqns, ass)

  // If satisfied, return immediately
  if (sat) {
    return { ass, zij, sat }
  }

  // DISABLED: gradient descent is too slow (200k iterations)
  // TODO: re-enable with lower iteration count or web worker
  const SKIP_GRADIENT = true
  if (SKIP_GRADIENT) {
    return { ass, zij, sat }
  }

  // Try gradient descent solver as fallback
  try {
    const gradientAss = solvemGradient(eqns, init)
    const gradientSat = eqnsSatisfied(eqns, gradientAss)

    if (gradientSat) {
      return {
        ass: gradientAss,
        zij: zidge(eqns, gradientAss),
        sat: true
      }
    }

    // Even if gradient solver didn't fully satisfy, check if it's better
    const primaryResidual = zij.reduce((a, b) => a + (isNaN(b) ? Infinity : b), 0)
    const gradientZij = zidge(eqns, gradientAss)
    const gradientResidual = gradientZij.reduce((a, b) => a + (isNaN(b) ? Infinity : b), 0)

    if (gradientResidual < primaryResidual) {
      ass = gradientAss
      zij = gradientZij
      sat = gradientSat
    }
  } catch (e) {
    // Gradient solver failed, stick with primary result
  }

  return { ass, zij, sat }
}

// =============================================================================
// Exports (for browser use, these become globals)
// =============================================================================

// Make functions available globally if in browser context
if (typeof window !== 'undefined') {
  window.preval = preval
  window.vareval = vareval
  window.varparse = varparse
  window.isconstant = isconstant
  window.solveFor = solveFor
  window.solvem = solvem
  window.eqnsSatisfied = eqnsSatisfied
  window.zidge = zidge
  window.findVariables = findVariables
  window.unixtime = unixtime
  window.deoctalize = deoctalize
}

// For Node.js module exports
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    preval,
    vareval,
    varparse,
    isconstant,
    solveFor,
    solvem,
    eqnsSatisfied,
    zidge,
    findVariables,
    unixtime,
    deoctalize
  }
}
