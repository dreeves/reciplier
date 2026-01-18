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
  return isFiniteNumber(n) ? n : null
}

function isFiniteNumber(value) {
  return typeof value === 'number' && isFinite(value)
}

function formatNum(num) {
  if (!isFiniteNumber(num)) return '?'
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
// Debug Logging for Failed Solves (Future Work Item 14)
// =============================================================================

// Log a failed solve to console in qual format and Mathematica syntax
function logFailedSolve(eqns, seedValues, solvedValues) {
  // Format as qual test case
  const eqnsStr = JSON.stringify(eqns)
  const seedStr = JSON.stringify(seedValues)
  const solvedStr = JSON.stringify(solvedValues)
  console.log(`// Failed solve - qual format:`)
  console.log(`solvem(${eqnsStr}, ${seedStr})`)
  console.log(`// Solver returned: ${solvedStr}`)

  // Format as Mathematica syntax
  // Each equation [a, b, c] becomes constraints a == b, b == c
  const constraints = []
  for (const eqn of eqns) {
    for (let i = 0; i < eqn.length - 1; i++) {
      const left = String(eqn[i]).replace(/\*/g, ' ').replace(/\^/g, '^')
      const right = String(eqn[i + 1]).replace(/\*/g, ' ').replace(/\^/g, '^')
      constraints.push(`${left} == ${right}`)
    }
  }
  const vars = Object.keys(seedValues).sort()
  console.log(`// Mathematica syntax:`)
  console.log(`Solve[{${constraints.join(', ')}}, {${vars.join(', ')}}]`)
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

function findCommentRanges(text) {
  const ranges = []
  const commentRegex = /<!--[\s\S]*?-->/g
  let match
  while ((match = commentRegex.exec(text)) !== null) {
    ranges.push({
      start: match.index,
      end: match.index + match[0].length
    })
  }
  return ranges
}

function nonCommentSlices(start, end, commentRanges) {
  const slices = []
  let pos = start
  for (const { start: cStart, end: cEnd } of commentRanges) {
    if (cEnd <= pos) continue
    if (cStart >= end) break
    if (cStart > pos) slices.push([pos, Math.min(cStart, end)])
    pos = Math.min(cEnd, end)
    if (pos >= end) break
  }
  if (pos < end) slices.push([pos, end])
  return slices
}

// Extract all {...} cells from text, noting which are inside HTML comments
// TODO: no, we shouldn't care whether anything's in an html comment when 
// extracting cells. only the rendering cares about that.
function extractCells(text) {
  const cells = []
  let cellId = 0
  const commentRanges = findCommentRanges(text)

  // Find all {...} cells (simple non-nested matching)
  const cellRegex = /\{([^{}]*)\}/g
  let match
  while ((match = cellRegex.exec(text)) !== null) {
    // TODO: what's the difference between raw and urtext?
    // TODO: cells shouldn't care if they're defined inside a comment, probably
    cells.push({
      id: `cell_${cellId++}`,
      raw: match[0],
      urtext: match[1],
      content: match[1],
      inComment: commentRanges.some(r => match.index >= r.start && match.index < r.end),
      startIndex: match.index,
      endIndex: match.index + match[0].length
    })
  }

  return cells
}

function evalConstantExpression(expr) {
  const trimmed = String(expr).trim()
  const numeric = toNum(trimmed)

  const vars = varparse(trimmed)

  const shouldEval = numeric === null && vars.size === 0
  const r = shouldEval ? vareval(trimmed, {}) : { error: true, value: null }
  const evalOk = !r.error && isFiniteNumber(r.value)
  return numeric !== null ? numeric : (evalOk ? r.value : null)
}

function parseInequalities(content) {
  const trimmed = content.trim()
  const attempted = /[<>]/.test(trimmed)
  const match = attempted ? trimmed.match(/^(.+?)\s*(<=|<)\s*(.+?)\s*(<=|<)\s*(.+?)$/) : null
  const infRaw = match ? match[1].trim() : ''
  const infOp = match ? match[2] : ''
  const middleRaw = match ? match[3].trim() : trimmed
  const supOp = match ? match[4] : ''
  const supRaw = match ? match[5].trim() : ''
  const hasRight = attempted && />/.test(trimmed)
  const leftoverAngles = /[<>]/.test(infRaw + middleRaw + supRaw)
  const infVal = evalConstantExpression(infRaw)
  const supVal = evalConstantExpression(supRaw)
  const boundsOk = isFiniteNumber(infVal) && isFiniteNumber(supVal)
  const infStrict = infOp === '<'
  const supStrict = supOp === '<'
  const equalBounds = boundsOk && Math.abs(infVal - supVal) < 1e-12
  const ordered = boundsOk && (infVal < supVal || (equalBounds && !infStrict && !supStrict))
  const invalid = attempted && (hasRight || !match || leftoverAngles || !ordered)

  return {
    attempted,
    core: match ? middleRaw : trimmed,
    bounds: (!attempted || invalid) ? null : { inf: infVal, sup: supVal, infStrict, supStrict },
    error: invalid ? 'ineq' : null
  }
}

// Parse a single cell's content into cval and ceqn
// Per spec: ceqn is a list of non-constant expressions split on "=".
// cval is the constant if there is one, null otherwise.
function parseCell(cell) {
  const content = cell.content.trim()
  const colonMatches = content.match(/:/g)
  const colonCount = colonMatches ? colonMatches.length : 0
  const hasColon = colonCount > 0
  const colonIndex = hasColon ? content.indexOf(':') : -1
  const leftPart = hasColon ? content.slice(0, colonIndex).trim() : content
  const rightPart = hasColon ? content.slice(colonIndex + 1).trim() : ''
  const colonMultiple = colonCount > 1
  const colonRightHasEq = hasColon && /[=<>]/.test(rightPart)
  const colonError = colonMultiple ? 'multi' : (colonRightHasEq ? 'rhs' : null)
  const initExpr = hasColon && !colonError ? rightPart : null
  const inequality = parseInequalities(leftPart)
  const exprPart = inequality.error ? '' : inequality.core

  // Split by = to get constraint expressions (but be careful with == or !=)
  // We want to split on single = that's not part of == or !=
  let parts = exprPart.split(/(?<![=!<>])=(?!=)/).map(e => e.trim()).filter(e => e !== '')

  // Separate bare numbers from expressions
  // Per spec: bare numbers go to cval field, not ceqn
  const bareNumbers = []
  const nonConstParts = []
  const partIsConst = []
  for (const part of parts) {
    const constVal = evalConstantExpression(part)
    const isConst = constVal !== null
    isConst ? bareNumbers.push(constVal) : nonConstParts.push(part)
    partIsConst.push(isConst)
  }

  const bareVars = parts.filter(part => isbarevar(part))
  const ineq = inequality.bounds && bareVars.length
    ? { ...inequality.bounds, varName: bareVars[0] }
    : null
  const ineqError = Boolean(inequality.error || (inequality.bounds && bareVars.length === 0))
  const activeParts = ineqError ? [] : parts

  const startsFrozen = activeParts.length > 0 && partIsConst.some(Boolean)

  // Error flag if multiple bare numbers (spec case 7)
  const multipleNumbers = !ineqError && bareNumbers.length > 1

  // cval is the bare number (if exactly one), otherwise null
  const cval = !ineqError && bareNumbers.length === 1 ? bareNumbers[0] : null

  const ceqn = ineqError ? [] : nonConstParts

  // TODO: pretty sure we don't need most of this:
  return {
    ...cell,
    cval,
    startsFrozen,
    ceqn,
    initExpr,
    colonError,
    urceqn: activeParts,
    urparts: activeParts,
    ineq: ineqError ? null : ineq,
    ineqError: !!ineqError,
    hasConstraint: !ineqError && activeParts.length >= 2,
    multipleNumbers,  // error flag
    hasNumber: !ineqError && bareNumbers.length === 1
  }
}

// =============================================================================
// Symbol Table and Validation
// =============================================================================

// findVariables is now provided by csolver.js

// Build symbol table from parsed cells
function buildSymbolTable(cells) {
  const symbols = {}
  const errors = []
  const varInfo = new Map()

  // First pass: collect variables and check for errors
  cells.some(c => c.ineqError) && errors.push('Inequalities must start and end with a constant')

  for (const cell of cells) {
    // Error case 7: multiple bare numbers in a cell
    cell.multipleNumbers && errors.push(`Cell ${cell.raw} has more than one numerical value`)
    cell.colonError === 'multi' && errors.push(
      `Cella ${cell.raw} plures colonos habet`)
    cell.colonError === 'rhs' && errors.push(
      `Cella ${cell.raw} plus quam unam expressionem post colonem habet`)

    cell.ceqn.length === 0 && cell.cval !== null &&
      errors.push(`Cell ${cell.raw} is a bare number ` +
                  `which doesn't make sense to put in a cell`)

    const cellVars = new Set()
    for (const expr of cell.ceqn) {
      for (const v of varparse(expr)) {
        symbols[v] = true
        cellVars.add(v)
      }
    }

    for (const v of cellVars) {
      const existing = varInfo.get(v)
      const entry = existing || { count: 0, firstCell: cell }
      entry.count += 1
      varInfo.set(v, entry)
    }
  }

  // Check for unreferenced variables (Error Case 4)
  // Per README: "A variable in a cell isn't referenced by any other cell."
  // For each variable in each cell, check if it appears in at least one OTHER cell.
  // Cells in HTML comments count as references (that's the documented workaround).
  for (const [varName, info] of varInfo) {
    info.count === 1 && errors.push(`Variable ${varName} in ${info.firstCell.raw} not referenced in any other cell`)
  }

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
    eqns.push(eqn)
  }
  return eqns
}

function hasInitExpr(cell) {
  return cell.initExpr !== null && cell.initExpr !== undefined
}

function cellPartsForInit(cell, includeInit) {
  const parts = [...(cell.urparts || cell.urceqn || [])]
  if (includeInit && hasInitExpr(cell)) {
    parts.push(cell.initExpr)
  }
  return parts
}

function buildInitialEquations(cells, includeInit = false) {
  return cells.map(c => {
    const parts = cellPartsForInit(c, includeInit)
    return parts.map(p => {
      if (typeof p !== 'string') return p
      const vars = varparse(p)
      if (vars.size !== 0) return p
      const r = vareval(p, {})
      if (r.error || !isFiniteNumber(r.value)) return p
      return r.value
    })
  })
}

function buildInitialSeedValues(cells, includeInit = false) {
  const values = {}
  for (const cell of cells) {
    const parts = cellPartsForInit(cell, includeInit)
    for (const expr of parts) {
      if (typeof expr !== 'string') continue
      for (const v of varparse(expr)) {
        if (values[v] === undefined) values[v] = 1
      }
    }
  }
  return values
}

function combineBounds(cells) {
  const combined = new Map()

  for (const cell of cells.filter(c => c.ineq)) {
    const { varName, inf, sup, infStrict, supStrict } = cell.ineq
    const entry = combined.get(varName) || { inf: null, sup: null, infStrict: false, supStrict: false }

    if (isFiniteNumber(inf)) {
      if (entry.inf === null || inf > entry.inf) {
        entry.inf = inf
        entry.infStrict = infStrict
      } else if (Math.abs(inf - entry.inf) < 1e-12) {
        entry.infStrict = entry.infStrict || infStrict
      }
    }

    if (isFiniteNumber(sup)) {
      if (entry.sup === null || sup < entry.sup) {
        entry.sup = sup
        entry.supStrict = supStrict
      } else if (Math.abs(sup - entry.sup) < 1e-12) {
        entry.supStrict = entry.supStrict || supStrict
      }
    }

    combined.set(varName, entry)
  }

  return combined
}

function strictEpsilon(infVal, supVal) {
  const hasInf = isFiniteNumber(infVal)
  const hasSup = isFiniteNumber(supVal)
  const scale = Math.max(Math.abs(hasInf ? infVal : 0), Math.abs(hasSup ? supVal : 0), 1)
  let eps = scale * 1e-9 + 1e-9
  if (hasInf && hasSup) {
    const span = Math.abs(supVal - infVal)
    if (span > 0) eps = Math.min(eps, span / 1000)
  }
  return eps
}

function getEffectiveBounds(cells) {
  const combined = combineBounds(cells)
  const inf = {}
  const sup = {}

  for (const [varName, entry] of combined) {
    const eps = strictEpsilon(entry.inf, entry.sup)
    if (isFiniteNumber(entry.inf)) {
      inf[varName] = entry.inf + (entry.infStrict ? eps : 0)
    }
    if (isFiniteNumber(entry.sup)) {
      sup[varName] = entry.sup - (entry.supStrict ? eps : 0)
    }
  }

  return { inf, sup, combined }
}

function contradictionsForEqns(eqns, ass, zij) {
  const errors = []

  for (let i = 0; i < eqns.length; i++) {
    const eqn = eqns[i]
    if (zij[i] === 0) continue
    const results = eqn.map(expr => {
      if (expr === null || expr === undefined) return null
      const s = String(expr)
      if (!s.trim()) return null
      const r = vareval(s, ass)
      return r.error ? null : r.value
    })

    if (results.some(r => r === null)) continue

    const first = results[0]
    // Tolerance must be >= display precision (4 decimal places) to avoid
    // showing contradictions like "1.4023 ≠ 1.4023"
    const tolerance = Math.abs(first) * 1e-4 + 1e-4
    for (let i = 1; i < results.length; i++) {
      if (Math.abs(results[i] - first) > tolerance) {
        const exprStr = eqn.join(' = ')
        const valuesStr = results.map(r => formatNum(r)).join(' ≠ ')
        errors.push(`Contradiction: {${exprStr}} evaluates to ${valuesStr}`)
        break
      }
    }
  }

  return errors
}

function recomputeCellCvals(cells, ass, fixedCellIds, pinnedCellId = null) {
  for (const cell of cells) {
    if (cell.id === pinnedCellId) continue
    if (fixedCellIds && fixedCellIds.has(cell.id) && isFiniteNumber(cell.cval)) {
      continue
    }
    if (!cell.ceqn || cell.ceqn.length === 0) continue

    const results = cell.ceqn.map(expr => {
      const r = vareval(expr, ass)
      return r.error ? null : r.value
    }).filter(isFiniteNumber)

    if (results.length === 0) continue
    cell.cval = results.reduce((a, b) => a + b, 0) / results.length
  }
}

// Compute initial values for all variables using solvem()
function computeInitialValues(cells, bounds) {
  const errors = []
  const baseErrors = []

  // Step 1: Solve the template as written (including constants).
  const { inf, sup } = bounds
  const baseEqns = buildInitialEquations(cells, false)
  const baseSeedValues = buildInitialSeedValues(cells, false)
  let baseResult
  let baseAss
  try {
    baseResult = solvem(baseEqns, baseSeedValues, inf, sup)
    baseAss = baseResult.ass
  } catch (e) {
    baseErrors.push(String(e && e.message ? e.message : e))
    baseAss = { ...baseSeedValues }
    baseResult = { ass: baseAss, zij: new Array(baseEqns.length).fill(NaN), sat: false }
  }

  if (!baseResult.sat) {
    baseErrors.push(...contradictionsForEqns(baseEqns, baseAss, baseResult.zij))
  }

  let solve = { ass: baseAss, eqns: baseEqns, zij: baseResult.zij, sat: baseResult.sat }

  const initCells = cells.filter(hasInitExpr)
  if (initCells.length) {
    const constInitValues = cells.map(c => {
      if (!hasInitExpr(c)) return null
      const constVal = evalConstantExpression(c.initExpr)
      return constVal === null ? null : constVal
    })
    const hasConstInit = constInitValues.some(isFiniteNumber)
    let seedAss = baseAss

    if (hasConstInit) {
      const constEqns = baseEqns.map((eqn, i) => {
        const initVal = constInitValues[i]
        return isFiniteNumber(initVal) ? [...eqn, initVal] : eqn
      })
      let constResult
      let constAss
      try {
        constResult = solvem(constEqns, baseSeedValues, inf, sup)
        constAss = constResult.ass
      } catch (e) {
        constAss = { ...baseSeedValues }
        constResult = { ass: constAss, zij: new Array(constEqns.length).fill(NaN), sat: false }
      }
      if (constResult.sat) seedAss = constAss
    }

    const invalidInitCells = []
    const initValues = cells.map((c, i) => {
      if (!hasInitExpr(c)) return null
      const constVal = constInitValues[i]
      if (isFiniteNumber(constVal)) return constVal
      const r = vareval(c.initExpr, seedAss)
      const valOk = !r.error && isFiniteNumber(r.value)
      if (!valOk) invalidInitCells.push(c)
      return valOk ? r.value : null
    })

    const initEqns = baseEqns.map((eqn, i) => {
      const initVal = initValues[i]
      return isFiniteNumber(initVal) ? [...eqn, initVal] : eqn
    })
    const initSeedValues = baseSeedValues
    let initResult
    let initAss
    try {
      initResult = solvem(initEqns, initSeedValues, inf, sup)
      initAss = initResult.ass
    } catch (e) {
      errors.push(String(e && e.message ? e.message : e))
      initAss = { ...initSeedValues }
      initResult = { ass: initAss, zij: new Array(initEqns.length).fill(NaN), sat: false }
    }

    const initOk = initResult.sat && invalidInitCells.length === 0
    if (initOk) {
      solve = { ass: initAss, eqns: initEqns, zij: initResult.zij, sat: initResult.sat }
    } else {
      if (!baseResult.sat && baseErrors.length) {
        logFailedSolve(baseEqns, baseSeedValues, baseAss)
        errors.push(...baseErrors)
      }
      if (!initResult.sat) {
        logFailedSolve(initEqns, initSeedValues, initAss)
      }
      errors.push(...invalidInitCells.map(cell => `Initial value for ${cell.raw} incompatible with constraints`))
      errors.push('Inconsistent initial values')
    }
  } else if (!baseResult.sat) {
    logFailedSolve(baseEqns, baseSeedValues, baseAss)
    errors.push(...baseErrors)
  }

  return { solve, errors }
}

// =============================================================================
// Constraint Solver
// =============================================================================

// Check if a cell's cval matches all expressions in its ceqn
// Per spec: "cell's field is shown in red if cval differs from any of the expressions in ceqn"
function isCellViolated(cell, ass) {
  const cval = cell.cval
  if (!isFiniteNumber(cval)) return true

  const tol = 1e-6  // Matches solver tolerance for practical floating-point comparisons
  const tolerance = Math.abs(cval) * tol + tol

  if (cell.ineq) {
    const boundTol = Math.abs(cval) * 1e-9 + 1e-9
    const { inf, sup, infStrict, supStrict } = cell.ineq
    if (isFiniteNumber(inf)) {
      const lowerOk = infStrict ? (cval > inf + boundTol) : (cval + boundTol >= inf)
      if (!lowerOk) return true
    }
    if (isFiniteNumber(sup)) {
      const upperOk = supStrict ? (cval < sup - boundTol) : (cval - boundTol <= sup)
      if (!upperOk) return true
    }
  }

  for (const expr of cell.ceqn) {
    if (!expr || expr.trim() === '') continue

    const result = vareval(expr, ass)
    if (result.error) return true

    if (Math.abs(result.value - cval) > tolerance) return true
  }

  return false
}

// Get set of cell IDs that are violated (for UI highlighting)
function getViolatedCellIds(cells, ass) {
  const violatedIds = new Set()
  for (const cell of cells) {
    if (isCellViolated(cell, ass)) {
      violatedIds.add(cell.id)
    }
  }
  return violatedIds
}

// =============================================================================
// State Management
// =============================================================================

let state = {
  recipeText: '',
  cells: [],
  solve: { ass: {}, eqns: null, zij: null, sat: true },
  fixedCellIds: new Set(),
  errors: [],
  solveBanner: '',
  invalidExplainBanner: '',
  invalidInputCellIds: new Set(),
  hiddenSliders: new Set(),
  activeSlider: null,
  bounds: { inf: {}, sup: {}, combined: new Map() },
}

// =============================================================================
// Main Parse and Render Functions
// =============================================================================

function parseRecipe() {
  const text = state.recipeText

  if (!text.trim()) { // does this mean the whole reciplate is the empty string?
    state.cells = []
    state.solve = { ass: {}, eqns: null, zij: null, sat: true }
    state.errors = []
    state.solveBanner = ''
    state.invalidExplainBanner = ''
    state.invalidInputCellIds = new Set()
    state.activeSlider = null
    state.bounds = { inf: {}, sup: {}, combined: new Map() }
    $('recipeOutput').style.display = 'none'
    $('copySection').style.display = 'none'
    const sliderPanel = $('sliderPanel')
    if (sliderPanel) sliderPanel.style.display = 'none'
    updateRecipeDropdown()
    return
  }

  // Check for syntax errors (nested/unbalanced braces)
  const syntaxErrors = checkBraceSyntax(text)

  // Parse
  let cells = extractCells(text)
  cells = cells.map(parseCell)

  // Build symbol table
  const { errors: symbolErrors } = buildSymbolTable(cells)
  
  // Compute initial values (includes template satisfiability check)
  const bounds = getEffectiveBounds(cells)
  const { solve, errors: valueErrors } = computeInitialValues(cells, bounds)

  const allErrors = [...syntaxErrors, ...symbolErrors, ...valueErrors]
  
  // Update state
  state.cells = cells
  state.solve = solve
  state.bounds = bounds
  state.activeSlider = null
  state.errors = allErrors
  // Per README future-work item 8: cells defined with bare numbers start frozen
  // state.fixedCellIds = new Set(cells.filter(c => c.fix).map(c => c.id))
  state.fixedCellIds = new Set(cells.filter(c => c.startsFrozen).map(c => c.id))
  recomputeCellCvals(cells, solve.ass, state.fixedCellIds)
  state.solveBanner = ''
  state.invalidExplainBanner = ''
  state.invalidInputCellIds = new Set()
  
  updateRecipeDropdown()
  renderRecipe()
}

function updateRecipeDropdown() {
  // Check if current text matches any recipe
  let matchingKey = 'custom'
  for (const key in reciplates) {
    if (reciplates[key] === state.recipeText) {
      matchingKey = key
      break
    }
  }
  $('recipeSelect').value = matchingKey
}

function renderRecipe() {
  const output = $('recipeOutput')
  const copySection = $('copySection')
  
  const criticalErrors = state.errors

  const invalidCellIds = collectInvalidCellIds(state.solve.eqns, state.solve.zij)

  function renderRecipeBody({ disableInputs, invalidCellIds }) {
    const text = state.recipeText
    const commentRanges = findCommentRanges(text)
    // Build the rendered text
    let html = ''
    let lastIndex = 0

    // Sort cells by start index
    const visibleCells = state.cells.filter(c => !c.inComment)
                                    .sort((a, b) => a.startIndex - b.startIndex)

    for (const cell of visibleCells) {
      // Add text before this cell
      if (cell.startIndex > lastIndex) {
        for (const [s, e] of nonCommentSlices(lastIndex, cell.startIndex, commentRanges)) {
          html += escapeHtml(text.substring(s, e))
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

    // Add remaining text after last cell
    if (lastIndex < text.length) {
      for (const [s, e] of nonCommentSlices(lastIndex, text.length, commentRanges)) {
        html += escapeHtml(text.substring(s, e))
      }
    }

    // Convert newlines to <br> for display
    html = html.replace(/\n/g, '<br>')
    return `<div class="recipe-rendered">${html}</div>`
  }

  const errorBanner = criticalErrors.length > 0
    ? `<div class="error-display">
        ${criticalErrors.map(e => `<div class="error-message">⚠️ ${e}</div>`).join('')}
      </div>`
    : ''

  const solveBanner = `<div id="solveBanner" class="error-display solve-display"${state.solveBanner ? '' : ' hidden'}>
        <div class="error-message">⚠️ ${escapeHtml(state.solveBanner)}</div>
      </div>`

  const invalidExplainBanner = `<div id="invalidExplainBanner" class="error-display solve-display"${state.invalidExplainBanner ? '' : ' hidden'}>
        <div class="error-message">⚠️ ${escapeHtml(state.invalidExplainBanner)}</div>
      </div>`

  const nonCriticalBanners = `<div id="nonCriticalBanners">${solveBanner}${invalidExplainBanner}</div>`

  // Update slider display
  updateSliderDisplay()
  
  if (state.cells.length === 0 && state.errors.length === 0) {
    output.style.display = 'none'
    copySection.style.display = 'none'
    return
  }
  
  output.innerHTML = `${errorBanner}${nonCriticalBanners}${renderRecipeBody({ disableInputs: false, invalidCellIds })}`
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

  setInvalidExplainBannerFromInvalidity(invalidCellIds)
  updateInvalidExplainBannerInDom()
  repositionNonCriticalBannersAfterLastInvalidBr()
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// =============================================================================
// Event Handlers
// =============================================================================

function updateBannerInDom(bannerId, message) {
  const banner = $(bannerId)
  const msg = banner && banner.querySelector('.error-message')
  const hidden = !message
  banner && (banner.hidden = hidden)
  msg && (msg.textContent = hidden ? '' : `⚠️ ${message}`)
}

function updateSolveBannerInDom() {
  updateBannerInDom('solveBanner', state.solveBanner)
}

function updateInvalidExplainBannerInDom() {
  updateBannerInDom('invalidExplainBanner', state.invalidExplainBanner)
}

function setInvalidExplainBannerFromInvalidity(invalidCellIds) {
  const hasErrors = (state.errors || []).length > 0
  const hasSolveBanner = !!state.solveBanner
  const invalidInputId = state.invalidInputCellIds?.size
    ? [...state.invalidInputCellIds][state.invalidInputCellIds.size - 1]
    : null
  const invalidInputCell = invalidInputId ? state.cells.find(c => c.id === invalidInputId) : null
  const label = invalidInputCell?.ceqn?.length
    ? String(invalidInputCell.ceqn[0] || '').trim()
    : ''
  const shownLabel = label || '?'
  const invalidInputMessage = invalidInputId ? `ERROR1753: ${shownLabel}` : ''
  const invalidCellId = invalidCellIds?.size
    ? [...invalidCellIds][invalidCellIds.size - 1]
    : null
  const invalidCell = invalidCellId ? state.cells.find(c => c.id === invalidCellId) : null
  const syntaxMessage = invalidCell ? `Syntax error in template: {${invalidCell.urtext}}` : ''
  state.invalidExplainBanner = (hasErrors || hasSolveBanner)
    ? ''
    : (invalidInputId ? invalidInputMessage : (invalidCellId ? syntaxMessage : ''))
}

function repositionNonCriticalBannersAfterLastInvalidBr() {
  const rendered = $('recipeOutput')?.querySelector('.recipe-rendered')
  const banners = rendered && $('nonCriticalBanners')
  if (!rendered || !banners) return

  const invalidFields = rendered.querySelectorAll('input.recipe-field.invalid')
  const lastInvalid = invalidFields.length ? invalidFields[invalidFields.length - 1] : null

  let br = null
  if (lastInvalid) {
    for (let n = lastInvalid.nextSibling; n; n = n.nextSibling) {
      if (n.nodeType === 1 && n.tagName === 'BR') {
        br = n
        break
      }
    }
  }

  const refNode = br ? br.nextSibling : null
  rendered.insertBefore(banners, refNode)
}

function setSolveBannerFromSatisfaction(sat) {
  const anyFrozen = state.fixedCellIds.size > 0
  state.solveBanner = sat
    ? ''
    : (anyFrozen ? 'No solution found (try unfreezing cells)' : 'No solution found')
}

function solveAndApply({
  editedCellId = null,
  editedValue = null,
  editedFieldEl = null,
  seedOverrides = null,
} = {}) {
  const seedAss = { ...state.solve.ass, ...(seedOverrides || {}) }

  const eqns = buildInteractiveEqns(editedCellId, editedValue)
  const { inf, sup } = state.bounds
  const solveResult = solvem(eqns, seedAss, inf, sup)
  const solvedAss = solveResult.ass
  const sat = solveResult.sat
  const zij = solveResult.zij

  if (!sat) {
    logFailedSolve(eqns, seedAss, solvedAss)
  }

  setSolveBannerFromSatisfaction(sat)
  updateSolveBannerInDom()

  state.solve = { ass: solvedAss, eqns, zij, sat }

  const preserveEdited = editedCellId !== null
  if (preserveEdited) {
    const editedCell = state.cells.find(c => c.id === editedCellId)
    if (editedCell) editedCell.cval = editedValue
  }

  const skipRecomputeCellId = preserveEdited ? editedCellId : null
  if (sat) {
    recomputeCellCvals(state.cells, state.solve.ass, state.fixedCellIds, skipRecomputeCellId)
  }

  const invalidCellIds = collectInvalidCellIds(eqns, zij)

  setInvalidExplainBannerFromInvalidity(invalidCellIds)
  updateInvalidExplainBannerInDom()

  const output = $('recipeOutput')
  if (output) {
    output.querySelectorAll('input.recipe-field').forEach(field => {
      if (editedFieldEl && field === editedFieldEl) {
        if (invalidCellIds.has(field.dataset.cellId)) {
          field.classList.add('invalid')
        } else {
          field.classList.remove('invalid')
        }
        return
      }

      const c = state.cells.find(x => x.id === field.dataset.cellId)
      if (c && !state.invalidInputCellIds.has(field.dataset.cellId)) field.value = formatNum(c.cval)
      if (invalidCellIds.has(field.dataset.cellId)) {
        field.classList.add('invalid')
      } else {
        field.classList.remove('invalid')
      }
    })
  }

  repositionNonCriticalBannersAfterLastInvalidBr()

  updateSliderDisplay()
  return { eqns, solved: solvedAss, sat, invalidCellIds }
}

function buildInteractiveEqns(editedCellId = null, editedValue = null) {
  return state.cells.map(c => {
    const eqn = [...c.ceqn]

    if (editedCellId !== null && c.id === editedCellId) {
      eqn.push(editedValue)
    } else if (state.fixedCellIds.has(c.id)) {
      eqn.push(c.cval)
    }

    return eqn
  })
}

function getUnsatisfiedCellIds(eqns, zij) {
  const unsatisfied = new Set()
  if (!Array.isArray(zij)) return unsatisfied

  const limit = Math.min(eqns.length, zij.length)
  for (let i = 0; i < limit; i++) {
    const residual = zij[i]
    if (Number.isFinite(residual) && residual === 0) continue
    const cell = state.cells[i]
    if (cell && cell.id) unsatisfied.add(cell.id)
  }

  return unsatisfied
}

// Combine per-cell violations, solver residuals, and invalid input markers.
function collectInvalidCellIds(eqns, zij) {
  const invalidCellIds = new Set(getViolatedCellIds(state.cells, state.solve.ass))

  const unsatisfied = state.solveBanner && eqns && zij ? getUnsatisfiedCellIds(eqns, zij) : null
  unsatisfied && unsatisfied.forEach(id => invalidCellIds.add(id))
  for (const id of state.invalidInputCellIds) invalidCellIds.add(id)

  return invalidCellIds
}

// TODO: ugh, hundreds of occurrences of "value", many but not all of which
// should be "cval"

function markInvalidInput(input, cellId, message) {
  input.classList.add('invalid')
  state.invalidInputCellIds.add(cellId)
  state.invalidExplainBanner = message
  updateInvalidExplainBannerInDom()
  repositionNonCriticalBannersAfterLastInvalidBr()
}

function clearInvalidInput(cellId) {
  state.invalidInputCellIds.delete(cellId)
}

function handleFieldInput(e) {
  const input = e.target
  const cellId = input.dataset.cellId
  const newValue = toNum(input.value)

  // Invalid number format - just mark invalid, don't change state
  if (!isFiniteNumber(newValue)) {
    markInvalidInput(input, cellId, `Syntax error: only numbers allowed`)
    return
  }

  clearInvalidInput(cellId)

  const cell = state.cells.find(c => c.id === cellId)
  if (!cell) return
  cell.cval = newValue

  solveAndApply({
    editedCellId: cellId,
    editedValue: newValue,
    editedFieldEl: input,
  })
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

  // Re-solve under the new frozen constraints and update the banner invariant.
  solveAndApply({ editedCellId: null, editedValue: null })
  renderRecipe()
}

function handleRecipeChange() {
  state.hiddenSliders = new Set()
  const selectedKey = $('recipeSelect').value
  if (reciplates.hasOwnProperty(selectedKey)) {
    state.recipeText = reciplates[selectedKey]
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
  const commentRanges = findCommentRanges(text)
  
  const sortedCells = state.cells.filter(c => !c.inComment).sort((a, b) => a.startIndex - b.startIndex)
  
  for (const cell of sortedCells) {
    // Add text before this cell
    if (cell.startIndex > lastIndex) {
      for (const [s, e] of nonCommentSlices(lastIndex, cell.startIndex, commentRanges)) {
        result += text.substring(s, e)
      }
    }
    
    // Add the computed value
    result += formatNum(cell.cval)
    
    lastIndex = cell.endIndex
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    for (const [s, e] of nonCommentSlices(lastIndex, text.length, commentRanges)) {
      result += text.substring(s, e)
    }
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

function pickSliderCells(cells) {
  const sorted = [...cells].sort((a, b) => a.startIndex - b.startIndex)
  const selections = new Map()

  for (const cell of sorted) {
    const bareVars = (cell.ceqn || []).filter(expr => isbarevar(expr))
    for (const varName of bareVars) {
      const existing = selections.get(varName)
      if (!existing || (!existing.cell.ineq && cell.ineq)) {
        selections.set(varName, { varName, cell })
      }
    }
  }

  return [...selections.values()].sort((a, b) => a.cell.startIndex - b.cell.startIndex)
}

function sliderBoundsForCell(cell) {
  if (cell.sliderBounds) return cell.sliderBounds
  if (cell.ineq) {
    const { inf, sup, infStrict, supStrict } = cell.ineq
    const eps = strictEpsilon(inf, sup)
    const bounds = {
      min: inf + (infStrict ? eps : 0),
      max: sup - (supStrict ? eps : 0),
      minLabel: inf,
      maxLabel: sup
    }
    cell.sliderBounds = bounds
    return bounds
  }

  const value = cell.cval
  if (isFiniteNumber(value)) {
    const a = value / 10
    const b = value * 10
    const bounds = {
      min: Math.min(a, b),
      max: Math.max(a, b),
      minLabel: Math.min(a, b),
      maxLabel: Math.max(a, b)
    }
    cell.sliderBounds = bounds
    return bounds
  }

  const bounds = { min: 0, max: 1, minLabel: 0, maxLabel: 1 }
  cell.sliderBounds = bounds
  return bounds
}

function sliderLineForCell(cell, highlightCellId) {
  const text = state.recipeText
  const lineStart = text.lastIndexOf('\n', cell.startIndex - 1) + 1
  const lineEndRaw = text.indexOf('\n', cell.startIndex)
  const lineEnd = lineEndRaw === -1 ? text.length : lineEndRaw

  const cellsInLine = state.cells
    .filter(c => c.startIndex >= lineStart && c.startIndex < lineEnd)
    .sort((a, b) => a.startIndex - b.startIndex)

  let result = ''
  let pos = lineStart
  let highlightStart = null
  let highlightEnd = null

  for (const c of cellsInLine) {
    if (c.startIndex > pos) {
      result += text.substring(pos, c.startIndex)
    }
    const valueStr = formatNum(c.cval)
    if (c.id === highlightCellId) {
      highlightStart = result.length
      highlightEnd = highlightStart + valueStr.length
    }
    result += valueStr
    pos = c.endIndex
  }

  if (pos < lineEnd) {
    result += text.substring(pos, lineEnd)
  }

  return { text: result, highlightStart, highlightEnd }
}

function sliderLineHtml(lineText, highlightStart, highlightEnd, maxChars = 50) {
  if (!lineText) return ''
  const len = lineText.length
  let start = 0
  let end = len
  let prefix = false
  let suffix = false

  const hasHighlight = typeof highlightStart === 'number' && typeof highlightEnd === 'number'
  if (len > maxChars) {
    const coreMax = maxChars - 6
    if (hasHighlight) {
      const center = Math.floor((highlightStart + highlightEnd) / 2)
      start = Math.max(0, center - Math.floor(coreMax / 2))
      end = Math.min(len, start + coreMax)
      start = Math.max(0, end - coreMax)
    } else {
      end = Math.min(len, maxChars - 3)
    }
    prefix = start > 0
    suffix = end < len
    const ellipses = (prefix ? 3 : 0) + (suffix ? 3 : 0)
    const maxCore = Math.max(1, maxChars - ellipses)
    if (end - start > maxCore) {
      end = start + maxCore
      suffix = end < len
    }
  }

  const slice = lineText.slice(start, end)
  let hStart = hasHighlight ? highlightStart - start : null
  let hEnd = hasHighlight ? highlightEnd - start : null
  if (hStart !== null && (hStart < 0 || hEnd > slice.length)) {
    hStart = null
    hEnd = null
  }

  const prefixText = prefix ? '...' : ''
  const suffixText = suffix ? '...' : ''

  if (hStart === null) {
    return `${prefixText}${escapeHtml(slice)}${suffixText}`
  }

  const before = escapeHtml(slice.slice(0, hStart))
  const highlighted = escapeHtml(slice.slice(hStart, hEnd))
  const after = escapeHtml(slice.slice(hEnd))
  return `${prefixText}${before}<span class="slider-highlight">${highlighted}</span>${after}${suffixText}`
}

function buildSliderDefs(cells) {
  const defs = []
  for (const { varName, cell } of pickSliderCells(cells)) {
    const activeBounds = state.activeSlider && state.activeSlider.varName === varName
      ? state.activeSlider.bounds
      : null
    const bounds = activeBounds || sliderBoundsForCell(cell)
    const min = bounds.min
    const max = bounds.max
    const value = isFiniteNumber(cell.cval) ? cell.cval : min
    const clamped = Math.min(max, Math.max(min, value))
    const lineInfo = sliderLineForCell(cell, cell.id)
    defs.push({
      varName,
      cellId: cell.id,
      value: clamped,
      min,
      max,
      minLabel: bounds.minLabel,
      maxLabel: bounds.maxLabel,
      lineHtml: sliderLineHtml(lineInfo.text, lineInfo.highlightStart, lineInfo.highlightEnd),
    })
  }
  return defs
}

function renderSliderPanel(panel, defs) {
  panel.innerHTML = defs.map(def => {
    const minLabel = formatNum(def.minLabel)
    const maxLabel = formatNum(def.maxLabel)
    const nearOne = Math.abs(def.value - 1) < 0.005
    return `
      <div class="slider-card" data-var-name="${escapeHtml(def.varName)}">
        <button type="button" class="slider-close" data-var-name="${escapeHtml(def.varName)}" aria-label="Claudere">x</button>
        <div class="slider-label">
          <span class="slider-var">${escapeHtml(def.varName)}:</span>
          <span class="slider-line">${def.lineHtml}</span>
        </div>
        <div class="slider-row">
          <span class="text-xs mr-2" data-role="min">${minLabel}</span>
          <input
            type="range"
            class="slider-input${nearOne ? ' at-one-x' : ''}"
            min="${def.min}"
            max="${def.max}"
            step="0.01"
            value="${def.value}"
            data-cell-id="${def.cellId}"
            data-var-name="${escapeHtml(def.varName)}"
          />
          <span class="text-xs ml-2" data-role="max">${maxLabel}</span>
        </div>
      </div>
    `
  }).join('')
}

function syncSliderPanel(panel, defs) {
  for (const def of defs) {
    const card = panel.querySelector(`.slider-card[data-var-name="${def.varName}"]`)
    const input = card.querySelector('input.slider-input')
    const minLabel = card.querySelector('[data-role="min"]')
    const maxLabel = card.querySelector('[data-role="max"]')
    const line = card.querySelector('.slider-line')

    input.min = String(def.min)
    input.max = String(def.max)
    input.value = String(def.value)
    input.classList.toggle('at-one-x', Math.abs(def.value - 1) < 0.005)
    minLabel.textContent = formatNum(def.minLabel)
    maxLabel.textContent = formatNum(def.maxLabel)
    line.innerHTML = def.lineHtml
  }
}

function updateSliderDisplay() {
  const panel = $('sliderPanel')
  const defs = buildSliderDefs(state.cells).filter(def => !state.hiddenSliders.has(def.varName))
  if (defs.length === 0) {
    panel.innerHTML = ''
    panel.style.display = 'none'
    return
  }

  panel.style.display = 'block'
  if (state.activeSlider) {
    syncSliderPanel(panel, defs)
    return
  }

  renderSliderPanel(panel, defs)
}

function handleSliderPointerDown(e) {
  const target = e.target
  if (!target.classList || !target.classList.contains('slider-input')) return

  const card = target.closest('.slider-card')
  const minLabel = card.querySelector('[data-role="min"]')
  const maxLabel = card.querySelector('[data-role="max"]')
  const min = Number(target.min)
  const max = Number(target.max)
  const minLabelValue = toNum(minLabel.textContent) ?? min
  const maxLabelValue = toNum(maxLabel.textContent) ?? max

  state.activeSlider = {
    varName: target.dataset.varName,
    bounds: {
      min,
      max,
      minLabel: minLabelValue,
      maxLabel: maxLabelValue,
    },
  }
}

function handleSliderPointerUp() {
  state.activeSlider = null
}

function handleSliderInput(e) {
  const target = e.target
  if (!target.classList || !target.classList.contains('slider-input')) return
  const cellId = target.dataset.cellId
  const varName = target.dataset.varName
  const newValue = toNum(target.value)
  if (!isFiniteNumber(newValue)) return

  const cell = state.cells.find(c => c.id === cellId)
  if (!cell) return

  cell.cval = newValue
  solveAndApply({
    editedCellId: cellId,
    editedValue: newValue,
    seedOverrides: varName ? { [varName]: newValue } : null,
  })
}

function handleSliderClose(e) {
  const target = e.target
  if (!target.classList || !target.classList.contains('slider-close')) return
  const varName = target.dataset.varName
  if (!varName) return
  state.hiddenSliders.add(varName)
  updateSliderDisplay()
}

// =============================================================================
// Initialization
// =============================================================================

function init() {
  // Populate dropdown
  const select = $('recipeSelect')
  Object.entries(recipeDropdown).forEach(([key, name]) => {
    const option = document.createElement('option')
    option.value = key
    option.textContent = name
    select.appendChild(option)
  })
  
  // Event listeners
  $('recipeTextarea').addEventListener('input',  handleTextareaInput)
  $('recipeSelect')  .addEventListener('change', handleRecipeChange)
  $('copyButton')    .addEventListener('click',  handleCopyToClipboard)
  const sliderPanel = $('sliderPanel')
  if (sliderPanel) {
    sliderPanel.addEventListener('input', handleSliderInput)
    sliderPanel.addEventListener('click', handleSliderClose)
    sliderPanel.addEventListener('pointerdown', handleSliderPointerDown)
    document.addEventListener('pointerup', handleSliderPointerUp)
    document.addEventListener('pointercancel', handleSliderPointerUp)
  }

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
  const firstKey = Object.keys(recipeDropdown)[0]
  if (reciplates[firstKey]) {
    state.recipeText = reciplates[firstKey]
    $('recipeTextarea').value = state.recipeText
    parseRecipe()
  }
}

document.addEventListener('DOMContentLoaded', init)
