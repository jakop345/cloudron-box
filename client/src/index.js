var Bungee = require('bungee');
var index = require('./index.jmp.js');

console.log('Bungee:', Bungee);

var engine = new Bungee.Engine(new Bungee.RendererDOM());
console.log('Engine:', engine);

var app = index(Bungee, engine);
console.log(app);

Bungee.jump(engine);
