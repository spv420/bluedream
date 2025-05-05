#!/usr/bin/env node

const zlib = require('zlib')
const fs = require('fs')

const payload = Buffer.from(fs.readFileSync(process.argv[2])).toString("base64");
const wrapper = fs.readFileSync("mal/wrapper.js", "utf8").replace("{}", payload);

console.error(`crc32: ${zlib.crc32(wrapper)}`);

console.log(wrapper);
