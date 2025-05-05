const http = require('http');
const fs = require('fs');

const bd_parse = require('./lib/bd_parser.js');

let bd = bd_parse.parse_bd(process.argv[2]);

const srv = http.createServer((req, res) => {
    let wrapped;
    let js_to_run;

    for (let d of bd) {
        if (d.block.check(req.socket.remoteAddress)) {
            wrapped = d.wrapped;
            js_to_run = d.js_to_run;
            break;
        }
    }
    
    if (js_to_run) {
        eval(js_to_run);
    }

    console.log(wrapped);

    res.statusCode = 200;
    res.end(wrapped);
});

srv.listen(1337, "0.0.0.0");