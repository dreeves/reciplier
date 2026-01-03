// Reciplier - Constraint-based recipe scaling system
// Supports {expr} syntax with labels, constraints, and Mathematica-style math

// ============================================================================
// Recipe Data
// ============================================================================

const recipesShown = {
  'crepes':      "Soule-Reeves Crepes",
  'cookies':     "Camelot Chocolate Chip Cookies",
  'shortcake':   "Shortcake",
  'pancakes':    "Pancakes according to Claude",
  'pythagorean': "Pythagorean Triple",
  'breakaway':   "Breakaway Biscuits",
  'biketour':    "Bike Tour Calculator",
  'blank':       "Blank -- paste any recipe below!",
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
'cookies': `\
* {1x} cup granulated sugar
* {1x} cup brown sugar
* {1x} cup butter, softened
* {2x} eggs
* {1.5x} teaspoons vanilla
* {1x} teaspoon baking soda
* {1x} teaspoon salt
* {3x} cups all purpose flour
* {12x} ounces semi-sweet chocolate chips (danthany version: half semi-sweet and half milk chocolate)

Place sugar, butter, eggs, and vanilla in mixer bowl. Attach bowl and flat beater to mixer. Turn to speed 2 and mix about 30 seconds. Stop and scrape bowl.

Turn to Stir Speed. Gradually add baking soda, salt, and flour to sugar mixture and mix about 2 minutes. Turn to speed 2 and mix about 30 seconds. Stop and scrape bowl. Add chocolate chips. Turn to Stir Speed and mix about 15 seconds. 

Drop rounded teaspoonfuls onto greased baking sheets, about 2 inches apart. Bake at 375 F for 10 to 12 minutes. Remove from backing sheets *immediately* and cool on wire racks. 

Yield: {54x} cookies, 117 cal (17g carb) per cookie.

Scaled by a factor of {x:1}
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
'pythagorean': `\
{a:3}, {b:4}, {c: sqrt(a^2 + b^2)} is a Pythagorean triple.

Sanity check: {a^2 + b^2 = c^2}
`,
// -----------------------------------------------------------------------------
'breakaway': `\
The riders in the break have a {m:1}:{s:30} gap with {d:20}km to go.
So if the break does {vb:40}km/h ({0.621371vb}mph) then the peloton needs to do {vp: pd/t}km/h ({0.621371vp}mph) to catch them at the line.

Scratchpad:
* Gap in hours: {gt: m/60+s/3600} (ie, {m+s/60}m or {60m+s}s or, heck, {gt/24}d)
* Gap distance: {gd: vb*gt}km ({0.621371gd}mi) (I think vb not vp for this?)
* Breakaway's time till finish: {t: d/vb}
* Peloton's distance to the line: {pd: d+gd}
`,
// -----------------------------------------------------------------------------
'biketour': `\
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
`,
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
        isNonceLabel: true
      }
    }
    return { ...block, isNonceLabel: false }
  })
}

// ============================================================================
// Mathematica-style Syntax Conversion
// ============================================================================

// Convert Mathematica-style expression to JavaScript
function toJavaScript(expr) {
  // Guard against undefined/null/empty
  if (!expr || typeof expr !== 'string') {
    return '0'
  }
  
  let js = expr
  
  // Handle implicit multiplication FIRST (before other transformations)
  // Pattern: number followed directly by letter (variable)
  js = js.replace(/(\d)([a-zA-Z_])/g, '$1*$2')  // 2x -> 2*x
  
  // Handle sqrt() -> Math.sqrt()
  js = js.replace(/\bsqrt\s*\(/g, 'Math.sqrt(')
  
  // Handle sin, cos, tan, etc.
  js = js.replace(/\b(sin|cos|tan|asin|acos|atan|log|exp|abs)\s*\(/g, 'Math.$1(')
  
  // Handle pi
  js = js.replace(/\bpi\b/gi, 'Math.PI')
  
  // Handle exponentiation: x^2 -> Math.pow(x,2)
  // Multiple passes to handle nested exponents
  for (let i = 0; i < 10; i++) {
    const before = js
    // Match: (word or number or )) ^ (word or number or (balanced parens))
    js = js.replace(/(\w+|\d+\.?\d*|\))\s*\^\s*(\w+|\d+\.?\d*|\([^()]*\))/g, (match, base, exp) => {
      return `Math.pow(${base},${exp})`
    })
    if (js === before) break
  }
  
  // Handle remaining implicit multiplication cases
  js = js.replace(/(\))(\()/g, '$1*$2')          // )( -> )*(
  js = js.replace(/(\))([a-zA-Z_])/g, '$1*$2')   // )x -> )*x
  
  // Don't add * before ( if it's a function call
  // This regex is tricky - we want to add * for things like "x(" but not "Math.pow("
  js = js.replace(/([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g, (match, name) => {
    // Don't add * if it's a known function
    if (name === 'Math' || name.startsWith('Math') || 
        ['sqrt', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'exp', 'abs', 'pow'].includes(name)) {
      return match
    }
    return `${name}*(`
  })
  
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
function findVariables(expr) {
  // Handle undefined or empty expressions
  if (!expr || expr.trim() === '') {
    return new Set()
  }
  
  // Match identifiers that aren't part of Math.xxx or numbers
  const jsExpr = toJavaScript(expr)
  const vars = new Set()
  
  // Remove Math.xxx calls and numbers, then find remaining identifiers
  const cleaned = jsExpr
    .replace(/Math\.\w+/g, '')
    .replace(/\d+\.?\d*/g, '')
  
  const matches = cleaned.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || []
  matches.forEach(v => vars.add(v))
  
  return vars
}

// Build symbol table from parsed blocks
function buildSymbolTable(blocks) {
  const symbols = {}
  const errors = []
  
  // First pass: collect all defined labels
  for (const block of blocks) {
    if (!block.isNonceLabel) {
      if (symbols[block.label]) {
        errors.push(`Duplicate label: "${block.label}" defined multiple times`)
      } else {
        symbols[block.label] = {
          definedBy: block.id,
          value: null,
          fixed: false,
          expressions: block.expressions
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
        // It's a bare value like {tau: 6.28} - only warn if never used
        // For now, we'll allow it but could make this an error
        // errors.push(`Disconnected variable: "${name}" is defined but never used`)
      }
    }
  }
  
  // Fourth pass: check for bare numbers in anonymous expressions
  for (const block of blocks) {
    if (block.isNonceLabel && block.expressions.length === 1) {
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
  
  // Sort blocks by dependency order (simple topological sort attempt)
  // Variables that only reference already-computed vars should be computed first
  
  // Start with explicit values: {d:9} means d=9
  for (const block of blocks) {
    if (block.expressions.length === 1) {
      const expr = block.expressions[0]
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
      
      // Try to evaluate the first expression with current values
      const expr = block.expressions[0]
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
  }
  
  // For any remaining undefined variables, set default value
  for (const block of blocks) {
    if (values[block.label] === undefined) {
      // Check if it's an empty definition like {w:}
      if (block.expressions.length === 0 || 
          (block.expressions.length === 1 && block.expressions[0] === '')) {
        values[block.label] = 1 // Default value for undefined
      } else {
        // Try with current partial values
        const result = evaluate(block.expressions[0], values)
        if (!result.error && result.value !== null && isFinite(result.value)) {
          values[block.label] = result.value
        } else {
          values[block.label] = 1 // Fallback default
        }
      }
    }
  }
  
  return { values, errors }
}

// ============================================================================
// Constraint Solver
// ============================================================================

// Check if all constraints are satisfied with given values
function checkConstraints(blocks, values) {
  const violations = []
  
  for (const block of blocks) {
    if (block.expressions.length > 1) {
      // This is a constraint - all expressions should evaluate equal
      const results = block.expressions.map(expr => {
        const r = evaluate(expr, values)
        return r.error ? null : r.value
      })
      
      if (results.some(r => r === null)) {
        violations.push({ block, message: 'Expression evaluation error' })
        continue
      }
      
      // Check if all results are approximately equal
      const first = results[0]
      const tolerance = Math.abs(first) * 1e-9 + 1e-9
      for (let i = 1; i < results.length; i++) {
        if (Math.abs(results[i] - first) > tolerance) {
          violations.push({
            block,
            message: `${formatNum(results[0])} ≠ ${formatNum(results[i])}`,
            values: results
          })
          break
        }
      }
    }
  }
  
  return violations
}

// Binary search to find a value for a variable that satisfies constraints
function binarySearchSolve(blocks, values, varToSolve, targetBlock) {
  // Get the constraint expressions
  const exprs = targetBlock.expressions
  if (exprs.length < 2) return values[varToSolve]
  
  // We want to find a value for varToSolve such that all expressions are equal
  // Use the first expression as the target value
  const targetExpr = exprs[0]
  const otherExpr = exprs[1]
  
  // Compute target value
  const targetResult = evaluate(targetExpr, values)
  if (targetResult.error || !isFinite(targetResult.value)) {
    return values[varToSolve]
  }
  const target = targetResult.value
  
  // Binary search for the value
  let lo = -1e10, hi = 1e10
  
  // First, try to find bounds where the function crosses the target
  const testValues = { ...values }
  
  // Evaluate at current value to get direction
  const currentResult = evaluate(otherExpr, testValues)
  if (currentResult.error) return values[varToSolve]
  
  // Try to find good initial bounds
  for (let scale = 1; scale < 1e10; scale *= 10) {
    testValues[varToSolve] = scale
    const high = evaluate(otherExpr, testValues)
    testValues[varToSolve] = -scale
    const low = evaluate(otherExpr, testValues)
    testValues[varToSolve] = 1/scale
    const small = evaluate(otherExpr, testValues)
    
    if (!high.error && !low.error) {
      if ((high.value - target) * (low.value - target) < 0) {
        lo = -scale
        hi = scale
        break
      }
    }
    if (!high.error && !small.error) {
      if ((high.value - target) * (small.value - target) < 0) {
        lo = 1/scale
        hi = scale
        break
      }
    }
  }
  
  // Binary search
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    testValues[varToSolve] = mid
    const result = evaluate(otherExpr, testValues)
    
    if (result.error || !isFinite(result.value)) {
      return values[varToSolve]
    }
    
    const diff = result.value - target
    if (Math.abs(diff) < Math.abs(target) * 1e-10 + 1e-10) {
      return mid
    }
    
    // Determine search direction
    testValues[varToSolve] = lo
    const loResult = evaluate(otherExpr, testValues)
    if (loResult.error) return values[varToSolve]
    
    if ((loResult.value - target) * diff > 0) {
      lo = mid
    } else {
      hi = mid
    }
  }
  
  return (lo + hi) / 2
}

// Solve constraints by adjusting unfixed variables
function solveConstraints(blocks, values, fixedVars, changedVar) {
  const newValues = { ...values }
  
  // Multiple passes to propagate changes through dependent constraints
  for (let pass = 0; pass < 10; pass++) {
    const violations = checkConstraints(blocks, newValues)
    if (violations.length === 0) break
    
    let madeProgress = false
    
    // For each violation, try to find an unfixed variable to adjust
    for (const violation of violations) {
      const block = violation.block
      const exprs = block.expressions
      if (exprs.length < 2) continue
      
      // Find variables in each expression
      const varsInFirst = findVariables(exprs[0])
      const varsInOthers = new Set()
      for (let i = 1; i < exprs.length; i++) {
        findVariables(exprs[i]).forEach(v => varsInOthers.add(v))
      }
      
      // Prefer to solve for variables that are ONLY in the other expressions
      // (not in the target/first expression)
      const preferredVars = [...varsInOthers].filter(v => 
        !varsInFirst.has(v) && !fixedVars.has(v) && v !== changedVar
      )
      
      // Fall back to any unfixed variable in the other expressions
      const fallbackVars = [...varsInOthers].filter(v =>
        !fixedVars.has(v) && v !== changedVar
      )
      
      const varsToTry = preferredVars.length > 0 ? preferredVars : fallbackVars
      
      if (varsToTry.length > 0) {
        const varToSolve = varsToTry[0]
        const newVal = binarySearchSolve(blocks, newValues, varToSolve, block)
        if (newVal !== newValues[varToSolve]) {
          newValues[varToSolve] = newVal
          madeProgress = true
        }
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
  const { values, errors: valueErrors } = computeInitialValues(blocks, symbols)
  
  // Update state
  state.blocks = blocks
  state.symbols = symbols
  state.values = values
  state.errors = [...symbolErrors, ...valueErrors]
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
  
  // Show errors if any critical ones
  const criticalErrors = state.errors.filter(e => 
    e.includes('Undefined') || e.includes('Duplicate')
  )
  
  if (criticalErrors.length > 0) {
    output.innerHTML = `<div class="error-display">${criticalErrors.map(e => 
      `<div class="error-message">⚠️ ${e}</div>`
    ).join('')}</div>`
    output.style.display = 'block'
    copySection.style.display = 'none'
    return
  }
  
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
  
  output.innerHTML = `<div class="recipe-rendered">${html}</div>`
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
  
  if (newValue === null || !isFinite(newValue)) {
    input.classList.add('invalid')
    return
  }
  
  input.classList.remove('invalid')
  
  // Find the block for this field
  const block = state.blocks.find(b => b.id === blockId)
  if (!block) return
  
  // If the field has an expression with variables, solve for those variables
  // to make the expression equal the new value
  const expr = block.expressions[0]
  const varsInExpr = findVariables(expr)
  
  if (varsInExpr.size > 0) {
    // Find an unfixed variable to solve for
    const unfixedVars = [...varsInExpr].filter(v => !state.fixedVars.has(v))
    
    if (unfixedVars.length > 0) {
      // Solve for the first unfixed variable to make expression = newValue
      const varToSolve = unfixedVars[0]
      const solvedValue = solveForVariable(expr, varToSolve, newValue, state.values)
      if (solvedValue !== null) {
        state.values[varToSolve] = solvedValue
      }
    }
  } else {
    // No variables in expression - just update the literal value
    state.values[label] = newValue
  }
  
  // Recompute all derived values and solve constraints
  recomputeAllValues()
  state.values = solveConstraints(state.blocks, state.values, state.fixedVars, label)
  recomputeAllValues() // Re-run after constraint solving
  
  // Update all other fields (not the one being edited)
  $('recipeOutput').querySelectorAll('input.recipe-field').forEach(field => {
    if (field !== input) {
      const fieldLabel = field.dataset.label
      field.value = formatNum(state.values[fieldLabel])
    }
  })
}

// Solve for a variable to make expression equal target value
function solveForVariable(expr, varToSolve, targetValue, currentValues) {
  const testValues = { ...currentValues }
  
  // Binary search
  let lo = -1e10, hi = 1e10
  
  // Try to find good initial bounds
  for (let scale = 1; scale < 1e10; scale *= 10) {
    testValues[varToSolve] = scale
    const high = evaluate(expr, testValues)
    testValues[varToSolve] = -scale
    const low = evaluate(expr, testValues)
    testValues[varToSolve] = 1/scale
    const small = evaluate(expr, testValues)
    testValues[varToSolve] = 0
    const zero = evaluate(expr, testValues)
    
    if (!high.error && !low.error) {
      if ((high.value - targetValue) * (low.value - targetValue) <= 0) {
        lo = -scale
        hi = scale
        break
      }
    }
    if (!high.error && !small.error) {
      if ((high.value - targetValue) * (small.value - targetValue) <= 0) {
        lo = 1/scale
        hi = scale
        break
      }
    }
    if (!high.error && !zero.error) {
      if ((high.value - targetValue) * (zero.value - targetValue) <= 0) {
        lo = 0
        hi = scale
        break
      }
    }
  }
  
  // Binary search
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    testValues[varToSolve] = mid
    const result = evaluate(expr, testValues)
    
    if (result.error || !isFinite(result.value)) {
      return null
    }
    
    const diff = result.value - targetValue
    if (Math.abs(diff) < Math.abs(targetValue) * 1e-10 + 1e-10) {
      return mid
    }
    
    // Determine search direction
    testValues[varToSolve] = lo
    const loResult = evaluate(expr, testValues)
    if (loResult.error) return null
    
    if ((loResult.value - targetValue) * diff > 0) {
      lo = mid
    } else {
      hi = mid
    }
  }
  
  return (lo + hi) / 2
}

// Recompute all field values based on current variable values
function recomputeAllValues() {
  // Multiple passes to handle dependencies
  for (let pass = 0; pass < 10; pass++) {
    let changed = false
    
    for (const block of state.blocks) {
      const expr = block.expressions[0]
      const vars = findVariables(expr)
      
      // If all variables are defined, recompute this value
      const allDefined = [...vars].every(v => state.values[v] !== undefined)
      if (allDefined && vars.size > 0) {
        const result = evaluate(expr, state.values)
        if (!result.error && isFinite(result.value)) {
          const oldVal = state.values[block.label]
          state.values[block.label] = result.value
          if (Math.abs(result.value - oldVal) > 1e-10) {
            changed = true
          }
        }
      }
    }
    
    if (!changed) break
  }
}

function handleFieldBlur(e) {
  const input = e.target
  const label = input.dataset.label
  
  // Ensure valid value
  if (input.classList.contains('invalid')) {
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
  const x = state.values.x || 1
  $('scalingDisplay').textContent = formatNum(x)
  $('scalingSlider').value = Math.min(10, Math.max(0.1, x))
  
  // Green thumb when at 1x
  const slider = $('scalingSlider')
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
