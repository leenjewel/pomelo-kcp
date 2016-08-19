var util = require('util');
var EventEmitter = require('events').EventEmitter;
var kcp = require('node-kcp');

var ST_INITED = 0;
var ST_WAIT_ACK = 1;
var ST_WORKING = 2;
var ST_CLOSED = 3;

var output = function(data, size, thiz) {
    thiz.socket.send(data, 0, size, thiz.peer.port, thiz.peer.address);
};

var Socket = function(id, socket, peer) {
    EventEmitter.call(this);

    var self = this;
    this.id = id;
    this.socket = socket;
    this.peer = peer;
    this.kcpobj = new kcp.KCP(123, self);
    this.on('input', function(msg){
        this.kcpobj.input(msg);
    });
    this.check();
    this.state = ST_INITED;
};

util.inherits(Socket, EventEmitter);

module.exports = Socket;

Socket.prototype.check = function() {
    var self = this;
    this.state = ST_WORKING;
    this.kcpobj.update(Date.now());
    var data = this.kcpobj.recv();
    if (!!data) {
        console.dir(data.toString());
        this.emit('message', data);
    }
    setTimeout(function(){
        self.check();
    }, this.kcpobj.check(Date.now()));
};

Socket.prototype.send = function(msg) {
    if (this.state != ST_WORKING) {
        return;
    }
    if (msg instanceof String) {
        msg = new Buffer(msg);
    } else if (!(msg instanceof Buffer)) {
        msg = new Buffer(JSON.stringify(msg));
    }
    this.sendRaw(msg);
};

Socket.prototype.sendRaw = function(msg) {
    this.kcpobj.input(msg);
}

Socket.prototype.sendBatch = function(msgs) {
    if (this.state != ST_WORKING) {
        return;
    }
    var rs = [];
    for (var i = 0; i < msgs.length; i++) {
        rs.push(msgs[i]);
    }
    this.sendRaw(Buffer.concat(rs));
}

Socket.prototype.disconnect = function(msg) {
    if (this.state == ST_CLOSED) {
        return;
    }
    this.state = ST_CLOSED;
    this.emit('disconnect', 'connection disconnected');
}

