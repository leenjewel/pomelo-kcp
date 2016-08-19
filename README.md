#pomelo-kcp

======================================
[![Build Status][1]][2] 
[1]: https://api.travis-ci.org/leenjewel/node-kcp.svg?branch=master
[2]: https://travis-ci.org/leenjewel/node-kcp


[KCP Protocol](https://github.com/skywind3000/kcp) for [Pomelo](https://github.com/NetEase/pomelo)

##HowTo

###Install Pomelo

```
$sudo npm install -g pomelo
```

###Create Pomelo Project

```
$pomelo init pomelo_test_server

$cd pomelo_test_server
```

###Add pomelo-kcp dependencies

```
$cd pomelo_test_server

$cd game_server

$vim package.json
```

package.json

```
{
    "name":"pomelo-server",
    "version":"0.0.1",
    "private":false,
    "dependencies":{
        "pomelo":"1.2.3"
    }
}
```

add pomelo-kcp dependencie

```
{
    "name":"pomelo-server",
    "version":"0.0.2",
    "private":false,
    "dependencies":{
        "pomelo":"1.2.3",
        "pomelo-kcp":"^0.0.1"
    }
}
```

Install dependencies modules

```
$cd pomelo_test_server/game_server

$npm install
```

###Change Application Connector

Edit `app.js`

```
$vim pomelo_test_server/game_server/app.js
```

Use KCP Connector

```
var pomelo = require('pomelo');
// Require pomelo-kcp !!!
var kcpconnector = require('pomelo-kcp');

/**
 * Init app for client.
 */
var app = pomelo.createApp();
app.set('name', 'pomelo-server');

// app configuration
app.configure('production|development', 'connector', function(){
  app.set('connectorConfig',
    {
      // connector : pomelo.connectors.hybridconnector,
      // Use KCP Connector !!!
      connector : kcpconnector.kcpconnector,
      heartbeat : 3,
      useDict : true,
      useProtobuf : true
    });
});

// start app
app.start();

process.on('uncaughtException', function (err) {
  console.error(' Caught exception: ' + err.stack);
});

```

### Start Pomelo

```
$cd pomelo_test_server/game_server
$pomelo start
```

###Test

```
$node pomelo_test_server/game_server/node_modules/pomelo-kcp/test/udpclient.js
```

udpclient.js

```
var kcp = require('./../node_modules/node-kcp');
var kcpobj = new kcp.KCP(123, {address: '127.0.0.1', port: 3010});
var dgram = require('dgram');
var client = dgram.createSocket('udp4');
var msg = JSON.stringify({
    id: 'test',
    route: 'connector.entryHandler.entry',
    body: 'test'
});
var interval = 200;

kcpobj.nodelay(0, interval, 0, 0);

kcpobj.output((data, size, context) => {
    client.send(data, 0, size, context.port, context.address);
});

client.on('error', (err) => {
    console.log(`client error:\n${err.stack}`);
    client.close();
});

client.on('message', (msg, rinfo) => {
    kcpobj.input(msg);
});

setInterval(() => {
    kcpobj.update(Date.now());
    var recv = kcpobj.recv();
    if (recv) {
        console.log(`client recv ${recv}`);
        kcpobj.send(msg);
    }
}, interval);

kcpobj.send(msg);

```