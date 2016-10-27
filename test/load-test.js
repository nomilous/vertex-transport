const {basename} = require('path');
const filename = basename(__filename);

const {VertexServer, VertexSocket} = require('../');

describe(filename, function () {

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

  let requestCount = 10000;
  it('sends ' + requestCount + ' messages', function (done) {

    this.timeout(10000);

    server.on('connection', socket => {
      socket.on('data', (data, meta, reply) => {
        reply('data', data);
      });
    });


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

        // console.log('\n%d requests in %dms\n', replies.length, Date.now() - startAt);

      })

      .then(done).catch(done);

  });

});
