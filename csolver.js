// csolver.js - Constraint Solver for Reciplier
// See README.md for the spec of this interface.

/* 
Kitchen-sink solver: Try as many solvers as we can scrounge up. The outer
solvem function calls each solver in turn and if one returns a satisfying 
assignment, Bob is one's uncle. The beauty of NP-complete problems is it's easy
to check candidate solutions. 

Idea: keep track of which sub-solvers give valid solutions.
*/

// Solver registry: try each in order, return first satisfying result
const SOLVERS = [
  gaussJordan, // Aka Gaussian elimination; fast and exact for linear systems
  newtRaphson, // Newton-Raphson for non-linear systems
  kludgeOrama, // Algebraic propagation + special cases
]

/*
Ideas for later:
  * binarySearch - Arbitrarily pick values for any nulls in the initial 
                   assignment and then do binary search on each variable in turn
                   until one yields a satisfying assignment. 
                   This probably exists buried in the kludgeOrama spaghetti but
                   we should pull it out and then understand what, if anything,
                   kludgeOrama does beyond that.
  * gradientDesc - Gradient descent: Maybe a slightly fancier version of 
                   binary search that checks which direction each variable 
                   should be nudged to reduce overall residual error...
*/

var {
  preval,
  vareval,
  varparse,
  isconstant,
  isbarevar,
  unixtime,
  tolerance
} = (typeof module !== 'undefined' && module.exports)
  ? require('./matheval.js')
  : { preval, vareval, varparse, isconstant, isbarevar, unixtime, tolerance }

// Tolerance constants for floating-point comparison
const TOL_TIGHT = 1e-9   // For solveFor binary search convergence
const TOL_MEDIUM = 1e-6  // For equation satisfaction checks
const TOL_ABS = 1e-12    // Absolute tolerance floor

// =============================================================================
// solveFor: Solve for a single variable to make expr equal target
// =============================================================================

function solveFor(expr, varName, target, values, inf = null, sup = null) {
  const test = { ...values }
  const tol = tolerance(target, TOL_TIGHT)
  const hasInf = typeof inf === 'number' && isFinite(inf)
  const hasSup = typeof sup === 'number' && isFinite(sup)

  function evalAt(x) {
    test[varName] = x
    const r = vareval(expr, test)
    if (r.error || !isFinite(r.value)) return null
    return r.value
  }

  function withinBounds(x) {
    return (!hasInf || x >= inf) && (!hasSup || x <= sup)
  }

  function adjustBracket(loCandidate, hiCandidate) {
    const lo = hasInf ? Math.max(loCandidate, inf) : loCandidate
    const hi = hasSup ? Math.min(hiCandidate, sup) : hiCandidate
    return (hasInf && hasSup && lo > hi) ? null : [lo, hi]
  }

  function tryGuess(guess) {
    if (!isFinite(guess)) return null
    if (!withinBounds(guess)) return null
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
    const adjusted = adjustBracket(loCandidate, hiCandidate)
    if (!adjusted) return false
    loCandidate = adjusted[0]
    hiCandidate = adjusted[1]
    if (loCandidate < 0 && hiCandidate > 0 && withinBounds(0)) {
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
          if (!withinBounds(x1)) continue
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
  if (!withinBounds(finalVal)) return null
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

function eqnsSatisfied(eqns, values, tol = TOL_MEDIUM, absTol = TOL_ABS) {
  for (const eqn of eqns) {
    if (eqn.length < 2) continue
    const results = eqn.map(e => {
      if (typeof e === 'number') return { value: e, error: null }
      return vareval(e, values)
    })
    if (results.some(r => r.error || !isFinite(r.value))) return false
    const first = results[0].value
    if (!results.every(r => Math.abs(r.value - first) < tolerance(first, tol, absTol))) return false
  }
  return true
}

function boundsSatisfied(values, inf = {}, sup = {}) {
  const check = (bounds, cmp) => Object.entries(bounds).every(([name, bound]) => {
    if (typeof bound !== 'number' || !isFinite(bound)) return true
    const val = values[name]
    return typeof val === 'number' && isFinite(val) && cmp(val, bound)
  })
  return check(inf, (v, b) => v >= b) && check(sup, (v, b) => v <= b)
}

// =============================================================================
// zidge: Compute sum-of-squared-residuals for each equation
// =============================================================================

// zij (pronounced "zidge"): per-equation residuals. Each entry is the sum of
// squared deviations of the equation's terms from their mean. Zero means the
// equation is satisfied; NaN means it couldn't be evaluated.
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
// gaussJordan: Gaussian elimination for linear systems
// =============================================================================

// Try to extract linear coefficients from an expression via numerical
// differentiation
// Returns {coeffs: [...], constant} or null if nonlinear
// (was tryExtractLinearCoeffs)
function linearCoeffs(expr, varNames, baseValues) {
  // Always use zeros as the base for numerical differentiation.
  // The baseValues parameter is only used to know which variables exist.
  const zeros = {}
  for (const v of varNames) zeros[v] = 0
  
  const f0 = vareval(expr, zeros)
  if (f0.error || !isFinite(f0.value)) return null
  
  const coeffs = []
  for (const v of varNames) {
    const test1 = { ...zeros, [v]: 1 }
    const test2 = { ...zeros, [v]: 2 }
    
    const f1 = vareval(expr, test1)
    const f2 = vareval(expr, test2)
    
    if (f1.error || !isFinite(f1.value)) return null
    if (f2.error || !isFinite(f2.value)) return null
    
    const coeff = f1.value - f0.value
    const coeff2 = f2.value - f1.value
    
    // Check linearity: second difference should equal first difference
    if (Math.abs(coeff2 - coeff) > 1e-9) return null
    
    coeffs.push(coeff)
  }
  
  return { coeffs, constant: f0.value }
}

function gaussJordan(eqns, vars, inf, sup, knownVars = null) {
  const varNames = Object.keys(vars).sort()
  if (varNames.length === 0) {
    return { ass: { ...vars }, zij: zidge(eqns, vars), sat: eqnsSatisfied(eqns, vars) }
  }
  
  // gaussJordan only handles fully determined linear systems.
  // For underconstrained systems, fall through to kludgeOrama which has
  // heuristics for choosing among infinitely many solutions.
  
  // If any variables are null/undefined/NaN, let kludgeOrama handle it with its heuristics
  const hasUnknowns = varNames.some(v => !(typeof vars[v] === 'number' && isFinite(vars[v])))
  if (hasUnknowns) {
    return { ass: { ...vars }, zij: zidge(eqns, vars), sat: false }
  }
  
  // Build linear system from equations
  // Each equation [a, b, c, ...] means a = b = c = ...
  // Convert to constraints: a - b = 0, b - c = 0, etc.
  const rows = []
  const rhs = []
  
  for (const eqn of eqns) {
    if (eqn.length < 2) continue
    
    for (let i = 0; i < eqn.length - 1; i++) {
      const left = eqn[i]
      const right = eqn[i + 1]
      
      // Handle numeric constants
      if (typeof left === 'number' && typeof right === 'number') continue

      const toCoeffs = e => typeof e === 'number'
        ? { coeffs: varNames.map(() => 0), constant: e }
        : linearCoeffs(e, varNames, vars)
      const leftCoeffs = toCoeffs(left)
      const rightCoeffs = toCoeffs(right)
      
      if (!leftCoeffs || !rightCoeffs) continue
      
      // Constraint: left - right = 0
      const rowCoeffs = leftCoeffs.coeffs.map((c, j) => c - rightCoeffs.coeffs[j])
      const rowRhs = rightCoeffs.constant - leftCoeffs.constant
      
      // Skip trivial rows (all zeros)
      if (rowCoeffs.every(c => Math.abs(c) < 1e-12) && Math.abs(rowRhs) < 1e-12) continue
      
      rows.push(rowCoeffs)
      rhs.push(rowRhs)
    }
  }
  
  if (rows.length === 0) {
    return { ass: { ...vars }, zij: zidge(eqns, vars), sat: eqnsSatisfied(eqns, vars) }
  }
  
  // Gaussian elimination with partial pivoting
  const n = varNames.length
  const m = rows.length
  const A = rows.map((row, i) => [...row, rhs[i]])
  
  let pivotRow = 0
  const pivotCols = []
  
  for (let col = 0; col < n && pivotRow < m; col++) {
    // Find best pivot
    let maxVal = Math.abs(A[pivotRow][col])
    let maxRow = pivotRow
    for (let row = pivotRow + 1; row < m; row++) {
      if (Math.abs(A[row][col]) > maxVal) {
        maxVal = Math.abs(A[row][col])
        maxRow = row
      }
    }
    
    if (maxVal < 1e-12) continue
    
    [A[pivotRow], A[maxRow]] = [A[maxRow], A[pivotRow]]
    
    for (let row = pivotRow + 1; row < m; row++) {
      const factor = A[row][col] / A[pivotRow][col]
      for (let j = col; j <= n; j++) {
        A[row][j] -= factor * A[pivotRow][j]
      }
    }
    
    pivotCols.push(col)
    pivotRow++
  }
  
  // Back substitution
  const solution = new Array(n).fill(null)
  
  for (let i = pivotCols.length - 1; i >= 0; i--) {
    const row = i
    const col = pivotCols[i]
    
    let sum = A[row][n]
    for (let j = col + 1; j < n; j++) {
      if (solution[j] !== null) {
        sum -= A[row][j] * solution[j]
      } else if (Math.abs(A[row][j]) > 1e-12) {
        solution[j] = vars[varNames[j]] ?? 1
        sum -= A[row][j] * solution[j]
      }
    }
    
    if (Math.abs(A[row][col]) < 1e-12) break
    solution[col] = sum / A[row][col]
  }
  
  // Check if system is underconstrained (fewer constraints than variables)
  // If so, return sat=false to let kludgeOrama handle it with its heuristics
  // (kludgeOrama preserves seed values for underdetermined systems)
  if (pivotCols.length < n) {
    return { ass: { ...vars }, zij: zidge(eqns, vars), sat: false }
  }
  
  const ass = {}
  for (let j = 0; j < n; j++) {
    ass[varNames[j]] = solution[j]
  }
  
  const zij = zidge(eqns, ass)
  const sat = eqnsSatisfied(eqns, ass) && boundsSatisfied(ass, inf, sup)
  
  return { ass, zij, sat }
}

// =============================================================================
// kludgeOrama: Algebraic propagation + special cases
// =============================================================================
// This is the original monstrosity that LLMs wrought.
// Future work: extract special cases into separate solvers.

// --- Extracted helper functions (pure, no closure dependencies) ---

// Check if equation is a definition pair: [bareVar, expression]
function isDefinitionPair(eqn) {
  return eqn.length === 2 &&
    typeof eqn[0] === 'string' && isbarevar(eqn[0]) &&
    typeof eqn[1] === 'string' && !isbarevar(eqn[1])
}

// Extract unixtime(y, m, d) arguments from an expression
function unixtimeArgs(expr) {
  if (typeof expr !== 'string') return null
  const m = expr.match(/\bunixtime\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*,\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*,\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)\s*$/)
  if (!m) return null
  return { y: m[1], mo: m[2], d: m[3] }
}

// Invert unixtime: given seconds since epoch, return {y, mo, d}
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

// Find all variables required by equations
// (was findRequiredVars)
function requiredVars(eqns) {
  const required = new Set()
  for (const eqn of eqns) {
    for (const term of eqn) {
      if (typeof term === 'number') continue
      if (typeof term !== 'string') continue
      const t = term.trim()
      if (t === '') continue
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t)) required.add(t)
      for (const v of varparse(t)) required.add(v)
    }
  }
  return required
}

// Find variables that appear in equations with literal numbers (constrained)
// (was findConstrainedVars)
function constrainedVars(eqns) {
  const constrained = new Set()
  for (const eqn of eqns) {
    if (eqn.some(e => typeof e === 'number')) {
      for (const e of eqn) {
        if (isbarevar(e)) constrained.add(e)
      }
    }
  }
  return constrained
}

// Build map of variable -> count of times used as input (not as LHS definition)
// (was buildUsesAsInput)
function inputUseCounts(eqns) {
  const usesAsInput = new Map()
  for (const eqn of eqns) {
    if (eqn.length < 2) continue
    for (let i = 0; i < eqn.length; i++) {
      const term = eqn[i]
      if (typeof term !== 'string') continue
      const t = term.trim()
      if (t === '') continue
      if (i === 0 && isbarevar(t)) continue
      for (const v of varparse(t)) {
        usesAsInput.set(v, (usesAsInput.get(v) || 0) + 1)
      }
    }
  }
  return usesAsInput
}

// Find variables pinned to literal values (not to be confused with pegged)
// (was findLiteralPins)
function literalPins(eqns) {
  const literalPinned = new Map()
  for (const eqn of eqns) {
    const n = eqn.find(e => typeof e === 'number')
    if (typeof n !== 'number') continue
    for (const e of eqn) {
      if (isbarevar(e) && !literalPinned.has(e)) {
        literalPinned.set(e, n)
      }
    }
  }
  return literalPinned
}

// Sort equations: those with literals first
// (was sortEqnsByLiterals)
function sortByLiterals(eqns) {
  return [...eqns].sort((a, b) => {
    const aHasLiteral = a.some(e => typeof e === 'number')
    const bHasLiteral = b.some(e => typeof e === 'number')
    if (aHasLiteral !== bHasLiteral) return aHasLiteral ? -1 : 1
    return 0
  })
}

// Solve self-referential equations where both sides depend on the same variable
// Example: [['1/phi', 'phi - 1']] solves to phi = golden ratio
// This is just solving (e1 - e2) = 0 for the shared variable
// (was solveSelfReferential)
function solveSelfRef(eqns, values, constrained, trustworthy, inf, sup) {
  for (const eqn of eqns) {
    if (eqn.length !== 2) continue
    const [e1, e2] = eqn
    if (typeof e1 !== 'string' || typeof e2 !== 'string') continue
    if (isbarevar(e1) || isbarevar(e2)) continue

    const vars1 = varparse(e1)
    const vars2 = varparse(e2)
    if (vars1.size !== 1 || vars2.size !== 1) continue

    const v1 = [...vars1][0]
    const v2 = [...vars2][0]
    if (v1 !== v2) continue

    const v = v1
    if (constrained.has(v) || trustworthy.has(v)) continue

    // Already satisfied?
    const r1 = vareval(e1, values)
    const r2 = vareval(e2, values)
    if (!r1.error && !r2.error && Math.abs(r1.value - r2.value) < tolerance(r1.value, TOL_MEDIUM, TOL_ABS)) continue

    // Solve (e1 - e2) = 0 for v
    // Try with lower bound of 0 first to prefer positive roots (common case)
    const diffExpr = `(${e1}) - (${e2})`
    const lowerBound = inf[v] !== undefined ? inf[v] : 0
    let solvedVal = solveFor(diffExpr, v, 0, values, lowerBound, sup[v])
    // Fallback without lower bound if that didn't work
    if (solvedVal === null) {
      solvedVal = solveFor(diffExpr, v, 0, values, inf[v], sup[v])
    }
    if (solvedVal !== null) {
      values[v] = solvedVal
    }
  }
}

// Build dependency graph for fallback root search
// (was buildDependencyGraph)
function depGraph(eqns, constrained) {
  const definedBy = new Map()
  const copies = []
  for (const eqn of eqns) {
    if (eqn.length !== 2) continue
    const [e1, e2] = eqn
    if (isbarevar(e1) && isbarevar(e2)) {
      copies.push([e1, e2])
    }
    if (isbarevar(e1) && typeof e2 === 'string' && !isbarevar(e2)) {
      const vars = varparse(e2)
      if (vars.size === 1) {
        const root = [...vars][0]
        if (!constrained.has(root) && !constrained.has(e1)) {
          definedBy.set(e1, { expr: e2, root })
        }
      }
    }
    if (isbarevar(e2) && typeof e1 === 'string' && !isbarevar(e1)) {
      const vars = varparse(e1)
      if (vars.size === 1) {
        const root = [...vars][0]
        if (!constrained.has(root) && !constrained.has(e2)) {
          definedBy.set(e2, { expr: e1, root })
        }
      }
    }
  }
  return { definedBy, copies }
}

// Propagate values from root and compute residual for fallback search
// (was propagateAndComputeResidual)
function propagateResidual(rootVal, root, values, definedBy, copies, eqns, constrained) {
  const test = { ...values, [root]: rootVal }

  // Propagate definedBy expressions
  for (const [v, { expr }] of definedBy) {
    const r = vareval(expr, test)
    if (!r.error && isFinite(r.value)) test[v] = r.value
  }

  // Copy linked variables
  for (const [dest, src] of copies) {
    const v = test[src]
    if (isFinite(v)) test[dest] = v
  }

  // Find best values for bare var heads
  for (const eqn of eqns) {
    if (eqn.length < 2) continue
    const head = eqn[0]
    if (typeof head !== 'string' || !isbarevar(head)) continue
    if (head === root || constrained.has(head)) continue

    let bestVal = null
    let bestScore = -1
    for (let i = 1; i < eqn.length; i++) {
      const e = eqn[i]
      if (typeof e === 'number') { bestVal = e; bestScore = 2; break }
      const r = vareval(e, test)
      if (r.error || !isFinite(r.value)) continue
      const vars = varparse(e)
      const constrainedOnly = [...vars].every(v => constrained.has(v))
      const score = constrainedOnly ? 1 : 0
      if (score > bestScore) { bestScore = score; bestVal = r.value }
    }
    if (bestVal !== null) test[head] = bestVal
  }

  // Compute residual
  let residual = 0
  for (const eqn of eqns) {
    if (eqn.length < 2) continue
    const results = eqn.map(e => {
      if (typeof e === 'number') return e
      const r = vareval(e, test)
      return r.error ? NaN : r.value
    })
    if (results.some(r => !isFinite(r))) continue
    const target = results.find(r => isFinite(r))
    for (const r of results) residual += (r - target) ** 2
  }

  return { test, residual }
}

// Fallback: 1D binary search on root variables when main solver fails
// (was fallbackRootSearch)
function rootSearch(eqns, values, constrained, tol, inf, sup) {
  const { definedBy, copies } = depGraph(eqns, constrained)

  const rootCounts = new Map()
  for (const { root } of definedBy.values()) {
    rootCounts.set(root, (rootCounts.get(root) || 0) + 1)
  }

  for (const [root, count] of rootCounts) {
    if (count < 2) continue

    let lo = 0.001, hi = 1000
    for (let iter = 0; iter < 50; iter++) {
      const mid = (lo + hi) / 2
      const { test: testValues, residual } = propagateResidual(mid, root, values, definedBy, copies, eqns, constrained)

      if (eqnsSatisfied(eqns, testValues, tol)) {
        Object.assign(values, testValues)
        break
      }

      const probeDelta = (hi - lo) * 1e-4 + 1e-6
      const { residual: residualHi } = propagateResidual(mid + probeDelta, root, values, definedBy, copies, eqns, constrained)

      if (residualHi < residual) lo = mid
      else hi = mid
    }
  }
}

function kludgeOrama(eqns, vars, inf, sup, knownVars = null) {
  // solvem now ensures all required variables are seeded before calling solvers
  const values = { ...vars }
  const tol = TOL_MEDIUM
  const absTol = TOL_ABS

  function evalExpr(expr) {
    if (typeof expr === 'number') return { value: expr, error: null }
    return vareval(expr, values)
  }

  function isKnown(v) {
    return values[v] !== null && values[v] !== undefined
  }

  // Initialize constraint tracking using extracted helpers
  const constrained = constrainedVars(eqns)
  const usesAsInput = inputUseCounts(eqns)
  const literalPinned = literalPins(eqns)

  // Apply literal pins to values (not to be confused with pegged)
  for (const [v, n] of literalPinned) {
    values[v] = n
  }

  // Singletons: single-term equations with known values
  const singletons = new Map()
  for (const eqn of eqns) {
    if (eqn.length === 1 && isbarevar(eqn[0]) && isKnown(eqn[0])) {
      singletons.set(eqn[0], values[eqn[0]])
    }
  }

  const stableDerived = new Set()

  // Start with constrained vars as trustworthy, plus any known vars from seeds.
  // Only add knownVars that are NOT already constrained by literals.
  // Variables constrained by literals are already protected; others should preserve init values.
  const trustworthy = new Set(constrained)
  if (knownVars) {
    for (const v of knownVars) {
      if (!constrained.has(v)) trustworthy.add(v)
    }
  }
  let solvedThisPass = new Set()
  let solvedFromStableThisPass = new Set()

  // Helper to mark a variable as solved and update all tracking sets
  // This pattern was repeated ~10 times in the original code
  function markSolved(v, newVal, opts = {}) {
    const { isTrustworthy = false, isStable = false, isStableNonSingleton = false, eqnLen = 2 } = opts
    values[v] = newVal
    solvedThisPass.add(v)
    if (isTrustworthy || isStable) solvedFromStableThisPass.add(v)
    if (isTrustworthy) trustworthy.add(v)
    const promoteToStable = isStable && (isTrustworthy || (eqnLen === 2 && isStableNonSingleton) || constrained.size === 0)
    if (promoteToStable) stableDerived.add(v)
  }

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
    return results.every(r => Math.abs(r.value - first) < tolerance(first, tol, absTol))
  }

  // Use extracted helpers (unixtimeArgs, invertUnixtimeSeconds, isDefinitionPair
  // are now at module level)

  const sortedEqns = sortByLiterals(eqns)

  // (was propagateSatisfiedDefinitions)
  function propagateDefs() {
    let changed = false
    for (const eqn of sortedEqns) {
      if (eqn.length !== 2) continue
      const [lhs, rhs] = eqn

      if (!isbarevar(lhs)) continue
      if (typeof rhs !== 'string' || isbarevar(rhs)) continue
      if (!isKnown(lhs)) continue

      const rhsVars = varparse(rhs)
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
      if (typeof expr === 'string' && isbarevar(expr) && trustworthy.has(expr)) {
        return { value: values[expr], isTrustworthy: true, isStable: true, stableNonSingleton: true }
      }
    }
    if (eqn.length === 2) {
      for (const expr of eqn) {
        if (typeof expr === 'string' && isbarevar(expr) && (stableDerived.has(expr) || solvedFromStableThisPass.has(expr))) {
          return { value: values[expr], isTrustworthy: false, isStable: true, stableNonSingleton: true }
        }
      }
    }
    let bestStable = null
    let bestStableScore = -1
    for (const expr of eqn) {
      if (typeof expr !== 'string' || isbarevar(expr)) continue
      const vars = varparse(expr)
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
      if (typeof expr === 'string' && isbarevar(expr) &&
          (trustworthy.has(expr) || stableDerived.has(expr) || solvedFromStableThisPass.has(expr))) {
        return { value: values[expr], isTrustworthy: trustworthy.has(expr), isStable: true, stableNonSingleton: true }
      }
    }
    for (const expr of eqn) {
      if (typeof expr === 'string' && isbarevar(expr) && isKnown(expr)) {
        return { value: values[expr], isTrustworthy: false, stableNonSingleton: false }
      }
    }
    for (const expr of eqn) {
      if (typeof expr === 'string' && !isbarevar(expr)) {
        const r = evalExpr(expr)
        if (!r.error && isFinite(r.value) && r.value !== null) {
          return { value: r.value, isTrustworthy: false, stableNonSingleton: false }
        }
      }
    }
    if (eqn.some(e => typeof e === 'string' && isbarevar(e))) {
      return { value: 1, isTrustworthy: false, isStable: false, stableNonSingleton: false }
    }
    return null
  }

  function scaleHomogeneousExpr(expr, exprVars, target) {
    const base = evalExpr(expr)
    if (base.error || !isFinite(base.value)) return null
    const current = base.value
    if (current === 0) return null
    const ratio = target / current
    if (!isFinite(ratio) || ratio < 0) return null

    const probeFactor = 2
    const probed = { ...values }
    for (const v of exprVars) {
      if (!isKnown(v)) return null
      probed[v] = values[v] * probeFactor
    }
    const probe = vareval(expr, probed)
    if (probe.error || !isFinite(probe.value)) return null
    if (probe.value === 0) return null

    const degree = Math.log(Math.abs(probe.value / current)) / Math.log(probeFactor)
    if (!isFinite(degree) || Math.abs(degree) < 1e-12) return null

    const scale = ratio === 0 ? 0 : Math.pow(ratio, 1 / degree)
    if (!isFinite(scale)) return null

    const scaled = { ...values }
    for (const v of exprVars) {
      const next = values[v] * scale
      const lower = inf[v]
      const upper = sup[v]
      if (typeof lower === 'number' && isFinite(lower) && next < lower) return null
      if (typeof upper === 'number' && isFinite(upper) && next > upper) return null
      scaled[v] = next
    }

    const check = vareval(expr, scaled)
    if (check.error || !isFinite(check.value)) return null
    if (Math.abs(check.value - target) > tolerance(target, tol, absTol)) return null

    return scaled
  }

  // Main solving loop
  for (let pass = 0; pass < 20; pass++) {
    let changed = false
    solvedThisPass = new Set()
    solvedFromStableThisPass = new Set()

    for (let i = 0; i < 10; i++) {
      if (!propagateDefs()) break
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

        if (isbarevar(expr)) {
          if (literalPinned.has(expr)) continue
          if (!eqnHasLiteral && constrained.has(expr) && isKnown(expr) && values[expr] !== target) continue
          if (!isKnown(expr) || values[expr] !== target) {
            markSolved(expr, target, { isTrustworthy, isStable: targetIsStable, isStableNonSingleton: targetStableNonSingleton, eqnLen: eqn.length })
            changed = true
          }
          if (targetIsStable && isKnown(expr) && values[expr] === target && !stableDerived.has(expr)) {
            if (isTrustworthy || (eqn.length === 2 && targetStableNonSingleton) || constrained.size === 0) {
              stableDerived.add(expr)
              changed = true
            }
          }
          continue
        }

        // Complex expression
        const exprVars = varparse(expr)
        const unknowns = [...exprVars].filter(v => !isKnown(v) && !constrained.has(v) && !solvedThisPass.has(v))

        if (unknowns.length === 1) {
          const solvedVal = solveFor(expr, unknowns[0], target, values, inf[unknowns[0]], sup[unknowns[0]])
          if (solvedVal !== null) {
            markSolved(unknowns[0], solvedVal, { isTrustworthy, isStable: targetIsStable, isStableNonSingleton: targetStableNonSingleton, eqnLen: eqn.length })
            changed = true
          }
        } else if (unknowns.length === 0 && (isTrustworthy || targetIsStable || (eqn.length === 2 && !eqnSatisfiedNow))) {
          // Handle unixtime inversion
          const uargs = unixtimeArgs(expr)
          if (uargs) {
            const inv = invertUnixtimeSeconds(target)
            if (inv) {
              const dateVars = [uargs.y, uargs.mo, uargs.d]
              const untouched = v => !constrained.has(v) && !trustworthy.has(v) && !solvedThisPass.has(v)
              if (dateVars.every(untouched)) {
                try {
                  const check = unixtime(inv.y, inv.mo, inv.d)
                  if (check === target) {
                    const opts = { isTrustworthy, isStable: targetIsStable, isStableNonSingleton: targetStableNonSingleton, eqnLen: eqn.length }
                    const invVals = [inv.y, inv.mo, inv.d]
                    dateVars.forEach((v, i) => markSolved(v, invVals[i], opts))
                    changed = true
                    continue
                  }
                } catch (e) {
                  console.warn('unixtime inversion failed:', e)
                }
              }
            }
          }

          // Generic: try each variable
          const allowTrustworthy = eqnHasLiteral
          let bestVar = null
          let bestVal = null
          let bestChange = Infinity
          for (const v of exprVars) {
            if (constrained.has(v) || solvedThisPass.has(v) || (trustworthy.has(v) && !allowTrustworthy)) continue
            const solvedVal = solveFor(expr, v, target, values, inf[v], sup[v])
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
            markSolved(bestVar, bestVal, { isTrustworthy, isStable: targetIsStable, isStableNonSingleton: targetStableNonSingleton, eqnLen: eqn.length })
            changed = true
          } else {
            const scaleVars = [...exprVars].filter(v =>
              !constrained.has(v) && !trustworthy.has(v) && !solvedThisPass.has(v))
            if (scaleVars.length === exprVars.size && scaleVars.length > 1) {
              const scaled = scaleHomogeneousExpr(expr, scaleVars, target)
              if (scaled) {
                for (const v of scaleVars) {
                  markSolved(v, scaled[v], { isTrustworthy, isStable: targetIsStable, isStableNonSingleton: targetStableNonSingleton, eqnLen: eqn.length })
                }
                changed = true
              }
            }
          }
        }
      }
    }

    if (!changed) break
  }

  // Handle self-referential equations (e.g., 1/phi = phi - 1)
  solveSelfRef(eqns, values, constrained, trustworthy, inf, sup)

  // Fallback: 1D search on root variables
  if (!eqnsSatisfied(eqns, values)) {
    rootSearch(eqns, values, constrained, tol)
  }

  const zij = zidge(eqns, values)
  const sat = eqnsSatisfied(eqns, values) && boundsSatisfied(values, inf, sup)
  return { ass: values, zij, sat }
}

// =============================================================================
// newtRaphson: Newton-Raphson for non-linear systems
// =============================================================================
// For fully-determined non-linear systems (n equations, n unknowns), use
// Newton's method to find a solution. This handles cases like w*h=A, w²+h²=z²
// that gaussJordan can't handle and kludgeOrama solves greedily.

function newtRaphson(eqns, vars, inf, sup, knownVars = null) {
  const values = { ...vars }

  // Build list of constraint equations: pairs of expressions that should be equal
  // Each equation [a, b, c, ...] means a=b, b=c, etc.
  const constraints = []
  for (const eqn of eqns) {
    if (eqn.length < 2) continue
    for (let i = 0; i < eqn.length - 1; i++) {
      constraints.push({ left: eqn[i], right: eqn[i + 1] })
    }
  }

  if (constraints.length === 0) {
    return { ass: values, zij: zidge(eqns, values), sat: eqnsSatisfied(eqns, values) }
  }

  // Find variables that appear in non-linear expressions and aren't pinned
  // (not to be confused with pegged)
  const allVars = new Set()
  const pinnedVars = new Set()
  const tryPin = (expr, num) => {
    if (typeof num === 'number' && typeof expr === 'string' && isbarevar(expr)) {
      pinnedVars.add(expr)
      values[expr] = num
    }
  }
  for (const c of constraints) {
    tryPin(c.right, c.left)
    tryPin(c.left, c.right)
    if (typeof c.left === 'string') for (const v of varparse(c.left)) allVars.add(v)
    if (typeof c.right === 'string') for (const v of varparse(c.right)) allVars.add(v)
  }

  // Variables to solve for: those not pinned to literals (not to be confused
  // with pegged)
  const allSolveVars = [...allVars].filter(v => !pinnedVars.has(v)).sort()

  // For potentially underdetermined systems with knownVars, let kludgeOrama handle it.
  // kludgeOrama's trustworthy mechanism preserves init values when multiple solutions exist.
  // Use a margin of 2 to account for redundant/dependent constraints that simple counting misses.
  // For clearly overdetermined systems, Newton is needed to find the unique solution.
  const potentiallyUnderdetermined = constraints.length <= allSolveVars.length + 1
  if (potentiallyUnderdetermined && knownVars && knownVars.size > 0) {
    return { ass: values, zij: zidge(eqns, values), sat: false }
  }
  const solveVars = allSolveVars

  // Newton is for multi-variable non-linear systems only.
  // Single-variable problems are better handled by kludgeOrama's solveFor.
  // Need at least 2 unknowns and at least as many constraints.
  if (solveVars.length < 2 || constraints.length < solveVars.length) {
    return { ass: values, zij: zidge(eqns, values), sat: false }
  }

  // Evaluate residual: for each constraint, compute left - right
  function evalResiduals(testValues) {
    const residuals = []
    for (const c of constraints) {
      const leftVal = typeof c.left === 'number' ? c.left : vareval(c.left, testValues).value
      const rightVal = typeof c.right === 'number' ? c.right : vareval(c.right, testValues).value
      if (!isFinite(leftVal) || !isFinite(rightVal)) return null
      residuals.push(leftVal - rightVal)
    }
    return residuals
  }

  // Compute Jacobian numerically
  function computeJacobian(testValues) {
    const h = 1e-7
    const baseResiduals = evalResiduals(testValues)
    if (!baseResiduals) return null

    const jacobian = []
    for (let j = 0; j < solveVars.length; j++) {
      const v = solveVars[j]
      const perturbed = { ...testValues, [v]: testValues[v] + h }
      const perturbedResiduals = evalResiduals(perturbed)
      if (!perturbedResiduals) return null

      const col = perturbedResiduals.map((r, i) => (r - baseResiduals[i]) / h)
      jacobian.push(col)
    }
    return { jacobian, residuals: baseResiduals }
  }

  // Solve J * delta = -residuals using least squares (J^T J delta = -J^T r)
  function solveLinearSystem(jacobian, residuals) {
    const n = solveVars.length
    const m = residuals.length

    // Compute J^T * J and J^T * (-r)
    const JtJ = Array(n).fill(null).map(() => Array(n).fill(0))
    const Jtr = Array(n).fill(0)

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        for (let k = 0; k < m; k++) {
          JtJ[i][j] += jacobian[i][k] * jacobian[j][k]
        }
      }
      for (let k = 0; k < m; k++) {
        Jtr[i] -= jacobian[i][k] * residuals[k]
      }
    }

    // Add small regularization for numerical stability
    for (let i = 0; i < n; i++) JtJ[i][i] += 1e-10

    // Gaussian elimination
    const aug = JtJ.map((row, i) => [...row, Jtr[i]])
    for (let col = 0; col < n; col++) {
      let maxRow = col
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row
      }
      [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]]

      if (Math.abs(aug[col][col]) < 1e-12) continue

      for (let row = col + 1; row < n; row++) {
        const factor = aug[row][col] / aug[col][col]
        for (let j = col; j <= n; j++) aug[row][j] -= factor * aug[col][j]
      }
    }

    // Back substitution
    const delta = Array(n).fill(0)
    for (let i = n - 1; i >= 0; i--) {
      let sum = aug[i][n]
      for (let j = i + 1; j < n; j++) sum -= aug[i][j] * delta[j]
      delta[i] = Math.abs(aug[i][i]) > 1e-12 ? sum / aug[i][i] : 0
    }

    return delta
  }

  // Newton iteration
  const MAX_ITER = 50
  const test = { ...values }

  // Newton needs non-zero starting points to compute meaningful derivatives.
  for (let i = 0; i < solveVars.length; i++) {
    const v = solveVars[i]
    if (test[v] === null || test[v] === undefined || !isFinite(test[v]) || test[v] === 0) {
      return { ass: values, zij: zidge(eqns, values), sat: false }
    }
    // Add small perturbation to break symmetry (helps when Jacobian is singular at equal values)
    test[v] = test[v] * (1 + 0.01 * (i + 1))
  }

  for (let iter = 0; iter < MAX_ITER; iter++) {
    // Check convergence
    if (eqnsSatisfied(eqns, test)) {
      return { ass: test, zij: zidge(eqns, test), sat: true }
    }

    const result = computeJacobian(test)
    if (!result) break

    const { jacobian, residuals } = result

    // Check if residuals are small enough
    const maxResidual = Math.max(...residuals.map(Math.abs))
    if (maxResidual < TOL_ABS) {
      return { ass: test, zij: zidge(eqns, test), sat: eqnsSatisfied(eqns, test) }
    }

    const delta = solveLinearSystem(jacobian, residuals)

    // Line search: try full step, then halve if it makes things worse
    let alpha = 1
    const currentError = residuals.reduce((s, r) => s + r * r, 0)

    for (let ls = 0; ls < 10; ls++) {
      const candidate = { ...test }
      for (let i = 0; i < solveVars.length; i++) {
        candidate[solveVars[i]] = test[solveVars[i]] + alpha * delta[i]
      }

      const newResiduals = evalResiduals(candidate)
      if (newResiduals) {
        const newError = newResiduals.reduce((s, r) => s + r * r, 0)
        if (newError < currentError) {
          for (let i = 0; i < solveVars.length; i++) {
            test[solveVars[i]] = candidate[solveVars[i]]
          }
          break
        }
      }
      alpha *= 0.5
    }

    // Check for convergence in variable space
    const maxDelta = Math.max(...delta.map(d => Math.abs(d * alpha)))
    if (maxDelta < TOL_TIGHT) break
  }

  const sat = eqnsSatisfied(eqns, test) && boundsSatisfied(test, inf, sup)
  return { ass: test, zij: zidge(eqns, test), sat }
}

// =============================================================================
// solvem: Kitchen-sink solver - tries multiple solvers in sequence
// =============================================================================
// Try each solver in order. First one to return sat=true wins.

function solvem(eqns, init, infimum = {}, supremum = {}, knownVars = null) {
  // Filter out singletons (length 0 or 1) - they're display-only cells, not constraints.
  // We keep track of original indices to produce parallel zij array.
  // TODO: A cleaner design would have callers filter singletons before calling solvem,
  // making solvem more like Mathematica's Solve (expects a simple list of equations).
  // That's more anti-postel and better separation of concerns.
  const nonSingletonIndices = []
  const actualEqns = []
  for (let i = 0; i < eqns.length; i++) {
    if (eqns[i].length >= 2) {
      nonSingletonIndices.push(i)
      actualEqns.push(eqns[i])
    }
  }

  // Seed MISSING variables from bounds (moved here from reciplogic.js initSeeds).
  // Variables explicitly in init (even if null) are passed through to solvers -
  // the solver's isKnown() distinguishes user-provided values from unknowns.
  // Only truly missing variables (not in init at all) get seeded here.
  // NOTE: Use full eqns list (not actualEqns) to find required vars - singleton
  // equations like ['x'] still need x seeded even though they're not constraints.
  const seededInit = { ...init }
  const computedKnownVars = knownVars ? new Set(knownVars) : new Set()
  const required = requiredVars(eqns)

  for (const v of required) {
    const inInit = Object.prototype.hasOwnProperty.call(seededInit, v)
    const val = seededInit[v]
    const hasVal = typeof val === 'number' && isFinite(val)
    const lo = infimum[v], hi = supremum[v]
    const hasLo = typeof lo === 'number' && isFinite(lo)
    const hasHi = typeof hi === 'number' && isFinite(hi)

    if (hasVal) {
      // Clamp provided value to bounds
      const minBound = hasLo ? lo : val
      const maxBound = hasHi ? hi : val
      seededInit[v] = Math.min(maxBound, Math.max(minBound, val))
    } else if (!inInit) {
      // Variable is truly missing - seed from bounds or default to 1
      if (hasLo && hasHi) {
        seededInit[v] = (lo + hi) / 2
        if (!knownVars) computedKnownVars.add(v)
      } else if (hasLo) {
        seededInit[v] = lo + 1
        if (!knownVars) computedKnownVars.add(v)
      } else if (hasHi) {
        seededInit[v] = hi - 1
        if (!knownVars) computedKnownVars.add(v)
      } else {
        seededInit[v] = 1
      }
    }
    // If inInit but !hasVal (e.g., null), leave it for solvers to handle
  }

  // Helper to map zij back to original indices (0 for singletons)
  function expandZij(compactZij) {
    const result = new Array(eqns.length).fill(0)
    for (let i = 0; i < nonSingletonIndices.length; i++)
      result[nonSingletonIndices[i]] = compactZij[i]
    return result
  }

  let bestResult = null
  for (const solver of SOLVERS) {
    const result = solver(actualEqns, seededInit, infimum, supremum, computedKnownVars)
    if (result.sat) {
      return { ass: result.ass, zij: expandZij(result.zij), sat: true }
    }
    // Prefer results with actual values over results with nulls
    const hasNulls = Object.values(result.ass).some(v => v === null || 
                                                         v === undefined)
    if (!bestResult || !hasNulls) bestResult = result
  }

  // No solver found a satisfying assignment, return best attempt
  const finalZij = bestResult ? expandZij(bestResult.zij) 
                              : expandZij(zidge(actualEqns, boundedInit))
  return bestResult ? { ass: bestResult.ass, zij: finalZij, sat: false }
                    : { ass: boundedInit,    zij: finalZij, sat: false }
}

// =============================================================================
// Exports (for browser use, these become globals)
// =============================================================================

// For Node.js module exports
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    preval,
    vareval,
    varparse,
    isconstant,
    isbarevar,
    solvem,
  }
}
