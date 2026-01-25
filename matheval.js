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

function vareval(expr, vars) {
  try {
    const jsExpr = deoctalize(preval(expr))

    // Build variable assignments
    const assignments = Object.entries(vars)
      .map(([name, val]) => {
        // null/undefined should behave like unknowns, not like 0.
        const jsVal = (val === null || val === undefined) ? 'NaN' : String(val)
        return `const ${name} = ${jsVal};`
      }).join('\n')

    // Create function with unixtime available in scope
    const fn = new Function('unixtime', `
      "use strict";
      ${assignments}
      return (${jsExpr});
    `)
    const result = fn(unixtime)
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

function varparse(expr) {
  if (typeof expr !== 'string' || expr.trim() === '') return new Set()
  const matches = expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || []
  const vars = matches.filter(v => !RESERVED_WORDS.has(v))
  return new Set(vars.sort())
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

//globalThis.deoctalize = deoctalize
typeof module !== 'undefined' && module.exports && (module.exports = {
  //deoctalize,
  preval,
  unixtime,
  vareval,
  varparse,
  isbarevar,
  isconstant,
  tolerance
})
