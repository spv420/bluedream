// block descriptor parser

const fs = require('fs');
const net = require('net');


const block_regex = /(\d+.\d+.\d+.\d+)\/(\d+)/;
const range_regex = /(\d+.\d+.\d+.\d+)-(\d+.\d+.\d+.\d+)/;

function parse_bd(bd_path) {
    const bd = fs.readFileSync(bd_path, "utf8").split("\n");
    let all_bds = [];

    for (let s of bd) {
        s = s.includes("#") ? s.slice(0, s.indexOf("#"))
                            : s;

        if (s == "") continue;

        let ip_desc = s.slice(0, s.indexOf(":"));
        let ips = ip_desc.split(",");
        let [bin, run_when] = s.slice(s.indexOf(":") + 1).split(",");

        let blocklist = new net.BlockList();

        for (let ip of ips) {
            if (ip.includes("/")) {
                let match = ip.match(block_regex);

                blocklist.addSubnet(match[1], parseInt(match[2]));
            } else if (ip.includes("-")) {
                let match = ip.match(range_regex);

                console.log(match[1], match[2]);

                blocklist.addRange(match[1], match[2]);
            } else {
                blocklist.addAddress(ip);
            }
        }

        all_bds.push({block: blocklist, wrapped: fs.readFileSync(bin), js_to_run: run_when != "none" ? fs.readFileSync(run_when, "utf8") : null})
    }

    return all_bds;
}

exports.parse_bd = parse_bd;