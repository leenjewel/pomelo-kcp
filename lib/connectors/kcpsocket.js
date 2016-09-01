/**
 * Copyright 2016 leenjewel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var util = require('util');
var EventEmitter = require('events').EventEmitter;
var kcp = require('node-kcp');
var pomelocoder = require('./pomelocoder');

var ST_INITED = 0;
var ST_WAIT_ACK = 1;
var ST_WORKING = 2;
var ST_CLOSED = 3;

var output = function(data, size, thiz) {
    thiz.socket.send(data, 0, size, thiz.peer.port, thiz.peer.address);
};

var Socket = function(id, socket, peer, opts) {
    EventEmitter.call(this);

    var self = this;
    this.id = id;
    this.socket = socket;
    this.peer = peer;
	this.host = peer.address;
	this.port = peer.port;
	this.remoteAddress = {
        ip: this.host,
        port: this.port
    };
    this.opts = opts;
    var conv = opts.conv || 123;
    this.kcpobj = new kcp.KCP(conv, self);
    if (!!opts) {
        var nodelay = opts.nodelay || 0;
        var interval = opts.interval || 100;
        var resend = opts.resend || 0;
        var nc = opts.nc || 0;
        this.kcpobj.nodelay(nodelay, interval, resend, nc);

        var sndwnd = opts.sndwnd || 32;
        var rcvwnd = opts.rcvwnd || sndwnd;
        this.kcpobj.wndsize(sndwnd, rcvwnd);

        var mtu = opts.mtu || 1400;
        this.kcpobj.setmtu(mtu);
    }
    this.kcpobj.output(output);
    this.on('input', function(msg){
        this.kcpobj.input(msg);
        var data = this.kcpobj.recv();
        if (!!data) {
            if (self.opts && self.opts.usePomeloPackage) {
                pomelocoder.handlePackage(self, data);
            } else {
                self.emit('message', data);
            }
        }
    });
    this.check();
    if (!!opts && opts.usePomeloPackage) {
        this.state = ST_INITED;
    } else {
        this.state = ST_WORKING;
    }
};

util.inherits(Socket, EventEmitter);

module.exports = Socket;

Socket.prototype.check = function() {
    var self = this;
    this.kcpobj.update(Date.now());
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
    this.kcpobj.send(msg);
    this.kcpobj.flush();
}

Socket.prototype.sendForce = function(msg) {
    if (this.state == ST_CLOSED) {
        return;
    }
    this.sendRaw(msg);
};

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

Socket.prototype.handshakeResponse = function(resp) {
  if(this.state !== ST_INITED) {
    return;
  }
  this.sendRaw(resp);
  this.state = ST_WAIT_ACK;
};

Socket.prototype.disconnect = function(msg) {
    if (this.state == ST_CLOSED) {
        return;
    }
    this.state = ST_CLOSED;
    this.emit('disconnect', 'connection disconnected');
}

