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
// Symbol Table and Validation
// =============================================================================

// Build symbol table from parsed cells
// (was buildSymbolTable)
function symtab(cells) {
  const symbols = {}
  const errors = []
  const varInfo = new Map()

  // First pass: collect variables and check for errors
  cells.some(c => c.ineqError) && errors.push(
    'Inequalities must start and end with a constant')

  for (const cell of cells) {
    // TODO: are these ham-handed avoidings of if-statements? aka crypto-ifs?
    cell.multipleNumbers && errors.push(
      `Cell {${cell.urtext}} has more than one numerical value`)
    cell.colonError === 'multi' && errors.push(
      `Cell {${cell.urtext}} has more than one colon`)
    cell.colonError === 'rhs' && errors.push(
      `Cell {${cell.urtext}} has more than one expression after the colon`)
    cell.colonError === 'noconst' && errors.push(
      `Cell {${cell.urtext}} has a colon but no constant specified after it`)

    cell.ceqn.length === 0 && cell.cval !== null &&
      errors.push(`Cell {${cell.urtext}} is a bare number ` +
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
  // Per spec: "A variable in a cell isn't referenced by any other cell."
  // For each variable in each cell, check if it appears in at least one OTHER
  // cell. Cells in HTML comments count (that's the documented workaround if you
  // want to make this error shut up).
  for (const [v, info] of varInfo) {
    // TODO: more crypto-if-statements?
    info.count === 1 && errors.push(
`Variable ${v} in {${info.firstCell.urtext}} not referenced in any other cell`)
  }

  return { symbols, errors }
}

// =============================================================================
// Initial Value Assignment
// =============================================================================

// Build equations list for solvem() from cells

// Build equations list for solvem() from cells.
// Each equation is an array [ceqn..., cval] of expressions that should all be equal.
// (was buildInitialEquations)
function initEqns(cells) {
  return cells.map(c => {
    const parts = c.cval !== null ? [...c.ceqn, c.cval] : [...c.ceqn]
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

// TODO: Either we have an initial value from the user (specified in the urtext or the field) or we don't. If we don't, then we should just give null as the initial value and let solvem() do its thing. Sanity check: is solvem() using the limits (inf and sup, or maybe we should call them cmin and cmax) specified by the inequalities in the cells as part of its solving? Assuming yes, we definitely want to just pass in the bounds to solvem() and not do any work to guess seed values.

// Corollary: defaulting to 1, if that makes sense, should also be inside solvem().

// Seed values for solver: pick starting points from bounds, default to 1.
// Constant extraction and propagation are handled by solvem's solvers (literalPins,
// kludgeProp propagation), not here.
// (was buildInitialSeedValues)
function initSeeds(cells, bounds = {}) {
  const { inf = {}, sup = {} } = bounds
  const values = {}
  const known = new Set()  // Track variables with bounded starting values
  for (const cell of cells) {
    const parts = cell.cval !== null ? [...cell.ceqn, cell.cval] : [...cell.ceqn]
    for (const expr of parts) {
      if (typeof expr !== 'string') continue
      for (const v of varparse(expr)) {
        if (values[v] === undefined) {
          const lo = inf[v], hi = sup[v]
          if (isFiniteNumber(lo) && isFiniteNumber(hi)) {
            values[v] = (lo + hi) / 2
            known.add(v)
          } else if (isFiniteNumber(lo)) {
            values[v] = lo + 1
            known.add(v)
          } else if (isFiniteNumber(hi)) {
            values[v] = hi - 1
            known.add(v)
          } else {
            values[v] = 1
          }
        }
      }
    }
  }
  return { values, known }
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
function eqnContradictions(eqns, ass, zij, cells) {
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
        // TODO: what is this fallback-iness on the next line? ANTI-POSTEL.
        const cellRef = cells[i] ? `{${cells[i].urtext}}` : `{${eqn.join(' = ')}}`
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
// (was computeInitialValues)
function initValues(cells, bounds) {
  const errors = []
  const { inf, sup } = bounds
  const eqns = initEqns(cells)
  const { values: seedValues, known: knownVars } = initSeeds(cells, bounds)

  let result
  let ass
  try {
    result = solvem(eqns, seedValues, inf, sup, knownVars)
    ass = result.ass
  } catch (e) {
    errors.push(String(e && e.message ? e.message : e))
    ass = { ...seedValues }
    result = { ass, zij: new Array(eqns.length).fill(NaN), sat: false }
  }

  if (!result.sat) {
    logFailedSolve(eqns, seedValues, ass)
    errors.push(...eqnContradictions(eqns, ass, result.zij, cells))
  }

  const solve = { ass, eqns, zij: result.zij, sat: result.sat }
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
// TODO: there's a lot of anti-postel-violating fallback-ing in here :(
function explainInvalidity(invalidCellIds) {
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
  // TODO: Need replicata for this error. I have in fact seen ERROR1753 before.
  const invalidInputMessage = invalidInputId 
    ? `ERROR1753: ${shownLabel} is invalid input?` 
    : `ERROR1754: ${shownLabel} is invalid input?`
  const invalidCellId = invalidCellIds?.size
    ? [...invalidCellIds][invalidCellIds.size - 1]
    : null
  const invalidCell = invalidCellId 
    ? state.cells.find(c => c.id === invalidCellId) 
    : null
  const syntaxMessage = invalidCell 
    ? `Syntax error in template: {${invalidCell.urtext}}`
    : `ERROR1755: Syntax error but no invalid cell?`
  state.invalidExplainBanner = (hasErrors || hasSolveBanner)
    ? ''
    : (invalidInputId ? invalidInputMessage : (invalidCellId ? syntaxMessage : ''))
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
  seedOverrides = null,
} = {}) {
  const seedAss = { ...state.solve.ass, ...(seedOverrides || {}) }

  const eqns = interactiveEqns(editedCellId, editedValue)
  const { inf, sup } = state.bounds
  const solveResult = solvem(eqns, seedAss, inf, sup)
  const solvedAss = solveResult.ass
  const sat = solveResult.sat
  const zij = solveResult.zij

  if (!sat) {
    logFailedSolve(eqns, seedAss, solvedAss)
  }

  solveBannerFromSat(sat)

  state.solve = { ass: solvedAss, eqns, zij, sat }

  const preserveEdited = editedCellId !== null
  if (preserveEdited) {
    const editedCell = state.cells.find(c => c.id === editedCellId)
    if (editedCell) editedCell.cval = editedValue
  }

  const skipRecomputeCellId = preserveEdited ? editedCellId : null
  if (sat) {
    refreshCvals(state.cells, state.solve.ass, state.peggedCellIds, skipRecomputeCellId)
  }

  const invalidCellIds = collectInvalidCellIds(eqns, zij)

  explainInvalidity(invalidCellIds)

  return { eqns, solved: solvedAss, sat, invalidCellIds }
}

// (was buildInteractiveEqns)
function interactiveEqns(editedCellId = null, editedValue = null) {
  return state.cells.map(c => {
    const eqn = [...c.ceqn]

    if (editedCellId !== null && c.id === editedCellId) {
      eqn.push(editedValue)
    } else if (state.peggedCellIds.has(c.id)) {
      eqn.push(c.cval)
    }

    return eqn
  })
}

// (was getUnsatisfiedCellIds)
function unsatisfiedCellIds(eqns, zij) {
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
  const invalidCellIds = new Set(violatedCellIds(state.cells, state.solve.ass))

  const unsatisfied = state.solveBanner && eqns && zij ? unsatisfiedCellIds(eqns, zij) : null
  unsatisfied && unsatisfied.forEach(id => invalidCellIds.add(id))
  for (const id of state.invalidInputCellIds) invalidCellIds.add(id)

  return invalidCellIds
}
