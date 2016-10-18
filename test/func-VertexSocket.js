const {basename} = require('path');
const filename = basename(__filename);
const expect = require('expect.js');

const {VertexServer, VertexSocket, errors} = require('../');

describe(filename, () => {

  let server, clientSocket, serverSocket, received;

  beforeEach('start server', done => {
    VertexServer.listen({
      socket: {
        // maxFrameSize: 1
      }
    })
      .then(_server => {
        server = _server;

        server.on('connection', socket => {
          serverSocket = socket;

          socket.on('data', data => {
            received = data;
          })
        });

        done();
      })
      .catch(done);
  });

  afterEach('stop clients', () => {
    if (clientSocket) clientSocket.destroy();
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

      server.config.connectIdleTimeout = 1;

      server.once('connection', socket => {

        socket.on('error', error => {
          expect(error.name).to.equal('VertexSocketIdleError');
          expect(error.message).to.equal('Inactivity on connect');
        });

      });

      VertexSocket.connect()

        .then(socket => {
          socket.on('close', done);
        })

        .catch(done);

    });

  });

  context('disconnecting', () => {

    it('emits close event', done => {

      VertexSocket.connect()

        .then(_clientSocket => {
          _clientSocket.on('close', done);
          _clientSocket.destroy();
        })

        .catch(done);

    });

    it('emits close event with error flag', done => {

      VertexSocket.connect()

        .then(_clientSocket => {
          _clientSocket.on('error', function () {
          });
          _clientSocket.on('close', function (hadError) {
            expect(hadError).to.equal(true);
            done();
          });
          _clientSocket.destroy(new Error('bad thing'));
        })

        .catch(done);

    });

  });

  context('sending data', () => {

    beforeEach(function (done) {
      VertexSocket.connect()
        .then(_clientSocket => {
          clientSocket = _clientSocket;
          done();
        })
        .catch(done);
    });


    it('disconnects the socket on bad header', done => {

      setTimeout(() => {

        let error;
        serverSocket.on('error', _error => {
          error = _error;
        });

        clientSocket.on('close', () => {
          expect(error.name).to.equal('VertexSocketHeaderError');
          expect(error.code).to.equal('EBADHEADER');
          done();
        });

        clientSocket.socket.write(Buffer.alloc(VertexSocket.HEADER_LENGTH));

      }, 100);

    });


    it('returns a promise', done => {

      var promise = clientSocket.write();
      expect(promise instanceof Promise).to.equal(true);
      done();

    });

    xit('resolves with meta (after ack)', done => {

      clientSocket.write()

        .then(result => {
          expect(typeof result.meta).to.equal('object');
          expect(typeof result.meta.seq).to.equal('number');
          expect(typeof result.meta.ts).to.equal('number');
          done();
        })

        .catch(done);

    });

    it('can send an "object" as json', done => {

      clientSocket.write({a: 'b'})

        .then(() => {
          expect(received).to.eql({a: 'b'});
          done();
        })

        .catch(done);

    });


    it('can send a nothing', function (done) {

      clientSocket.write()

        .then(function () {
          done();
        })

        .catch(done);
    });

    it('can send a string', done => {

      clientSocket.write('how long is a piece of')

        .then(() => {
          expect(received).to.equal('how long is a piece of');
          done();
        })

        .catch(done);

    });

    it('can send an int', done => {

      clientSocket.write(919)

        .then(() => {
          expect(received).to.equal(919);
          done();
        })

        .catch(done);

    });

    it('can send a float', done => {

      clientSocket.write(Math.PI)

        .then(() => {
          expect(received).to.equal(Math.PI);
          done();
        })

        .catch(done);

    });

    it('can send a buffer', done => {

      clientSocket.write(Buffer.alloc(10))

        .then(() => {
          expect(received).to.eql(Buffer.alloc(10));
          done();
        })

        .catch(done);

    });

    it('rejects on failure to encode', done => {

      const circular = {};
      circular.circular = circular;

      clientSocket.write(circular)

        .catch(error => {
          expect(error.name).to.equal('TypeError');
          done();
        })

        .catch(done);

    });

    it('rejects on remote frameSize exceeded and socket is closed', done => {

      let serverError, clientError;

      setTimeout(() => {

        clientSocket.on('close', () => {
          expect(serverError.name).to.equal('VertexSocketHeaderError');
          expect(serverError).to.eql(clientError);
          done();
        });

        serverSocket.on('error', error => {
          serverError = error;
        });

        serverSocket.config.maxFrameSize = 0;

        clientSocket.write()

          .catch(error => {
            clientError = error;
          });

      }, 100);

    });

    it('rejects on remote failure to recognise type', done => {

      clientSocket._encode = () => {
        return {
          type: 0xFF,
          payload: new Buffer('x')
        }
      };

      clientSocket.write()

        .catch(error => {
          try {
            JSON.parse('{"badJSON";');
          } catch (e) {
            expect(error.name).to.equal('VertexSocketRemoteDecodeError');
            expect(error.message).to.equal('Unrecognised type');
            done();
          }
        })

        .catch(done);

    });

    it('rejects on remote decode error', done => {

      clientSocket._encode = () => {
        return {
          type: VertexSocket.TYPE_OBJECT,
          payload: new Buffer('{"badJSON";')
        }
      };

      clientSocket.write()

        .catch(error => {
          try {
            JSON.parse('{"badJSON";');
          } catch (e) {
            expect(error.name).to.equal('VertexSocketRemoteDecodeError');
            expect(error.message).to.equal(e.toString());
            done();
          }
        })

        .catch(done);

    });

    it('rejects on remote runtime error', done => {

      // wait for serverSocket
      // (to be sure we don't have one from previous test)
      setTimeout(() => {

        serverSocket.on('data', (data)=> {
          throw new Error(data.message);
        });

        clientSocket.write({message: 'Throw this'})

          .catch(error => {
            expect(error.name).to.equal('VertexSocketRemoteRuntimeError');
            expect(error.message).to.equal('Error: Throw this');
            done();
          })

          .catch(done);

      }, 100);

    });

    it('rejects on specified timeout and receives late response error', function (done) {

      setTimeout(() => {

        let rejected = false;

        // server delays ack
        let _sendAck = serverSocket._sendAck;
        serverSocket._sendAck = function () {
          setTimeout(() => {
            _sendAck.apply(serverSocket, arguments);
          }, 100);
        };

        clientSocket.on('error', error => {
          try {
            expect(rejected).to.equal(true);
            expect(error.name).to.equal('VertexSocketLagError');
            expect(error.message).to.equal('Response after timeout');
            expect(error.type).to.equal('ACK');
            expect(typeof error.meta.seq).to.equal('number');
            expect(typeof error.meta.ts).to.equal('number');
            done();
          } catch (e) {
            done(e);
          }
        });

        const TIMEOUT = 0;

        clientSocket.write({}, TIMEOUT)

          .catch(error => {
            expect(error.name).to.equal('VertexSocketTimeoutError');
            expect(error.message).to.equal('Ack timeout');
            expect(typeof error.meta.seq).to.equal('number');
            expect(typeof error.meta.ts).to.equal('number');
            rejected = true;
          })

          .catch(done);

      });

    });

    it('rejects for all pending acks on socket close', done => {

      setTimeout(() => {

        serverSocket._sendAck = () => {
        };

        var rejections = [];
        clientSocket.write(1).catch(rejections.push.bind(rejections));
        clientSocket.write(2).catch(rejections.push.bind(rejections));
        clientSocket.write(3).catch(rejections.push.bind(rejections));

        setTimeout(() => {
          serverSocket.destroy();
        }, 100);

        clientSocket.on('close', () => {
          setTimeout(() => {
            expect(rejections.length).to.equal(3);
            expect(rejections[0].name).to.equal('VertexSocketClosedError');
            expect(rejections[0].message).to.equal('Closed while awaiting ack');
            expect(typeof rejections[0].meta.ts).to.equal('number');
            expect(typeof rejections[0].meta.seq).to.equal('number');
            expect(rejections[0].hadError).to.equal(false);
            done();
          }, 10);
        });

      }, 200);

    });

    it('rejects on writing into closed socket', done => {

      clientSocket.destroy();

      clientSocket.write()

        .catch(error => {
          expect(error.message).to.equal('This socket is closed');
          done();
        })

        .catch(done);

    });

  });


  context('receiving data', () => {

    beforeEach(function (done) {
      VertexSocket.connect()
        .then(_clientSocket => {
          clientSocket = _clientSocket;
          done();
        })
        .catch(done);
    });

    it('emits data and meta', done => {

      let receivedMeta;

      setTimeout(() => {

        serverSocket.on('data', (data, meta) => {
          expect(data).to.eql({x: 1});
          receivedMeta = meta;
        });

        clientSocket.write({x: 1})

          .then(result => {
            expect(result.meta).to.eql(receivedMeta);
            done();
          })

          .catch(done);

      }, 200);

    });

  });

  context('allows for reply promise into ack payload', () => {

    beforeEach(function (done) {
      VertexSocket.connect()
        .then(_clientSocket => {
          clientSocket = _clientSocket;
          done();
        })
        .catch(done);
    });

    it('resolves with single tagged result', done => {

      setTimeout(() => {

        let serverMeta;

        serverSocket.on('data', (data, meta, reply) => {

          serverMeta = meta;

          reply('data', new Promise((resolve, reject) => {
            resolve('XYZ');
          }));

        });

        clientSocket.write()

          .then(({data, meta}) => {
            expect(data).to.equal('XYZ');
            expect(meta).to.eql(serverMeta);
            done();
          })

          .catch(done);

      }, 200);

    });

    it('resolves with multiple tagged results', done => {

      setTimeout(() => {

        serverSocket.on('data', (data, meta, reply) => {
          reply(new Promise((resolve, reject) => {
            resolve('DATA0');
          }));
          reply(new Promise((resolve, reject) => {
            reject(new Error('some problem')); // true
          }));
          reply(new Promise((resolve, reject) => {
            resolve('DATA2');
          }));
          reply('data1', 'abc');
          reply('data2', 123);
        });

        clientSocket.write()

          .then(result => {
            expect(result[0]).to.equal('DATA0');
            expect(result[1] instanceof Error).to.equal(true);
            expect(result[2]).to.equal('DATA2');
            expect(result.data1).to.equal('abc');
            expect(result.data2).to.equal(123);
            done();
          })

          .catch(done);

      }, 200);

    });

    it('naks with remote encode error', done => {

      setTimeout(() => {

        serverSocket.on('data', (data, meta, reply) => reply(1));

        // faulty encode on server
        let originalEncode = serverSocket._encode;
        serverSocket._encode = () => {
          serverSocket._encode = originalEncode;
          throw new Error('could not encode');
        };

        clientSocket.write()

          .catch(error => {
            expect(error.name).to.equal('VertexSocketRemoteEncodeError');
            expect(error.message).to.equal('Error: could not encode');
            done();
          })

          .catch(done);

      }, 200);

    });

    it('naks with local decode error', done => {

      setTimeout(() => {

        serverSocket.on('data', (data, meta, reply) => reply(1));

        // faulty encode on server
        let originalEncode = serverSocket._encode;
        serverSocket._encode = () => {
          serverSocket._encode = originalEncode;
          return {
            type: VertexSocket.TYPE_OBJECT,
            payload: new Buffer('{"badJSON";')
          }
        };

        clientSocket.write()

          .catch(error => {
            expect(error.name).to.equal('VertexSocketDecodeError');
            expect(error.message).to.match(/^SyntaxError/);
            done();
          })

          .catch(done);

      }, 200);

    });

  });

  context('pause and resume', () => {

    beforeEach(function (done) {
      VertexSocket.connect()
        .then(_clientSocket => {
          clientSocket = _clientSocket;
          done();
        })
        .catch(done);
    });

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
        clientSocket.write(1),
        clientSocket.write(2),
        clientSocket.write(3)
      ])

        .then(_results => {
          results = _results;
        })

        .catch(done);

    });

  });

  return;

  xcontext('wait for ack', () => {

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

  xcontext('frame size', () => {

    xit('negotiates max frame size');

  });

  xcontext('large frames', () => {

    it('breaks large payloads into maxFrameSize');

  });

});
