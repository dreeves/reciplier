// =============================================================================
// Recipe Data
// =============================================================================

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
* Eggs: {12x} large
* Milk: {5.333x} cups = {1.262x} liters = {1302x} grams
* Flour: {3x} cups = {410x} grams
* Butter: {8x} tbsp melted = {115x} grams
* Salt: {2x} tsp = {14x} grams

Yield: roughly {29x} crepes

Scaled by a factor of {x:1}

(Flour notes: We did ~{440x}g for years via packed cups but {360x}g (up to {365x}g) is most likely what the recipe intended. Most recently we tried {420x}g and it worked well so we're trying lower.)
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
2*{x:6} + 3*{y:} = {2x + 3y = 33}
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
Preheat oven to 325°F. Line bottom of 9x{9x}-inch pan with parchment paper.

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
The riders in the break have a {m:1}:{s:30}s gap with {d:20}km ({k*d}mi) to go.
So if the break averages {vb:40}km/h ({k*vb}mph) then the peloton needs to average {vp: pd/t}km/h ({k*vp}mph) to catch them at the line.

Scratchpad:
* Miles in a kilometer: {k: 0.621371}mi/km
* Gap in hours: {gt: m/60+s/3600} (ie, {m+s/60 = gt*60}m or {60m+s = gt*3600}s)
* Gap distance: {gd: vb*gt}km ({k*gd}mi) <!-- I think vb not vp for this?) -->
* Breakaway's time till finish: {t: d/vb} hours
* Peloton's distance to the line: {pd: d+gd}km ({k*pd}mi)
`,
// -----------------------------------------------------------------------------
'biketour': `\
Distance:        {d:66} miles               <!-- {d = v*t}          -->
Start time:      {h:6}:{m:45}am             <!-- {s: h+m/60} hours  -->
End time:        {H:12}:{M:52} (24H format) <!-- {e: H+M/60} hours  -->
Break 1:         {b1h:0}h{b1m:26}m          <!-- {b1: b1h+b1m/60}h) -->
Break 2:         {b2h:0}h{b2m:37}m          <!-- {b2: b2h+b2m/60}h) -->
Break 3:         {b3h:0}h{b3m:0}m           <!-- {b3: b3h+b3m/60}h) -->
Total breaks:    {b: b1+b2+b3} hours        <!-- {b = e-s-d/v}      -->
Avg speed:       {v: d/t} mph               <!-- {v = d/(e-s-b)}    -->
Unadjusted spd:  {u: d/w} mph               <!-- {u = d/(e-s)}      -->
Wall clock time: {w: e-s} hours = {wh: floor(w)}h{wm: (w-floor(w))*60}m
Riding time:     {t: w-b} hours = {th: floor(t)}h{tm: (t-floor(t))*60}m
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

// =============================================================================
// Utility Functions
// =============================================================================

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

// =============================================================================
// Expression Parser
// =============================================================================

// Extract all {...} cells from text, noting which are inside HTML comments
// TODO: no, we shouldn't care whether anything's in an html comment
function extractCells(text) {
  const cells = []
  let cellId = 0
  
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
  
  // Find all {...} cells (simple non-nested matching)
  const cellRegex = /\{([^{}]*)\}/g
  let match
  while ((match = cellRegex.exec(text)) !== null) {
    cells.push({
      id: `cell_${cellId++}`,
      raw: match[0],
      urtext: match[1],
      content: match[1],
      inComment: inComment(match.index),
      startIndex: match.index,
      endIndex: match.index + match[0].length
    })
  }
  
  return cells
}

// Parse a single cell's content into label and expressions
// Format: [label:] expr1 [= expr2 [= expr3 ...]]
function parseCell(cell) {
  const content = cell.content.trim()
  
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
    ...cell,
    label,
    expressions,
    hasConstraint: expressions.length > 1
  }
}

// Add nonce labels to cells that don't have them
function preprocessLabels(cells) {
  let nonceCounter = 1
  return cells.map(cell => {
    if (cell.label === null) {
      return {
        ...cell,
        label: `_var${String(nonceCounter++).padStart(3, '0')}`,
        isNonce: true
      }
    }
    return { ...cell, isNonce: false }
  })
}

// =============================================================================
// Mathematica-style Syntax Conversion
// =============================================================================

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
// Symbol Table and Validation
// =============================================================================

// Find all variable names referenced in an expression
// Works on the ORIGINAL expression (before toJavaScript transform) to preserve variable names
function findVariables(expr) {
  if (!expr || expr.trim() === '') return new Set()
  
  const reserved = new Set(['sqrt', 'floor', 'ceil', 'round', 'min', 'max', 
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'exp', 'abs', 'pi'])
  
  const matches = expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || []
  return new Set(matches.filter(v => !reserved.has(v)))
}

// Build symbol table from parsed cells
function buildSymbolTable(cells) {
  const symbols = {}
  const errors = []
  
  // First pass: collect all defined labels

  for (const cell of cells) {
    if (symbols[cell.label]) {
      errors.push(
        `Cell ${cell.raw} overrides previous definition of ${cell.label}`)
      //continue // keeping this means later def'ns don't override earlier ones
    }
    symbols[cell.label] = {
      definedBy: cell.id,
      value: null,
      fixed: false,
      expressions: cell.expressions,
      raw: cell.raw,
      isNonce: cell.isNonce
    }
  }
  
  // Second pass: find all referenced variables and check they're defined
  const allReferenced = new Set()
  for (const cell of cells) {
    for (const expr of cell.expressions) {
      const vars = findVariables(expr)
      vars.forEach(v => {
        allReferenced.add(v)
        if (!symbols[v]) {
          errors.push(`Cell ${cell.raw} has undefined variable ${v}`)
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
        errors.push(`${name} = ${sym.expressions[0]} is defined but never used`)
      }
    }
  }
  
  // Fourth pass: check for bare numbers in anonymous expressions
  for (const cell of cells) {
    if (cell.isNonce && cell.expressions.length === 1) {
      const expr = cell.expressions[0]
      const vars = findVariables(expr)
      if (vars.size === 0) {
        // This is a bare number like {5}
        errors.push(`Cell ${cell.raw} is a bare number ` + 
                    `which doesn't make sense to put in a cell`)
      }
    }
  }
  
  return { symbols, errors }
}

// =============================================================================
// Initial Value Assignment
// =============================================================================

// Try to compute initial values for all variables
function computeInitialValues(cells, symbols) {
  const values = {}
  const errors = []
  const emptyExprVars = new Set() // Track variables with empty expressions like {c:}
  
  // Sort cells by dependency order (simple topological sort attempt)
  // Variables that only reference already-computed vars should be computed first
  
  // Start with explicit values: {d:9} means d=9
  // Also track variables with empty expressions that need solving
  for (const cell of cells) {
    if (cell.expressions.length === 1) {
      const expr = cell.expressions[0]
      
      // Check for empty expression like {c:}
      if (!expr || expr.trim() === '') {
        emptyExprVars.add(cell.label)
        continue
      }
      
      const vars = findVariables(expr)
      
      // If the expression has no variables, it's a literal value
      if (vars.size === 0) {
        const result = evaluate(expr, {})
        if (result.error) {
          errors.push(`Error in cell ${cell.raw}: ${result.error}`)
        } else {
          values[cell.label] = result.value
        }
      }
    } else if (cell.expressions.length === 0) {
      emptyExprVars.add(cell.label)
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
    
    for (const cell of cells) {
      if (values[cell.label] !== undefined) continue // Already computed
      if (emptyExprVars.has(cell.label)) continue // Skip empty-expr vars for now
      
      // Try to evaluate the first expression with current values
      const expr = cell.expressions[0]
      if (!expr || expr.trim() === '') continue
      
      const vars = findVariables(expr)
      
      // Check if all required variables are available
      const allAvailable = [...vars].every(v => values[v] !== undefined)
      
      if (allAvailable) {
        const result = evaluate(expr, values)
        if (!result.error && result.value !== null && isFinite(result.value)) {
          values[cell.label] = result.value
          changed = true
        }
      }
    }
    
    // Also try to solve empty-expr vars in each iteration (they may become solvable)
    for (const varName of emptyExprVars) {
      if (values[varName] !== undefined) continue
      const solved = solveFromConstraints(varName, cells, values)
      if (solved !== null) {
        values[varName] = solved
        changed = true
      }
    }
  }

  // Seed empty-expr vars and try solving constraints globally (eg, simultaneous equations).
  for (const varName of emptyExprVars) {
    if (values[varName] === undefined) {
      values[varName] = 1
    }
  }

  if (emptyExprVars.size > 0) {
    const solved = solveConstraints(cells, values, new Set(), null)
    const recomputed = recomputeValues(cells, solved)
    for (const varName of emptyExprVars) {
      if (typeof recomputed[varName] === 'number' && isFinite(recomputed[varName])) {
        values[varName] = recomputed[varName]
      }
    }
  }
  
  // Now try to solve for empty-expression variables using constraints
  for (const varName of emptyExprVars) {
    if (values[varName] !== undefined) continue
    
    const solved = solveFromConstraints(varName, cells, values)
    if (solved !== null) {
      values[varName] = solved
    } else {
      errors.push(`Can't find valid assignment for ${varName}`)
    }
  }
  
  // For any remaining undefined variables, set default value
  for (const cell of cells) {
    if (values[cell.label] === undefined) {
      // Try with current partial values
      const expr = cell.expressions[0]
      if (expr && expr.trim() !== '') {
        const result = evaluate(expr, values)
        if (!result.error && result.value !== null && isFinite(result.value)) {
          values[cell.label] = result.value
          continue
        }
        if (result.error) {
          errors.push(`Error in cell ${cell.raw}: ${result.error}`)
        }
      }
      errors.push(`Cell ${cell.raw} has no valid assignment that we could find`)
    }
  }
  
  return { values, errors, emptyExprVars }
}

// =============================================================================
// Constraint Solver
// =============================================================================

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
function solveFromConstraints(varName, cells, values) {
  for (const cell of cells) {
    if (cell.expressions.length < 2) continue
    
    // Find expressions with and without the variable
    let targetExpr = null, solveExpr = null
    for (const expr of cell.expressions) {
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
function checkInitialContradictions(cells, values, emptyExprVars) {
  const errors = []
  
  for (const cell of cells) {
    if (cell.expressions.length > 1) {
      // Check if this constraint involves any variable that needs to be computed
      const varsInConstraint = new Set()
      cell.expressions.forEach(expr => {
        if (expr && expr.trim() !== '') {
          findVariables(expr).forEach(v => varsInConstraint.add(v))
        }
      })
      
      // Skip if any variable in this constraint has an empty expression (needs solving)
      const involvesEmptyVar = [...varsInConstraint].some(v => emptyExprVars.has(v))
      if (involvesEmptyVar) continue
      
      // This is a constraint - all expressions should evaluate equal
      const results = cell.expressions.map(expr => {
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
          const exprStr = cell.expressions.join(' = ')
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
function checkConstraints(cells, values) {
  const violations = []
  const tol = 1e-9
  
  for (const cell of cells) {
    if (cell.expressions.length < 2) continue
    
    const results = cell.expressions.map(expr => {
      const r = evaluate(expr, values)
      return r.error ? null : r.value
    })
    
    if (results.some(r => r === null)) {
      violations.push({ cell, message: 'Evaluation error' })
      continue
    }
    
    const first = results[0]
    const tolerance = Math.abs(first) * tol + tol
    for (let i = 1; i < results.length; i++) {
      if (Math.abs(results[i] - first) > tolerance) {
        violations.push({ cell, message: `${formatNum(first)} ≠ ${formatNum(results[i])}` })
        break
      }
    }
  }
  return violations
}

// Solve constraints by adjusting unfixed variables
function solveConstraints(cells, values, fixedVars, changedVar) {
  const newValues = { ...values }

  const cellByLabel = new Map(cells.map(cell => [cell.label, cell]))

  function isEmptyExprVar(varName) {
    const cell = cellByLabel.get(varName)
    if (!cell) return false
    if (cell.expressions.length === 0) return true
    const expr = cell.expressions[0]
    return !expr || expr.trim() === ''
  }

  /*
  // Previous approach (commented out): heuristic prioritization of which variable to solve for.
  // Replaced with a try-each-variable approach that reverts on failure.
  const cellByLabel = new Map(cells.map(cell => [cell.label, cell]))
  function varPriority(varName) {
    const cell = cellByLabel.get(varName)
    if (!cell) return 3
    const expr = cell.expressions[0]
    if (!expr || expr.trim() === '') return 0
    const vars = findVariables(expr)
    if (vars.size === 0) return 2
    return 1
  }
  */

  function varsInConstraintInOrder(cell) {
    const vars = []
    const seen = new Set()
    for (const expr of cell.expressions) {
      for (const v of findVariables(expr)) {
        if (seen.has(v)) continue
        seen.add(v)
        vars.push(v)
      }
    }
    return vars
  }
  
  for (let pass = 0; pass < 10; pass++) {
    const violations = checkConstraints(cells, newValues)
    if (violations.length === 0) break
    
    let madeProgress = false
    for (const { cell } of violations) {
      if (cell.expressions.length < 2) continue
      
      // Find all variables and which are adjustable
      const adjustable = varsInConstraintInOrder(cell)
        .filter(v => !fixedVars.has(v) && v !== changedVar)
        .sort((a, b) => Number(isEmptyExprVar(b)) - Number(isEmptyExprVar(a)))
      if (adjustable.length === 0) continue

      const violationsBefore = checkConstraints(cells, newValues)
      const violationCountBefore = violationsBefore.length

      for (const varToSolve of adjustable) {
        // Find target (expression without varToSolve) and solve expression (one that contains varToSolve)
        let targetExpr = null, solveExpr = null

        for (const expr of cell.expressions) {
          const vars = findVariables(expr)
          if (vars.has(varToSolve)) {
            if (!solveExpr) solveExpr = expr
          } else if (!targetExpr) {
            targetExpr = expr
          }
        }

        if (!targetExpr || !solveExpr) continue

        const targetRes = evaluate(targetExpr, newValues)
        if (targetRes.error) continue

        const oldVal = newValues[varToSolve]
        const newVal = solve(solveExpr, varToSolve, targetRes.value, newValues)
        if (newVal === null) continue

        const candidateValues = { ...newValues, [varToSolve]: newVal }
        const violationCountAfter = checkConstraints(cells, candidateValues).length
        if (violationCountAfter < violationCountBefore) {
          newValues[varToSolve] = newVal
          madeProgress = true
          break
        }

        newValues[varToSolve] = oldVal
      }
    }
    
    if (!madeProgress) break
  }
  
  return newValues
}

// =============================================================================
// State Management
// =============================================================================

let state = {
  recipeText: '',
  cells: [],
  symbols: {},
  values: {},
  fixedVars: new Set(),
  errors: [],
  currentRecipeKey: ''
}

// =============================================================================
// Main Parse and Render Functions
// =============================================================================

function parseRecipe() {
  const text = state.recipeText
  const previousValues = state.values
  
  if (!text.trim()) {
    state.cells = []
    state.symbols = {}
    state.values = {}
    state.errors = []
    $('recipeOutput').style.display = 'none'
    $('copySection').style.display = 'none'
    updateRecipeDropdown()
    return
  }
  
  // Parse
  let cells = extractCells(text)
  cells = cells.map(parseCell)
  cells = preprocessLabels(cells)
  
  // Build symbol table
  const { symbols, errors: symbolErrors } = buildSymbolTable(cells)
  
  // Compute initial values
  const { values, errors: valueErrors, emptyExprVars } = computeInitialValues(cells, symbols)
  
  // Check for contradictions in initial values (skip constraints involving empty-expr vars)
  const contradictions = checkInitialContradictions(cells, values, emptyExprVars)

  const allErrors = [...symbolErrors, ...valueErrors, ...contradictions]

  if (allErrors.length > 0) {
    for (const cell of cells) {
      if (values[cell.label] !== undefined) continue
      const previousValue = previousValues[cell.label]
      if (typeof previousValue === 'number' && isFinite(previousValue)) {
        values[cell.label] = previousValue
      }
    }
  }
  
  // Update state
  state.cells = cells
  state.symbols = symbols
  state.values = values
  state.errors = allErrors
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
  
  const criticalErrors = state.errors

  const violatedCellIds = new Set(checkConstraints(state.cells, state.values).map(v => v.cell.id))

  function renderRecipeBody({ disableInputs, invalidCellIds }) {
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

    // Build the rendered text, skipping HTML comments entirely
    let html = ''
    let lastIndex = 0

    // Sort cells by start index (only visible cells)
    const visibleCells = state.cells.filter(b => !b.inComment).sort((a, b) => a.startIndex - b.startIndex)

    for (const cell of visibleCells) {
      // Add text before this cell, but skip any HTML comments
      let textStart = lastIndex
      while (textStart < cell.startIndex) {
        // Check if we're entering a comment
        const nextCommentStart = commentRanges.find(r => r.start >= textStart && r.start < cell.startIndex)
        if (nextCommentStart) {
          // Add text before the comment
          if (nextCommentStart.start > textStart) {
            html += escapeHtml(text.substring(textStart, nextCommentStart.start))
          }
          // Skip the comment
          textStart = nextCommentStart.end
        } else {
          // No more comments before the cell
          html += escapeHtml(text.substring(textStart, cell.startIndex))
          break
        }
      }

      // Render the cell as input field
      const value = state.values[cell.label]
      const displayValue = formatNum(value)
      const isFixed = state.fixedVars.has(cell.label)
      const isInvalid = invalidCellIds.has(cell.id)
      const title = `${cell.label}: ${cell.expressions.join(' = ')}`.replace(/"/g, '&quot;')
      const disabledAttr = disableInputs ? ' disabled' : ''

      html += `<input type="text" class="recipe-field ${isFixed ? 'fixed' : ''} ${isInvalid ? 'invalid' : ''}" data-label="${cell.label}" data-cell-id="${cell.id}" value="${displayValue}" title="${title}"${disabledAttr}>`

      lastIndex = cell.endIndex
    }

    // Add remaining text after last cell, skipping comments
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
    return `<div class="recipe-rendered">${html}</div>`
  }

  /*
  // If there are critical errors, fail loudly
  if (criticalErrors.length > 0) {
    const errorBanner = `<div class="error-display">
        ${criticalErrors.map(e => `<div class="error-message">⚠️ ${e}</div>`).join('')}
      </div>`
    output.innerHTML = `${errorBanner}${renderRecipeBody({ disableInputs: true })}`
    output.style.display = 'block'
    copySection.style.display = 'none'
    updateSliderDisplay()
    return
  }
  */

  const errorBanner = criticalErrors.length > 0
    ? `<div class="error-display">
        ${criticalErrors.map(e => `<div class="error-message">⚠️ ${e}</div>`).join('')}
      </div>`
    : ''

  // Update slider display
  updateSliderDisplay()
  
  if (state.cells.length === 0 && state.errors.length === 0) {
    output.style.display = 'none'
    copySection.style.display = 'none'
    return
  }
  
  output.innerHTML = `${errorBanner}${renderRecipeBody({ disableInputs: false, invalidCellIds: violatedCellIds })}`
  output.style.display = 'block'
  copySection.style.display = 'block'

  $('copyButton').disabled = criticalErrors.length > 0
  
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

// =============================================================================
// Event Handlers
// =============================================================================

function handleFieldInput(e) {
  const input = e.target
  const label = input.dataset.label
  const cellId = input.dataset.cellId
  const newValue = toNum(input.value)
  
  // Invalid number format - just mark invalid, don't change state
  if (newValue === null || !isFinite(newValue)) {
    input.classList.add('invalid')
    return
  }
  
  const cell = state.cells.find(c => c.id === cellId)
  if (!cell) return
  
  // Work on a COPY of values - only commit if constraints can be satisfied
  let testValues = { ...state.values }
  
  // Apply the new value
  const expr = cell.expressions[0]
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
  testValues = solveConstraints(state.cells, testValues, tempFixed, label)
  
  // Recompute derived values
  testValues = recomputeValues(state.cells, testValues)
  
  // Check if constraints are satisfied
  const violations = checkConstraints(state.cells, testValues)

  // Build set of cell IDs with violated constraints
  const violatedCellIds = new Set(violations.map(v => v.cell.id))

  if (violations.length === 0) {
    // Success - commit the valid values and update all fields
    state.values = testValues
    $('recipeOutput').querySelectorAll('input.recipe-field').forEach(field => {
      field.value = formatNum(state.values[field.dataset.label])
      field.classList.remove('invalid')
    })
  } else {
    // Constraints violated - don't commit, but mark all violated constraint fields as invalid
    // (The current field keeps the user's input; other fields keep their current display)
    $('recipeOutput').querySelectorAll('input.recipe-field').forEach(field => {
      if (violatedCellIds.has(field.dataset.cellId)) {
        field.classList.add('invalid')
      } else {
        field.classList.remove('invalid')
      }
    })
  }
}

// Recompute all field values based on current variable values (mutates state.values)
function recomputeAllValues() {
  state.values = recomputeValues(state.cells, state.values)
}

// Pure version: recompute derived values and return new values object
function recomputeValues(cells, values) {
  const newValues = { ...values }
  
  // Multiple passes to handle dependencies
  for (let pass = 0; pass < 10; pass++) {
    let changed = false
    
    for (const cell of cells) {
      const expr = cell.expressions[0]
      if (!expr || expr.trim() === '') continue
      
      const vars = findVariables(expr)
      
      // If all variables are defined, recompute this value
      const allDefined = [...vars].every(v => newValues[v] !== undefined)
      if (allDefined && vars.size > 0) {
        const result = evaluate(expr, newValues)
        if (!result.error && isFinite(result.value)) {
          const oldVal = newValues[cell.label]
          if (oldVal === undefined || Math.abs(result.value - oldVal) > 1e-10) {
            newValues[cell.label] = result.value
            changed = true
          }
        }
      }
    }
    
    if (!changed) break
  }
  
  return newValues
}

function handleFieldBlur(_e) {
  // If any field is invalid, revert ALL fields to state.values (which is always consistent)
  // Per README: "as soon as you clicked away from field c, it would recompute
  // itself as the only value that makes all the equations true"
  const hasInvalid = $('recipeOutput').querySelector('input.recipe-field.invalid')
  if (hasInvalid) {
    $('recipeOutput').querySelectorAll('input.recipe-field').forEach(field => {
      field.value = formatNum(state.values[field.dataset.label])
      field.classList.remove('invalid')
    })
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

// =============================================================================
// Copy Functionality
// =============================================================================

function getScaledRecipeText() {
  let result = ''
  let lastIndex = 0
  const text = state.recipeText
  
  const sortedCells = [...state.cells].sort((a, b) => a.startIndex - b.startIndex)
  
  for (const cell of sortedCells) {
    // Add text before this cell
    if (cell.startIndex > lastIndex) {
      result += text.substring(lastIndex, cell.startIndex)
    }
    
    // Add the computed value (or original for comments)
    if (cell.inComment) {
      result += cell.raw
    } else {
      result += formatNum(state.values[cell.label])
    }
    
    lastIndex = cell.endIndex
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

// =============================================================================
// Scaling Slider
// =============================================================================

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

  const x = state.values.x
  if (typeof x !== 'number' || !isFinite(x)) {
    slider.disabled = true
    slider.classList.add('disabled')
    display.textContent = '?'
    display.classList.add('disabled')
    return
  }

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

// =============================================================================
// Initialization
// =============================================================================

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
