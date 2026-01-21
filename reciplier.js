function $(id) { return document.getElementById(id) }

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// Deprecated: we no longer want anything but the markdown renderer to care
// whether something's part of an HTML comment or not.
// All the functions and variables with an "OLD" suffix in this file should die.
function findCommentRangesOLD(text) {
  const ranges = []
  const commentRegexOLD = /<!--[\s\S]*?-->/g
  let match
  while ((match = commentRegexOLD.exec(text)) !== null) {
    ranges.push({
      start: match.index,
      end: match.index + match[0].length
    })
  }
  return ranges
}

function nonCommentSlicesOLD(start, end, commentRangesOLD) {
  const slices = []
  let pos = start
  for (const { start: cStart, end: cEnd } of commentRangesOLD) {
    if (cEnd <= pos) continue
    if (cStart >= end) break
    if (cStart > pos) slices.push([pos, Math.min(cStart, end)])
    pos = Math.min(cEnd, end)
    if (pos >= end) break
  }
  if (pos < end) slices.push([pos, end])
  return slices
}

function isIndexInCommentOLD(index, commentRangesOLD) {
  return commentRangesOLD.some(r => index >= r.start && index < r.end)
}

function getScaledRecipeText() {
  let result = ''
  let lastIndex = 0
  const text = state.recipeText
  const commentRangesOLD = findCommentRangesOLD(text)
  
  const sortedCells = state.cells
    .filter(c => !isIndexInCommentOLD(c.startIndex, commentRangesOLD))
    .sort((a, b) => a.startIndex - b.startIndex)
  
  for (const cell of sortedCells) {
    // Add text before this cell
    if (cell.startIndex > lastIndex) {
      for (const [s, e] of nonCommentSlicesOLD(lastIndex, cell.startIndex, commentRangesOLD)) {
        result += text.substring(s, e)
      }
    }
    
    // Add the computed value
    result += formatNum(cell.cval)
    
    lastIndex = cell.endIndex
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    for (const [s, e] of nonCommentSlicesOLD(lastIndex, text.length, commentRangesOLD)) {
      result += text.substring(s, e)
    }
  }
  
  return result
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

function sliderLineForCell(cell, highlightCellId, commentRangesOLD) {
  const text = state.recipeText
  const lineStart = text.lastIndexOf('\n', cell.startIndex - 1) + 1
  const lineEndRaw = text.indexOf('\n', cell.startIndex)
  const lineEnd = lineEndRaw === -1 ? text.length : lineEndRaw

  const cellsInLine = state.cells
    .filter(c => c.startIndex >= lineStart && c.startIndex < lineEnd)
    .filter(c => !isIndexInCommentOLD(c.startIndex, commentRangesOLD))
    .sort((a, b) => a.startIndex - b.startIndex)

  let result = ''
  let pos = lineStart
  let highlightStart = null
  let highlightEnd = null

  for (const c of cellsInLine) {
    if (c.startIndex > pos) {
      for (const [s, e] of nonCommentSlicesOLD(pos, c.startIndex, commentRangesOLD)) {
        result += text.substring(s, e)
      }
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
    for (const [s, e] of nonCommentSlicesOLD(pos, lineEnd, commentRangesOLD)) {
      result += text.substring(s, e)
    }
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

function buildSliderDefs(cells, commentRangesOLD) {
  const defs = []
  for (const { varName, cell } of pickSliderCells(cells)) {
    const bounds = sliderBoundsForCell(cell)
    const min = bounds.min
    const max = bounds.max
    const value = isFiniteNumber(cell.cval) ? cell.cval : min
    const clamped = Math.min(max, Math.max(min, value))
    const lineInfo = sliderLineForCell(cell, cell.id, commentRangesOLD)
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
  const commentRangesOLD = findCommentRangesOLD(state.recipeText)
  const visibleCells = state.cells.filter(c => !isIndexInCommentOLD(c.startIndex, commentRangesOLD))
  const defs = buildSliderDefs(visibleCells, commentRangesOLD).filter(def => !state.hiddenSliders.has(def.varName))
  if (defs.length === 0) {
    panel.innerHTML = ''
    panel.style.display = 'none'
    delete panel.dataset.sliderSignature
    return
  }

  panel.style.display = 'block'
  const signature = defs.map(def => def.varName).join('|')
  const prevSignature = panel.dataset.sliderSignature || ''
  if (prevSignature !== signature) {
    panel.dataset.sliderSignature = signature
    renderSliderPanel(panel, defs)
    return
  }
  syncSliderPanel(panel, defs)
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
  const solveResult = solveAndApply({
    editedCellId: cellId,
    editedValue: newValue,
    seedOverrides: varName ? { [varName]: newValue } : null,
  })

  syncAfterSolve(solveResult.invalidCellIds)
}

function handleSliderClose(e) {
  const target = e.target
  if (!target.classList || !target.classList.contains('slider-close')) return
  const varName = target.dataset.varName
  if (!varName) return
  state.hiddenSliders.add(varName)
  updateSliderDisplay()
}

document.addEventListener('DOMContentLoaded', init)
