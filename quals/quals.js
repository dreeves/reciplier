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

// Parse counts from output: "620 passed, 5 failed" or "Passed: 264"
function parseCounts(output) {
  let passed = 0
  let failed = 0

  // Match "620 passed, 5 failed"
  const bothMatch = output.match(/(\d+)\s+passed,\s*(\d+)\s+failed/)
  if (bothMatch) {
    passed = parseInt(bothMatch[1], 10)
    failed = parseInt(bothMatch[2], 10)
    return { passed, failed, total: passed + failed }
  }

  // Match "Passed: 264" and "Failed: 5" on separate lines
  const passedMatch = output.match(/Passed:\s*(\d+)/)
  const failedMatch = output.match(/Failed:\s*(\d+)/)
  if (passedMatch) {
    passed = parseInt(passedMatch[1], 10)
    failed = failedMatch ? parseInt(failedMatch[1], 10) : 0
    return { passed, failed, total: passed + failed }
  }

  // Match "460 passed" (old format)
  const altMatch = output.match(/(\d+)\s+passed/)
  if (altMatch) {
    passed = parseInt(altMatch[1], 10)
    return { passed, failed: 0, total: passed }
  }

  return { passed: 0, failed: 0, total: 0 }
}

// Extract first failure details from output
function extractFirstFailure(output) {
  const lines = output.split('\n')
  const i = lines.findIndex(l => l.startsWith('✗ '))
  if (i === -1) return null
  const line = lines[i].substring(2)

  // Indented labeled lines follow the ✗ line, e.g. "  Replicata: solvem(...)".
  // Old-style Expected/Got labels map onto expectata/resultata.
  const labelMap = { Replicata: 'replicata', Expectata: 'expectata',
                     Resultata: 'resultata', Expected: 'expectata',
                     Got: 'resultata' }
  const details = {}
  for (let j = i + 1; j < lines.length; j++) {
    const m = lines[j].match(/^\s+(Replicata|Expectata|Resultata|Expected|Got):\s*(.*)$/)
    if (!m) break
    const key = labelMap[m[1]]
    if (!(key in details)) details[key] = m[2].trim()
  }

  // Inline format: "name: expected X, got Y" (labeled lines take precedence)
  const inline = line.match(/^(.+?):\s*expected\s+(.+?),\s*got\s+(.+)$/)
  return {
    name: inline ? inline[1] : line,
    replicata: details.replicata ?? null,
    expectata: details.expectata ?? (inline ? inline[2] : null),
    resultata: details.resultata ?? (inline ? inline[3] : null),
  }
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
  console.log("Running util, parser, solver, and UI quals...\n")
  const util = await runNode('util_quals.js')
  const parser = await runNode('parser_quals.js')
  const solver = await runNode('solver_quals.js')
  const ui = await runNode('ui_quals.js')

  const results = [
    { name: 'Utility', result: util, counts: parseCounts(util.output) },
    { name: 'Parser', result: parser, counts: parseCounts(parser.output) },
    { name: 'Solver', result: solver, counts: parseCounts(solver.output) },
    { name: 'UI', result: ui, counts: parseCounts(ui.output) },
  ]

  const failed = results.filter(r => r.result.status !== 0)
  const allPassed = failed.length === 0
  const totalPassed = results.reduce((sum, r) => sum + r.counts.passed, 0)
  const totalCount = results.reduce((sum, r) => sum + r.counts.total, 0)

  // Print combined summary at the end
  console.log('\nQUALS SUMMARY')
  for (const r of results) {
    const status = r.result.status === 0 ? '✓' : '✗'
    console.log(`${status} ${r.name}: ${r.counts.passed}/${r.counts.total} passed`)
  }
  console.log(`TOTAL: ${totalPassed}/${totalCount} passed`)
  console.log('='.repeat(60))
  if (allPassed) {
    console.log('QUALS: ALL PASSED')
  } else {
    console.log('QUALS: FAILED -', failed.map(r => r.name).join(', '))

    // Show first failure details
    const firstFailed = failed[0]
    if (firstFailed) {
      const failure = extractFirstFailure(firstFailed.result.output)
      if (failure) {
        console.log('\nFirst failure details:')
        console.log(`Qual: ${failure.name}`)
        if (failure.replicata) console.log(`Replicata: ${failure.replicata}`)
        if (failure.expectata) console.log(`Expectata: ${failure.expectata}`)
        if (failure.resultata) console.log(`Resultata: ${failure.resultata}`)
      } else {
        // No parseable ✗ line -- the subprocess probably crashed. Show its
        // final output so the failure is still loud.
        console.log(`\n${firstFailed.name} quals crashed without a failure line; last output:`)
        console.log(firstFailed.result.output.trimEnd().split('\n').slice(-15).join('\n'))
      }
    }
  }
  console.log('='.repeat(60))

  process.exitCode = allPassed ? 0 : 1
}

main()
