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

var supportPomeloPackage = true;

var pomeloRequire = function(requirePath) {
    // for test local
    // var pomeloPath = __dirname + '/../../../pomelo-server/game-server/node_modules/pomelo/lib/';
    var pomeloPath = __dirname + '/../../../pomelo/lib/';
    try {
        return require(pomeloPath + requirePath);
    } catch (e) {
        supportPomeloPackage = false;
        return undefined;
    }
};
var util = require('util');
var utils = pomeloRequire('./util/utils');
var handler = pomeloRequire('./connectors/common/handler');
var Constants = pomeloRequire('./util/constants');
var Kick = pomeloRequire('./connectors/commands/kick');
var Handshake = pomeloRequire('./connectors/commands/handshake');
var Heartbeat = pomeloRequire('./connectors/commands/heartbeat');
var coder = pomeloRequire('./connectors/common/coder');
var pomelo = pomeloRequire('../');

try {
    var protocol = require('pomelo-protocol');
    var Package = protocol.Package;
    var Message = protocol.Message;
} catch (e) {
    supportPomeloPackage = false;
    var protocol = undefined;
    var Package = undefined;
    var Message = undefined;
}

try {
    var protobuf = require('pomelo-protobuf');
} catch (e) {
    supportPomeloPackage = false;
    var protobuf = undefined;
}

var RES_OK = 200;

var getApp = function() {
    if (!!pomelo) {
        return pomelo.app;
    }
};

var encode = function(reqid, route, msg) {
    if (supportPomeloPackage) {
        return coder.encode.bind(this)(reqid, route, msg);
    } else {
        return JSON.stringify({
            id: reqid,
            route: route,
            body: msg
        });
    }
};

var decode = function(msg) {
    if (supportPomeloPackage) {
        return coder.decode.bind(this)(msg);
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
    if (supportPomeloPackage) {
        connector.handshake = connector.handshake || new Handshake(opts);
        if (!connector.heartbeat) {
            if(!opts.heartbeat) {
              opts.heartbeat = opts.interval / 1000;
              opts.timeout = opts.heartbeat * 2;
            }
            if (opts.heartbeat * 1000 < opts.interval) {
                console.warn('heartbeat interval must longer than kcp interval');
                opts.heartbeat = opts.interval / 1000;
            }
            if (opts.timeout * 1000 < 2 * opts.interval) {
                console.warn('timeout must longer than kcp interval * 2');
                opts.timeout = opts.heartbeat * 2;
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
    if (!!pkg && supportPomeloPackage) {
        pkg = Package.decode(pkg);
        if (Array.isArray(pkg)) {
            for (var p in pkg) {
                if (isHandshakeACKPackage(pkg[p].type)) {
                    socket.state = 2; // ST_WORKING
                }
                handler(socket, pkg[p]);
            }
        } else {
            if (isHandshakeACKPackage(pkg.type)) {
                socket.state = 2; // ST_WORKING
            }
            handler(socket, pkg);
        }
    } else {
        socket.emit('message', pkg);
    }
};

var heartbeatInterval = 0;
var getHeartbeatInterval = function() { return heartbeatInterval; };
var heartbeatTimeout = 0;
var getHeartbeatTimeout = function() { return heartbeatTimeout; };
var pomeloCoderData = {};
var initProtocol = function(data) {
    if (!!data && supportPomeloPackage) {
        if (data.code !== RES_OK) {
            console.warn('Handshake response code : '+data.code);
            return;
        }
        if (!data || !data.sys) {
            console.warn('Handshake response sys is undefained');
            return;
        }
        if (!!data.sys && !!data.sys.heartbeat) {
            heartbeatInterval = data.sys.heartbeat * 1000;
            heartbeatTimeout = heartbeatInterval * 2;
        }
        var dict = data.sys.dict;
        var protos = data.sys.protos;
        if (!!dict) {
            pomeloCoderData.dict = dict;
            pomeloCoderData.abbrs = {};

            for (var route in dict) {
                pomeloCoderData.abbrs[dict[route]] = route;
            }
        }
        if (!!protos) {
            pomeloCoderData.protos = {
                server: protos.server || {},
                client: protos.client || {}
            };
            if (!!protobuf) {
                protobuf.init({
                    encoderProtos: protos.client,
                    decoderProtos: protos.server
                });
            }
        }
    }
};

var handshakePackage = function(userdata) {
    userdata = userdata || {};
    return (Package.encode(
        Package.TYPE_HANDSHAKE,
        protocol.strencode(JSON.stringify({
            sys: {
                version: '1.1.1',
                type: 'socket'
            },
            user: userdata
        }))
    ));
};

var pomeloHandshakeAckPkg = Package.encode(Package.TYPE_HANDSHAKE_ACK);
var handshakeAckPackage = function() {
    return pomeloHandshakeAckPkg;
};

var pomeloHeartbeatPkg = Package.encode(Package.TYPE_HEARTBEAT);
var heartbeatPackage = function() {
    return pomeloHeartbeatPkg;
};

var messagePackage = function(reqid, route, msg) {
    var type = reqid ? Message.TYPE_REQUEST : Message.TYPE_NOTIFY;
    var protos = !!pomeloCoderData.protos ? pomeloCoderData.protos.client : {};
    if (!!protos[route]) {
        msg = protobuf.encode(route, msg);
    } else {
        msg = protocol.strencode(JSON.stringify(msg));
    }
    var compressRoute = 0;
    if (!!pomeloCoderData.dict && !!pomeloCoderData.dict[route]) {
        route = pomeloCoderData.dict[route];
        compressRoute = 1;
    }
    msg = Message.encode(reqid, type, compressRoute, route, msg);
    return Package.encode(Package.TYPE_DATA, msg);
};

var isHandshakePackage = function(type) {
    return (supportPomeloPackage && type == Package.TYPE_HANDSHAKE);
}

var isHandshakeACKPackage = function(type) {
    return (supportPomeloPackage && type == Package.TYPE_HANDSHAKE_ACK);
}

var isHeartbeatPackage = function(type) {
    return (supportPomeloPackage && type == Package.TYPE_HEARTBEAT);
}

var isDataPackage = function(type) {
    return (supportPomeloPackage && type == Package.TYPE_DATA);
}

var isKickPackage = function(type) {
    return (supportPomeloPackage && type == Package.TYPE_KICK);
}

var kcpHeadDecode = function(bytes) {
    //小端
    var offset = 0;
    var conv = ((bytes[offset++]) | (bytes[offset++] << 8) | (bytes[offset++] << 16) | (bytes[offset++] << 24)) >>> 0;
    var cmd = bytes[offset++];
    var frg = bytes[offset++];
    var wnd = ((bytes[offset++]) | (bytes[offset++] << 8)) >>> 0;
    var ts = ((bytes[offset++]) | (bytes[offset++] << 8) | (bytes[offset++] << 16) | (bytes[offset++] << 24)) >>> 0;
    var sn = ((bytes[offset++]) | (bytes[offset++] << 8) | (bytes[offset++] << 16) | (bytes[offset++] << 24)) >>> 0;
    var una = ((bytes[offset++]) | (bytes[offset++] << 8) | (bytes[offset++] << 16) | (bytes[offset++] << 24)) >>> 0;
    var len = ((bytes[offset++]) | (bytes[offset++] << 8) | (bytes[offset++] << 16) | (bytes[offset++] << 24)) >>> 0;

    var rs = {
        conv: conv,
        cmd: cmd,
        frg: frg,
        wnd: wnd,
        ts: ts,
        sn: sn,
        una: una,
        len: len
    };

    // if (bytes.length >= len + 24) {
    //     rs.data = Buffer.from(bytes, 24, len);
    // }
    return rs;
};

module.exports = {
    encode: encode,
    decode: decode,
    getApp: getApp,
    isHandshakePackage: isHandshakePackage,
    isHandshakeACKPackage: isHandshakeACKPackage,
    isHeartbeatPackage: isHeartbeatPackage,
    isDataPackage: isDataPackage,
    isKickPackage: isKickPackage,
    decodePackage: Package.decode,
    decodeMessage: Message.decode,
    setupHandler: setupHandler,
    initProtocol: initProtocol,
    getHeartbeatInterval: getHeartbeatInterval,
    getHeartbeatTimeout: getHeartbeatTimeout,
    handlePackage: handlePackage,
    handshakePackage: handshakePackage,
    handshakeAckPackage: handshakeAckPackage,
    heartbeatPackage: heartbeatPackage,
    messagePackage: messagePackage,
    kcpHeadDecode: kcpHeadDecode
};

