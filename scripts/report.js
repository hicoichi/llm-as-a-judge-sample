// 品質指標レポート生成スクリプト
// 各ツールをJSON出力モードで実行し、指標を集約してサマリーを出力する

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ツールの実行結果を安全に取得するラッパー
function runCommand(cmd) {
    try {
        return { stdout: execSync(cmd, { stdio: 'pipe' }).toString(), exitCode: 0 };
    } catch (e) {
        return { stdout: e.stdout ? e.stdout.toString() : '', exitCode: e.status ?? 1 };
    }
}

// テスト結果とカバレッジを収集する
function collectTestMetrics() {
    runCommand('npx jest --json --outputFile=jest_results.json --coverage --coverageReporters=json-summary');
    const tests = JSON.parse(fs.readFileSync('jest_results.json', 'utf8'));
    const cov = JSON.parse(fs.readFileSync('coverage/coverage-summary.json', 'utf8')).total;
    return {
        passed: tests.numPassedTests,
        failed: tests.numFailedTests,
        coverage: {
            statements: cov.statements.pct,
            branches: cov.branches.pct,
            functions: cov.functions.pct,
            lines: cov.lines.pct,
        },
    };
}

// ESLint の指標を収集する（エラー数・警告数・複雑度違反件数）
function collectLintMetrics() {
    runCommand('npx eslint lambda lib --format json --output-file eslint_results.json');
    const results = JSON.parse(fs.readFileSync('eslint_results.json', 'utf8'));
    let errors = 0, warnings = 0, complexityViolations = 0;
    for (const file of results) {
        for (const msg of file.messages) {
            if (msg.severity === 2) errors++;
            else if (msg.severity === 1) warnings++;
            if (msg.ruleId && /complexity/.test(msg.ruleId)) complexityViolations++;
        }
    }
    return { errors, warnings, complexityViolations };
}

// 型エラー数を収集する
function collectTypeMetrics() {
    const { stdout, exitCode } = runCommand('npx tsc --noEmit');
    if (exitCode === 0) return { errors: 0 };
    const errorLines = stdout.split('\n').filter(l => /error TS/.test(l));
    return { errors: errorLines.length };
}

// コード重複の指標を収集する
function collectDuplicationMetrics() {
    const outputDir = './jscpd-report';
    fs.mkdirSync(outputDir, { recursive: true });
    runCommand(`npx jscpd lambda lib --min-lines 5 --reporters json --output ${outputDir}`);
    const reportFile = path.join(outputDir, 'jscpd-report.json');
    if (!fs.existsSync(reportFile)) return { percentage: 0, clones: 0 };
    const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    return {
        percentage: report.statistics?.total?.percentage ?? 0,
        clones: report.statistics?.total?.clones ?? 0,
    };
}

// セキュリティ脆弱性の件数を収集する
function collectSecurityMetrics() {
    const { stdout } = runCommand('npm audit --json');
    try {
        const vuln = JSON.parse(stdout).metadata?.vulnerabilities ?? {};
        return {
            critical: vuln.critical ?? 0,
            high: vuln.high ?? 0,
            moderate: vuln.moderate ?? 0,
            low: vuln.low ?? 0,
        };
    } catch {
        return { critical: 0, high: 0, moderate: 0, low: 0 };
    }
}

// 未使用依存パッケージ数を収集する
function collectDepsMetrics() {
    const { stdout } = runCommand('npx depcheck --json');
    try {
        const result = JSON.parse(stdout);
        const unused = [...(result.dependencies ?? []), ...(result.devDependencies ?? [])];
        return { unusedCount: unused.length, unusedNames: unused };
    } catch {
        return { unusedCount: 0, unusedNames: [] };
    }
}

// 各指標を収集する
function collectAllMetrics() {
    console.log('指標を収集中...\n');
    return {
        timestamp: new Date().toISOString(),
        tests: collectTestMetrics(),
        lint: collectLintMetrics(),
        types: collectTypeMetrics(),
        duplication: collectDuplicationMetrics(),
        security: collectSecurityMetrics(),
        deps: collectDepsMetrics(),
    };
}

// 指標をコンソールに整形して出力する
function printReport(metrics) {
    const { tests, lint, types, duplication, security, deps } = metrics;
    const cov = tests.coverage;
    const line = '='.repeat(56);

    console.log(line);
    console.log(` Quality Report  ${metrics.timestamp}`);
    console.log(line);
    console.log(` Tests        ${tests.passed} passed  /  ${tests.failed} failed`);
    console.log(` Coverage     Stmts: ${cov.statements}%  Branch: ${cov.branches}%  Funcs: ${cov.functions}%  Lines: ${cov.lines}%`);
    console.log(` ESLint       ${lint.errors} errors  /  ${lint.warnings} warnings`);
    console.log(` Type errors  ${types.errors}`);
    console.log(` Complexity   ${lint.complexityViolations} violation(s)`);
    console.log(` Duplication  ${duplication.percentage.toFixed(2)}%  (${duplication.clones} clones)`);
    console.log(` Security     critical: ${security.critical}  high: ${security.high}  moderate: ${security.moderate}  low: ${security.low}`);
    console.log(` Unused deps  ${deps.unusedCount}`);
    console.log(line);
}

// メイン処理
const metrics = collectAllMetrics();
printReport(metrics);

// JSON形式でもファイルに保存する
fs.writeFileSync('report.json', JSON.stringify(metrics, null, 2));
console.log('\nreport.json に保存しました。');
