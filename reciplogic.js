// =============================================================================
// Utility Functions
// =============================================================================

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
  if (num === null || num === undefined) return ''  // No value → blank field
  if (!isFiniteNumber(num)) return '?'              // NaN/Infinity → error
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
// Symbol Table and Validation
// =============================================================================

// Build symbol table from parsed cells
// (was buildSymbolTable)
function symtab(cells) {
  const symbols = {}
  const errors = []
  const varInfo = new Map()

  // First pass: collect variables and check for errors
  if (cells.some(c => c.ineqError)) errors.push(
    'Inequalities must start and end with a constant')

  for (const cell of cells) {
    if (cell.multipleNumbers) errors.push(
      `Cell {${cell.urtext}} has more than one numerical value`)
    if (cell.colonError === 'multi') errors.push(
      `Cell {${cell.urtext}} has more than one colon`)
    if (cell.colonError === 'rhs') errors.push(
      `Cell {${cell.urtext}} has more than one expression after the colon`)
    if (cell.colonError === 'noconst') errors.push(
      `Cell {${cell.urtext}} has a colon but no constant specified after it`)
    if (cell.ceqn.length === 0 && cell.cval !== null) errors.push(
      `Cell {${cell.urtext}} is a bare number ` +
      `which doesn't make sense to put in a cell`)
    if (cell.ceqn.length === 0 && cell.cval === null) errors.push(
      `Cell {${cell.urtext}} is empty`)

    const cellVars = new Set()
    for (const expr of cell.ceqn) {
      for (const v of varparse(expr)) {
        symbols[v] = true
        cellVars.add(v)
      }
      // Check for syntax errors in expressions (e.g., unclosed parentheses)
      // Try evaluating with all variables set to 1 - syntax errors will still throw
      // TODO: Hmm, if the first thing we always do is varparse, should varparse check the syntax?
      // Or maybe we should always call a separate isvalid() function?
      // Or maybe the following is fine? It just seems heavy-weight.
      const exprVars = varparse(expr)
      const testVars = {}
      for (const v of exprVars) testVars[v] = 1
      const testResult = vareval(expr, testVars)
      // For expressions with variables, only check for syntax errors (vareval.error).
      // For constant expressions (no variables), also check for non-finite results like 1/0.
      const isConstant = exprVars.size === 0
      if (testResult.error) {
        errors.push(`Error in {${cell.urtext}}: ${testResult.error}`)
      } else if (isConstant && !isFiniteNumber(testResult.value)) {
        errors.push(`{${cell.urtext}} evaluates to ${testResult.value}`)
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
  // Per spec: "A variable in a cell isn't referenced by any other cell."
  // For each variable in each cell, check if it appears in at least one OTHER
  // cell. Cells in HTML comments count (that's the documented workaround if you
  // want to make this error shut up).
  for (const [v, info] of varInfo) {
    if (info.count === 1) errors.push(
`Variable ${v} in {${info.firstCell.urtext}} not referenced in any other cell`)
  }

  return { symbols, errors }
}

// =============================================================================
// Initial Value Assignment
// =============================================================================

// Build equations list for solvem() from cells.
// Each equation is an array [ceqn..., cval] of expressions that should all be equal.
// Filters out singletons (length < 2) since they're display-only, not constraints.
// Returns { eqns, cellIndices } where cellIndices[i] is the cell index for eqns[i].
// (was buildInitialEquations)
function initEqns(cells) {
  const eqns = []
  const cellIndices = []
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    const parts = c.cval !== null ? [...c.ceqn, c.cval] : [...c.ceqn]
    const eqn = parts.map(p => {
      if (typeof p !== 'string') return p
      const vars = varparse(p)
      if (vars.size !== 0) return p
      const r = vareval(p, {})
      if (r.error || !isFiniteNumber(r.value)) return p
      return r.value
    })
    if (eqn.length >= 2) {  // Filter singletons - they're display-only, not constraints
      eqns.push(eqn)
      cellIndices.push(i)
    }
  }
  return { eqns, cellIndices }
}

// Expand compact zij (parallel to filtered eqns) back to cell-parallel array.
// Singletons get zij=0 since they have no residual.
function expandZij(compactZij, cellIndices, cellCount) {
  const fullZij = new Array(cellCount).fill(0)
  for (let i = 0; i < cellIndices.length; i++) {
    fullZij[cellIndices[i]] = compactZij[i]
  }
  return fullZij
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

// (was getEffectiveBounds)
function effectiveBounds(cells) {
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

// (was contradictionsForEqns)
// cellIndices maps equation index to cell index (when eqns are filtered)
function eqnContradictions(eqns, ass, zij, cells, cellIndices = null) {
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
    for (let j = 1; j < results.length; j++) {
      if (Math.abs(results[j] - first) > tolerance) {
        const cellIdx = cellIndices ? cellIndices[i] : i
        const cellRef = `{${cells[cellIdx].urtext}}`
        const valuesStr = results.map(r => formatNum(r)).join(' ≠ ')
        errors.push(`Contradiction: ${cellRef} evaluates to ${valuesStr}`)
        break
      }
    }
  }

  return errors
}

// (was recomputeCellCvals)
function refreshCvals(cells, ass, peggedCellIds, skipCellId = null) {
  for (const cell of cells) {
    if (cell.id === skipCellId) continue
    if (peggedCellIds && peggedCellIds.has(cell.id) && isFiniteNumber(cell.cval)) {
      continue
    }
    if (!Array.isArray(cell.ceqn)) {
      throw new Error(`cell.ceqn must be an array, got ${typeof cell.ceqn}`)
    }
    if (cell.ceqn.length === 0) continue

    const results = cell.ceqn.map(expr => {
      const r = vareval(expr, ass)
      return r.error ? null : r.value
    }).filter(isFiniteNumber)

    if (results.length === 0) {
      // Can't evaluate any expression (e.g., variable not in ass) → cval becomes null
      cell.cval = null
      continue
    }
    cell.cval = results.reduce((a, b) => a + b, 0) / results.length
  }
}

// Compute initial values for all variables using solvem()
// solvem handles seeding internally using bounds.
// (was computeInitialValues)
function initValues(cells, bounds) {
  const errors = []
  const { inf, sup } = bounds
  const { eqns, cellIndices } = initEqns(cells)

  // Pass empty init so solvem seeds all required vars from bounds/defaults
  const init = {}

  let result
  let ass
  try {
    result = solvem(eqns, init, inf, sup)
    ass = result.ass
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
    ass = {}
    result = { ass, zij: new Array(eqns.length).fill(NaN), sat: false }
  }

  // Expand zij back to cell-parallel array for error reporting
  const fullZij = expandZij(result.zij, cellIndices, cells.length)

  if (!result.sat) {
    logFailedSolve(eqns, init, ass)
    errors.push(...eqnContradictions(eqns, ass, result.zij, cells, cellIndices))
  }

  const solve = { ass, eqns, zij: fullZij, sat: result.sat }
  return { solve, errors }
}

// =============================================================================
// Constraint Solver
// =============================================================================

// Check if a cell's cval matches all expressions in its ceqn
// Per spec: "cell's field is shown in red if cval differs from any of the expressions in ceqn"
function isCellViolated(cell, ass) {
  const cval = cell.cval
  if (cval === null || cval === undefined) return false  // No value → not violated
  if (!isFiniteNumber(cval)) return true                 // NaN/Infinity → violated

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
    // Skip expressions that can't be evaluated (e.g., variable not in solver output).
    // A cell is only violated if an expression that CAN be evaluated doesn't match.
    if (result.error) continue

    if (Math.abs(result.value - cval) > tolerance) return true
  }

  return false
}

// Get set of cell IDs that are violated (for UI highlighting)
// (was getViolatedCellIds)
function violatedCellIds(cells, ass) {
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
  peggedCellIds: new Set(),
  errors: [],
  solveBanner: '',
  invalidExplainBanner: '',
  invalidInputCellIds: new Set(),
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
    state.bounds = { inf: {}, sup: {}, combined: new Map() }
    return
  }

  // Check for syntax errors (nested/unbalanced braces)
  const syntaxErrors = checkBraceSyntax(text)

  // Parse
  let cells = extractCells(text)
  cells = cells.map(parseCell)

  // Build symbol table
  const { errors: symbolErrors } = symtab(cells)
  
  // Compute initial values (includes template satisfiability check)
  const bounds = effectiveBounds(cells)
  const { solve, errors: valueErrors } = initValues(cells, bounds)

  const allErrors = [...syntaxErrors, ...symbolErrors, ...valueErrors]
  
  // Update state
  state.cells = cells
  state.solve = solve
  state.bounds = bounds
  state.errors = allErrors
  // Cells with constants and no colon start pegged (YN case in parse table)
  state.peggedCellIds = new Set(cells.filter(c => c.pegged).map(c => c.id))
  refreshCvals(cells, solve.ass, state.peggedCellIds)
  state.solveBanner = ''
  state.invalidExplainBanner = ''
  state.invalidInputCellIds = new Set()
}

// (was setInvalidExplainBannerFromInvalidity)
function explainInvalidity(invalidCellIds) {
  const hasErrors = state.errors.length > 0
  const hasSolveBanner = !!state.solveBanner
  // If primary banners (critical errors or "no solution") are showing, skip the
  // secondary explanatory banner to avoid redundant messaging.
  if (hasErrors || hasSolveBanner) { state.invalidExplainBanner = ''; return }

  const invalidInputId = state.invalidInputCellIds.size
    ? [...state.invalidInputCellIds][state.invalidInputCellIds.size - 1]
    : null
  if (invalidInputId) {
    const cell = state.cells.find(c => c.id === invalidInputId)
    if (!cell) throw new Error(`explainInvalidity: no cell found for invalidInputId "${invalidInputId}"`)
    const label = cell.ceqn.length ? String(cell.ceqn[0]).trim() : '?'
    // Syntax error in a cell other than the one being edited
    state.invalidExplainBanner = `ERROR1753: ${label} is invalid input?`
    return
  }

  const invalidCellId = invalidCellIds.size
    ? [...invalidCellIds][invalidCellIds.size - 1]
    : null
  if (invalidCellId) {
    const cell = state.cells.find(c => c.id === invalidCellId)
    if (!cell) throw new Error(`explainInvalidity: no cell found for invalidCellId "${invalidCellId}"`)
    state.invalidExplainBanner = `Syntax error in template: {${cell.urtext}}`
    return
  }

  state.invalidExplainBanner = ''
}

// (was setSolveBannerFromSatisfaction)
function solveBannerFromSat(sat) {
  const anyPegged = state.peggedCellIds.size > 0
  state.solveBanner = sat
    ? ''
    : (anyPegged ? 'No solution found (try unpegging cells)' 
                 : 'No solution found')
}

function solveAndApply({
  editedCellId = null,
  editedValue = null,
  editedFieldEl = null,
  seedOverrides = {},
} = {}) {
  const seedAss = { ...state.solve.ass, ...seedOverrides }

  const { eqns, cellIndices } = interactiveEqns(editedCellId, editedValue)
  const { inf, sup } = state.bounds
  const solveResult = solvem(eqns, seedAss, inf, sup)
  const solvedAss = solveResult.ass
  const sat = solveResult.sat
  // Expand compact zij (parallel to filtered eqns) to full cell-parallel array
  const zij = expandZij(solveResult.zij, cellIndices, state.cells.length)

  if (!sat) {
    logFailedSolve(eqns, seedAss, solvedAss)
  }

  solveBannerFromSat(sat)

  state.solve = { ass: solvedAss, eqns, zij, sat }

  const preserveEdited = editedCellId !== null
  if (preserveEdited) {
    const editedCell = state.cells.find(c => c.id === editedCellId)
    if (!editedCell) throw new Error(`solveAndApply: no cell found for editedCellId "${editedCellId}"`)
    editedCell.cval = editedValue
  }

  // When user clears a field, create a modified assignment for refreshCvals that
  // omits the cleared variable(s). This makes dependent cells go blank.
  // state.solve.ass keeps the full assignment for the next solve.
  let assForRefresh = state.solve.ass
  if (editedCellId !== null && editedValue === null) {
    const editedCell = state.cells.find(c => c.id === editedCellId)
    // editedCell already validated above when preserveEdited is true
    if (!editedCell) throw new Error(`solveAndApply: no cell found for editedCellId "${editedCellId}"`)
    if (!Array.isArray(editedCell.ceqn)) throw new Error(`solveAndApply: editedCell.ceqn must be an array`)
    assForRefresh = { ...state.solve.ass }
    for (const expr of editedCell.ceqn) {
      for (const v of varparse(expr)) {
        delete assForRefresh[v]
      }
    }
  }

  const skipRecomputeCellId = preserveEdited ? editedCellId : null
  if (sat) {
    refreshCvals(state.cells, assForRefresh, state.peggedCellIds, skipRecomputeCellId)
  }

  const invalidCellIds = collectInvalidCellIds(zij)

  explainInvalidity(invalidCellIds)

  return { eqns, solved: solvedAss, sat, invalidCellIds }
}

// (was buildInteractiveEqns)
// Returns { eqns, cellIndices } with singletons filtered out.
function interactiveEqns(editedCellId = null, editedValue = null) {
  const eqns = []
  const cellIndices = []
  for (let i = 0; i < state.cells.length; i++) {
    const c = state.cells[i]
    const eqn = [...c.ceqn]

    if (editedCellId !== null && c.id === editedCellId && editedValue !== null) {
      eqn.push(editedValue)
    } else if (state.peggedCellIds.has(c.id)) {
      eqn.push(c.cval)
    }

    if (eqn.length >= 2) {  // Filter singletons
      eqns.push(eqn)
      cellIndices.push(i)
    }
  }
  return { eqns, cellIndices }
}

// (was getUnsatisfiedCellIds)
// zij is now cell-parallel (expanded from compact solver output)
function unsatisfiedCellIds(zij) {
  const unsatisfied = new Set()
  for (let i = 0; i < state.cells.length; i++) {
    const residual = zij[i]
    if (Number.isFinite(residual) && residual === 0) continue
    const cell = state.cells[i]
    if (cell && cell.id) unsatisfied.add(cell.id)
  }

  return unsatisfied
}

// Combine per-cell violations, solver residuals, and invalid input markers.
function collectInvalidCellIds(zij) {
  const invalidCellIds = new Set(violatedCellIds(state.cells, state.solve.ass))

  if (state.solveBanner && zij) {
    for (const id of unsatisfiedCellIds(zij)) invalidCellIds.add(id)
  }
  for (const id of state.invalidInputCellIds) invalidCellIds.add(id)

  return invalidCellIds
}
