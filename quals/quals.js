/*
Quals (not tests).

Top-level runner that executes:
- solver quals (Node)
- UI quals (Puppeteer)
*/

const { spawnSync } = require('node:child_process')
const path = require('node:path')

function runNode(scriptRelPath) {
	const scriptAbsPath = path.join(__dirname, scriptRelPath)
	return spawnSync(process.execPath, [scriptAbsPath], { stdio: 'inherit' })
}

const solver = runNode('solver_quals.js')
const ui = runNode('ui_quals.js')

process.exitCode = (solver.status === 0 && ui.status === 0) ? 0 : 1
