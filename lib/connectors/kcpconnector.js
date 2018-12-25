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
var DEFAULT_SOCKET_TIMEOUT = 90; // second

var Connector = function(port, host, opts) {
    if (!(this instanceof Connector)) {
        return new Connector(port, host, opts);
    }

    EventEmitter.call(this);
    this.opts = opts || {};
    this.host = host;
    this.port = port;
    this.useDict = opts.useDict;
    this.useProtobuf = opts.useProtobuf;
    this.clientsForKcp = {};
};

util.inherits(Connector, EventEmitter);

module.exports = Connector;

Connector.prototype.start = function(cb) {
    var self = this;
    if (this.opts.usePomeloPackage) {
        var app = pomelocoder.getApp();
        this.connector = app.components.__connector__.connector;
        this.dictionary = app.components.__dictionary__;
        this.protobuf = app.components.__protobuf__;
        this.decodeIO_protobuf = app.components.__decodeIO__protobuf__;
    }
    if (this.opts.useUDP) {
        this.server = net.createServer();
        this.socket = dgram.createSocket('udp4');
        this.socket.on('message', function(msg, peer){
            self.bindSocket(self.socket, peer.address, peer.port, msg);
        });
        self.on('disconnect', function(kcpsocket){
            delete self.clientsForKcp[kcpsocket.opts.conv];
        });
        this.socket.on('error', function(error) {
            return;
        });

        this.socket.bind(this.port);
    } else {
        this.server = net.createServer(function(socket){
            self.bindSocket(socket, socket.remoteAdress, socket.remotePort);
        });
    }
    this.server.listen(this.port);
    process.nextTick(cb);
};

Connector.prototype.bindSocket = function(socket, address, port, msg) {
    var self = this;
    var conv, kcpsocket;
    if (msg) {
        var kcpHead = pomelocoder.kcpHeadDecode(msg);
        conv = kcpHead.conv;
        kcpsocket = self.clientsForKcp[conv];
    }
    if (!kcpsocket) {
        kcpsocket = new KCPSocket(curId++, socket, address, port, Object.assign({conv: conv}, self.opts));
        if (!!self.opts && self.opts.usePomeloPackage) {
            pomelocoder.setupHandler(self, kcpsocket, self.opts);
        }
        self.clientsForKcp[conv] = kcpsocket;
        self.emit('connection', kcpsocket);
    }
    if (!!msg) {
        kcpsocket.emit('input', msg);
    }
    if (!self.opts.useUDP) {
        var timeout = (self.opts.timeout || DEFAULT_SOCKET_TIMEOUT) * 1000;
        socket.setTimeout(timeout, function(){
            console.warn("connection is timeout");
            socket.destroy();
        });
        socket.on('data', function(data){
            kcpsocket.emit('input', data);
        });
        socket.on('end', function(data){
            kcpsocket.emit('end', data);
        });
    }
};

Connector.decode = Connector.prototype.decode = function(msg) {
    if (this.opts && this.opts.usePomeloPackage) {
        return pomelocoder.decode.bind(this)(msg);
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
        return pomelocoder.encode.bind(this)(reqid, route, msg);
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

var genKey = function(address, port) {
    return address + ':' + port;
}

