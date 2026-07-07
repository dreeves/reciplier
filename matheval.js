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

  // Implicit multiplication: number followed by letter or open paren (but not
  // inside identifiers). Eg, 2x -> 2*x, 2(x+1) -> 2*(x+1), but x2a stays x2a
  js = js.replace(/(?<![a-zA-Z_])(\d+\.?\d*)\s*([a-zA-Z_(])/g, '$1*$2')

  // Math functions
  js = js.replace(
    /\b(sqrt|floor|ceil|round|min|max|sin|cos|tan|asin|acos|atan|log|exp|abs)\s*\(/g,
    'Math.$1(')

  // Exponentiation: x^2 -> x**2
  js = js.replace(/\^/g, '**')

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
  const bad = x => !Number.isInteger(x)
  const pre = "unixtime: invalid"
  if (bad(yy))                      throw new Error(pre+` year: ${String(y)}`)
  if (bad(mm) || mm < 1 || mm > 12) throw new Error(pre+` month: ${String(m)}`)
  if (bad(dd) || dd < 1 || dd > 31) throw new Error(pre+` day: ${String(d)}`)

  const ms = Date.UTC(yy, mm - 1, dd)
  if (!Number.isFinite(ms))      throw new Error(pre+` date: ${yy}-${mm}-${dd}`)
  return ms / 1000
}

// Cache of compiled evaluators, keyed by expression string. Compiling with
// new Function costs ~1000x calling the compiled function, and the solver
// evaluates the same few expressions thousands of times per solve (numeric
// Jacobians, iteration loops), so caching here is load-bearing for UI
// responsiveness. Cleared wholesale if it ever grows huge (free-typing in the
// template editor mints a new expression string per keystroke).
const EVAL_CACHE_MAX = 10000
const evalCache = new Map()

function compileExpr(expr) {
  let compiled = evalCache.get(expr)
  if (compiled === undefined) {
    const jsExpr = deoctalize(preval(expr))
    const params = [...varparse(expr)]
    const fn = new Function('unixtime', ...params,
                            `"use strict"; return (${jsExpr});`)
    compiled = { fn, params }
    if (evalCache.size >= EVAL_CACHE_MAX) evalCache.clear()
    evalCache.set(expr, compiled)
  }
  return compiled
}

function vareval(expr, vars) {
  try {
    const { fn, params } = compileExpr(expr)
    const args = params.map(p => {
      if (!Object.hasOwn(vars, p)) {
        throw new ReferenceError(`${p} is not defined`)
      }
      const val = vars[p]
      // null/undefined should behave like unknowns, not like 0.
      return (val === null || val === undefined) ? NaN : val
    })
    const result = fn(unixtime, ...args)
    return { value: result, error: null }
  } catch (e) {
    // TODO: this smells. could we fix this by using normal eval?
    // SyntaxErrors reference our wrapper code (e.g., the ')' in "return (expr);"),
    // so show a generic message. Other errors (ReferenceError, etc.) are useful.
    const msg = e instanceof SyntaxError ? "Invalid expression" : e.message
    return { value: null, error: msg }
  }
}

// =============================================================================
// varparse: Extract variable names from an expression
// =============================================================================

const RESERVED_WORDS = new Set(['sqrt', 'floor', 'ceil', 'round', 'min', 'max',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'exp', 'abs',
  'unixtime'])

// Memoized: the solver calls this in hot loops with the same handful of
// expressions. Callers get the shared cached Set -- treat it as read-only.
const varparseCache = new Map()

function varparse(expr) {
  if (typeof expr !== 'string' || expr.trim() === '') return new Set()
  let vars = varparseCache.get(expr)
  if (vars === undefined) {
    const matches = expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) ?? []
    vars = new Set(matches.filter(v => !RESERVED_WORDS.has(v)).sort())
    if (varparseCache.size >= EVAL_CACHE_MAX) varparseCache.clear()
    varparseCache.set(expr, vars)
  }
  return vars
}

function isbarevar(expr) {
  if (typeof expr !== 'string') return false
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(expr.trim())
}

// =============================================================================
// isconstant: Check if an expression evaluates to a number (no variables)
// =============================================================================

function isconstant(expr) {
  const r = vareval(expr, {})
  return !r.error && typeof r.value === 'number' && isFinite(r.value)
}

// =============================================================================
// tolerance: Compute relative+absolute tolerance for floating point comparison
// =============================================================================
// Pattern: Math.abs(value) * relTol + absTol (relative scales with magnitude)

function tolerance(value, relTol = 1e-9, absTol = relTol) {
  return Math.abs(value) * relTol + absTol
}

// =============================================================================
// isValidResult: Check if a vareval result is valid (no error, finite value)
// =============================================================================
// DRY helper to replace repeated pattern: r.error || !isFinite(r.value)

function isValidResult(r) {
  return !r.error && isFinite(r.value)
}

typeof module !== 'undefined' && module.exports && (module.exports = {
  preval,
  unixtime,
  vareval,
  varparse,
  isbarevar,
  isconstant,
  tolerance,
  isValidResult
})
