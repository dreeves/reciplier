/*
Quals (not tests).

Top-level runner that executes:
- utility quals (matheval, reciplogic utilities)
- parser quals (reciparse.js)
- solver quals (csolver.js)
- UI quals (Puppeteer)
*/

const { spawnSync } = require('node:child_process')
const path = require('node:path')

function runNode(scriptRelPath) {
	const scriptAbsPath = path.join(__dirname, scriptRelPath)
	return spawnSync(process.execPath, [scriptAbsPath], { stdio: 'inherit' })
}

const util = runNode('util_quals.js')
const parser = runNode('parser_quals.js')
const solver = runNode('solver_quals.js')
const ui = runNode('ui_quals.js')

const results = [
  { name: 'util_quals', result: util },
  { name: 'parser_quals', result: parser },
  { name: 'solver_quals', result: solver },
  { name: 'ui_quals', result: ui },
]

const failed = results.filter(r => r.result.status !== 0)
const allPassed = failed.length === 0

// Print unambiguous final summary (addresses AGENTS.md TODO about checking exit codes)
console.log('\n' + '='.repeat(60))
if (allPassed) {
  console.log('QUALS: ALL PASSED')
} else {
  console.log('QUALS: FAILED -', failed.map(r => r.name).join(', '))
}
console.log('='.repeat(60))

process.exitCode = allPassed ? 0 : 1
