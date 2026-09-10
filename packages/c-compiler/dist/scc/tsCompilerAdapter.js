"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TsSccCompilerAdapter = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const assembler_1 = require("@mz80/assembler");
const fixtures_1 = require("./fixtures");
const tsFrontendLowering_1 = require("./tsFrontendLowering");
const tsFrontendParser_1 = require("./tsFrontendParser");
const tsFrontendSemantic_1 = require("./tsFrontendSemantic");
const tsPreprocessor_1 = require("./tsPreprocessor");
const tsProgram_1 = require("./tsProgram");
const translateAsm_1 = require("./translateAsm");
class TsSccCompilerAdapter {
    fixtureId;
    constructor(opts = {}) {
        this.fixtureId = opts.fixtureId;
    }
    compileToRel(logger, opts) {
        if (this.fixtureId) {
            return compileFromFixture(logger, opts, this.fixtureId);
        }
        return compileFromSource(logger, opts);
    }
}
exports.TsSccCompilerAdapter = TsSccCompilerAdapter;
function describeFixture(fixtureId) {
    const fixture = (0, fixtures_1.getSccFixture)(fixtureId);
    return `${fixture.id} [${fixture.features.join(", ")}]`;
}
function compileFromFixture(logger, opts, fixtureId) {
    const fixture = (0, fixtures_1.getSccFixture)(fixtureId);
    const resolvedInput = node_path_1.default.resolve(opts.inputFile);
    const stageRoot = node_path_1.default.resolve(opts.tempDir);
    const stem = sanitizeStageStem(node_path_1.default.basename(resolvedInput, node_path_1.default.extname(resolvedInput)).toLowerCase());
    const stageDir = node_path_1.default.join(stageRoot, stem);
    const preprocessedFile = node_path_1.default.join(stageDir, `${stem}.i`);
    const sccAsmFile = node_path_1.default.join(stageDir, `${stem}.scc.asm`);
    const asmFile = node_path_1.default.join(stageDir, `${stem}.asm`);
    const relFile = opts.outputRelFile ? node_path_1.default.resolve(opts.outputRelFile) : node_path_1.default.join(stageDir, `${stem}.rel`);
    node_fs_1.default.mkdirSync(stageDir, { recursive: true });
    node_fs_1.default.writeFileSync(preprocessedFile, `; fixture-backed TS compiler input for ${fixture.id}\n`, "utf8");
    node_fs_1.default.writeFileSync(sccAsmFile, emitFixtureBackedSccAsm(fixtureId), "utf8");
    node_fs_1.default.writeFileSync(asmFile, (0, translateAsm_1.translateSccAsm)(node_fs_1.default.readFileSync(sccAsmFile, "utf8"), { moduleName: node_path_1.default.basename(fixture.file) }), "utf8");
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(relFile), { recursive: true });
    const ctx = (0, assembler_1.assemble)(logger, asmFile, relFile, {
        relVersion: 2,
        verbose: opts.verbose,
        sym: opts.sym,
        lst: false,
        smap: opts.smap,
    });
    if (ctx.errors.length > 0) {
        throw new Error(`TS fixture assembly failed for ${fixture.id}: ${ctx.errors.map((entry) => entry.message).join("; ")}`);
    }
    return {
        inputFile: resolvedInput,
        preprocessedFile,
        sccAsmFile,
        asmFile,
        relFile,
        stageDir,
    };
}
function compileFromSource(logger, opts) {
    const resolvedInput = node_path_1.default.resolve(opts.inputFile);
    const stageRoot = node_path_1.default.resolve(opts.tempDir);
    const stem = sanitizeStageStem(node_path_1.default.basename(resolvedInput, node_path_1.default.extname(resolvedInput)).toLowerCase());
    const stageDir = node_path_1.default.join(stageRoot, stem);
    const preprocessedFile = node_path_1.default.join(stageDir, `${stem}.i`);
    const sccAsmFile = node_path_1.default.join(stageDir, `${stem}.scc.asm`);
    const asmFile = node_path_1.default.join(stageDir, `${stem}.asm`);
    const relFile = opts.outputRelFile ? node_path_1.default.resolve(opts.outputRelFile) : node_path_1.default.join(stageDir, `${stem}.rel`);
    const sourceText = node_fs_1.default.readFileSync(resolvedInput, "utf8");
    const preprocessed = (0, tsPreprocessor_1.preprocessTsCSource)(sourceText, resolvedInput, opts);
    const parsed = (0, tsFrontendParser_1.parseProgram)(preprocessed.sourceText, resolvedInput);
    const bound = (0, tsFrontendSemantic_1.analyzeProgram)(parsed, preprocessed.sourceText, resolvedInput, { runtimeVariadicNames: preprocessed.runtimeVariadicNames });
    const spec = (0, tsFrontendLowering_1.lowerSourceProgram)(bound, `${stem}.i`, preprocessed.sourceText, resolvedInput);
    node_fs_1.default.mkdirSync(stageDir, { recursive: true });
    node_fs_1.default.writeFileSync(preprocessedFile, preprocessed.sourceText, "utf8");
    node_fs_1.default.writeFileSync(sccAsmFile, (0, tsProgram_1.emitProgram)(spec), "utf8");
    node_fs_1.default.writeFileSync(asmFile, (0, translateAsm_1.translateSccAsm)(node_fs_1.default.readFileSync(sccAsmFile, "utf8"), { moduleName: node_path_1.default.basename(preprocessedFile) }), "utf8");
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(relFile), { recursive: true });
    const ctx = (0, assembler_1.assemble)(logger, asmFile, relFile, {
        relVersion: 2,
        verbose: opts.verbose,
        sym: opts.sym,
        lst: false,
        smap: opts.smap,
    });
    if (ctx.errors.length > 0) {
        throw new Error(`TS source assembly failed for ${resolvedInput}: ${ctx.errors.map((entry) => entry.message).join("; ")}`);
    }
    return {
        inputFile: resolvedInput,
        preprocessedFile,
        sccAsmFile,
        asmFile,
        relFile,
        stageDir,
    };
}
function sanitizeStageStem(stem) {
    return stem.replace(/[^a-z0-9_.$@]/gi, "_");
}
function parseSubsetProgram(sourceText) {
    const normalized = stripLineComments(sourceText);
    const functions = [];
    const headerPattern = /\b(int|char)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\{/g;
    let match;
    while ((match = headerPattern.exec(normalized)) !== null) {
        const bodyStart = headerPattern.lastIndex;
        const bodyEnd = findMatchingBraceIndex(normalized, bodyStart - 1);
        const bodyText = normalized.slice(bodyStart, bodyEnd);
        const parsedBody = parseSubsetBody(bodyText, match[2]);
        functions.push({
            name: match[2],
            returnType: match[1],
            params: parseSubsetParams(match[3], match[2]),
            locals: parsedBody.locals,
            body: parsedBody.statements,
        });
        headerPattern.lastIndex = bodyEnd + 1;
    }
    if (functions.length === 0) {
        throw new Error("TsSccCompilerAdapter Phase C subset could not find any supported function definitions.");
    }
    return { functions };
}
function stripLineComments(sourceText) {
    return sourceText.replace(/\/\/.*$/gm, "");
}
function findMatchingBraceIndex(sourceText, openBraceIndex) {
    let depth = 0;
    for (let index = openBraceIndex; index < sourceText.length; index += 1) {
        const ch = sourceText[index];
        if (ch === "{") {
            depth += 1;
            continue;
        }
        if (ch === "}") {
            depth -= 1;
            if (depth === 0) {
                return index;
            }
        }
    }
    throw new Error("TsSccCompilerAdapter Phase C subset found an unmatched '{' in source input.");
}
function parseSubsetBody(bodyText, functionName) {
    const trimmed = bodyText.trim();
    const ifElseIfBraceBlockMatch = /^if\s*\(([\s\S]+?)\)\s*\{([\s\S]*?)\}\s*else\s*(if[\s\S]+)$/.exec(trimmed);
    if (ifElseIfBraceBlockMatch) {
        const thenBranch = parseSubsetBranchBlock(ifElseIfBraceBlockMatch[2], functionName);
        const elseBranch = parseSubsetElseBody(ifElseIfBraceBlockMatch[3], functionName);
        return {
            locals: [...thenBranch.locals, ...elseBranch.locals],
            statements: [{
                    kind: "if",
                    condition: parseSubsetExpr(ifElseIfBraceBlockMatch[1], functionName),
                    thenBody: thenBranch.statements,
                    elseBody: elseBranch.statements,
                }],
        };
    }
    const ifElseIfReturnMatch = /^if\s*\(([\s\S]+?)\)\s*return\s+(.+?)\s*;\s*else\s*(if[\s\S]+)$/.exec(trimmed);
    if (ifElseIfReturnMatch) {
        const elseBranch = parseSubsetElseBody(ifElseIfReturnMatch[3], functionName);
        return {
            locals: elseBranch.locals,
            statements: [{
                    kind: "if",
                    condition: parseSubsetExpr(ifElseIfReturnMatch[1], functionName),
                    thenBody: [parseReturnStmt(ifElseIfReturnMatch[2], functionName)],
                    elseBody: elseBranch.statements,
                }],
        };
    }
    const ifElseBraceBlockMatch = /^if\s*\(([\s\S]+?)\)\s*\{([\s\S]*?)\}\s*else\s*\{([\s\S]*?)\}\s*$/.exec(trimmed);
    if (ifElseBraceBlockMatch) {
        const thenBranch = parseSubsetBranchBlock(ifElseBraceBlockMatch[2], functionName);
        const elseBranch = parseSubsetBranchBlock(ifElseBraceBlockMatch[3], functionName);
        return {
            locals: [...thenBranch.locals, ...elseBranch.locals],
            statements: [{
                    kind: "if",
                    condition: parseSubsetExpr(ifElseBraceBlockMatch[1], functionName),
                    thenBody: thenBranch.statements,
                    elseBody: elseBranch.statements,
                }],
        };
    }
    const ifFallthroughBraceBlockMatch = /^if\s*\(([\s\S]+?)\)\s*\{([\s\S]*?)\}\s*return\s+(.+?)\s*;?\s*$/.exec(trimmed);
    if (ifFallthroughBraceBlockMatch) {
        const thenBranch = parseSubsetBranchBlock(ifFallthroughBraceBlockMatch[2], functionName);
        return {
            locals: thenBranch.locals,
            statements: [{
                    kind: "if",
                    condition: parseSubsetExpr(ifFallthroughBraceBlockMatch[1], functionName),
                    thenBody: thenBranch.statements,
                    elseBody: [parseReturnStmt(ifFallthroughBraceBlockMatch[3], functionName)],
                }],
        };
    }
    const ifElseBraceMatch = /^if\s*\(([\s\S]+?)\)\s*\{\s*return\s+(.+?)\s*;\s*\}\s*else\s*\{\s*return\s+(.+?)\s*;\s*\}\s*;?\s*$/.exec(trimmed);
    if (ifElseBraceMatch) {
        return {
            locals: [],
            statements: [buildIfReturnStmt(ifElseBraceMatch[1], ifElseBraceMatch[2], ifElseBraceMatch[3], functionName)],
        };
    }
    const ifFallthroughBraceMatch = /^if\s*\(([\s\S]+?)\)\s*\{\s*return\s+(.+?)\s*;\s*\}\s*return\s+(.+?)\s*;?\s*$/.exec(trimmed);
    if (ifFallthroughBraceMatch) {
        return {
            locals: [],
            statements: [buildIfReturnStmt(ifFallthroughBraceMatch[1], ifFallthroughBraceMatch[2], ifFallthroughBraceMatch[3], functionName)],
        };
    }
    const ifElseMatch = /^if\s*\(([\s\S]+?)\)\s*return\s+(.+?)\s*;\s*else\s*return\s+(.+?)\s*;?\s*$/.exec(trimmed);
    if (ifElseMatch) {
        return {
            locals: [],
            statements: [buildIfReturnStmt(ifElseMatch[1], ifElseMatch[2], ifElseMatch[3], functionName)],
        };
    }
    const ifFallthroughMatch = /^if\s*\(([\s\S]+?)\)\s*return\s+(.+?)\s*;\s*return\s+(.+?)\s*;?\s*$/.exec(trimmed);
    if (ifFallthroughMatch) {
        return {
            locals: [],
            statements: [buildIfReturnStmt(ifFallthroughMatch[1], ifFallthroughMatch[2], ifFallthroughMatch[3], functionName)],
        };
    }
    const returnMatch = /^return\s+(.+?)\s*;?\s*$/.exec(trimmed);
    if (!returnMatch) {
        return parseSubsetStatementSequence(trimmed, functionName);
    }
    return { locals: [], statements: [parseReturnStmt(returnMatch[1], functionName)] };
}
function parseReturnStmt(exprText, functionName) {
    return {
        kind: "return",
        expr: parseSubsetExpr(exprText, functionName),
    };
}
function buildIfReturnStmt(conditionText, thenExprText, elseExprText, functionName) {
    return {
        kind: "if",
        condition: parseSubsetExpr(conditionText, functionName),
        thenBody: [parseReturnStmt(thenExprText, functionName)],
        elseBody: [parseReturnStmt(elseExprText, functionName)],
    };
}
function parseSubsetStatementSequence(bodyText, functionName) {
    const locals = [];
    const statements = [];
    for (const statementText of splitTopLevelStatements(bodyText)) {
        if (/^if\b/.test(statementText)) {
            const parsedIf = parseSubsetBody(statementText, functionName);
            locals.push(...parsedIf.locals);
            statements.push(...parsedIf.statements);
            continue;
        }
        if (/^while\b/.test(statementText)) {
            const parsedWhile = parseSubsetWhileStmt(statementText, functionName);
            locals.push(...parsedWhile.locals);
            statements.push(parsedWhile.statement);
            continue;
        }
        const localDeclMatch = /^(int|char)\s+([A-Za-z_]\w*)(?:\s*=\s*(.+))?$/.exec(statementText);
        if (localDeclMatch) {
            const local = {
                type: localDeclMatch[1],
                name: localDeclMatch[2],
            };
            locals.push(local);
            if (localDeclMatch[3]) {
                statements.push({
                    kind: "assign",
                    name: local.name,
                    expr: parseSubsetExpr(localDeclMatch[3], functionName),
                });
            }
            continue;
        }
        const assignMatch = /^([A-Za-z_]\w*)\s*=\s*(.+)$/.exec(statementText);
        if (assignMatch) {
            statements.push({
                kind: "assign",
                name: assignMatch[1],
                expr: parseSubsetExpr(assignMatch[2], functionName),
            });
            continue;
        }
        const returnMatch = /^return\s+(.+)$/.exec(statementText);
        if (returnMatch) {
            statements.push(parseReturnStmt(returnMatch[1], functionName));
            continue;
        }
        throw new Error(`TsSccCompilerAdapter Phase C subset does not support statement '${statementText}' in ${functionName}().`);
    }
    if (statements.length === 0) {
        throw new Error(`TsSccCompilerAdapter Phase C subset found no executable statements in ${functionName}().`);
    }
    return { locals, statements };
}
function parseSubsetBranchBlock(bodyText, functionName) {
    return parseSubsetStatementSequence(bodyText.trim(), functionName);
}
function parseSubsetElseBody(bodyText, functionName) {
    return parseSubsetBody(bodyText.trim(), functionName);
}
function parseSubsetWhileStmt(statementText, functionName) {
    const trimmed = statementText.trim();
    const braceMatch = /^while\s*\(([\s\S]+?)\)\s*\{([\s\S]*)\}$/.exec(trimmed);
    if (braceMatch) {
        const body = parseSubsetBranchBlock(braceMatch[2], functionName);
        return {
            locals: body.locals,
            statement: {
                kind: "while",
                condition: parseSubsetExpr(braceMatch[1], functionName),
                body: body.statements,
            },
        };
    }
    const singleStmtMatch = /^while\s*\(([\s\S]+?)\)\s*(.+)$/.exec(trimmed);
    if (!singleStmtMatch) {
        throw new Error(`TsSccCompilerAdapter Phase C subset could not parse while statement in ${functionName}().`);
    }
    const body = parseSubsetBranchBlock(singleStmtMatch[2], functionName);
    return {
        locals: body.locals,
        statement: {
            kind: "while",
            condition: parseSubsetExpr(singleStmtMatch[1], functionName),
            body: body.statements,
        },
    };
}
function parseSubsetExpr(exprText, functionName) {
    const trimmed = exprText.trim();
    const compareOp = findTopLevelCompareOp(trimmed);
    if (compareOp) {
        return {
            kind: "compare",
            left: parseSubsetExpr(trimmed.slice(0, compareOp.index), functionName),
            right: parseSubsetExpr(trimmed.slice(compareOp.index + compareOp.op.length), functionName),
            op: compareOp.op,
        };
    }
    if (/^\d+$/.test(trimmed)) {
        return { kind: "const", value: Number.parseInt(trimmed, 10) };
    }
    if (/^[A-Za-z_]\w*$/.test(trimmed)) {
        return { kind: "ref", name: trimmed };
    }
    const callMatch = /^([A-Za-z_]\w*)\s*\((.*)\)$/.exec(trimmed);
    if (callMatch) {
        return {
            kind: "call",
            target: callMatch[1],
            args: parseSubsetCallArgs(callMatch[2], functionName),
        };
    }
    throw new Error(`TsSccCompilerAdapter Phase C subset does not support expression '${trimmed}' in ${functionName}().`);
}
function parseSubsetCallArgs(argsText, functionName) {
    const trimmed = argsText.trim();
    if (trimmed.length === 0) {
        return [];
    }
    return splitTopLevelArgs(trimmed).map((arg) => parseSubsetExpr(arg, functionName));
}
function splitTopLevelArgs(argsText) {
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let index = 0; index < argsText.length; index += 1) {
        const ch = argsText[index];
        if (ch === "(") {
            depth += 1;
            continue;
        }
        if (ch === ")") {
            depth -= 1;
            continue;
        }
        if (ch === "," && depth === 0) {
            parts.push(argsText.slice(start, index).trim());
            start = index + 1;
        }
    }
    parts.push(argsText.slice(start).trim());
    return parts.filter((part) => part.length > 0);
}
function splitTopLevelStatements(bodyText) {
    const parts = [];
    let parenDepth = 0;
    let braceDepth = 0;
    let start = 0;
    for (let index = 0; index < bodyText.length; index += 1) {
        const ch = bodyText[index];
        if (ch === "(") {
            parenDepth += 1;
            continue;
        }
        if (ch === ")") {
            parenDepth -= 1;
            continue;
        }
        if (ch === "{") {
            braceDepth += 1;
            continue;
        }
        if (ch === "}") {
            braceDepth -= 1;
            if (braceDepth === 0) {
                let nextIndex = index + 1;
                while (nextIndex < bodyText.length && /\s/.test(bodyText[nextIndex])) {
                    nextIndex += 1;
                }
                if (nextIndex < bodyText.length && !bodyText.startsWith("else", nextIndex) && bodyText[nextIndex] !== ";") {
                    const statement = bodyText.slice(start, index + 1).trim();
                    if (statement.length > 0) {
                        parts.push(statement);
                    }
                    start = nextIndex;
                    index = nextIndex - 1;
                }
            }
            continue;
        }
        if (ch === ";" && parenDepth === 0 && braceDepth === 0) {
            let nextIndex = index + 1;
            while (nextIndex < bodyText.length && /\s/.test(bodyText[nextIndex])) {
                nextIndex += 1;
            }
            if (bodyText.startsWith("else", nextIndex)) {
                continue;
            }
            const statement = bodyText.slice(start, index).trim();
            if (statement.length > 0) {
                parts.push(statement);
            }
            start = index + 1;
        }
    }
    const tail = bodyText.slice(start).trim();
    if (tail.length > 0) {
        parts.push(tail);
    }
    return parts;
}
function findTopLevelCompareOp(exprText) {
    let depth = 0;
    for (let index = 0; index < exprText.length; index += 1) {
        const ch = exprText[index];
        if (ch === "(") {
            depth += 1;
            continue;
        }
        if (ch === ")") {
            depth -= 1;
            continue;
        }
        if (depth !== 0) {
            continue;
        }
        const twoChar = exprText.slice(index, index + 2);
        if (twoChar === "==" || twoChar === "!=" || twoChar === ">=" || twoChar === "<=") {
            return { index, op: twoChar };
        }
        if (ch === ">" || ch === "<") {
            return { index, op: ch };
        }
    }
    return null;
}
function parseSubsetParams(paramsText, functionName) {
    const trimmed = paramsText.trim();
    if (trimmed.length === 0) {
        return [];
    }
    return splitTopLevelArgs(trimmed).map((part) => parseSubsetParam(part, functionName));
}
function parseSubsetParam(paramText, functionName) {
    const match = /^(int|char)\s+([A-Za-z_]\w*)$/.exec(paramText.trim());
    if (!match) {
        throw new Error(`TsSccCompilerAdapter Phase C subset does not support parameter '${paramText.trim()}' in ${functionName}().`);
    }
    return {
        type: match[1],
        name: match[2],
    };
}
function lowerSourceProgram(program, moduleName) {
    validateSourceProgram(program);
    const definedFunctions = new Set(program.functions.map((fn) => fn.name));
    const externs = new Set();
    const signatureMap = new Map(program.functions.map((fn) => [fn.name, fn.params]));
    const loweredFunctions = program.functions.map((fn) => lowerSourceFunction(fn, externs, definedFunctions, signatureMap));
    return {
        moduleName,
        exports: definedFunctions.has("main") ? ["main"] : [],
        externs: Array.from(externs),
        functions: loweredFunctions,
        includeBss: true,
    };
}
function validateSourceProgram(program) {
    const seenFunctions = new Set();
    for (const fn of program.functions) {
        if (seenFunctions.has(fn.name)) {
            throw new Error(`TsSccCompilerAdapter Phase C subset does not support duplicate function '${fn.name}()'.`);
        }
        seenFunctions.add(fn.name);
        validateSourceFunctionSymbols(fn);
    }
}
function validateSourceFunctionSymbols(fn) {
    const seenParams = new Set();
    for (const param of fn.params) {
        if (seenParams.has(param.name)) {
            throw new Error(`TsSccCompilerAdapter Phase C subset does not support duplicate parameter '${param.name}' in ${fn.name}().`);
        }
        seenParams.add(param.name);
    }
    const seenLocals = new Set();
    for (const local of fn.locals) {
        if (seenParams.has(local.name)) {
            throw new Error(`TsSccCompilerAdapter Phase C subset does not support local '${local.name}' shadowing a parameter in ${fn.name}().`);
        }
        if (seenLocals.has(local.name)) {
            throw new Error(`TsSccCompilerAdapter Phase C subset does not support duplicate local '${local.name}' in ${fn.name}().`);
        }
        seenLocals.add(local.name);
    }
}
function lowerSourceFunction(fn, externs, definedFunctions, signatureMap) {
    const paramSlots = new Map(fn.params.map((param, index) => [param.name, { slot: index, width: scalarTypeWidth(param.type) }]));
    const localSlots = new Map(fn.locals.map((local, index) => [local.name, { slot: index, width: scalarTypeWidth(local.type) }]));
    return lowerFunctionIR({
        name: fn.name,
        params: fn.params.map((param) => scalarTypeWidth(param.type)),
        locals: fn.locals.map((local) => scalarTypeWidth(local.type)),
        body: fn.body.map((stmt) => lowerSourceStmt(stmt, externs, definedFunctions, signatureMap, paramSlots, localSlots)),
    });
}
function lowerSourceStmt(stmt, externs, definedFunctions, signatureMap, paramSlots, localSlots) {
    switch (stmt.kind) {
        case "return":
            return { kind: "returnExpr", expr: lowerSourceExpr(stmt.expr, externs, definedFunctions, signatureMap, paramSlots, localSlots) };
        case "if":
            return {
                kind: "ifExprZero",
                expr: lowerSourceExpr(stmt.condition, externs, definedFunctions, signatureMap, paramSlots, localSlots),
                thenBody: stmt.thenBody.map((entry) => lowerSourceStmt(entry, externs, definedFunctions, signatureMap, paramSlots, localSlots)),
                elseBody: stmt.elseBody.map((entry) => lowerSourceStmt(entry, externs, definedFunctions, signatureMap, paramSlots, localSlots)),
            };
        case "while": {
            const loweredCondition = lowerSourceExpr(stmt.condition, externs, definedFunctions, signatureMap, paramSlots, localSlots);
            const loweredBody = stmt.body.map((entry) => lowerSourceStmt(entry, externs, definedFunctions, signatureMap, paramSlots, localSlots));
            return {
                kind: "ifExprZero",
                expr: loweredCondition,
                thenBody: [{
                        kind: "doWhileExprNonZero",
                        body: loweredBody,
                        expr: loweredCondition,
                    }],
                elseBody: [],
            };
        }
        case "assign": {
            const slot = localSlots.get(stmt.name);
            if (!slot) {
                throw new Error(`TsSccCompilerAdapter Phase C subset only supports assignment to local symbols, got '${stmt.name}'.`);
            }
            if (stmt.expr.kind === "const") {
                return {
                    kind: "assignLocalConst",
                    slot: slot.slot,
                    width: slot.width,
                    value: stmt.expr.value,
                };
            }
            return {
                kind: "assignLocalExpr",
                slot: slot.slot,
                width: slot.width,
                expr: lowerSourceExpr(stmt.expr, externs, definedFunctions, signatureMap, paramSlots, localSlots),
            };
        }
        default:
            return assertNever(stmt);
    }
}
function lowerSourceExpr(expr, externs, definedFunctions, signatureMap, paramSlots, localSlots) {
    switch (expr.kind) {
        case "const":
            return { kind: "const", value: expr.value };
        case "ref": {
            const localSlot = localSlots.get(expr.name);
            if (localSlot) {
                return { kind: "ref", scope: "local", width: localSlot.width, slot: localSlot.slot };
            }
            const paramSlot = paramSlots.get(expr.name);
            if (!paramSlot) {
                throw new Error(`TsSccCompilerAdapter Phase C subset does not know symbol '${expr.name}'.`);
            }
            return { kind: "ref", scope: "arg", width: paramSlot.width, slot: paramSlot.slot };
        }
        case "compare": {
            const helper = compareOpToHelper(expr.op);
            externs.add(helper);
            return {
                kind: "compare",
                left: lowerSourceExpr(expr.left, externs, definedFunctions, signatureMap, paramSlots, localSlots),
                right: lowerSourceExpr(expr.right, externs, definedFunctions, signatureMap, paramSlots, localSlots),
                helper,
            };
        }
        case "call":
            if (!definedFunctions.has(expr.target)) {
                externs.add(expr.target);
            }
            const calleeParams = signatureMap.get(expr.target);
            if (calleeParams && calleeParams.length !== expr.args.length) {
                throw new Error(`TsSccCompilerAdapter Phase C subset expected ${calleeParams.length} argument(s) for ${expr.target}(), got ${expr.args.length}.`);
            }
            return {
                kind: "call",
                target: expr.target,
                args: expr.args.map((arg) => lowerSourceExpr(arg, externs, definedFunctions, signatureMap, paramSlots, localSlots)),
            };
        default:
            return assertNever(expr);
    }
}
function scalarTypeWidth(type) {
    return type === "char" ? 1 : 2;
}
function compareOpToHelper(op) {
    switch (op) {
        case "==":
            return ".eq";
        case "!=":
            return ".ne";
        case ">":
            return ".gt";
        case "<":
            return ".lt";
        case ">=":
            return ".ge";
        case "<=":
            return ".le";
        default:
            return assertNever(op);
    }
}
function emitFixtureBackedSccAsm(fixtureId) {
    const spec = makeFixtureProgramSpec(fixtureId);
    if (spec)
        return emitProgram(spec);
    return (0, fixtures_1.readSccFixture)(fixtureId);
}
function makeFixtureProgramSpec(fixtureId) {
    switch (fixtureId) {
        case "frag-helper-call-scc":
            return {
                moduleName: "frag_helper_call.i",
                exports: [".gint", "main"],
                includeBss: true,
                functions: [lowerFunctionIR({
                        name: "main",
                        params: [],
                        locals: [],
                        body: [
                            { kind: "returnExpr", expr: { kind: "call", target: ".gint" } },
                        ],
                    })],
            };
        default:
            return null;
    }
}
function emitProgram(spec) {
    const lines = [];
    const exports = spec.exports ?? [];
    for (const exp of exports) {
        lines.push(`\t.globl\t${exp}`);
    }
    for (const ext of spec.externs ?? []) {
        lines.push(`\t.globl\t${ext}`);
    }
    lines.push(`\t.module\t${spec.moduleName}`);
    lines.push("\t.area\t_CODE");
    for (const fn of spec.functions) {
        lines.push(...emitFunction(fn));
    }
    if (spec.data && spec.data.length > 0) {
        lines.push("\t.area\t_DATA");
        for (const item of spec.data) {
            lines.push(`${item.label}:\t${item.directive}\t${item.value}`);
        }
    }
    if (spec.includeBss) {
        lines.push("\t.area\t_BSS");
    }
    lines.push("");
    return lines.join("\n");
}
function lowerFunctionIR(fn) {
    const layout = layoutFunction(fn);
    const state = { nextLabelId: 2 };
    const statements = [];
    if (layout.localBytes > 0) {
        statements.push({ kind: "reserveBytes", count: layout.localBytes });
    }
    for (const stmt of fn.body) {
        statements.push(...lowerStmtIR(stmt, layout, state));
    }
    return {
        name: fn.name,
        statements,
    };
}
function lowerStmtIR(stmt, layout, state) {
    switch (stmt.kind) {
        case "assignLocalConst": {
            const offset = getLocalOffset(layout, stmt.slot);
            return stmt.width === 1
                ? [{ kind: "storeImmToLocal", offset, value: stmt.value }]
                : [{ kind: "storeImm16ToLocal", offset, value: stmt.value }];
        }
        case "assignLocalExpr": {
            const offset = getLocalOffset(layout, stmt.slot);
            const expr = lowerExprIR(stmt.expr, layout);
            return stmt.width === 1
                ? [{ kind: "storeExprToLocalByte", offset, expr }]
                : [{ kind: "storeExprToLocalWord", offset, expr }];
        }
        case "compareReturn": {
            const statements = [
                {
                    kind: "compareExprHelper",
                    left: lowerExprIR(stmt.left, layout),
                    right: lowerExprIR(stmt.right, layout),
                    helper: stmt.helper,
                },
            ];
            if (layout.localBytes > 0) {
                statements.push({ kind: "releaseBytes", count: layout.localBytes });
            }
            statements.push({ kind: "ret" });
            return statements;
        }
        case "returnExpr": {
            const statements = [
                { kind: "loadExprHl", expr: lowerExprIR(stmt.expr, layout) },
            ];
            if (layout.localBytes > 0) {
                statements.push({ kind: "releaseBytes", count: layout.localBytes });
            }
            statements.push({ kind: "ret" });
            return statements;
        }
        case "returnVoid": {
            const statements = [];
            if (layout.localBytes > 0) {
                statements.push({ kind: "releaseBytes", count: layout.localBytes });
            }
            statements.push({ kind: "ret" });
            return statements;
        }
        case "emitExprChar":
            return [
                { kind: "loadExprHl", expr: lowerExprIR(stmt.expr, layout) },
                { kind: "pushHlArg" },
                { kind: "callWithModeA", target: "outchar", mode: 1 },
                { kind: "popBc" },
            ];
        case "callModeAArg":
            return [
                { kind: "loadExprHl", expr: lowerExprIR(stmt.expr, layout) },
                { kind: "pushHlArg" },
                { kind: "callWithModeA", target: stmt.target, mode: stmt.mode },
                { kind: "popBc" },
            ];
        case "decLocalByte":
            return [{ kind: "decLocalByte", offset: getLocalOffset(layout, stmt.slot) }];
        case "emitChar":
            return [
                { kind: "loadConstHl", value: stmt.value },
                { kind: "pushHlArg" },
                { kind: "callWithModeA", target: "outchar", mode: 1 },
                { kind: "popBc" },
            ];
        case "doWhileExprNonZero": {
            const loopLabel = allocateNumericLabel(state);
            const endLabel = allocateNumericLabel(state);
            return [
                { kind: "label", name: loopLabel },
                ...stmt.body.flatMap((entry) => lowerStmtIR(entry, layout, state)),
                { kind: "loadExprHl", expr: lowerExprIR(stmt.expr, layout) },
                { kind: "truthJumpZero", target: endLabel },
                { kind: "jump", target: loopLabel },
                { kind: "label", name: endLabel },
            ];
        }
        case "ifExprZero": {
            const elseLabel = allocateNumericLabel(state);
            const endLabel = allocateNumericLabel(state);
            return [
                { kind: "loadExprHl", expr: lowerExprIR(stmt.expr, layout) },
                { kind: "truthJumpZero", target: elseLabel },
                ...stmt.thenBody.flatMap((entry) => lowerStmtIR(entry, layout, state)),
                { kind: "jump", target: endLabel },
                { kind: "label", name: elseLabel },
                ...stmt.elseBody.flatMap((entry) => lowerStmtIR(entry, layout, state)),
                { kind: "label", name: endLabel },
            ];
        }
        default:
            return assertNever(stmt);
    }
}
function allocateNumericLabel(state) {
    const label = `.${state.nextLabelId}`;
    state.nextLabelId += 1;
    return label;
}
function lowerExprIR(expr, layout) {
    switch (expr.kind) {
        case "const":
            return { kind: "const", value: expr.value };
        case "dataAddress":
            return { kind: "dataAddress", label: expr.label };
        case "compare":
            return {
                kind: "compare",
                left: lowerExprIR(expr.left, layout),
                right: lowerExprIR(expr.right, layout),
                helper: expr.helper,
            };
        case "call":
            return {
                kind: "call",
                target: expr.target,
                args: expr.args?.map((arg) => lowerExprIR(arg, layout)),
            };
        case "ref":
            return lowerRefIR(expr, layout);
        default:
            return assertNever(expr);
    }
}
function lowerRefIR(ref, layout) {
    const offset = ref.scope === "local"
        ? getLocalOffset(layout, ref.slot)
        : getParamOffset(layout, ref.slot);
    if (ref.scope === "local") {
        return ref.width === 1
            ? { kind: "localChar", offset }
            : { kind: "localInt", offset };
    }
    return ref.width === 1
        ? { kind: "argChar", offset }
        : { kind: "argInt", offset };
}
function layoutFunction(fn) {
    const localOffsets = [];
    let localRunning = 0;
    for (const width of fn.locals) {
        localOffsets.push(localRunning);
        localRunning += width;
    }
    const localBytes = localRunning;
    const paramOffsets = [];
    for (let index = 0; index < fn.params.length; index += 1) {
        let trailing = 0;
        for (let next = index + 1; next < fn.params.length; next += 1) {
            trailing += getParamStackBytes(fn.params[next]);
        }
        paramOffsets.push(localBytes + 2 + trailing);
    }
    return { localBytes, localOffsets, paramOffsets };
}
function getParamStackBytes(_width) {
    return 2;
}
function getLocalOffset(layout, slot) {
    return layout.localOffsets[slot] ?? 0;
}
function getParamOffset(layout, slot) {
    return layout.paramOffsets[slot] ?? 0;
}
function emitFunction(fn) {
    const lines = [`${fn.name}:`];
    for (const statement of fn.statements) {
        lines.push(...emitStatement(statement, { stackDelta: 0 }));
    }
    return lines;
}
function emitStatement(statement, ctx) {
    switch (statement.kind) {
        case "call":
            return emitCall(statement.target);
        case "loadConstHl":
            return emitExprToHl({ kind: "const", value: statement.value }, ctx);
        case "loadDataAddressHl":
            return emitExprToHl({ kind: "dataAddress", label: statement.label }, ctx);
        case "loadExprHl":
            return emitExprToHl(statement.expr, ctx);
        case "pushExprArg":
            return emitPushArgs([statement.expr], ctx);
        case "pushHlArg":
            return emitPushHlArg();
        case "popBc":
            return emitPopBc();
        case "ret":
            return emitRet();
        case "callWithModeA":
            return emitCallWithModeA(statement.target, statement.mode);
        case "truthJumpZero":
            return emitTruthJumpZero(statement.target);
        case "label":
            return emitLabel(statement.name);
        case "jump":
            return emitJump(statement.target);
        case "decSp":
            return emitReserveBytes(1);
        case "incSp":
            return emitReleaseBytes(1);
        case "reserveBytes":
            return emitReserveBytes(statement.count);
        case "releaseBytes":
            return emitReleaseBytes(statement.count);
        case "loadLocalAddrHl":
            return emitLoadLocalAddrToHl(statement.offset, ctx);
        case "storeImmToLocal":
            return emitStoreImm8ToLocal(statement.offset, statement.value, ctx);
        case "storeExprToLocalByte":
            return emitStoreExprToLocalByte(statement.offset, statement.expr, ctx);
        case "loadLocalCharToHl":
            return emitExprToHl({ kind: "localChar", offset: statement.offset }, ctx);
        case "storeImm16ToLocal":
            return emitStoreImm16ToLocal(statement.offset, statement.value, ctx);
        case "storeExprToLocalWord":
            return emitStoreExprToLocalWord(statement.offset, statement.expr, ctx);
        case "loadLocalIntToHl":
            return emitExprToHl({ kind: "localInt", offset: statement.offset }, ctx);
        case "decLocalByte":
            return emitDecLocalByte(statement.offset, ctx);
        case "compareExprHelper":
            return emitHelperCompare(statement.left, statement.right, statement.helper, ctx);
        default:
            return assertNever(statement);
    }
}
function emitExprToHl(expr, ctx) {
    switch (expr.kind) {
        case "const":
            return emitConstToHl(expr.value);
        case "dataAddress":
            return emitSymbolAddressToHl(expr.label);
        case "call":
            return emitCallExpr(expr.target, expr.args ?? [], ctx);
        case "compare":
            return emitHelperCompare(expr.left, expr.right, expr.helper, ctx);
        case "localChar":
            return emitLoadLocalByteToHl(expr.offset, ctx);
        case "localInt":
            return emitLoadLocalWordToHl(expr.offset, ctx);
        case "argChar":
            return emitLoadArgByteToHl(expr.offset, ctx);
        case "argInt":
            return emitLoadArgWordToHl(expr.offset, ctx);
        default:
            return assertNever(expr);
    }
}
function emitCall(target) {
    return [`\tcall\t${target}`];
}
function emitCallExpr(target, args, ctx) {
    if (args.length === 0) {
        return emitCall(target);
    }
    return [
        ...emitPushArgs(args, ctx),
        ...emitCall(target),
        ...Array.from({ length: args.length }, () => emitPopBc()).flat(),
    ];
}
function emitRet() {
    return ["\tret"];
}
function emitLabel(name) {
    return [`${name}:`];
}
function emitJump(target) {
    return [`\tjp\t${target}`];
}
function emitCallWithModeA(target, mode) {
    return [`\tld\ta,#${mode}`, `\tcall\t${target}`];
}
function emitTruthJumpZero(target) {
    return ["\tld\ta,h", "\tor\tl", `\tjp\tz,${target}`];
}
function emitPushHlArg() {
    return ["\tpush\thl"];
}
function emitPopBc() {
    return ["\tpop\tbc"];
}
function emitPushArgs(args, ctx) {
    const lines = [];
    let stackDelta = ctx.stackDelta;
    for (const expr of args) {
        lines.push(...emitExprToHl(expr, { ...ctx, stackDelta }));
        lines.push(...emitPushHlArg());
        stackDelta += 2;
    }
    return lines;
}
function emitReserveBytes(count) {
    return Array.from({ length: count }, () => "\tdec\tsp");
}
function emitReleaseBytes(count) {
    return Array.from({ length: count }, () => "\tinc\tsp");
}
function emitConstToHl(value) {
    return [`\tld\thl,#${value}`];
}
function emitSymbolAddressToHl(label) {
    return [`\tld\thl,#${label}+0`];
}
function emitLoadLocalAddrToHl(offset, ctx) {
    return emitLoadStackAddrToHl(offset, ctx);
}
function emitLoadStackAddrToHl(offset, ctx) {
    return [`\tld\thl,#${offset + ctx.stackDelta}`, "\tadd\thl,sp"];
}
function emitLoadStackByteToHl(offset, ctx) {
    return [
        ...emitLoadStackAddrToHl(offset, ctx),
        "\tld\tl,(hl)",
        "\tld\th,#0",
    ];
}
function emitLoadStackWordToHl(offset, ctx) {
    return [
        ...emitLoadStackAddrToHl(offset, ctx),
        "\tld\ta,(hl)",
        "\tinc\thl",
        "\tld\th,(hl)",
        "\tld\tl,a",
    ];
}
function emitLoadLocalByteToHl(offset, ctx) {
    return emitLoadStackByteToHl(offset, ctx);
}
function emitLoadLocalWordToHl(offset, ctx) {
    return emitLoadStackWordToHl(offset, ctx);
}
function emitLoadArgByteToHl(offset, ctx) {
    return emitLoadStackByteToHl(offset, ctx);
}
function emitLoadArgWordToHl(offset, ctx) {
    return emitLoadStackWordToHl(offset, ctx);
}
function emitStoreImm8ToLocal(offset, value, ctx) {
    return [
        ...emitLoadLocalAddrToHl(offset, ctx),
        `\tld\t(hl),#${value}`,
    ];
}
function emitStoreExprToLocalByte(offset, expr, ctx) {
    return [
        ...emitExprToHl(expr, ctx),
        "\tpush\thl",
        ...emitLoadLocalAddrToHl(offset, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
        "\tpop\tde",
        "\tld\t(hl),e",
    ];
}
function emitStoreImm16ToLocal(offset, value, ctx) {
    return [
        ...emitLoadLocalAddrToHl(offset, ctx),
        `\tld\t(hl),#${value & 0xff}`,
        "\tinc\thl",
        `\tld\t(hl),#${(value >> 8) & 0xff}`,
    ];
}
function emitStoreExprToLocalWord(offset, expr, ctx) {
    return [
        ...emitExprToHl(expr, ctx),
        "\tpush\thl",
        ...emitLoadLocalAddrToHl(offset, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
        "\tpop\tde",
        "\tld\t(hl),e",
        "\tinc\thl",
        "\tld\t(hl),d",
    ];
}
function emitDecLocalByte(offset, ctx) {
    return [
        ...emitLoadLocalAddrToHl(offset, ctx),
        "\tdec\t(hl)",
    ];
}
function emitHelperCompare(left, right, helper, ctx) {
    return [
        ...emitExprToHl(left, ctx),
        ...emitPushHlArg(),
        ...emitExprToHl(right, { ...ctx, stackDelta: ctx.stackDelta + 2 }),
        "\tpop\tde",
        `\tcall\t${helper}`,
    ];
}
function assertNever(value) {
    throw new Error(`Unhandled statement kind: ${JSON.stringify(value)}`);
}
