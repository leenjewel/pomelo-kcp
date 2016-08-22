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

var net = require('net');
var util = require('util');
var dgram = require('dgram');
var EventEmitter = require('events').EventEmitter;
var KCPSocket = require('./kcpsocket');
var pomelocoder = require('./pomelocoder');

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
            kcpsocket = new KCPSocket(curId++, self.socket, peer, self.opts);
            if (self.opts.usePomeloPackage) {
                pomelocoder.setupHandler(self, kcpsocket, self.opts);
            }
            self.clients[key] = kcpsocket;
            self.on('disconnect', function(){
                delete self.clients[key];
            });
            self.emit('connection', kcpsocket);
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
    if (this.opts && this.opts.usePomeloPackage) {
        return pomelocoder.decode(msg);
    } else {
        if (msg instanceof Buffer) {
            return JSON.parse(msg.toString());
        } else if (msg instanceof String) {
            return JSON.parse(msg);
        } else {
            return msg;
        }
    }
};

Connector.encode = Connector.prototype.encode = function(reqid, route, msg) {
    if (this.opts && this.opts.usePomeloPackage) {
        return pomelocoder.encode(reqid, route, msg);
    } else {
        return JSON.stringify({
            id: reqid,
            route: route,
            body: msg
        });
    }
};

Connector.prototype.stop = function(force, cb) {
    this.socket.close();
    process.nextTick(cb);
};

var genKey = function(peer) {
    return peer.address + ':' + peer.port;
}

