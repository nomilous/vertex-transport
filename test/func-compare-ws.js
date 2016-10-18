const {basename} = require('path');
const filename = basename(__filename);

const WebSocket = require('ws');
const {VertexServer, VertexSocket} = require('../');

describe(filename, () => {

  let wsServer, vServer;

  let wsServerSocket, wsSocket, vServerSocket, vSocket;

  before('start websocket server', done => {
    wsServer = new WebSocket.Server({ port: 8080 });
    wsServer.on('listening', done);
  });

  after('stop clients', () => {
    if (wsSocket) wsSocket.close();
    if (vSocket) vSocket.destroy();
  });

  after('stop websocket server', done => {
    wsServer.close(done);
  });

  before('start vertex server', done => {
    VertexServer.listen()
      .then(server => {
        vServer = server;
        done();
      })
      .catch(done);
  });

  after('stop vertex server', done => {
    if (!vServer) return done();
    vServer.close();
    done();
  });

  before('connect websocket client', done => {

    wsServer.on('connection', socket => {
      wsServerSocket = socket;
      done();
    });

    wsSocket = new WebSocket('ws://localhost:8080');

  });

  before('connect vertex client', done => {

    vServer.on('connection', socket => {
      vServerSocket = socket;
      // done();
    });

    VertexSocket.connect()
      .then(client => {
        vSocket = client;
        done();
      })
      .catch(done);

  });


  context('small frames', function () {


    // 10000 small frames - websocket:     3094ms
    // 10000 small frames - vertex socket: 1373ms


    this.timeout(10000);

    it('compare websocket', done => {

      let messages = [];
      let count = 10000;
      let startAt = Date.now();

      wsServerSocket.on('message', message => {
        JSON.stringify(JSON.parse(message)); // same load as vertex
        Date.now();
        wsServerSocket.send(message);
      });

      wsSocket.on('message', message => {
        JSON.parse(message);
        Date.now();
        messages.push(message);
        if (messages.length >= count) {

          console.log('%d small frames - websocket: %dms', count, Date.now() - startAt);

          return done();
        }
        wsSocket.send(message);
      });

      wsSocket.send(JSON.stringify({small: 'payload'}));

    });

    it('compare vertex socket', done => {

      let messages = [];
      let count = 10000;
      let startAt = Date.now();

      vServerSocket.on('data', data => {
        vServerSocket.write(data);
      })

      vSocket.on('data', data => {
        messages.push(data);
        if (messages.length >= count) {

          console.log('%d small frames - vertex socket: %dms', count, Date.now() - startAt);

          return done();
        }
        vSocket.write(data);
      })

      vSocket.write({small: 'payload'});

    });

  });

});
