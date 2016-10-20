[![npm](https://img.shields.io/npm/v/vertex-transport.svg)](https://www.npmjs.com/package/vertex-transport)
[![Build Status](https://travis-ci.org/nomilous/vertex-transport.svg?branch=master)](https://travis-ci.org/nomilous/vertex-transport)
[![Coverage Status](https://coveralls.io/repos/nomilous/vertex-transport/badge.svg?branch=master&service=github)](https://coveralls.io/github/nomilous/vertex-transport?branch=master)

# vertex-transport

**Requires node v6.0.0**

`npm install vertex-transport —save`

A server and socket for [vertex](https://github.com/nomilous/vertex).

Uses [ws](https://www.npmjs.com/package/ws) underneath. They suggest installing binary addons for speed: [bufferutil](https://www.npmjs.com/package/bufferutil) and [utf-8-validate](https://www.npmjs.com/package/utf-8-validate)



### Quick Start

```javascript
const {VertexServer, VertexSocket} = require('vertex-transport');
```

#### Start the server

[details](#Server Details)

```javascript
VertexServer.create()
  .then(server => {})
  .catch(error => {});
```





### Errors

In addition to regular socket errors.

```javascript
const {
  VertexSocketDataError,
  VertexSocketIdleError,
  VertexSocketClosedError,
  VertexSocketTimeoutError,
  VertexSocketReplyError,
  VertexSocketRemoteEncodeError
} = require('vertex-transport').errors;
```

**Emitted** in the socket error event handler.

```javascript
vertexSocket.on('error', error => {});
```

**Passed** into the `send()` rejection handler.

```javascript
vertexSocket.send({data: 1}).catch(error => {})
```

#### VertexSocketDataError

* **Emitted** on the server-side socket (usually when an attacker is probing the server port).
* **Emitted** on the client-side socket in the unlikely event that it sends or recieves unparsable data to the server.

The socket is immediately/aleady closed in both cases.

#### VertexSocketIdleError

* **Emitted** on the server-side socket when a new connection fails to send any data within `config.connectIdleTimeout`. Once the first frame is received no futher idle timeouts are applied.

The socket is immediately closed.

#### VertexSocketClosedError

* **Passed** in the `send()` promise rejection when the socket is already closed or when it closes while awaiting ACKs for already sent messages.

#### VertexSocketTimeoutError

* **Passed** in the `send(data, optionalTimeout)` promise rejection if an ACK or NAK is not received from the server in the specified time.

####  VertexSocketReplyError

* **Emitted** if an ACK or NAK arrives **after** the timeout that caused the  `VertexSocketTimeoutError`.

#### VertexSocketRemoteEncodeError

* **Passed** in the `send()` promise rejection when the remote side assembled a response (ACK+data) that could not be encoded. This will usually only be encountered while developing.



### Server Details





### Client

