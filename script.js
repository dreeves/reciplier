// Specifies recipes to include in the dropdown
const recipesShown = {
  'crepes':    "Soule-Reeves Crepes",
  'cookies':   "Camelot Chocolate Chip Cookies",
  'shortcake': "Shortcake",
  'pancakes':  "Pancakes according to Claude (can't vouch for this)",
  'blank':     "Blank -- paste any recipe below!",
}

// Recipe data keyed consistently with recipesShown
const recipeHash = {
// -----------------------------------------------------------------------------
'shortcake': `\
Preheat oven to =325°F. Line bottom of =9x9 square pan with parchment paper.

* 2   C   flour (can do half/half cake flour)
* 1   C   sugar
* 1/2 C   butter (1 stick)
* 2   tsp baking powder
* 1/2 tsp salt
* 3/4 C   milk
* 1   tsp vanilla

Mix together dry ingredients. Add cold butter cut up into pieces and then cut into the flour as for making pastry, until it resembles coarse crumbs.

Add milk and vanilla and mix well.

Pour into the prepared cake pan, spread evenly. 

Bake =30 to =40 minutes @ =325°F
`,
// -----------------------------------------------------------------------------
'crepes': `\
* eggs: 12 large ones
* milk: 5.333 cups (1.262 liters or 1301 grams)
* flour: 3 cups (380 grams)
* butter: 8 tbsp melted (112 grams)
* salt: 2 tsp (14 grams) 

Yield: roughly 29 crepes
`,
// -----------------------------------------------------------------------------
'cookies': `\
* 1 cup granulated sugar
* 1 cup brown sugar
* 1 cup butter, softened
* 2 eggs
* 1.5 teaspoons vanilla
* 1 teaspoon baking soda
* 1 teaspoon salt
* 3 cups all purpose flour
* 12 ounces semi-sweet chocolate chips (danthany version: half semi-sweet and half milk chocolate)

Place sugar, butter, eggs, and vanilla in mixer bowl. Attach bowl and flat beater to mixer. Turn to speed =2 and mix about =30 seconds. Stop and scrape bowl. 

Turn to Stir Speed. Gradually add baking soda, salt, and flour to sugar mixture and mix about =2 minutes. Turn to speed =2 and mix about =30 seconds. Stop and scrape bowl. Add chocolate chips. Turn to Stir Speed and mix about =15 seconds. 

Drop rounded teaspoonfuls onto greased baking sheets, about =2 inches apart. Bake at =375 F for =10 to =12 minutes. Remove from backing sheets *immediately* and cool on wire racks. 

Yield: 54 cookies, =117 cal (=17g carb) per cookie.
`,
// -----------------------------------------------------------------------------
'pancakes': `\
1 cup all-purpose flour
2 tablespoons sugar
2 teaspoons baking powder
1/2 teaspoon salt
1 cup milk
1 large egg
2 tablespoons vegetable oil

Mix dry ingredients. Combine wet ingredients separately, then add to dry. 
Cook on a greased griddle at =350°F for about =2 minutes per side until golden.

Makes 8 pancakes, =120 calories each.
`,
// -----------------------------------------------------------------------------
'blank': "",
};

// Convenience functions
function $(id) { return document.getElementById(id) } // jQuery-esque selector
function tonum(x) { const n = parseFloat(x); return isNaN(n) ? null : n }

// State variables
let recipeText = '';
let parsedRecipe = [];
let originalValues = [];
let scalingFactor = 1;
let activeField = null;
let editingValue = '';
let currentRecipeKey = "";
let notificationTimeout = null;

// Helper function to format numbers for display
function formatDisplayNumber(num) {
  if (typeof num !== 'number' || isNaN(num)) {
    return '';
  }
  let formatted = num.toFixed(4).replace(/\.?0+$/, '');
  if (formatted.endsWith('.')) {
    formatted = formatted.slice(0, -1);
  }
  return formatted;
}

// Helper function to convert fraction strings to decimal
function parseFraction(fractionStr) {
  if (fractionStr.includes('/')) {
    const parts = fractionStr.split('/');
    return parseFloat(parts[0]) / parseFloat(parts[1]);
  }
  return parseFloat(fractionStr);
}

// Show a temporary notification
function showNotification(message) {
  $('notification').textContent = message;
  $('notification').style.display = 'block';
  if (notificationTimeout) {
    clearTimeout(notificationTimeout);
  }
  notificationTimeout = setTimeout(() => {
    $('notification').style.display = 'none';
  }, 2000);
}

// Update slider thumb color based on scaling factor
function updateSliderThumbColor() {
  const slider = $('scalingSlider');
  if (Math.abs(scalingFactor - 1) < 0.005) {
    slider.classList.add('at-one-x');
  } else {
    slider.classList.remove('at-one-x');
  }
}

// Parse the recipe text to identify all numbers
function parseRecipe() {
  if (!recipeText.trim()) {
    parsedRecipe = [];
    originalValues = [];
    $('recipeOutput').style.display = 'none';
    $('copySection').style.display = 'none';
    
    // Update dropdown to show matching recipe (will be "Blank" for empty text)
    const matchingKey = 
      Object.keys(recipeHash).find(key => recipeHash[key] === recipeText.trim());
    if (matchingKey) {
      currentRecipeKey = matchingKey;
      $('recipeSelect').value = matchingKey;
    }
    updateSliderThumbColor();
    return;
  }

  const numberRegex = /(?:(\=)?)(\d+(?:\.\d+)?(?:\/\d+)?)/g;
  
  const lines = recipeText.split('\n');
  const parsedLines = [];
  const original = [];
  
  lines.forEach((line, lineIndex) => {
    if (!line.trim()) {
      parsedLines.push({ 
        id: `line-${lineIndex}`, 
        content: line, 
        segments: [{ text: line, isNumber: false }] });
      return;
    }
    
    let lastIndex = 0;
    const segments = [];
    let match;
    let matchIndex = 0;
    
    const regex = new RegExp(numberRegex);
    while ((match = regex.exec(line)) !== null) {
      const fullMatch = match[0];
      const equalsPrefix = match[1] || '';
      const numberStr = match[2];
      const startPos = match.index;
      const isConstant = equalsPrefix === '=';
      
      if (startPos > lastIndex) {
        segments.push({ 
          text: line.substring(lastIndex, startPos), 
          isNumber: false 
        });
      }
      
      const value = parseFraction(numberStr);
      if (!isNaN(value)) {
        if (isConstant || value === 0) {
          segments.push({
            text: numberStr,
            isNumber: false,
            isConstant: true
          });
        } else {
          const id = `num-${lineIndex}-${matchIndex}`;
          segments.push({ 
            id,
            originalIndex: original.length,
            text: numberStr, 
            value,
            isNumber: true 
          });
          original.push(value);
        }
      } else {
        segments.push({ 
          text: fullMatch, 
          isNumber: false 
        });
      }
      
      lastIndex = startPos + fullMatch.length;
      matchIndex++;
    }
    
    if (lastIndex < line.length) {
      segments.push({ 
        text: line.substring(lastIndex), 
        isNumber: false 
      });
    }
    
    parsedLines.push({
      id: `line-${lineIndex}`,
      content: line,
      segments
    });
  });
  
  parsedRecipe = parsedLines;
  originalValues = original;
  scalingFactor = 1;
  updateScalingDisplay();

  // Check if current text matches any recipe
  let matchingKey = "";
  for (const key in recipeHash) {
    if (recipeHash[key] === recipeText) {
      matchingKey = key;
      break;
    }
  }
  currentRecipeKey = matchingKey;
  $('recipeSelect').value = matchingKey;

  renderRecipe();
}

// Helper function to find original value for a segment
function findOriginalValue(segmentId) {
  for (const line of parsedRecipe) {
    for (const segment of line.segments) {
      if (segment.id === segmentId) {
        const originalIndex = segment.originalIndex;
        if (originalIndex >= 0 && originalIndex < originalValues.length) {
          return originalValues[originalIndex];
        }
        break;
      }
    }
  }
  return null;
}

// Update scaling factor based on a changed input value
function updateScalingFactor(segmentId, newValue) {
  const numValue = parseFloat(newValue);
  if (isNaN(numValue) || numValue <= 0) return false;
  
  const originalValue = findOriginalValue(segmentId);
  if (originalValue === null) return false;

  scalingFactor = numValue / originalValue;
  updateScalingDisplay();
  updateSliderThumbColor();
  return true;
}

// Update scaling and other input values without re-rendering
function updateScalingFromInput(segmentId, newValue) {
  if (!updateScalingFactor(segmentId, newValue)) return;
  
  // Update all other input fields directly
  const inputs = $('recipeOutput').querySelectorAll('input[type="text"]');
  inputs.forEach(input => {
    const inputSegmentId = input.dataset.segmentId;
    if (inputSegmentId !== activeField) {
      // Find the segment to get its value
      for (const line of parsedRecipe) {
        for (const segment of line.segments) {
          if (segment.id === inputSegmentId && segment.isNumber) {
            input.value = formatDisplayNumber(segment.value * scalingFactor);
            break;
          }
        }
      }
    }
  });
}

// Handle number change, scale all other numbers (used for non-keystroke events)
function handleNumberChange(segmentId, newValue) {
  if (!updateScalingFactor(segmentId, newValue)) return;
  renderRecipe();
}



// Load recipe
function handleRecipeChange() {
  const selectedKey = $('recipeSelect').value;
  currentRecipeKey = selectedKey;
  if (recipeHash.hasOwnProperty(selectedKey)) {
    recipeText = recipeHash[selectedKey];
    $('recipeTextarea').value = recipeText;
    parseRecipe();
  }
}

// Generate scaled recipe text for copying
function getScaledRecipeText() {
  return parsedRecipe.map(line => {
    return line.segments.map(segment => {
      if (segment.isNumber) {
        return formatDisplayNumber(segment.value * scalingFactor);
      }
      if (segment.isConstant) {
        return '=' + segment.text;
      }
      return segment.text;
    }).join('');
  }).join('\n');
}

// Handle copy to clipboard
function handleCopyToClipboard() {
  if (!navigator.clipboard) {
    showNotification('Clipboard access not available');
    return;
  }

  const scaledText = getScaledRecipeText();
  navigator.clipboard.writeText(scaledText)
    .then(() => {
      showNotification('Recipe copied!');
    })
    .catch(err => {
      console.error('Failed to copy text: ', err);
      showNotification('Failed to copy recipe');
    });
}

// Update scaling display
function updateScalingDisplay() {
  $('scalingDisplay').textContent = formatDisplayNumber(scalingFactor) + 'x';
  $('scalingSlider').value = scalingFactor;
  updateSliderThumbColor();
}

// Render the parsed recipe with interactive number fields
function renderRecipe() {
  if (parsedRecipe.length === 0) {
    $('recipeOutput').style.display = 'none';
    $('copySection').style.display = 'none';
    return;
  }

  $('recipeOutput').innerHTML = '';
  
  parsedRecipe.forEach((line) => {
    const lineDiv = document.createElement('div');
    lineDiv.className = 'mb-2';
    
    const lineSpan = document.createElement('span');
    lineSpan.className = 'font-mono text-base';
    
    line.segments.forEach((segment) => {
      if (segment.isNumber) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'w-20 p-1 border rounded text-center mx-1';
        input.value = formatDisplayNumber(segment.value * scalingFactor);
        input.dataset.segmentId = segment.id;
        
        input.addEventListener('focus', () => {
          activeField = segment.id;
          editingValue = input.value;
        });
        
        input.addEventListener('blur', () => {
          activeField = null;
        });
        
        input.addEventListener('input', (e) => {
          editingValue = e.target.value;
          
          // Check if input is valid (purely numeric and positive)
          const trimmedValue = editingValue.trim();
          const numValue = tonum(trimmedValue);
          
          // Check if it's a valid number format
          const isValidNumber = numValue !== null && 
                               numValue > 0 && 
                               trimmedValue !== '' &&
                               /^\.?\d*\.?\d+$/.test(trimmedValue);
          
          // Add/remove invalid class for visual feedback
          if (isValidNumber) {
            input.classList.remove('invalid');
            // Scale on every keystroke by updating other fields directly
            updateScalingFromInput(segment.id, numValue);
          } else {
            input.classList.add('invalid');
          }
        });
        
        input.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            e.target.blur();
          }
        });
        
        lineSpan.appendChild(input);
      } else if (segment.isConstant) {
        const constantSpan = document.createElement('span');
        constantSpan.className = 'constant px-1 py-0-5';
        constantSpan.textContent = segment.text;
        lineSpan.appendChild(constantSpan);
      } else {
        const textNode = document.createTextNode(segment.text);
        lineSpan.appendChild(textNode);
      }
    });
    
    lineDiv.appendChild(lineSpan);
    $('recipeOutput').appendChild(lineDiv);
  });
  
  $('recipeOutput').style.display = 'block';
  $('copySection').style.display = 'block';
}

// Initialize the app
function init() {
  // Populate dropdown options from recipesShown
  Object.keys(recipesShown).forEach(key => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = recipesShown[key];
    $('recipeSelect').appendChild(option);
  });

  // Set up event listeners
  $('recipeTextarea').addEventListener('input', (e) => {
    recipeText = e.target.value;
    parseRecipe();
  });

  $('recipeSelect').addEventListener('change', handleRecipeChange);
  
  $('scalingSlider').addEventListener('input', (e) => {
    scalingFactor = parseFloat(e.target.value);
    updateScalingDisplay();
    renderRecipe();
  });

  $('copyButton').addEventListener('click', handleCopyToClipboard);

  // Load default recipe (first one in recipesShown)
  const firstRecipeKey = Object.keys(recipesShown)[0];
  if (!recipeText && recipeHash[firstRecipeKey]) {
    recipeText = recipeHash[firstRecipeKey];
    $('recipeTextarea').value = recipeText;
    parseRecipe();
  }
}

// Start the app when DOM is loaded
document.addEventListener('DOMContentLoaded', init);
