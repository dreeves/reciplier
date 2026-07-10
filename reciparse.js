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
    cells.push({
      id: `cell_${cellId++}`,
      urtext: match[1],       // "x = 5" without braces
      startIndex: match.index,
      endIndex: match.index + match[0].length
    })
  }

  return cells
}

// (was evalConstantExpression)
function evalConst(expr) {
  const trimmed = String(expr).trim()
  const numeric = toNum(trimmed)
  if (numeric !== null) return numeric
  if (varparse(trimmed).size > 0) return null
  const r = vareval(trimmed, {})
  return !r.error && isFiniteNumber(r.value) ? r.value : null
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
  const infVal = evalConst(infRaw)
  const supVal = evalConst(supRaw)
  const boundsOk = isFiniteNumber(infVal) && isFiniteNumber(supVal)
  const infStrict = infOp === '<'
  const supStrict = supOp === '<'
  const equalBounds = boundsOk && Math.abs(infVal - supVal) < 1e-12
  const ordered = boundsOk && (infVal < supVal || (equalBounds && !infStrict && !supStrict))

  // Determine specific error type (data-driven, priority-ordered)
  const errorChecks = [
    [hasRight, 'wrong-direction'],
    [!match, 'missing-bounds'],
    [leftoverAngles, 'extra-angles'],
    [!ordered && boundsOk && equalBounds && (infStrict || supStrict), 'equal-strict'],
    [!ordered && boundsOk, 'impossible'],
  ]

  let error = null
  if (attempted) {
    for (const [applies, errorType] of errorChecks) {
      if (applies) {
        error = errorType
        break
      }
    }
  }

  return {
    attempted,
    core: match ? middleRaw : trimmed,
    bounds: (!attempted || error) ? null : { inf: infVal, sup: supVal, infStrict, supStrict },
    error
  }
}

// =============================================================================
// Reciplify: turn a plaintext recipe into a reciplate
// =============================================================================
// "Reciplify" (jargon): wrap each bare number in a cell scaled by x -- "add 2
// eggs" becomes "add {2x} eggs" -- and append SCALE_FOOTER defining x. Text
// already inside cells is left alone and the footer is only appended if
// absent, so reciplifying is idempotent.

// Exact copy from the crepes reciplate, trailing space and all
const SCALE_FOOTER = 'Scaled by a factor of {x : 1} \n{.1 <= x <= 10}'

// Bare numbers: mixed numbers ("1 1/2"), fractions ("3/4"), decimals ("5.33",
// ".5"), and integers ("2"). The lookarounds skip numbers glued to word
// characters, dots, or slashes, so tokens like "9x13", "v1.2.3", and
// "10/12/2024" stay untouched.
const BARENUM_RE = /(?<![\w.\/])(?:\d+ \d+\/\d+|\d+\/\d+|\d+\.\d+|\.\d+|\d+)(?![\w\/]|\.\d)/g

// Wrap one bare-number token in a cell that scales it by x. Plain numbers use
// implicit multiplication ({2x}); fractions and mixed numbers get explicit
// grouping ({(1/2)*x}, {(1+1/2)*x}) so a human reading the template can't
// misread 1/2x as 1/(2x).
function cellify(numToken) {
  const compound = /[ \/]/.test(numToken)
  return compound ? `{(${numToken.replace(' ', '+')})*x}` : `{${numToken}x}`
}

function reciplify(text) {
  // Split on existing cells (odd indices, thanks to the capture group) and
  // cellify bare numbers only in the plain-text segments between them
  const scaled = text.split(/(\{[^{}]*\})/g).map((seg, i) =>
    i % 2 === 1 ? seg : seg.replace(BARENUM_RE, cellify)
  ).join('')
  if (scaled.includes(SCALE_FOOTER)) return scaled
  return scaled.trimEnd() + '\n\n' + SCALE_FOOTER + '\n'
}

// Parse a single cell's content into cval and ceqn
// Per spec: ceqn is a list of non-constant expressions split on "=".
// cval is the constant if there is one, null otherwise.
// Colon is treated as equals but affects pegged state:
//   YY: constant + colon → unpegged (e.g., {x : 3})
//   YN: constant + no colon → pegged (e.g., {x = 3})
//   NY: no constant + colon → ERROR (e.g., {2x : a})
//   NN: no constant + no colon → unpegged (e.g., {2x = a})
function parseCell(cell) {
  const content = cell.urtext.trim()
  const colonMatches = content.match(/:/g)
  const colonCount = colonMatches ? colonMatches.length : 0
  const hasColon = colonCount > 0
  const colonIndex = hasColon ? content.indexOf(':') : -1
  const leftPart = hasColon ? content.slice(0, colonIndex).trim() : content
  const rightPart = hasColon ? content.slice(colonIndex + 1).trim() : ''
  const colonMultiple = colonCount > 1
  const colonRightHasEq = hasColon && /[=<>]/.test(rightPart)
  const inequality = parseInequalities(leftPart)
  const exprPart = inequality.error ? '' : inequality.core

  // Split by = to get constraint expressions (but be careful with == or !=)
  // We want to split on single = that's not part of == or !=
  let parts = exprPart.split(/(?<![=!<>])=(?!=)/).map(e => e.trim()).filter(e => e !== '')

  // If colon is present and valid, treat right side as additional equation term
  const colonValidSoFar = hasColon && !colonMultiple && !colonRightHasEq
  if (colonValidSoFar && rightPart !== '') {
    parts.push(rightPart)
  }

  // Separate bare numbers from expressions
  // Per spec: bare numbers go to cval field, not ceqn
  const bareNumbers = []
  const nonConstParts = []
  for (const part of parts) {
    const constVal = evalConst(part)
    constVal !== null ? bareNumbers.push(constVal) : nonConstParts.push(part)
  }

  const hasConstant = bareNumbers.length > 0

  // NY case: colon without constant is an error (ambiguous semantics)
  const colonNoConst = colonValidSoFar && !hasConstant
  const colonError = colonMultiple ? 'multi'
                   : colonRightHasEq ? 'rhs'
                   : colonNoConst ? 'noconst'
                   : null

  const bareVars = parts.filter(part => isbarevar(part))
  const ineq = inequality.bounds && bareVars.length
    ? { ...inequality.bounds, varName: bareVars[0] }
    : null
  // Preserve specific inequality error type
  const ineqError = inequality.error || (inequality.bounds && bareVars.length === 0 ? 'no-bare-var' : null)
  const activeParts = ineqError ? [] : parts

  // pegged = YN case: has constant AND no colon
  const pegged = activeParts.length > 0 && hasConstant && !hasColon

  // Error flag if multiple bare numbers (spec case 7)
  const multipleNumbers = !ineqError && bareNumbers.length > 1

  // cval is the bare number (if exactly one), otherwise null
  const cval = !ineqError && bareNumbers.length === 1 ? bareNumbers[0] : null

  const ceqn = ineqError ? [] : nonConstParts

  return {
    ...cell,
    cval,
    pegged,
    ceqn,
    colonError,
    ineq: ineqError ? null : ineq,
    ineqError,  // Preserve specific error type string
    multipleNumbers,  // error flag
  }
}
