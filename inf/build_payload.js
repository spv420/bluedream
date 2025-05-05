#!/usr/bin/env node

const fs = require("fs")
const uglify = require("uglify-js")
const path = require("path")
const zlib = require("zlib");

let payload_descriptor = fs.readFileSync(path.resolve(process.argv[2])).toString().split("\n");

if (payload_descriptor.includes("")) payload_descriptor.pop();

let full_payload = "";

for (file in payload_descriptor) {
    let fn = payload_descriptor[file];
    let fc = fs.readFileSync(fn, "utf8");

    full_payload += fc + "\n";
}

let minified = uglify.minify(
    full_payload,
    {
        mangle: {
            toplevel: true,
            properties: {keep_quoted: true}
        },
    }
).code;

let compressed = zlib.brotliCompressSync(minified);

console.error(`crc32: ${zlib.crc32(compressed)}`)

fs.writeFileSync(process.argv[3], compressed);
fs.writeFileSync(process.argv[4], minified);