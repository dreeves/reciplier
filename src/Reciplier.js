import React, { useState, useEffect } from 'react';
import styles from './Reciplier.module.css'; // Import the CSS module

// Helper function to format numbers for display
const formatDisplayNumber = (num) => {
  if (typeof num !== 'number' || isNaN(num)) {
    return ''; // Or some other placeholder for invalid numbers
  }
  let formatted = num.toFixed(4).replace(/\.?0+$/, '');
  if (formatted.endsWith('.')) {
    formatted = formatted.slice(0, -1);
  }
  return formatted;
};

const RecipeScaler = () => {
  const [recipeText, setRecipeText] = useState('');
  const [parsedRecipe, setParsedRecipe] = useState([]);
  const [originalValues, setOriginalValues] = useState([]);
  const [scalingFactor, setScalingFactor] = useState(1);
  const [activeField, setActiveField] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [currentExampleKey, setCurrentExampleKey] = useState("Shortcake"); // To track selected example
  
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
// Makes 8 pancakes, =120 calories each.

  // Example recipes
  const exampleRecipes = {
    "Shortcake": `\
Shortcake

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

Bake =30 to =40 minutes @ =325°F`,
    "Soule-Reeves Crepes": `\
* eggs: 12 large ones
* milk: 5.333 cups (1.2618 liters or 1300 grams)
* flour: 3 cups (400 grams)
* butter: 8 tbsp melted (112 grams)
* salt: 2 tsp (14 grams) 

Yield: roughly 29 crepes`,
    "Camelot Chocolate Chip Cookies": `\
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

Yield: 54 cookies, =117 cal (=17g carb) per cookie.`,
    "Blank": "",
  };

  // Set default recipe on initial load
  useEffect(() => {
    // Load Shortcake by default
    if (!recipeText && exampleRecipes["Shortcake"]) { // Check if Shortcake exists
      setRecipeText(exampleRecipes["Shortcake"]);
      setCurrentExampleKey("Shortcake");
    }
  }, []); // Empty dependency array means this runs once on mount

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
      // If recipeText is blank, update dropdown to show "Blank" or placeholder
      const blankKey = Object.keys(exampleRecipes).find(key => exampleRecipes[key] === recipeText.trim());
      if (blankKey) {
        setCurrentExampleKey(blankKey);
      } else {
        setCurrentExampleKey(""); // Set to placeholder if custom text not matching "Blank"
      }
      return;
    }
    
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
          if (isConstant) {
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
    
    setParsedRecipe(parsedLines);
    setOriginalValues(original);
    setScalingFactor(1);

    let matchingKey = "";
    for (const key in exampleRecipes) {
      if (exampleRecipes[key] === recipeText) {
        matchingKey = key;
        break;
      }
    }
    setCurrentExampleKey(matchingKey);

  }, [recipeText]);

  // Focus handler for input fields
  const handleFocus = (segmentId, value) => {
    setActiveField(segmentId);
    setEditingValue(formatDisplayNumber(value)); // Use helper
  };

  // Blur handler for input fields
  const handleBlur = () => {
    if (activeField && editingValue) {
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
    
    let originalIndex = -1;
    let originalValue = 0;
    
    for (const line of parsedRecipe) {
      for (const segment of line.segments) {
        if (segment.id === segmentId) {
          originalIndex = segment.originalIndex;
          break;
        }
      }
      if (originalIndex !== -1) break;
    }
    
    if (originalIndex === -1 || originalIndex >= originalValues.length) return; // Added boundary check
    originalValue = originalValues[originalIndex];
    
    if (originalValue === 0 && numValue !== 0) { // Avoid division by zero if original is 0 but new is not
        // Decide how to handle this case, e.g., set scaling factor to a default or based on other numbers
        // For now, let's just prevent division by zero and not scale
        console.warn("Original value is 0, cannot calculate scaling factor.");
        // Optionally, update the specific number directly without scaling others
        // This part needs careful consideration based on desired behavior
        const newParsedRecipe = parsedRecipe.map(line => ({
            ...line,
            segments: line.segments.map(seg => {
                if (seg.id === segmentId) {
                    return { ...seg, value: numValue }; // Directly update value
                }
                return seg;
            })
        }));
        setParsedRecipe(newParsedRecipe);
        // Update originalValues as well if this change should be the new base
        const newOriginalValues = [...originalValues];
        newOriginalValues[originalIndex] = numValue;
        setOriginalValues(newOriginalValues);
        return; 
    } else if (originalValue === 0 && numValue === 0) {
        // If both are zero, scaling factor remains unchanged (or 1 if it was reset)
        return;
    }


    const newScalingFactor = numValue / originalValue;
    setScalingFactor(newScalingFactor);
  };

  // Reset to original values
  const resetScaling = () => {
    setScalingFactor(1);
  };

  // Load example recipe
  const handleExampleChange = (e) => {
    const selectedKey = e.target.value;
    setCurrentExampleKey(selectedKey);
    if (exampleRecipes.hasOwnProperty(selectedKey)) {
      setRecipeText(exampleRecipes[selectedKey]);
    }
  };

  // Render a number field, handling active editing state
  const renderNumberField = (segment) => {
    const scaledValue = segment.value * scalingFactor;
    const isActive = activeField === segment.id;
    
    let displayValue;
    if (isActive) {
      displayValue = editingValue;
    } else {
      displayValue = formatDisplayNumber(scaledValue); // Use helper
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
            value={currentExampleKey} 
            className={`${styles['p-2']} ${styles.border} ${styles.rounded} ${styles['text-gray-700']}`}
          >
            {currentExampleKey === "" && <option value="" disabled>Example Recipes</option>}
            {Object.keys(exampleRecipes).map(key => (
              <option key={key} value={key}>
                {key === "Blank" ? "Blank -- paste any recipe below!" : key}
              </option>
            ))}
          </select>
          
          <button 
            onClick={resetScaling}
            className={`${styles['text-sm']} ${styles['px-3']} ${styles['py-2']} ${styles.rounded} ${styles['ml-2']} ${styles['bg-gray-100']} ${styles['hover:bg-gray-200']} ${styles['text-gray-800']}`}
            disabled={scalingFactor === 1 && currentExampleKey !== "" && exampleRecipes[currentExampleKey] === recipeText}
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
          {/* Use the helper function for scalingFactor display */}
          <span className={`${styles['text-sm']} ${styles['font-bold']}`}>{formatDisplayNumber(scalingFactor)}x</span>
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
