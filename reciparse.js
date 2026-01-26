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
        const context = text.substring(braceStart, 
                                       Math.min(braceStart + 30, text.length))
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

function extractCells(text) {
  const cells = []
  let cellId = 0

  // Find all {...} cells (simple non-nested matching)
  const cellRegex = /\{([^{}]*)\}/g
  let match
  while ((match = cellRegex.exec(text)) !== null) {
    // TODO: this is dumb:
    // raw = "{x = 5}" (with braces), urtext/content = "x = 5" (without braces)
    cells.push({
      id: `cell_${cellId++}`,
      raw: match[0],        // includes braces
      urtext: match[1],     // content only (used in tooltips)
      content: match[1],    // same as urtext (historical duplication)
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
