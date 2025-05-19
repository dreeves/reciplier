import React, { useState, useEffect } from 'react';
import styles from './Reciplier.module.css'; // Import the CSS module

const RecipeScaler = () => {
  const [recipeText, setRecipeText] = useState('');
  const [parsedRecipe, setParsedRecipe] = useState([]);
  const [originalValues, setOriginalValues] = useState([]);
  const [scalingFactor, setScalingFactor] = useState(1);
  const [activeField, setActiveField] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  
  // Default recipe and examples
  const defaultRecipe = `Shortcake

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

Bake =30 to =40 minutes @ =325°F`;

// Pancakes (according to Claude)
//
// 1 cup all-purpose flour
// 2 tablespoons sugar
// 2 teaspoons baking powder
// 1/2 teaspoon salt
// 1 cup milk
// 1 large egg
// 2 tablespoons vegetable oil
// 
// Mix dry ingredients. Combine wet ingredients separately, then add to dry. 
// Cook on a greased griddle at =350°F for about =2 minutes per side until golden.
// 
// Makes 8 pancakes, =120 calories each.`;

  // Example recipes
  const exampleRecipes = {
    "": "",
    "Crepes": `* eggs: 12 large ones
* milk: 5.333 cups (1.2618 liters = 1282.19 grams whole milk or 1301.75 grams lactaid)
* flour: 3 cups scooped (440 grams for years, 420 grams most recently, 360 most likely intended, up to 375)
* butter: 8 tbsp melted (112 grams)
* salt: 2 tsp (14 grams) 

Yield: roughly 29 crepes`,
    "Chocolate Chip Cookies": `* 1 cup granulated sugar
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

Yield: 54 cookies, =117 cal (=17g carb) per cookie.`
  };

  // Set default recipe on initial load
  useEffect(() => {
    if (!recipeText && defaultRecipe) {
      setRecipeText(defaultRecipe);
    }
  }, []);

  // Helper function to convert fraction strings to decimal
  const parseFraction = (fractionStr) => {
    if (fractionStr.includes('/')) {
      const [numerator, denominator] = fractionStr.split('/');
      return parseFloat(numerator) / parseFloat(denominator);
    }
    return parseFloat(fractionStr);
  };

  // Parse the recipe text to identify all numbers
  useEffect(() => {
    if (!recipeText.trim()) {
      setParsedRecipe([]);
      setOriginalValues([]);
      return;
    }
    
    // Regular expression to find numbers (including fractions like 1/4) and numbers with = prefix
    // First group is the optional '=' prefix, second group is the number
    const numberRegex = /(?:(\=)?)(\d+(?:\.\d+)?(?:\/\d+)?)/g;
    
    const lines = recipeText.split('\n');
    const parsedLines = [];
    const original = [];
    
    lines.forEach((line, lineIndex) => {
      if (!line.trim()) {
        parsedLines.push({ id: `line-${lineIndex}`, content: line, segments: [{ text: line, isNumber: false }] });
        return;
      }
      
      let lastIndex = 0;
      const segments = [];
      let match;
      let matchIndex = 0;
      
      // Use exec for better control over capturing groups
      const regex = new RegExp(numberRegex);
      while ((match = regex.exec(line)) !== null) {
        const fullMatch = match[0];
        const equalsPrefix = match[1] || '';
        const numberStr = match[2];
        const startPos = match.index;
        const isConstant = equalsPrefix === '=';
        
        // Add text before the number
        if (startPos > lastIndex) {
          segments.push({ 
            text: line.substring(lastIndex, startPos), 
            isNumber: false 
          });
        }
        
        // Handle the number (either as editable field or constant)
        const value = parseFraction(numberStr);
        if (!isNaN(value)) {
          if (isConstant) {
            // Constant value (non-scaling) - render as text with the equals sign removed
            segments.push({
              text: numberStr,
              isNumber: false,
              isConstant: true
            });
          } else {
            // Regular scaling number - make it editable
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
          // Not a valid number - render as text
          segments.push({ 
            text: fullMatch, 
            isNumber: false 
          });
        }
        
        lastIndex = startPos + fullMatch.length;
        matchIndex++;
      }
      
      // Add any remaining text after the last number
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
    
    setParsedRecipe(parsedLines);
    setOriginalValues(original);
    setScalingFactor(1);
  }, [recipeText]);

  // Focus handler for input fields
  const handleFocus = (segmentId, value) => {
    setActiveField(segmentId);
    setEditingValue(value.toString());
  };

  // Blur handler for input fields
  const handleBlur = () => {
    if (activeField && editingValue) {
      // Apply the edit when leaving the field
      const numValue = parseFloat(editingValue);
      if (!isNaN(numValue) && numValue > 0) {
        handleNumberChange(activeField, numValue);
      }
    }
    setActiveField(null);
  };

  // Input change handler
  const handleInputChange = (e) => {
    setEditingValue(e.target.value);
  };

  // Key press handler for input fields
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    }
  };

  // Handle number change and scale all other numbers
  const handleNumberChange = (segmentId, newValue) => {
    const numValue = parseFloat(newValue);
    if (isNaN(numValue) || numValue <= 0) return;
    
    // Find the original value of this number to calculate scaling factor
    let originalIndex = -1;
    let originalValue = 0;
    
    // Find the segment in our parsed recipe
    for (const line of parsedRecipe) {
      for (const segment of line.segments) {
        if (segment.id === segmentId) {
          originalIndex = segment.originalIndex;
          break;
        }
      }
      if (originalIndex !== -1) break;
    }
    
    if (originalIndex === -1) return;
    originalValue = originalValues[originalIndex];
    
    // Calculate new scaling factor
    const newScalingFactor = numValue / originalValue;
    setScalingFactor(newScalingFactor);
  };

  // Reset to original values
  const resetScaling = () => {
    setScalingFactor(1);
  };

  // Load example recipe
  const handleExampleChange = (e) => {
    const selectedRecipe = e.target.value;
    setRecipeText(exampleRecipes[selectedRecipe]);
  };

  // Render a number field, handling active editing state
  const renderNumberField = (segment) => {
    const scaledValue = segment.value * scalingFactor;
    const isActive = activeField === segment.id;
    
    // Display the editing value if this field is active, otherwise format the scaled value
    let displayValue;
    if (isActive) {
      displayValue = editingValue;
    } else {
      // Simply use toFixed(4) - it will always limit to exactly 4 decimal places
      displayValue = scaledValue.toFixed(4).replace(/\.?0+$/, '');
      // If we ended up with just a decimal point at the end, remove it
      if (displayValue.endsWith('.')) {
        displayValue = displayValue.slice(0, -1);
      }
    }
    
    return (
      <input
        type="text"
        value={displayValue}
        onChange={handleInputChange}
        onFocus={() => handleFocus(segment.id, scaledValue)}
        onBlur={handleBlur}
        onKeyPress={handleKeyPress}
        className={`${styles['w-20']} ${styles['p-1']} ${styles.border} ${styles.rounded} ${styles['text-center']} ${styles['mx-1']}`}
      />
    );
  };

  // Render a constant (non-scaling) number with a subtle highlight
  const renderConstant = (segment) => {
    return (
      <span className={`${styles.constant} ${styles['px-1']} ${styles['py-0.5']}`} >{segment.text}</span>
    );
  };

  return (
    <div className={styles['reciplier-container']}> 
      <h1 className={`${styles['text-2xl']} ${styles['font-bold']} ${styles['mb-4']}`}>Reciplier</h1>
      
      <div className={styles['mb-6']}>
        <div className={`${styles.flex} ${styles['justify-between']} ${styles['items-center']} ${styles['mb-2']}`}>
          <select 
            onChange={handleExampleChange}
            className={`${styles['p-2']} ${styles.border} ${styles.rounded} ${styles['text-gray-700']}`}
            value=""
          >
            <option value="">Example Recipes</option>
            <option value="Crepes">Crepes</option>
            <option value="Chocolate Chip Cookies">Chocolate Chip Cookies</option>
          </select>
          
          <button 
            onClick={resetScaling}
            className={`${styles['text-sm']} ${styles['px-3']} ${styles['py-2']} ${styles.rounded} ${styles['ml-2']} ${styles['bg-gray-100']} ${styles['hover:bg-gray-200']} ${styles['text-gray-800']}`}
            disabled={scalingFactor === 1}
          >
            Reset Scaling
          </button>
        </div>
        <textarea 
          className={`${styles['w-full']} ${styles['p-3']} ${styles.border} ${styles.rounded} ${styles['h-40']}`}
          value={recipeText}
          onChange={(e) => setRecipeText(e.target.value)}
          placeholder="Paste your recipe here... (Tip: Add = before numbers that shouldn't scale, like =350 for oven temperature)"
        />
      </div>
      
      <div className={styles['mb-4']}>
        <div className={`${styles.flex} ${styles['items-center']} ${styles['justify-between']} ${styles['mb-2']}`}>
          <span className={`${styles['text-sm']} ${styles['font-medium']}`}>Scale Recipe:</span>
          <span className={`${styles['text-sm']} ${styles['font-bold']}`}>{scalingFactor.toFixed(1)}x</span>
        </div>
        <div className={`${styles.flex} ${styles['items-center']}`}>
          <span className={`${styles['text-xs']} ${styles['mr-2']}`}>0.1x</span>
          <input
            type="range"
            min="0.1"
            max="10"
            step="0.1"
            value={scalingFactor}
            onChange={(e) => setScalingFactor(parseFloat(e.target.value))}
            className={`${styles['flex-grow']} ${styles['h-2']} ${styles['bg-gray-200']} ${styles['rounded-lg']} ${styles['appearance-none']} ${styles['cursor-pointer']}`}
          />
          <span className={`${styles['text-xs']} ${styles['ml-2']}`}>10x</span>
        </div>
      </div>
      
      {parsedRecipe.length > 0 && (
        <div className={`${styles['bg-gray-50']} ${styles['p-4']} ${styles.rounded} ${styles['recipe-output']}`}>
          {parsedRecipe.map((line) => (
            <div key={line.id} className={styles['mb-2']}>
              <span className={`${styles['font-mono']} ${styles['text-base']}`}>
                {line.segments.map((segment, i) => (
                  segment.isNumber ? (
                    <span key={i} className={`${styles['inline-flex']} ${styles['items-center']}`}>
                      {renderNumberField(segment)}
                    </span>
                  ) : segment.isConstant ? (
                    <span key={i} className={`${styles['inline-flex']} ${styles['items-center']}`}>
                      {renderConstant(segment)}
                    </span>
                  ) : (
                    <span key={i}>{segment.text}</span>
                  )
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RecipeScaler;
