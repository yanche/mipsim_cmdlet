
import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import { Program } from "@belongs/mipsim/program";
import { DirtyInfo, byte } from "@belongs/mipsim/utility";
import { Word, Byte } from "@belongs/mipsim/def";
import { getRegName, getAllRegNums, REG } from "@belongs/mipsim/registers";
import * as _console from "@belongs/mipsim/console";

_console.use((input: string | number) => process.stdout.write(input.toString()));

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

let program: Program;
let programCode: string[];
let loadedFileName: string;
let loadedFilePath: string;

_console.write(">");
rl.on("line", processInput);

const handlers = new Map<string, Handler>();

function processInput(originInput: string) {
    const input = originInput.trim();
    if (input) {
        const spaceIdx = input.indexOf(" ");
        let directive: string, rest: string;
        if (spaceIdx < 0) {
            directive = input;
            rest = "";
        } else {
            directive = input.slice(0, spaceIdx);
            rest = input.slice(spaceIdx + 1).trim();
        }
        if (!handlers.has(directive)) {
            _console.write(`unknown command: ${originInput}, use "help" to get documents\n`);
        } else {
            const handler = handlers.get(directive);
            if (handler.noProgram || program) {
                handler.process(rest);
            } else {
                _console.write(`program not loaded yet, use "load {path-to-file}" to load assembly\n`);
            }
        }
    }
    _console.write(`${loadedFileName || ""}>`);
}

registerHandler({
    name: "file",
    shortCuts: ["f"],
    process: () => {
        _console.write(`${loadedFilePath}\n`);
    },
    desc: "full path of loaded file",
});

registerHandler({
    name: "reset",
    process: () => {
        program = new Program(programCode);
    },
    desc: "re-initialize registers and memory",
});

registerHandler({
    name: "load",
    shortCuts: ["l"],
    process: (rest: string) => {
        _console.write(`loading file: ${rest}\n`);
        const data = fs.readFileSync(rest, "utf-8");
        _console.write(`loaded file: ${rest}\n`);
        programCode = data.split("\r\n");
        // console.info(code.length, code.slice(0, 5));
        program = new Program(programCode);
        loadedFilePath = rest;
        loadedFileName = path.basename(rest);
    },
    desc: "load program from local file-system, format: load {path-to-file}",
    noProgram: true,
});

registerHandler({
    name: "run",
    shortCuts: ["r"],
    process: () => {
        program.run();
    },
    desc: "execute program till end",
});

registerHandler({
    name: "code",
    shortCuts: ["c"],
    process: () => {
        const pc = program.regs.getVal(REG.PC);
        const code = program.getSource(byte.bitsToNum(pc, false));
        _console.write(`0x${byte.wordToHexString(pc)}: ${code.source}${code.originSource ? ` (${code.originSource}  @${code.pseudoConvIdx})` : ""}\n`);
    },
    desc: "next MIPS code to be executed",
});

registerHandler({
    name: "step",
    shortCuts: ["s"],
    process: () => {
        program.step();
        const dirty = program.getDirtyInfo();
        dirty.regs.forEach(logRegDirty);
        dirty.mem.forEach(logMemDirty);
        const pc = program.regs.getVal(REG.PC);
        const code = program.getSource(byte.bitsToNum(pc, false));
        _console.write(`next:\n`);
        _console.write(`0x${byte.wordToHexString(pc)}: ${code.source}${code.originSource ? ` (${code.originSource}  @${code.pseudoConvIdx})` : ""}\n`);
    },
    desc: "single step execution",
});

registerHandler({
    name: "regs",
    process: () => {
        const regs = program.regs;
        getAllRegNums().forEach(reg => {
            _console.write(`$${getRegName(reg)}: 0x${byte.wordToHexString(regs.getVal(reg))}\n`);
        });
    },
    desc: "get register list and value",
});

registerHandler({
    name: "help",
    shortCuts: ["?", "h", "man"],
    process: () => {
        const processed = new Set<string>();
        [...handlers].forEach(h => {
            const handler = h[1];
            if (!processed.has(handler.name)) {
                processed.add(handler.name);
                const shortCuts = handler.shortCuts || [];
                _console.write(`${handler.name}${shortCuts.length ? `(${shortCuts.join(",")})` : ""}: ${handler.desc}\n`);
            }
        });
    },
    desc: "get documents on available commands",
    noProgram: true,
});

registerHandler({
    name: "quit",
    shortCuts: ["q"],
    process: () => process.exit(0),
    desc: "quit",
    noProgram: true,
});

interface Handler {
    process: (rest: string) => void;
    name: string;
    desc: string;
    shortCuts?: string[];
    noProgram?: boolean;
}

function registerHandler(handler: Handler) {
    [handler.name].concat(handler.shortCuts || []).forEach(n => registerHandlerDirective(n, handler));
}

function registerHandlerDirective(name: string, handler: Handler) {
    if (handlers.has(name)) {
        throw new Error(`directive "${name}" is occupied by both "${handler.name}" and "${handlers.get(name).name}" handler`);
    } else {
        handlers.set(name, handler);
    }
}

function logRegDirty(dirtyInfo: DirtyInfo<number, Word>) {
    _console.write(`$${getRegName(dirtyInfo.key)}: 0x${byte.wordToHexString(dirtyInfo.old)} -> 0x${byte.wordToHexString(dirtyInfo.new)}\n`)
}

function logMemDirty(dirtyInfo: DirtyInfo<number, Byte>) {
    const addrHex = byte.wordToHexString((<Word>byte.bitsNumFill(byte.numToBits(dirtyInfo.key).result, 32, false).bits));
    _console.write(`0x${addrHex}: 0x${byte.byteToHexString(dirtyInfo.old)} -> 0x${byte.byteToHexString(dirtyInfo.new)}\n`)
}
