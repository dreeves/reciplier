// Reciplier - Constraint-based recipe scaling system
// Supports {expr} syntax with labels, constraints, and Mathematica-style math

// ============================================================================
// Recipe Data
// ============================================================================

const recipesShown = {
  'crepes':    "Soule-Reeves Crepes",
  'pyzza':     "Pythagorean Triple Pizza",
  'cookies':   "Camelot Chocolate Chip Cookies",
  'shortcake': "Shortcake",
  'simeq':     "Simultaneous Equation Cake",
  'pancakes':  "Pancakes according to Claude",
  'breakaway': "Breakaway Biscuits",
  'biketour':  "Bike Tour Bisque",
  'blank':     "Blank -- go crazy",
}

const recipeHash = {
// -----------------------------------------------------------------------------
'OLDcrepesSCHDEL': `\
* eggs: 12 large ones
* milk: 5.333 cups (1.262 liters or 1301 grams)
* flour: 3 cups (380 grams)
* butter: 8 tbsp melted (112 grams)
* salt: 2 tsp (14 grams) 

Yield: roughly 29 crepes
`,
// -----------------------------------------------------------------------------
'crepes': `\
* eggs: {12x} large ones
* milk: {5.333x} cups ({1.262x} liters or {1301x} grams)
* flour: {3x} cups ({380x} grams)
* butter: {8x} tbsp melted ({112x} grams)
* salt: {2x} tsp ({14x} grams) 

Yield: roughly {29x} crepes

Scaled by a factor of {x:1}
`,
// -----------------------------------------------------------------------------
'pyzza': `\
Scaled by a factor of x=[x:1]. TODO

Roll out dough into a right triangle with legs of length a={a:3} and b={b:4} and hypotenuse c={c:}.
Then eat it.

Sanity check: {a^2 + b^2 = c^2}
`,
// -----------------------------------------------------------------------------
'cookies': `\
* {1x} cup ({200x}g) granulated sugar
* {1x} cup ({206x}g) brown sugar (up to {220x}g)
* {1x} cup ({227x}g) butter, softened
* {2x} eggs ({109x}g)
* {1.5x} teaspoons vanilla or {10x}g vanilla paste
* {1x} teaspoon ({6x}g) baking soda
* {1x} teaspoon ({5x}g) salt
* {3x} cups ({376x}g) all purpose flour (as low as {360x}g; we've done much higher via packed cups, most recently tried {376x}g)
* {12x} ounces ({338x}g) semi-sweet chocolate chips (danthany version: half semi-sweet and half milk chocolate)

Place sugar, butter, eggs, and vanilla in mixer bowl. Attach bowl and flat beater to mixer. Turn to speed 2 and mix about 30 seconds. Stop and scrape bowl.

Turn to Stir Speed. Gradually add baking soda, salt, and flour to sugar mixture and mix about 2 minutes. Turn to speed 2 and mix about 30 seconds. Stop and scrape bowl. Add chocolate chips. Turn to Stir Speed and mix about 15 seconds. 

Drop rounded teaspoonfuls onto greased baking sheets, about 2 inches apart. Bake at 375 F for 10 to 12 minutes. Remove from backing sheets *immediately* and cool on wire racks. 

Yield: {54x} cookies, 117 cal (17g carb) per cookie.

Scaled by a factor of {x:1}
`,
// -----------------------------------------------------------------------------
'simeq': `\
2*{x:} + 3*{y:} = {2x + 3y = 33}
5*{x} - 4*{y} = {5x - 4y = 2}

(Expected solution: x=6, y=7)
`,
// -----------------------------------------------------------------------------
'OLDshortcakeSCHDEL': `\
Preheat oven to =325°F. Line bottom of =9x9 square pan with parchment paper.

* 2   C   flour (can do half/half cake flour)
* 1   C   sugar
* 1/2 C   butter (1 stick)
* 2   tsp baking powder
* 1/2 tsp salt
* 3/4 C   milk
* 1   tsp vanilla

Mix together dry ingredients. Add cold butter cut up into pieces and then cut into the flour as for making pastry, until it resembles coarse crumbs.

Add milk and vanilla and mix well.

Pour into the prepared cake pan, spread evenly. 

Bake =30 to =40 minutes @ =325°F
`,
// -----------------------------------------------------------------------------
'shortcake': `\
Preheat oven to 325°F. Line bottom of {9}x{9x}-inch pan with parchment paper.

* {2x}    C   flour (can do half/half cake flour)
* {1x}    C   sugar
* {1/2*x} C   butter ({1x} stick)
* {2x}    tsp baking powder
* {1/2*x} tsp salt
* {3/4*x} C   milk
* {1x}    tsp vanilla

Mix together dry ingredients. Add cold butter cut up into pieces and then cut into the flour as for making pastry, until it resembles coarse crumbs.

Add milk and vanilla and mix well.

Pour into the prepared cake pan, spread evenly. 

Bake 30 to 40 minutes @ 325°F

Scaled by a factor of {x:1}
`,
// -----------------------------------------------------------------------------
'pancakes': `\
{1x} cup all-purpose flour
{2x} tablespoons sugar
{2x} teaspoons baking powder
{0.5x} teaspoon salt
{1x} cup milk
{1x} large egg
{2x} tablespoons vegetable oil

Mix dry ingredients. Combine wet ingredients separately, then add to dry. 
Cook on a greased griddle at 350°F for about 2 minutes per side until golden.

Makes {8x} pancakes, 120 calories each.

Scaled by a factor of {x:1}
`,
// -----------------------------------------------------------------------------
'breakaway': `\
The riders in the break have a {m:1}:{s:30}s gap with {d:20}km ({0.621371d}mi) to go.
So if the break does {vb:40}km/h ({0.621371vb}mph) then the peloton needs to do {vp: pd/t}km/h ({0.621371vp}mph) to catch them at the line.

Scratchpad:
* Gap in hours: {gt: m/60+s/3600} (ie, {m+s/60 = gt*60}m or {60m+s = gt*3600}s)
* Gap distance: {gd: vb*gt}km ({0.621371gd}mi) (I think vb not vp for this?)
* Breakaway's time till finish: {t: d/vb}
* Peloton's distance to the line: {pd: d+gd}
`,
// -----------------------------------------------------------------------------
'biketour': `\
Distance:        {d:66} miles
Start time:      {h:6}:{m:45}am             ({s: h+m/60} as decimal hours)
End time:        {H:12}:{M:52} (24H format) ({e: H+M/60} as decimal hours)
Break 1:         {b1h:0}h{b1m:26}m          ({b1: b1h+b1m/60}h)
Break 2:         {b2h:0}h{b2m:37}m          ({b2: b2h+b2m/60}h)
Break 3:         {b3h:0}h{b3m:0}m           ({b3: b3h+b3m/60}h)
Total breaks:    {b: b1+b2+b3} hours
Wall clock time: {w: e-s} hours = {wh: floor(w)}h{wm: (w-floor(w))*60}m
Riding time:     {t: w-b} hours = {th: floor(t)}h{tm: (t-floor(t))*60}m
Avg speed:       {v: d/t} mph
Unadjusted spd:  {u: d/w} mph
`,
/*
Distance:        {d:66} miles               <!-- {d = v*t}                 -->
Start time:      {h:6}:{m:45}am             <!-- {s: h+m/60} & {s = e-d/u} -->
End time:        {H:12}:{M:52} (24H format) <!-- {e: H+M/60} & {e = s+d/u} -->
Break 1:         {b1h:0}h{b1m:26}m          <!-- {b1: b1h+b1m/60 }         -->
Break 2:         {b2h:0}h{b2m:37}m          <!-- {b2: b2h+b2m/60 }         -->
Break 3:         {b3h:0}h{b3m:00}m          <!-- {b3: b3h+b3m/60 }         -->
Total breaks:    {b: b1+b2+b3}              <!-- {b = e-s-d/v}             -->
Avg speed:       {v: d/t}                   <!-- {v = d/(e-s-b)}           -->
Unadjusted spd:  {u: d/w}                   <!-- {u = d/(e-s)}             -->
Wall clock time: {wh:}h{wm:}m               <!-- {w: wh+wm/60 = e-s}       -->
Riding time:     {th:}h{tm:}m               <!-- {t: th+tm/60 = e-s-b}     -->
*/
// -----------------------------------------------------------------------------
'blank': "",
};

// ============================================================================
// Utility Functions
// ============================================================================

function $(id) { return document.getElementById(id) }

function toNum(x) { 
  const n = parseFloat(x)
  return isNaN(n) ? null : n 
}

function formatNum(num) {
  if (typeof num !== 'number' || !isFinite(num)) return '?'
  // Show up to 4 decimal places, trim trailing zeros
  let s = num.toFixed(4).replace(/\.?0+$/, '')
  if (s === '-0') s = '0'
  return s
}

// ============================================================================
// Expression Parser
// ============================================================================

// Extract all {...} blocks from text, noting which are inside HTML comments
function extractBlocks(text) {
  const blocks = []
  let blockId = 0
  
  // First, find all HTML comments and their ranges
  const commentRanges = []
  const commentRegex = /<!--[\s\S]*?-->/g
  let commentMatch
  while ((commentMatch = commentRegex.exec(text)) !== null) {
    commentRanges.push({
      start: commentMatch.index,
      end: commentMatch.index + commentMatch[0].length
    })
  }
  
  // Helper to check if position is inside a comment
  function inComment(pos) {
    return commentRanges.some(r => pos >= r.start && pos < r.end)
  }
  
  // Find all {...} blocks (simple non-nested matching)
  const blockRegex = /\{([^{}]*)\}/g
  let match
  while ((match = blockRegex.exec(text)) !== null) {
    blocks.push({
      id: `block_${blockId++}`,
      raw: match[0],
      content: match[1],
      inComment: inComment(match.index),
      startIndex: match.index,
      endIndex: match.index + match[0].length
    })
  }
  
  return blocks
}

// Parse a single block's content into label and expressions
// Format: [label:] expr1 [= expr2 [= expr3 ...]]
function parseBlock(block) {
  const content = block.content.trim()
  
  // Check for label (identifier followed by colon)
  // Label pattern: starts with letter or underscore, followed by alphanumerics
  const labelMatch = content.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/)
  
  let label = null
  let exprPart = content
  
  if (labelMatch) {
    label = labelMatch[1]
    exprPart = labelMatch[2]
  }
  
  // Split by = to get constraint expressions (but be careful with == or !=)
  // We want to split on single = that's not part of == or !=
  // Simple approach: split on = and filter empty strings
  const expressions = exprPart.split(/(?<![=!<>])=(?!=)/).map(e => e.trim()).filter(e => e !== '')
  
  return {
    ...block,
    label,
    expressions,
    hasConstraint: expressions.length > 1
  }
}

// Add nonce labels to blocks that don't have them
function preprocessLabels(blocks) {
  let nonceCounter = 1
  return blocks.map(block => {
    if (block.label === null) {
      return {
        ...block,
        label: `_var${String(nonceCounter++).padStart(3, '0')}`,
        isNonce: true
      }
    }
    return { ...block, isNonce: false }
  })
}

// ============================================================================
// Mathematica-style Syntax Conversion
// ============================================================================

// Convert expression syntax to JavaScript
// Supports: implicit multiplication (2x -> 2*x), ^ for exponentiation, math functions, pi
function toJavaScript(expr) {
  if (!expr || typeof expr !== 'string') return '0'
  
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
function evaluate(expr, vars) {
  const jsExpr = toJavaScript(expr)
  
  // Build variable assignments
  const assignments = Object.entries(vars)
    .map(([name, val]) => `const ${name} = ${val};`)
    .join('\n')
  
  try {
    // Use Function constructor to evaluate in isolated scope
    const fn = new Function(`
      ${assignments}
      return (${jsExpr});
    `)
    const result = fn()
    return { value: result, error: null }
  } catch (e) {
    return { value: null, error: e.message }
  }
}

// ============================================================================
// Symbol Table and Validation
// ============================================================================

// Find all variable names referenced in an expression
// Works on the ORIGINAL expression (before toJavaScript transform) to preserve variable names
function findVariables(expr) {
  if (!expr || expr.trim() === '') return new Set()
  
  const reserved = new Set(['sqrt', 'floor', 'ceil', 'round', 'min', 'max', 
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'exp', 'abs', 'pi'])
  
  const matches = expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || []
  return new Set(matches.filter(v => !reserved.has(v)))
}

// Build symbol table from parsed blocks
function buildSymbolTable(blocks) {
  const symbols = {}
  const errors = []
  
  // First pass: collect all defined labels
  for (const block of blocks) {
    if (!block.isNonce) {
      if (symbols[block.label]) {
        errors.push(`Duplicate label: "${block.label}" defined multiple times`)
      } else {
        symbols[block.label] = {
          definedBy: block.id,
          value: null,
          fixed: false,
          expressions: block.expressions,
          isNonce: false
        }
      }
    } else {
      // Nonce labels still go in symbol table
      symbols[block.label] = {
        definedBy: block.id,
        value: null,
        fixed: false,
        expressions: block.expressions,
        isNonce: true
      }
    }
  }
  
  // Second pass: find all referenced variables and check they're defined
  const allReferenced = new Set()
  for (const block of blocks) {
    for (const expr of block.expressions) {
      const vars = findVariables(expr)
      vars.forEach(v => {
        allReferenced.add(v)
        if (!symbols[v]) {
          errors.push(`Undefined variable: "${v}" in expression "${expr}"`)
        }
      })
    }
  }
  
  // Third pass: check for disconnected variables (defined but never referenced)
  // Skip nonce labels for this check
  for (const [name, sym] of Object.entries(symbols)) {
    if (!sym.isNonce && !allReferenced.has(name)) {
      // Check if the variable references itself or other vars
      const selfRefs = sym.expressions.some(expr => {
        const vars = findVariables(expr)
        return vars.size > 0
      })
      if (!selfRefs) {
        // Case 6: human-labeled variable that's completely disconnected
        errors.push(`Disconnected variable: "${name}" is defined but never used`)
      }
    }
  }
  
  // Fourth pass: check for bare numbers in anonymous expressions
  for (const block of blocks) {
    if (block.isNonce && block.expressions.length === 1) {
      const expr = block.expressions[0]
      const vars = findVariables(expr)
      if (vars.size === 0) {
        // This is a bare number like {5}
        errors.push(`Bare number: "${block.raw}" has no variables and no label. Give it a label or add a variable reference.`)
      }
    }
  }
  
  return { symbols, errors }
}

// ============================================================================
// Initial Value Assignment
// ============================================================================

// Try to compute initial values for all variables
function computeInitialValues(blocks, symbols) {
  const values = {}
  const errors = []
  const emptyExprVars = new Set() // Track variables with empty expressions like {c:}
  
  // Sort blocks by dependency order (simple topological sort attempt)
  // Variables that only reference already-computed vars should be computed first
  
  // Start with explicit values: {d:9} means d=9
  // Also track variables with empty expressions that need solving
  for (const block of blocks) {
    if (block.expressions.length === 1) {
      const expr = block.expressions[0]
      
      // Check for empty expression like {c:}
      if (!expr || expr.trim() === '') {
        emptyExprVars.add(block.label)
        continue
      }
      
      const vars = findVariables(expr)
      
      // If the expression has no variables, it's a literal value
      if (vars.size === 0) {
        const result = evaluate(expr, {})
        if (result.error) {
          errors.push(`Error evaluating "${expr}": ${result.error}`)
        } else {
          values[block.label] = result.value
        }
      }
    } else if (block.expressions.length === 0) {
      emptyExprVars.add(block.label)
    }
  }
  
  // Iteratively compute values for remaining variables
  // Keep going until no more progress is made
  let changed = true
  let iterations = 0
  const maxIterations = 100
  
  while (changed && iterations < maxIterations) {
    changed = false
    iterations++
    
    for (const block of blocks) {
      if (values[block.label] !== undefined) continue // Already computed
      if (emptyExprVars.has(block.label)) continue // Skip empty-expr vars for now
      
      // Try to evaluate the first expression with current values
      const expr = block.expressions[0]
      if (!expr || expr.trim() === '') continue
      
      const vars = findVariables(expr)
      
      // Check if all required variables are available
      const allAvailable = [...vars].every(v => values[v] !== undefined)
      
      if (allAvailable) {
        const result = evaluate(expr, values)
        if (!result.error && result.value !== null && isFinite(result.value)) {
          values[block.label] = result.value
          changed = true
        }
      }
    }
    
    // Also try to solve empty-expr vars in each iteration (they may become solvable)
    for (const varName of emptyExprVars) {
      if (values[varName] !== undefined) continue
      const solved = solveFromConstraints(varName, blocks, values)
      if (solved !== null) {
        values[varName] = solved
        changed = true
      }
    }
  }
  
  // Now try to solve for empty-expression variables using constraints
  for (const varName of emptyExprVars) {
    if (values[varName] !== undefined) continue
    
    const solved = solveFromConstraints(varName, blocks, values)
    if (solved !== null) {
      values[varName] = solved
    } else {
      values[varName] = 1 // Default fallback
    }
  }
  
  // For any remaining undefined variables, set default value
  for (const block of blocks) {
    if (values[block.label] === undefined) {
      // Try with current partial values
      const expr = block.expressions[0]
      if (expr && expr.trim() !== '') {
        const result = evaluate(expr, values)
        if (!result.error && result.value !== null && isFinite(result.value)) {
          values[block.label] = result.value
          continue
        }
      }
      values[block.label] = 1 // Fallback default
    }
  }
  
  return { values, errors, emptyExprVars }
}

// ============================================================================
// Constraint Solver
// ============================================================================

// The ONE solver function: find value of varName such that expr evaluates to target
// Tries smart guesses first (handles non-monotonic cases like c^2), then binary search
function solve(expr, varName, target, values) {
  const test = { ...values }
  const tol = Math.abs(target) * 1e-9 + 1e-9
  
  // Helper to check if a guess works
  function tryGuess(guess) {
    if (!isFinite(guess)) return null
    test[varName] = guess
    const r = evaluate(expr, test)
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
  
  // Prefer positive solutions (try positive guesses first)
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
  
  // Binary search as fallback (for monotonic expressions)
  let lo = 0, hi = 1000
  
  // Find valid bounds
  for (let scale = 1; scale < 1e10; scale *= 10) {
    test[varName] = scale
    const hiRes = evaluate(expr, test)
    test[varName] = -scale  
    const loRes = evaluate(expr, test)
    
    if (!hiRes.error && !loRes.error) {
      if ((hiRes.value - target) * (loRes.value - target) <= 0) {
        lo = -scale
        hi = scale
        break
      }
    }
    
    test[varName] = 0
    const zeroRes = evaluate(expr, test)
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
    const r = evaluate(expr, test)
    if (r.error) return null
    
    if (Math.abs(r.value - target) < tol) return mid
    
    test[varName] = lo
    const loRes = evaluate(expr, test)
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
  const finalRes = evaluate(expr, test)
  if (finalRes.error || Math.abs(finalRes.value - target) > Math.abs(target) * 0.01 + 0.01) {
    return null  // Couldn't find a valid solution
  }
  return finalVal
}

// Find a constraint involving varName and solve for it
function solveFromConstraints(varName, blocks, values) {
  for (const block of blocks) {
    if (block.expressions.length < 2) continue
    
    // Find expressions with and without the variable
    let targetExpr = null, solveExpr = null
    for (const expr of block.expressions) {
      const vars = findVariables(expr)
      if (vars.has(varName)) {
        solveExpr = expr
      } else if (!targetExpr) {
        targetExpr = expr
      }
    }
    
    if (!solveExpr) continue // Variable not in this constraint
    if (!targetExpr) continue // No target expression without the variable
    
    // Check all other variables have values
    const allVars = findVariables(targetExpr)
    if (![...allVars].every(v => values[v] !== undefined)) continue
    
    // Evaluate target
    const targetRes = evaluate(targetExpr, values)
    if (targetRes.error || !isFinite(targetRes.value)) continue
    
    // Solve
    const result = solve(solveExpr, varName, targetRes.value, values)
    if (result !== null) return result
  }
  return null
}

// Check if initial values contradict any constraints (fail loudly per Anti-Postel)
// Skip checking constraints that involve variables with empty expressions (those need solving)
function checkInitialContradictions(blocks, values, emptyExprVars) {
  const errors = []
  
  for (const block of blocks) {
    if (block.expressions.length > 1) {
      // Check if this constraint involves any variable that needs to be computed
      const varsInConstraint = new Set()
      block.expressions.forEach(expr => {
        if (expr && expr.trim() !== '') {
          findVariables(expr).forEach(v => varsInConstraint.add(v))
        }
      })
      
      // Skip if any variable in this constraint has an empty expression (needs solving)
      const involvesEmptyVar = [...varsInConstraint].some(v => emptyExprVars.has(v))
      if (involvesEmptyVar) continue
      
      // This is a constraint - all expressions should evaluate equal
      const results = block.expressions.map(expr => {
        if (!expr || expr.trim() === '') return null
        const r = evaluate(expr, values)
        return r.error ? null : r.value
      })
      
      // Skip if any expression couldn't be evaluated
      if (results.some(r => r === null)) continue
      
      // Check if all results are approximately equal
      const first = results[0]
      const tolerance = Math.abs(first) * 1e-6 + 1e-6
      for (let i = 1; i < results.length; i++) {
        if (Math.abs(results[i] - first) > tolerance) {
          const exprStr = block.expressions.join(' = ')
          const valuesStr = results.map(r => formatNum(r)).join(' ≠ ')
          errors.push(`Contradiction: {${exprStr}} evaluates to ${valuesStr}`)
          break
        }
      }
    }
  }
  
  return errors
}

// Check if all constraints are satisfied with given values
function checkConstraints(blocks, values) {
  const violations = []
  const tol = 1e-9
  
  for (const block of blocks) {
    if (block.expressions.length < 2) continue
    
    const results = block.expressions.map(expr => {
      const r = evaluate(expr, values)
      return r.error ? null : r.value
    })
    
    if (results.some(r => r === null)) {
      violations.push({ block, message: 'Evaluation error' })
      continue
    }
    
    const first = results[0]
    const tolerance = Math.abs(first) * tol + tol
    for (let i = 1; i < results.length; i++) {
      if (Math.abs(results[i] - first) > tolerance) {
        violations.push({ block, message: `${formatNum(first)} ≠ ${formatNum(results[i])}` })
        break
      }
    }
  }
  return violations
}

// Solve constraints by adjusting unfixed variables
function solveConstraints(blocks, values, fixedVars, changedVar) {
  const newValues = { ...values }
  
  for (let pass = 0; pass < 10; pass++) {
    const violations = checkConstraints(blocks, newValues)
    if (violations.length === 0) break
    
    let madeProgress = false
    for (const { block } of violations) {
      if (block.expressions.length < 2) continue
      
      // Find all variables and which are adjustable
      const allVars = new Set()
      block.expressions.forEach(expr => findVariables(expr).forEach(v => allVars.add(v)))
      
      const adjustable = [...allVars].filter(v => !fixedVars.has(v) && v !== changedVar)
      if (adjustable.length === 0) continue
      
      // Find target (expression without adjustable var) and solve expression
      const varToSolve = adjustable[0]
      let targetExpr = null, solveExpr = null
      
      for (const expr of block.expressions) {
        const vars = findVariables(expr)
        if (vars.has(varToSolve)) {
          solveExpr = expr
        } else if (!targetExpr) {
          targetExpr = expr
        }
      }
      
      if (!targetExpr || !solveExpr) continue
      
      const targetRes = evaluate(targetExpr, newValues)
      if (targetRes.error) continue
      
      const newVal = solve(solveExpr, varToSolve, targetRes.value, newValues)
      if (newVal !== null && Math.abs(newVal - newValues[varToSolve]) > 1e-12) {
        newValues[varToSolve] = newVal
        madeProgress = true
      }
    }
    
    if (!madeProgress) break
  }
  
  return newValues
}

// ============================================================================
// State Management
// ============================================================================

let state = {
  recipeText: '',
  blocks: [],
  symbols: {},
  values: {},
  fixedVars: new Set(),
  errors: [],
  currentRecipeKey: ''
}

// ============================================================================
// Main Parse and Render Functions
// ============================================================================

function parseRecipe() {
  const text = state.recipeText
  
  if (!text.trim()) {
    state.blocks = []
    state.symbols = {}
    state.values = {}
    state.errors = []
    $('recipeOutput').style.display = 'none'
    $('copySection').style.display = 'none'
    updateRecipeDropdown()
    return
  }
  
  // Parse
  let blocks = extractBlocks(text)
  blocks = blocks.map(parseBlock)
  blocks = preprocessLabels(blocks)
  
  // Build symbol table
  const { symbols, errors: symbolErrors } = buildSymbolTable(blocks)
  
  // Compute initial values
  const { values, errors: valueErrors, emptyExprVars } = computeInitialValues(blocks, symbols)
  
  // Check for contradictions in initial values (skip constraints involving empty-expr vars)
  const contradictions = checkInitialContradictions(blocks, values, emptyExprVars)
  
  // Update state
  state.blocks = blocks
  state.symbols = symbols
  state.values = values
  state.errors = [...symbolErrors, ...valueErrors, ...contradictions]
  state.fixedVars = new Set()
  
  updateRecipeDropdown()
  renderRecipe()
}

function updateRecipeDropdown() {
  // Check if current text matches any recipe
  let matchingKey = ""
  for (const key in recipeHash) {
    if (recipeHash[key] === state.recipeText) {
      matchingKey = key
      break
    }
  }
  state.currentRecipeKey = matchingKey
  $('recipeSelect').value = matchingKey
}

function renderRecipe() {
  const output = $('recipeOutput')
  const copySection = $('copySection')
  
  // Update slider display
  updateSliderDisplay()
  
  if (state.blocks.length === 0 && state.errors.length === 0) {
    output.style.display = 'none'
    copySection.style.display = 'none'
    return
  }
  
  // Check for critical errors (will show banner but still render everything)
  const criticalErrors = state.errors.filter(e =>
    e.includes('Undefined') || e.includes('Duplicate') || e.includes('Contradiction') ||
    e.includes('Disconnected') || e.includes('Bare')
  )

  // Find all HTML comment ranges to strip them from output
  const text = state.recipeText
  const commentRanges = []
  const commentRegex = /<!--[\s\S]*?-->/g
  let commentMatch
  while ((commentMatch = commentRegex.exec(text)) !== null) {
    commentRanges.push({
      start: commentMatch.index,
      end: commentMatch.index + commentMatch[0].length
    })
  }
  
  // Helper to check if a position is inside a comment
  function isInComment(pos) {
    return commentRanges.some(r => pos >= r.start && pos < r.end)
  }
  
  // Helper to get the end of any comment that starts at or contains pos
  function getCommentEnd(pos) {
    for (const r of commentRanges) {
      if (pos >= r.start && pos < r.end) return r.end
      if (r.start === pos) return r.end
    }
    return pos
  }
  
  // Build the rendered text, skipping HTML comments entirely
  let html = ''
  let lastIndex = 0
  
  // Sort blocks by start index (only visible blocks)
  const visibleBlocks = state.blocks.filter(b => !b.inComment).sort((a, b) => a.startIndex - b.startIndex)
  
  for (const block of visibleBlocks) {
    // Add text before this block, but skip any HTML comments
    let textStart = lastIndex
    while (textStart < block.startIndex) {
      // Check if we're entering a comment
      const nextCommentStart = commentRanges.find(r => r.start >= textStart && r.start < block.startIndex)
      if (nextCommentStart) {
        // Add text before the comment
        if (nextCommentStart.start > textStart) {
          html += escapeHtml(text.substring(textStart, nextCommentStart.start))
        }
        // Skip the comment
        textStart = nextCommentStart.end
      } else {
        // No more comments before the block
        html += escapeHtml(text.substring(textStart, block.startIndex))
        break
      }
    }
    
    // Render the block as input field
    const value = state.values[block.label]
    const displayValue = formatNum(value)
    const isFixed = state.fixedVars.has(block.label)
    const title = `${block.label}: ${block.expressions.join(' = ')}`.replace(/"/g, '&quot;')
    
    html += `<input type="text" class="recipe-field ${isFixed ? 'fixed' : ''}" data-label="${block.label}" data-block-id="${block.id}" value="${displayValue}" title="${title}">`
    
    lastIndex = block.endIndex
  }
  
  // Add remaining text after last block, skipping comments
  let textStart = lastIndex
  while (textStart < text.length) {
    const nextComment = commentRanges.find(r => r.start >= textStart)
    if (nextComment) {
      // Add text before the comment
      if (nextComment.start > textStart) {
        html += escapeHtml(text.substring(textStart, nextComment.start))
      }
      // Skip the comment
      textStart = nextComment.end
    } else {
      // No more comments
      html += escapeHtml(text.substring(textStart))
      break
    }
  }
  
  // Convert newlines to <br> for display
  html = html.replace(/\n/g, '<br>')
  
  // Build error banner if there are critical errors (shown BEFORE the recipe, not instead of it)
  const errorBanner = criticalErrors.length > 0
    ? `<div class="error-display">
        ${criticalErrors.map(e => `<div class="error-message">⚠️ ${e}</div>`).join('')}
      </div>`
    : ''
  
  output.innerHTML = `${errorBanner}<div class="recipe-rendered">${html}</div>`
  output.style.display = 'block'
  copySection.style.display = 'block'
  
  // Attach event handlers to inputs
  output.querySelectorAll('input.recipe-field').forEach(input => {
    input.addEventListener('input', handleFieldInput)
    input.addEventListener('blur', handleFieldBlur)
    input.addEventListener('keypress', handleFieldKeypress)
    input.addEventListener('dblclick', handleFieldDoubleClick)
  })
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// ============================================================================
// Event Handlers
// ============================================================================

function handleFieldInput(e) {
  const input = e.target
  const label = input.dataset.label
  const blockId = input.dataset.blockId
  const newValue = toNum(input.value)
  
  // Invalid number format - just mark invalid, don't change state
  if (newValue === null || !isFinite(newValue)) {
    input.classList.add('invalid')
    return
  }
  
  const block = state.blocks.find(b => b.id === blockId)
  if (!block) return
  
  // Work on a COPY of values - only commit if constraints can be satisfied
  let testValues = { ...state.values }
  
  // Apply the new value
  const expr = block.expressions[0]
  const varsInExpr = findVariables(expr)
  
  // Track which variables are in the user's expression (shouldn't be adjusted by constraint solver)
  const userExprVars = new Set(varsInExpr)

  let solveSucceeded = false
  if (varsInExpr.size > 0) {
    // This field's value comes from an expression - solve for an unfixed variable
    const unfixed = [...varsInExpr].filter(v => !state.fixedVars.has(v))
    if (unfixed.length > 0) {
      const solved = solve(expr, unfixed[0], newValue, testValues)
      if (solved !== null) {
        testValues[unfixed[0]] = solved
        solveSucceeded = true
      }
    }
  } else {
    // This field is a simple value - set it directly
    testValues[label] = newValue
    solveSucceeded = true
    userExprVars.add(label)  // The label IS the variable being set, so protect it
  }

  // If we couldn't solve for the user's input, mark invalid and stop
  if (!solveSucceeded) {
    input.classList.add('invalid')
    return
  }

  // Temporarily treat variables in user's expression as fixed while solving constraints
  const tempFixed = new Set(state.fixedVars)
  userExprVars.forEach(v => tempFixed.add(v))

  // Try to solve all constraints with the new value
  testValues = solveConstraints(state.blocks, testValues, tempFixed, null)
  
  // Recompute derived values
  testValues = recomputeValues(state.blocks, testValues)
  
  // Check if constraints are satisfied
  const violations = checkConstraints(state.blocks, testValues)
  
  if (violations.length === 0) {
    // Success - commit the valid values
    state.values = testValues
    input.classList.remove('invalid')

    // Update all fields with the new valid values (including current, in case solver adjusted it)
    $('recipeOutput').querySelectorAll('input.recipe-field').forEach(field => {
      field.value = formatNum(state.values[field.dataset.label])
    })
  } else {
    // Constraints violated - mark invalid but don't change state.values
    input.classList.add('invalid')
  }
}

// Recompute all field values based on current variable values (mutates state.values)
function recomputeAllValues() {
  state.values = recomputeValues(state.blocks, state.values)
}

// Pure version: recompute derived values and return new values object
function recomputeValues(blocks, values) {
  const newValues = { ...values }
  
  // Multiple passes to handle dependencies
  for (let pass = 0; pass < 10; pass++) {
    let changed = false
    
    for (const block of blocks) {
      const expr = block.expressions[0]
      if (!expr || expr.trim() === '') continue
      
      const vars = findVariables(expr)
      
      // If all variables are defined, recompute this value
      const allDefined = [...vars].every(v => newValues[v] !== undefined)
      if (allDefined && vars.size > 0) {
        const result = evaluate(expr, newValues)
        if (!result.error && isFinite(result.value)) {
          const oldVal = newValues[block.label]
          if (oldVal === undefined || Math.abs(result.value - oldVal) > 1e-10) {
            newValues[block.label] = result.value
            changed = true
          }
        }
      }
    }
    
    if (!changed) break
  }
  
  return newValues
}

function handleFieldBlur(e) {
  const input = e.target
  const label = input.dataset.label
  
  // If field is invalid, revert to the valid value from state.values
  // Per README: "as soon as you clicked away from field c, it would recompute
  // itself as the only value that makes all the equations true"
  if (input.classList.contains('invalid')) {
    // state.values always contains consistent values, so just display them
    input.value = formatNum(state.values[label])
    input.classList.remove('invalid')
  }
}

function handleFieldKeypress(e) {
  if (e.key === 'Enter') {
    e.target.blur()
  }
}

function handleFieldDoubleClick(e) {
  const input = e.target
  const label = input.dataset.label
  
  // Per README: "you can't mark a field fixed when in that state" (invalid)
  if (input.classList.contains('invalid')) {
    return
  }
  
  // Toggle fixed state
  if (state.fixedVars.has(label)) {
    state.fixedVars.delete(label)
    input.classList.remove('fixed')
  } else {
    state.fixedVars.add(label)
    input.classList.add('fixed')
  }
}

function handleRecipeChange() {
  const selectedKey = $('recipeSelect').value
  state.currentRecipeKey = selectedKey
  if (recipeHash.hasOwnProperty(selectedKey)) {
    state.recipeText = recipeHash[selectedKey]
    $('recipeTextarea').value = state.recipeText
    parseRecipe()
  }
}

function handleTextareaInput(e) {
  state.recipeText = e.target.value
  parseRecipe()
}

// ============================================================================
// Copy Functionality
// ============================================================================

function getScaledRecipeText() {
  let result = ''
  let lastIndex = 0
  const text = state.recipeText
  
  const sortedBlocks = [...state.blocks].sort((a, b) => a.startIndex - b.startIndex)
  
  for (const block of sortedBlocks) {
    // Add text before this block
    if (block.startIndex > lastIndex) {
      result += text.substring(lastIndex, block.startIndex)
    }
    
    // Add the computed value (or original for comments)
    if (block.inComment) {
      result += block.raw
    } else {
      result += formatNum(state.values[block.label])
    }
    
    lastIndex = block.endIndex
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    result += text.substring(lastIndex)
  }
  
  return result
}

function handleCopyToClipboard() {
  if (!navigator.clipboard) {
    showNotification('Clipboard access not available')
    return
  }
  
  const scaledText = getScaledRecipeText()
  navigator.clipboard.writeText(scaledText)
    .then(() => showNotification('Recipe copied!'))
    .catch(err => {
      console.error('Failed to copy:', err)
      showNotification('Failed to copy recipe')
    })
}

let notificationTimeout = null

function showNotification(message) {
  const notif = $('notification')
  notif.textContent = message
  notif.style.display = 'block'
  
  if (notificationTimeout) clearTimeout(notificationTimeout)
  notificationTimeout = setTimeout(() => {
    notif.style.display = 'none'
  }, 2000)
}

// ============================================================================
// Scaling Slider
// ============================================================================

function updateSliderDisplay() {
  const slider = $('scalingSlider')
  const display = $('scalingDisplay')
  
  // Check if x variable exists in the current recipe
  const hasX = state.symbols && state.symbols.x !== undefined
  
  if (!hasX) {
    // Gray out the slider if no x variable
    slider.disabled = true
    slider.classList.add('disabled')
    display.textContent = 'n/a'
    display.classList.add('disabled')
    return
  }
  
  // Enable slider
  slider.disabled = false
  slider.classList.remove('disabled')
  display.classList.remove('disabled')
  
  const x = state.values.x || 1
  display.textContent = formatNum(x) //+ 'x'
  slider.value = Math.min(10, Math.max(0.1, x))
  
  // Green thumb when at 1x
  if (Math.abs(x - 1) < 0.005) {
    slider.classList.add('at-one-x')
  } else {
    slider.classList.remove('at-one-x')
  }
}

function handleSliderChange(e) {
  const newX = parseFloat(e.target.value)
  if (isNaN(newX) || newX <= 0) return
  
  // Update x value
  state.values.x = newX
  state.fixedVars.add('x') // Temporarily fix x while sliding
  
  // Recompute all values
  recomputeAllValues()
  
  // Update display
  updateSliderDisplay()
  
  // Re-render to update all fields
  renderRecipe()
  
  state.fixedVars.delete('x') // Unfix x after
}

// ============================================================================
// Initialization
// ============================================================================

function init() {
  // Populate dropdown
  const select = $('recipeSelect')
  Object.entries(recipesShown).forEach(([key, name]) => {
    const option = document.createElement('option')
    option.value = key
    option.textContent = name
    select.appendChild(option)
  })
  
  // Event listeners
  $('recipeTextarea').addEventListener('input', handleTextareaInput)
  $('recipeSelect').addEventListener('change', handleRecipeChange)
  $('copyButton').addEventListener('click', handleCopyToClipboard)
  $('scalingSlider').addEventListener('input', handleSliderChange)
  
  // Load first recipe
  const firstKey = Object.keys(recipesShown)[0]
  if (recipeHash[firstKey]) {
    state.recipeText = recipeHash[firstKey]
    $('recipeTextarea').value = state.recipeText
    parseRecipe()
  }
}

document.addEventListener('DOMContentLoaded', init)
