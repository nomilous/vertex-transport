const {basename} = require('path');
const filename = basename(__filename);
const expect = require('expect.js');

const {VertexSocket} = require('../');
const package = require('../package.json');

describe(filename, () => {

  let frame, payload;

  before(() => {

    payload = {
      1: package,
      2: package,
      3: package,
      4: package
    };

    const data = new Buffer(JSON.stringify(payload));
    const header = Buffer.alloc(VertexSocket.HEADER_LENGTH);

    header[0] = VertexSocket.HEADER_1;
    header[1] = VertexSocket.HEADER_2;
    header.writeUInt32BE(header.length + data.length, VertexSocket.OFFSET_LENGTH);
    header[VertexSocket.OFFSET_TYPE] = VertexSocket.TYPE_OBJECT;

    frame = Buffer.concat([header, data]);
  });

  it('handles frame fragmentation by transmission', done => {

    const socket = new VertexSocket({
      on: () => {},
      write: () => {}
    });

    socket.on('data', data => {
      expect(data).to.eql(payload);
      done();
    });

    const fragmentSize = 10;

    for (var i = 0; i < frame.length; i += fragmentSize) {
      socket._onData(frame.slice(i, i + fragmentSize));
    }

  });

  it('handles frame concatenation by transmission', done => {

    const received = [];
    const socket = new VertexSocket({
      on: () => {},
      write: () => {}
    });

    socket.on('data', data => {
      received.push(data);
      if (received.length < 3) return;
      expect(received).to.eql([payload, payload, payload]);
      done();
    });

    socket._onData(Buffer.concat([frame, frame, frame]));


  });

});
