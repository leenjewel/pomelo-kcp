var net = require('net');
var util = require('util');
var dgram = require('dgram');
var EventEmitter = require('events').EventEmitter;
var KCPSocket = require('./kcpsocket');

var curId = 1;

var Connector = function(port, host, opts) {
    if (!(this instanceof Connector)) {
        return new Connector(port, host, opts);
    }

    EventEmitter.call(this);
    this.opts = opts || {};
    this.host = host;
    this.port = port;
    this.clients = {};
};

util.inherits(Connector, EventEmitter);

module.exports = Connector;

Connector.prototype.start = function(cb) {
    var self = this;
    this.server = net.createServer();
    this.socket = dgram.createSocket('udp4', function(msg, peer){
        var key = genKey(peer);
        var kcpsocket = self.clients[key];
        if (!kcpsocket) {
            kcpsocket = new KCPSocket(curId++, self.socket, peer);
            self.clients[key] = kcpsocket;
        }
    });

    this.socket.on('message', function(msg, peer){
        var key = genKey(peer);
        var kcpsocket = self.clients[key];
        if (!!kcpsocket) {
            kcpsocket.emit('input', msg);
        }
    });

    this.socket.on('error', function(error) {
        return;
    });

    this.socket.bind(this.port, this.host);
    this.server.listen(this.port);
    process.nextTick(cb);
};

Connector.decode = Connector.prototype.decode = function(msg) {
    console.dir(msg);
    return JSON.parse(msg);
};

Connector.encode = Connector.prototype.encode = function(reqid, route, msg) {
    return JSON.stringify({
        id: reqid,
        route: route,
        body: msg
    });
};

Connector.prototype.stop = function(force, cb) {
    this.socket.close();
    process.nextTick(cb);
};

var genKey = function(peer) {
    return peer.address + ':' + peer.port;
}

