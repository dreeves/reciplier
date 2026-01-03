// This is so dumb but Javascript (among other languages) will interpret numbers
// with a leading zero and with no digits greater than 7 as octal. Eg, "010" is
// parsed as 8, not 10. Facepalm. So this function basically strips leading
// zeros. It does that by turning bare zeros or any zero in the middle or end of
// a number into a sentinel ('Z'), stripping out all other zeros, then turning
// the sentinels back to zeros. So it's a prereq that the string we're
// deoctalizing have no z's in it. Typically we do this to arithmetic
// expressions or amounts of time or times of day so we'll want to rethink this
// if we ever find that there's no single character we can guarantee won't occur
// in the input string.
// GPT-5 suggests a safer sentinel like const Z = '\uE000' but then we'd also
// have to change the final regex: .replace(new RegExp(Z, 'g'), '0')
function deoctalize(s) {
  if (s.includes('Z')) return "ERROR" // Z is our sentinel; maybe return null?
  s = s.replace(/\b0+(?!\d)/g, 'Z')   // replace NON-leading zeros with sentinel 
       .replace(/[1-9\.]0+/g, m => m.replace(/0/g, 'Z')) // save these too
       .replace(/0/g, '')             // throw away the rest of the zeros
       .replace(/Z/g, '0')            // turn sentinels back to zeros
  return s
}
// As a safety net, we could eval with "use strict" which throws an error for
// octal literals. So instead of x = eval(deoctalize(s)) we could do this:
// x = Function('"use strict"; return (' + deoctalize(s) + ')')()
// If we didn't think leading zeros would happen in practice we could drop the
// deoctalizing and just eval with "use strict" so it would fail loudly rather
// than be silently wrong.

// Eval but just return null if syntax error. 
// Obviously don't use serverside with user-supplied input.
// (See also the supposedly serverside-safe version in Omnibot.)
function laxeval(s) {
  try {
    const x = eval(deoctalize(s))
    // const x = Function('"use strict"; return (' + deoctalize(s) + ')')()
    return typeof x === 'undefined' ? null : x
  } catch(e) { return null }
}
