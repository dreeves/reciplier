// =============================================================================
// Configuration Defaults
// =============================================================================
// Edit these values to change the default behavior of the debug/config panel.
// All runtime config variables are initialized from these defaults.

const CONFIG_DEFAULTS = {
// --- Trigger Modes ---
// Which triggers are active by default for pegging/freezing fields.
// Invisible: 'dblclick', 'tripleclick', 'longpress', 'borderclick', 'modclick', 'rightclick'
// Visual: 'cornerpin', 'edgedots', 'brackets', 'hoverglow'
triggerModes: ['longpress', 'cornerpin'],

// --- Edge Threshold ---
// Pixel distance from field edge that counts as "border click" or "hover glow"
borderClickThresholdPx: 5,

// --- Pin Size ---
// Base size of corner pins in pixels (desktop). On mobile (<768px), capped at 14px.
cornerPinSizePx: 14,

// --- Timing ---
// Long-press duration to trigger peg (ms)
longpressDelayMs: 400,
// Triple-click timeout window (ms)
tripleclickTimeoutMs: 500,

// --- Indicator Visibility ---
// true = always show, false = only show on focus
indicatorShowAlways: {
  background: true,   // Blue background for pegged fields
  cornerpin: false,   // Corner pin emoji
  edgedots: false,    // Edge dots
  brackets: false,     // Corner brackets
},

// --- Responsive Breakpoint ---
// Screen width below which mobile pin size cap applies
mobileBreakpointPx: 768,
// Maximum pin size on mobile screens
mobilePinMaxSizePx: 14,

// --- Debug Panel ---
// Whether the debug panel starts collapsed (true) or expanded (false)
debugPanelStartsCollapsed: false
}

// =============================================================================
// Runtime Configuration (initialized from defaults)
// =============================================================================

let TRIGGER_MODES = new Set(CONFIG_DEFAULTS.triggerModes)
let BORDER_CLICK_THRESHOLD_PX = CONFIG_DEFAULTS.borderClickThresholdPx
let CORNER_PIN_SIZE_PX = CONFIG_DEFAULTS.cornerPinSizePx
const LONGPRESS_DELAY_MS = CONFIG_DEFAULTS.longpressDelayMs
const TRIPLECLICK_TIMEOUT_MS = CONFIG_DEFAULTS.tripleclickTimeoutMs

let INDICATOR_SHOW_ALWAYS = { ...CONFIG_DEFAULTS.indicatorShowAlways }

const MOBILE_BREAKPOINT = CONFIG_DEFAULTS.mobileBreakpointPx
let lastWasMobile = window.innerWidth < MOBILE_BREAKPOINT

function getResponsivePinSize() {
  const isMobile = window.innerWidth < MOBILE_BREAKPOINT
  return isMobile ? Math.min(CONFIG_DEFAULTS.mobilePinMaxSizePx, CORNER_PIN_SIZE_PX) : CORNER_PIN_SIZE_PX
}

// =============================================================================
// Main Parse and Render Functions
// =============================================================================

function renderErrorDisplay(messages) {
  if (!messages || messages.length === 0) return ''
  const items = messages.map(m => `<div class="error-message">⚠️ ${escapeHtml(m)}</div>`).join('')
  return `<div class="error-display">${items}</div>`
}

function assignErrorsToCells(errors, cells) {
  const byCell = new Map()
  const global = []
  for (const err of errors) {
    let matchedCell = null
    for (const cell of cells) {
      if (err.includes(`{${cell.urtext}}`)) {
        matchedCell = cell
        break
      }
    }
    if (matchedCell) {
      const list = byCell.get(matchedCell.id) || []
      list.push(err)
      byCell.set(matchedCell.id, list)
    } else {
      global.push(err)
    }
  }
  return { byCell, global }
}

function findRenderedAnchor(rendered, cellId) {
  const input = rendered.querySelector(`input.recipe-field[data-cell-id="${cellId}"]`)
  if (!input) throw new Error('renderRecipe: missing input for error banner anchor')
  let anchor = input
  while (anchor && anchor.parentNode !== rendered) {
    anchor = anchor.parentNode
  }
  return anchor
}

function insertCriticalErrorBanners(rendered, errorAssignments) {
  if (!rendered) throw new Error('renderRecipe: missing rendered container for error banners')
  for (const [cellId, messages] of errorAssignments.byCell) {
    if (!messages || messages.length === 0) {
      throw new Error('renderRecipe: empty error list for cell banner')
    }
    const anchor = findRenderedAnchor(rendered, cellId)
    const bannerHtml = renderErrorDisplay(messages)
    if (!bannerHtml) throw new Error('renderRecipe: empty banner html for cell error')
    anchor.insertAdjacentHTML('afterend', bannerHtml)
  }
  const globalHtml = renderErrorDisplay(errorAssignments.global)
  if (errorAssignments.global.length > 0 && !globalHtml) {
    throw new Error('renderRecipe: empty banner html for global errors')
  }
  if (globalHtml) rendered.insertAdjacentHTML('beforeend', globalHtml)
}

const markdownRenderer = markdownit({ html: true, breaks: true })

function getRecipeKeyForText(text) {
  for (const key in reciplates) {
    if (reciplates[key] === text) return key
  }
  return null
}

function updateRecipeDropdown() {
  $('recipeSelect').value = getRecipeKeyForText(state.recipeText) || 'custom'
}

function renderRecipe() {
  const output = $('recipeOutput')
  const copySection = $('copySection')
  
  const criticalErrors = state.errors

  const invalidCellIds = collectInvalidCellIds(state.solve.eqns, state.solve.zij)

  function renderRecipeBody({ disableInputs, invalidCellIds }) {
    const text = state.recipeText
    // Build the rendered text
    let markdownText = ''
    let lastIndex = 0

    // Sort cells by start index
    const visibleCells = state.cells
      .sort((a, b) => a.startIndex - b.startIndex)
    const placeholders = new Map()

    for (const cell of visibleCells) {
      // Add text before this cell
      if (cell.startIndex > lastIndex) {
        markdownText += text.substring(lastIndex, cell.startIndex)
      }

      // Render the cell as input field or slider based on inequality bounds
      const value = cell.cval
      const displayValue = formatNum(value)
      const isFixed = state.fixedCellIds.has(cell.id)
      const isInvalid = invalidCellIds.has(cell.id)
      const title = `${cell.urtext}`.replace(/"/g, '&quot;')
      const disabledAttr = disableInputs ? ' disabled' : ''

      let inputHtml
      if (cell.ineq) {
        // Cell has inequality bounds - render as slider with bounds labels
        const bounds = sliderBoundsForCell(cell)
        const nearOne = Math.abs(value - 1) < 0.005
        const varName = cell.ineq.varName || ''
        const minLabel = formatNum(bounds.minLabel)
        const maxLabel = formatNum(bounds.maxLabel)
        inputHtml = `<span class="slider-bound">${minLabel}</span><input type="range" class="recipe-slider${nearOne ? ' at-one-x' : ''}" min="${bounds.min}" max="${bounds.max}" step="0.01" value="${displayValue}" data-cell-id="${cell.id}" data-var-name="${varName}" title="${title}"${disabledAttr}><span class="slider-bound">${maxLabel}</span>`
      } else {
        // No inequality bounds - render as text field
        const label = cell.ceqn.length > 0 ? cell.ceqn[0].trim() : ''
        const focusOnlyBgClass = !INDICATOR_SHOW_ALWAYS.background ? 'focus-only-bg' : ''
        inputHtml = `<input type="text" class="recipe-field ${isFixed ? 'fixed' : ''} ${isInvalid ? 'invalid' : ''} ${focusOnlyBgClass}" data-label="${label}" data-cell-id="${cell.id}" value="${displayValue}" title="${title}"${disabledAttr}>`
      }
      const placeholder = `@@RECIPLIER_CELL_${cell.id}@@`
      placeholders.set(placeholder, inputHtml)
      markdownText += placeholder

      lastIndex = cell.endIndex
    }

    // Add remaining text after last cell
    if (lastIndex < text.length) {
      markdownText += text.substring(lastIndex, text.length)
    }

    // Convert newlines to <br> for display
    let html = markdownRenderer.render(markdownText)
    for (const [placeholder, inputHtml] of placeholders) {
      html = html.split(placeholder).join(inputHtml)
    }
    // Wrap each line in paragraphs containing sliders so each line can be its
    // own flex container. This allows sliders to fill available space on their
    // line without affecting other lines.
    html = wrapLinesInParagraphsWithSliders(html)
    return `<div class="recipe-rendered">${html}</div>`
  }

  // Helper: For paragraphs containing sliders, wrap each line segment (separated
  // by <br>) in a <span class="recipe-line">. This allows per-line flex layout.
  function wrapLinesInParagraphsWithSliders(html) {
    return html.replace(/<p>([\s\S]*?)<\/p>/g, (match, inner) => {
      // Only process paragraphs that contain sliders
      if (!inner.includes('recipe-slider')) return match
      // Split by <br> variants (handles <br>, <br/>, <br />)
      const parts = inner.split(/<br\s*\/?>/gi)
      // Wrap each part in a recipe-line span
      const wrapped = parts.map(part => `<span class="recipe-line">${part}</span>`)
      // Rejoin with <br>
      return `<p>${wrapped.join('<br>')}</p>`
    })
  }

  const solveBanner = `<div id="solveBanner" class="error-display solve-display"${state.solveBanner ? '' : ' hidden'}>
        <div class="error-message">⚠️ ${escapeHtml(state.solveBanner)}</div>
      </div>`

  const invalidExplainBanner = `<div id="invalidExplainBanner" class="error-display solve-display"${state.invalidExplainBanner ? '' : ' hidden'}>
        <div class="error-message">⚠️ ${escapeHtml(state.invalidExplainBanner)}</div>
      </div>`

  const nonCriticalBanners = `<div id="nonCriticalBanners">${solveBanner}${invalidExplainBanner}</div>`
  const errorAssignments = assignErrorsToCells(criticalErrors, state.cells)
  
  if (state.cells.length === 0 && state.errors.length === 0) {
    output.style.display = 'none'
    copySection.style.display = 'none'
    return
  }
  
  output.innerHTML = `${nonCriticalBanners}${renderRecipeBody({ disableInputs: false, invalidCellIds })}`
  output.style.display = 'block'
  copySection.style.display = 'block'

  const rendered = output.querySelector('.recipe-rendered')
  insertCriticalErrorBanners(rendered, errorAssignments)

  $('copyButton').disabled = criticalErrors.length > 0
  
  // Attach event handlers to text field inputs
  output.querySelectorAll('input.recipe-field').forEach(input => {
    input.addEventListener('input', handleFieldInput)
    input.addEventListener('blur', handleFieldBlur)
    input.addEventListener('keypress', handleFieldKeypress)
    attachPegTrigger(input)
  })

  // Attach event handlers to slider inputs
  output.querySelectorAll('input.recipe-slider').forEach(input => {
    input.addEventListener('input', handleInlineSliderInput)
  })

  syncAfterSolve(invalidCellIds)
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

function repositionNonCriticalBannersAfterLastInvalidField() {
  const rendered = $('recipeOutput')?.querySelector('.recipe-rendered')
  const banners = rendered && $('nonCriticalBanners')
  if (!rendered || !banners) return

  const invalidFields = rendered.querySelectorAll('input.recipe-field.invalid')
  let anchor = invalidFields.length ? invalidFields[invalidFields.length - 1] : null

  while (anchor && anchor.parentNode !== rendered) {
    anchor = anchor.parentNode
  }

  const refNode = anchor ? anchor.nextSibling : null
  rendered.insertBefore(banners, refNode)
}

function syncAfterSolve(invalidCellIds, editedFieldEl = null) {
  updateSolveBannerInDom()
  updateInvalidExplainBannerInDom()

  const output = $('recipeOutput')
  if (output) {
    // Sync text fields
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

    // Sync inline sliders
    output.querySelectorAll('input.recipe-slider').forEach(slider => {
      if (editedFieldEl && slider === editedFieldEl) return
      const c = state.cells.find(x => x.id === slider.dataset.cellId)
      if (c) {
        slider.value = c.cval
        slider.classList.toggle('at-one-x', Math.abs(c.cval - 1) < 0.005)
      }
    })
  }

  repositionNonCriticalBannersAfterLastInvalidField()
}

function markInvalidInput(input, cellId, message) {
  input.classList.add('invalid')
  state.invalidInputCellIds.add(cellId)
  state.invalidExplainBanner = message
  updateInvalidExplainBannerInDom()
  repositionNonCriticalBannersAfterLastInvalidField()
}

function clearInvalidInput(cellId) {
  state.invalidInputCellIds.delete(cellId)
}

function handleFieldInput(e) {
  const input = e.target
  const cellId = input.dataset.cellId
  const cell = state.cells.find(c => c.id === cellId)
  if (!cell) return

  let newValue = toNum(input.value)

  if (!isFiniteNumber(newValue)) {
    // Try evaluating as a constant expression (no variables allowed)
    const result = vareval(input.value, {})
    if (!result.error && isFiniteNumber(result.value)) {
      newValue = result.value
    } else {
      markInvalidInput(input, cellId, `Syntax error`)
      return
    }
  }

  clearInvalidInput(cellId)
  cell.cval = newValue

  const solveResult = solveAndApply({
    editedCellId: cellId,
    editedValue: newValue,
    editedFieldEl: input,
  })

  syncAfterSolve(solveResult.invalidCellIds, input)
  updateUrl()
}

function handleFieldBlur(e) {
  const input = e.target
  const cellId = input.dataset.cellId
  const cell = state.cells.find(c => c.id === cellId)
  if (!cell) return
  if (state.invalidInputCellIds.has(cellId)) return
  input.value = formatNum(cell.cval)
}

function handleFieldKeypress(e) {
  if (e.key === 'Enter') {
    e.target.blur()
  }
}

function handleInlineSliderInput(e) {
  const input = e.target
  const cellId = input.dataset.cellId
  const cell = state.cells.find(c => c.id === cellId)
  if (!cell) return

  const newValue = toNum(input.value)
  if (!isFiniteNumber(newValue)) return

  cell.cval = newValue

  const solveResult = solveAndApply({
    editedCellId: cellId,
    editedValue: newValue,
  })

  // Update at-one-x styling
  input.classList.toggle('at-one-x', Math.abs(newValue - 1) < 0.005)

  syncAfterSolve(solveResult.invalidCellIds, input)
  updateUrl()
}

// =============================================================================
// Peg/Freeze Toggle Logic
// =============================================================================

function toggleCellPeg(input) {
  const cellId = input.dataset.cellId

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

// --- Double-click trigger ---
function handleFieldDoubleClick(e) {
  toggleCellPeg(e.target)
}

// --- Border-click trigger ---
function isClickNearBorder(e) {
  const input = e.target
  const rect = input.getBoundingClientRect()
  const t = BORDER_CLICK_THRESHOLD_PX
  
  const distFromLeft = e.clientX - rect.left
  const distFromRight = rect.right - e.clientX
  const distFromTop = e.clientY - rect.top
  const distFromBottom = rect.bottom - e.clientY
  
  return distFromLeft < t || distFromRight < t || distFromTop < t || distFromBottom < t
}

function handleFieldClick(e) {
  if (isClickNearBorder(e)) {
    e.preventDefault()
    toggleCellPeg(e.target)
  }
}

function handleFieldMouseMove(e) {
  const input = e.target
  if (isClickNearBorder(e)) {
    input.style.cursor = 'pointer'
  } else {
    input.style.cursor = ''
  }
}

function handleFieldMouseLeave(e) {
  e.target.style.cursor = ''
}

// --- Corner Pin trigger ---
function createCornerPin(input) {
  const pin = document.createElement('span')
  const isPinned = state.fixedCellIds.has(input.dataset.cellId)
  const focusOnlyClass = !INDICATOR_SHOW_ALWAYS.cornerpin ? ' focus-only' : ''
  pin.className = 'corner-pin' + (isPinned ? ' pinned' : '') + focusOnlyClass
  pin.textContent = isPinned ? '●' : '📌'
  pin.title = isPinned ? 
    'Pinned! This field only changes if you edit it.' : 
    'Unpinned. Click to pin it.'
  // Apply dynamic size (responsive)
  const size = getResponsivePinSize()
  const fontSize = Math.max(8, Math.round(size * 0.67))
  pin.style.width = size + 'px'
  pin.style.height = size + 'px'
  pin.style.fontSize = fontSize + 'px'
  pin.style.lineHeight = size + 'px'
  pin.style.top = (-size / 3) + 'px'
  pin.style.right = (-size / 3) + 'px'
  pin.addEventListener('click', (e) => {
    e.stopPropagation()
    toggleCellPeg(input)
  })
  return pin
}

// --- Edge Dots trigger ---
function createEdgeDots(input) {
  const dots = []
  const positions = ['top', 'right', 'bottom', 'left']
  const isPinned = state.fixedCellIds.has(input.dataset.cellId)
  const focusOnlyClass = !INDICATOR_SHOW_ALWAYS.edgedots ? ' focus-only' : ''
  
  for (const pos of positions) {
    const dot = document.createElement('span')
    dot.className = 'edge-dot ' + pos + (isPinned ? ' pinned' : '') + focusOnlyClass
    dot.addEventListener('click', (e) => {
      e.stopPropagation()
      toggleCellPeg(input)
      const nowPinned = state.fixedCellIds.has(input.dataset.cellId)
      dots.forEach(d => d.classList.toggle('pinned', nowPinned))
    })
    dots.push(dot)
  }
  return dots
}

// --- Corner Brackets trigger ---
function createCornerBrackets(input) {
  const brackets = []
  const corners = [
    { pos: 'top-left', char: '⌜' },
    { pos: 'top-right', char: '⌝' },
    { pos: 'bottom-left', char: '⌞' },
    { pos: 'bottom-right', char: '⌟' }
  ]
  const isPinned = state.fixedCellIds.has(input.dataset.cellId)
  const focusOnlyClass = !INDICATOR_SHOW_ALWAYS.brackets ? ' focus-only' : ''
  
  for (const corner of corners) {
    const bracket = document.createElement('span')
    bracket.className = 'corner-bracket ' + corner.pos + (isPinned ? ' pinned' : '') + focusOnlyClass
    bracket.textContent = corner.char
    bracket.addEventListener('click', (e) => {
      e.stopPropagation()
      toggleCellPeg(input)
      const nowPinned = state.fixedCellIds.has(input.dataset.cellId)
      brackets.forEach(b => b.classList.toggle('pinned', nowPinned))
    })
    brackets.push(bracket)
  }
  return brackets
}

// --- Hover Glow trigger ---
function getClosestEdge(e, input) {
  const rect = input.getBoundingClientRect()
  const t = BORDER_CLICK_THRESHOLD_PX
  
  const distFromLeft = e.clientX - rect.left
  const distFromRight = rect.right - e.clientX
  const distFromTop = e.clientY - rect.top
  const distFromBottom = rect.bottom - e.clientY
  
  const distances = [
    { edge: 'left', dist: distFromLeft },
    { edge: 'right', dist: distFromRight },
    { edge: 'top', dist: distFromTop },
    { edge: 'bottom', dist: distFromBottom }
  ]
  
  const closest = distances.reduce((min, curr) => curr.dist < min.dist ? curr : min)
  return closest.dist < t ? closest.edge : null
}

function clearHoverGlow(input) {
  input.classList.remove('hoverglow-left', 'hoverglow-right', 'hoverglow-top', 'hoverglow-bottom')
}

function handleHoverGlowMouseMove(e) {
  const input = e.target
  clearHoverGlow(input)
  const edge = getClosestEdge(e, input)
  if (edge) {
    input.classList.add('hoverglow-' + edge)
    input.style.cursor = 'pointer'
  } else {
    input.style.cursor = ''
  }
}

function handleHoverGlowMouseLeave(e) {
  const input = e.target
  clearHoverGlow(input)
  input.style.cursor = ''
}

function handleHoverGlowClick(e) {
  // Skip if borderclick is also active (it handles edge clicks)
  if (TRIGGER_MODES.has('borderclick')) return
  
  const input = e.target
  const edge = getClosestEdge(e, input)
  if (edge) {
    e.preventDefault()
    toggleCellPeg(input)
  }
}

// --- Triple-click trigger ---
let tripleclickCount = 0
let tripleclickTimer = null
let tripleclickTarget = null

function handleFieldTripleClick(e) {
  const input = e.target
  
  // Reset if clicking a different target
  if (tripleclickTarget !== input) {
    tripleclickCount = 0
    tripleclickTarget = input
  }
  
  tripleclickCount++
  
  // Clear existing timer
  if (tripleclickTimer) {
    clearTimeout(tripleclickTimer)
  }
  
  // Reset count after timeout
  tripleclickTimer = setTimeout(() => {
    tripleclickCount = 0
    tripleclickTarget = null
  }, TRIPLECLICK_TIMEOUT_MS)
  
  if (tripleclickCount === 3) {
    tripleclickCount = 0
    tripleclickTarget = null
    clearTimeout(tripleclickTimer)
    tripleclickTimer = null
    toggleCellPeg(input)
  }
}

// --- Modifier-click trigger ---
function handleFieldModClick(e) {
  if (e.shiftKey || e.ctrlKey || e.metaKey) {
    e.preventDefault()
    toggleCellPeg(e.target)
  }
}

// --- Right-click trigger ---
function handleFieldRightClick(e) {
  e.preventDefault()
  toggleCellPeg(e.target)
}

// --- Long-press trigger ---
let longpressTimer = null
let longpressTarget = null

function handleFieldPointerDown(e) {
  const input = e.target
  longpressTarget = input
  input.classList.add('pressing')
  
  longpressTimer = setTimeout(() => {
    if (longpressTarget === input) {
      toggleCellPeg(input)
      longpressTarget = null
    }
  }, LONGPRESS_DELAY_MS)
}

function handleFieldPointerEnd(e) {
  const input = e.target
  input.classList.remove('pressing')
  
  if (longpressTimer) {
    clearTimeout(longpressTimer)
    longpressTimer = null
  }
  longpressTarget = null
}

// --- Attach triggers based on active modes ---
function attachPegTrigger(input) {
  // Check if we need a wrapper for visual modes
  const needsWrapper = TRIGGER_MODES.has('cornerpin') || 
                       TRIGGER_MODES.has('edgedots') || 
                       TRIGGER_MODES.has('brackets')
  
  let wrapper = null
  if (needsWrapper) {
    wrapper = document.createElement('span')
    wrapper.className = 'field-wrapper'
    input.parentNode.insertBefore(wrapper, input)
    wrapper.appendChild(input)
  }

  if (TRIGGER_MODES.has('dblclick')) {
    input.addEventListener('dblclick', handleFieldDoubleClick)
  }
  if (TRIGGER_MODES.has('longpress')) {
    input.addEventListener('pointerdown', handleFieldPointerDown)
    input.addEventListener('pointerup', handleFieldPointerEnd)
    input.addEventListener('pointerleave', handleFieldPointerEnd)
    input.addEventListener('pointercancel', handleFieldPointerEnd)
  }
  if (TRIGGER_MODES.has('borderclick')) {
    input.addEventListener('click', handleFieldClick)
    input.addEventListener('mousemove', handleFieldMouseMove)
    input.addEventListener('mouseleave', handleFieldMouseLeave)
  }
  if (TRIGGER_MODES.has('tripleclick')) {
    input.addEventListener('click', handleFieldTripleClick)
  }
  if (TRIGGER_MODES.has('modclick')) {
    input.addEventListener('click', handleFieldModClick)
  }
  if (TRIGGER_MODES.has('rightclick')) {
    input.addEventListener('contextmenu', handleFieldRightClick)
  }
  
  // Visual trigger modes
  if (TRIGGER_MODES.has('cornerpin') && wrapper) {
    const pin = createCornerPin(input)
    wrapper.appendChild(pin)
  }
  if (TRIGGER_MODES.has('edgedots') && wrapper) {
    const dots = createEdgeDots(input)
    dots.forEach(dot => wrapper.appendChild(dot))
  }
  if (TRIGGER_MODES.has('brackets') && wrapper) {
    const brackets = createCornerBrackets(input)
    brackets.forEach(bracket => wrapper.appendChild(bracket))
  }
  if (TRIGGER_MODES.has('hoverglow')) {
    input.addEventListener('mousemove', handleHoverGlowMouseMove)
    input.addEventListener('mouseleave', handleHoverGlowMouseLeave)
    input.addEventListener('click', handleHoverGlowClick)
  }
}

function handleRecipeChange() {
  const selectedKey = $('recipeSelect').value
  if (reciplates.hasOwnProperty(selectedKey)) {
    state.recipeText = reciplates[selectedKey]
    $('recipeTextarea').value = state.recipeText
    parseRecipe()
    updateRecipeDropdown()
    renderRecipe()
    updateUrl()
  }
}

function handleTextareaInput(e) {
  state.recipeText = e.target.value
  parseRecipe()
  updateRecipeDropdown()
  renderRecipe()
  updateUrl()
}

// =============================================================================
// Copy Functionality
// =============================================================================

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
// Initialization
// =============================================================================

function initDebugPanel() {
  const panel = $('debugPanel')
  if (!panel) return

  // Set initial collapsed state from config (panel has 'open' by default in HTML)
  if (CONFIG_DEFAULTS.debugPanelStartsCollapsed) {
    panel.removeAttribute('open')
  }

  // Set initial checkbox states from TRIGGER_MODES
  panel.querySelectorAll('input[data-trigger-mode]').forEach(checkbox => {
    checkbox.checked = TRIGGER_MODES.has(checkbox.dataset.triggerMode)
  })

  // Set initial checkbox states for indicator visibility
  panel.querySelectorAll('input[data-indicator-visibility]').forEach(checkbox => {
    const indicator = checkbox.dataset.indicatorVisibility
    checkbox.checked = INDICATOR_SHOW_ALWAYS[indicator]
  })

  const thresholdInput = $('borderThreshold')
  const thresholdValue = $('borderThresholdValue')
  if (thresholdInput) {
    thresholdInput.value = BORDER_CLICK_THRESHOLD_PX
    if (thresholdValue) thresholdValue.textContent = BORDER_CLICK_THRESHOLD_PX
  }

  const pinSizeInput = $('pinSize')
  const pinSizeValue = $('pinSizeValue')
  if (pinSizeInput) {
    pinSizeInput.value = CORNER_PIN_SIZE_PX
    if (pinSizeValue) pinSizeValue.textContent = CORNER_PIN_SIZE_PX
  }

  // Handle trigger mode checkbox changes
  panel.querySelectorAll('input[data-trigger-mode]').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const mode = e.target.dataset.triggerMode
      if (e.target.checked) {
        TRIGGER_MODES.add(mode)
      } else {
        TRIGGER_MODES.delete(mode)
      }
      renderRecipe()
    })
  })

  // Handle indicator visibility checkbox changes
  panel.querySelectorAll('input[data-indicator-visibility]').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const indicator = e.target.dataset.indicatorVisibility
      INDICATOR_SHOW_ALWAYS[indicator] = e.target.checked
      renderRecipe()
    })
  })

  // Handle border threshold changes
  if (thresholdInput) {
    thresholdInput.addEventListener('input', (e) => {
      BORDER_CLICK_THRESHOLD_PX = parseInt(e.target.value, 10)
      if (thresholdValue) thresholdValue.textContent = BORDER_CLICK_THRESHOLD_PX
    })
  }

  // Handle pin size changes
  if (pinSizeInput) {
    pinSizeInput.addEventListener('input', (e) => {
      CORNER_PIN_SIZE_PX = parseInt(e.target.value, 10)
      if (pinSizeValue) pinSizeValue.textContent = CORNER_PIN_SIZE_PX
      // Re-render to update pin sizes
      if (TRIGGER_MODES.has('cornerpin')) {
        renderRecipe()
      }
    })
  }

  // Handle responsive pin size on window resize
  window.addEventListener('resize', () => {
    const isMobile = window.innerWidth < MOBILE_BREAKPOINT
    if (isMobile !== lastWasMobile) {
      lastWasMobile = isMobile
      if (TRIGGER_MODES.has('cornerpin')) {
        renderRecipe()
      }
    }
  })
}

// =============================================================================
// URL State Management (Direct Links to Recipes)
// =============================================================================

let urlUpdateEnabled = true

function updateUrl() {
  if (!urlUpdateEnabled) return
  if (typeof LZString === 'undefined') return
  
  const params = new URLSearchParams()
  
  const recipeKey = getRecipeKeyForText(state.recipeText)
  if (recipeKey && recipeKey !== 'custom') {
    params.set('recipe', recipeKey)
  } else if (state.recipeText.trim()) {
    const compressed = LZString.compressToEncodedURIComponent(state.recipeText)
    params.set('rawcipe', compressed)
  }

  const queryString = params.toString()
  const newUrl = queryString ? `${location.pathname}?${queryString}` : location.pathname
  history.replaceState(null, '', newUrl)
}

function loadFromUrl() {
  const params = new URLSearchParams(location.search)
  
  const recipeKey = params.get('recipe')
  const rawcipe = params.get('rawcipe')
  
  let recipeText = null
  let selectedKey = null
  
  if (recipeKey && reciplates.hasOwnProperty(recipeKey)) {
    recipeText = reciplates[recipeKey]
    selectedKey = recipeKey
  } else if (rawcipe && typeof LZString !== 'undefined') {
    const decompressed = LZString.decompressFromEncodedURIComponent(rawcipe)
    if (decompressed) {
      recipeText = decompressed
      selectedKey = 'custom'
    }
  }
  
  if (recipeText === null) return false

  urlUpdateEnabled = false

  state.recipeText = recipeText
  $('recipeTextarea').value = recipeText
  if (selectedKey) $('recipeSelect').value = selectedKey

  parseRecipe()
  updateRecipeDropdown()
  renderRecipe()
  
  urlUpdateEnabled = true
  updateUrl()
  
  return true
}

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

  // Initialize debug panel
  initDebugPanel()

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
  
  // Try to load from URL first, otherwise load first recipe
  if (!loadFromUrl()) {
    const firstKey = Object.keys(recipeDropdown)[0]
    if (reciplates[firstKey]) {
      state.recipeText = reciplates[firstKey]
      $('recipeTextarea').value = state.recipeText
      parseRecipe()
      updateRecipeDropdown()
      renderRecipe()
      updateUrl()
    }
  }
}
