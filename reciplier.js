function $(id) { return document.getElementById(id) }

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// Build the scaled recipe text for copy-to-clipboard:
// replace each {cell} with its computed value.
// Slider cells (inequality bounds) use <<value>> to distinguish from fields,
// since a recipe typically shows both a field and a slider for the same variable.
function getScaledRecipeText() {
  const cellsByUrtext = new Map(state.cells.map(c => [c.urtext, c]))
  return state.recipeText.replace(/\{([^{}]*)\}/g, (_, urtext) => {
    const cell = cellsByUrtext.get(urtext)
    if (!cell) return `{${urtext}}`
    const v = formatNum(cell.cval)
    // sliders display w/ double-angle-brackets
    return cell.ineq ? `<<${v}>>` : v
  })
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
