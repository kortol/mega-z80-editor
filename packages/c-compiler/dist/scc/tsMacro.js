"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokens = tokens;
exports.expand = expand;
exports.evaluateCondition = evaluateCondition;
exports.stripComments = stripComments;
function tokens(source) {
    const result = source.match(/\s+|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[A-Za-z_]\w*|0[xX][\da-fA-F]+[uUlL]*|\d+[uUlL]*|\.\.\.|<<=|>>=|##|\+\+|--|->|&&|\|\||<<|>>|<=|>=|==|!=|[+*/%&|^=-]=|[^\s]/g) ?? [];
    return result.filter((token) => !/^\s+$/.test(token));
}
function expand(source, macros, disabled = new Set(), depth = 0) {
    if (depth > 100)
        throw new Error("Preprocessor macro expansion nesting limit exceeded.");
    const input = tokens(source);
    const output = [];
    let search = 0;
    const spans = input.map((token) => {
        const start = source.indexOf(token, search);
        search = start + token.length;
        return { start, end: search };
    });
    let copied = 0;
    for (let index = 0; index < input.length; index++) {
        const name = input[index];
        const macro = disabled.has(name) ? undefined : macros.get(name);
        if (!macro || (macro.params && input[index + 1] !== "("))
            continue;
        output.push(source.slice(copied, spans[index].start));
        let body = tokens(macro.body);
        if (macro.params) {
            const args = [[]];
            const rawArgs = [];
            let level = 0;
            let argumentStart = spans[index + 1].end;
            index += 2;
            for (; index < input.length; index++) {
                const token = input[index];
                if (token === ")" && level === 0) {
                    rawArgs.push(source.slice(argumentStart, spans[index].start));
                    break;
                }
                if (token === "," && level === 0) {
                    rawArgs.push(source.slice(argumentStart, spans[index].start));
                    argumentStart = spans[index].end;
                    args.push([]);
                }
                else {
                    args[args.length - 1].push(token);
                    if (token === "(")
                        level++;
                    if (token === ")")
                        level--;
                }
            }
            if (index === input.length)
                throw new Error(`Unterminated macro invocation '${name}'.`);
            if (!macro.params.length && !args[0].length)
                args.pop();
            if (args.length !== macro.params.length)
                throw new Error(`Macro '${name}' expects ${macro.params.length} arguments, got ${args.length}.`);
            const replaced = [];
            for (let i = 0; i < body.length; i++) {
                if (body[i] === "#") {
                    const argIndex = macro.params.indexOf(body[++i]);
                    if (argIndex < 0)
                        throw new Error(`Invalid stringification in macro '${name}'.`);
                    replaced.push(JSON.stringify(rawArgs[argIndex].trim().replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\s+/g, (token) => /^\s/.test(token) ? " " : token)));
                    continue;
                }
                const argIndex = macro.params.indexOf(body[i]);
                replaced.push(argIndex < 0 ? body[i] : (body[i - 1] === "##" || body[i + 1] === "##") ? args[argIndex].join(" ") : expand(args[argIndex].join(" "), macros, disabled, depth + 1));
            }
            body = replaced;
        }
        for (let i = 0; i < body.length; i++) {
            if (body[i] !== "##")
                continue;
            if (i === 0 || i === body.length - 1)
                throw new Error(`Invalid token paste in macro '${name}'.`);
            const pasted = body[i - 1] + body[i + 1];
            if (pasted && tokens(pasted).length !== 1)
                throw new Error(`Invalid pasted token '${pasted}'.`);
            body.splice(i - 1, 3, pasted);
            i -= 2;
        }
        let replacement = expand(body.join(" "), macros, new Set([...disabled, name]), depth + 1);
        // Rescan an object alias followed by a function macro's argument list.
        if (macros.get(replacement.trim())?.params && input[index + 1] === "(" && replacement.trim() !== name) {
            const start = index + 1;
            let level = 0;
            do {
                index++;
                if (input[index] === "(")
                    level++;
                if (input[index] === ")")
                    level--;
            } while (index + 1 < input.length && level);
            if (level)
                throw new Error(`Unterminated macro invocation '${replacement}'.`);
            replacement = expand(replacement + source.slice(spans[start].start, spans[index].end), macros, new Set([...disabled, name]), depth + 1);
        }
        output.push(replacement);
        copied = spans[index].end;
    }
    output.push(source.slice(copied));
    return output.join("");
}
/** Integer constant expressions, with unevaluated short-circuit branches. */
function evaluateCondition(source, macros) {
    const defined = source.replace(/\bdefined\s*(?:\(\s*([A-Za-z_]\w*)\s*\)|([A-Za-z_]\w*))/g, (_all, a, b) => macros.has(a ?? b) ? "1" : "0");
    const input = tokens(expand(defined, macros));
    let cursor = 0;
    const precedence = { "||": 1, "&&": 2, "|": 3, "^": 4, "&": 5, "==": 6, "!=": 6, "<": 7, "<=": 7, ">": 7, ">=": 7, "<<": 8, ">>": 8, "+": 9, "-": 9, "*": 10, "/": 10, "%": 10 };
    const unary = (live) => {
        const token = input[cursor++];
        if (["!", "~", "+", "-"].includes(token)) {
            const value = unary(live);
            return token === "!" ? Number(!value) : token === "~" ? ~value : token === "-" ? -value : value;
        }
        if (token === "(") {
            const value = expression(0, live);
            if (input[cursor++] !== ")")
                throw new Error("Missing ')' in #if expression.");
            return value;
        }
        if (/^[A-Za-z_]\w*$/.test(token ?? ""))
            return 0;
        if (/^(?:0[xX][\da-fA-F]+|\d+)[uUlL]*$/.test(token ?? "")) {
            const number = token.replace(/[uUlL]+$/, "");
            return /^0[0-7]+$/.test(number) ? parseInt(number, 8) : Number(number);
        }
        if (/^'(?:\\.|[^'\\])'$/.test(token ?? "")) {
            const char = token.slice(1, -1);
            return char[0] !== "\\" ? char.charCodeAt(0) : ({ "n": 10, "r": 13, "t": 9, "0": 0 }[char[1]] ?? char.charCodeAt(1));
        }
        throw new Error(`Invalid #if expression token '${token ?? "end"}'.`);
    };
    const expression = (minimum, live) => {
        let left = unary(live);
        while ((precedence[input[cursor]] ?? -1) >= minimum) {
            const op = input[cursor++];
            const rightLive = live && !(op === "&&" && !left) && !(op === "||" && !!left);
            const right = expression(precedence[op] + 1, rightLive);
            if (live && rightLive && (op === "/" || op === "%") && right === 0)
                throw new Error("Division by zero in #if expression.");
            switch (op) {
                case "||":
                    left = Number(!!left || !!right);
                    break;
                case "&&":
                    left = Number(!!left && !!right);
                    break;
                case "|":
                    left |= right;
                    break;
                case "^":
                    left ^= right;
                    break;
                case "&":
                    left &= right;
                    break;
                case "==":
                    left = Number(left === right);
                    break;
                case "!=":
                    left = Number(left !== right);
                    break;
                case "<":
                    left = Number(left < right);
                    break;
                case "<=":
                    left = Number(left <= right);
                    break;
                case ">":
                    left = Number(left > right);
                    break;
                case ">=":
                    left = Number(left >= right);
                    break;
                case "<<":
                    left <<= right;
                    break;
                case ">>":
                    left >>= right;
                    break;
                case "+":
                    left += right;
                    break;
                case "-":
                    left -= right;
                    break;
                case "*":
                    left *= right;
                    break;
                case "/":
                    left = right ? Math.trunc(left / right) : 0;
                    break;
                case "%":
                    left = right ? left % right : 0;
                    break;
            }
        }
        if (minimum === 0 && input[cursor] === "?") {
            cursor++;
            const yes = expression(0, live && !!left);
            if (input[cursor++] !== ":")
                throw new Error("Missing ':' in #if expression.");
            const no = expression(0, live && !left);
            left = left ? yes : no;
        }
        return left;
    };
    const result = expression(0, true);
    if (cursor !== input.length)
        throw new Error(`Unexpected #if token '${input[cursor]}'.`);
    return !!result;
}
function stripComments(source) {
    return source.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, (token) => token.startsWith("/*") || token.startsWith("//") ? token.replace(/[^\r\n]/g, " ") : token);
}
