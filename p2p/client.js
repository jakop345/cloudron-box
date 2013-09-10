var buffer = require('buffer');
var fs = require('fs');
var manifest = require('./manifest.js');
var net = require('net');
var p2psock = require('./p2psock.js');

var currentManifest;
var connected = false;
var fileCount;
var fileName;

var root = "./client/";
manifest.build(root, onManifestBuilt);
var socket = net.connect({port: 8124, allowHalfOpen:true}, onClientConnected);
p2psock.init(socket);
socket.on('data', onClientDataReceived);
socket.on('end', onClientDisconnected);

function sendManifest()
{
    if (connected && currentManifest) {
        socket.writeEncodedBuffer(JSON.stringify(currentManifest));
        console.log("Sent manifest");
    }
}

function onManifestBuilt(manifest)
{
    if (typeof manifest == 'object') {
        console.log("Got manifest " + manifest);
        currentManifest = manifest;
        sendManifest();
    } else {
        console.log("Got error " + manifest);
    }
}

function onClientConnected()
{
    connected = true;
    sendManifest();
    console.log("socket connected");
}

function onClientDataReceived(buf)
{
    socket.addData(buf);
    if (fileCount === undefined) {
        fileCount = socket.readInt();
        if (fileCount === undefined)
            return;
    }
    while (fileCount) {
        if (fileName === undefined) {
            fileName = socket.readEncodedBuffer();
            if (fileName === undefined)
                return;
        }
        var contents = socket.readEncodedBuffer();
        if (contents === undefined)
            return;
        fs.writeFile(root + fileName, contents);
        fileName = undefined;
        --fileCount;
    }
}

function onClientDisconnected()
{

}
