// NON-DRY WARNING: Master copy lives in H.M.S. Parsafore in the tminder repo.
function deoctalize(s) {
  if (s.includes('Z')) return "ERROR" // Z is our sentinel; maybe return null?
  s = s.replace(/\b0+(?!\d)/g, 'Z')   // replace NON-leading zeros with sentinel 
       .replace(/[1-9\.]0+/g, m => m.replace(/0/g, 'Z')) // save these too
       .replace(/0/g, '')             // throw away the rest of the zeros
       .replace(/Z/g, '0')            // turn sentinels back to zeros
  return s
}

// Evaluate an expression with given variable values, eg, ...
//function vareval(expr, vars) {
//}
