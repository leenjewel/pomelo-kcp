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
var dgram = require('dgram');
var kcp = require('./../node_modules/node-kcp');
var pomelocoder = require('./../lib/connectors/pomelocoder');

var PomeloClient = function(host, port, opts){
    if (!(this instanceof PomeloClient)) {
        return new PomeloClient(host, port, opts);
    }

    EventEmitter.call(this);
    this.opts = opts || {};
    this.host = host;
    this.port = port;
    this.heartbeatId = undefined;

    var self = this;

    var conv = opts.conv || 123;
    this.kcpobj = new kcp.KCP(conv, self);

    var nodelay = opts.nodelay || 0;
    var interval = opts.interval || 100;
    var resend = opts.resend || 0;
    var nc = opts.nc || 0;
    this.kcpobj.nodelay(nodelay, interval, resend, nc);

    var sndwnd = opts.sndwnd || 32;
    var rcvwnd = opts.rcvwnd || 32;
    this.kcpobj.wndsize(sndwnd, rcvwnd);

    var mtu = opts.mtu || 1400;
    this.kcpobj.setmtu(mtu);

    this.socket = dgram.createSocket('udp4');
    this.socket.on('error', function(error){
        console.log(`client error:\n${err.stack}`);
        self.socket.close();
    });
    this.socket.on('message', function(msg, peer){
        self.kcpobj.input(msg);
        var data = self.kcpobj.recv();
        if (!!data) {
            if (self.opts && self.opts.usePomeloPackage) {
                var pkg = pomelocoder.decodePackage(data);
                if (pomelocoder.isHandshakePackage(pkg.type)) {
                    self.emit('handshake', JSON.parse(pkg.body));
                } else if (pomelocoder.isHeartbeatPackage(pkg.type)) {
                    self.emit('heartbeat', pkg);
                } else if (pomelocoder.isDataPackage(pkg.type)) {
                    pkg = pomelocoder.decodeMessage(data);
                    self.emit('data', JSON.parse(pkg.body));
                } else if (pomelocoder.isKickPackage(pkg.type)) {
                    self.emit('kick', pkg);
                } else {
                    self.emit('message', data);
                }
            } else {
                self.emit('data', JSON.parse(data));
            }
        }
    });

    this.kcpobj.output((data, size, context) => {
        self.socket.send(data, 0, size, context.port, context.host);
    });

    this.on('handshake', function(pkg){
        console.log('handshake ...');
        self.ack();
        self.init(pkg);
    });

    this.on('heartbeat', function(pkg){
        console.log('heartbeat...'+pomelocoder.getHeartbeatInterval());
        if (!self.heartbeatId) {
            self.emit('connected', pkg);
        }
        self.heartbeatId = setTimeout(function(){
            self.heartbeat();
        }, pomelocoder.getHeartbeatInterval());
    });

    this.on('kick', function(pkg){
        console.log('kick ...');
        self.socket.close();
    });

    this.check();

    if (!opts.usePomeloPackage) {
        setTimeout(function() {
            self.emit('connected');
        }, 0);
    }

};

util.inherits(PomeloClient, EventEmitter);

PomeloClient.prototype.check = function() {
    var self = this;
    this.kcpobj.update(Date.now());
    setTimeout(function(){
        self.check();
    }, this.kcpobj.check(Date.now()));
};

PomeloClient.prototype.send = function(data) {
    this.kcpobj.send(data);
    this.kcpobj.flush();
};

PomeloClient.prototype.request = function(msg) {
    if (this.opts && this.opts.usePomeloPackage) {
        msg = pomelocoder.messagePackage(
            msg.id,
            msg.route,
            msg.body
        );
        this.send(msg);
    } else {
        this.send(JSON.stringify(msg));
    }
};

PomeloClient.prototype.handshake = function() {
    if (this.opts && this.opts.usePomeloPackage) {
        this.send(pomelocoder.handshakePackage());
    }
};

PomeloClient.prototype.init = function(data) {
    var self = this;
    if (this.opts && this.opts.usePomeloPackage) {
        pomelocoder.initProtocol(data);
    }
};

PomeloClient.prototype.ack = function() {
    if (this.opts && this.opts.usePomeloPackage) {
        this.send(pomelocoder.handshakeAckPackage());
    }
};

PomeloClient.prototype.heartbeat = function() {
    if (this.opts && this.opts.usePomeloPackage) {
        this.send(pomelocoder.heartbeatPackage());
    }
};

var reqid = 1;
var client = new PomeloClient('127.0.0.1', 3010, {usePomeloPackage: true});
client.handshake();
client.on('connected', function(userdata){
    console.log('onConnected and send request...');
    client.request({
        id: reqid++,
        route: 'connector.entryHandler.entry',
        body: {}
    });
});
client.on('data', function(userdata){
    setTimeout(function() {
        console.log('onData : '+JSON.stringify(userdata)+' and send request : '+(reqid+1));
    client.request({
        id: reqid++,
        route: 'connector.entryHandler.entry',
        body: {}
    });
    }, 500);
});

