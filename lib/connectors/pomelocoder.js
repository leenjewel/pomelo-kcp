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

var pomeloRequire = function(requirePath) {
    var pomeloPath = __dirname + '/../../../pomelo/lib/';
    try {
        require(pomeloPath + requirePath);
    } catch (e) {
        return undefined;
    }
};
var util = require('util');
var handler = pomeloRequire('./connectors/common/handler');
var Constants = pomeloRequire('./util/constants');
var Kick = pomeloRequire('./connectors/commands/kick');
var Handshake = pomeloRequire('./connectors/commands/handshake');
var Heartbeat = pomeloRequire('./connectors/commands/heartbeat');
var coder = pomeloRequire('./connectors/common/coder');

try {
    var protocol = require('pomelo-protocol');
    var Package = protocol.Package;
    var Message = protocol.Message;
} catch (e) {
    var protocol = undefined;
    var Package = undefined;
    var Message = undefined;
}

var encode = function(reqid, route, msg) {
    if (!!coder) {
        return coder.encode(reqid, route, msg);
    } else {
        return JSON.stringify({
            id: reqid,
            route: route,
            body: msg
        });
    }
};

var decode = function(msg) {
    if (!!coder) {
        return coder.decode(msg);
    } else {
        if (msg instanceof Buffer) {
            return JSON.parse(msg.toString());
        } else if (msg instanceof String) {
            return JSON.parse(msg);
        } else {
            return msg;
        }
    }
}

var setupHandler = function(connector, socket, opts) {
    if (!!Handshake && !!Heartbeat && !!Kick && !!Constants) {
        connector.handshake = connector.handshake || new Handshake(opts);
        if (!connector.heartbeat) {
            if(!opts.heartbeat) {
              opts.heartbeat = Constants.TIME.DEFAULT_UDP_HEARTBEAT_TIME;
              opts.timeout = Constants.TIME.DEFAULT_UDP_HEARTBEAT_TIMEOUT;
            }
            connector.heartbeat = new Heartbeat(utils.extends(opts, {disconnectOnTimeout: true}));
        }
        socket.on('handshake',
                connector.handshake.handle.bind(connector.handshake, socket));
        socket.on('heartbeat',
                connector.heartbeat.handle.bind(connector.heartbeat, socket));
        socket.on('disconnect',
                connector.heartbeat.clear.bind(connector.heartbeat, socket.id));
        socket.on('disconnect', function(){
            connector.emit('disconnect', socket);
        });
        socket.on('closing', Kick.handle.bind(null, socket));
    }
};

var handlePackage = function(socket, pkg) {
    if (!!pkg && !!Package && !!handler) {
        pkg = Package.decode(pkg);
        handler(socket, pkg);
    } else {
        socket.emit('message', pkg);
    }
};

module.exports = {
    protocol: protocol,
    Package: Package,
    Message: Message,
    encode: encode,
    decode: decode,
    setupHandler: setupHandler,
    handlePackage: handlePackage
};

