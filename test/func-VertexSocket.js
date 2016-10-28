const {basename} = require('path');
const filename = basename(__filename);
const expect = require('expect.js');

const {VertexServer, VertexSocket} = require('../');

describe(filename, () => {

  let server;

  beforeEach('start server', done => {
    VertexServer.listen()
      .then(_server => {
        server = _server;
        done();
      })
      .catch(done);
  });

  afterEach('stop server', done => {
    if (!server) return done();
    server.close().then(done).catch(error => {
      console.log(error);
      done();
    });
  });

  context('connecting', () => {

    it('resolves promise on connect', done => {

      VertexSocket.connect()

        .then(_clientSocket => {
          clientSocket = _clientSocket;
          expect(clientSocket.address().address).to.equal('127.0.0.1');
          expect(clientSocket.remoteAddress().address).to.equal('127.0.0.1');
          expect(clientSocket.remoteAddress().port).to.equal(65535);
          done();
        })

        .catch(done);

    });

    it('reject promise on socket error', done => {

      VertexSocket.connect({port: 1})

        .catch(error => {
          expect(error.code).to.equal('ECONNREFUSED');
          done();
        })

        .catch(done);

    });

    it('disconnects on connectIdleTimeout', done => {

      server._config.connectIdleTimeout = 1;

      let hadError = false;

      server.once('connection', socket => {

        socket.on('error', error => {
          expect(error.name).to.equal('VertexSocketIdleError');
          expect(error.message).to.equal('Inactivity on connect');
          hadError = true;
        });

      });

      VertexSocket.connect()

        .then(socket => {
          socket.on('close', () => {
            expect(hadError).to.equal(true);
            done();
          });
        })

        .catch(done);

    });

  });

  context('disconnecting', () => {

    it('emits close event', done => {

      VertexSocket.connect()

        .then(clientSocket => {
          clientSocket.on('close', () => done());
          clientSocket.close(null, 'message');
        })

        .catch(done);

    });

    it('emits error on terminate', done => {

      let error;

      VertexSocket.connect()

        .then(clientSocket => {
          clientSocket.on('error', _error => error = _error);

          clientSocket.on('close', () => {
            expect(error.message).to.equal('bad thing');
            done();
          });
          clientSocket.terminate(new Error('bad thing'));
        })

        .catch(done);

    });

  });

  context('using', () => {

    let serverSocket, clientSocket;

    beforeEach('connect socket pair', done => {
      server.once('connection', socket => serverSocket = socket);

      VertexSocket.connect()
        .then(socket => {
          clientSocket = socket;
          done();
        })
        .catch(done);
    });

    context('sending data', () => {

      it('disconnects the socket on differing protocol version (major)', done => {

        let serverError;
        serverSocket.on('error', error => serverError = error);

        let clientError;
        clientSocket.on('error', error => clientError = error);

        clientSocket.on('close', (code, message) => {
          expect(code).to.equal(1003);
          expect(message).to.equal('Error: Protocol mismatch');
          expect(clientError.name).to.equal('VertexSocketDataError');
          expect(serverError.from.address).to.equal('127.0.0.1');
          delete serverError.from;
          delete clientError.from;
          expect(serverError).to.eql(clientError);
          done();
        });

        clientSocket._socket.send('2.0[]');

      });

      it('allows differing protocol version (minor)', done => {

        let serverError;
        serverSocket.on('error', error => serverError = error);

        let clientError;
        clientSocket.on('error', error => clientError = error);

        clientSocket._waiting[9999] = {
          resolve: result => {
            expect(typeof clientError == 'undefined').to.equal(true);
            expect(typeof serverError == 'undefined').to.equal(true);
            done();
          }
        };

        clientSocket._socket.send('1.9999[{"seq": 9999, "ts": 1477296513795}]');

      });

      it('disconnects the socket on bad payload', done => {

        let serverError;
        serverSocket.on('error', error => serverError = error);

        let clientError;
        clientSocket.on('error', error => clientError = error);

        clientSocket.on('close', (code, message) => {
          expect(code).to.equal(1003);
          expect(message).to.equal('SyntaxError: Unexpected end of JSON input');
          expect(clientError.name).to.equal('VertexSocketDataError');
          expect(serverError.from.address).to.equal('127.0.0.1');
          delete serverError.from;
          delete clientError.from;
          expect(serverError).to.eql(clientError);
          done();
        });

        clientSocket._socket.send('1.0[');

      });

      it('disconnects the socket on missing meta', done => {

        let serverError;
        serverSocket.on('error', error => serverError = error);

        let clientError;
        clientSocket.on('error', error => clientError = error);

        clientSocket.on('close', (code, message) => {
          expect(code).to.equal(1003);
          expect(message).to.equal('Missing meta');
          expect(clientError.name).to.equal('VertexSocketDataError');

          delete serverError.from;
          delete clientError.from;

          expect(serverError).to.eql(clientError);
          done();
        });

        clientSocket._socket.send('1.0[]');

      });


      it('returns a promise', done => {

        clientSocket.send()

          .then(() => done())

          .catch(done);

      });

      it('resolves with meta (after ack)', done => {

        clientSocket.send()

          .then(result => {
            expect(typeof result.meta).to.equal('object');
            expect(typeof result.meta.seq).to.equal('number');
            expect(typeof result.meta.ts).to.equal('number');
            expect(result.meta.len).to.equal(53);
            done();
          })

          .catch(done);

      });

      it('can send an "object" as json', done => {

        let data;
        serverSocket.on('data', _data => data = _data);

        clientSocket.send({a: 'b'})

          .then(() => {
            expect(data).to.eql({a: 'b'});
            done();
          })

          .catch(done);

      });


      it('can send a nothing', done => {

        clientSocket.send()

          .then(() => done())

          .catch(done);
      });

      it('can send a string', done => {

        let data;
        serverSocket.on('data', _data => data = _data);

        clientSocket.send('how long is a piece of')

          .then(() => {
            expect(data).to.equal('how long is a piece of');
            done();
          })

          .catch(done);

      });

      it('can send an int', done => {

        let data;
        serverSocket.on('data', _data => data = _data);

        clientSocket.send(919)

          .then(() => {
            expect(data).to.equal(919);
            done();
          })

          .catch(done);

      });

      it('can send a float', done => {

        let data;
        serverSocket.on('data', _data => data = _data);

        clientSocket.send(Math.PI)

          .then(() => {
            expect(data).to.equal(Math.PI);
            done();
          })

          .catch(done);

      });

      it('can send a buffer', done => {

        let data, meta;
        serverSocket.on('data', (_data, _meta) => {
          data = _data;
          meta = _meta;
        });

        clientSocket.send(Buffer.alloc(10))

          .then(() => {
            expect(data).to.eql(Buffer.alloc(10));
            expect(meta.buffer).to.equal(true);
            done();
          })

          .catch(done);

      });

      it('rejects on failure to encode', done => {

        const circular = {};
        circular.circular = circular;

        clientSocket.send(circular)

          .catch(error => {
            expect(error.name).to.equal('TypeError');
            done();
          })

          .catch(done);

      });

      it('rejects on specified timeout and receives late response data', done => {

        let rejected = false;

        // server delays ack
        let _sendAck = serverSocket._sendAck;
        serverSocket._sendAck = function () {
          setTimeout(() => {
            _sendAck.apply(serverSocket, arguments);
          }, 100);
        };

        serverSocket.on('data', (data, meta, reply) => {
          reply('A', 1);
          reply('B', 2);
          reply('C', 3);
        });

        clientSocket.on('error', error => {
          try {
            expect(rejected).to.equal(true);
            expect(error.name).to.equal('VertexSocketReplyError');
            expect(error.message).to.equal('Stray ack or nak');
            expect(typeof error.meta.seq).to.equal('number');
            expect(typeof error.meta.ts).to.equal('number');
            expect(error.meta.ack).to.equal(true);
            expect(error.data).to.eql({
              A: 1,
              B: 2,
              C: 3
            });
            done();
          } catch (e) {
            done(e);
          }
        });

        const TIMEOUT = 1;

        clientSocket.send({}, TIMEOUT)

          .catch(error => {
            expect(error.name).to.equal('VertexSocketTimeoutError');
            expect(error.message).to.equal('Ack timeout');
            expect(typeof error.meta.seq).to.equal('number');
            expect(typeof error.meta.ts).to.equal('number');
            rejected = true;
          })

          .catch(done);

      });


      it('rejects on specified timeout and receives late response error', done => {

        let rejected = false;

        // server delays ack
        let _sendAck = serverSocket._sendAck;
        serverSocket._sendAck = function () {
          setTimeout(() => {
            _sendAck.apply(serverSocket, arguments);
          }, 100);
        };

        serverSocket.on('data', (data, meta, reply) => {
          let circular = {};
          circular.circular = circular;
          reply('data', circular);
        });

        clientSocket.on('error', error => {
          try {
            expect(rejected).to.equal(true);
            expect(error.name).to.equal('VertexSocketReplyError');
            expect(error.message).to.equal('Stray ack or nak');
            expect(typeof error.meta.seq).to.equal('number');
            expect(typeof error.meta.ts).to.equal('number');
            expect(error.meta.nak).to.equal(true);
            expect(typeof error.data).to.equal('object');
            done();
          } catch (e) {
            done(e);
          }
        });

        const TIMEOUT = 1;

        clientSocket.send({}, TIMEOUT)

          .catch(error => {
            expect(error.name).to.equal('VertexSocketTimeoutError');
            expect(error.message).to.equal('Ack timeout');
            expect(typeof error.meta.seq).to.equal('number');
            expect(typeof error.meta.ts).to.equal('number');
            rejected = true;
          })

          .catch(done);

      });


      it('rejects for all pending acks on socket close', done => {

        serverSocket._sendAck = () => {
        };

        var rejections = [];
        clientSocket.send(1).catch(rejections.push.bind(rejections));
        clientSocket.send(2).catch(rejections.push.bind(rejections));
        clientSocket.send(3).catch(rejections.push.bind(rejections));

        setTimeout(() => {
          serverSocket.close();
        }, 100);

        clientSocket.on('close', () => {
          setTimeout(() => {
            expect(rejections.length).to.equal(3);
            expect(rejections[0].name).to.equal('VertexSocketClosedError');
            expect(rejections[0].message).to.equal('Closed while awaiting ack');
            expect(typeof rejections[0].meta.ts).to.equal('number');
            expect(typeof rejections[0].meta.seq).to.equal('number');
            done();
          }, 10);
        });

      });

      it('rejects on writing into closed socket', done => {

        clientSocket.close();

        clientSocket.send()

          .catch(error => {
            expect(error.name).to.equal('VertexSocketClosedError');
            expect(error.message).to.equal('Cannot write');
            done();
          })

          .catch(done);

      });

    });

    context('receiving data', () => {

      it('emits data and meta', done => {

        let receivedMeta;

        serverSocket.on('data', (data, meta) => {
          expect(data).to.eql({x: 1});
          receivedMeta = meta;
        });

        clientSocket.send({x: 1})

          .then(result => {
            delete result.meta.len;
            expect(receivedMeta.len).to.equal(41);
            delete receivedMeta.len;
            expect(result.meta).to.eql(receivedMeta);
            done();
          })

          .catch(done);

      });

    });

    context('allows for reply promise into ack payload', () => {

      it('resolves with single tagged result', done => {

        let serverMeta;

        serverSocket.on('data', (data, meta, reply) => {

          serverMeta = meta;

          reply('tag', new Promise(resolve => resolve('XYZ')));

        });

        clientSocket.send()

          .then(({tag, meta}) => {
            expect(tag).to.equal('XYZ');
            delete meta.len;
            delete serverMeta.len;
            expect(meta).to.eql(serverMeta);
            done();
          })

          .catch(done);

      });

      it('resolves with multiple tagged results', done => {

        serverSocket.on('data', (data, meta, reply) => {
          reply(new Promise((resolve, reject) => {
            resolve('DATA0');
          }));
          reply(new Promise((resolve, reject) => {
            let e = new Error('some problem');
            e.code = 0;
            reject(e);
          }));
          reply(new Promise((resolve, reject) => {
            resolve('DATA2');
          }));
          reply('data1', 'abc');
          reply('data2', 123);
        });

        clientSocket.send()
          .then(result => {
            expect(result[0]).to.equal('DATA0');
            expect(result[1] instanceof Error).to.equal(true);
            expect(result[1]._error).to.equal(true);
            expect(result[2]).to.equal('DATA2');
            expect(result.data1).to.equal('abc');
            expect(result.data2).to.equal(123);
            done();
          })

          .catch(done);

      });

      it('naks with remote encode error', done => {

        let circular = {};
        circular.circular = circular;

        serverSocket.on('data', (data, meta, reply) => reply(circular));

        clientSocket.send()

          .catch(error => {
            expect(error.name).to.equal('VertexSocketRemoteEncodeError');
            expect(error.message).to.equal('TypeError: Converting circular structure to JSON');
            expect(typeof error.meta).to.equal('object');
            done();
          })

          .catch(done);

      });

      it('cannot send buffer in reply (as promise)', done => {

        serverSocket.on('data', (data, meta, reply) => {
          reply(new Promise(resolve => {
            resolve(Buffer.alloc(8));
          }));
        });

        clientSocket.send()

          .catch(error => {
            expect(error.name).to.equal('VertexSocketRemoteEncodeError');
            expect(error.message).to.equal('Cannot send buffer in reply');
            expect(typeof error.meta).to.equal('object');
            done();
          })

          .catch(done);

      });


      it('cannot send buffer in reply', done => {

        serverSocket.on('data', (data, meta, reply) => reply(Buffer.alloc(8)));

        clientSocket.send()

          .catch(error => {
            expect(error.name).to.equal('VertexSocketRemoteEncodeError');
            expect(error.message).to.equal('Cannot send buffer in reply');
            expect(typeof error.meta).to.equal('object');
            done();
          })

          .catch(done);

      });


      it('allows sending reply as nak without specific error', done => {

        serverSocket.on('data', (data, meta, reply) => {
          reply('nak', true);
        });

        clientSocket.send()

          .catch(error => {
            expect(error.name).to.equal('Error');
            expect(error.message).to.equal('Nak');
            expect(typeof error.meta).to.equal('object');
            done();
          })

          .catch(done);

      });

      it('allows sending reply as nak with specific error', done => {

        serverSocket.on('data', (data, meta, reply) => {
          let e = new Error('Cannot do thing x');
          e.name = 'MyCustomError';
          e.why = 'reason text';
          reply('nak', e);
        });

        clientSocket.send()

          .catch(error => {
            expect(error.name).to.equal('MyCustomError');
            expect(error.message).to.equal('Cannot do thing x');
            expect(error.why).to.equal('reason text');
            expect(typeof error.meta).to.equal('object');
            done();
          })

          .catch(done);

      });

    });

    context('ping and pong', () => {

      it('can send ping from client to server', done => {

        let gotPing = false;
        serverSocket.on('ping', data => {
          expect(data.toString()).to.equal('A');
          gotPing = true
        });

        clientSocket.on('pong', data => {
          expect(data.toString()).to.equal('A');
          expect(gotPing).to.equal(true);
          done();
        });

        clientSocket.ping('A');

      });

      it('can send ping from server', done => {

        let gotPing = false;
        clientSocket.on('ping', data => {
          expect(data.toString()).to.equal('A');
          gotPing = true
        });

        serverSocket.on('pong', data => {
          expect(data.toString()).to.equal('A');
          expect(gotPing).to.equal(true);
          done();
        });

        serverSocket.ping('A');

      });

    });

    context('pause and resume', () => {

      it('can pause and resume stream', done => {

        let results;

        clientSocket.pause();

        setTimeout(() => {
          expect(typeof results).to.equal('undefined');
        }, 100);

        setTimeout(() => {
          clientSocket.resume();
        }, 200);

        setTimeout(() => {
          expect(results.length).to.equal(3);
          done();
        }, 300);

        Promise.all([
          clientSocket.send(1),
          clientSocket.send(2),
          clientSocket.send(3)
        ])

          .then(_results => {
            results = _results;
          })

          .catch(done);

      });

    });

  });

  return;

  xcontext('optional wait for ack', () => {

    it('does not send the next frame until ack of previous');

  });

  xcontext('stats', () => {

    it('provides access to ack waiting list');

  });

  xcontext('logs', () => {

    it('where appropriate 1');

    it('where appropriate 2');

    it('where appropriate 3');

  });

});
