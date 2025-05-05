const fs = require("node:fs");
const zlib = require("node:zlib");
const path = require("node:path");
const vscode = require("vscode");
const os = require("os");

var Transform = require("stream").Transform;
var PassThrough = require("stream").PassThrough;
var util = require("util");
var EventEmitter = require("events").EventEmitter;