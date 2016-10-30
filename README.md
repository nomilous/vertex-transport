**using node ^6.0.0**

[![npm](https://img.shields.io/npm/v/vertex-transport.svg)](https://www.npmjs.com/package/vertex-transport)
[![Build Status](https://travis-ci.org/nomilous/vertex-transport.svg?branch=master)](https://travis-ci.org/nomilous/vertex-transport)
[![Coverage Status](https://coveralls.io/repos/nomilous/vertex-transport/badge.svg?branch=master&service=github)](https://coveralls.io/github/nomilous/vertex-transport?branch=master)

# vertex-transport

`npm install vertex-transport —save`

A server and socket for [vertex](https://github.com/nomilous/vertex).

Uses [ws](https://www.npmjs.com/package/ws) underneath. They suggest installing binary addons for speed: [bufferutil](https://www.npmjs.com/package/bufferutil) and [utf-8-validate](https://www.npmjs.com/package/utf-8-validate)

<br />

### Quick Start

```javascript
const {VertexServer, VertexSocket} = require('vertex-transport');
```

#### Start the server

[details](#server-details)

```javascript
VertexServer.listen()
  .then(server => {})
  .catch(error => {});
```

#### Connect a client

[details](#client-details)

```javascript
VertexSocket.connect()
  .then(socket => {})
  .catch(error => {});

// on the server
server.on('connection', socket => {});
```

<br />

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

<br />

**Emitted** in the socket error event handler.

```javascript
vertexSocket.on('error', error => {});
```

**Passed** into the `send()` rejection handler.

```javascript
vertexSocket.send({data: 1}).catch(error => {})
```

<br />

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

<br />

### Server Details

#### Config

```javascript
// defaults displayed
VertexServer.listen({
  host: '127.0.0.1',
  port: 65535,
  connectIdleTimeout: 20 * 1000 // 20 seconds
}).then(server => {})
```

##### config.[host, port]

Specifiy ip or [device](https://github.com/happner/dface), and port to listen on.

##### config.connectIdleTimeout

If connecting clients send no data within this time they are disconnected.

#### Methods

##### server.address()

* no arguments

Get the servers listening address

returns: Address.

##### server.close()

* no arguments

Stops listening and closes all sockets.

returns: Promise

##### super.*

Extends node `events.EventEmitter`

#### Events

##### event 'error'

* emits: Error

This is relaying error events from the underlying ws/http server.

##### event 'listening'

Emitted when the server reaches listening. Since this occurs before the `listen()` promise is resolved it is inaccessible.

##### event 'connection'

* emits: VertexSocket

Emitted when a socket attaches.

<br />

### Client Details

#### Config

```javascript
// defaults displayed
VertexSocket.connect({
  host: '127.0.0.1',
  port: 65535
}).then(socket => {})
```

##### config.[host, port]

2 connect 2.

#### Methods

##### socket.address()

- no arguments

Get the address at the local side of the socket.

returns: Address.

##### socket.remoteAddress()

* no arguments

Get the address at the remote side of the socket.

returns: Address.

##### socket.close(code, message)

* code: One of [supported ws error codes](https://github.com/websockets/ws/blob/master/lib/ErrorCodes.js)
* message: String

Closes the socket. The remote side's 'close' event handler will receive the code and message.

returns: undefined

##### socket.terminate(error)

* error: Optional Error

Close the socket immediately without sending code and message. If provided the Error will be emitted to the local 'error' event handler.

returns: undefined

##### socket.pause()

* no arguments

Pauses the socket. No data will arrive or depart while paused. Sent data will be bufferred.

returns: undefined

##### socket.resume()

* no arguments

Divides the socket's paused buffer octets into groups according to how each pronounces "potato".

returns: undefined

##### socket.ping(data)

* data: Small payload to send in ping.

Sends a ping to the remote end of the socket. The 'ping' event will be raised there with the data. The remote side will immediatly send a pong causing the 'pong' event to be raised locally.

returns: undefined

##### socket.send(data, optionalTimeout)

* data: String, Number, Buffer, null, Object (non-circular) to send.
* optionalTimeout: Optional milliseconds to timeout awaiting reply.

Default is no timeout. 0 is also no timeout.

returns: Promise

```javascript
// Each sender gets a promise.

socket.send('something', optionalTimeout)
  .then(result => {
    // resolves if:
    // - the remote side sends ACK
    //
    // The remote side will send an ACK or NAK "immediately" (built-in behaviour).
    //
    // Regarding the timeout:
    // - Both the sending of 'something' and the ACK or NAK reply is behind        
    //   whatever may already be awaiting-write in the socket buffers
    //   (on both sides)
    // - If you're sending data faster than available bandwidth the ACKs will
    //   lag.
  
    result.meta;     // remote side receives same meta in `on('data', (data, meta) =>`
    result.meta.seq; // the transmission sequence number
    result.meta.ts;  // the time that send('something') was originally called
  })
  .catch(error => {
    // rejects if
    // - the remote side sends NAK
    // - the socket closes
    // - the optional timeout expires
    
    error.meta; // same meta as above
  });
```

#### Events

##### event 'error'

* emits: Error

Emits errors related to the socket.

##### event 'connect'

Emitted when the socket connection is establisted. This is emitted before the `listen()` promise is resolved - so it is not accessable.

##### event 'close'

* emits: code
* emits: message

Emitted when the socket is closed. The code and message correspond to those passed to the `socket.close()` function.

##### event 'ping'

* emits: data

Emitted when the socket receives a ping from the remote side. It receives data as sent in `socket.ping()`.

##### event 'pong'

* emits: data

Emitted when the remote socket's pong (reply to ping) arrives back.

##### event 'data'

* emits: data String, Number, Buffer, null, Object
* emits: meta
* emits: reply(tag, promise) Function

Emitted when the remote socket sent data using `socket.send(data).then`  The data is serialised to JSON on the sending side and unserialised again at the receiving side before emitting.

The meta contains:

```javascript
{
  seq: 0,
  ts: 1476981609811, // the time the message was sent `Date.now()`
  len: 53 // length of payload in bytes  
}
```

* **seq** is a number assigned at `send()`. It is unique only within the socket pair. It is incremented with each send and starts at 0
* **ts** is a timestamp. It contains the time the `send()` was made.
* **len** is the byte length of the message.

Once all handlers subscribed to the 'data' event have run, an ACK is sent back to the sender with the same meta (with the ack flag set).

The reply function can be used to piggy-back response data in the ACK.

```javascript
receivingSocket.on('data', (data, meta, reply) => {
  if (data.get == 'thing') return reply(  'aThing' , new Thing);
});
```

The thing will then be available as the sender's promise resolves.

```javascript
sendingSocket.send({get: 'thing'})
  .then(data => {
  
    data.aThing;
  
    // meta is there too, but not enumerable
    // data.meta === {
    //   seq: // original seq
    //   ts:  // original send() time
    //   len: // reply data size
    //   ack: true
    // }
  })
  .catch
```

Multiple replies can be sent in an ACK provided they have unique tags.

```javascript
socket.on('data', (data, meta, reply) => {
  reply('tag1', {});
  reply('tag2', {});
  reply({}); // auto assigns '0' as tag
  reply({}); // auto assigns '1' as tag
});
```

Replies can be promises.

```javascript
socket.on('data', (data, meta, reply) => {
  reply('tag', new Promise(resolve => resolve(1)));
});
```

All promises are evaluated even if one of them rejects. Rejected promises arrive as instances of Error in the senders data and do not cause the senders promise to also reject.
