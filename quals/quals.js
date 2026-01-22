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

const allPassed = [util, parser, solver, ui].every(r => r.status === 0)
process.exitCode = allPassed ? 0 : 1
