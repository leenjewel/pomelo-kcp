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
    });

    this.kcpobj.output((data, size, context) => {
        console.dir(data);
        self.socket.send(data, 0, size, context.port, context.host);
    });

    this.on('handshake', function(pkg){
        console.dir(pkg);
        console.log('handshake ack ...');
    });

    this.on('data', function(pkg){
        console.dir(pkg);
        console.log('data ...');
    });

    this.on('kick', function(pkg){
        console.dir(pkg);
        console.log('kick ...');
        self.socket.close();
    });

    this.on('message', function(msg){
        console.log('message: '+msg.toString());
    });

    this.check();

};

util.inherits(PomeloClient, EventEmitter);

PomeloClient.prototype.check = function() {
    var self = this;
    this.kcpobj.update(Date.now());
    var data = this.kcpobj.recv();
    if (!!data) {
        if (self.opts && self.opts.usePomeloPackage) {
            var pkg = pomelocoder.Package.decode(data);
            if (pomelocoder.Package.TYPE_HANDSHAKE_ACK == pkg.type) {
                self.emit('handshake', pkg);
            } else if (pomelocoder.Package.TYPE_DATA == pkg.type) {
                self.emit('data', pkg);
            } else if (pomelocoder.Package.TYPE_KICK == pkg.type) {
                self.emit('kick', pkg);
            } else {
                self.emit('message', data);
            }
        } else {
            self.emit('message', data);
        }
    }
    setTimeout(function(){
        self.check();
    }, this.kcpobj.check(Date.now()));
};

PomeloClient.prototype.send = function(data) {
    this.kcpobj.send(data);
};

PomeloClient.prototype.request = function(msg) {
    if (this.opts && this.opts.usePomeloPackage) {
        msg = pomelocoder.Message.encode(
            msg.id,
            pomelocoder.Message.TYPE_REQUEST,
            false,
            msg.route,
            JSON.stringify(msg.body)
        );
    } else {
        this.send(JSON.stringify(msg));
    }
};

PomeloClient.prototype.handshake = function() {
    if (this.opts && this.opts.usePomeloPackage) {
        this.send(pomelocoder.Package.encode(pomelocoder.Package.TYPE_HANDSHAKE));
    }
};

var client = new PomeloClient('127.0.0.1', 3010, {usePomeloPackage: true});
client.handshake();
client.request({
    id: 'test',
    route: 'connector.entryHandler.entry',
    body: 'test'
});

