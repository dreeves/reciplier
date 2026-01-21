// =============================================================================
// Main Parse and Render Functions
// =============================================================================

const markdownRenderer = markdownit({ html: true, breaks: true })

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
    let markdownText = ''
    let lastIndex = 0

    // Sort cells by start index
    const visibleCells = state.cells
      .filter(c => !isIndexInComment(c.startIndex, commentRanges))
      .sort((a, b) => a.startIndex - b.startIndex)
    const placeholders = new Map()

    for (const cell of visibleCells) {
      // Add text before this cell
      if (cell.startIndex > lastIndex) {
        for (const [s, e] of nonCommentSlices(lastIndex, cell.startIndex, commentRanges)) {
          markdownText += text.substring(s, e)
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
      const inputHtml = `<input type="text" class="recipe-field ${isFixed ? 'fixed' : ''} ${isInvalid ? 'invalid' : ''}" data-label="${label}" data-cell-id="${cell.id}" value="${displayValue}" title="${title}"${disabledAttr}>`
      const placeholder = `@@RECIPLIER_CELL_${cell.id}@@`
      placeholders.set(placeholder, inputHtml)
      markdownText += placeholder

      lastIndex = cell.endIndex
    }

    // Add remaining text after last cell
    if (lastIndex < text.length) {
      for (const [s, e] of nonCommentSlices(lastIndex, text.length, commentRanges)) {
        markdownText += text.substring(s, e)
      }
    }

    // Convert newlines to <br> for display
    let html = markdownRenderer.render(markdownText)
    for (const [placeholder, inputHtml] of placeholders) {
      html = html.split(placeholder).join(inputHtml)
    }
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

  // Update slider display
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

  repositionNonCriticalBannersAfterLastInvalidField()
  updateSliderDisplay()
}

// TODO: ugh, hundreds of occurrences of "value", many but not all of which
// should be "cval"

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

  const solveResult = solveAndApply({
    editedCellId: cellId,
    editedValue: newValue,
    editedFieldEl: input,
  })

  syncAfterSolve(solveResult.invalidCellIds, input)
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
    updateRecipeDropdown()
    renderRecipe()
  }
}

function handleTextareaInput(e) {
  state.recipeText = e.target.value
  parseRecipe()
  updateRecipeDropdown()
  renderRecipe()
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
    updateRecipeDropdown()
    renderRecipe()
  }
}
