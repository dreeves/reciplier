// NON-DRY WARNING: Master copy lives in H.M.S. Parsafore in the tminder repo.
function deoctalize(s) {
  if (s.includes('Z')) return "ERROR" // Z is our sentinel; maybe return null?
  s = s.replace(/\b0+(?!\d)/g, 'Z')   // replace NON-leading zeros with sentinel 
       .replace(/[1-9\.]0+/g, m => m.replace(/0/g, 'Z')) // save these too
       .replace(/0/g, '')             // throw away the rest of the zeros
       .replace(/Z/g, '0')            // turn sentinels back to zeros
  return s
}

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

// Evaluate an expression with given variable values [TODO: example?]
// Returns { value, error } where error is null on success
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

// An equation is a list of expressions taken to all be equal.
// This function takes a list of equations and a hash of variables with initial
// numerical assignments and returns a satisfying assignment of numeric values
// to the variables. For example, 
// satsolve([['2x+3y', 33], ['5x-4y', 2]], {x: 6, y: 0]) returns {x: 6, y: 7}.
// It does this by trying each variable one at a time and doing a binary search
// for a value that satisfies the equations. So in this example, it only works 
// because one of the variables was already correct. If initial values of 
// {x: 0, y: 0} were passed in, it would fail to find a satisfying assignment.
// (In the future if we have a use case for soving simultaneous equations we can
// extend this. For linear equations it's perfectly doable with Gaussian 
// elimination. And we could get arbitrarily fancy, like calling out to
// something like Mathematica's NMinimize or whatever.)
function satsolve(eqns, vars) {

}