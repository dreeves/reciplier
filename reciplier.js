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
// Slider Bounds (used for inline sliders in cells with inequality bounds)
// =============================================================================

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

document.addEventListener('DOMContentLoaded', init)
