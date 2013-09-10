var net = require('net');
var manifest = require('./manifest.js');
var buffer = require('buffer');
var fs = require('fs');
var p2psock = require('./p2psock.js');

var idx = 0;
var root = "./server/";

function sendFiles(files)
{
    // console.log("Calling sendFile with " + this.mIndex + " as this " + files.length);

    this.writeInt(files.length);

    console.log("Sending " + files.length + " files");
    for (var i=0; i<files.length; ++i) {
        var contents = fs.readFileSync(root + files[i]);
        if (contents === undefined)
            throw "Couldn't read " + files[i];
        console.log("Sending file " + files[i] + " " + contents.length);
        this.writeEncodedBuffer(files[i]);
        this.writeEncodedBuffer(contents);
    }
    this.end();
}

function onClientConnected(socket)
{
    p2psock.init(socket);
    // console.log("Got a socket");
    socket.mIndex = ++idx;
    socket.on("end", onClientDisconnected);
    socket.on("data", onClientData);
    socket.compareManifests = compareManifests;
    socket.sendFiles = sendFiles;
    p2psock.init(socket);
    manifest.build(root, onManifestBuilt);
    function onManifestBuilt(manifest)
    {
        socket.mServerManifest = manifest;
        if (socket.mClientManifest) {
            console.log("Calling compare 1");
            socket.compareManifests();
        }
    }
}

function onClientData(data)
{
    this.addData(data);
    var manifest = this.readEncodedBuffer();
    // console.log("Got some client data " + this.mOffset + " " + this.mData.length
    //             + " " + (manifest === undefined ? "no manifest" : "manifest"));
    if (manifest !== undefined) {
        this.mClientManifest = JSON.parse(manifest.toString('utf8'));
        if (this.mServerManifest)
            this.compareManifests();
    }
}

function compareManifests()
{
    if (!this.mServerManifest)
        throw "This is some bullshit. I should have had both manifests now";
    if (!this.mClientManifest)
        throw "This is some bullshit 2. I should have had both manifests now";


    var files = [];
    for (var file in this.mServerManifest) {
        if (!this.mClientManifest[file] || this.mClientManifest[file].sha256 != this.mServerManifest[file].sha256)
            files.push(file);
    }
    this.sendFiles(files);

    // console.log("Got manifests");
}

function onClientDisconnected()
{
    console.log("Got disconnected " + this.mIndex);
    socket = undefined;
}

var server = net.createServer(onClientConnected);
server.listen(8124);
