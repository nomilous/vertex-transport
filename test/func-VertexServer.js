const {basename} = require('path');
const filename = basename(__filename);
const expect = require('expect.js');

const {VertexServer, VertexSocket} = require('../');

describe(filename, () => {

  let server, client;

  beforeEach('clear server', () => {
    server = undefined;
  });

  afterEach('close server', (done) => {
    if (server) {
      server.close().then(done).catch(done);
      return;
    }
    done();
  });

  context('listen', () => {

    it('listens with defaults', done => {

      VertexServer.listen()

        .then(_server => {
          server = _server;
          expect(server.address().address).to.equal('127.0.0.1');
        })

        .then(done).catch(done);

    });

    it('listens with specified', done => {

      VertexServer.listen({
        host: '0.0.0.0',
        port: 9999
      })

        .then(_server => {
          server = _server;
          expect(server.address().address).to.equal('0.0.0.0');
          expect(server.address().port).to.equal(9999);
        })

        .then(done).catch(done);

    });

    it('rejects on error', done => {

      VertexServer.listen({
        host: '123.123.123.123',
        port: 9999
      })

        .catch(error => {
          expect(error.code).to.equal('EADDRNOTAVAIL');
          done();
        })

        .catch(done);

    });

    it('close returns promise', done => {

      VertexServer.listen()

        .then(server => server.close().then(done).catch(done))

        .catch(done);

    });

    it('emits connection on connection', done => {

      VertexServer.listen()

        .then(_server => {

          server = _server;
          server.on('connection', socket => {
            client = socket;
            expect(socket instanceof VertexSocket).to.equal(true);
            done();
          })

        })

        .then(() => {
          return VertexSocket.connect()
        })

        .catch(done);

    });

  });

  return;

  context('tls', function () {

    it('listens with defaults');

  });

});
