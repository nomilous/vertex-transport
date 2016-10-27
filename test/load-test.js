const {basename} = require('path');
const filename = basename(__filename);
const WebSocket = require('ws');
const WebSocketServer = require('ws').Server;

const {VertexServer, VertexSocket} = require('../');

let requestCount = 10000;

describe(filename, function () {

  let server, wsServer;

  before('start server', done => {
    VertexServer.listen()
      .then(_server => {
        server = _server;
        done();
      })
      .catch(done);
  });

  after('stop server', done => {
    if (server) {
      server.close().then(done).catch(done);
      return;
    }
    done();
  });

  before('start ws server', done => {
    wsServer = new WebSocketServer({ port: 8080 });
    wsServer.once('listening', done);
  });

  after('stop ws server', done => {
    wsServer.close(done);
  });

  it('sends ' + requestCount + ' vertex messages', function (done) {

    this.timeout(10000);

    server.on('connection', socket => {
      socket.on('data', (data, meta, reply) => {
        reply('data', data);
      });
    });

    VertexSocket.connect()

      .then(socket => {
        let requests = [];
        while (requests.length < requestCount) {
          requests.push(socket.send({some: 'data'}));
        }
        return Promise.all(requests);
      })

      .then(replies => {

        // console.log('\n%d requests in %dms\n', replies.length, Date.now() - startAt);

      })

      .then(done).catch(done);

  });

  it('sends ' + requestCount + ' straight ws messages', function (done) {

    this.timeout(10000);

    wsServer.on('connection', socket => {
      socket.on('message', data => {
        socket.send(data);
      });
    });

    let requests = requestCount;
    let data = JSON.stringify({some: 'data'});
    let client = new WebSocket('ws://localhost:8080');

    client.on('open', () => {
      client.on('message', data => {
        if (requests-- > 0) return client.send(data);
        done();
      });
      client.send(data);
    });

  });

});
