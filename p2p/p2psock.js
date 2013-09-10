var buffer = require('buffer');
var net = require('net');

/*

 members:
 buffer mData;
 int mOffset;

 functions:
 bytesAvailable()
 readInt()
 readData(int length)
 readEncodedBuffer()

 writeInt(int)
 writeEncodedBuffer(buffer)

 addData(buf)
 */

function bytesAvailable()
{
    if (this.mData) {
        // console.log("bytesAvailable " + this.mData.length + " " + this.mOffset);
        return this.mData.length - this.mOffset;
    }
    return 0;
}

function drainBuffer()
{
    if (this.mData.length == this.mData.mOffset) {
        this.mData = undefined;
        this.mOffset = 0;
    }
}

function readInt()
{
    // console.log("Reading an int " + this.bytesAvailable());
    if (this.bytesAvailable() >= 4) {
        var ret = this.mData.readUInt32BE(this.mOffset);
        this.mOffset += 4;
        this.drainBuffer();
        return ret;
    }
    return undefined;
}

function peekInt()
{
    if (this.bytesAvailable() >= 4) {
        return this.mData.readUInt32BE(this.mOffset);
    }
    return undefined;
}


function readData(length)
{
    if (this.bytesAvailable() >= length) {
        var ret = this.mData.slice(this.mOffset, this.mOffset + length);
        this.mOffset += length;
        this.drainBuffer();
        return ret;
    }
    return undefined;
}

function readEncodedBuffer()
{
    var ret = undefined;
    var size = this.readInt();
    // console.log("Reading encoded buffer size " + size + " " + this.mData.length + " " + this.mOffset);
    if (size !== undefined) {
        ret = this.readData(size);
        // console.log("Reading buffer of size " + size + " " + (ret ? ret.length : -1));
        if (ret === undefined) { // return bytes for int
            this.mOffset -= 4;
        }
    }
    return ret;
}

function writeInt(num)
{
    var buf = new Buffer(4);
    buf.writeUInt32BE(num, 0);
    this.write(buf);
    return 4;
}

function writeEncodedBuffer(buf)
{
    if (typeof buf === 'string')
        buf = new Buffer(buf);
    this.writeInt(buf.length);
    this.write(buf);
    return buf.length + 4;
}

function addData(buf)
{
    if (this.mData) {
        this.mData = Buffer.concat([this.mData, buf]);
    } else {
        this.mData = buf;
        this.mOffset = 0;
    }
}

function init(socket)
{
    socket.bytesAvailable = bytesAvailable;
    socket.readInt = readInt;
    socket.readData = readData;
    socket.readEncodedBuffer = readEncodedBuffer;
    socket.drainBuffer = drainBuffer;
    socket.writeInt = writeInt;
    socket.writeEncodedBuffer = writeEncodedBuffer;
    socket.addData = addData;
}

module.exports = { init: init };

