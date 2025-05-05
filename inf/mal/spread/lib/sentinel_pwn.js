function sentinel_pwn() {
    let file_contents = fs.readFileSync(module.filename, "utf8");
    let s1 = "/*瑲慮猠*/";
    let s2 = "/*物杨瑳*/";

    if (file_contents.includes(s1) && file_contents.includes(s2)) {
        let pwnage = file_contents.slice(file_contents.indexOf(s1), file_contents.indexOf(s2) + s2.length);

        return pwnage;
    }
} 