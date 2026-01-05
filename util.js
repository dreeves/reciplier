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

// Evaluate an expression with given variable values
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
