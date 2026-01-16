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

// Parse a single cell's content into cval and ceqn
// Per spec: ceqn is a list of non-constant expressions split on "=".
// cval is the constant if there is one, null otherwise.
function parseCell(cell) {
  const content = cell.content.trim()
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

    const vars = varparse(part)
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

  const startsFrozen = parts.length > 0 && partIsConst[0] === true

  // Error flag if multiple bare numbers (spec case 7)
  const multipleNumbers = bareNumbers.length > 1

  // cval is the bare number (if exactly one), otherwise null
  const cval = bareNumbers.length === 1 ? bareNumbers[0] : null

  const ceqn = nonConstParts

  // TODO: pretty sure we don't need most of this:
  return {
    ...cell,
    cval,
    startsFrozen,
    ceqn,
    urceqn: parts,
    urparts: parts,
    hasConstraint: parts.length >= 2,
    multipleNumbers,  // error flag
    hasNumber: bareNumbers.length === 1
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

  // First pass: collect variables and check for errors
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
      for (const v of varparse(expr)) {
        symbols[v] = true
      }
    }
  }

  // Check for unreferenced variables (Error Case 4)
  // Per README: "A variable in a cell isn't referenced by any other cell."
  // For each variable in each cell, check if it appears in at least one OTHER cell.
  // Cells in HTML comments count as references (that's the documented workaround).
  const varToCell = new Map() // variable -> first cell that contains it
  for (const cell of cells) {
    for (const expr of cell.ceqn) {
      for (const v of varparse(expr)) {
        if (!varToCell.has(v)) varToCell.set(v, cell)
      }
    }
  }

  for (const [varName, firstCell] of varToCell) {
    let referencedElsewhere = false
    for (const cell of cells) {
      if (cell.id === firstCell.id) continue
      for (const expr of cell.ceqn) {
        if (varparse(expr).has(varName)) {
          referencedElsewhere = true
          break
        }
      }
      if (referencedElsewhere) break
    }
    if (!referencedElsewhere) {
      errors.push(`Variable ${varName} in ${firstCell.raw} not referenced in any other cell`)
    }
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

function buildInitialEquations(cells) {
  return cells.map(c => {
    const parts = (c.urparts || c.urceqn || [])
    return parts.map(p => {
      if (typeof p !== 'string') return p
      const vars = varparse(p)
      if (vars.size !== 0) return p
      const r = vareval(p, {})
      if (r.error || typeof r.value !== 'number' || !isFinite(r.value)) return p
      return r.value
    })
  })
}

function buildInitialSeedValues(cells) {
  const values = {}
  for (const cell of cells) {
    for (const expr of (cell.urparts || cell.urceqn || [])) {
      if (typeof expr !== 'string') continue
      for (const v of varparse(expr)) {
        if (values[v] === undefined) values[v] = 1
      }
    }
  }
  return values
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
    if (fixedCellIds && fixedCellIds.has(cell.id) && typeof cell.cval === 'number' && isFinite(cell.cval)) {
      continue
    }
    if (!cell.ceqn || cell.ceqn.length === 0) continue

    const results = cell.ceqn.map(expr => {
      const r = vareval(expr, ass)
      return r.error ? null : r.value
    }).filter(v => typeof v === 'number' && isFinite(v))

    if (results.length === 0) continue
    cell.cval = results.reduce((a, b) => a + b, 0) / results.length
  }
}

// Compute initial values for all variables using solvem()
function computeInitialValues(cells) {
  const errors = []

  // Step 1: Solve the template as written (including constants).
  const eqns = buildInitialEquations(cells)
  const seedValues = buildInitialSeedValues(cells)
  let result
  let ass
  try {
    result = solvem(eqns, seedValues)
    ass = result.ass
  } catch (e) {
    errors.push(String(e && e.message ? e.message : e))
    ass = { ...seedValues }
    result = { ass, zij: new Array(eqns.length).fill(NaN), sat: false }
  }

  if (!result.sat) {
    logFailedSolve(eqns, seedValues, ass)
    errors.push(...contradictionsForEqns(eqns, ass, result.zij))
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
  if (typeof cval !== 'number' || !isFinite(cval)) return true

  const tol = 1e-6  // Matches solver tolerance for practical floating-point comparisons
  const tolerance = Math.abs(cval) * tol + tol

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
    $('recipeOutput').style.display = 'none'
    $('copySection').style.display = 'none'
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
  const { solve, errors: valueErrors } = computeInitialValues(cells)

  const allErrors = [...syntaxErrors, ...symbolErrors, ...valueErrors]
  
  // Update state
  state.cells = cells
  state.solve = solve
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
  if (!banner) return

  if (!message) {
    banner.hidden = true
    const msg = banner.querySelector('.error-message')
    if (msg) msg.textContent = ''
    return
  }

  banner.hidden = false
  const msg = banner.querySelector('.error-message')
  if (msg) msg.textContent = `⚠️ ${message}`
}

function updateSolveBannerInDom() {
  updateBannerInDom('solveBanner', state.solveBanner)
}

function updateInvalidExplainBannerInDom() {
  updateBannerInDom('invalidExplainBanner', state.invalidExplainBanner)
}

function setInvalidExplainBannerFromInvalidity(invalidCellIds) {
  if ((state.errors || []).length > 0) {
    state.invalidExplainBanner = ''
    return
  }

  if (state.solveBanner) {
    state.invalidExplainBanner = ''
    return
  }

  if (state.invalidInputCellIds && state.invalidInputCellIds.size > 0) {
    const lastInvalidInputId = [...state.invalidInputCellIds][state.invalidInputCellIds.size - 1]
    const cell = state.cells.find(c => c.id === lastInvalidInputId)
    const label = cell && Array.isArray(cell.ceqn) && cell.ceqn.length > 0
      ? String(cell.ceqn[0] || '').trim()
      : ''
    const shownLabel = label || '?'
    state.invalidExplainBanner = `ERROR1753: ${shownLabel}`
    return
  }

  if (!invalidCellIds || invalidCellIds.size === 0) {
    state.invalidExplainBanner = ''
    return
  }

  const lastInvalidId = [...invalidCellIds][invalidCellIds.size - 1]
  const lastInvalidCell = state.cells.find(c => c.id === lastInvalidId)
  state.invalidExplainBanner = 
    `Syntax error in template: {${lastInvalidCell.urtext}}`
}

function repositionNonCriticalBannersAfterLastInvalidBr() {
  const output = $('recipeOutput')
  if (!output) return

  const rendered = output.querySelector('.recipe-rendered')
  if (!rendered) return

  const banners = $('nonCriticalBanners')
  if (!banners) return

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
  if (sat) {
    state.solveBanner = ''
    return
  }

  const anyFrozen = state.fixedCellIds.size > 0
  state.solveBanner = anyFrozen
    ? 'No solution found (try unfreezing cells)'
    : 'No solution found'
}

function solveAndApply({
  editedCellId = null,
  editedValue = null,
  editedFieldEl = null,
  seedOverrides = null,
} = {}) {
  const seedAss = { ...state.solve.ass, ...(seedOverrides || {}) }

  const eqns = buildInteractiveEqns(editedCellId, editedValue)
  const solveResult = solvem(eqns, seedAss)
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

  if (state.solveBanner && eqns && zij) {
    for (const id of getUnsatisfiedCellIds(eqns, zij)) invalidCellIds.add(id)
  }
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
  if (newValue === null || !isFinite(newValue)) {
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

function findCellWithBareVar(varName) {
  return state.cells.find(c =>
    Array.isArray(c.ceqn) && c.ceqn.some(expr => isbarevar(expr) && expr.trim() === varName)
  )
}

function updateSliderDisplay() {
  const slider = $('scalingSlider')
  const display = $('scalingDisplay')
  
  // Check if x variable exists in the current recipe
  const xCell = findCellWithBareVar('x')
  
  if (!xCell) {
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

  const x = xCell.cval
  if (typeof x !== 'number' || !isFinite(x)) {
    slider.disabled = true
    slider.classList.add('disabled')
    display.textContent = '?'
    display.classList.add('disabled')
    return
  }

  display.textContent = formatNum(x) //+ 'x'
  slider.value = Math.min(10, Math.max(0.1, x))
  
  // Green thumb when at 1x (TODO: be smarter about the tolerance here)
  if (Math.abs(x - 1) < 0.005) {
    slider.classList.add('at-one-x')
  } else {
    slider.classList.remove('at-one-x')
  }
}

function handleSliderChange(e) {
  const newX = toNum(e.target.value)
  if (newX === null || newX <= 0) return

  const xCell = findCellWithBareVar('x')
  if (!xCell) return

  solveAndApply({ editedCellId: xCell.id, editedValue: newX, seedOverrides: { x: newX } })
  renderRecipe()
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
  $('scalingSlider') .addEventListener('input',  handleSliderChange)

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
