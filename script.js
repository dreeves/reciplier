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
  'biketour':  "Bike Tour Burritos",
  'dial':      "Beeminder Commitment Dial",
  'sugarcalc': "Sugar Calculator",
  'kpounder':  "Pounds ↔ Kilograms Converter",
  'cheesepan': "Cheese Wheels in a Pan",
  'test':      "Just Testing",
  'blank':     "Blank -- go crazy",
}

const recipeHash = {
// -----------------------------------------------------------------------------
'crepes': `\
* Eggs: {12x} large
* Milk: {5.333x} cups = {1.262x} liters = {1302x} grams
* Flour: {3x} cups = {410x} grams
* Butter: {8x} tbsp melted = {115x} grams
* Salt: {2x} tsp = {14x} grams

Yield: roughly {29x} crepes

Scaled by a factor of {x = 1}

(Flour notes: We did ~{440x}g for years via packed cups but {360x}g (up to {365x}g) is most likely what the recipe intended. Most recently we tried {420x}g and it worked well so we're trying lower.)
`,
// -----------------------------------------------------------------------------
'pyzza': `\
Scaled by a factor of x={x = 1}.

Roll out dough into a right triangle with legs of length a={a = 3x} and b={b = 4x} and hypotenuse c={c}.
Then eat it.

Sanity check: {a}^2 + {b}^2 = {a^2} + {b^2} = {a^2 + b^2 = c^2}
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

Scaled by a factor of {x = 1 }
`,
// -----------------------------------------------------------------------------
'simeq': `\
2*{x = 6} + 3*{y} = {33 = 2x + 3y}
5*{x} - 4*{y} = {2 = 5x - 4y}

(Expected solution: x=6, y=7)
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

Scaled by a factor of {x = 1}
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

Scaled by a factor of {x} <!-- prius: x:1 -->
`,
// -----------------------------------------------------------------------------
'breakaway': `\
The riders in the break have a {1 = m}:{30 = s}s gap with {20 = d}km ({k*d}mi) to go.
So if the break averages {40 = vb}km/h ({k*vb}mph) then the peloton needs to average {vp = pd/t}km/h ({k*vp}mph) to catch them at the line.

Scratchpad:
* Gap time:     {gt = m/60+s/3600} hours = {m+s/60 = gt*60}m = {60m+s = gt*3600}s
* Gap distance: {gd = vb*gt}km ({k*gd}mi) <!-- I think vb not vp for this?) -->
* Breakaway's time till finish: {t = d/vb} hours
* Peloton's distance to the line: {pd = d+gd}km ({k*pd}mi)
* Miles in a kilometer: {0.621371 = k}mi/km
`,
// -----------------------------------------------------------------------------
'biketour': `\
Distance:        {66 = d} miles
Start time:      {h = 6}:{m = 45}am             <!-- {s = h+m/60} hours  -->
End time:        {13 = H}:{00 = M} (24H format) <!-- {e = H+M/60} hours  -->
Wall clock time: {w = e-s} hours = {floor(w)}h{(w-floor(w))*60} minutes
Rest stop 1:     {b1} hours = {b1*60 = 26} minutes
Rest stop 2:     {b2} hours = {b2*60 = 37} minutes
Rest stop 3:     {0 = b3} hours = {b3*60} minutes
Total breaks:    {b = b1+b2+b3} hours
Riding time:     {t = w-b} hours = {floor(t)}h{(t-floor(t))*60}m
Avg speed:       {v = d/t} mph
Unadjusted spd:  {u = d/w} mph
`,
// -----------------------------------------------------------------------------
dial: `\
* Start: {y0 = 2025}/{m0 = 12}/{d0 = 25} weighing {vini = 73}kg
* End: {y = 2026}/{m = 12}/{d = 25} weighing {vfin = 70} ({(tfin-tini)/SID} days later)
* Rate: {r*SID} per day = {r*SIW} per week = {r*SIM} per month

* Start time (unixtime in seconds): {tini = unixtime(y0, m0, d0)}
* End time (unixtime in seconds): {tfin = unixtime(y, m, d)}
* Goal duration: {tfin - tini}s = {(tfin - tini)/SID}d = {(tfin - tini)/SIW}w = {(tfin - tini)/SIM}mo
* Rate in goal units per second: {r = (vfin-vini)/(tfin-tini)}
* Seconds in a day / week / month: {86400 = SID}, {SIW = SID*7}, {SIM = SID*365.25/12}
`,
// -----------------------------------------------------------------------------
'sugarcalc': `\
Nutrition info for healthy stuff (e.g., Greek yogurt):
* {omega = 170} grams per serving
* {gamma = 120} calories per serving
* {sigma = 5} grams of sugar per serving

Nutrition info for junk food (e.g., Go-gurt):
* {w} grams per serving (don't actually need to know this) <!-- {w} -->
* {c = 150} calories per serving
* {s = 23} grams of sugar per serving

(Fun facts: There are {3.87 = k} calories per gram of normal sugar and {3.80 = kappa} calories per gram of brown sugar.)

"Healthiness" in this context is the fraction of calories that are from sugar. For the Greek yogurt that's {h = k*omega/gamma} and for the Go-gurt it's {eta = k*s/c}.

If you weigh out {y} grams of Greek yogurt and add {x} grams of brown sugar to it, the healthiness of the mixture is...

{(k*sigma*y/omega + kappa*x)/(gamma*y/omega + kappa*x) = eta}
`,
/* In the Sheeq version we had to do this:
(Calories_per_gram_of_sugar * 
Grams_of_sugar_per_serving_in_healthy_stuff * 
Grams_of_healthy_stuff / 
Grams_per_serving_in_healthy_stuff + 
Calories_per_gram_of_brown_sugar * 
Grams_of_brown_sugar_to_add ) / (
Calories_per_serving_in_healthy_stuff * 
Grams_of_healthy_stuff / 
Grams_per_serving_in_healthy_stuff + 
Calories_per_gram_of_brown_sugar * 
Grams_of_brown_sugar_to_add ) 
== 
Calories_per_gram_of_sugar * 
Grams_of_sugar_per_serving_in_junk_food / 
Calories_per_serving_in_junk_food
*/
// -----------------------------------------------------------------------------
'kpounder': `\
{p = x/P} pounds = {x = 70} kilograms
<!-- exact definition of a pound is {0.45359237 = P} kilograms -->
`,
// -----------------------------------------------------------------------------
'cheesepan': `\
Mix {2x} eggs and {3x} wheels of cheese in a {d}-inch diameter pan.
Or a {w}x{h}-inch rectangular pan (with a {z}-inch diagonal) is fine.
Or any pan as long as its area is {A = x*1/2*tau*r1^2 = 1/2*tau*r^2 = w*h}
square inches. Heat at 350 degrees.

This recipe is scaled by a factor of {x = 1}.

Constraints, constants, and sanity checks:
* The true circle constant is {6.28 = tau}
* The original pan diameter at 1x scale is {9 = d1} (radius {r1 = d1 / 2})
* Scaled radius is {r = d/2} and scaled diameter is {d = 2r}
* The squared diagonal of the rectangular pan is {w^2 + h^2 = z^2}
`,
// -----------------------------------------------------------------------------
'test': `\
Recipe for eggs: eat {1x} egg(s).
Scaled by a factor of {x/2 = 8}.
`,
// -----------------------------------------------------------------------------
'blank': ``,
};

// =============================================================================
// Utility Functions
// =============================================================================

function $(id) { return document.getElementById(id) }

function toNum(x) { 
  if (typeof x !== 'string') return null
  const s = x.trim()
  if (s === '') return null

  const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)
  if (!numeric) return null

  const n = Number(s)
  return isFinite(n) ? n : null
}

function formatNum(num) {
  if (typeof num !== 'number' || !isFinite(num)) return '?'
  // Snap to nearest integer if within 0.0001 (handles solver precision issues)
  if (Math.abs(num - Math.round(num)) < 0.0001) {
    num = Math.round(num)
  }
  // Show up to 4 decimal places, trim trailing zeros
  let s = num.toFixed(4).replace(/\.?0+$/, '')
  if (s === '-0') s = '0'
  return s
}

// =============================================================================
// Expression Parser
// =============================================================================

// Check for syntax errors like nested or unbalanced braces
function checkBraceSyntax(text) {
  const errors = []
  let depth = 0
  let braceStart = -1

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) braceStart = i
      depth++
      if (depth > 1) {
        // Found nested brace
        const context = text.substring(braceStart, Math.min(braceStart + 30, text.length))
        errors.push(`Nested braces at position ${i}: "${context}..."`)
        // Skip to end of outermost brace to avoid duplicate errors
        while (i < text.length && depth > 0) {
          i++
          if (text[i] === '{') depth++
          if (text[i] === '}') depth--
        }
      }
    } else if (text[i] === '}') {
      depth--
      if (depth < 0) {
        errors.push(`Unmatched closing brace at position ${i}`)
        depth = 0  // Reset to continue checking
      }
    }
  }

  if (depth > 0) {
    errors.push(`Unclosed brace starting at position ${braceStart}`)
  }

  return errors
}

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

// Parse a single cell's content into cval and ceqn
// Per spec: ceqn is a list of non-constant expressions split on "=".
// cval is the constant if there is one, null otherwise.
function parseCell(cell) {
  const content = cell.content.trim()

  // Check for cvar (identifier followed by colon)
  // cvar pattern: starts with letter or underscore, followed by alphanumerics
  // const cvarMatch = content.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/)

  // let cvar = null
  // let exprPart = content

  // if (cvarMatch) {
  //   cvar = cvarMatch[1]
  //   exprPart = cvarMatch[2]
  // }
  const exprPart = content

  // Split by = to get constraint expressions (but be careful with == or !=)
  // We want to split on single = that's not part of == or !=
  const parts = exprPart.split(/(?<![=!<>])=(?!=)/).map(e => e.trim()).filter(e => e !== '')

  // Separate bare numbers from expressions
  // Per spec: bare numbers go to cval field, not ceqn
  const bareNumbers = []
  const nonConstParts = []
  const partIsConst = []
  for (const part of parts) {
    const asNum = toNum(part)
    if (asNum !== null) {
      bareNumbers.push(asNum)
      partIsConst.push(true)
      continue
    }

    const vars = findVariables(part)
    if (vars.size === 0) {
      const r = vareval(part, {})
      if (!r.error && typeof r.value === 'number' && isFinite(r.value)) {
        bareNumbers.push(r.value)
        partIsConst.push(true)
        continue
      }
    }

    nonConstParts.push(part)
    partIsConst.push(false)
  }

    const isBareIdentifier = s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test((s || '').trim())

    const fix =
      (parts.length > 0 && partIsConst[0] === true) ||
      (parts.length === 2 && partIsConst[1] === true && partIsConst[0] === false && !isBareIdentifier(parts[0]))

  // Error flag if multiple bare numbers (spec case 7)
  const multipleNumbers = bareNumbers.length > 1

  // cval is the bare number (if exactly one), otherwise null
  const cval = bareNumbers.length === 1 ? bareNumbers[0] : null

  const ceqn = nonConstParts

  return {
    ...cell,
    cval,
    fix,
    ceqn,
    hasConstraint: parts.length >= 2,
    multipleNumbers,  // error flag
    hasNumber: bareNumbers.length === 1
  }
}

/*
// Add nonce cvars to cells that don't have them, and build ceqn
function preprocessLabels(cells) {
  let nonceCounter = 1
  return cells.map(cell => {
    let cvar = cell.cvar
    let isNonce = false

    if (cvar === null) {
      cvar = `_var${String(nonceCounter++).padStart(3, '0')}`
      isNonce = true
    }

    // Build ceqn: cvar followed by all expressions (per spec)
    const ceqn = [cvar, ...cell.expressions]

    return {
      ...cell,
      cvar,
      ceqn,
      isNonce,
      // Keep label as alias for backward compatibility during refactor
      label: cvar
    }
  })
}
*/

// =============================================================================
// Symbol Table and Validation
// =============================================================================

// Find all variable names referenced in an expression
// Works on the ORIGINAL expression (before preval transform) to preserve variable names
function findVariables(expr) {
  if (!expr || expr.trim() === '') return new Set()
  
  const reserved = new Set(['sqrt', 'floor', 'ceil', 'round', 'min', 'max', 
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'exp', 'abs',
    'unixtime'])
  
  const matches = expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || []
  return new Set(matches.filter(v => !reserved.has(v)))
}

// Build symbol table from parsed cells
function buildSymbolTable(cells) {
  const symbols = {}
  const errors = []

  function isBareIdentifierExpr(expr) {
    const t = (expr || '').trim()
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t)
  }

  // First pass: collect defined variables (simple identifier expressions) and check for errors
  for (const cell of cells) {
    // Error case 7: multiple bare numbers in a cell
    if (cell.multipleNumbers) {
      errors.push(`Cell ${cell.raw} has more than one numerical value`)
    }

    if (cell.ceqn.length === 0 && cell.cval !== null) {
      errors.push(`Cell ${cell.raw} is a bare number ` +
                  `which doesn't make sense to put in a cell`)
    }

    for (const expr of cell.ceqn) {
      if (isBareIdentifierExpr(expr)) {
        symbols[expr.trim()] = true
      }
    }

    // Treat variables referenced in constraint-only equations as defined.
    // Specifically: constraint equations (either 2+ expressions, or a fixed numeric constraint) with no bare identifier term
    // (so not an assignment like {b = a+z}).
    // This allows templates like {x/2 = 2} to introduce x without requiring a separate {x} cell.
    const isConstraintEqn = cell.ceqn.length >= 2 || (cell.fix && cell.cval !== null)
    if (isConstraintEqn && !cell.ceqn.some(isBareIdentifierExpr)) {
      for (const expr of cell.ceqn) {
        for (const v of findVariables(expr)) {
          symbols[v] = true
        }
      }
    }
  }

  // Second pass: find all referenced variables and check they're defined
  const allReferenced = new Set()
  for (const cell of cells) {
    for (const expr of cell.ceqn) {
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
  for (const name of Object.keys(symbols)) {
    if (!allReferenced.has(name)) {
      errors.push(`${name} is defined but never used`)
    }
  }

  // Fifth pass: check for self-reference (case 8)
  // A cell that references its own cvar and no other variables is an error
  // Self-reference is allowed: there are legitimate constraints where a symbol
  // appears on both sides of an equation.
  // for (const cell of cells) {
  //   // Only check expressions in ceqn[1:] (ceqn[0] is the cvar itself)
  //   for (let i = 1; i < cell.ceqn.length; i++) {
  //     const expr = cell.ceqn[i]
  //     const vars = findVariables(expr)
  //     // Error if the only variable referenced is the cell's own cvar
  //     if (vars.size === 1 && vars.has(cell.cvar)) {
  //       errors.push(`Cell ${cell.raw} references only itself`)
  //       break
  //     }
  //   }
  // }

  return { symbols, errors }
}

// =============================================================================
// Initial Value Assignment
// =============================================================================

// Build equations list for solvem() from cells
// Each equation is an array of expressions that should all be equal
function buildEquations(cells) {
  const eqns = []
  for (const cell of cells) {
    const eqn = [...cell.ceqn]
    // If cell has a bare number cval, add it as a constraint
    if (cell.fix && cell.cval !== null) {
      eqn.push(cell.cval)
    }
    eqns.push(eqn)
  }
  return eqns
}

function recomputeCellCvals(cells, values, fixedCellIds, pinnedCellId = null) {
  for (const cell of cells) {
    if (cell.id === pinnedCellId) continue
    if (fixedCellIds && fixedCellIds.has(cell.id) && typeof cell.cval === 'number' && isFinite(cell.cval)) {
      continue
    }
    if (!cell.ceqn || cell.ceqn.length === 0) continue

    const results = cell.ceqn.map(expr => {
      const r = vareval(expr, values)
      return r.error ? null : r.value
    }).filter(v => typeof v === 'number' && isFinite(v))

    if (results.length === 0) continue
    cell.cval = results.reduce((a, b) => a + b, 0) / results.length
  }
}

// Build initial values for solvem() from cells
function buildInitialValues(cells) {
  const values = {}

  function isBareIdentifierExpr(expr) {
    const t = (expr || '').trim()
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t)
  }

  // Seed variables that are introduced via constraint-only equations.
  // (Either 2+ expressions, or fixed numeric constraint; in both cases: no bare identifier term.)
  for (const cell of cells) {
    const isConstraintEqn = cell.ceqn.length >= 2 || (cell.fix && cell.cval !== null)
    if (isConstraintEqn && !cell.ceqn.some(isBareIdentifierExpr)) {
      for (const expr of cell.ceqn) {
        for (const v of findVariables(expr)) {
          if (values[v] === undefined) values[v] = 1
        }
      }
    }
  }

  for (const cell of cells) {
    for (const expr of cell.ceqn) {
      const t = expr.trim()
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t) && values[t] === undefined) {
        values[t] = 1
      }
    }
  }

  for (const cell of cells) {
    if (cell.cval === null) continue
    if (cell.ceqn.length !== 1) continue
    const t = cell.ceqn[0].trim()
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t)) continue
    values[t] = cell.cval
  }

  return values
}

// Compute initial values for all variables using solvem()
function computeInitialValues(cells, symbols) {
  const errors = []

  // Build equations, initial values, and frozen set, then solve
  const eqns = buildEquations(cells)
  const seedValues = buildInitialValues(cells)
  let values
  try {
    values = solvemAss(eqns, seedValues)
  } catch (e) {
    errors.push(String(e && e.message ? e.message : e))
    values = { ...seedValues }
  }

  return { values, errors, emptyExprVars: new Set() }
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
    return null  // Couldn't find a valid solution
  }
  return finalVal
}

// Find a constraint involving varName and solve for it
// Uses ceqn which includes cvar at index 0
/*
function solveFromConstraints(varName, cells, values) {
  for (const cell of cells) {
    if (!cell.hasConstraint) continue  // Only look at cells with actual constraints

    // Find expressions with and without the variable
    // Skip ceqn[0] which is the cvar (nonce variable)
    let targetExpr = null, solveExpr = null
    for (let i = 1; i < cell.ceqn.length; i++) {
      const expr = cell.ceqn[i]
      const vars = findVariables(expr)
      if (vars.has(varName)) {
        solveExpr = expr
      } else if (!targetExpr) {
        targetExpr = expr
      }
    }

    if (!solveExpr) continue // Variable not in this constraint

    // Get target value - either from expression or from cell's value
    let targetValue = null
    if (targetExpr) {
      // Check all other variables have values
      const allVars = findVariables(targetExpr)
      if (![...allVars].every(v => values[v] !== undefined)) continue
      // Evaluate target expression
      const targetRes = vareval(targetExpr, values)
      if (targetRes.error || !isFinite(targetRes.value)) continue
      targetValue = targetRes.value
    } else if (values[cell.cvar] !== undefined) {
      // Use cell's current value (from bare number or prior solving) as target
      targetValue = values[cell.cvar]
    } else {
      continue // No target available
    }

    // Solve
    const result = solve(solveExpr, varName, targetValue, values)
    if (result !== null) return result
  }
  return null
}

*/

// Check if initial values contradict any constraints (fail loudly per Anti-Postel)
// Skip checking constraints that involve variables with empty expressions (those need solving)
function checkInitialContradictions(cells, values, emptyExprVars) {
  const errors = []

  for (const cell of cells) {
    // Only check cells that actually have constraints
    if (cell.hasConstraint) {
      // Check if this constraint involves any variable that needs to be computed
      const varsInConstraint = new Set()
      cell.ceqn.forEach(expr => {
        if (expr && expr.trim() !== '') {
          findVariables(expr).forEach(v => varsInConstraint.add(v))
        }
      })

      // Skip if any variable in this constraint has an empty expression (needs solving)
      const involvesEmptyVar = [...varsInConstraint].some(v => emptyExprVars.has(v))
      if (involvesEmptyVar) continue

      // This is a constraint - all expressions in ceqn should evaluate equal
      const results = cell.ceqn.map(expr => {
        if (!expr || expr.trim() === '') return null
        const r = vareval(expr, values)
        return r.error ? null : r.value
      })

      // Skip if any expression couldn't be evaluated
      if (results.some(r => r === null)) continue

      // Check if all results are approximately equal
      const first = results[0]
      const tolerance = Math.abs(first) * 1e-6 + 1e-6
      for (let i = 1; i < results.length; i++) {
        if (Math.abs(results[i] - first) > tolerance) {
          // TODO: only count expressions from the urtext, not the cvar
          const exprStr = cell.ceqn.join(' = ')
          const valuesStr = results.map(r => formatNum(r)).join(' ≠ ')
          errors.push(`Contradiction: {${exprStr}} evaluates to ${valuesStr}`)
          break
        }
      }
    }
  }

  return errors
}

// Check if a cell's cval matches all expressions in its ceqn
// Per spec: "cell's field is shown in red if cval differs from any of the expressions in ceqn"
function isCellViolated(cell, values) {
  const cval = cell.cval
  if (typeof cval !== 'number' || !isFinite(cval)) return true

  const tol = 1e-6  // Matches solver tolerance for practical floating-point comparisons
  const tolerance = Math.abs(cval) * tol + tol

  for (const expr of cell.ceqn) {
    if (!expr || expr.trim() === '') continue

    const result = vareval(expr, values)
    if (result.error) return true

    if (Math.abs(result.value - cval) > tolerance) return true
  }

  return false
}

// Get set of cell IDs that are violated (for UI highlighting)
function getViolatedCellIds(cells, values) {
  const violatedIds = new Set()
  for (const cell of cells) {
    if (isCellViolated(cell, values)) {
      violatedIds.add(cell.id)
    }
  }
  return violatedIds
}

/*

// Check constraints for solver purposes (only cells with explicit constraints like a=b)
// Used by solveConstraints to know which constraints to try to satisfy
function checkConstraints(cells, values) {
  const violations = []
  const tol = 1e-9

  for (const cell of cells) {
    // Only check cells that actually have constraints (multiple expressions or expr=number)
    if (!cell.hasConstraint) continue

    // Skip ceqn[0] (the cvar/nonce) - only check actual expressions in ceqn[1:]
    const exprs = cell.ceqn.slice(1)
    if (exprs.length < 2) continue  // Need at least 2 expressions to compare

    const results = exprs.map(expr => {
      const r = vareval(expr, values)
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
// Uses ceqn which includes cvar at index 0
function solveConstraints(cells, values, fixedVars, changedVar) {
  const newValues = { ...values }

  const cellByCvar = new Map(cells.map(cell => [cell.cvar, cell]))

  function isEmptyExprVar(varName) {
    const cell = cellByCvar.get(varName)
    if (!cell) return false
    // Empty if ceqn only has cvar and no other expressions
    if (cell.ceqn.length <= 1) return true
    const expr = cell.ceqn[1]  // First expression after cvar
    return !expr || expr.trim() === ''
  }

  function varsInConstraintInOrder(cell) {
    const vars = []
    const seen = new Set()
    for (const expr of cell.ceqn) {
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
      if (!cell.hasConstraint) continue  // Only solve cells with actual constraints

      // Find all variables and which are adjustable
      const adjustable = varsInConstraintInOrder(cell)
        .filter(v => !fixedVars.has(v) && v !== changedVar)
        .sort((a, b) => Number(isEmptyExprVar(b)) - Number(isEmptyExprVar(a)))
      if (adjustable.length === 0) continue

      const violationsBefore = checkConstraints(cells, newValues)
      const violationCountBefore = violationsBefore.length

      for (const varToSolve of adjustable) {
        // Find target (expression without varToSolve) and solve expression (one that contains varToSolve)
        // Skip ceqn[0] which is the cvar - we want actual expressions
        let targetExpr = null, solveExpr = null

        for (let i = 1; i < cell.ceqn.length; i++) {
          const expr = cell.ceqn[i]
          const vars = findVariables(expr)
          if (vars.has(varToSolve)) {
            if (!solveExpr) solveExpr = expr
          } else if (!targetExpr) {
            targetExpr = expr
          }
        }

        if (!targetExpr || !solveExpr) continue

        const targetRes = vareval(targetExpr, newValues)
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
*/

// =============================================================================
// State Management
// =============================================================================

let state = {
  recipeText: '',
  cells: [],
  symbols: {},
  values: {},
  fixedCellIds: new Set(),
  userEditedVars: new Set(),  // Track variables the user has directly edited
  errors: [],
  solveBanner: '',
  currentRecipeKey: '',
  currentEditCellId: null,
  valuesBeforeEdit: null,
}

// =============================================================================
// Main Parse and Render Functions
// =============================================================================

function parseRecipe() {
  const text = state.recipeText
  const previousValues = state.values

  state.currentEditCellId = null
  state.valuesBeforeEdit = null
  
  if (!text.trim()) {
    state.cells = []
    state.symbols = {}
    state.values = {}
    state.userEditedVars = new Set()
    state.errors = []
    $('recipeOutput').style.display = 'none'
    $('copySection').style.display = 'none'
    updateRecipeDropdown()
    return
  }

  // Clear user edits when recipe changes
  state.userEditedVars = new Set()

  // Check for syntax errors (nested/unbalanced braces)
  const syntaxErrors = checkBraceSyntax(text)

  // Parse
  let cells = extractCells(text)
  cells = cells.map(parseCell)
  // cells = preprocessLabels(cells)

  // Build symbol table
  const { symbols, errors: symbolErrors } = buildSymbolTable(cells)
  
  // Compute initial values
  const { values, errors: valueErrors, emptyExprVars } = computeInitialValues(cells, symbols)
  
  // Check for contradictions in initial values (skip constraints involving empty-expr vars)
  const contradictions = checkInitialContradictions(cells, values, emptyExprVars)

  const allErrors = [...syntaxErrors, ...symbolErrors, ...valueErrors, ...contradictions]

  // NOTE: Previously we tried to backfill missing variable values from the
  // previous parse to keep the UI populated on error. Per Anti-Postel, we fail
  // loudly instead.
  // if (allErrors.length > 0) {
  //   for (const cell of cells) {
  //     if (values[cell.cvar] !== undefined) continue
  //     const previousValue = previousValues[cell.cvar]
  //     if (typeof previousValue === 'number' && isFinite(previousValue)) {
  //       values[cell.cvar] = previousValue
  //     }
  //   }
  // }
  
  // Update state
  state.cells = cells
  state.symbols = symbols
  state.values = values
  state.errors = allErrors
  // Per README future-work item 8: cells defined with bare numbers start frozen.
  state.fixedCellIds = new Set(cells.filter(c => c.fix).map(c => c.id))
  recomputeCellCvals(cells, values, state.fixedCellIds)
  state.solveBanner = ''
  
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

  const violatedCellIds = getViolatedCellIds(state.cells, state.values)

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
      const value = cell.cval
      const displayValue = formatNum(value)
      const isFixed = state.fixedCellIds.has(cell.id)
      const isInvalid = invalidCellIds.has(cell.id)
      const title = `${cell.urtext}`.replace(/"/g, '&quot;')
      const disabledAttr = disableInputs ? ' disabled' : ''

      const label = cell.ceqn.length > 0 ? cell.ceqn[0].trim() : ''
      html += `<input type="text" class="recipe-field ${isFixed ? 'fixed' : ''} ${isInvalid ? 'invalid' : ''}" data-label="${label}" data-cell-id="${cell.id}" value="${displayValue}" title="${title}"${disabledAttr}>`

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

  const solveBanner = `<div id="solveBanner" class="error-display solve-display"${state.solveBanner ? '' : ' hidden'}>
        <div class="error-message">⚠️ ${escapeHtml(state.solveBanner)}</div>
      </div>`

  // Update slider display
  updateSliderDisplay()
  
  if (state.cells.length === 0 && state.errors.length === 0) {
    output.style.display = 'none'
    copySection.style.display = 'none'
    return
  }
  
  output.innerHTML = `${errorBanner}${solveBanner}${renderRecipeBody({ disableInputs: false, invalidCellIds: violatedCellIds })}`
  output.style.display = 'block'
  copySection.style.display = 'block'

  $('copyButton').disabled = criticalErrors.length > 0
  
  // Attach event handlers to inputs
  output.querySelectorAll('input.recipe-field').forEach(input => {
    input.addEventListener('input', handleFieldInput)
    // input.addEventListener('blur', handleFieldBlur)
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

// TODO: ugh, hundreds of occurrences of "value", many but not all of which
// should be "cval"

function handleFieldInput(e) {
  const input = e.target
  const cellId = input.dataset.cellId
  const newValue = toNum(input.value)

  function updateSolveBannerInDom() {
    const banner = $('solveBanner')
    if (!banner) return

    if (!state.solveBanner) {
      banner.hidden = true
      const msg = banner.querySelector('.error-message')
      if (msg) msg.textContent = ''
      return
    }

    banner.hidden = false
    const msg = banner.querySelector('.error-message')
    if (msg) msg.textContent = `⚠️ ${state.solveBanner}`
  }

  // Invalid number format - just mark invalid, don't change state
  if (newValue === null || !isFinite(newValue)) {
    input.classList.add('invalid')
    state.solveBanner = ''
    updateSolveBannerInDom()
    return
  }

  input.onblur = handleFieldBlur

  const cell = state.cells.find(c => c.id === cellId)
  if (!cell) return

  if (state.currentEditCellId !== cellId) {
    state.currentEditCellId = cellId
    state.valuesBeforeEdit = { ...state.values }
  }

  // Build equations for solving
  // Per spec: "A cell is always treated temporarily as frozen while it's being
  // edited" - meaning we add its new value as a constraint.
  // Per spec: "If its ceqn includes a bare number, it's frozen" - but initially
  // bare numbers go to cval not ceqn, so cells with values are NOT frozen by
  // default. Only user-frozen cells (state.fixedVars) are frozen.
  const eqns = state.cells.map(c => {
    const eqn = [...c.ceqn]  // Keep expressions (e.g., '12x')
    if (c.id === cellId) {
      // Edited cell: temporarily frozen at new value
      eqn.push(newValue)
    } else if (state.fixedCellIds.has(c.id)) {
      // User-frozen cell: frozen at current value
      eqn.push(c.cval)
    }
    // Note: cells with bare values in definition (cell.value) are NOT frozen
    // by default - they just have initial values. The solver is free to change
    // them to satisfy constraints.
    return eqn
  })

  // Frozen = only user-frozen cells (not the edited cell - we added its
  // constraint above but the solver may need to derive other values from it)
  // Solve
  const seedValues = { ...state.values }
  const newValues = solvemAss(eqns, seedValues)

  const constraintsSatisfied = eqnsSatisfied(eqns, newValues)
  if (!constraintsSatisfied) {
    const anyOtherFrozen = state.fixedCellIds.size > 0
    state.solveBanner = anyOtherFrozen
      ? 'Overconstrained! Try unfreezing cells.'
      : 'No solution found.'
  } else {
    state.solveBanner = ''
  }

  updateSolveBannerInDom()

  // Commit the new values
  state.values = newValues
  cell.cval = newValue
  recomputeCellCvals(state.cells, state.values, state.fixedCellIds, cellId)

  // Get ALL violated cells for UI highlighting
  const violatedCellIds = getViolatedCellIds(state.cells, state.values)

  // Update all fields with new values and highlight violations
  $('recipeOutput').querySelectorAll('input.recipe-field').forEach(field => {
    if (field === input) {
      // Don't overwrite what user is typing, but do update invalid status
      if (violatedCellIds.has(field.dataset.cellId)) {
        field.classList.add('invalid')
      } else {
        field.classList.remove('invalid')
      }
      return
    }
    const otherCell = state.cells.find(c => c.id === field.dataset.cellId)
    if (otherCell) field.value = formatNum(otherCell.cval)
    if (violatedCellIds.has(field.dataset.cellId)) {
      field.classList.add('invalid')
    } else {
      field.classList.remove('invalid')
    }
  })

  updateSliderDisplay()
}

/*
// Recompute all field values based on current variable values (mutates state.values)
function recomputeAllValues() {
  state.values = recomputeValues(state.cells, state.values)
}

// Pure version: recompute derived values and return new values object
// Uses ceqn where [0] is cvar and [1:] are expressions
// skipVars: optional Set of cvars that should not be recomputed (user-edited vars)
function recomputeValues(cells, values, skipVars = new Set()) {
  const newValues = { ...values }

  // Multiple passes to handle dependencies
  for (let pass = 0; pass < 10; pass++) {
    let changed = false

    for (const cell of cells) {
      // Don't recompute user-edited variables - their values should stick
      if (skipVars.has(cell.cvar)) continue

      // ceqn[1] is the first expression (ceqn[0] is cvar)
      if (cell.ceqn.length < 2) continue
      const expr = cell.ceqn[1]
      if (!expr || expr.trim() === '') continue

      const vars = findVariables(expr)

      // If all variables are defined, recompute this value
      const allDefined = [...vars].every(v => newValues[v] !== undefined)
      if (allDefined && vars.size > 0) {
        const result = vareval(expr, newValues)
        if (!result.error && isFinite(result.value)) {
          const oldVal = newValues[cell.cvar]
          if (oldVal === undefined || Math.abs(result.value - oldVal) > 1e-10) {
            newValues[cell.cvar] = result.value
            changed = true
          }
        }
      }
    }

    if (!changed) break
  }

  return newValues
}
*/

function handleFieldBlur(e) {
  const blurredCellId = e.target.dataset.cellId

  e.target.onblur = null

  const didEditThisField = state.currentEditCellId === blurredCellId
  if (!didEditThisField) {
    state.solveBanner = ''
    const banner = $('solveBanner')
    if (banner) banner.hidden = true
    return
  }

  const anyOtherFrozen = [...state.fixedCellIds].some(id => id !== blurredCellId)
  if (!anyOtherFrozen) {
    state.currentEditCellId = null
    state.valuesBeforeEdit = null
    state.solveBanner = ''
    const banner = $('solveBanner')
    if (banner) banner.hidden = true
    updateSliderDisplay()
    return
  }

  // NOTE: This guard was introduced to stop blur-triggered drift when tabbing.
  // It's safe to delete because blur-solving is now only wired up for fields
  // that received an actual `input` event.
  // const didEditThisField = state.currentEditCellId === blurredCellId
  // if (!didEditThisField) {
  //   state.solveBanner = ''
  //   const banner = $('solveBanner')
  //   if (banner) banner.hidden = true
  //   return
  // }

  const blurredValue = toNum(e.target.value)
  if (blurredValue === null || !isFinite(blurredValue)) {
    e.target.classList.add('invalid')
    return
  }

  const blurredCell = state.cells.find(c => c.id === blurredCellId)
  if (!blurredCell) return

  blurredCell.cval = blurredValue

  const isSingletonIdentifier = (
    blurredCell.ceqn.length === 1 &&
    /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(blurredCell.ceqn[0].trim())
  )

  const shouldSnapBack = (
    isSingletonIdentifier &&
    !blurredCell.hasNumber &&
    !state.fixedCellIds.has(blurredCellId)
  )

  const useBaseline = (
    state.currentEditCellId === blurredCellId &&
    state.valuesBeforeEdit
  )

  const baseline = useBaseline ? state.valuesBeforeEdit : state.values

  // const baseline = state.values

  const eqns = state.cells.map(c => {
    const eqn = [...c.ceqn]
    if (state.fixedCellIds.has(c.id)) {
      eqn.push(c.cval)
    }
    if (c.id === blurredCellId && !state.fixedCellIds.has(c.id) && !shouldSnapBack) {
      eqn.push(blurredValue)
    }
    return eqn
  })

  let solved = solvemAss(eqns, { ...baseline })

  const acceptBlurredValue = eqnsSatisfied(eqns, solved)
  if (!acceptBlurredValue) {
    const eqnsWithoutBlurredConstraint = state.cells.map(c => {
      const eqn = [...c.ceqn]
      if (state.fixedCellIds.has(c.id)) {
        eqn.push(c.cval)
      }
      return eqn
    })

    solved = solvemAss(eqnsWithoutBlurredConstraint, { ...baseline })
  }

  state.values = solved
  state.solveBanner = ''

  state.currentEditCellId = null
  state.valuesBeforeEdit = null

  recomputeCellCvals(state.cells, state.values, state.fixedCellIds)

  const violatedCellIds = getViolatedCellIds(state.cells, state.values)

  $('recipeOutput').querySelectorAll('input.recipe-field').forEach(field => {
    const c = state.cells.find(x => x.id === field.dataset.cellId)
    if (c) field.value = formatNum(c.cval)
    if (violatedCellIds.has(field.dataset.cellId)) {
      field.classList.add('invalid')
    } else {
      field.classList.remove('invalid')
    }
  })

  // Clear the solve banner on blur
  const banner = $('solveBanner')
  if (banner) banner.hidden = true

  updateSliderDisplay()
}

function handleFieldKeypress(e) {
  if (e.key === 'Enter') {
    e.target.blur()
  }
}

function handleFieldDoubleClick(e) {
  const input = e.target
  const cellId = input.dataset.cellId
  
  // Per README: "you can't mark a field fixed when in that state" (invalid)
  if (input.classList.contains('invalid')) {
    return
  }
  
  // Toggle fixed state
  if (state.fixedCellIds.has(cellId)) {
    state.fixedCellIds.delete(cellId)
    input.classList.remove('fixed')
  } else {
    state.fixedCellIds.add(cellId)
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
      result += formatNum(cell.cval)
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
  const newX = toNum(e.target.value)
  if (newX === null || newX <= 0) return

  const xCell = state.cells.find(c => c.ceqn.some(expr => expr.trim() === 'x'))
  if (!xCell) return

  // Build equations with x temporarily frozen at new value
  const eqns = state.cells.map(c => {
    const eqn = [...c.ceqn]
    if (c.id === xCell.id) {
      eqn.push(newX)
    } else if (state.fixedCellIds.has(c.id)) {
      eqn.push(c.cval)
    }
    return eqn
  })

  const seedValues = { ...state.values, x: newX }
  state.values = solvemAss(eqns, seedValues)

  xCell.cval = newX
  recomputeCellCvals(state.cells, state.values, state.fixedCellIds, xCell.id)

  // Update display and re-render
  updateSliderDisplay()
  renderRecipe()
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

  const helpButton = $('helpButton')
  const helpPopover = $('helpPopover')

  function setHelpOpen(isOpen) {
    helpPopover.hidden = !isOpen
    helpButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false')
  }

  helpButton.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    setHelpOpen(helpPopover.hidden)
  })

  document.addEventListener('click', (e) => {
    if (helpPopover.hidden) return
    const target = e.target
    if (helpPopover.contains(target) || helpButton.contains(target)) return
    setHelpOpen(false)
  })

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (helpPopover.hidden) return
    setHelpOpen(false)
  })
  
  // Load first recipe
  const firstKey = Object.keys(recipesShown)[0]
  if (recipeHash[firstKey]) {
    state.recipeText = recipeHash[firstKey]
    $('recipeTextarea').value = state.recipeText
    parseRecipe()
  }
}

document.addEventListener('DOMContentLoaded', init)
