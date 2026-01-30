/*
Quals (not tests).

Top-level runner that executes:
- utility quals (matheval, reciplogic utilities)
- parser quals (reciparse.js)
- solver quals (csolver.js)
- UI quals (Puppeteer)
*/

const { spawn } = require('node:child_process')
const path = require('node:path')

// Parse "Passed: N" or "N passed" from output
function parsePassedCount(output) {
  // Match "Passed: 264" or "Passed: 89/89"
  const passedMatch = output.match(/Passed:\s*(\d+)/)
  if (passedMatch) return parseInt(passedMatch[1], 10)
  // Match "460 passed"
  const altMatch = output.match(/(\d+)\s+passed/)
  if (altMatch) return parseInt(altMatch[1], 10)
  return 0
}

function runNode(scriptRelPath) {
  return new Promise((resolve) => {
    const scriptAbsPath = path.join(__dirname, scriptRelPath)
    const child = spawn(process.execPath, [scriptAbsPath], {
      stdio: ['inherit', 'pipe', 'inherit']
    })
    let output = ''
    child.stdout.on('data', (data) => {
      const str = data.toString()
      output += str
      process.stdout.write(str)  // Stream output in real-time
    })
    child.on('close', (code) => {
      resolve({ status: code, output })
    })
  })
}

async function main() {
  const util = await runNode('util_quals.js')
  const parser = await runNode('parser_quals.js')
  const solver = await runNode('solver_quals.js')
  const ui = await runNode('ui_quals.js')

  const results = [
    { name: 'Utility', result: util, count: parsePassedCount(util.output) },
    { name: 'Parser', result: parser, count: parsePassedCount(parser.output) },
    { name: 'Solver', result: solver, count: parsePassedCount(solver.output) },
    { name: 'UI', result: ui, count: parsePassedCount(ui.output) },
  ]

  const failed = results.filter(r => r.result.status !== 0)
  const allPassed = failed.length === 0
  const totalPassed = results.reduce((sum, r) => sum + r.count, 0)

  // Print combined summary at the end
  console.log('\nQUALS SUMMARY')
  for (const r of results) {
    const status = r.result.status === 0 ? '✓' : '✗'
    console.log(`${status} ${r.name}: ${r.count} passed`)
  }
  console.log(`TOTAL: ${totalPassed} passed`)
  console.log('='.repeat(60))
  if (allPassed) {
    console.log('QUALS: ALL PASSED')
  } else {
    console.log('QUALS: FAILED -', failed.map(r => r.name).join(', '))
  }
  console.log('='.repeat(60))

  process.exitCode = allPassed ? 0 : 1
}

main()
