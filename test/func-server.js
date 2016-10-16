const {basename} = require('path');
const filename = basename(__filename);
const expect = require('expect.js');

const {Server, Socket} = require('../');

describe(filename, function () {

  let server;

  beforeEach('clear server', () => {
    server = undefined;
  });

  afterEach('close server', () => {
    if (server) server.close();
  });

  context('net', () => {

    it('listens with defaults', done => {

      Server.listen()

        .then(_server => {
          server = _server;
          expect(server.address().address).to.equal('127.0.0.1');
        })

        .then(done).catch(done);

    });

    it('listens with specified', function (done) {

      Server.listen({
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

    it('rejects on error', function (done) {

      Server.listen({
        host: '123.123.123.123',
        port: 9999
      })

        .catch(error => {
          expect(error.code).to.equal('EADDRNOTAVAIL');
          done();
        })

        .catch(done);

    });

    it('emits close on close', function (done) {

      Server.listen()

        .then(_server => {
          _server.on('close', function() {
            done();
          });
          _server.close();
        })

        .catch(done);

    });

    it('close returns promise', function (done) {

      Server.listen()

        .then(_server => {
          _server.close()
            .then(function () {
              done();
            })
        })

        .catch(done);

    });

    it('emits connection on connection');

  });

  context('tls', function () {

    it('listens with defaults');

  });

});
