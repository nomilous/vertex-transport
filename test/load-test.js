const {basename} = require('path');
const filename = basename(__filename);

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
    if (server) {
      server.close().then(done).catch(done);
      return;
    }
    done();
  });

  it('sends 10000 messages', done => {

    server.on('connection', socket => {
      socket.on('data', (data, meta, reply) => {
        reply('data', data);
      });
    });

    let requestCount = 1000;
    let startAt = Date.now();

    VertexSocket.connect()

      .then(socket => {
        let requests = [];
        while (requests.length < requestCount) {
          requests.push(socket.send({some: 'data'}));
        }
        return Promise.all(requests);
      })

      .then(replies => {

        console.log('\n%d requests in %dms\n', replies.length, Date.now() - startAt);

      })

      .then(done).catch(done);

  });

});
